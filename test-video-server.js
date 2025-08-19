const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8081;

// Serve static files from client build
const clientBuildPath = path.join(__dirname, 'client', 'build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  console.log('✅ Serving client build from:', clientBuildPath);
} else {
  console.log('⚠️ Client build not found, serving basic HTML');
}

// Mock API endpoints for testing
app.use(express.json());

// Mock streams API
app.get('/api/streams', (req, res) => {
  res.json([
    {
      id: 'd81b0171-d3a8-4bb3-b8d7-3e45d86c6112',
      name: 'Test TS Stream',
      url: 'http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts',
      type: 'ts',
      enabled: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'test-hls-stream',
      name: 'Test HLS Stream',
      url: 'https://example.com/stream.m3u8',
      type: 'hls',
      enabled: true,
      created_at: new Date().toISOString()
    }
  ]);
});

// Mock stream preview endpoint - this is critical for testing our .ts fixes
app.get('/streams/preview/:streamId', (req, res) => {
  const { streamId } = req.params;
  const { transcode } = req.query;
  
  console.log(`🎬 Stream preview request: ${streamId}, transcode: ${transcode}`);
  
  // For the test TS stream, return proper headers
  if (streamId === 'd81b0171-d3a8-4bb3-b8d7-3e45d86c6112') {
    if (transcode === 'true') {
      // Return transcoded MP4 content-type
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      
      // For testing, just return a success message (in real app this would be transcoded video)
      res.status(200).send('Transcoded TS stream (this would be actual video data)');
    } else {
      // Return direct TS stream with proper content-type
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      
      // For testing, proxy to the actual TS stream or return test data
      res.status(200).send('Direct TS stream (this would be actual video data)');
    }
  } else {
    res.status(404).json({ error: 'Stream not found' });
  }
});

// Mock other required API endpoints
app.get('/api/channels', (req, res) => {
  res.json([]);
});

app.get('/api/metrics', (req, res) => {
  res.json({
    system: { cpu: 15, memory: 45, disk: 30 },
    streams: { active: 0, total: 2 },
    uptime: Date.now()
  });
});

app.get('/api/settings', (req, res) => {
  res.json({
    server: { port: 8080 },
    streaming: { maxConcurrent: 10 }
  });
});

app.get('/api/logs', (req, res) => {
  res.json([]);
});

app.get('/api/epg-sources', (req, res) => {
  res.json([]);
});

app.get('/api/epg/channels', (req, res) => {
  res.json([]);
});

app.get('/api/epg/programs', (req, res) => {
  res.json([]);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// For React Router - serve index.html for all other routes
app.get('*', (req, res) => {
  const indexPath = path.join(clientBuildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>PlexBridge Test Server</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .status { padding: 20px; background: #e8f5e8; border-radius: 8px; }
        </style>
      </head>
      <body>
        <div class="status">
          <h1>🎬 PlexBridge Test Server</h1>
          <p>Server is running for video player testing!</p>
          <p>Client build not found, but API endpoints are available for testing.</p>
          <ul>
            <li><a href="/api/streams">/api/streams</a> - Mock streams data</li>
            <li><a href="/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112">/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112</a> - Test TS stream</li>
            <li><a href="/health">/health</a> - Health check</li>
          </ul>
        </div>
      </body>
      </html>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 PlexBridge Test Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving from: ${clientBuildPath}`);
  console.log(`🎯 Ready for video player testing!`);
});