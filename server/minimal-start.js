#!/usr/bin/env node

// Minimal server startup to ensure basic functionality works
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Basic middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/build')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Basic route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Start server
const PORT = process.env.HTTP_PORT || process.env.PORT || 8080;
const HOST = process.env.HOST_IP || '0.0.0.0';

server.listen(PORT, HOST, (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  } else {
    console.log(`✅ PlexBridge minimal server running on ${HOST}:${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});