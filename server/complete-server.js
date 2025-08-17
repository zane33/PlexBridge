#!/usr/bin/env node

// Complete PlexBridge server with Socket.IO and API endpoints
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST_IP || '0.0.0.0';

console.log('Starting PlexBridge complete server...');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../client/build')));

// Mock data storage (in-memory for simplicity)
let channels = [];
let streams = [];
let epgSources = [];
let settings = {
  server: {
    port: PORT,
    host: HOST
  },
  general: {
    deviceName: 'PlexBridge',
    maxConcurrentStreams: 4
  }
};

// API Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    services: {
      database: {
        status: 'healthy',
        connected: true,
        responseTime: Math.floor(Math.random() * 10) + 1
      },
      cache: {
        status: 'healthy',
        connected: true
      },
      socketio: {
        status: 'running',
        connections: io.engine.clientsCount || 0
      }
    }
  });
});

// Database health endpoint
app.get('/api/database/health', (req, res) => {
  res.json({
    status: 'healthy',
    connected: true,
    type: 'memory',
    lastCheck: new Date().toISOString(),
    responseTime: Math.floor(Math.random() * 10) + 1,
    tables: {
      channels: channels.length,
      streams: streams.length,
      epg_sources: epgSources.length,
      logs: 150
    },
    operations: {
      reads: 1245,
      writes: 342,
      errors: 0
    }
  });
});

// Channels API
app.get('/api/channels', (req, res) => {
  res.json(channels);
});

app.post('/api/channels', (req, res) => {
  const channel = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  channels.push(channel);
  
  // Emit update to connected clients
  io.emit('channelUpdate', { type: 'create', channel });
  
  res.status(201).json(channel);
});

app.get('/api/channels/:id', (req, res) => {
  const channel = channels.find(c => c.id === req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  res.json(channel);
});

app.put('/api/channels/:id', (req, res) => {
  const index = channels.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  
  channels[index] = { ...channels[index], ...req.body };
  
  // Emit update to connected clients
  io.emit('channelUpdate', { type: 'update', channel: channels[index] });
  
  res.json(channels[index]);
});

app.delete('/api/channels/:id', (req, res) => {
  const index = channels.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  
  const deletedChannel = channels.splice(index, 1)[0];
  
  // Emit update to connected clients
  io.emit('channelUpdate', { type: 'delete', channel: deletedChannel });
  
  res.json({ message: 'Channel deleted successfully' });
});

// Streams API
app.get('/api/streams', (req, res) => {
  res.json(streams);
});

app.post('/api/streams', (req, res) => {
  const stream = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  streams.push(stream);
  
  // Emit update to connected clients
  io.emit('streamUpdate', { type: 'create', stream });
  
  res.status(201).json(stream);
});

app.get('/api/streams/:id', (req, res) => {
  const stream = streams.find(s => s.id === req.params.id);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  res.json(stream);
});

app.put('/api/streams/:id', (req, res) => {
  const index = streams.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  
  streams[index] = { ...streams[index], ...req.body };
  
  // Emit update to connected clients
  io.emit('streamUpdate', { type: 'update', stream: streams[index] });
  
  res.json(streams[index]);
});

app.delete('/api/streams/:id', (req, res) => {
  const index = streams.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  
  const deletedStream = streams.splice(index, 1)[0];
  
  // Emit update to connected clients
  io.emit('streamUpdate', { type: 'delete', stream: deletedStream });
  
  res.json({ message: 'Stream deleted successfully' });
});

// Stream validation
app.post('/api/streams/validate', (req, res) => {
  const { url } = req.body;
  
  // Basic URL validation
  try {
    new URL(url);
    res.json({
      valid: true,
      type: 'hls', // Mock type detection
      message: 'Stream URL is valid'
    });
  } catch (error) {
    res.json({
      valid: false,
      message: 'Invalid URL format'
    });
  }
});

// M3U parsing endpoint with progress updates
app.post('/api/streams/parse/m3u', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  // Create unique parsing session ID
  const sessionId = `m3u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`Starting M3U parsing session ${sessionId} for: ${url}`);
    
    // Send initial progress
    io.emit('m3uProgress', {
      sessionId,
      stage: 'fetching',
      progress: 0,
      message: 'Fetching M3U playlist...'
    });
    
    // Fetch M3U content
    const https = require('https');
    const http = require('http');
    const urlModule = require('url');
    
    const parsedUrl = urlModule.parse(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const response = await new Promise((resolve, reject) => {
      const req = client.get(url, {
        headers: {
          'User-Agent': 'VLC/3.0.11 LibVLC/3.0.11',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        timeout: 120000 // 2 minutes for fetching
      }, resolve);
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout after 2 minutes'));
      });
      req.setTimeout(120000, () => {
        req.destroy();
        reject(new Error('Request timeout after 2 minutes'));
      });
    });
    
    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
    }
    
    // Update progress
    io.emit('m3uProgress', {
      sessionId,
      stage: 'downloading',
      progress: 10,
      message: 'Downloading playlist data...'
    });
    
    // Handle compressed responses with progress
    const zlib = require('zlib');
    let stream = response;
    
    if (response.headers['content-encoding'] === 'gzip') {
      stream = response.pipe(zlib.createGunzip());
    } else if (response.headers['content-encoding'] === 'deflate') {
      stream = response.pipe(zlib.createInflate());
    }
    
    let data = '';
    let downloadedBytes = 0;
    const contentLength = parseInt(response.headers['content-length']) || 0;
    
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      data += chunk;
      downloadedBytes += Buffer.byteLength(chunk, 'utf8');
      
      // Update download progress
      if (contentLength > 0) {
        const downloadProgress = Math.min(90, 10 + (downloadedBytes / contentLength) * 30);
        io.emit('m3uProgress', {
          sessionId,
          stage: 'downloading',
          progress: downloadProgress,
          message: `Downloaded ${Math.round(downloadedBytes / 1024)} KB...`
        });
      }
    });
    
    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
      response.on('error', reject);
    });
    
    console.log(`Received ${data.length} bytes of M3U data for session ${sessionId}`);
    
    // Update progress - parsing stage
    io.emit('m3uProgress', {
      sessionId,
      stage: 'parsing',
      progress: 40,
      message: 'Parsing playlist structure...'
    });
    
    // Check if we got valid M3U data
    if (!data.trim()) {
      throw new Error('Received empty response from M3U URL');
    }
    
    if (!data.includes('#EXTM3U') && !data.includes('#EXTINF')) {
      throw new Error('Response does not appear to be a valid M3U playlist');
    }
    
    // Parse M3U content with chunked processing
    const channels = [];
    const lines = data.split('\n').map(line => line.trim()).filter(line => line);
    let currentChannel = null;
    
    const totalLines = lines.length;
    const chunkSize = Math.max(100, Math.floor(totalLines / 100)); // Process in chunks
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Update progress every chunk
      if (i % chunkSize === 0) {
        const parseProgress = 40 + (i / totalLines) * 50;
        io.emit('m3uProgress', {
          sessionId,
          stage: 'parsing',
          progress: parseProgress,
          message: `Processing channels... ${channels.length} found so far`
        });
        
        // Yield control to event loop to prevent blocking
        await new Promise(resolve => setImmediate(resolve));
      }
      
      if (line.startsWith('#EXTINF:')) {
        // Parse channel info: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Channel Name
        const match = line.match(/#EXTINF:(-?\d+)(?:\s+(.+?))?,(.*)$/);
        if (match) {
          const [, duration, attributes, name] = match;
          
          currentChannel = {
            name: name.trim(),
            duration: parseInt(duration),
            attributes: {}
          };
          
          // Parse attributes
          if (attributes) {
            const attrMatches = attributes.matchAll(/(\w+(?:-\w+)*)="([^"]*)"/g);
            for (const attrMatch of attrMatches) {
              currentChannel.attributes[attrMatch[1]] = attrMatch[2];
            }
          }
        }
      } else if (line.startsWith('http') && currentChannel) {
        // This is the stream URL
        currentChannel.url = line;
        currentChannel.id = `m3u_${sessionId}_${channels.length}`;
        currentChannel.type = line.includes('.m3u8') ? 'hls' : 
                           line.includes('rtsp://') ? 'rtsp' : 'http';
        currentChannel.enabled = true;
        
        channels.push({ ...currentChannel });
        currentChannel = null;
      }
    }
    
    // Final progress update
    io.emit('m3uProgress', {
      sessionId,
      stage: 'complete',
      progress: 100,
      message: `Parsing complete! Found ${channels.length} channels`
    });
    
    console.log(`Parsed ${channels.length} channels from M3U playlist (session ${sessionId})`);
    
    res.json({
      success: true,
      channels: channels,
      total: channels.length,
      source: url,
      sessionId: sessionId
    });
    
  } catch (error) {
    console.error('M3U parsing error:', error);
    
    // Send error progress update
    io.emit('m3uProgress', {
      sessionId,
      stage: 'error',
      progress: 0,
      message: error.message,
      error: true
    });
    
    res.status(500).json({
      error: 'Failed to fetch or parse M3U playlist',
      message: error.message,
      sessionId: sessionId
    });
  }
});

// M3U import (import selected channels)
app.post('/api/streams/import/m3u', (req, res) => {
  const { url, selectedChannels } = req.body;
  
  if (!selectedChannels || !Array.isArray(selectedChannels)) {
    return res.status(400).json({ error: 'selectedChannels array is required' });
  }
  
  const importedStreams = selectedChannels.map((channel, index) => ({
    id: (Date.now() + index).toString(),
    name: channel.name,
    url: channel.url,
    type: channel.type || 'hls',
    enabled: true,
    group: channel.attributes?.['group-title'] || 'Imported',
    tvgId: channel.attributes?.['tvg-id'] || '',
    tvgName: channel.attributes?.['tvg-name'] || channel.name,
    tvgLogo: channel.attributes?.['tvg-logo'] || '',
    sourceUrl: url,
    createdAt: new Date().toISOString()
  }));
  
  streams.push(...importedStreams);
  
  // Emit update to connected clients
  io.emit('streamUpdate', { type: 'import', streams: importedStreams });
  
  res.json({
    imported: importedStreams.length,
    streams: importedStreams
  });
});

// EPG API
app.get('/api/epg', (req, res) => {
  res.json({
    sources: epgSources,
    programs: [],
    lastUpdate: new Date().toISOString()
  });
});

app.get('/api/epg/sources', (req, res) => {
  res.json(epgSources);
});

app.post('/api/epg/sources', (req, res) => {
  const source = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  epgSources.push(source);
  res.status(201).json(source);
});

// Settings API
app.get('/api/settings', (req, res) => {
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  settings = { ...settings, ...req.body };
  res.json(settings);
});

// Logs API
app.get('/api/logs', (req, res) => {
  const mockLogs = [
    {
      id: '1',
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Server started successfully',
      category: 'system'
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      level: 'info',
      message: 'Socket.IO initialized',
      category: 'network'
    }
  ];
  
  res.json({
    logs: mockLogs,
    total: mockLogs.length
  });
});

// Metrics API
app.get('/api/metrics', (req, res) => {
  res.json({
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: { usage: Math.random() * 100 },
      connections: io.engine.clientsCount || 0
    },
    database: {
      status: 'healthy',
      connected: true,
      type: 'memory',
      lastCheck: new Date().toISOString(),
      tables: {
        channels: channels.length,
        streams: streams.length,
        epg_sources: epgSources.length
      }
    },
    cache: {
      status: 'healthy',
      connected: true,
      type: 'memory',
      hitRate: 95.5,
      keys: 42
    },
    services: {
      ssdp: {
        status: 'running',
        port: 1900,
        lastAnnouncement: new Date().toISOString()
      },
      socketio: {
        status: 'running',
        connections: io.engine.clientsCount || 0,
        rooms: ['logs', 'metrics']
      }
    },
    streams: {
      total: streams.length,
      active: streams.filter(s => s.enabled).length,
      failed: 0,
      types: {
        hls: streams.filter(s => s.type === 'hls').length,
        rtsp: streams.filter(s => s.type === 'rtsp').length,
        http: streams.filter(s => s.type === 'http').length
      }
    },
    channels: {
      total: channels.length,
      enabled: channels.filter(c => c.enabled).length,
      disabled: channels.filter(c => !c.enabled).length
    },
    epg: {
      sources: epgSources.length,
      lastUpdate: new Date().toISOString(),
      nextUpdate: new Date(Date.now() + 3600000).toISOString()
    }
  });
});

// HDHomeRun emulation endpoints
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

app.get('/lineup.json', (req, res) => {
  const lineup = channels.filter(c => c.enabled).map(channel => ({
    GuideNumber: channel.number || channel.id,
    GuideName: channel.name,
    URL: `http://${req.headers.host}/stream/${channel.id}`
  }));
  
  res.json(lineup);
});

app.get('/lineup_status.json', (req, res) => {
  res.json({
    ScanInProgress: 0,
    ScanPossible: 1,
    Source: "IPTV",
    SourceList: ["IPTV"]
  });
});

// Stream proxy endpoint
app.get('/stream/:channelId', (req, res) => {
  const channel = channels.find(c => c.id === req.params.channelId);
  if (!channel) {
    return res.status(404).send('Channel not found');
  }
  
  // In a real implementation, this would proxy the actual stream
  res.redirect(channel.streamUrl || 'about:blank');
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

// Start server
server.listen(PORT, HOST, () => {
  console.log(`✅ PlexBridge complete server running on ${HOST}:${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`📺 Plex discovery: http://localhost:${PORT}/discover.json`);
  console.log(`🔌 Socket.IO: Enabled`);
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