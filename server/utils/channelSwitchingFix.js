/**
 * Channel Switching Fix for Android TV
 * Addresses metadata lookup failures during fast channel changes
 */

const logger = require('./logger');
const cacheService = require('../services/cacheService');

/**
 * Pre-cache metadata for all channels to prevent switching delays
 */
class ChannelMetadataCache {
  constructor() {
    this.channelCache = new Map();
    this.lastUpdate = null;
    this.updateInterval = 60000; // Update every minute
    this.initializeCache();
  }

  async initializeCache() {
    try {
      // Start periodic cache refresh
      setInterval(async () => {
        await this.refreshAllChannelMetadata();
      }, this.updateInterval);

      // Initial load
      await this.refreshAllChannelMetadata();
      logger.info('Channel metadata cache initialized for fast switching');
    } catch (error) {
      logger.error('Failed to initialize channel metadata cache:', error);
    }
  }

  async refreshAllChannelMetadata() {
    try {
      const database = require('../services/database');
      const now = new Date().toISOString();
      
      // Get all channels with their current programs
      const channelsWithPrograms = await database.all(`
        SELECT 
          c.id, c.name, c.number, c.epg_id, c.logo,
          p.title as current_title,
          p.description as current_description,
          p.start_time as current_start,
          p.end_time as current_end,
          p.category as current_category
        FROM channels c
        LEFT JOIN epg_programs p ON c.epg_id = p.channel_id 
          AND p.start_time <= ? AND p.end_time > ?
        WHERE c.enabled = 1
        ORDER BY c.number
      `, [now, now]);

      // Cache metadata for each channel
      for (const channel of channelsWithPrograms) {
        const metadata = this.createChannelMetadata(channel);
        this.channelCache.set(channel.epg_id || channel.id, metadata);
        this.channelCache.set(channel.id, metadata); // Also cache by internal ID
      }

      this.lastUpdate = now;
      logger.debug(`Refreshed metadata cache for ${channelsWithPrograms.length} channels`);
    } catch (error) {
      logger.error('Failed to refresh channel metadata cache:', error);
    }
  }

  createChannelMetadata(channel) {
    const now = new Date();
    const hasCurrentProgram = channel.current_title && channel.current_end && new Date(channel.current_end) > now;
    
    return {
      // Channel info
      id: channel.id,
      epg_id: channel.epg_id || channel.id,
      name: channel.name,
      number: channel.number,
      logo: channel.logo,
      
      // Current program (always present for Android TV)
      current_program: {
        title: hasCurrentProgram ? channel.current_title : `${channel.name} Live`,
        description: hasCurrentProgram ? channel.current_description : `Live programming on ${channel.name}`,
        start_time: hasCurrentProgram ? channel.current_start : now.toISOString(),
        end_time: hasCurrentProgram ? channel.current_end : new Date(now.getTime() + 3600000).toISOString(),
        category: hasCurrentProgram ? channel.current_category : 'Live TV'
      },
      
      // Metadata type info for Plex
      content_type: 4, // Type 4 (episode) NOT type 5 (trailer)
      metadata_type: 'live_tv',
      has_metadata: true,
      cached_at: now.toISOString()
    };
  }

  getChannelMetadata(channelId) {
    return this.channelCache.get(channelId) || this.generateFallbackMetadata(channelId);
  }

  generateFallbackMetadata(channelId) {
    const now = new Date();
    logger.warn('Using fallback metadata for channel switching', { channelId });
    
    return {
      id: channelId,
      epg_id: channelId,
      name: `Channel ${channelId}`,
      number: 0,
      current_program: {
        title: 'Live Programming',
        description: 'Live television programming',
        start_time: now.toISOString(),
        end_time: new Date(now.getTime() + 3600000).toISOString(),
        category: 'Live TV'
      },
      content_type: 4, // Type 4 (episode) NOT type 5 (trailer)
      metadata_type: 'live_tv',
      has_metadata: true,
      is_fallback: true,
      cached_at: now.toISOString()
    };
  }

  async preloadChannelPrograms(channelIds) {
    // Preload specific channels for immediate access
    try {
      const database = require('../services/database');
      const now = new Date().toISOString();
      const endTime = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours ahead
      
      for (const channelId of channelIds) {
        const programs = await database.all(`
          SELECT title, description, start_time, end_time, category
          FROM epg_programs 
          WHERE channel_id = ? AND start_time <= ? AND end_time >= ?
          ORDER BY start_time
          LIMIT 10
        `, [channelId, endTime, now]);
        
        if (programs.length > 0) {
          await cacheService.set(`channel_programs:${channelId}`, programs, 3600); // 1 hour cache
        }
      }
    } catch (error) {
      logger.error('Failed to preload channel programs:', error);
    }
  }
}

// Singleton instance
let metadataCache = null;

function getChannelMetadataCache() {
  if (!metadataCache) {
    metadataCache = new ChannelMetadataCache();
  }
  return metadataCache;
}

/**
 * Enhanced EPG response for immediate channel switching
 */
function generateImmediateEPGResponse(channelId, forAndroidTV = false) {
  const cache = getChannelMetadataCache();
  const metadata = cache.getChannelMetadata(channelId);
  
  if (forAndroidTV) {
    // Optimized response for Android TV channel switching with proper metadata types
    return {
      channel_id: metadata.epg_id,
      title: metadata.current_program.title,
      description: metadata.current_program.description,
      start_time: metadata.current_program.start_time,
      end_time: metadata.current_program.end_time,
      category: metadata.current_program.category,
      channel_name: metadata.name,
      channel_number: metadata.number,
      
      // Critical metadata for Android TV (fixes "Unknown metadata type" errors)
      type: 'clip', // Plex Android TV expects clip type for live TV
      metadata_type: 'clip', // Backup metadata type identifier  
      content_type: 4, // Episode content type - NOT type 5 (trailer)
      mediaType: 'episode', // Media type for Plex decision making
      contentType: 4, // Alternative content type field - NOT type 5
      
      // Episode metadata structure for Android TV compatibility
      grandparentTitle: metadata.name, // Channel name as show title
      parentTitle: metadata.current_program.title, // Program as episode title
      originalTitle: metadata.current_program.title,
      summary: metadata.current_program.description,
      
      // Episode numbering for proper metadata structure  
      index: 1, // Episode number
      parentIndex: 1, // Season number
      year: new Date().getFullYear(),
      
      // Live TV identifiers
      guid: `plexbridge://live/${channelId}/${Date.now()}`,
      key: `/library/metadata/live_${channelId}`,
      live: 1, // Live content flag
      
      // Stream characteristics
      has_video: true,
      has_audio: true,
      is_live: true,
      duration: 3600000, // 1 hour in milliseconds
      
      // Immediate response indicator
      cached_response: true,
      response_time: Date.now()
    };
  }
  
  return metadata;
}

/**
 * Middleware to handle fast channel switching requests
 */
function channelSwitchingMiddleware() {
  return async (req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    const isAndroidTV = userAgent.toLowerCase().includes('android');
    
    if (isAndroidTV && (req.url.includes('/epg/now/') || req.url.includes('/lineup.json'))) {
      // Add headers to optimize Android TV channel switching
      res.set({
        'X-Channel-Switch-Optimized': 'true',
        'Cache-Control': 'private, max-age=30', // Short cache for channel switching
        'X-Android-TV-Ready': 'true'
      });
    }
    
    next();
  };
}

/**
 * Fast lookup for current program during channel switching
 */
async function getCurrentProgramFast(channelId, isAndroidTV = false) {
  try {
    // Try cache first
    const cached = await cacheService.get(`current_program:${channelId}`);
    if (cached) {
      return cached;
    }
    
    // Use metadata cache
    const cache = getChannelMetadataCache();
    const metadata = cache.getChannelMetadata(channelId);
    const program = metadata.current_program;
    
    // Cache for 30 seconds (short cache for switching)
    await cacheService.set(`current_program:${channelId}`, program, 30);
    
    return program;
  } catch (error) {
    logger.error('Fast current program lookup failed:', error);
    
    // Return immediate fallback for Android TV with proper metadata types
    return {
      title: 'Live Programming',
      description: 'Live television programming',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 3600000).toISOString(),
      category: 'Live TV',
      is_fallback: true,
      
      // Proper metadata types for Android TV (fixes "Unknown metadata type" errors)
      type: 'clip', // Plex Android TV expects clip type for live TV
      metadata_type: 'clip', // Backup metadata type identifier  
      content_type: 4, // Episode content type - NOT type 5 (trailer)
      mediaType: 'episode', // Media type for Plex decision making
      contentType: 4, // Alternative content type field - NOT type 5
      
      // Episode metadata structure for Android TV compatibility
      grandparentTitle: 'Live TV', // Show title
      parentTitle: 'Live Programming', // Episode title
      originalTitle: 'Live Programming',
      summary: 'Live television programming',
      
      // Episode numbering for proper metadata structure  
      index: 1, // Episode number
      parentIndex: 1, // Season number
      year: new Date().getFullYear(),
      
      // Live TV identifiers
      guid: `plexbridge://fallback/${channelId}/${Date.now()}`,
      key: `/library/metadata/fallback_${channelId}`,
      live: 1, // Live content flag
      duration: 3600000 // 1 hour in milliseconds
    };
  }
}

/**
 * Optimized lineup response for channel switching
 */
function optimizeLineupForChannelSwitching(lineup, isAndroidTV = false) {
  const cache = getChannelMetadataCache();
  
  return lineup.map(channel => {
    if (isAndroidTV) {
      // Get cached metadata for immediate response
      const metadata = cache.getChannelMetadata(channel.EPGChannelID || channel.id);
      
      return {
        ...channel,
        
        // Immediate metadata for Android TV
        CurrentTitle: metadata.current_program.title,
        CurrentDescription: metadata.current_program.description,
        HasCurrentProgram: true,
        MetadataAvailable: true,
        
        // Channel switching optimization flags
        FastSwitch: true,
        CachedMetadata: !metadata.is_fallback,
        OptimizedForAndroidTV: true
      };
    }
    
    return channel;
  });
}

module.exports = {
  getChannelMetadataCache,
  generateImmediateEPGResponse,
  channelSwitchingMiddleware,
  getCurrentProgramFast,
  optimizeLineupForChannelSwitching
};