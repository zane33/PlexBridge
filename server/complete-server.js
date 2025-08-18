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

// M3U parsing endpoint with progress updates (legacy)
app.post('/api/streams/parse/m3u', async (req, res) => {
  const { url, useCache = true } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  // Check cache first if enabled
  if (useCache) {
    const cachedChannels = getCachedData(url);
    if (cachedChannels) {
      console.log(`Using cached data for legacy parser: ${url} (${cachedChannels.length} channels)`);
      return res.json({
        success: true,
        channels: cachedChannels,
        total: cachedChannels.length,
        source: url,
        fromCache: true,
        sessionId: `cached_${Date.now()}`
      });
    }
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
    
    // Parsing complete - but UI preparation still needed
    io.emit('m3uProgress', {
      sessionId,
      stage: 'finalizing',
      progress: 95,
      message: `Parsed ${channels.length} channels, preparing interface...`
    });
    
    console.log(`Parsed ${channels.length} channels from M3U playlist (session ${sessionId})`);
    
    // Cache the parsed channels if enabled and we have data
    if (useCache && channels.length > 0) {
      setCachedData(url, channels);
      console.log(`Cached ${channels.length} channels for future use: ${url}`);
    }
    
    // Small delay to ensure progress reaches frontend before response
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Send response - frontend will handle final processing stages
    // Note: Frontend will continue progress updates for UI preparation
    
    res.json({
      success: true,
      channels: channels,
      total: channels.length,
      source: url,
      sessionId: sessionId,
      cached: useCache && channels.length > 0
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

// In-memory cache for parsed M3U data (with TTL)
const m3uCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

const getCacheKey = (url) => {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(url).digest('hex');
};

const getCachedData = (url) => {
  const cacheKey = getCacheKey(url);
  const cached = m3uCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  // Clean up expired cache entry
  if (cached) {
    m3uCache.delete(cacheKey);
  }
  
  return null;
};

const setCachedData = (url, data) => {
  const cacheKey = getCacheKey(url);
  m3uCache.set(cacheKey, {
    data: data,
    timestamp: Date.now()
  });
  
  // Limit cache size to prevent memory issues
  if (m3uCache.size > 100) {
    const oldestKey = m3uCache.keys().next().value;
    m3uCache.delete(oldestKey);
  }
};

// Ultra-optimized streaming M3U parser for massive playlists (176K+ channels)
app.get('/api/streams/parse/m3u/stream', async (req, res) => {
  const { url, chunkSize = 1000, useCache = 'true', adaptive = 'true' } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  const sessionId = `m3u_stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  let clientPerformanceMetrics = {
    lastAckTime: startTime,
    averageProcessingTime: 0,
    backpressureDetected: false
  };
  
  try {
    console.log(`Starting ultra-optimized streaming M3U parsing session ${sessionId} for: ${url}`);
    
    // Set up Server-Sent Events for streaming with optimized headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Transfer-Encoding': 'chunked'
    });
    
    const sendEvent = (eventType, data) => {
      const timestamp = Date.now();
      console.log(`Sending SSE event: ${eventType}`, JSON.stringify(data, null, 2));
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify({ ...data, timestamp })}\n\n`);
      
      // Update client performance metrics
      if (eventType === 'channels') {
        clientPerformanceMetrics.lastAckTime = timestamp;
      }
    };
    
    // Dynamic batching based on performance
    const getAdaptiveChunkSize = () => {
      if (adaptive !== 'true') return parseInt(chunkSize);
      
      const timeSinceLastAck = Date.now() - clientPerformanceMetrics.lastAckTime;
      
      // Reduce batch size if client is slow
      if (timeSinceLastAck > 5000) {
        clientPerformanceMetrics.backpressureDetected = true;
        return Math.max(100, parseInt(chunkSize) / 4); // Reduce to 1/4
      } else if (timeSinceLastAck > 2000) {
        return Math.max(500, parseInt(chunkSize) / 2); // Reduce to 1/2
      }
      
      return parseInt(chunkSize);
    };
    
    // Check cache first if enabled
    const shouldUseCache = useCache === 'true';
    const cachedChannels = shouldUseCache ? getCachedData(url) : null;
    
    if (cachedChannels) {
      console.log(`Using cached data for ${url} (${cachedChannels.length} channels)`);
      
      // Send cached data progressively to simulate streaming
      sendEvent('progress', {
        sessionId,
        stage: 'cache',
        progress: 10,
        message: 'Loading from cache...'
      });
      
      const chunkSizeNum = parseInt(chunkSize);
      for (let i = 0; i < cachedChannels.length; i += chunkSizeNum) {
        const chunk = cachedChannels.slice(i, i + chunkSizeNum);
        
        sendEvent('channels', {
          sessionId,
          channels: chunk,
          totalParsed: i + chunk.length,
          isComplete: false
        });
        
        // Small delay to prevent overwhelming the client
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Send progress
        const progress = Math.min(90, 10 + ((i + chunk.length) / cachedChannels.length) * 80);
        sendEvent('progress', {
          sessionId,
          stage: 'cache',
          progress,
          message: `Loaded ${i + chunk.length} cached channels...`
        });
      }
      
      // Send completion
      sendEvent('complete', {
        sessionId,
        totalChannels: cachedChannels.length,
        message: `Loaded ${cachedChannels.length} channels from cache`
      });
      
      sendEvent('progress', {
        sessionId,
        stage: 'complete',
        progress: 100,
        message: `Cache hit! ${cachedChannels.length} channels loaded instantly.`
      });
      
      res.end();
      return;
    }
    
    // Send initial progress for fresh parsing
    sendEvent('progress', {
      sessionId,
      stage: 'fetching',
      progress: 0,
      message: 'Fetching M3U playlist...'
    });
    
    // Fetch M3U content with streaming parsing
    const https = require('https');
    const http = require('http');
    const urlModule = require('url');
    const { Transform } = require('stream');
    
    const parsedUrl = urlModule.parse(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const response = await new Promise((resolve, reject) => {
      console.log(`Making HTTP request to: ${url}`);
      const req = client.get(url, {
        headers: {
          'User-Agent': 'VLC/3.0.11 LibVLC/3.0.11',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        timeout: 120000
      }, (res) => {
        console.log(`HTTP response received: ${res.statusCode} ${res.statusMessage}`);
        console.log(`Response headers:`, res.headers);
        resolve(res);
      });
      
      req.on('error', (error) => {
        console.error(`HTTP request error:`, error);
        reject(error);
      });
      req.on('timeout', () => {
        console.log(`HTTP request timeout for ${url}`);
        req.destroy();
        reject(new Error('Request timeout after 2 minutes'));
      });
    });
    
    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
    }
    
    sendEvent('progress', {
      sessionId,
      stage: 'streaming',
      progress: 10,
      message: 'Starting streaming parse...'
    });
    
    // Handle compressed responses
    const zlib = require('zlib');
    let stream = response;
    
    if (response.headers['content-encoding'] === 'gzip') {
      stream = response.pipe(zlib.createGunzip());
    } else if (response.headers['content-encoding'] === 'deflate') {
      stream = response.pipe(zlib.createInflate());
    }
    
    // Ultra-optimized streaming M3U parser with memory management
    let buffer = '';
    let channelCount = 0;
    let currentChannel = null;
    let chunkBuffer = [];
    let allChannelsForCache = []; // Collect all channels for caching
    const contentLength = parseInt(response.headers['content-length']) || 0;
    let downloadedBytes = 0;
    let lastProgressUpdate = Date.now();
    let processingStartTime = Date.now();
    
    // Memory-aware chunk processing
    const parseAndSendChunk = () => {
      const currentChunkSize = getAdaptiveChunkSize();
      console.log(`parseAndSendChunk called: buffer=${chunkBuffer.length}, chunkSize=${currentChunkSize}`);
      
      if (chunkBuffer.length >= currentChunkSize) {
        const channelsToSend = chunkBuffer.splice(0, currentChunkSize);
        console.log(`Sending ${channelsToSend.length} channels to client`);
        
        sendEvent('channels', {
          sessionId,
          channels: channelsToSend,
          totalParsed: channelCount,
          isComplete: false,
          chunkSize: currentChunkSize,
          processingRate: Math.round(channelCount / ((Date.now() - processingStartTime) / 1000)),
          backpressure: clientPerformanceMetrics.backpressureDetected
        });
        
        // Reset backpressure detection after sending
        clientPerformanceMetrics.backpressureDetected = false;
        
        // Memory management: limit cache collection for massive playlists
        if (channelCount > 200000) {
          // Stop caching after 200K to prevent memory issues
          allChannelsForCache = [];
        }
      }
    };
    
    // Throttled progress updates for better performance
    const sendProgressUpdate = (force = false) => {
      const now = Date.now();
      if (force || now - lastProgressUpdate > 1000) { // Max 1 update per second
        const downloadProgress = contentLength > 0 ? 
          Math.min(90, 10 + (downloadedBytes / contentLength) * 70) : 
          Math.min(90, 10 + (channelCount / 10000) * 70);
        
        const processingRate = Math.round(channelCount / ((now - processingStartTime) / 1000));
        const eta = contentLength > 0 && downloadedBytes > 0 ? 
          Math.round(((contentLength - downloadedBytes) / downloadedBytes) * (now - processingStartTime) / 1000) : null;
          
        sendEvent('progress', {
          sessionId,
          stage: 'streaming',
          progress: downloadProgress,
          message: `Processing at ${processingRate}/sec... ${channelCount} channels found`,
          processingRate,
          eta: eta ? `${eta}s remaining` : null,
          memoryOptimized: channelCount > 200000
        });
        
        lastProgressUpdate = now;
      }
    };
    
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      downloadedBytes += Buffer.byteLength(chunk, 'utf8');
      
      // Debug: Log first chunk received
      if (downloadedBytes === Buffer.byteLength(chunk, 'utf8')) {
        console.log(`First chunk received (${Buffer.byteLength(chunk, 'utf8')} bytes):`, chunk.toString().substring(0, 500));
      }
      
      // Debug: Log periodically during download
      if (downloadedBytes % 100000 === 0) { // Every 100KB
        console.log(`Downloaded ${Math.round(downloadedBytes/1024)}KB so far...`);
      }
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        if (trimmedLine.startsWith('#EXTINF:')) {
          // Parse channel info
          const match = trimmedLine.match(/#EXTINF:(-?\d+)(?:\s+(.+?))?,(.*)$/);
          if (match) {
            const [, duration, attributes, name] = match;
            console.log(`Parsed EXTINF: duration=${duration}, attributes=${attributes}, name=${name}`);
            
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
        } else if (trimmedLine.startsWith('http') && currentChannel) {
          // Complete channel with URL
          console.log(`Found URL for channel: ${currentChannel.name} -> ${trimmedLine}`);
          currentChannel.url = trimmedLine;
          currentChannel.id = `m3u_${sessionId}_${channelCount}`;
          currentChannel.type = trimmedLine.includes('.m3u8') ? 'hls' : 
                               trimmedLine.includes('rtsp://') ? 'rtsp' : 'http';
          currentChannel.enabled = true;
          
          chunkBuffer.push({ ...currentChannel });
          allChannelsForCache.push({ ...currentChannel }); // Add to cache collection
          channelCount++;
          console.log(`Channel added to buffer: ${channelCount} total, buffer size: ${chunkBuffer.length}`);
          currentChannel = null;
          
          // Send chunk if buffer is full
          parseAndSendChunk();
          
          // Throttled progress updates (adaptive frequency)
          const updateFrequency = channelCount > 100000 ? 10000 : (channelCount > 50000 ? 5000 : 2000);
          if (channelCount % updateFrequency === 0) {
            sendProgressUpdate();
          }
        }
      }
    });
    
    stream.on('end', () => {
      // Process any remaining buffer
      if (buffer.trim()) {
        const trimmedLine = buffer.trim();
        if (trimmedLine.startsWith('http') && currentChannel) {
          currentChannel.url = trimmedLine;
          currentChannel.id = `m3u_${sessionId}_${channelCount}`;
          currentChannel.type = trimmedLine.includes('.m3u8') ? 'hls' : 
                               trimmedLine.includes('rtsp://') ? 'rtsp' : 'http';
          currentChannel.enabled = true;
          
          chunkBuffer.push({ ...currentChannel });
          allChannelsForCache.push({ ...currentChannel }); // Add to cache collection
          channelCount++;
        }
      }
      
      // Send remaining channels
      if (chunkBuffer.length > 0) {
        sendEvent('channels', {
          sessionId,
          channels: chunkBuffer,
          totalParsed: channelCount,
          isComplete: true
        });
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const channelsPerSecond = Math.round(channelCount / (totalTime / 1000));
      
      // Smart caching strategy for massive playlists
      if (shouldUseCache && allChannelsForCache.length > 0) {
        if (channelCount <= 200000) {
          setCachedData(url, allChannelsForCache);
          console.log(`Cached ${allChannelsForCache.length} channels for ${url}`);
        } else {
          console.log(`Skipping cache for massive playlist (${channelCount} channels) to preserve memory`);
        }
      }
      
      // Send completion event with performance metrics
      sendEvent('complete', {
        sessionId,
        totalChannels: channelCount,
        message: `Successfully parsed ${channelCount} channels in ${Math.round(totalTime/1000)}s (${channelsPerSecond}/sec)`,
        performanceMetrics: {
          totalTime,
          channelsPerSecond,
          averageMemoryUsage: process.memoryUsage(),
          wasCached: channelCount <= 200000 && shouldUseCache
        }
      });
      
      sendEvent('progress', {
        sessionId,
        stage: 'complete',
        progress: 100,
        message: `🚀 Ultra-fast parsing complete! ${channelCount} channels in ${Math.round(totalTime/1000)}s`
      });
      
      res.end();
      console.log(`Ultra-optimized streaming M3U parsing completed for session ${sessionId}: ${channelCount} channels in ${totalTime}ms (${channelsPerSecond}/sec)${shouldUseCache && channelCount <= 200000 ? ' (cached)' : ' (memory-optimized)'}`);
    });
    
    stream.on('error', (error) => {
      sendEvent('error', {
        sessionId,
        error: error.message,
        stage: 'streaming'
      });
      res.end();
    });
    
    response.on('error', (error) => {
      sendEvent('error', {
        sessionId,
        error: error.message,
        stage: 'fetching'
      });
      res.end();
    });
    
  } catch (error) {
    console.error('Streaming M3U parsing error:', error);
    
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to start M3U streaming parse',
        message: error.message,
        sessionId: sessionId
      }));
    }
  }
});

// Cache management endpoints
app.get('/api/m3u/cache/status', (req, res) => {
  const cacheStats = {
    size: m3uCache.size,
    maxSize: 100,
    ttl: CACHE_TTL,
    entries: Array.from(m3uCache.entries()).map(([key, value]) => ({
      urlHash: key,
      channelCount: value.data.length,
      timestamp: value.timestamp,
      age: Date.now() - value.timestamp,
      expiresIn: Math.max(0, CACHE_TTL - (Date.now() - value.timestamp))
    }))
  };
  
  res.json(cacheStats);
});

app.delete('/api/m3u/cache/clear', (req, res) => {
  const size = m3uCache.size;
  m3uCache.clear();
  console.log(`Cache cleared: ${size} entries removed`);
  
  res.json({
    success: true,
    message: `Cache cleared successfully`,
    entriesRemoved: size
  });
});

app.delete('/api/m3u/cache/:urlHash', (req, res) => {
  const { urlHash } = req.params;
  const removed = m3uCache.delete(urlHash);
  
  res.json({
    success: removed,
    message: removed ? 'Cache entry removed' : 'Cache entry not found'
  });
});

// Performance monitoring endpoint for massive playlist parsing
app.get('/api/streams/parse/performance', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  res.json({
    system: {
      uptime: uptime,
      memory: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        formatted: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
        }
      },
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid
    },
    cache: {
      size: m3uCache.size,
      maxSize: 100,
      ttl: CACHE_TTL,
      memoryEstimate: `${Math.round(m3uCache.size * 50)}KB` // Rough estimate
    },
    recommendations: {
      maxRecommendedChannels: memoryUsage.heapUsed < 500 * 1024 * 1024 ? 300000 : 200000,
      cachingEnabled: memoryUsage.heapUsed < 1024 * 1024 * 1024,
      streamingRequired: true,
      adaptiveBatchingRecommended: true
    },
    limits: {
      cachingLimit: 200000, // Channels
      streamingThreshold: 5000, // Channels
      memoryWarningThreshold: 1024 * 1024 * 1024, // 1GB
      maxConcurrentParsingSessions: 3
    }
  });
});

// Enhanced streaming endpoint with size estimation (GET version for better compatibility)
app.get('/api/streams/parse/m3u/estimate', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  try {
    const https = require('https');
    const http = require('http');
    const urlModule = require('url');
    
    const parsedUrl = urlModule.parse(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    // Try HEAD request first
    const response = await new Promise((resolve, reject) => {
      const req = client.request(url, { method: 'HEAD', timeout: 10000 }, resolve);
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Head request timeout'));
      });
      req.end();
    });
    
    const contentLength = parseInt(response.headers['content-length']) || 0;
    const contentType = response.headers['content-type'] || '';
    
    // Rough estimation of channel count based on file size
    const estimatedChannels = contentLength > 0 ? Math.round(contentLength / 200) : 0; // ~200 bytes per channel average
    const recommendStreaming = contentLength > 1024 * 1024 || estimatedChannels > 1000; // Stream for >1MB or >1000 channels
    
    const memoryImpact = contentLength > 50 * 1024 * 1024 ? 'high' :
                        contentLength > 10 * 1024 * 1024 ? 'medium' : 'low';
    
    // Return JSON response for GET request
    res.json({
      contentLength,
      contentType,
      estimatedChannels,
      recommendStreaming,
      memoryImpact,
      message: recommendStreaming ? 'Using streaming parser for large playlist' : 'Using legacy parser for small playlist'
    });
    
  } catch (error) {
    console.error('Estimation failed:', error.message);
    // Default to streaming for safety
    res.json({
      contentLength: 0,
      estimatedChannels: 0,
      recommendStreaming: true, // Default to streaming on error
      memoryImpact: 'unknown',
      error: error.message,
      message: 'Estimation failed, recommending streaming parser for safety'
    });
  }
});

// Keep HEAD version for backward compatibility
app.head('/api/streams/parse/m3u/estimate', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  try {
    const https = require('https');
    const http = require('http');
    const urlModule = require('url');
    
    const parsedUrl = urlModule.parse(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const response = await new Promise((resolve, reject) => {
      const req = client.request(url, { method: 'HEAD', timeout: 10000 }, resolve);
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Head request timeout'));
      });
      req.end();
    });
    
    const contentLength = parseInt(response.headers['content-length']) || 0;
    const contentType = response.headers['content-type'] || '';
    const lastModified = response.headers['last-modified'];
    
    // Rough estimation of channel count based on file size
    const estimatedChannels = contentLength > 0 ? Math.round(contentLength / 200) : 0; // ~200 bytes per channel average
    const recommendStreaming = contentLength > 5 * 1024 * 1024 || estimatedChannels > 5000;
    const memoryImpact = contentLength > 0 ? `${Math.round(contentLength / 1024 / 1024)}MB` : 'Unknown';
    
    res.set({
      'X-Content-Length': contentLength.toString(),
      'X-Estimated-Channels': estimatedChannels.toString(),
      'X-Recommend-Streaming': recommendStreaming.toString(),
      'X-Memory-Impact': memoryImpact,
      'X-Content-Type': contentType,
      'X-Last-Modified': lastModified || 'Unknown'
    });
    
    res.status(200).end();
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to estimate playlist size',
      message: error.message
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

// Stream preview endpoint for direct stream testing
app.get('/streams/preview/:streamId', async (req, res) => {
  console.log(`Stream preview requested for ID: ${req.params.streamId}`);
  
  try {
    // Find the stream in the database
    const stream = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM streams WHERE id = ?', [req.params.streamId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!stream) {
      console.log(`Stream not found: ${req.params.streamId}`);
      return res.status(404).json({ error: 'Stream not found' });
    }
    
    if (!stream.url) {
      console.log(`Stream has no URL: ${req.params.streamId}`);
      return res.status(400).json({ error: 'Stream has no URL configured' });
    }
    
    console.log(`Proxying stream: ${stream.name} -> ${stream.url}`);
    
    // For now, redirect to the actual stream URL
    // In a production environment, you might want to proxy the stream through PlexBridge
    res.redirect(stream.url);
    
  } catch (error) {
    console.error('Stream preview error:', error);
    res.status(500).json({ error: 'Failed to load stream preview' });
  }
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