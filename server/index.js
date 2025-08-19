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
const epgService = require('./services/epgService');
// const cacheService = require('./services/cacheService');
// const ssdpService = require('./services/ssdpService');

// Import routes
const apiRoutes = require('./routes/api');
const streamRoutes = require('./routes/streams');
const epgRoutes = require('./routes/epg');
const ssdpRoutes = require('./routes/ssdp');
const m3uRoutes = require('./routes/m3u');
const m3uImportRoutes = require('./routes/m3uImport');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:3000",
    methods: ["GET", "POST"]
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
    : ['http://localhost:3000', 'http://localhost:8080'],
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

// API Routes - MUST BE BEFORE STATIC FILES
app.use('/api/streams/parse/m3u', m3uRoutes);
app.use('/api/streams/import/m3u', m3uImportRoutes);
app.use('/api', apiRoutes);
app.use('/epg', epgRoutes);
app.use('/', ssdpRoutes);
app.use('/', streamRoutes);

// Serve static files - MUST BE AFTER API ROUTES
app.use('/logos', express.static(path.join(__dirname, '../data/logos')));
app.use(express.static(path.join(__dirname, '../client/build')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: require('../package.json').version
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Make socket.io instance available globally for services
global.io = io;

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

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

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

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

    // Shutdown EPG service
    try {
      await epgService.shutdown();
      logger.info('EPG service shutdown completed');
    } catch (epgShutdownError) {
      logger.warn('EPG service shutdown error:', epgShutdownError);
    }

    // Close database connections
    await database.close();
    logger.info('Database connections closed');

    // Cache and SSDP services not initialized
    logger.info('Cache and SSDP services were not initialized');

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
        logger.initDatabaseLogger(database);
        
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

    // Skip cache service initialization (causing startup hangs)
    logger.info('Cache service initialization skipped to prevent startup delays');

    // Skip SSDP service initialization for now
    logger.info('SSDP service initialization skipped for stability');

    // Test database health
    const dbHealth = await database.healthCheck();
    if (dbHealth.status !== 'healthy') {
      throw new Error(`Database health check failed: ${dbHealth.error}`);
    }
    logger.info('Database health check passed');

    // Load and apply settings from database
    try {
      const settings = await settingsService.getSettings();
      logger.info('Settings loaded on startup:', { 
        maxConcurrentStreams: settings['plexlive.streaming.maxConcurrentStreams']
      });
      
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

    // Initialize EPG service after database is ready
    try {
      logger.info('Initializing EPG service...');
      await epgService.initialize();
      logger.info('✅ EPG service initialized successfully');
    } catch (epgError) {
      logger.error('❌ EPG service initialization failed:', epgError.message);
      logger.warn('EPG functionality will be limited until service is manually initialized');
    }

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
