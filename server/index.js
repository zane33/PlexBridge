const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const config = require('./config');
const database = require('./services/database');
const settingsService = require('./services/settingsService');
// Note: epgService will be loaded after database initialization
// const cacheService = require('./services/cacheService');
// const ssdpService = require('./services/ssdpService');

// Note: Routes will be imported after database initialization

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:3000",
    methods: ["GET", "POST"]
  },
  // Connection settings
  pingInterval: 25000,  // How often to ping clients (25 seconds)
  pingTimeout: 20000,   // How long to wait for pong (20 seconds)
  upgradeTimeout: 30000, // Timeout for transport upgrade
  
  // Transport settings
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  
  // Performance settings
  perMessageDeflate: false, // Disable compression for lower latency
  httpCompression: false,   // Disable HTTP compression
  
  // Connection limits
  maxHttpBufferSize: 1e6,  // 1MB max message size
  connectTimeout: 45000,    // 45 seconds to establish connection
  
  // Cookie settings for sticky sessions
  cookie: {
    name: 'io',
    httpOnly: true,
    sameSite: 'strict'
  }
});

// Security middleware - Enhanced for HTTP compatibility
app.use(helmet({
  contentSecurityPolicy: false, // Disable for streaming content
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false, // Disable COOP to prevent HTTP warnings
  originAgentCluster: false, // Disable origin-keyed agent cluster warnings
  // Disable additional headers that cause issues with HTTP
  hsts: false, // Disable HSTS for HTTP compatibility
  frameguard: { action: 'sameorigin' } // Allow same-origin framing
}));

// Remove Origin-Agent-Cluster header completely
app.use((req, res, next) => {
  res.removeHeader('Origin-Agent-Cluster');
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// CORS configuration - Enhanced for streaming and local network access
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (same-origin, mobile apps, Postman, etc)
    if (!origin) return callback(null, true);

    // Allow localhost and local network IPs
    const allowedPatterns = [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
      /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
      /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/
    ];

    const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
    callback(null, isAllowed);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Accept', 'User-Agent'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
}));

// General middleware
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add GLOBAL metadata validation middleware FIRST - catches ALL responses
const { globalMetadataValidationMiddleware } = require('./utils/metadataTypeValidator');
app.use(globalMetadataValidationMiddleware);

// Add Plex query parameter handler middleware - prevents parser warnings
const { plexQueryHandler, plexResponseHeaders } = require('./middleware/plexQueryHandler');
app.use(plexQueryHandler());
app.use(plexResponseHeaders());

// Add Plex request logging middleware
const { plexRequestLogger, malformedRequestHandler } = require('./middleware/plexRequestLogger');
app.use(plexRequestLogger());

// Add Android TV robust transcode decision middleware - CRITICAL FIX
const { robustTranscodeDecisionMiddleware } = require('./utils/robustTranscodeDecision');
app.use(robustTranscodeDecisionMiddleware());

// Make io accessible to routes
app.set('io', io);

// API Routes will be registered after database initialization

// Serve static files - MUST BE AFTER API ROUTES
app.use('/logos', express.static(path.join(__dirname, '../data/logos')));
app.use(express.static(path.join(__dirname, '../client/build')));

// NOTE: React catch-all route moved to initializeApp() after API routes are registered

// Make socket.io instance available globally for services
global.io = io;

// Socket.IO connection handling with enhanced error recovery
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id} from ${socket.handshake.address}`);
  
  // Track connection time
  socket.data.connectedAt = Date.now();
  
  // Send initial connection confirmation
  socket.emit('connection:confirmed', {
    id: socket.id,
    timestamp: new Date().toISOString()
  });

  socket.on('join-logs', () => {
    socket.join('logs');
    logger.info(`Client ${socket.id} joined logs room`);
  });

  socket.on('join-metrics', () => {
    socket.join('metrics');
    logger.info(`Client ${socket.id} joined metrics room`);
  });

  socket.on('join-settings', () => {
    socket.join('settings');
    logger.info(`Client ${socket.id} joined settings room`);
  });

  socket.on('join-streaming', () => {
    socket.join('streaming');
    logger.info(`Client ${socket.id} joined streaming monitoring room`);
  });
  
  // Handle client pings for custom health checks
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback({ timestamp: Date.now() });
    }
  });

  socket.on('disconnect', (reason) => {
    const duration = Date.now() - socket.data.connectedAt;
    logger.info(`Client disconnected: ${socket.id}, reason: ${reason}, duration: ${duration}ms`);
  });
  
  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
  });
});

// Monitor Socket.IO server health
io.on('connect_error', (error) => {
  logger.error('Socket.IO server connection error:', error);
});

// Periodically log connection stats
setInterval(() => {
  const sockets = io.of('/').sockets;
  logger.debug(`Active WebSocket connections: ${sockets.size}`);
}, 60000); // Every minute

// Error handling middleware with Android TV transcode decision protection
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  // CRITICAL ANDROID TV FIX: Global safety net for transcode decision requests
  // If any transcode decision request reaches the global error handler, return XML instead of JSON
  const isTranscodeDecisionRequest = req.path === '/video/:/transcode/universal/decision' ||
                                   req.originalUrl.includes('/video/:/transcode/universal/decision') ||
                                   req.path.includes('/transcode/universal/decision');

  if (isTranscodeDecisionRequest) {
    logger.error('CRITICAL: Transcode decision request reached global error handler - providing emergency XML', {
      path: req.path,
      originalUrl: req.originalUrl,
      error: err.message,
      userAgent: req.get('User-Agent'),
      emergencyInterception: true
    });

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Emergency-Global-Handler': 'true',
      'X-Android-TV-Protection': 'active'
    });

    const globalFallbackXML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1" identifier="com.plexapp.plugins.library" librarySectionID="1" librarySectionTitle="Live TV" machineIdentifier="plexbridge" totalSize="1">
  <Video
    ratingKey="global-fallback"
    key="/library/metadata/global-fallback"
    type="clip"
    title="Live TV Global Fallback"
    summary="Global error handler fallback to prevent crashes"
    duration="86400000"
    live="1"
    addedAt="${Math.floor(Date.now() / 1000)}"
    updatedAt="${Math.floor(Date.now() / 1000)}"
    year="${new Date().getFullYear()}"
    contentRating="TV-PG"
    index="1"
    parentIndex="1"
    librarySectionID="1"
    librarySectionTitle="Live TV">
    <Media
      id="1"
      duration="86400000"
      bitrate="5000"
      width="1920"
      height="1080"
      aspectRatio="1.78"
      audioChannels="2"
      audioCodec="aac"
      videoCodec="h264"
      videoResolution="1080"
      container="mpegts"
      videoFrameRate="25p"
      optimizedForStreaming="1">
      <Part
        id="1"
        key="/stream/global-fallback"
        duration="86400000"
        file="/stream/global-fallback"
        size="999999999"
        container="mpegts">
        <Stream id="1" streamType="1" codec="h264" index="0" bitrate="4000" language="eng" height="1080" width="1920" frameRate="25.0" />
        <Stream id="2" streamType="2" codec="aac" index="1" channels="2" bitrate="128" language="eng" samplingRate="48000" />
      </Part>
    </Media>
  </Video>
</MediaContainer>`;

    return res.status(200).send(globalFallbackXML);
  }

  // For non-transcode decision requests, return normal JSON error
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log('\n'.repeat(2));
  console.log('-'.repeat(80));
  console.log(`GRACEFUL SHUTDOWN INITIATED - Signal: ${signal}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`PID: ${process.pid}`);
  console.log(`Uptime: ${Math.round(process.uptime())} seconds`);
  console.log('-'.repeat(80));
  
  logger.info('⚠️ GRACEFUL SHUTDOWN INITIATED', {
    signal: signal,
    pid: process.pid,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
  
  try {
    // Close server
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Shutdown EPG service if available
    try {
      const epgService = require('./services/epgService');
      if (epgService && epgService.shutdown) {
        await epgService.shutdown();
        logger.info('EPG service shutdown completed');
      }
    } catch (epgShutdownError) {
      logger.warn('EPG service shutdown error:', epgShutdownError);
    }

    // Shutdown cache service if available
    try {
      const cacheService = require('./services/cacheService');
      if (cacheService && cacheService.shutdown) {
        await cacheService.shutdown();
        logger.info('Cache service shutdown completed');
      }
    } catch (cacheShutdownError) {
      logger.warn('Cache service shutdown error:', cacheShutdownError);
    }

    // Shutdown SSDP service if available
    try {
      const ssdpService = require('./services/ssdpService');
      if (ssdpService && ssdpService.shutdown) {
        await ssdpService.shutdown();
        logger.info('SSDP service shutdown completed');
      }
    } catch (ssdpShutdownError) {
      logger.warn('SSDP service shutdown error:', ssdpShutdownError);
    }

    // Shutdown Session Persistence Manager
    try {
      const { getSessionManager } = require('./utils/sessionPersistenceFix');
      const sessionManager = getSessionManager();
      if (sessionManager && sessionManager.shutdown) {
        sessionManager.shutdown();
        logger.info('Session Persistence Manager shutdown completed');
      }
    } catch (sessionShutdownError) {
      logger.warn('Session Persistence Manager shutdown error:', sessionShutdownError);
    }

    // Shutdown Android TV Session Manager
    try {
      const androidTVSessionManager = require('./services/androidTVSessionManager');
      if (androidTVSessionManager && androidTVSessionManager.shutdown) {
        await androidTVSessionManager.shutdown();
        logger.info('Android TV Session Manager shutdown completed');
      }
    } catch (androidTVShutdownError) {
      logger.warn('Android TV Session Manager shutdown error:', androidTVShutdownError);
    }

    // Shutdown Coordinated Session Manager and Crash Detection
    try {
      const coordinatedSessionManager = require('./services/coordinatedSessionManager');
      if (coordinatedSessionManager && coordinatedSessionManager.shutdown) {
        await coordinatedSessionManager.shutdown();
        logger.info('Coordinated Session Manager shutdown completed');
      }
    } catch (coordSessionShutdownError) {
      logger.warn('Coordinated Session Manager shutdown error:', coordSessionShutdownError);
    }

    // Close database connections
    try {
      await database.close();
      logger.info('Database connections closed');
    } catch (dbCloseError) {
      logger.warn('Database close error:', dbCloseError);
    }

    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('\n'.repeat(2));
  console.error('!'.repeat(80));
  console.error('CRITICAL ERROR - UNCAUGHT EXCEPTION');
  console.error(`Time: ${new Date().toISOString()}`);
  console.error(`PID: ${process.pid}`);
  console.error('Error:', err);
  console.error('Stack:', err.stack);
  console.error('!'.repeat(80));
  console.error('APPLICATION WILL RESTART');
  console.error('!'.repeat(80));
  console.error('\n'.repeat(2));
  
  logger.error('💥 CRITICAL: Uncaught Exception - Application Crashing', {
    error: err.message,
    stack: err.stack,
    pid: process.pid,
    uptime: process.uptime()
  });
  
  // Record crash before exit
  crashTracker.recordShutdown('CRASH').then(() => {
    // Give time for logs to flush
    setTimeout(() => process.exit(1), 1000);
  }).catch(() => {
    setTimeout(() => process.exit(1), 1000);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n'.repeat(2));
  console.error('!'.repeat(80));
  console.error('CRITICAL ERROR - UNHANDLED PROMISE REJECTION');
  console.error(`Time: ${new Date().toISOString()}`);
  console.error(`PID: ${process.pid}`);
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('!'.repeat(80));
  console.error('APPLICATION WILL RESTART');
  console.error('!'.repeat(80));
  console.error('\n'.repeat(2));
  
  logger.error('💥 CRITICAL: Unhandled Promise Rejection - Application Crashing', {
    reason: reason,
    promise: promise,
    pid: process.pid,
    uptime: process.uptime()
  });
  
  // Record crash before exit
  crashTracker.recordShutdown('UNHANDLED_REJECTION').then(() => {
    // Give time for logs to flush
    setTimeout(() => process.exit(1), 1000);
  }).catch(() => {
    setTimeout(() => process.exit(1), 1000);
  });
});

// Initialize application with detailed error handling
const initializeApp = async () => {
  // Generate startup identifier for tracking restarts
  const startupId = require('crypto').randomBytes(4).toString('hex');
  const startupTime = new Date().toISOString();
  
  // Critical startup banner - visible in logs
  console.log('\n'.repeat(3));
  console.log('='.repeat(80));
  console.log(`║ PLEXBRIDGE APPLICATION STARTUP - ${startupTime}`);
  console.log(`║ Startup ID: ${startupId}`);
  console.log(`║ Process PID: ${process.pid}`);
  console.log(`║ Node Version: ${process.version}`);
  console.log(`║ Platform: ${process.platform} ${process.arch}`);
  console.log(`║ Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`);
  console.log('='.repeat(80));
  console.log('\n');
  
  logger.info('='.repeat(80));
  logger.info('🚀 PLEXBRIDGE APPLICATION STARTING');
  logger.info(`Startup ID: ${startupId}`);
  logger.info(`Process PID: ${process.pid}`);
  logger.info(`Parent PID: ${process.ppid}`);
  logger.info(`Node.js version: ${process.version}`);
  logger.info(`Platform: ${process.platform} ${process.arch}`);
  logger.info(`Working directory: ${process.cwd()}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Data directory: ${config.paths.data}`);
  logger.info(`Database path: ${config.database.path}`);
  logger.info(`Memory Usage: Heap ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / Total ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`);
  logger.info('='.repeat(80));
  
  try {
    
    // Initialize database with retries
    let dbInitialized = false;
    let dbRetries = 3;
    
    while (!dbInitialized && dbRetries > 0) {
      try {
        await database.initialize();
        logger.info('Database initialized successfully');
        
        // Initialize performance optimizations immediately after database
        try {
          const { initializePerformanceOptimizations } = require('./utils/startupOptimizer');
          await initializePerformanceOptimizations(database);
          logger.info('✅ Performance optimizations initialized');
        } catch (perfError) {
          logger.warn('Failed to initialize performance optimizations:', perfError.message);
        }
        
        // Initialize database logger
        try {
          logger.initDatabaseLogger(database);
          logger.info('Database logger initialized successfully');
        } catch (dbLoggerError) {
          logger.warn('Failed to initialize database logger:', dbLoggerError.message);
        }
        
        dbInitialized = true;
      } catch (dbError) {
        dbRetries--;
        logger.error(`Database initialization attempt failed (${3 - dbRetries}/3):`, dbError.message);
        
        if (dbRetries > 0) {
          logger.info(`Retrying database initialization in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw new Error(`Database initialization failed after 3 attempts: ${dbError.message}`);
        }
      }
    }

    // Initialize cache service
    try {
      logger.info('Initializing cache service...');
      const cacheService = require('./services/cacheService');
      await cacheService.initialize();
      logger.info('✅ Cache service initialized successfully');
    } catch (cacheError) {
      logger.warn('Failed to initialize cache service, continuing without cache:', cacheError.message);
    }

    // Initialize and start SSDP service
    try {
      logger.info('Initializing SSDP service...');
      const ssdpService = require('./services/ssdpService');
      await ssdpService.initialize();
      logger.info('✅ SSDP service initialized successfully');
      
      // Start SSDP advertising
      await ssdpService.start(io);
      logger.info('✅ SSDP service started and advertising');
    } catch (ssdpError) {
      logger.warn('Failed to initialize SSDP service, continuing without SSDP:', ssdpError.message);
    }

    // Test database health
    const dbHealth = await database.healthCheck();
    if (dbHealth.status !== 'healthy') {
      throw new Error(`Database health check failed: ${dbHealth.error}`);
    }
    logger.info('Database health check passed');

    // Initialize localization service
    logger.initLocalizationService();
    
    // Load and apply settings from database
    try {
      const settings = await settingsService.getSettings();
      logger.info('Settings loaded on startup:', { 
        maxConcurrentStreams: settings['plexlive.streaming.maxConcurrentStreams'],
        timezone: settings['plexlive.localization.timezone'] || 'UTC',
        locale: settings['plexlive.localization.locale'] || 'en-US'
      });
      
      // Apply localization settings to logger and services
      if (settings.plexlive && settings.plexlive.localization) {
        logger.updateLocalizationSettings(settings);
        logger.info('Localization settings applied globally');
      }
      
      // Apply settings to runtime config if applyToConfig method exists
      if (typeof settingsService.applyToConfig === 'function') {
        const updatedConfig = settingsService.applyToConfig(config);
        Object.assign(config, updatedConfig);
        logger.info('Settings applied to config');
      }
      
      logger.info('Settings loaded and applied successfully');
    } catch (settingsError) {
      logger.warn('Failed to load settings from database, using defaults:', settingsError.message);
    }

    // Initialize EPG service
    try {
      logger.info('Initializing EPG service...');
      const epgService = require('./services/epgService');
      await epgService.initialize();
      logger.info('✅ EPG service initialized successfully');
    } catch (epgError) {
      logger.warn('Failed to initialize EPG service, continuing without EPG:', epgError.message);
      logger.error('EPG service error details:', epgError);
    }
    
    // Initialize FFmpeg Profile Manager
    try {
      logger.info('Initializing FFmpeg Profile Manager...');
      const ffmpegProfileManager = require('./services/ffmpegProfileManager');
      await ffmpegProfileManager.initializeDefaultProfiles();
      logger.info('✅ FFmpeg Profile Manager initialized successfully');
    } catch (ffmpegError) {
      logger.warn('Failed to initialize FFmpeg Profile Manager:', ffmpegError.message);
      logger.error('FFmpeg Profile Manager error details:', ffmpegError);
    }
    
    // Initialize Session Persistence Manager for Android TV compatibility
    try {
      logger.info('Initializing Session Persistence Manager...');
      const { getSessionManager } = require('./utils/sessionPersistenceFix');
      const sessionManager = getSessionManager();
      logger.info('✅ Session Persistence Manager initialized successfully');
      logger.info(`Session management ready for consumer tracking and recovery`);
    } catch (sessionError) {
      logger.warn('Failed to initialize Session Persistence Manager:', sessionError.message);
      logger.error('Session management error details:', sessionError);
    }

    // Initialize Coordinated Session Manager with Crash Detection
    try {
      logger.info('Initializing Coordinated Session Manager with crash detection...');
      const coordinatedSessionManager = require('./services/coordinatedSessionManager');
      const clientCrashDetector = require('./services/clientCrashDetector');
      logger.info('✅ Coordinated Session Manager initialized successfully');
      logger.info(`Intelligent crash detection active for Android TV clients`);
      logger.info(`Session conflict resolution enabled for multiple clients`);
    } catch (coordSessionError) {
      logger.warn('Failed to initialize Coordinated Session Manager:', coordSessionError.message);
      logger.error('Coordinated session management error details:', coordSessionError);
    }

    // Register API routes after database initialization
    try {
      logger.info('Registering API routes...');
      const healthRoutes = require('./routes/health');
      const apiRoutes = require('./routes/api');
      const streamRoutes = require('./routes/streams');
      const epgRoutes = require('./routes/epg');
      const ssdpRoutes = require('./routes/ssdp');
      const m3uRoutes = require('./routes/m3u');
      const m3uImportRoutes = require('./routes/m3uImport');
      const plexSetupRoutes = require('./routes/plex-setup');
      const streamingRoutes = require('./routes/streaming');
      const diagnosticsRoutes = require('./routes/diagnostics');
      const adminFixRoutes = require('./routes/admin-fix');
      const type5MonitorRoutes = require('./routes/type5-monitor');
      const ffmpegProfileRoutes = require('./routes/ffmpeg-profiles');

      // API Routes - MUST BE BEFORE STATIC FILES
      app.use('/', healthRoutes);  // Health check routes
      app.use('/', plexSetupRoutes);  // Plex setup guide
      app.use('/api/diagnostics', diagnosticsRoutes);  // Diagnostics and crash tracking
      app.use('/api/admin', adminFixRoutes);  // Admin fix utilities
      app.use('/api/type5', type5MonitorRoutes);  // Real-time type 5 monitoring
      app.use('/api/streams/parse/m3u', m3uRoutes);
      app.use('/api/streams/import/m3u', m3uImportRoutes);
      app.use('/api/streaming', streamingRoutes);  // Enhanced streaming monitoring
      app.use('/api/ffmpeg-profiles', ffmpegProfileRoutes);  // FFmpeg profile management
      app.use('/api', apiRoutes);
      app.use('/epg', epgRoutes);

      // EPG Admin routes for managing channel mappings
      const epgAdminRoutes = require('./routes/epgAdmin');
      app.use('/api/epg-admin', epgAdminRoutes);
      app.use('/', ssdpRoutes);
      app.use('/', streamRoutes);
      
      // Add metadata type validation middleware to prevent type 5 errors
      const { metadataValidationMiddleware } = require('./utils/metadataTypeValidator');
      const { criticalPlexEndpointMiddleware, plexCachePreventionMiddleware } = require('./utils/plexCachePreventionMiddleware');
      
      // Apply cache prevention first, then validation
      app.use('/library', criticalPlexEndpointMiddleware, metadataValidationMiddleware);
      app.use('/lineup', criticalPlexEndpointMiddleware, metadataValidationMiddleware);
      app.use('/discover', criticalPlexEndpointMiddleware, metadataValidationMiddleware);
      app.use('/device', plexCachePreventionMiddleware, metadataValidationMiddleware);
      app.use('/timeline', criticalPlexEndpointMiddleware, metadataValidationMiddleware);
      app.use('/consumer', plexCachePreventionMiddleware, metadataValidationMiddleware);
      app.use('/api', plexCachePreventionMiddleware, metadataValidationMiddleware);
      
      logger.info('✅ Metadata validation and cache prevention middleware activated for Plex endpoints');
      
      // Add Android TV error handler after all routes
      const { androidTVErrorHandler } = require('./middleware/androidTVErrorHandler');
      app.use(androidTVErrorHandler());
      
      // Add Plex-specific error handler
      const { plexErrorHandler } = require('./middleware/plexQueryHandler');
      app.use(plexErrorHandler());
      
      // Add malformed request error handler
      app.use(malformedRequestHandler());
      
      logger.info('✅ API routes registered successfully with Android TV optimization');
    } catch (routeError) {
      logger.error('❌ Failed to register API routes:', routeError.message);
      throw routeError;
    }

    // Register React catch-all route AFTER all API routes
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/build/index.html'));
    });
    logger.info('✅ React catch-all route registered (after API routes)');

    // Start HTTP server
    const PORT = config.server.port;
    const HOST = config.server.host;
    
    await new Promise((resolve, reject) => {
      const serverStartTimeout = setTimeout(() => {
        reject(new Error('Server start timeout after 30 seconds'));
      }, 30000);
      
      server.listen(PORT, HOST, (err) => {
        clearTimeout(serverStartTimeout);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    logger.info(`✅ PlexBridge server running successfully on ${HOST}:${PORT}`);
    logger.info(`📱 Web interface: http://localhost:${PORT}`);
    logger.info(`🔍 Health check: http://localhost:${PORT}/health`);
    logger.info(`📺 Plex discovery: http://localhost:${PORT}/discover.json`);
    
    // Start performance monitoring after server is running
    try {
      const { startPerformanceMonitoring } = require('./utils/startupOptimizer');
      startPerformanceMonitoring(database);
      logger.info('📊 Performance monitoring started');
    } catch (monitorError) {
      logger.warn('Failed to start performance monitoring:', monitorError.message);
    }
    
    logger.info('🚀 Application initialization completed successfully');
    
    // Set up periodic metrics updates to connected clients
    setInterval(async () => {
      try {
        const streamManager = require('./services/streamManager');
        if (typeof streamManager.emitMetricsUpdate === 'function') {
          await streamManager.emitMetricsUpdate();
        }
      } catch (error) {
        logger.debug('Failed to emit periodic metrics update:', error);
      }
    }, 5000); // Emit metrics every 5 seconds
    
    logger.info('📊 Real-time metrics updates configured (5 second interval)');
    
    // Keep the process alive
    logger.info('Application is now running and ready to serve requests');

  } catch (error) {
    logger.error('❌ Failed to initialize application:', error);
    logger.error('Application will exit in 5 seconds...');
    
    // Give time for logs to flush
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  }
};

// Export for testing and startup
module.exports = { app, server, io, initializeApp };

// Start the application if this file is run directly
if (require.main === module) {
  initializeApp();
}
