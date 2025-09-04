const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const database = require('./database');

/**
 * Consumer Manager - Persistent consumer tracking for HDHomeRun emulation
 * Maintains consumer sessions across restarts to prevent "Failed to find consumer" errors
 */
class ConsumerManager {
  constructor() {
    this.consumers = new Map();
    this.initDatabase();
    this.loadConsumers();
    
    // Cleanup stale consumers every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanupStaleConsumers(), 30000);
    
    logger.info('ConsumerManager initialized with persistent tracking');
  }

  /**
   * Initialize database tables for consumer persistence
   */
  initDatabase() {
    try {
      const db = database;
      
      // Create consumers table if it doesn't exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS consumers (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          channel_id TEXT,
          stream_url TEXT,
          state TEXT DEFAULT 'idle',
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now')),
          last_activity INTEGER DEFAULT (strftime('%s', 'now')),
          user_agent TEXT,
          client_ip TEXT,
          metadata TEXT,
          UNIQUE(session_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_consumers_session ON consumers(session_id);
        CREATE INDEX IF NOT EXISTS idx_consumers_state ON consumers(state);
        CREATE INDEX IF NOT EXISTS idx_consumers_activity ON consumers(last_activity);
      `);
      
      logger.info('Consumer database tables initialized');
    } catch (error) {
      logger.error('Failed to initialize consumer database:', error);
    }
  }

  /**
   * Load existing consumers from database on startup
   */
  loadConsumers() {
    try {
      const db = database;
      const stmt = db.prepare(`
        SELECT * FROM consumers 
        WHERE state IN ('streaming', 'buffering', 'paused')
        AND last_activity > strftime('%s', 'now') - 3600
      `);
      
      const activeConsumers = stmt.all();
      
      activeConsumers.forEach(consumer => {
        this.consumers.set(consumer.session_id, {
          id: consumer.id,
          sessionId: consumer.session_id,
          channelId: consumer.channel_id,
          streamUrl: consumer.stream_url,
          state: consumer.state,
          createdAt: consumer.created_at * 1000,
          updatedAt: consumer.updated_at * 1000,
          lastActivity: consumer.last_activity * 1000,
          userAgent: consumer.user_agent,
          clientIp: consumer.client_ip,
          metadata: consumer.metadata ? JSON.parse(consumer.metadata) : {}
        });
      });
      
      logger.info(`Loaded ${activeConsumers.length} active consumers from database`);
    } catch (error) {
      logger.error('Failed to load consumers from database:', error);
    }
  }

  /**
   * Create or update a consumer session
   */
  createConsumer(sessionId, channelId = null, streamUrl = null, options = {}) {
    try {
      const consumerId = options.consumerId || uuidv4();
      const now = Date.now();
      
      const consumer = {
        id: consumerId,
        sessionId: sessionId,
        channelId: channelId,
        streamUrl: streamUrl,
        state: options.state || 'streaming',
        createdAt: now,
        updatedAt: now,
        lastActivity: now,
        userAgent: options.userAgent || '',
        clientIp: options.clientIp || '',
        metadata: options.metadata || {}
      };
      
      // Store in memory
      this.consumers.set(sessionId, consumer);
      
      // Persist to database
      const db = database;
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO consumers (
          id, session_id, channel_id, stream_url, state,
          created_at, updated_at, last_activity,
          user_agent, client_ip, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        consumerId,
        sessionId,
        channelId,
        streamUrl,
        consumer.state,
        Math.floor(consumer.createdAt / 1000),
        Math.floor(consumer.updatedAt / 1000),
        Math.floor(consumer.lastActivity / 1000),
        consumer.userAgent,
        consumer.clientIp,
        JSON.stringify(consumer.metadata)
      );
      
      logger.debug('Created/updated consumer', {
        consumerId,
        sessionId,
        state: consumer.state,
        channelId
      });
      
      return consumer;
    } catch (error) {
      logger.error('Failed to create consumer:', error);
      // Return a minimal consumer object even on error
      return {
        id: sessionId,
        sessionId: sessionId,
        state: 'streaming',
        lastActivity: Date.now()
      };
    }
  }

  /**
   * Get consumer by session ID
   */
  getConsumer(sessionId) {
    // Check memory first
    let consumer = this.consumers.get(sessionId);
    
    if (!consumer) {
      // Try to load from database
      try {
        const db = database;
        const stmt = db.prepare('SELECT * FROM consumers WHERE session_id = ?');
        const dbConsumer = stmt.get(sessionId);
        
        if (dbConsumer) {
          consumer = {
            id: dbConsumer.id,
            sessionId: dbConsumer.session_id,
            channelId: dbConsumer.channel_id,
            streamUrl: dbConsumer.stream_url,
            state: dbConsumer.state,
            createdAt: dbConsumer.created_at * 1000,
            updatedAt: dbConsumer.updated_at * 1000,
            lastActivity: dbConsumer.last_activity * 1000,
            userAgent: dbConsumer.user_agent,
            clientIp: dbConsumer.client_ip,
            metadata: dbConsumer.metadata ? JSON.parse(dbConsumer.metadata) : {}
          };
          
          // Cache in memory
          this.consumers.set(sessionId, consumer);
        }
      } catch (error) {
        logger.error('Failed to get consumer from database:', error);
      }
    }
    
    return consumer;
  }

  /**
   * Update consumer activity timestamp
   */
  updateActivity(sessionId) {
    const consumer = this.getConsumer(sessionId);
    
    if (consumer) {
      const now = Date.now();
      consumer.lastActivity = now;
      consumer.updatedAt = now;
      
      // Update in memory
      this.consumers.set(sessionId, consumer);
      
      // Update in database (async, don't wait)
      try {
        const db = database;
        const stmt = db.prepare(`
          UPDATE consumers 
          SET last_activity = ?, updated_at = ?
          WHERE session_id = ?
        `);
        stmt.run(
          Math.floor(now / 1000),
          Math.floor(now / 1000),
          sessionId
        );
      } catch (error) {
        logger.error('Failed to update consumer activity:', error);
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Update consumer state
   */
  updateState(sessionId, state) {
    const consumer = this.getConsumer(sessionId);
    
    if (consumer) {
      consumer.state = state;
      consumer.updatedAt = Date.now();
      
      // Update in memory
      this.consumers.set(sessionId, consumer);
      
      // Update in database
      try {
        const db = database;
        const stmt = db.prepare(`
          UPDATE consumers 
          SET state = ?, updated_at = ?
          WHERE session_id = ?
        `);
        stmt.run(state, Math.floor(consumer.updatedAt / 1000), sessionId);
      } catch (error) {
        logger.error('Failed to update consumer state:', error);
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Check if consumer exists and is active
   */
  hasConsumer(sessionId) {
    const consumer = this.getConsumer(sessionId);
    
    if (!consumer) return false;
    
    // Check if consumer is stale (no activity for 5 minutes - original value)
    const staleThreshold = 5 * 60 * 1000;
    const isStale = (Date.now() - consumer.lastActivity) > staleThreshold;
    
    return !isStale && ['streaming', 'buffering', 'paused'].includes(consumer.state);
  }

  /**
   * Remove consumer
   */
  removeConsumer(sessionId) {
    // Remove from memory
    this.consumers.delete(sessionId);
    
    // Remove from database
    try {
      const db = database;
      const stmt = db.prepare('DELETE FROM consumers WHERE session_id = ?');
      stmt.run(sessionId);
      
      logger.debug('Removed consumer', { sessionId });
    } catch (error) {
      logger.error('Failed to remove consumer:', error);
    }
  }

  /**
   * Clean up stale consumers
   */
  cleanupStaleConsumers() {
    try {
      const staleThreshold = 10 * 60; // 10 minutes in seconds (original value)
      
      // Remove from database
      const db = database;
      const stmt = db.prepare(`
        DELETE FROM consumers 
        WHERE last_activity < strftime('%s', 'now') - ?
        OR state IN ('stopped', 'error')
      `);
      const result = stmt.run(staleThreshold);
      
      if (result.changes > 0) {
        logger.info(`Cleaned up ${result.changes} stale consumers`);
      }
      
      // Clean memory cache
      const now = Date.now();
      const staleMs = staleThreshold * 1000;
      
      for (const [sessionId, consumer] of this.consumers.entries()) {
        if ((now - consumer.lastActivity) > staleMs || 
            ['stopped', 'error'].includes(consumer.state)) {
          this.consumers.delete(sessionId);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup stale consumers:', error);
    }
  }

  /**
   * Get all active consumers
   */
  getActiveConsumers() {
    const activeConsumers = [];
    const now = Date.now();
    const activeThreshold = 5 * 60 * 1000; // 5 minutes (original value)
    
    for (const consumer of this.consumers.values()) {
      if ((now - consumer.lastActivity) <= activeThreshold &&
          ['streaming', 'buffering', 'paused'].includes(consumer.state)) {
        activeConsumers.push(consumer);
      }
    }
    
    return activeConsumers;
  }

  /**
   * Get consumer statistics
   */
  getStats() {
    const activeConsumers = this.getActiveConsumers();
    
    return {
      total: this.consumers.size,
      active: activeConsumers.length,
      streaming: activeConsumers.filter(c => c.state === 'streaming').length,
      buffering: activeConsumers.filter(c => c.state === 'buffering').length,
      paused: activeConsumers.filter(c => c.state === 'paused').length
    };
  }

  /**
   * Cleanup on shutdown
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Mark all consumers as stopped
    try {
      const db = database;
      const stmt = db.prepare(`
        UPDATE consumers 
        SET state = 'stopped', updated_at = strftime('%s', 'now')
        WHERE state IN ('streaming', 'buffering', 'paused')
      `);
      stmt.run();
    } catch (error) {
      logger.error('Failed to mark consumers as stopped:', error);
    }
  }
}

// Singleton instance
let consumerManager = null;

function getConsumerManager() {
  if (!consumerManager) {
    consumerManager = new ConsumerManager();
  }
  return consumerManager;
}

module.exports = {
  getConsumerManager,
  ConsumerManager
};