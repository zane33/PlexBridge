const redis = require('redis');
const logger = require('../utils/logger');
const config = require('../config');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async initialize() {
    if (this.isConnected) {
      return this.client;
    }

    // Use immediate fallback to memory cache to prevent hanging
    console.log('Initializing cache service with memory fallback...');
    this.client = new MemoryCache();
    this.isConnected = true;
    console.log('Memory cache initialized successfully');
    
    // Skip Redis connection attempts in production/Docker
    if (process.env.NODE_ENV !== 'production') {
      this.tryRedisConnection();
    }
    
    return this.client;
  }

  // Non-blocking Redis connection attempt
  tryRedisConnection() {
    // Don't block startup - attempt Redis connection in background
    setTimeout(async () => {
      try {
        console.log('Attempting background Redis connection...');
        
        const redisClient = redis.createClient({
          socket: {
            host: '127.0.0.1', // Force IPv4
            port: config.cache.port,
            connectTimeout: 2000
          },
          password: config.cache.password,
          database: config.cache.db
        });

        redisClient.on('error', (err) => {
          console.log('Background Redis connection failed:', err.message);
        });

        // Try to connect with strict timeout
        const connectPromise = redisClient.connect();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Background Redis timeout')), 2000);
        });

        await Promise.race([connectPromise, timeoutPromise]);
        await redisClient.ping();
        
        // Success - replace memory cache with Redis
        if (this.client instanceof MemoryCache) {
          this.client = redisClient;
          console.log('Successfully upgraded to Redis cache');
        }
      } catch (error) {
        console.log('Background Redis connection failed, continuing with memory cache:', error.message);
      }
    }, 1000); // Try Redis after 1 second delay
  }

  async get(key) {
    try {
      if (!this.isConnected) {
        return null;
      }

      const value = await this.client.get(key);
      if (value) {
        try {
          return JSON.parse(value);
        } catch {
          return value; // Return as string if not JSON
        }
      }
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = null) {
    try {
      if (!this.isConnected) {
        return false;
      }

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttl) {
        await this.client.setEx(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  async exists(key) {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  async keys(pattern) {
    try {
      if (!this.isConnected) {
        return [];
      }

      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      return [];
    }
  }

  async flush() {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.flushDb();
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  async increment(key, amount = 1) {
    try {
      if (!this.isConnected) {
        return 0;
      }

      return await this.client.incrBy(key, amount);
    } catch (error) {
      logger.error('Cache increment error:', error);
      return 0;
    }
  }

  async expire(key, seconds) {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', error);
      return false;
    }
  }

  // Specialized methods for common caching patterns
  async getEpgData(channelId) {
    return await this.get(`epg:${channelId}`);
  }

  async setEpgData(channelId, data) {
    return await this.set(`epg:${channelId}`, data, config.cache.ttl.epg);
  }

  async getStreamInfo(streamId) {
    return await this.get(`stream:${streamId}`);
  }

  async setStreamInfo(streamId, info) {
    return await this.set(`stream:${streamId}`, info, config.cache.ttl.streams);
  }

  async getChannelLineup() {
    return await this.get('lineup:channels');
  }

  async setChannelLineup(lineup) {
    return await this.set('lineup:channels', lineup, config.cache.ttl.api);
  }

  async getMetrics() {
    try {
      const metrics = await this.get('metrics:system');
      return metrics || null;
    } catch (error) {
      logger.warn('Failed to get metrics from cache:', error);
      return null;
    }
  }

  async setMetrics(metrics) {
    try {
      if (!metrics || typeof metrics !== 'object') {
        logger.warn('Invalid metrics data for caching:', metrics);
        return false;
      }
      return await this.set('metrics:system', metrics, 60); // 1 minute TTL
    } catch (error) {
      logger.warn('Failed to set metrics in cache:', error);
      return false;
    }
  }

  // Stream session tracking
  async addStreamSession(sessionId, streamId, clientInfo) {
    const key = `session:${sessionId}`;
    const data = {
      streamId,
      clientInfo,
      startTime: Date.now(),
      lastSeen: Date.now()
    };
    return await this.set(key, data, 3600); // 1 hour TTL
  }

  async updateStreamSession(sessionId) {
    const key = `session:${sessionId}`;
    const session = await this.get(key);
    if (session) {
      session.lastSeen = Date.now();
      return await this.set(key, session, 3600);
    }
    return false;
  }

  async removeStreamSession(sessionId) {
    return await this.del(`session:${sessionId}`);
  }

  async getActiveStreamSessions() {
    const keys = await this.keys('session:*');
    const sessions = [];
    
    for (const key of keys) {
      const session = await this.get(key);
      if (session) {
        sessions.push({
          id: key.replace('session:', ''),
          ...session
        });
      }
    }
    
    return sessions;
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected' };
      }

      await this.client.ping();
      return { 
        status: 'healthy', 
        type: this.client.constructor.name,
        timestamp: new Date().toISOString() 
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message, 
        timestamp: new Date().toISOString() 
      };
    }
  }

  async close() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        logger.info('Cache service disconnected');
      } catch (error) {
        logger.error('Error closing cache service:', error);
      }
    }
    this.isConnected = false;
  }
}

// Memory cache fallback when Redis is not available
class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  async get(key) {
    return this.cache.get(key) || null;
  }

  async set(key, value, ttl = null) {
    this.cache.set(key, value);
    
    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }
    
    // Set expiration timer if TTL provided
    if (ttl) {
      const timer = setTimeout(() => {
        this.cache.delete(key);
        this.timers.delete(key);
      }, ttl * 1000);
      this.timers.set(key, timer);
    }
    
    return true;
  }

  async del(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    return this.cache.delete(key);
  }

  async exists(key) {
    return this.cache.has(key);
  }

  async keys(pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.cache.keys()).filter(key => regex.test(key));
  }

  async flushDb() {
    this.cache.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    return true;
  }

  async incrBy(key, amount) {
    const current = this.cache.get(key) || 0;
    const newValue = parseInt(current) + amount;
    this.cache.set(key, newValue);
    return newValue;
  }

  async expire(key, seconds) {
    if (this.cache.has(key)) {
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
      }
      
      const timer = setTimeout(() => {
        this.cache.delete(key);
        this.timers.delete(key);
      }, seconds * 1000);
      
      this.timers.set(key, timer);
      return true;
    }
    return false;
  }

  async ping() {
    return 'PONG';
  }

  async quit() {
    this.cache.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
