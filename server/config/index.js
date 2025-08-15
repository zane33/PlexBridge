const path = require('path');
const fs = require('fs');

// Determine base data directory
const getDataDir = () => {
  // In Docker, use /data if it exists and is writable, otherwise use local data directory
  const dockerDataDir = '/data';
  const localDataDir = path.join(__dirname, '../../data');
  
  try {
    if (fs.existsSync(dockerDataDir) && fs.statSync(dockerDataDir).isDirectory()) {
      // Test if we can write to the directory
      fs.accessSync(dockerDataDir, fs.constants.W_OK);
      return dockerDataDir;
    }
  } catch (error) {
    // Docker directory not accessible or not writable, fall back to local
    console.log(`Docker data directory not accessible, using local: ${error.message}`);
  }
  
  return localDataDir;
};

const dataDir = process.env.DATA_PATH || getDataDir();

// Default configuration
const defaultConfig = {
  server: {
    port: process.env.PORT || 8080,
    host: '0.0.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  database: {
    // Ensure database path always uses the resolved data directory
    path: process.env.DB_PATH || path.join(dataDir, 'database', 'plextv.db'),
    options: {
      busyTimeout: 30000,
      synchronous: 'NORMAL',
      journalMode: 'WAL',
      cacheSize: -64000 // 64MB cache
    }
  },
  cache: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    ttl: {
      epg: parseInt(process.env.EPG_CACHE_TTL) || 3600, // 1 hour
      streams: parseInt(process.env.STREAM_CACHE_TTL) || 300, // 5 minutes
      api: parseInt(process.env.API_CACHE_TTL) || 60 // 1 minute
    }
  },
  ssdp: {
    port: process.env.SSDP_PORT || 1900,
    deviceUuid: process.env.DEVICE_UUID || generateUUID(),
    friendlyName: process.env.FRIENDLY_NAME || 'PlexTV',
    manufacturer: 'PlexTV',
    modelName: 'PlexTV Bridge',
    modelNumber: '1.0',
    description: 'IPTV to Plex Bridge Interface'
  },
  streams: {
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10,
    transcodeEnabled: process.env.TRANSCODE_ENABLED === 'true',
    ffmpegPath: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
    supportedFormats: (process.env.SUPPORTED_FORMATS || 'hls,dash,rtsp,rtmp,udp,http,mms,srt').split(','),
    autoDetectFormat: process.env.AUTO_DETECT_FORMAT !== 'false',
    timeout: parseInt(process.env.STREAM_TIMEOUT) || 30000,
    reconnectAttempts: parseInt(process.env.RECONNECT_ATTEMPTS) || 3,
    bufferSize: parseInt(process.env.STREAM_BUFFER_SIZE) || 65536
  },
  protocols: {
    rtsp: {
      transport: process.env.RTSP_TRANSPORT || 'tcp',
      timeout: parseInt(process.env.RTSP_TIMEOUT) || 10000,
      port: parseInt(process.env.RTSP_PORT) || 554
    },
    udp: {
      bufferSize: parseInt(process.env.UDP_BUFFER_SIZE) || 65536,
      timeout: parseInt(process.env.UDP_TIMEOUT) || 5000
    },
    http: {
      userAgent: process.env.HTTP_USER_AGENT || 'PlexTV/1.0',
      timeout: parseInt(process.env.HTTP_TIMEOUT) || 30000,
      followRedirects: process.env.HTTP_FOLLOW_REDIRECTS !== 'false'
    },
    srt: {
      latency: parseInt(process.env.SRT_LATENCY) || 120,
      encryption: process.env.SRT_ENCRYPTION || 'none'
    }
  },
  epg: {
    refreshInterval: process.env.EPG_REFRESH_INTERVAL || '4h',
    cacheTtl: parseInt(process.env.EPG_CACHE_TTL) || 3600,
    maxFileSize: parseInt(process.env.EPG_MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100MB
    timeout: parseInt(process.env.EPG_TIMEOUT) || 60000
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    path: process.env.LOG_PATH || path.join(dataDir, 'logs'),
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 30,
    maxSize: process.env.LOG_MAX_SIZE || '100m'
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || generateRandomString(64),
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 86400, // 24 hours
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 1000,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000 // 15 minutes
  },
  paths: {
    data: dataDir,
    cache: process.env.CACHE_PATH || path.join(dataDir, 'cache'),
    logs: process.env.LOG_PATH || path.join(dataDir, 'logs'),
    database: process.env.DB_PATH || path.join(dataDir, 'database'),
    logos: process.env.LOGOS_PATH || path.join(dataDir, 'logos')
  }
};

// Helper functions
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Load custom configuration if exists
function loadCustomConfig() {
  const configPaths = [
    path.join(__dirname, '../../config/local.json'),
    path.join(__dirname, '../../config/production.json'),
    path.join(__dirname, '../../config/default.json')
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return deepMerge(defaultConfig, customConfig);
      } catch (error) {
        console.warn(`Failed to load config from ${configPath}:`, error.message);
      }
    }
  }

  return defaultConfig;
}

// Deep merge utility
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

// Create necessary directories with proper error handling
function ensureDirectories(config) {
  // Only create actual directory paths, not file paths
  const dirs = Object.values(config.paths);
  
  // Also ensure the database directory specifically exists (extract directory from file path)
  const dbDir = path.dirname(config.database.path);
  if (!dirs.includes(dbDir)) {
    dirs.push(dbDir);
  }
  
  dirs.forEach(dir => {
    try {
      // Skip if this looks like a file path (contains extension)
      if (path.extname(dir)) {
        console.warn(`Skipping file path in directory creation: ${dir}`);
        return;
      }
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
        console.log(`Created directory: ${dir}`);
      }
      
      // Verify directory is writable
      fs.accessSync(dir, fs.constants.W_OK);
    } catch (error) {
      console.error(`Failed to create/access directory ${dir}:`, error.message);
      // Don't throw here, let the application try to start
      // Services will handle individual directory failures
    }
  });
  
  // Ensure the database directory specifically exists
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true, mode: 0o755 });
      console.log(`Created database directory: ${dbDir}`);
    }
    fs.accessSync(dbDir, fs.constants.W_OK);
  } catch (error) {
    console.error(`Failed to create/access database directory ${dbDir}:`, error.message);
  }
}

// Initialize configuration
const config = loadCustomConfig();
ensureDirectories(config);

module.exports = config;
