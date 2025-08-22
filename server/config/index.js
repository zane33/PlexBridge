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
    port: parseInt(process.env.HTTP_PORT) || parseInt(process.env.PORT) || 3000,
    host: process.env.HOST_IP || process.env.BIND_ADDRESS || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  database: {
    // Ensure database path always uses the resolved data directory
    // Environment variable DB_PATH takes absolute precedence
    path: process.env.DB_PATH || path.join(dataDir, 'database', 'plextv.db'),
    options: {
      busyTimeout: 30000,
      synchronous: 'NORMAL',
      journalMode: 'WAL',
      cacheSize: -64000 // 64MB cache
    }
  },
  cache: {
    host: process.env.REDIS_HOST === 'localhost' ? '127.0.0.1' : (process.env.REDIS_HOST || '127.0.0.1'),
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
  },
  plexlive: {
    ssdp: {
      enabled: process.env.SSDP_ENABLED !== 'false',
      discoverableInterval: parseInt(process.env.SSDP_DISCOVERABLE_INTERVAL) || 30000,
      announceInterval: parseInt(process.env.SSDP_ANNOUNCE_INTERVAL) || 1800000,
      multicastAddress: process.env.SSDP_MULTICAST_ADDRESS || '239.255.255.250',
      deviceDescription: process.env.SSDP_DEVICE_DESCRIPTION || 'IPTV to Plex Bridge Interface'
    },
    streaming: {
      maxConcurrentStreams: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10,
      streamTimeout: parseInt(process.env.STREAM_TIMEOUT) || 30000,
      reconnectAttempts: parseInt(process.env.RECONNECT_ATTEMPTS) || 3,
      bufferSize: parseInt(process.env.STREAM_BUFFER_SIZE) || 65536,
      adaptiveBitrate: process.env.ADAPTIVE_BITRATE !== 'false',
      preferredProtocol: process.env.PREFERRED_PROTOCOL || 'hls'
    },
    transcoding: {
      enabled: process.env.TRANSCODE_ENABLED !== 'false',
      hardwareAcceleration: process.env.HW_ACCELERATION === 'true',
      preset: process.env.TRANSCODE_PRESET || 'medium',
      videoCodec: process.env.VIDEO_CODEC || 'h264',
      audioCodec: process.env.AUDIO_CODEC || 'aac',
      qualityProfiles: {
        low: {
          resolution: process.env.LOW_RESOLUTION || '720x480',
          bitrate: process.env.LOW_BITRATE || '1000k'
        },
        medium: {
          resolution: process.env.MEDIUM_RESOLUTION || '1280x720',
          bitrate: process.env.MEDIUM_BITRATE || '2500k'
        },
        high: {
          resolution: process.env.HIGH_RESOLUTION || '1920x1080',
          bitrate: process.env.HIGH_BITRATE || '5000k'
        }
      },
      defaultProfile: process.env.DEFAULT_QUALITY_PROFILE || 'medium'
    },
    caching: {
      enabled: process.env.CACHE_ENABLED !== 'false',
      duration: parseInt(process.env.CACHE_DURATION) || 3600,
      maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1073741824, // 1GB
      cleanup: {
        enabled: process.env.CACHE_CLEANUP_ENABLED !== 'false',
        interval: parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 3600000, // 1 hour
        maxAge: parseInt(process.env.CACHE_MAX_AGE) || 86400000 // 24 hours
      }
    },
    device: {
      name: process.env.DEVICE_NAME || 'PlexTV',
      id: process.env.DEVICE_ID || 'PLEXTV001',
      tunerCount: parseInt(process.env.TUNER_COUNT) || 4,
      firmware: process.env.FIRMWARE_VERSION || '1.0.0',
      baseUrl: process.env.BASE_URL || `http://${process.env.ADVERTISED_HOST || 'localhost'}:${process.env.HTTP_PORT || process.env.PORT || 3000}`
    },
    network: {
      bindAddress: process.env.HOST_IP || process.env.BIND_ADDRESS || '0.0.0.0',
      advertisedHost: process.env.ADVERTISED_HOST || null,
      streamingPort: parseInt(process.env.STREAM_PORT) || parseInt(process.env.STREAMING_PORT) || parseInt(process.env.HTTP_PORT) || parseInt(process.env.PORT) || 3000,
      discoveryPort: parseInt(process.env.DISCOVERY_PORT) || parseInt(process.env.SSDP_PORT) || 1900,
      ipv6Enabled: process.env.IPV6_ENABLED === 'true'
    },
    compatibility: {
      hdHomeRunMode: process.env.HDHOMERUN_MODE !== 'false',
      plexPassRequired: process.env.PLEX_PASS_REQUIRED === 'true',
      gracePeriod: parseInt(process.env.GRACE_PERIOD) || 10000,
      channelLogoFallback: process.env.CHANNEL_LOGO_FALLBACK !== 'false'
    }
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

  let mergedConfig = defaultConfig;

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // Merge file config with defaults, but environment variables (in defaultConfig) take precedence
        mergedConfig = deepMerge(mergedConfig, customConfig);
      } catch (error) {
        console.warn(`Failed to load config from ${configPath}:`, error.message);
      }
    }
  }

  // Apply environment variable overrides again to ensure they take precedence over file configs
  const envOverrides = {
    server: {
      port: parseInt(process.env.HTTP_PORT) || parseInt(process.env.PORT) || mergedConfig.server.port,
      host: process.env.HOST_IP || process.env.BIND_ADDRESS || mergedConfig.server.host,
      environment: process.env.NODE_ENV || mergedConfig.server.environment
    },
    database: {
      ...mergedConfig.database,
      path: process.env.DB_PATH || mergedConfig.database.path
    },
    plexlive: {
      ...mergedConfig.plexlive,
      network: {
        ...mergedConfig.plexlive.network,
        bindAddress: process.env.HOST_IP || process.env.BIND_ADDRESS || mergedConfig.plexlive.network.bindAddress,
        // Priority: Environment variable (if set) > Config file > Auto-detect
        // Note: Database settings will override this at runtime via settingsService
        advertisedHost: process.env.ADVERTISED_HOST || mergedConfig.plexlive.network.advertisedHost,
        streamingPort: parseInt(process.env.STREAM_PORT) || parseInt(process.env.STREAMING_PORT) || parseInt(process.env.HTTP_PORT) || parseInt(process.env.PORT) || mergedConfig.plexlive.network.streamingPort,
        discoveryPort: parseInt(process.env.DISCOVERY_PORT) || parseInt(process.env.SSDP_PORT) || mergedConfig.plexlive.network.discoveryPort,
        ipv6Enabled: process.env.IPV6_ENABLED === 'true' || mergedConfig.plexlive.network.ipv6Enabled
      },
      device: {
        ...mergedConfig.plexlive.device,
        baseUrl: process.env.BASE_URL || `http://${process.env.ADVERTISED_HOST || 'localhost'}:${process.env.HTTP_PORT || process.env.PORT || mergedConfig.server.port}`
      }
    }
  };

  return deepMerge(mergedConfig, envOverrides);
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
  // Create specific directories only - avoid file paths
  const directories = [
    config.paths.data,
    config.paths.cache,
    config.paths.logs,
    config.paths.database,  // This is the directory, not the file
    config.paths.logos,
    path.dirname(config.database.path)  // Extract directory from database file path
  ];
  
  // Remove duplicates and file paths
  const uniqueDirs = [...new Set(directories)].filter(dir => {
    // Skip if this is a file path (has extension)
    if (path.extname(dir)) {
      console.warn(`Skipping file path in directory creation: ${dir}`);
      return false;
    }
    return true;
  });
  
  uniqueDirs.forEach(dir => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
        console.log(`Created directory: ${dir}`);
      }
      
      // Verify directory is writable
      fs.accessSync(dir, fs.constants.W_OK);
      console.log(`Directory verified writable: ${dir}`);
    } catch (error) {
      console.error(`Failed to create/access directory ${dir}:`, error.message);
      // Don't throw here, let the application try to start
      // Services will handle individual directory failures
    }
  });
}

// Configuration validation and logging
let configLogged = false;
function validateAndLogConfig(config) {
  if (!configLogged) {
    console.log('🔧 PlexBridge Configuration:');
    console.log(`   Environment: ${config.server.environment}`);
    console.log(`   HTTP Server: ${config.server.host}:${config.server.port}`);
    console.log(`   Data Directory: ${config.paths.data}`);
  
  // Network configuration
  console.log('🌐 Network Configuration:');
  console.log(`   Bind Address: ${config.plexlive.network.bindAddress}`);
  console.log(`   Streaming Port: ${config.plexlive.network.streamingPort}`);
  console.log(`   Discovery Port: ${config.plexlive.network.discoveryPort}`);
  console.log(`   Advertised Host: ${config.plexlive.network.advertisedHost || 'auto-detect'}`);
  console.log(`   Base URL: ${config.plexlive.device.baseUrl}`);
  console.log(`   IPv6 Enabled: ${config.plexlive.network.ipv6Enabled}`);
  
  // Environment variables override log
  const envVars = [
    'HOST_IP', 'BIND_ADDRESS', 'HTTP_PORT', 'PORT', 'STREAM_PORT', 
    'STREAMING_PORT', 'ADVERTISED_HOST', 'BASE_URL', 'DISCOVERY_PORT', 
    'SSDP_PORT', 'IPV6_ENABLED'
  ];
  
  const activeEnvVars = envVars.filter(varName => process.env[varName]);
  if (activeEnvVars.length > 0) {
    console.log('📝 Active Environment Variable Overrides:');
    activeEnvVars.forEach(varName => {
      console.log(`   ${varName}=${process.env[varName]}`);
    });
  }
  
  // Validation warnings
  const warnings = [];
  
  // Check for port conflicts
  if (config.server.port === config.plexlive.network.discoveryPort) {
    warnings.push('HTTP port and SSDP discovery port are the same - this may cause conflicts');
  }
  
  // Check bind address validity
  const bindAddress = config.plexlive.network.bindAddress;
  if (bindAddress !== '0.0.0.0' && bindAddress !== 'localhost' && bindAddress !== '127.0.0.1') {
    // Simple IP validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(bindAddress)) {
      warnings.push(`Bind address "${bindAddress}" may not be a valid IP address`);
    }
  }
  
  // Check advertised host
  if (config.plexlive.network.advertisedHost) {
    console.log(`   ⚠️  Using custom advertised host: ${config.plexlive.network.advertisedHost}`);
  }
  
    if (warnings.length > 0) {
      console.log('⚠️  Configuration Warnings:');
      warnings.forEach(warning => console.log(`   • ${warning}`));
    }
    
    configLogged = true;
  }
  
  return config;
}

// Initialize configuration
const config = loadCustomConfig();
ensureDirectories(config);
const validatedConfig = validateAndLogConfig(config);

module.exports = validatedConfig;
