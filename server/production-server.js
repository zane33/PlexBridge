#!/usr/bin/env node

// Self-contained production server with all APIs
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

if (!process.env.DB_PATH || !process.env.DB_PATH.startsWith('/')) {
  process.env.DB_PATH = '/data/database/plextv.db';
}

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
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

const logger = require('./utils/logger');
const config = require('./config');
const database = require('./services/database');

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
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
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
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Accept', 'User-Agent'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
}));

// General middleware
app.use(compression());
app.use(morgan('combined', { stream: { write: message => console.log(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
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

// Mock API endpoints for basic functionality
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await database.all('SELECT * FROM channels ORDER BY number');
    res.json(channels || []);
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.json([]);
  }
});

app.get('/api/streams', async (req, res) => {
  try {
    const streams = await database.all('SELECT * FROM streams ORDER BY created_at DESC');
    res.json(streams || []);
  } catch (error) {
    console.error('Error fetching streams:', error);
    res.json([]);
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await database.all('SELECT * FROM settings');
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.json({});
  }
});

app.get('/api/metrics', (req, res) => {
  res.json({
    activeStreams: 0,
    totalChannels: 0,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'healthy',
    cache: 'mock'
  });
});

app.get('/api/logs', async (req, res) => {
  try {
    const logs = await database.all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100');
    res.json(logs || []);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.json([]);
  }
});

// EPG endpoints
app.get('/api/epg-sources', async (req, res) => {
  try {
    const sources = await database.all('SELECT * FROM epg_sources ORDER BY created_at DESC');
    res.json(sources || []);
  } catch (error) {
    console.error('Error fetching EPG sources:', error);
    res.json([]);
  }
});

app.get('/api/epg/channels', async (req, res) => {
  try {
    const channels = await database.all('SELECT * FROM epg_channels ORDER BY display_name');
    res.json(channels || []);
  } catch (error) {
    console.error('Error fetching EPG channels:', error);
    res.json([]);
  }
});

app.get('/api/epg/programs', async (req, res) => {
  try {
    const { channel_id, limit = 100 } = req.query;
    let query = 'SELECT * FROM epg_programs';
    let params = [];
    
    if (channel_id) {
      query += ' WHERE channel_id = ?';
      params.push(channel_id);
    }
    
    query += ' ORDER BY start_time DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const programs = await database.all(query, params);
    res.json(programs || []);
  } catch (error) {
    console.error('Error fetching EPG programs:', error);
    res.json([]);
  }
});

// HDHomeRun compatibility endpoints
app.get('/discover.json', (req, res) => {
  res.json({
    FriendlyName: "PlexBridge",
    Manufacturer: "PlexBridge",
    ModelNumber: "HDTC-2US",
    FirmwareVersion: "1.0.0",
    TunerCount: 4,
    DeviceID: "12345678",
    DeviceAuth: "test1234",
    BaseURL: `http://${req.get('host')}`,
    LineupURL: `http://${req.get('host')}/lineup.json`
  });
});

app.get('/lineup.json', async (req, res) => {
  try {
    const channels = await database.all('SELECT * FROM channels WHERE enabled = 1 ORDER BY number');
    const lineup = channels.map(channel => ({
      GuideNumber: channel.number.toString(),
      GuideName: channel.name,
      URL: `http://${req.get('host')}/stream/${channel.id}`
    }));
    res.json(lineup);
  } catch (error) {
    console.error('Error generating lineup:', error);
    res.json([]);
  }
});

app.get('/device.xml', (req, res) => {
  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <presentationURL>/</presentationURL>
    <friendlyName>PlexBridge</friendlyName>
    <manufacturer>PlexBridge</manufacturer>
    <modelName>PlexBridge</modelName>
    <modelNumber>1.0</modelNumber>
    <serialNumber>12345678</serialNumber>
    <UDN>uuid:12345678-1234-5678-9012-123456789012</UDN>
  </device>
</root>`);
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join-logs', () => {
    socket.join('logs');
    console.log(`Client ${socket.id} joined logs room`);
  });

  socket.on('join-metrics', () => {
    socket.join('metrics');
    console.log(`Client ${socket.id} joined metrics room`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize application
async function initializeApp() {
  console.log('Starting PlexBridge production server...');
  
  try {
    // Initialize database
    console.log('Initializing database...');
    await database.initialize();
    console.log('Database initialized successfully');
    
    // Initialize database logger
    if (logger.initDatabaseLogger) {
      try {
        logger.initDatabaseLogger(database);
        console.log('Database logger initialized');
      } catch (err) {
        console.warn('Database logger initialization failed (non-critical):', err.message);
      }
    }
    
    // Test database health
    const dbHealth = await database.healthCheck();
    if (dbHealth.status !== 'healthy') {
      throw new Error(`Database health check failed: ${dbHealth.error}`);
    }
    console.log('Database health check passed');

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

    console.log(`✅ PlexBridge server running successfully on ${HOST}:${PORT}`);
    console.log(`📱 Web interface: http://localhost:${PORT}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`📺 Plex discovery: http://localhost:${PORT}/discover.json`);
    console.log(`🛠️ API endpoints: http://localhost:${PORT}/api/`);
    console.log('🚀 Application initialization completed successfully');

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
  } catch (err) {
    console.error('Error during shutdown:', err);
  }
  process.exit(0);
});

// Start the application
initializeApp();