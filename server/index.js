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
const cacheService = require('./services/cacheService');
const ssdpService = require('./services/ssdpService');

// Import routes
const apiRoutes = require('./routes/api');
const streamRoutes = require('./routes/streams');
const epgRoutes = require('./routes/epg');
const ssdpRoutes = require('./routes/ssdp');

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

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.ALLOWED_ORIGINS?.split(',') || []]
    : ['http://localhost:3000'],
  credentials: true
}));

// General middleware
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use('/logos', express.static(path.join(__dirname, '../data/logos')));
app.use(express.static(path.join(__dirname, '../client/build')));

// API Routes
app.use('/api', apiRoutes);
app.use('/', streamRoutes);
app.use('/epg', epgRoutes);
app.use('/', ssdpRoutes);

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

    // Close database connections
    await database.close();
    logger.info('Database connections closed');

    // Close cache connections
    await cacheService.close();
    logger.info('Cache connections closed');

    // Stop SSDP service
    ssdpService.stop();
    logger.info('SSDP service stopped');

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

// Initialize application
const initializeApp = async () => {
  try {
    // Initialize database
    await database.initialize();
    logger.info('Database initialized');

    // Initialize cache service
    await cacheService.initialize();
    logger.info('Cache service initialized');

    // Start SSDP service
    ssdpService.start(io);
    logger.info('SSDP service started');

    // Start server
    const PORT = process.env.PORT || config.server.port || 8080;
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`PlexTV server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`GUI available at: http://localhost:${PORT}`);
    });

  } catch (error) {
    logger.error('Failed to initialize application:', error);
    process.exit(1);
  }
};

// Export for testing
module.exports = { app, server, io };

// Start the application if this file is run directly
if (require.main === module) {
  initializeApp();
}
