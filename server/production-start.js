#!/usr/bin/env node

// Production startup script for PlexBridge
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Ensure database path is absolute
if (!process.env.DB_PATH || !process.env.DB_PATH.startsWith('/')) {
  process.env.DB_PATH = '/data/database/plextv.db';
}

// Import and initialize the application properly
const path = require('path');
const fs = require('fs');

// Ensure data directories exist
const dirs = ['/data', '/data/database', '/data/logs', '/data/cache', '/data/logos'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      console.log(`Created directory: ${dir}`);
    } catch (err) {
      console.error(`Failed to create directory ${dir}:`, err.message);
    }
  }
});

// Load the application without triggering initialization
delete require.cache[require.resolve('./index.js')];
const { app, server, io } = require('./index.js');

// Load required services
const logger = require('./utils/logger');
const config = require('./config');
const database = require('./services/database');
const cacheService = require('./services/cacheService');
const ssdpService = require('./services/ssdpService');

// Custom initialization that avoids the database logger issue
async function initializeApp() {
  console.log('Starting PlexBridge production server...');
  
  try {
    // Initialize database first
    console.log('Initializing database...');
    await database.initialize();
    console.log('Database initialized successfully');
    
    // Now initialize the database logger
    if (logger.initDatabaseLogger) {
      try {
        logger.initDatabaseLogger(database);
        console.log('Database logger initialized');
      } catch (err) {
        console.warn('Database logger initialization failed (non-critical):', err.message);
      }
    }
    
    // Initialize cache service
    console.log('Initializing cache service...');
    try {
      await cacheService.initialize();
      console.log('Cache service initialized successfully');
    } catch (cacheError) {
      console.warn('Cache service initialization failed (non-critical):', cacheError.message);
    }
    
    // Start SSDP service
    console.log('Starting SSDP service...');
    try {
      ssdpService.start(io);
      console.log('SSDP service started successfully');
    } catch (ssdpError) {
      console.warn('SSDP service failed to start (non-critical):', ssdpError.message);
    }
    
    // Start HTTP server
    const PORT = config.server.port || 8080;
    const HOST = config.server.host || '0.0.0.0';
    
    server.listen(PORT, HOST, (err) => {
      if (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
      } else {
        console.log(`✅ PlexBridge server running on ${HOST}:${PORT}`);
        console.log(`📱 Web interface: http://localhost:${PORT}`);
        console.log(`🔍 Health check: http://localhost:${PORT}/health`);
        console.log(`📺 Plex discovery: http://localhost:${PORT}/discover.json`);
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
  });
  try {
    await database.close();
    await cacheService.close();
    ssdpService.stop();
  } catch (err) {
    console.error('Error during shutdown:', err);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
  });
  try {
    await database.close();
    await cacheService.close();
    ssdpService.stop();
  } catch (err) {
    console.error('Error during shutdown:', err);
  }
  process.exit(0);
});

// Start the application
initializeApp();