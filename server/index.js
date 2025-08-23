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

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for streaming content
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// CORS configuration - Enhanced for streaming
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.ALLOWED_ORIGINS?.split(',') || []]
    : ['http://localhost:3000'],
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

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
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
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Initialize application with detailed error handling
const initializeApp = async () => {
  logger.info('Starting PlexBridge application initialization...');
  
  try {
    // Log configuration info
    logger.info(`Node.js version: ${process.version}`);
    logger.info(`Platform: ${process.platform} ${process.arch}`);
    logger.info(`Working directory: ${process.cwd()}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Data directory: ${config.paths.data}`);
    logger.info(`Database path: ${config.database.path}`);
    
    // Initialize database with retries
    let dbInitialized = false;
    let dbRetries = 3;
    
    while (!dbInitialized && dbRetries > 0) {
      try {
        await database.initialize();
        logger.info('Database initialized successfully');
        
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

      // API Routes - MUST BE BEFORE STATIC FILES
      app.use('/', healthRoutes);  // Health check routes
      app.use('/', plexSetupRoutes);  // Plex setup guide
      app.use('/api/streams/parse/m3u', m3uRoutes);
      app.use('/api/streams/import/m3u', m3uImportRoutes);
      app.use('/api/streaming', streamingRoutes);  // Enhanced streaming monitoring
      app.use('/api', apiRoutes);
      app.use('/epg', epgRoutes);
      app.use('/', ssdpRoutes);
      app.use('/', streamRoutes);
      
      logger.info('✅ API routes registered successfully');
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
