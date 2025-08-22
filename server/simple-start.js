#!/usr/bin/env node

// Simple startup script for PlexBridge
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST_IP || '0.0.0.0';

console.log('Starting PlexBridge simple server...');

// Serve static files from React build
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

// Basic HDHomeRun discovery endpoint
app.get('/discover.json', (req, res) => {
  res.json({
    FriendlyName: "PlexBridge",
    Manufacturer: "PlexBridge",
    ModelNumber: "HDHR-IPTV",
    FirmwareName: "plexbridge",
    FirmwareVersion: "1.0.0",
    DeviceID: "PLEXBRIDGE",
    DeviceAuth: "",
    BaseURL: `http://${req.headers.host}`,
    LineupURL: `http://${req.headers.host}/lineup.json`,
    TunerCount: 4
  });
});

// Basic lineup endpoint
app.get('/lineup.json', (req, res) => {
  res.json([]);
});

// Lineup status
app.get('/lineup_status.json', (req, res) => {
  res.json({
    ScanInProgress: 0,
    ScanPossible: 1,
    Source: "IPTV",
    SourceList: ["IPTV"]
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`✅ PlexBridge simple server running on ${HOST}:${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`📺 Plex discovery: http://localhost:${PORT}/discover.json`);
});