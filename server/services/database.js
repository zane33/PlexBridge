const Database = require('better-sqlite3');
const logger = require('../utils/logger');
const config = require('../config');
const path = require('path');
const fs = require('fs');

class DatabaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.dbPath = config.database.path;
  }

  async initialize() {
    if (this.isInitialized && this.db) {
      return this.db;
    }

    try {
      logger.info('Initializing real database service');
      
      // Ensure database directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Initialize database
      this.db = new Database(this.dbPath);
      
      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 10000');
      this.db.pragma('temp_store = MEMORY');
      
      // Create tables if they don't exist
      await this.createTables();
      
      // Initialize default settings
      await this.initializeDefaultSettings();
      
      this.isInitialized = true;
      logger.info('Real database initialized successfully');
      return this.db;
    } catch (error) {
      logger.error('Real database initialization failed:', error.message);
      this.isInitialized = false;
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      throw error;
    }
  }

  // Mock database initialization - simplified

  // Real database operations
  run(sql, params = []) {
    try {
      if (!this.db || !this.isInitialized) {
        throw new Error('Database not initialized');
      }
      
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      return Promise.resolve(result);
    } catch (err) {
      logger.error('Database run error:', { sql, params, error: err.message });
      return Promise.reject(err);
    }
  }

  get(sql, params = []) {
    try {
      if (!this.db || !this.isInitialized) {
        throw new Error('Database not initialized');
      }
      
      const stmt = this.db.prepare(sql);
      const result = stmt.get(...params);
      return Promise.resolve(result);
    } catch (err) {
      logger.error('Database get error:', { sql, params, error: err.message });
      return Promise.reject(err);
    }
  }

  all(sql, params = []) {
    try {
      if (!this.db || !this.isInitialized) {
        throw new Error('Database not initialized');
      }
      
      const stmt = this.db.prepare(sql);
      const result = stmt.all(...params);
      return Promise.resolve(result);
    } catch (err) {
      logger.error('Database all error:', { sql, params, error: err.message });
      return Promise.reject(err);
    }
  }

  async createTables() {
    try {
      if (!this.db) {
        throw new Error('Database connection not available');
      }

      // Create channels table
      const createChannelsTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS channels (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          number INTEGER NOT NULL,
          enabled INTEGER DEFAULT 1,
          logo TEXT,
          epg_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      createChannelsTable.run();

      // Create streams table
      const createStreamsTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS streams (
          id TEXT PRIMARY KEY,
          channel_id TEXT,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          type TEXT DEFAULT 'hls',
          backup_urls TEXT,
          auth_username TEXT,
          auth_password TEXT,
          headers TEXT,
          protocol_options TEXT,
          enabled INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (channel_id) REFERENCES channels (id)
        )
      `);
      createStreamsTable.run();

      // Create settings table
      const createSettingsTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      createSettingsTable.run();

      // Create epg_sources table
      const createEpgSourcesTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS epg_sources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          refresh_interval TEXT DEFAULT '4h',
          enabled INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      createEpgSourcesTable.run();

      // Create epg_channels table
      const createEpgChannelsTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS epg_channels (
          epg_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          icon_url TEXT,
          source_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (source_id) REFERENCES epg_sources (id)
        )
      `);
      createEpgChannelsTable.run();

      // Create epg_programs table
      const createEpgProgramsTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS epg_programs (
          id TEXT PRIMARY KEY,
          channel_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          start_time DATETIME NOT NULL,
          end_time DATETIME NOT NULL,
          category TEXT,
          episode_number TEXT,
          season_number TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (channel_id) REFERENCES channels (id)
        )
      `);
      createEpgProgramsTable.run();

      // Create stream_sessions table
      const createStreamSessionsTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS stream_sessions (
          id TEXT PRIMARY KEY,
          stream_id TEXT,
          client_ip TEXT,
          user_agent TEXT,
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          ended_at DATETIME,
          bytes_transferred INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          FOREIGN KEY (stream_id) REFERENCES streams (id)
        )
      `);
      createStreamSessionsTable.run();

      // Create logs table
      const createLogsTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS logs (
          id TEXT PRIMARY KEY,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          metadata TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      createLogsTable.run();

      logger.info('Database tables created successfully');
    } catch (error) {
      logger.error('Failed to create database tables:', error);
      throw error;
    }
  }

  async initializeDefaultSettings() {
    try {
      if (!this.db) {
        throw new Error('Database connection not available');
      }

      const defaultSettings = [
        ['plexlive.streaming.maxConcurrentStreams', '5', 'Maximum number of concurrent streams'],
        ['plexlive.localization.timezone', 'UTC', 'Default timezone'],
        ['plexlive.localization.locale', 'en-US', 'Default locale']
      ];

      const insertSetting = this.db.prepare(`
        INSERT OR IGNORE INTO settings (key, value, description)
        VALUES (?, ?, ?)
      `);

      for (const [key, value, description] of defaultSettings) {
        insertSetting.run(key, value, description);
      }

      logger.info('Default settings initialized');
    } catch (error) {
      logger.error('Failed to initialize default settings:', error);
      throw error;
    }
  }

  // Transaction support
  async transaction(callback) {
    try {
      if (!this.db || !this.isInitialized) {
        throw new Error('Database not initialized');
      }
      
      const result = await this.db.transaction(callback)();
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Cleanup
  async cleanup() {
    try {
      if (this.db && this.isInitialized) {
        // Clean up old logs (keep last 1000 entries)
        await this.run(`
          DELETE FROM logs WHERE id NOT IN (
            SELECT id FROM logs ORDER BY timestamp DESC LIMIT 1000
          )
        `);
        
        // Clean up old stream sessions
        await this.run(`
          DELETE FROM stream_sessions WHERE ended_at < datetime('now', '-1 day')
        `);
        
        // Clean up old EPG programs
        await this.run(`
          DELETE FROM epg_programs WHERE end_time < datetime('now', '-1 day')
        `);
        
        logger.info('Database cleanup completed');
      }
    } catch (error) {
      logger.error('Database cleanup error:', error);
    }
  }

  async close() {
    if (this.isInitialized && this.db) {
      try {
        logger.info('Closing database');
        this.db.close();
        this.isInitialized = false;
        this.db = null;
        logger.info('Database closed successfully');
      } catch (err) {
        logger.error('Database close error:', err);
      }
    } else {
      this.isInitialized = false;
      this.db = null;
    }
    return Promise.resolve();
  }

  getSettingDescription(key) {
    const descriptions = {
      'plexlive.streaming.maxConcurrentStreams': 'Maximum number of concurrent streams allowed',
      'plexlive.localization.timezone': 'Default timezone for the application',
      'plexlive.localization.locale': 'Default locale for the application'
    };
    return descriptions[key] || `Setting for ${key}`;
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isInitialized || !this.db) {
        return { status: 'unhealthy', error: 'Database not initialized', timestamp: new Date().toISOString() };
      }
      
      const result = await this.get('SELECT 1 as health');
      if (result && result.health === 1) {
        return { status: 'healthy', timestamp: new Date().toISOString() };
      } else {
        return { status: 'unhealthy', error: 'Health check failed', timestamp: new Date().toISOString() };
      }
    } catch (error) {
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService;
