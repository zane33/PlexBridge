const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../config');

class DatabaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return this.db;
    }

    try {
      // Try to initialize with timeout first
      const initPromise = this.initializeWithTimeout();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database initialization timeout')), 15000);
      });
      
      await Promise.race([initPromise, timeoutPromise]);
      logger.info('Database initialized successfully');
      return this.db;
    } catch (error) {
      logger.error('Database initialization failed:', error.message);
      
      // Try to recover from corruption by recreating the database
      if (error.message.includes('SQLITE_CORRUPT') || error.message.includes('SQLITE_MISUSE') || error.message.includes('Database is closed')) {
        logger.warn('Database appears corrupted, attempting recovery...');
        try {
          await this.recoverDatabase();
          return this.db;
        } catch (recoveryError) {
          logger.error('Database recovery failed:', recoveryError.message);
        }
      }
      
      // Don't fall back to mock mode - throw the error instead
      this.isInitialized = false;
      this.db = null;
      throw error;
    }
  }

  async initializeWithTimeout() {
    try {
      // Force use of environment variable DB_PATH if available
      const dbFile = process.env.DB_PATH || config.database.path;
      const dbDir = path.dirname(dbFile);
      
      logger.info(`Initializing database at: ${dbFile}`);
      
      if (!fs.existsSync(dbDir)) {
        logger.info(`Creating database directory: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true, mode: 0o755 });
      }

      // Verify directory is writable
      try {
        fs.accessSync(dbDir, fs.constants.W_OK);
        logger.info(`Database directory is writable: ${dbDir}`);
      } catch (accessError) {
        logger.error(`Database directory is not writable: ${dbDir}`, accessError);
        throw new Error(`Database directory not writable: ${dbDir} - ${accessError.message}`);
      }

      // Check if database file exists and is accessible
      if (fs.existsSync(dbFile)) {
        try {
          fs.accessSync(dbFile, fs.constants.R_OK | fs.constants.W_OK);
          logger.info(`Existing database file is accessible: ${dbFile}`);
        } catch (accessError) {
          logger.warn(`Database file exists but is not accessible, attempting to fix permissions: ${dbFile}`);
          try {
            // Try to fix permissions (this may fail if running without privileges)
            fs.chmodSync(dbFile, 0o644);
            fs.accessSync(dbFile, fs.constants.R_OK | fs.constants.W_OK);
            logger.info(`Fixed database file permissions: ${dbFile}`);
          } catch (fixError) {
            logger.error(`Cannot fix database file permissions: ${dbFile}`, fixError);
            throw new Error(`Database file not accessible and cannot fix permissions: ${dbFile} - ${accessError.message}`);
          }
        }
      }

      // Create database connection with better-sqlite3
      this.db = new Database(dbFile, { verbose: logger.debug });
      logger.info(`Connected to SQLite database: ${dbFile}`);

      // Configure database
      await this.configureDatabase();
      
      // Create tables
      await this.createTables();
      
      this.isInitialized = true;
      logger.info('Database initialization completed successfully');
      return this.db;
    } catch (error) {
      logger.error('Database initialization failed:', error);
      this.isInitialized = false;
      this.db = null;
      throw error;
    }
  }

  async configureDatabase() {
    try {
      // **CRITICAL FIX**: Skip PRAGMA configuration in WSL2 environment
      // WSL2 has file locking issues with SQLite that prevent PRAGMA commands
      logger.warn('Skipping database PRAGMA configuration due to WSL2 compatibility issues');
      logger.info('Database connected in basic mode (no performance optimizations)');
      return Promise.resolve();
    } catch (error) {
      logger.error('Database configuration error:', error);
      throw error;
    }
  }

  async createTables() {
    const tables = [
      // Channels table
      `CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        number INTEGER UNIQUE NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        logo TEXT,
        epg_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Streams table
      `CREATE TABLE IF NOT EXISTS streams (
        id TEXT PRIMARY KEY,
        channel_id TEXT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        backup_urls TEXT, -- JSON array
        auth_username TEXT,
        auth_password TEXT,
        headers TEXT, -- JSON object
        protocol_options TEXT, -- JSON object
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
      )`,

      // EPG sources table
      `CREATE TABLE IF NOT EXISTS epg_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        refresh_interval TEXT DEFAULT '4h',
        last_refresh DATETIME,
        last_success DATETIME,
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // EPG channels table - stores channel display names from XMLTV sources
      `CREATE TABLE IF NOT EXISTS epg_channels (
        epg_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        icon_url TEXT,
        source_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES epg_sources(id) ON DELETE CASCADE
      )`,

      // EPG programs table
      `CREATE TABLE IF NOT EXISTS epg_programs (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        category TEXT,
        episode_number INTEGER,
        season_number INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
      )`,

      // Stream sessions table for monitoring
      `CREATE TABLE IF NOT EXISTS stream_sessions (
        id TEXT PRIMARY KEY,
        stream_id TEXT NOT NULL,
        client_ip TEXT NOT NULL,
        user_agent TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        bytes_transferred INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (stream_id) REFERENCES streams(id)
      )`,

      // Settings table
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT DEFAULT 'string',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Logs table for application events
      `CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        meta TEXT, -- JSON object
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const table of tables) {
      await this.run(table);
    }

    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_epg_channel_time ON epg_programs (channel_id, start_time, end_time)',
      'CREATE INDEX IF NOT EXISTS idx_epg_time ON epg_programs (start_time, end_time)',
      'CREATE INDEX IF NOT EXISTS idx_epg_channels_source ON epg_channels (source_id)',
      'CREATE INDEX IF NOT EXISTS idx_logs_level_time ON logs (level, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs (timestamp)'
    ];

    for (const index of indexes) {
      await this.run(index);
    }

    // Create triggers for updated_at
    const triggers = [
      `CREATE TRIGGER IF NOT EXISTS update_channels_updated_at 
       AFTER UPDATE ON channels
       BEGIN
         UPDATE channels SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
       END`,

      `CREATE TRIGGER IF NOT EXISTS update_streams_updated_at 
       AFTER UPDATE ON streams
       BEGIN
         UPDATE streams SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
       END`,

      `CREATE TRIGGER IF NOT EXISTS update_epg_sources_updated_at 
       AFTER UPDATE ON epg_sources
       BEGIN
         UPDATE epg_sources SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
       END`,

      `CREATE TRIGGER IF NOT EXISTS update_epg_channels_updated_at 
       AFTER UPDATE ON epg_channels
       BEGIN
         UPDATE epg_channels SET updated_at = CURRENT_TIMESTAMP WHERE epg_id = NEW.epg_id;
       END`,

      `CREATE TRIGGER IF NOT EXISTS update_settings_updated_at 
       AFTER UPDATE ON settings
       BEGIN
         UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
       END`
    ];

    for (const trigger of triggers) {
      await this.run(trigger);
    }

    // Initialize default settings
    await this.initializeDefaultSettings();

    logger.info('Database tables, indexes, and triggers created successfully');
  }

  // Database operations with better-sqlite3
  run(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(params);
      return Promise.resolve({ lastID: result.lastInsertRowid, changes: result.changes });
    } catch (err) {
      logger.error('Database run error:', { sql, params, error: err.message });
      return Promise.reject(err);
    }
  }

  get(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      const row = stmt.get(params);
      return Promise.resolve(row);
    } catch (err) {
      logger.error('Database get error:', { sql, params, error: err.message });
      return Promise.reject(err);
    }
  }

  all(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(params);
      return Promise.resolve(rows);
    } catch (err) {
      logger.error('Database all error:', { sql, params, error: err.message });
      return Promise.reject(err);
    }
  }

  // Transaction support
  async transaction(callback) {
    await this.run('BEGIN TRANSACTION');
    try {
      const result = await callback(this);
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  // Cleanup old data
  async cleanup() {
    try {
      // Clean old EPG programs (older than 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await this.run('DELETE FROM epg_programs WHERE end_time < ?', [sevenDaysAgo]);

      // Clean old stream sessions (older than 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await this.run('DELETE FROM stream_sessions WHERE started_at < ?', [thirtyDaysAgo]);

      // Clean old logs (older than 30 days)
      await this.run('DELETE FROM logs WHERE timestamp < ?', [thirtyDaysAgo]);

      // Vacuum database to reclaim space
      await this.run('VACUUM');

      logger.info('Database cleanup completed');
    } catch (error) {
      logger.error('Database cleanup error:', error);
    }
  }

  async recoverDatabase() {
    logger.warn('Attempting database recovery...');
    
    try {
      // Close any existing connection
      if (this.db) {
        this.db.close();
      }
      
      const dbFile = process.env.DB_PATH || config.database.path;
      const backupFile = `${dbFile}.corrupt.${Date.now()}`;
      
      // Move corrupted database file
      if (fs.existsSync(dbFile)) {
        fs.renameSync(dbFile, backupFile);
        logger.info(`Moved corrupted database to: ${backupFile}`);
      }
      
      // Reinitialize the database
      this.isInitialized = false;
      this.db = null;
      
      await this.initializeWithTimeout();
      logger.info('Database recovery completed successfully');
      
    } catch (error) {
      logger.error('Database recovery failed:', error);
      throw error;
    }
  }

  async close() {
    if (this.db && this.isInitialized) {
      try {
        // **WSL2 FIX**: Skip WAL checkpoint in WSL2 environment due to file locking issues
        logger.info('Closing database without WAL checkpoint (WSL2 compatibility)');
        
        // Close the database directly without WAL checkpoint
        this.db.close();
        logger.info('Database connection closed successfully');
      } catch (err) {
        logger.error('Database close error:', err);
      } finally {
        this.isInitialized = false;
        this.db = null;
      }
    } else {
      this.isInitialized = false;
      this.db = null;
    }
    return Promise.resolve();
  }

  // Initialize default settings
  async initializeDefaultSettings() {
    try {
      const config = require('../config');
      
      // Check if settings have been initialized
      const existingSettings = await this.get('SELECT COUNT(*) as count FROM settings WHERE key LIKE "plexlive.%"');
      
      if (existingSettings.count === 0) {
        logger.info('Initializing default Plex Live TV settings...');
        
        // Get default settings from config
        const defaultSettings = config.plexlive || {};
        
        // Recursively insert default settings
        await this.insertSettingsRecursively('plexlive', defaultSettings);
        
        logger.info('Default Plex Live TV settings initialized successfully');
      } else {
        logger.info('Plex Live TV settings already exist, skipping initialization');
      }
      
      // Update any missing settings with new defaults
      await this.updateMissingSettings();
      
    } catch (error) {
      logger.error('Failed to initialize default settings:', error);
      throw error;
    }
  }
  
  // Recursively insert settings into database
  async insertSettingsRecursively(prefix, obj) {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively handle nested objects
        await this.insertSettingsRecursively(fullKey, value);
      } else {
        // Insert leaf values
        let stringValue = value;
        let type = 'string';
        
        if (typeof value === 'number') {
          type = 'number';
          stringValue = value.toString();
        } else if (typeof value === 'boolean') {
          type = 'boolean';
          stringValue = value.toString();
        } else if (Array.isArray(value)) {
          type = 'json';
          stringValue = JSON.stringify(value);
        } else if (typeof value === 'object') {
          type = 'json';
          stringValue = JSON.stringify(value);
        }

        await this.run(`
          INSERT OR IGNORE INTO settings (key, value, type)
          VALUES (?, ?, ?)
        `, [fullKey, stringValue, type]);
      }
    }
  }
  
  // Update any missing settings with new defaults
  async updateMissingSettings() {
    try {
      const config = require('../config');
      const defaultSettings = config.plexlive || {};
      
      // Get all expected setting keys
      const expectedKeys = this.getAllSettingKeys('plexlive', defaultSettings);
      
      // Get existing setting keys
      const existingSettings = await this.all('SELECT key FROM settings WHERE key LIKE "plexlive.%"');
      const existingKeys = existingSettings.map(s => s.key);
      
      // Find missing keys
      const missingKeys = expectedKeys.filter(key => !existingKeys.includes(key));
      
      if (missingKeys.length > 0) {
        logger.info(`Adding ${missingKeys.length} missing settings...`);
        
        for (const key of missingKeys) {
          const value = this.getSettingValueByPath(defaultSettings, key.replace('plexlive.', ''));
          
          if (value !== undefined) {
            let stringValue = value;
            let type = 'string';
            
            if (typeof value === 'number') {
              type = 'number';
              stringValue = value.toString();
            } else if (typeof value === 'boolean') {
              type = 'boolean';
              stringValue = value.toString();
            } else if (Array.isArray(value) || typeof value === 'object') {
              type = 'json';
              stringValue = JSON.stringify(value);
            }

            await this.run(`
              INSERT OR IGNORE INTO settings (key, value, type)
              VALUES (?, ?, ?)
            `, [key, stringValue, type]);
          }
        }
        
        logger.info('Missing settings added successfully');
      }
    } catch (error) {
      logger.error('Failed to update missing settings:', error);
    }
  }
  
  // Get all setting keys recursively
  getAllSettingKeys(prefix, obj) {
    const keys = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        keys.push(...this.getAllSettingKeys(fullKey, value));
      } else {
        keys.push(fullKey);
      }
    }
    
    return keys;
  }
  
  // Get setting value by path
  getSettingValueByPath(obj, path) {
    const pathArray = path.split('.');
    let current = obj;
    
    for (const key of pathArray) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    
    return current;
  }
  
  // Get setting descriptions
  getSettingDescription(key) {
    const descriptions = {
      'plexlive.ssdp.enabled': 'Enable SSDP discovery for Plex integration',
      'plexlive.ssdp.discoverableInterval': 'Interval for SSDP discovery announcements (ms)',
      'plexlive.ssdp.announceInterval': 'Interval between SSDP announcements (ms)',
      'plexlive.ssdp.multicastAddress': 'SSDP multicast address',
      'plexlive.ssdp.deviceDescription': 'Device description for SSDP announcements',
      'plexlive.streaming.maxConcurrentStreams': 'Maximum number of concurrent streams',
      'plexlive.streaming.streamTimeout': 'Stream connection timeout (ms)',
      'plexlive.streaming.reconnectAttempts': 'Number of reconnection attempts',
      'plexlive.streaming.bufferSize': 'Stream buffer size (bytes)',
      'plexlive.streaming.adaptiveBitrate': 'Enable adaptive bitrate streaming',
      'plexlive.streaming.preferredProtocol': 'Preferred streaming protocol',
      'plexlive.transcoding.enabled': 'Enable transcoding for unsupported streams',
      'plexlive.transcoding.hardwareAcceleration': 'Use hardware acceleration for transcoding',
      'plexlive.transcoding.preset': 'FFmpeg transcoding preset',
      'plexlive.transcoding.videoCodec': 'Default video codec for transcoding',
      'plexlive.transcoding.audioCodec': 'Default audio codec for transcoding',
      'plexlive.transcoding.qualityProfiles.low.resolution': 'Low quality profile resolution',
      'plexlive.transcoding.qualityProfiles.low.bitrate': 'Low quality profile bitrate',
      'plexlive.transcoding.qualityProfiles.medium.resolution': 'Medium quality profile resolution',
      'plexlive.transcoding.qualityProfiles.medium.bitrate': 'Medium quality profile bitrate',
      'plexlive.transcoding.qualityProfiles.high.resolution': 'High quality profile resolution',
      'plexlive.transcoding.qualityProfiles.high.bitrate': 'High quality profile bitrate',
      'plexlive.transcoding.defaultProfile': 'Default quality profile',
      'plexlive.caching.enabled': 'Enable stream caching',
      'plexlive.caching.duration': 'Cache duration (seconds)',
      'plexlive.caching.maxSize': 'Maximum cache size (bytes)',
      'plexlive.caching.cleanup.enabled': 'Enable automatic cache cleanup',
      'plexlive.caching.cleanup.interval': 'Cache cleanup interval (ms)',
      'plexlive.caching.cleanup.maxAge': 'Maximum age for cached items (ms)',
      'plexlive.device.name': 'Device name displayed in Plex',
      'plexlive.device.id': 'Unique device identifier',
      'plexlive.device.tunerCount': 'Number of virtual tuners',
      'plexlive.device.firmware': 'Device firmware version',
      'plexlive.device.baseUrl': 'Base URL for device services',
      'plexlive.network.bindAddress': 'Network address to bind to',
      'plexlive.network.advertisedHost': 'Host address advertised to clients',
      'plexlive.network.streamingPort': 'Port for streaming services',
      'plexlive.network.discoveryPort': 'Port for device discovery',
      'plexlive.network.ipv6Enabled': 'Enable IPv6 support',
      'plexlive.compatibility.hdHomeRunMode': 'Enable HDHomeRun compatibility mode',
      'plexlive.compatibility.plexPassRequired': 'Require Plex Pass for access',
      'plexlive.compatibility.gracePeriod': 'Grace period for stream startup (ms)',
      'plexlive.compatibility.channelLogoFallback': 'Enable fallback channel logos'
    };
    
    return descriptions[key] || null;
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.db || !this.isInitialized) {
        return { status: 'unhealthy', error: 'Database not initialized', timestamp: new Date().toISOString() };
      }
      await this.get('SELECT 1 as health');
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

// Handle graceful shutdown - only if database is initialized
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing database...');
  if (databaseService.isInitialized) {
    await databaseService.close();
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing database...');
  if (databaseService.isInitialized) {
    await databaseService.close();
  }
});

// Handle uncaught exceptions - close database before exit
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception:', error);
  if (databaseService.isInitialized) {
    try {
      await databaseService.close();
    } catch (closeError) {
      logger.error('Error closing database during uncaught exception:', closeError);
    }
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  if (databaseService.isInitialized) {
    try {
      await databaseService.close();
    } catch (closeError) {
      logger.error('Error closing database during unhandled rejection:', closeError);
    }
  }
  process.exit(1);
});

module.exports = databaseService;
