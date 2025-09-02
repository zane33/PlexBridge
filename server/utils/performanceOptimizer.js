/**
 * Performance Optimizer for PlexBridge
 * Reduces response times and prevents Plex transaction timeouts
 */

const logger = require('./logger');
const cacheService = require('../services/cacheService');

/**
 * Cache configuration for different endpoint types
 */
const CACHE_CONFIG = {
  lineup: {
    ttl: 300, // 5 minutes
    key: 'plex:lineup'
  },
  lineup_status: {
    ttl: 60, // 1 minute  
    key: 'plex:lineup_status'
  },
  discover: {
    ttl: 600, // 10 minutes
    key: 'plex:discover'
  },
  epg_channel: {
    ttl: 1800, // 30 minutes
    keyPrefix: 'plex:epg:channel:'
  },
  current_program: {
    ttl: 120, // 2 minutes
    keyPrefix: 'plex:current:'
  }
};

/**
 * Middleware to add response caching for Plex endpoints
 */
function cacheMiddleware(cacheType) {
  return async (req, res, next) => {
    const config = CACHE_CONFIG[cacheType];
    if (!config) {
      return next();
    }

    // Generate cache key
    let cacheKey = config.key || config.keyPrefix;
    if (config.keyPrefix && req.params.channelId) {
      cacheKey += req.params.channelId;
    }

    try {
      // Check cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug('Cache hit for Plex endpoint', { 
          cacheType, 
          key: cacheKey,
          userAgent: req.get('User-Agent')
        });
        
        // Set cache headers
        res.set({
          'X-Cache': 'HIT',
          'Cache-Control': `private, max-age=${config.ttl}`,
          'ETag': `W/"${Buffer.from(JSON.stringify(cached)).toString('base64').substring(0, 27)}"`
        });
        
        return res.json(cached);
      }
    } catch (error) {
      logger.warn('Cache check failed, proceeding without cache', { error: error.message });
    }

    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to cache response
    res.json = function(data) {
      // Cache the response asynchronously
      cacheService.set(cacheKey, data, config.ttl).catch(err => {
        logger.warn('Failed to cache response', { error: err.message });
      });
      
      // Set cache headers
      res.set({
        'X-Cache': 'MISS',
        'Cache-Control': `private, max-age=${config.ttl}`
      });
      
      return originalJson(data);
    };
    
    next();
  };
}

/**
 * Optimizes EPG data to reduce size and processing time
 */
function optimizeEPGData(programs, options = {}) {
  const { 
    maxPrograms = 1000,
    minFields = false,
    currentOnly = false 
  } = options;

  let optimized = programs;

  // Limit number of programs
  if (programs.length > maxPrograms) {
    logger.debug('Limiting EPG programs', { 
      original: programs.length, 
      limited: maxPrograms 
    });
    optimized = programs.slice(0, maxPrograms);
  }

  // Filter to current programs only
  if (currentOnly) {
    const now = new Date();
    optimized = optimized.filter(p => {
      const start = new Date(p.start_time);
      const end = new Date(p.end_time);
      return start <= now && end > now;
    });
  }

  // Minimize fields if requested
  if (minFields) {
    optimized = optimized.map(p => ({
      channel_id: p.channel_id,
      title: p.title || 'Programming',
      description: p.description?.substring(0, 200) || '',
      start_time: p.start_time,
      end_time: p.end_time,
      category: p.category || 'TV'
    }));
  }

  return optimized;
}

/**
 * Batches database queries to reduce load
 */
class QueryBatcher {
  constructor(queryFn, options = {}) {
    this.queryFn = queryFn;
    this.batchSize = options.batchSize || 50;
    this.delay = options.delay || 10;
    this.queue = [];
    this.processing = false;
  }

  async add(params) {
    return new Promise((resolve, reject) => {
      this.queue.push({ params, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      
      try {
        const results = await Promise.all(
          batch.map(item => this.queryFn(item.params))
        );
        
        batch.forEach((item, index) => {
          item.resolve(results[index]);
        });
      } catch (error) {
        batch.forEach(item => {
          item.reject(error);
        });
      }
      
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
    }
    
    this.processing = false;
  }
}

/**
 * Lightweight EPG response for Android TV
 */
function generateLightweightEPG(channels, options = {}) {
  const now = new Date();
  const endTime = new Date(now.getTime() + (4 * 60 * 60 * 1000)); // 4 hours ahead
  
  const lightPrograms = channels.map(channel => {
    // Generate single current/next program per channel
    return {
      channel_id: channel.epg_id || channel.id,
      channel_name: channel.name,
      channel_number: channel.number,
      current: {
        title: `${channel.name} Live`,
        description: `Currently broadcasting on ${channel.name}`,
        start_time: now.toISOString(),
        end_time: new Date(now.getTime() + (60 * 60 * 1000)).toISOString()
      },
      next: {
        title: `${channel.name} Programming`,
        description: `Upcoming on ${channel.name}`,
        start_time: new Date(now.getTime() + (60 * 60 * 1000)).toISOString(),
        end_time: endTime.toISOString()
      }
    };
  });

  return lightPrograms;
}

/**
 * Preloads critical data into cache on startup
 */
async function preloadCache(database) {
  try {
    logger.info('Preloading cache for optimal performance...');
    
    // Preload channels
    const channels = await database.all(`
      SELECT c.*, s.url, s.type 
      FROM channels c 
      LEFT JOIN streams s ON c.id = s.channel_id 
      WHERE c.enabled = 1 AND s.enabled = 1
      ORDER BY c.number
    `);
    
    await cacheService.set('channels:enabled', channels, 300);
    
    // Preload current EPG programs
    const now = new Date().toISOString();
    const currentPrograms = await database.all(`
      SELECT p.*, 
             COALESCE(c.name, ec.display_name, 'EPG Channel ' || p.channel_id) as channel_name, 
             COALESCE(c.number, 9999) as channel_number
      FROM epg_programs p
      LEFT JOIN channels c ON c.epg_id = p.channel_id
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE p.start_time <= ? AND p.end_time > ?
      ORDER BY channel_number
    `, [now, now]);
    
    await cacheService.set('epg:current:all', currentPrograms, 120);
    
    logger.info('Cache preload complete', { 
      channels: channels.length,
      currentPrograms: currentPrograms.length 
    });
  } catch (error) {
    logger.error('Cache preload failed:', error);
  }
}

/**
 * Monitors response times and logs slow requests
 */
function responseTimeMonitor(threshold = 200) {
  return (req, res, next) => {
    const start = Date.now();
    
    // Store original end method
    const originalEnd = res.end.bind(res);
    
    res.end = function(...args) {
      const duration = Date.now() - start;
      
      if (duration > threshold) {
        logger.warn('Slow response detected', {
          method: req.method,
          url: req.url,
          duration: `${duration}ms`,
          userAgent: req.get('User-Agent'),
          isAndroidTV: req.get('User-Agent')?.toLowerCase().includes('android')
        });
      }
      
      res.set('X-Response-Time', `${duration}ms`);
      return originalEnd(...args);
    };
    
    next();
  };
}

module.exports = {
  cacheMiddleware,
  optimizeEPGData,
  QueryBatcher,
  generateLightweightEPG,
  preloadCache,
  responseTimeMonitor,
  CACHE_CONFIG
};