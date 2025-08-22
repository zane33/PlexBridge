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
const PORT = 3000;

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Include routes
const streamsRouter = require('./routes/streams');
// Note: We'll define our own API endpoints for testing instead of using apiRouter
app.use('/streams', streamsRouter);

const M3UParser = require('./services/m3uParser');

// Real-time data tracking
const activeStreams = new Map(); // Track active streaming sessions
const streamSessions = [];
let channelData = [
  {
    id: 'ch_001',
    name: 'Test Channel 1',
    number: 101,
    enabled: true,
    logo: null,
    epg_id: null
  },
  {
    id: 'ch_002', 
    name: 'Test Channel 2',
    number: 102,
    enabled: true,
    logo: null,
    epg_id: null
  },
  {
    id: 'ch_003',
    name: 'Test Channel 3', 
    number: 103,
    enabled: true,
    logo: null,
    epg_id: null
  }
];
let streamData = [];

// Function to get real metrics
function getRealMetrics() {
  const memUsage = process.memoryUsage();
  const maxStreams = savedSettings?.plexlive?.streaming?.maxConcurrentStreams || 10;
  
  return {
    streams: {
      active: activeStreams.size,
      maximum: maxStreams, // Use actual configuration
      utilization: Math.round((activeStreams.size / maxStreams) * 100)
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
  console.log('Creating new stream:', req.body);
  
  // Create a new stream object
  const newStream = {
    id: `stream_${Date.now()}`,
    channel_id: req.body.channel_id,
    name: req.body.name,
    url: req.body.url,
    type: req.body.type || 'hls',
    enabled: req.body.enabled !== false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  // Add to streams array
  streamData.push(newStream);
  
  console.log(`Stream created: ${newStream.name} (ID: ${newStream.id})`);
  res.json({ success: true, message: 'Stream created', stream: newStream });
});

app.post('/api/streams/import', async (req, res) => {
  try {
    const { url, auth_username, auth_password, auto_create_channels, validate_streams, channels } = req.body;

    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is required' 
      });
    }

    console.log(`Starting M3U import from: ${url}`);
    
    // If specific channels are provided, use those; otherwise parse from URL
    let channelsToProcess;
    if (channels && channels.length > 0) {
      channelsToProcess = channels;
      console.log(`Using ${channelsToProcess.length} pre-selected channels`);
    } else {
      const parser = new M3UParser();
      channelsToProcess = await parser.parseFromUrl(url, {
        auth_username,
        auth_password
      });
    }

    if (validate_streams) {
      console.log('Validating stream URLs...');
      const parser = new M3UParser();
      const validatedChannels = await parser.validateChannels(channelsToProcess, {
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
        total_found: channelsToProcess.length,
        validation_results: validatedChannels,
        auto_created: auto_create_channels,
        channelsCreated: validatedChannels.filter(c => c.status === 'valid').length,
        streamsCreated: validatedChannels.filter(c => c.status === 'valid').length
      });
    } else {
      if (auto_create_channels) {
        // Store channels without validation
        let channelNumber = channelData.length + 1;
        
        for (const channel of channelsToProcess) {
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
        imported_count: channelsToProcess.length,
        channels: channelsToProcess,
        auto_created: auto_create_channels,
        channelsCreated: auto_create_channels ? channelsToProcess.length : 0,
        streamsCreated: auto_create_channels ? channelsToProcess.length : 0
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
let savedSettings = {
  plexlive: {
    ssdp: {
      enabled: true,
      discoverableInterval: 30000,
      announceInterval: 1800000,
      multicastAddress: '239.255.255.250',
      deviceDescription: 'IPTV to Plex Bridge Interface'
    },
    streaming: {
      maxConcurrentStreams: 10,
      streamTimeout: 30000,
      reconnectAttempts: 3,
      bufferSize: 65536,
      adaptiveBitrate: true,
      preferredProtocol: 'hls'
    },
    transcoding: {
      enabled: true,
      hardwareAcceleration: false,
      preset: 'medium',
      videoCodec: 'h264',
      audioCodec: 'aac',
      qualityProfiles: {
        low: { resolution: '720x480', bitrate: '1000k' },
        medium: { resolution: '1280x720', bitrate: '2500k' },
        high: { resolution: '1920x1080', bitrate: '5000k' }
      },
      defaultProfile: 'medium'
    },
    caching: {
      enabled: true,
      duration: 3600,
      maxSize: 1073741824,
      cleanup: {
        enabled: true,
        interval: 3600000,
        maxAge: 86400000
      }
    },
    device: {
      name: 'PlexTV',
      id: 'PLEXTV001',
      tunerCount: 4,
      firmware: '1.0.0',
      baseUrl: 'http://localhost:3000'
    },
    network: {
      bindAddress: '0.0.0.0',
      advertisedHost: null,
      streamingPort: 3000,
      discoveryPort: 1900,
      ipv6Enabled: false
    },
    compatibility: {
      hdHomeRunMode: true,
      plexPassRequired: false,
      gracePeriod: 10000,
      channelLogoFallback: true
    }
  }
};

app.get('/api/settings', (req, res) => {
  res.json(savedSettings);
});

app.put('/api/settings', (req, res) => {
  savedSettings = { ...savedSettings, ...req.body };
  console.log('Settings updated:', savedSettings);
  
  // Emit updated metrics to all connected clients
  io.emit('metrics:update', getRealMetrics());
  
  res.json({ success: true, message: 'Settings saved successfully' });
});

app.post('/api/settings', (req, res) => {
  savedSettings = { ...savedSettings, ...req.body };
  console.log('Settings updated:', savedSettings);
  
  // Emit updated metrics to all connected clients
  io.emit('metrics:update', getRealMetrics());
  
  res.json({ success: true, message: 'Settings saved successfully' });
});

app.get('/api/settings/metadata', (req, res) => {
  res.json({
    plexlive: {
      title: 'Plex Live TV Settings',
      description: 'Configuration options for Plex Live TV integration',
      sections: {
        ssdp: {
          title: 'SSDP Discovery',
          description: 'Simple Service Discovery Protocol settings for device discovery'
        },
        streaming: {
          title: 'Streaming',
          description: 'Stream handling and performance settings'
        },
        transcoding: {
          title: 'Transcoding',
          description: 'Video/audio transcoding configuration'
        },
        caching: {
          title: 'Caching',
          description: 'Stream caching and performance optimization'
        },
        device: {
          title: 'Device Information',
          description: 'Device identification and capabilities'
        },
        network: {
          title: 'Network',
          description: 'Network binding and connectivity settings'
        },
        compatibility: {
          title: 'Compatibility',
          description: 'Plex and HDHomeRun compatibility options'
        }
      }
    }
  });
});

app.post('/api/settings/reset', (req, res) => {
  const { category } = req.body;
  if (category) {
    console.log(`Resetting settings category: ${category}`);
  } else {
    console.log('Resetting all settings to defaults');
  }
  res.json({ success: true, message: category ? `Settings category '${category}' reset to defaults` : 'All settings reset to defaults' });
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