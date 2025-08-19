const express = require('express');
const http = require('http');
const path = require('path');

console.log('Starting PlexBridge test video server...');

const app = express();
const server = http.createServer(app);

// Basic middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/build')));

// CORS headers for video streaming
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    message: 'PlexBridge test video server is running',
    timestamp: new Date().toISOString()
  });
});

// Test stream endpoints for the exact URIs provided by user
app.get('/streams/preview/:streamId', (req, res) => {
  const { streamId } = req.params;
  
  // Log the request
  console.log(`Stream preview request for ID: ${streamId}`);
  
  // For testing, we'll proxy the direct URI the user provided
  const directUri = 'http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts';
  
  // Set appropriate headers for .ts files
  res.set({
    'Content-Type': 'video/mp2t',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache'
  });
  
  // Simple proxy for testing
  const https = require('https');
  const httpModule = directUri.startsWith('https:') ? https : require('http');
  
  httpModule.get(directUri, (response) => {
    response.pipe(res);
  }).on('error', (err) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Failed to proxy stream' });
  });
});

// Direct test endpoint for the user's URI
app.get('/test-direct-stream', (req, res) => {
  console.log('Direct stream test requested');
  res.json({
    url: 'http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts',
    type: 'ts',
    message: 'Direct URI for testing video player'
  });
});

// Mock API endpoints for testing
app.get('/api/streams', (req, res) => {
  res.json([
    {
      id: 'd81b0171-d3a8-4bb3-b8d7-3e45d86c6112',
      name: 'Test Stream',
      url: 'http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts',
      type: 'ts'
    }
  ]);
});

// Basic API endpoints
app.get('/api/status', (req, res) => {
  res.json({ status: 'running', mode: 'test-video' });
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build/index.html'));
});

// Start server
const PORT = 8081;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`✅ PlexBridge test video server running on http://${HOST}:${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`🎥 Test stream: http://localhost:${PORT}/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112`);
  console.log(`🎯 Direct test: http://localhost:${PORT}/test-direct-stream`);
});

// Export for testing
module.exports = { app, server };