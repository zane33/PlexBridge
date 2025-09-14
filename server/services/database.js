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
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.healthCheckInterval = null;
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
      
      // Additional production optimizations
      this.db.pragma('busy_timeout = 5000'); // Wait up to 5 seconds for locks
      this.db.pragma('wal_autocheckpoint = 1000'); // Auto-checkpoint every 1000 pages
      this.db.pragma('mmap_size = 30000000000'); // Use memory-mapped I/O (30GB)
      
      // Set connection pool settings
      this.db.pragma('max_page_count = 2147483646'); // Maximum database size
      this.db.pragma('locking_mode = NORMAL'); // Normal locking for multi-process
      
      // Create tables if they don't exist
      await this.createTables();
      
      // Initialize default settings
      await this.initializeDefaultSettings();
      
      // Add enhanced encoding support
      await this.initializeEnhancedEncoding();
      
      this.isInitialized = true;
      this.reconnectAttempts = 0;
      
      // Start health check monitoring
      this.startHealthMonitoring();
      
      // Test write permissions immediately
      await this.verifyWritePermissions();
      
      logger.info('Real database initialized successfully with production settings');
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
  async run(sql, params = []) {
    try {
      if (!this.db || !this.isInitialized) {
        await this.reconnect();
      }
      
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      
      // Enhanced logging for save operations (avoid database logging to prevent loops)
      if (sql.toLowerCase().includes('insert') || sql.toLowerCase().includes('update')) {
        console.log('Database save operation successful:', {
          sql: sql.substring(0, 100),
          affectedRows: result.changes,
          lastInsertRowid: result.lastInsertRowid
        });
      }
      
      return Promise.resolve(result);
    } catch (err) {
      // Enhanced error logging with file permissions check
      const errorDetails = {
        sql: sql.substring(0, 100),
        error: err.message,
        code: err.code,
        errno: err.errno,
        isWriteOperation: sql.toLowerCase().includes('insert') || sql.toLowerCase().includes('update') || sql.toLowerCase().includes('delete')
      };
      
      // Check for permission errors specifically (use console.error to avoid logging loops)
      if (err.message.includes('SQLITE_READONLY') || err.message.includes('SQLITE_CANTOPEN') || err.message.includes('attempt to write a readonly database')) {
        console.error('🚨 CRITICAL: Database file permission error detected!', {
          ...errorDetails,
          dbPath: this.dbPath,
          suggestion: 'Check database file permissions - likely owned by Docker user (1001) but accessed by different user'
        });
      } else {
        console.error('Database run error:', errorDetails);
      }
      
      // Attempt reconnection on certain errors
      if (this.isConnectionError(err)) {
        await this.reconnect();
        // Retry once after reconnection
        try {
          const stmt = this.db.prepare(sql);
          const result = stmt.run(...params);
          return Promise.resolve(result);
        } catch (retryErr) {
          logger.error('Database run retry failed:', retryErr.message);
          return Promise.reject(retryErr);
        }
      }
      
      return Promise.reject(err);
    }
  }

  async get(sql, params = []) {
    try {
      if (!this.db || !this.isInitialized) {
        await this.reconnect();
      }
      
      const stmt = this.db.prepare(sql);
      const result = stmt.get(...params);
      return Promise.resolve(result);
    } catch (err) {
      logger.error('Database get error:', { sql: sql.substring(0, 100), error: err.message });
      
      // Attempt reconnection on certain errors
      if (this.isConnectionError(err)) {
        await this.reconnect();
        // Retry once after reconnection
        try {
          const stmt = this.db.prepare(sql);
          const result = stmt.get(...params);
          return Promise.resolve(result);
        } catch (retryErr) {
          logger.error('Database get retry failed:', retryErr.message);
          return Promise.reject(retryErr);
        }
      }
      
      return Promise.reject(err);
    }
  }

  async all(sql, params = []) {
    try {
      if (!this.db || !this.isInitialized) {
        await this.reconnect();
      }
      
      const stmt = this.db.prepare(sql);
      const result = stmt.all(...params);
      return Promise.resolve(result);
    } catch (err) {
      logger.error('Database all error:', { sql: sql.substring(0, 100), error: err.message });
      
      // Attempt reconnection on certain errors
      if (this.isConnectionError(err)) {
        await this.reconnect();
        // Retry once after reconnection
        try {
          const stmt = this.db.prepare(sql);
          const result = stmt.all(...params);
          return Promise.resolve(result);
        } catch (retryErr) {
          logger.error('Database all retry failed:', retryErr.message);
          return Promise.reject(retryErr);
        }
      }
      
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

      // Add type column to settings table if it doesn't exist
      try {
        this.db.prepare('ALTER TABLE settings ADD COLUMN type TEXT DEFAULT "string"').run();
        logger.info('Added type column to settings table');
      } catch (error) {
        // Column already exists, ignore error
        logger.info('type column already exists in settings table');
      }

      // Create epg_sources table
      const createEpgSourcesTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS epg_sources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          refresh_interval TEXT DEFAULT '4h',
          enabled INTEGER DEFAULT 1,
          last_refresh DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      createEpgSourcesTable.run();
      
      // Add last_refresh column if it doesn't exist
      try {
        this.db.prepare('ALTER TABLE epg_sources ADD COLUMN last_refresh DATETIME').run();
      } catch (error) {
        // Column already exists, ignore error
        logger.info('last_refresh column already exists in epg_sources table');
      }

      // Add last_error column if it doesn't exist
      try {
        this.db.prepare('ALTER TABLE epg_sources ADD COLUMN last_error TEXT').run();
      } catch (error) {
        // Column already exists, ignore error
        logger.info('last_error column already exists in epg_sources table');
      }

      // Add last_success column if it doesn't exist
      try {
        this.db.prepare('ALTER TABLE epg_sources ADD COLUMN last_success DATETIME').run();
      } catch (error) {
        // Column already exists, ignore error
        logger.info('last_success column already exists in epg_sources table');
      }

      // Add category column if it doesn't exist for Plex EPG categories
      try {
        this.db.prepare('ALTER TABLE epg_sources ADD COLUMN category TEXT').run();
        logger.info('Added category column to epg_sources table');
      } catch (error) {
        // Column already exists, ignore error
        logger.info('category column already exists in epg_sources table');
      }

      // Add secondary_genres column if it doesn't exist for custom secondary genres
      try {
        this.db.prepare('ALTER TABLE epg_sources ADD COLUMN secondary_genres TEXT').run();
        logger.info('Added secondary_genres column to epg_sources table');
      } catch (error) {
        // Column already exists, ignore error
        logger.info('secondary_genres column already exists in epg_sources table');
      }

      // **CRITICAL FIX**: Drop and recreate epg_programs table without foreign key constraint
      // The foreign key constraint was preventing programs from being stored because
      // channel_id contains EPG channel IDs, not internal channel table IDs
      try {
        // Check if table exists and has foreign key constraint
        const tableInfo = this.db.prepare("PRAGMA table_info(epg_programs)").all();
        const foreignKeys = this.db.prepare("PRAGMA foreign_key_list(epg_programs)").all();
        
        if (foreignKeys.length > 0) {
          logger.info('Migrating epg_programs table to remove foreign key constraint');
          
          // Create backup
          this.db.prepare(`
            CREATE TABLE IF NOT EXISTS epg_programs_backup AS 
            SELECT * FROM epg_programs
          `).run();
          
          // Drop existing table
          this.db.prepare('DROP TABLE epg_programs').run();
          
          // Recreate without foreign key
          this.db.prepare(`
            CREATE TABLE epg_programs (
              id TEXT PRIMARY KEY,
              channel_id TEXT,
              title TEXT NOT NULL,
              description TEXT,
              start_time DATETIME NOT NULL,
              end_time DATETIME NOT NULL,
              category TEXT,
              episode_number TEXT,
              season_number TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `).run();
          
          // Restore data
          this.db.prepare(`
            INSERT INTO epg_programs 
            SELECT * FROM epg_programs_backup
          `).run();
          
          // Drop backup
          this.db.prepare('DROP TABLE epg_programs_backup').run();
          
          logger.info('✅ EPG programs table migration completed successfully');
        }
      } catch (migrationError) {
        logger.warn('EPG programs table migration failed (table may not exist yet):', migrationError.message);
      }

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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

      // Migration: Add enhanced monitoring fields to stream_sessions table
      try {
        // Add new columns for enhanced stream monitoring
        const addColumns = [
          'ALTER TABLE stream_sessions ADD COLUMN client_hostname TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN client_identifier TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN channel_name TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN channel_number INTEGER',
          'ALTER TABLE stream_sessions ADD COLUMN stream_url TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN stream_type TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN duration_ms INTEGER DEFAULT 0',
          'ALTER TABLE stream_sessions ADD COLUMN current_bitrate INTEGER DEFAULT 0',
          'ALTER TABLE stream_sessions ADD COLUMN avg_bitrate INTEGER DEFAULT 0',
          'ALTER TABLE stream_sessions ADD COLUMN peak_bitrate INTEGER DEFAULT 0',
          'ALTER TABLE stream_sessions ADD COLUMN error_count INTEGER DEFAULT 0',
          'ALTER TABLE stream_sessions ADD COLUMN end_reason TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN last_update DATETIME DEFAULT CURRENT_TIMESTAMP',
          // Enhanced Plex session tracking fields
          'ALTER TABLE stream_sessions ADD COLUMN plex_client_id TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN plex_client_name TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN plex_username TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN plex_device TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN plex_device_name TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN unique_client_id TEXT',
          'ALTER TABLE stream_sessions ADD COLUMN display_name TEXT'
        ];

        addColumns.forEach(sql => {
          try {
            this.db.prepare(sql).run();
          } catch (error) {
            // Column might already exist, ignore duplicate column errors
            if (!error.message.includes('duplicate column name')) {
              logger.warn('Failed to add column to stream_sessions:', error.message);
            }
          }
        });
        
        logger.info('✅ Stream sessions table migration completed successfully');
      } catch (migrationError) {
        logger.warn('Stream sessions table migration failed:', migrationError.message);
      }

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

      // Create FFmpeg profiles tables
      const createFFmpegProfilesTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS ffmpeg_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          is_default INTEGER DEFAULT 0,
          is_system INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      createFFmpegProfilesTable.run();

      // Create FFmpeg profile client configurations table
      const createFFmpegProfileClientsTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS ffmpeg_profile_clients (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL,
          client_type TEXT NOT NULL,
          ffmpeg_args TEXT NOT NULL,
          hls_args TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (profile_id) REFERENCES ffmpeg_profiles (id) ON DELETE CASCADE,
          UNIQUE(profile_id, client_type)
        )
      `);
      createFFmpegProfileClientsTable.run();

      // Add ffmpeg_profile_id to streams table if it doesn't exist
      try {
        this.db.prepare('ALTER TABLE streams ADD COLUMN ffmpeg_profile_id TEXT').run();
        logger.info('Added ffmpeg_profile_id column to streams table');
      } catch (error) {
        // Column already exists, ignore error
        if (!error.message.includes('duplicate column name')) {
          logger.warn('Failed to add ffmpeg_profile_id to streams:', error.message);
        }
      }

      // Create android_tv_sessions table for enhanced session management
      const createAndroidTVSessionsTable = this.db.prepare(`
        CREATE TABLE IF NOT EXISTS android_tv_sessions (
          session_id TEXT PRIMARY KEY,
          channel_id TEXT,
          stream_url TEXT,
          client_info TEXT,
          plex_session_id TEXT,
          consumer_session_id TEXT,
          start_time INTEGER,
          end_time INTEGER,
          status TEXT DEFAULT 'active',
          healthy INTEGER DEFAULT 1,
          error_count INTEGER DEFAULT 0,
          consecutive_failures INTEGER DEFAULT 0,
          url_renewal_count INTEGER DEFAULT 0,
          ffmpeg_restart_count INTEGER DEFAULT 0,
          is_android_tv INTEGER DEFAULT 0,
          extended_session INTEGER DEFAULT 0,
          proactive_management INTEGER DEFAULT 0,
          total_uptime INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      createAndroidTVSessionsTable.run();

      // Add connection_limits column to streams table if it doesn't exist
      try {
        this.db.prepare('ALTER TABLE streams ADD COLUMN connection_limits INTEGER DEFAULT 0').run();
        logger.info('Added connection_limits column to streams table');
      } catch (error) {
        // Column already exists, ignore error
        logger.info('connection_limits column already exists in streams table');
      }

      logger.info('Database tables created successfully (including Android TV sessions)');
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
        ['plexlive.localization.locale', 'en-US', 'Default locale'],
        ['plexlive.device.name', 'PlexBridge HDHomeRun', 'Device name displayed in Plex'],
        ['plexlive.transcoding.mpegts.ffmpegArgs', '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1', 'Optimized FFmpeg arguments for maximum compatibility and performance'],
        ['plexlive.transcoding.mpegts.transcodingArgs', '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 10 -reconnect_on_network_error 1 -reconnect_on_http_error 4xx,5xx -rtbufsize 2M -probesize 5M -analyzeduration 10000000 -thread_queue_size 2048 -i [URL] -c:v libx264 -preset veryfast -profile:v main -level 3.1 -pix_fmt yuv420p -b:v 2000k -maxrate 3000k -bufsize 6000k -g 60 -keyint_min 30 -sc_threshold 0 -x264opts keyint=60:min-keyint=30:scenecut=0:nal-hrd=cbr:force-cfr=1 -c:a aac -b:a 128k -ar 48000 -ac 2 -bsf:v h264_mp4toannexb,dump_extra -f mpegts -mpegts_copyts 1 -mpegts_start_pid 0x100 -mpegts_pmt_start_pid 0x1000 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -max_muxing_queue_size 9999 -muxdelay 0 -muxpreload 0 -flush_packets 1 pipe:1', 'Enhanced FFmpeg arguments for H.264/AAC transcoding with Android TV ExoPlayer parameter set compatibility and CBR encoding'],
        ['plexlive.transcoding.androidtv.transcodingArgs', '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 5 -i [URL] -c:v libx264 -preset superfast -tune zerolatency -profile:v main -level 3.1 -pix_fmt yuv420p -b:v 2000k -maxrate 2500k -bufsize 2000k -g 30 -keyint_min 15 -sc_threshold 0 -x264opts keyint=30:min-keyint=15:scenecut=0:nal-hrd=cbr:force-cfr=1:repeat-headers=1:aud=1:sps-id=0:pps-id=0 -c:a aac -b:a 128k -ar 48000 -ac 2 -bsf:v h264_mp4toannexb,dump_extra -f mpegts -mpegts_copyts 1 -mpegts_start_pid 0x100 -mpegts_pmt_start_pid 0x1000 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt+nobuffer -flags +low_delay -max_muxing_queue_size 9999 -muxdelay 0 -muxpreload 0 -flush_packets 1 -rtbufsize 256k pipe:1', 'Android TV optimized transcoding with aggressive SPS/PPS handling, parameter set repetition, and ExoPlayer compatibility fixes'],
        ['plexlive.transcoding.androidtv.ffmpegArgs', '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1', 'Optimized FFmpeg arguments for Android TV'],
        ['plexlive.transcoding.mpegts.hlsProtocolArgs', '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto', 'Default HLS protocol arguments for FFmpeg'],
        ['plexlive.streaming.upstreamMonitoring.enabled', 'true', 'Enable upstream reliability monitoring'],
        ['plexlive.streaming.upstreamMonitoring.bufferThresholdMB', '5', 'Buffer size threshold in MB for upstream issues'],
        ['plexlive.streaming.upstreamMonitoring.reconnectTimeoutSec', '30', 'Maximum time to wait for upstream reconnection'],
        ['plexlive.streaming.adaptiveBuffering.enabled', 'true', 'Enable adaptive buffering based on upstream quality'],
        ['plexlive.streaming.adaptiveBuffering.maxBufferMB', '10', 'Maximum buffer size for unstable upstream sources'],
        
        // Stream resilience configuration for H.264 corruption handling
        ['plexlive.streaming.resilience.enabled', 'true', 'Enable advanced stream resilience and error recovery'],
        ['plexlive.streaming.resilience.level', 'standard', 'Resilience level: standard, enhanced, maximum, corruption_tolerant, continuity_priority'],
        ['plexlive.streaming.resilience.h264CorruptionTolerance', 'maximum', 'H.264 corruption tolerance: ignore, basic, maximum'],
        ['plexlive.streaming.resilience.errorRecoveryMode', 'smart', 'Error recovery mode: smart, aggressive, conservative'],
        ['plexlive.streaming.resilience.continuousBuffering', 'true', 'Maintain continuous buffering during upstream issues'],
        ['plexlive.streaming.resilience.maxCorruptionRetries', '3', 'Maximum retry attempts specifically for H.264 corruption'],
        ['plexlive.streaming.resilience.corruptionRecoveryDelay', '2000', 'Delay in milliseconds before retrying after H.264 corruption'],
        ['plexlive.streaming.resilience.seamlessFailoverMs', '3000', 'Time to maintain seamless output during failover (ms)'],
        ['plexlive.streaming.resilience.bufferSizeDuringCorruption', '25000', 'Buffer size in milliseconds during H.264 corruption events']
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

  async initializeEnhancedEncoding() {
    try {
      const { addEnhancedEncodingSupport } = require('../utils/enhancedEncoding');
      await addEnhancedEncodingSupport(this.db);
      logger.info('Enhanced encoding support initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize enhanced encoding support:', error);
      // Don't throw error, just warn - this is not critical for basic functionality
    }
  }

  // Transaction support
  transaction(callback) {
    try {
      if (!this.db || !this.isInitialized) {
        throw new Error('Database not initialized');
      }
      
      // better-sqlite3 transactions are synchronous
      const transactionFn = this.db.transaction(callback);
      const result = transactionFn();
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Check if error is connection-related
  isConnectionError(err) {
    if (!err) return false;
    const message = err.message || '';
    return message.includes('SQLITE_BUSY') ||
           message.includes('SQLITE_LOCKED') ||
           message.includes('SQLITE_CANTOPEN') ||
           message.includes('SQLITE_CORRUPT') ||
           message.includes('SQLITE_READONLY') ||
           message.includes('database is locked') ||
           message.includes('no such table') ||
           message.includes('attempt to write a readonly database');
  }

  // Reconnect to database
  async reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, giving up');
      throw new Error('Database connection failed permanently');
    }

    this.reconnectAttempts++;
    logger.warn(`Attempting database reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    try {
      // Close existing connection if any
      if (this.db) {
        try {
          this.db.close();
        } catch (closeErr) {
          logger.warn('Error closing database during reconnect:', closeErr.message);
        }
      }

      // Wait before reconnecting
      await new Promise(resolve => setTimeout(resolve, this.reconnectDelay * this.reconnectAttempts));

      // Re-initialize
      this.db = null;
      this.isInitialized = false;
      await this.initialize();
      
      logger.info('Database reconnection successful');
      this.reconnectAttempts = 0;
    } catch (error) {
      logger.error('Database reconnection failed:', error.message);
      throw error;
    }
  }

  // Start health monitoring
  startHealthMonitoring() {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.healthCheck();
        if (health.status === 'unhealthy') {
          logger.warn('Database health check failed:', health.error);
          
          // Attempt to reconnect if unhealthy
          if (this.isInitialized) {
            await this.reconnect();
          }
        }
      } catch (error) {
        logger.error('Health monitoring error:', error.message);
      }
    }, 60000); // Check every minute
  }

  // Stop health monitoring
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
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
    // Stop health monitoring first
    this.stopHealthMonitoring();
    
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

  // Verify write permissions
  async verifyWritePermissions() {
    try {
      console.log('🔍 Verifying database write permissions...');
      
      // Test write by creating and deleting a test record
      const testId = 'write-test-' + Date.now();
      
      await this.run(
        'INSERT INTO settings (key, value, description) VALUES (?, ?, ?)',
        [testId, 'test-value', 'Write permission test']
      );
      
      const testRecord = await this.get('SELECT * FROM settings WHERE key = ?', [testId]);
      
      if (!testRecord) {
        throw new Error('Write test failed - record not found after insert');
      }
      
      await this.run('DELETE FROM settings WHERE key = ?', [testId]);
      
      console.log('✅ Database write permissions verified successfully');
      
    } catch (error) {
      console.error('🚨 CRITICAL: Database write permission verification failed!', {
        error: error.message,
        dbPath: this.dbPath,
        suggestion: 'Run: sudo chown -R $(whoami):$(whoami) ' + path.dirname(this.dbPath)
      });
      throw new Error(`Database write permissions failed: ${error.message}`);
    }
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
