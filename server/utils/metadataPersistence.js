/**
 * Metadata Persistence for Live TV Streams
 * Maintains metadata items to prevent "metadata item no longer exists" errors
 */

const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');

class MetadataPersistenceManager {
  constructor() {
    // Store metadata items with their creation time
    this.metadataItems = new Map();
    
    // Track which sessions are using which metadata
    this.sessionMetadata = new Map();
    
    // Clean up old metadata periodically (every 5 minutes)
    this.cleanupInterval = setInterval(() => this.cleanupExpiredMetadata(), 300000);
    
    // Default metadata TTL (24 hours for Live TV)
    this.metadataTTL = 86400000; // 24 hours in milliseconds
    
    logger.info('Metadata persistence manager initialized');
  }

  /**
   * Create or get metadata item for a channel
   */
  getOrCreateMetadata(channelId, channelInfo = {}) {
    // Check if we have existing metadata for this channel
    let metadataId = null;
    
    for (const [id, metadata] of this.metadataItems) {
      if (metadata.channelId === channelId && !this.isExpired(metadata)) {
        metadataId = id;
        break;
      }
    }
    
    if (!metadataId) {
      // Create new metadata item
      metadataId = this.generateMetadataId();
      const metadata = this.createMetadataItem(metadataId, channelId, channelInfo);
      this.metadataItems.set(metadataId, metadata);
      
      logger.info('Created new metadata item for Live TV', {
        metadataId,
        channelId,
        channelName: channelInfo.name
      });
    } else {
      // Update last accessed time
      const metadata = this.metadataItems.get(metadataId);
      if (metadata) {
        metadata.lastAccessed = Date.now();
      }
      
      logger.debug('Using existing metadata item', {
        metadataId,
        channelId
      });
    }
    
    return metadataId;
  }

  /**
   * Create metadata item structure for Plex
   */
  createMetadataItem(metadataId, channelId, channelInfo) {
    const now = new Date();
    
    return {
      // Metadata identification
      id: metadataId,
      ratingKey: metadataId,
      key: `/library/metadata/${metadataId}`,
      guid: `plexbridge://live/${channelId}/${Date.now()}`,
      
      // Channel information
      channelId: channelId,
      channelNumber: channelInfo.number || 0,
      channelName: channelInfo.name || 'Live TV',
      
      // Content metadata (MUST be type 4 for Live TV)
      type: 'episode',
      contentType: 4, // Episode type for Live TV
      metadata_type: 'episode',
      
      // Program information
      title: channelInfo.currentProgram?.title || `${channelInfo.name || 'Channel'} Live`,
      summary: channelInfo.currentProgram?.description || 'Live television programming',
      originallyAvailableAt: now.toISOString(),
      addedAt: Math.floor(now.getTime() / 1000),
      updatedAt: Math.floor(now.getTime() / 1000),
      
      // Episode structure for Live TV
      grandparentTitle: channelInfo.name || 'Live TV',
      parentTitle: 'Live Programming',
      index: 1, // Episode number
      parentIndex: 1, // Season number
      year: now.getFullYear(),
      
      // Live TV specific
      live: 1,
      duration: 86400000, // 24 hours for Live TV
      
      // Media information
      Media: [{
        id: metadataId,
        duration: 86400000,
        bitrate: 5000,
        width: 1920,
        height: 1080,
        aspectRatio: 1.78,
        audioChannels: 2,
        audioCodec: 'aac',
        videoCodec: 'h264',
        videoResolution: '1080',
        container: 'mpegts',
        videoFrameRate: '30p',
        optimizedForStreaming: 1,
        protocol: 'hls',
        
        Part: [{
          id: metadataId,
          key: `/library/parts/${metadataId}/file.ts`,
          duration: 86400000,
          file: `/stream/${channelId}`,
          size: 0,
          exists: 1,
          accessible: 1,
          
          Stream: [
            {
              id: `${metadataId}_video`,
              streamType: 1, // Video
              codec: 'h264',
              index: 0,
              bitrate: 4000,
              height: 1080,
              width: 1920,
              displayTitle: '1080p (H.264)',
              frameRate: 30
            },
            {
              id: `${metadataId}_audio`,
              streamType: 2, // Audio
              codec: 'aac',
              index: 1,
              channels: 2,
              bitrate: 128,
              samplingRate: 48000,
              displayTitle: 'AAC Stereo'
            }
          ]
        }]
      }],
      
      // Tracking
      created: Date.now(),
      lastAccessed: Date.now(),
      sessionCount: 0
    };
  }

  /**
   * Generate unique metadata ID
   */
  generateMetadataId() {
    // Use a number that won't conflict with Plex's internal IDs
    // Start from 90000 to avoid conflicts
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${90000 + (timestamp % 10000) + random}`;
  }

  /**
   * Associate metadata with a session
   */
  associateSessionMetadata(sessionId, metadataId) {
    this.sessionMetadata.set(sessionId, metadataId);
    
    const metadata = this.metadataItems.get(metadataId);
    if (metadata) {
      metadata.sessionCount++;
      metadata.lastAccessed = Date.now();
    }
    
    logger.debug('Associated metadata with session', {
      sessionId,
      metadataId
    });
  }

  /**
   * Release metadata from session
   */
  releaseSessionMetadata(sessionId) {
    const metadataId = this.sessionMetadata.get(sessionId);
    if (metadataId) {
      this.sessionMetadata.delete(sessionId);
      
      const metadata = this.metadataItems.get(metadataId);
      if (metadata && metadata.sessionCount > 0) {
        metadata.sessionCount--;
      }
      
      logger.debug('Released metadata from session', {
        sessionId,
        metadataId
      });
    }
  }

  /**
   * Get metadata item by ID
   */
  getMetadataItem(metadataId) {
    const metadata = this.metadataItems.get(String(metadataId));
    if (metadata && !this.isExpired(metadata)) {
      metadata.lastAccessed = Date.now();
      return metadata;
    }
    return null;
  }

  /**
   * Check if metadata is expired
   */
  isExpired(metadata) {
    const age = Date.now() - metadata.created;
    const idle = Date.now() - metadata.lastAccessed;
    
    // Expire after 24 hours or 1 hour of inactivity
    return age > this.metadataTTL || idle > 3600000;
  }

  /**
   * Clean up expired metadata
   */
  cleanupExpiredMetadata() {
    const expired = [];
    
    for (const [id, metadata] of this.metadataItems) {
      // Don't clean up metadata that's actively in use
      if (metadata.sessionCount > 0) {
        continue;
      }
      
      if (this.isExpired(metadata)) {
        expired.push(id);
      }
    }
    
    for (const id of expired) {
      this.metadataItems.delete(id);
      logger.debug('Cleaned up expired metadata', { metadataId: id });
    }
    
    if (expired.length > 0) {
      logger.info('Cleaned up expired metadata items', { count: expired.length });
    }
  }

  /**
   * Handle metadata request from Plex
   */
  handleMetadataRequest(metadataId) {
    const metadata = this.getMetadataItem(metadataId);
    
    if (!metadata) {
      // Try to extract channel ID from metadata ID pattern
      // Metadata IDs are in format: 90XXX where XXX relates to channel
      logger.warn('Metadata item not found, may have expired', { metadataId });
      
      // Return a generic Live TV metadata response
      return this.createFallbackMetadata(metadataId);
    }
    
    return metadata;
  }

  /**
   * Create fallback metadata for expired items
   */
  createFallbackMetadata(metadataId) {
    logger.info('Creating fallback metadata for expired item', { metadataId });
    
    return {
      id: metadataId,
      ratingKey: metadataId,
      key: `/library/metadata/${metadataId}`,
      type: 'episode',
      contentType: 4,
      title: 'Live Programming',
      summary: 'Live television programming',
      duration: 86400000,
      live: 1,
      
      Media: [{
        id: metadataId,
        duration: 86400000,
        container: 'mpegts',
        protocol: 'hls',
        
        Part: [{
          id: metadataId,
          key: `/library/parts/${metadataId}/file.ts`,
          duration: 86400000,
          exists: 1,
          accessible: 1
        }]
      }]
    };
  }

  /**
   * Shutdown and cleanup
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.metadataItems.clear();
    this.sessionMetadata.clear();
    
    logger.info('Metadata persistence manager shut down');
  }
}

// Singleton instance
let metadataManager = null;

function getMetadataManager() {
  if (!metadataManager) {
    metadataManager = new MetadataPersistenceManager();
  }
  return metadataManager;
}

module.exports = {
  getMetadataManager,
  MetadataPersistenceManager
};