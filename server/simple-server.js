const express = require('express');
const http = require('http');
const path = require('path');

console.log('Starting PlexBridge server...');

const app = express();
const server = http.createServer(app);

// Basic middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/build')));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    message: 'PlexBridge server is running',
    timestamp: new Date().toISOString()
  });
});

// Basic API endpoints
app.get('/api/status', (req, res) => {
  res.json({ status: 'running', mode: 'simplified' });
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Start server
const PORT = 8080;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`✅ PlexBridge server running on http://${HOST}:${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
});

// Export for testing
module.exports = { app, server };