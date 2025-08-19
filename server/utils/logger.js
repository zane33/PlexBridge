const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Import localization service (will be loaded after logger is initialized to avoid circular dependency)
let localizationService = null;

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Add colors to winston
winston.addColors(colors);

// Database logger instance (will be initialized later)
let dbLogger = null;

// Create custom format with timezone-aware timestamps
const customFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    // Use localization service for timestamp if available, otherwise fallback to default
    const formattedTimestamp = localizationService 
      ? localizationService.formatLogTimestamp(timestamp)
      : new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19);
    
    let log = `${formattedTimestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Console format with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  customFormat
);

// Create transports
const transports = [];

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: consoleFormat
    })
  );
}

// File transports for all environments
const logDir = config.logging.path || path.join(__dirname, '../../data/logs');

// Ensure log directory exists and is writable
let fileLoggingEnabled = true;
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true, mode: 0o755 });
  }
  fs.accessSync(logDir, fs.constants.W_OK);
} catch (error) {
  console.warn(`Log directory not accessible, disabling file logging: ${error.message}`);
  fileLoggingEnabled = false;
}

if (fileLoggingEnabled) {
  // Application log file
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: config.logging.level,
      format: customFormat,
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      zippedArchive: true,
      handleExceptions: false,
      handleRejections: false
    })
  );

  // Error log file
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: customFormat,
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      zippedArchive: true,
      handleExceptions: false,
      handleRejections: false
    })
  );

  // Stream log file for streaming-specific logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'streams-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      format: customFormat,
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      zippedArchive: true,
      handleExceptions: false,
      handleRejections: false
    })
  );

  // HTTP log file for request logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      format: customFormat,
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      zippedArchive: true,
      handleExceptions: false,
      handleRejections: false
    })
  );
} else {
  // If file logging is disabled, ensure we have console logging
  if (!transports.some(t => t instanceof winston.transports.Console)) {
    transports.push(
      new winston.transports.Console({
        level: config.logging.level,
        format: consoleFormat
      })
    );
  }
}

// Create logger
const logger = winston.createLogger({
  levels,
  level: config.logging.level,
  transports,
  exitOnError: false
});

// Add custom logging methods
logger.stream = function(message, meta = {}) {
  this.info(message, { ...meta, category: 'stream' });
  if (dbLogger) {
    dbLogger.log('info', message, { ...meta, category: 'stream' });
  }
};

// Enhanced stream session logging
logger.streamSession = function(action, sessionData) {
  const message = `Stream session ${action}`;
  const meta = {
    category: 'stream_session',
    action,
    ...sessionData,
    timestamp: new Date().toISOString()
  };
  
  this.info(message, meta);
  if (dbLogger) {
    dbLogger.log('info', message, meta);
  }
  
  // Also emit socket event for real-time log monitoring
  if (global.io) {
    global.io.to('logs').emit('log:new', {
      level: 'info',
      message,
      meta,
      timestamp: new Date().toISOString()
    });
  }
};

logger.security = function(message, meta = {}) {
  this.warn(message, { ...meta, category: 'security' });
  if (dbLogger) {
    dbLogger.log('warn', message, { ...meta, category: 'security' });
  }
};

logger.performance = function(message, meta = {}) {
  this.info(message, { ...meta, category: 'performance' });
  if (dbLogger) {
    dbLogger.log('info', message, { ...meta, category: 'performance' });
  }
};

logger.epg = function(message, meta = {}) {
  this.info(message, { ...meta, category: 'epg' });
  if (dbLogger) {
    dbLogger.log('info', message, { ...meta, category: 'epg' });
  }
};

// Override default logging methods to also log to database
const originalInfo = logger.info.bind(logger);
const originalWarn = logger.warn.bind(logger);
const originalError = logger.error.bind(logger);
const originalDebug = logger.debug.bind(logger);

logger.info = function(message, meta = {}) {
  originalInfo(message, meta);
  if (dbLogger) {
    // Don't await database logging to prevent blocking
    dbLogger.log('info', message, meta).catch(() => {
      // Silently ignore database logging errors to prevent loops
    });
  }
};

logger.warn = function(message, meta = {}) {
  originalWarn(message, meta);
  if (dbLogger) {
    // Don't await database logging to prevent blocking
    dbLogger.log('warn', message, meta).catch(() => {
      // Silently ignore database logging errors to prevent loops
    });
  }
};

logger.error = function(message, meta = {}) {
  originalError(message, meta);
  if (dbLogger) {
    // Don't await database logging to prevent blocking
    dbLogger.log('error', message, meta).catch(() => {
      // Silently ignore database logging errors to prevent loops
    });
  }
};

logger.debug = function(message, meta = {}) {
  originalDebug(message, meta);
  if (dbLogger) {
    // Don't await database logging to prevent blocking
    dbLogger.log('debug', message, meta).catch(() => {
      // Silently ignore database logging errors to prevent loops
    });
  }
};

// Initialize database logger
logger.initDatabaseLogger = function(database) {
  dbLogger = new DatabaseLogger(database);
  logger.info('Database logger initialized');
};

// Get logs from database
logger.getLogs = async function(options = {}) {
  if (dbLogger) {
    return await dbLogger.getLogs(options);
  }
  return [];
};

// Cleanup old logs
logger.cleanupLogs = async function(daysToKeep = 30) {
  if (dbLogger) {
    return await dbLogger.cleanupLogs(daysToKeep);
  }
  return 0;
};

// Database logger for storing logs in SQLite
class DatabaseLogger {
  constructor(database) {
    this.db = database;
  }

  async log(level, message, meta = {}) {
    try {
      if (this.db && this.db.isInitialized) {
        // Ensure message and level are valid strings
        const safeLevel = String(level || 'info').slice(0, 20);
        const safeMessage = String(message || '').slice(0, 2000);
        let safeMeta = '{}';
        
        try {
          safeMeta = JSON.stringify(meta || {}).slice(0, 5000);
        } catch (jsonError) {
          safeMeta = JSON.stringify({ error: 'Failed to serialize meta data' });
        }
        
        await this.db.run(
          'INSERT INTO logs (level, message, meta) VALUES (?, ?, ?)',
          [safeLevel, safeMessage, safeMeta]
        );
      }
    } catch (error) {
      // Avoid circular logging
      console.error('Database logging error:', error.message);
    }
  }

  async getLogs(options = {}) {
    try {
      const {
        level = null,
        limit = 100,
        offset = 0,
        startDate = null,
        endDate = null,
        category = null,
        search = null
      } = options;

      let query = 'SELECT * FROM logs WHERE 1=1';
      const params = [];

      if (level) {
        query += ' AND level = ?';
        params.push(level);
      }

      if (startDate) {
        query += ' AND timestamp >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND timestamp <= ?';
        params.push(endDate);
      }

      if (category) {
        query += ' AND (meta LIKE ? OR message LIKE ?)';
        params.push(`%"category":"${category}"%`, `%${category}%`);
      }

      if (search) {
        query += ' AND (message LIKE ? OR meta LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      return await this.db.all(query, params);
    } catch (error) {
      console.error('Database log retrieval error:', error.message);
      return [];
    }
  }

  async cleanupLogs(daysToKeep = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
      const result = await this.db.run(
        'DELETE FROM logs WHERE timestamp < ?',
        [cutoffDate]
      );
      return result.changes;
    } catch (error) {
      console.error('Database log cleanup error:', error.message);
      return 0;
    }
  }
}

// Initialize localization service for timestamp formatting
logger.initLocalizationService = function() {
  try {
    localizationService = require('./localization');
    logger.info('Localization service initialized for logger timestamps');
  } catch (error) {
    logger.warn('Failed to initialize localization service for logger:', error.message);
  }
};

// Update localization settings
logger.updateLocalizationSettings = function(settings) {
  if (localizationService) {
    localizationService.updateSettings(settings);
    logger.info('Logger localization settings updated');
  }
};

// Export logger and database logger class
module.exports = logger;
module.exports.DatabaseLogger = DatabaseLogger;
