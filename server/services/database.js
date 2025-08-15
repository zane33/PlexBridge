const sqlite3 = require('sqlite3').verbose();
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
      // Ensure database directory exists with proper permissions
      const dbDir = path.dirname(config.database.path);
      const dbFile = config.database.path;
      
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
          logger.error(`Database file exists but is not accessible: ${dbFile}`, accessError);
          throw new Error(`Database file not accessible: ${dbFile} - ${accessError.message}`);
        }
      }

      // Create database connection with promise wrapper
      this.db = await new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbFile, (err) => {
          if (err) {
            logger.error('Database connection error:', err);
            reject(new Error(`Database connection failed: ${err.message}`));
          } else {
            logger.info(`Connected to SQLite database: ${dbFile}`);
            resolve(db);
          }
        });
      });

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
    return new Promise((resolve, reject) => {
      const options = config.database.options;
      
      this.db.serialize(() => {
        // Set pragmas for performance and reliability
        this.db.run(`PRAGMA journal_mode = ${options.journalMode}`);
        this.db.run(`PRAGMA synchronous = ${options.synchronous}`);
        this.db.run(`PRAGMA cache_size = ${options.cacheSize}`);
        this.db.run(`PRAGMA busy_timeout = ${options.busyTimeout}`);
        this.db.run('PRAGMA foreign_keys = ON');
        this.db.run('PRAGMA temp_store = MEMORY');
        
        resolve();
      });
    });
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

      `CREATE TRIGGER IF NOT EXISTS update_settings_updated_at 
       AFTER UPDATE ON settings
       BEGIN
         UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
       END`
    ];

    for (const trigger of triggers) {
      await this.run(trigger);
    }

    logger.info('Database tables, indexes, and triggers created successfully');
  }

  // Promisify database operations
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('Database run error:', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          logger.error('Database get error:', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Database all error:', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
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

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            logger.error('Database close error:', err);
          } else {
            logger.info('Database connection closed');
          }
          this.isInitialized = false;
          resolve();
        });
      });
    }
  }

  // Health check
  async healthCheck() {
    try {
      await this.get('SELECT 1 as health');
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService;
