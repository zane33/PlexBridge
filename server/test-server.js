// Updated with express.json() middleware fix - v2
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const PORT = 8080;

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const M3UParser = require('./services/m3uParser');

// Real-time data tracking
const activeStreams = new Map(); // Track active streaming sessions
const streamSessions = [];
let channelData = [];
let streamData = [];

// Function to get real metrics
function getRealMetrics() {
  const memUsage = process.memoryUsage();
  
  return {
    streams: {
      active: activeStreams.size,
      maximum: 10, // Configuration-based
      utilization: Math.round((activeStreams.size / 10) * 100)
    },
    system: {
      uptime: Math.floor(process.uptime()),
      platform: process.platform,
      nodeVersion: process.version,
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external
      }
    },
    database: {
      status: 'healthy'
    },
    cache: {
      status: 'connected'
    },
    epg: {
      sources: [],
      programs: {
        total: 0,
        upcoming24h: 0
      },
      isInitialized: false
    }
  };
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Test server running' });
});

// Basic API endpoints
app.get('/api/status', (req, res) => {
  res.json({ status: 'running', mode: 'simplified' });
});

app.get('/api/metrics', (req, res) => {
  res.json(getRealMetrics());
});

// Channel Manager API endpoints
app.get('/api/channels', (req, res) => {
  res.json(channelData);
});

app.get('/api/streams', (req, res) => {
  res.json(streamData);
});

app.post('/api/channels', (req, res) => {
  res.json({ success: true, message: 'Channel created (mock)' });
});

app.put('/api/channels/:id', (req, res) => {
  res.json({ success: true, message: 'Channel updated (mock)' });
});

app.delete('/api/channels/:id', (req, res) => {
  res.json({ success: true, message: 'Channel deleted (mock)' });
});

// Stream Manager API endpoints
app.post('/api/streams', (req, res) => {
  res.json({ success: true, message: 'Stream created (mock)' });
});

app.post('/api/streams/import', async (req, res) => {
  try {
    const { url, auth_username, auth_password, auto_create_channels, validate_streams } = req.body;

    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is required' 
      });
    }

    console.log(`Starting M3U import from: ${url}`);
    
    const parser = new M3UParser();
    const channels = await parser.parseFromUrl(url, {
      auth_username,
      auth_password
    });

    if (validate_streams) {
      console.log('Validating stream URLs...');
      const validatedChannels = await parser.validateChannels(channels, {
        validate_streams: true,
        include_invalid: true
      });
      
      if (auto_create_channels) {
        // Store channels and streams in memory for this demo
        let channelNumber = channelData.length + 1;
        
        for (const channel of validatedChannels) {
          if (channel.status === 'valid' || !validate_streams) {
            // Create channel
            const newChannel = {
              id: `ch_${Date.now()}_${channelNumber}`,
              number: channelNumber++,
              name: channel.name,
              enabled: true,
              logo: channel.logo || null,
              epg_id: channel.epg_id || null,
              group: channel.group || 'General',
              created_at: new Date().toISOString()
            };
            
            // Create stream
            const newStream = {
              id: `st_${Date.now()}_${channelNumber}`,
              channel_id: newChannel.id,
              name: `${channel.name} Stream`,
              url: channel.url,
              type: channel.type,
              enabled: true,
              auth_username: auth_username || null,
              auth_password: auth_password || null,
              created_at: new Date().toISOString()
            };
            
            channelData.push(newChannel);
            streamData.push(newStream);
          }
        }
        
        console.log(`Successfully imported ${validatedChannels.filter(c => c.status === 'valid').length} channels`);
      }

      return res.json({
        success: true,
        message: `M3U imported successfully`,
        imported_count: validatedChannels.filter(c => c.status === 'valid').length,
        total_found: channels.length,
        validation_results: validatedChannels,
        auto_created: auto_create_channels
      });
    } else {
      if (auto_create_channels) {
        // Store channels without validation
        let channelNumber = channelData.length + 1;
        
        for (const channel of channels) {
          const newChannel = {
            id: `ch_${Date.now()}_${channelNumber}`,
            number: channelNumber++,
            name: channel.name,
            enabled: true,
            logo: channel.logo || null,
            epg_id: channel.epg_id || null,
            group: channel.group || 'General',
            created_at: new Date().toISOString()
          };
          
          const newStream = {
            id: `st_${Date.now()}_${channelNumber}`,
            channel_id: newChannel.id,
            name: `${channel.name} Stream`,
            url: channel.url,
            type: channel.type,
            enabled: true,
            auth_username: auth_username || null,
            auth_password: auth_password || null,
            created_at: new Date().toISOString()
          };
          
          channelData.push(newChannel);
          streamData.push(newStream);
        }
      }

      return res.json({
        success: true,
        message: `M3U parsed successfully`,
        imported_count: channels.length,
        channels: channels,
        auto_created: auto_create_channels
      });
    }
  } catch (error) {
    console.error('M3U import error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put('/api/streams/:id', (req, res) => {
  res.json({ success: true, message: 'Stream updated (mock)' });
});

app.delete('/api/streams/:id', (req, res) => {
  const { id } = req.params;
  
  // Find the stream to delete
  const streamIndex = streamData.findIndex(stream => stream.id === id);
  
  if (streamIndex === -1) {
    return res.status(404).json({ 
      success: false, 
      error: 'Stream not found' 
    });
  }
  
  const deletedStream = streamData[streamIndex];
  
  // Remove the stream from the array
  streamData.splice(streamIndex, 1);
  
  // Remove the associated channel if it exists
  const channelIndex = channelData.findIndex(channel => channel.id === deletedStream.channel_id);
  if (channelIndex !== -1) {
    channelData.splice(channelIndex, 1);
  }
  
  console.log(`Stream deleted: ${deletedStream.name} (ID: ${id})`);
  
  res.json({ 
    success: true, 
    message: 'Stream deleted successfully',
    deleted_stream: {
      id: deletedStream.id,
      name: deletedStream.name
    }
  });
});

// EPG Manager API endpoints
const epgSources = []; // In-memory storage for EPG sources

app.get('/api/epg/sources', (req, res) => {
  res.json(epgSources);
});

app.post('/api/epg/sources', (req, res) => {
  const { name, url, refresh_interval, enabled } = req.body;
  
  // Basic validation
  if (!name || !url) {
    return res.status(400).json({ 
      error: 'Name and URL are required' 
    });
  }
  
  const newSource = {
    id: `epg_${Date.now()}`,
    name,
    url,
    refresh_interval: refresh_interval || '4h',
    enabled: enabled !== undefined ? enabled : true,
    created_at: new Date().toISOString(),
    last_update: null,
    last_success: null,
    last_error: null
  };
  
  epgSources.push(newSource);
  console.log(`EPG source created: ${name} (${url})`);
  
  res.status(201).json(newSource);
});

app.put('/api/epg/sources/:id', (req, res) => {
  const { id } = req.params;
  const sourceIndex = epgSources.findIndex(s => s.id === id);
  
  if (sourceIndex === -1) {
    return res.status(404).json({ error: 'EPG source not found' });
  }
  
  const { name, url, refresh_interval, enabled } = req.body;
  epgSources[sourceIndex] = {
    ...epgSources[sourceIndex],
    name: name || epgSources[sourceIndex].name,
    url: url || epgSources[sourceIndex].url,
    refresh_interval: refresh_interval || epgSources[sourceIndex].refresh_interval,
    enabled: enabled !== undefined ? enabled : epgSources[sourceIndex].enabled,
    updated_at: new Date().toISOString()
  };
  
  res.json(epgSources[sourceIndex]);
});

app.delete('/api/epg/sources/:id', (req, res) => {
  const { id } = req.params;
  const sourceIndex = epgSources.findIndex(s => s.id === id);
  
  if (sourceIndex === -1) {
    return res.status(404).json({ error: 'EPG source not found' });
  }
  
  epgSources.splice(sourceIndex, 1);
  res.json({ message: 'EPG source deleted successfully' });
});

app.post('/api/epg/refresh', (req, res) => {
  const { source_id } = req.body;
  
  if (source_id) {
    const source = epgSources.find(s => s.id === source_id);
    if (source) {
      source.last_update = new Date().toISOString();
      console.log(`EPG refresh triggered for source: ${source.name}`);
    }
  } else {
    epgSources.forEach(source => {
      source.last_update = new Date().toISOString();
    });
    console.log('EPG refresh triggered for all sources');
  }
  
  res.json({ 
    message: source_id ? `EPG refresh started for source ${source_id}` : 'EPG refresh started for all sources' 
  });
});

app.get('/api/epg/channels', (req, res) => {
  res.json({ available_channels: [] });
});

app.get('/api/epg/programs', (req, res) => {
  res.json([]);
});

// Test endpoint to debug routing
app.get('/api/server/test', (req, res) => {
  res.json({ message: 'Test endpoint working' });
});

// Server information endpoint - Required for Dashboard
app.get('/api/server/info', (req, res) => {
  try {
    const os = require('os');
    
    // Get network interfaces
    const networkInterfaces = os.networkInterfaces();
    const ipAddresses = [];
    
    Object.keys(networkInterfaces).forEach(interfaceName => {
      const addresses = networkInterfaces[interfaceName];
      addresses.forEach(address => {
        if (address.family === 'IPv4' && !address.internal) {
          ipAddresses.push({
            interface: interfaceName,
            address: address.address,
            netmask: address.netmask
          });
        }
      });
    });

    // Get primary server host
    const serverHost = req.get('host') || `${req.hostname}:${PORT}`;
    const protocol = req.secure ? 'https' : 'http';
    const baseUrl = `${protocol}://${serverHost}`;

    const serverInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      port: PORT,
      baseUrl,
      ipAddresses,
      urls: {
        webInterface: baseUrl,
        m3uPlaylist: `${baseUrl}/playlist.m3u`,
        epgXml: `${baseUrl}/epg/xmltv`,
        tunerDiscovery: `${baseUrl}/device.xml`,
        channelLineup: `${baseUrl}/lineup.json`
      },
      tuner: {
        deviceType: 'SiliconDust HDHomeRun',
        friendlyName: process.env.DEVICE_NAME || 'PlexTV Bridge',
        manufacturer: 'PlexTV Bridge',
        modelName: 'PlexTV Bridge',
        deviceId: process.env.DEVICE_ID || 'PLEXTV001',
        firmwareVersion: '1.0.0'
      }
    };

    res.json(serverInfo);
  } catch (error) {
    console.error('Server info error:', error);
    res.status(500).json({ error: 'Failed to get server information' });
  }
});

// Settings API endpoints
app.get('/api/settings', (req, res) => {
  res.json({});
});

app.post('/api/settings', (req, res) => {
  res.json({ success: true, message: 'Settings saved (mock)' });
});

// Active streams endpoint - Required for Dashboard
app.get('/streams/active', (req, res) => {
  try {
    const activeStreamsList = Array.from(activeStreams.entries()).map(([sessionId, streamInfo]) => {
      const duration = Date.now() - streamInfo.startTime.getTime();
      
      return {
        sessionId,
        streamId: streamInfo.streamId,
        clientIP: streamInfo.clientIp,
        startTime: streamInfo.startTime.toISOString(),
        duration,
        bytesTransferred: Math.floor(Math.random() * 1000000), // Mock data for demo
        userAgent: streamInfo.userAgent
      };
    });

    const concurrencyMetrics = {
      total: activeStreams.size,
      byChannel: {},
      byClient: {}
    };

    // Group by channel and client for metrics
    activeStreamsList.forEach(stream => {
      concurrencyMetrics.byChannel[stream.streamId] = (concurrencyMetrics.byChannel[stream.streamId] || 0) + 1;
      concurrencyMetrics.byClient[stream.clientIP] = (concurrencyMetrics.byClient[stream.clientIP] || 0) + 1;
    });

    res.json({
      streams: activeStreamsList,
      streamsByChannel: concurrencyMetrics.byChannel,
      metrics: concurrencyMetrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Active streams error:', error);
    res.status(500).json({ error: 'Failed to fetch active streams' });
  }
});

// Stream playback endpoints for testing
app.get('/stream/:streamId', (req, res) => {
  const { streamId } = req.params;
  const clientId = req.ip + '_' + Date.now();
  
  console.log(`Stream request for ${streamId} from ${req.ip}`);
  
  // Track active stream session
  activeStreams.set(clientId, {
    streamId,
    clientIp: req.ip,
    startTime: new Date(),
    userAgent: req.get('User-Agent')
  });
  
  // Find the stream
  const stream = streamData.find(s => s.id === streamId);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  
  // For testing, redirect to the actual stream URL
  // In production, this would proxy/transcode the stream
  res.redirect(302, stream.url);
  
  // Remove from active streams after 30 seconds (demo)
  setTimeout(() => {
    activeStreams.delete(clientId);
    console.log(`Stream session ended for ${streamId}`);
  }, 30000);
});

app.get('/streams/:streamId/info', (req, res) => {
  const { streamId } = req.params;
  const stream = streamData.find(s => s.id === streamId);
  
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  
  res.json({
    ...stream,
    playback_url: `/stream/${streamId}`,
    active_sessions: Array.from(activeStreams.values()).filter(s => s.streamId === streamId).length
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Send initial real metrics
  socket.emit('metrics:update', getRealMetrics());
  
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

// Send real-time metrics updates every 5 seconds
setInterval(() => {
  io.to('metrics').emit('metrics:update', getRealMetrics());
}, 5000);

// Serve static files from client/build
app.use(express.static(path.join(__dirname, '../client/build')));

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Test server running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.IO server ready`);
});