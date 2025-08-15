const express = require('express');
const router = express.Router();
const streamManager = require('../services/streamManager');
const database = require('../services/database');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

// Main stream endpoint for Plex
router.get('/stream/:channelId', async (req, res) => {
  const channelId = req.params.channelId;
  
  try {
    logger.stream('Stream request received', { 
      channelId, 
      clientIP: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Get channel and stream data
    const channelData = await database.get(`
      SELECT c.*, s.url, s.type, s.backup_urls, s.auth_username, s.auth_password, s.headers, s.protocol_options
      FROM channels c 
      JOIN streams s ON c.id = s.channel_id 
      WHERE c.id = ? AND c.enabled = 1 AND s.enabled = 1
    `, [channelId]);

    if (!channelData) {
      logger.stream('Channel not found or disabled', { channelId });
      return res.status(404).json({ error: 'Channel not found or disabled' });
    }

    // Parse additional data
    const streamData = {
      ...channelData,
      backup_urls: channelData.backup_urls ? JSON.parse(channelData.backup_urls) : [],
      auth: channelData.auth_username ? {
        username: channelData.auth_username,
        password: channelData.auth_password
      } : null,
      headers: channelData.headers ? JSON.parse(channelData.headers) : {},
      protocol_options: channelData.protocol_options ? JSON.parse(channelData.protocol_options) : {}
    };

    // Try primary URL first
    let currentUrl = streamData.url;
    let attempts = 0;
    const maxAttempts = 1 + (streamData.backup_urls?.length || 0);

    while (attempts < maxAttempts) {
      try {
        // Validate stream before proxying
        const validation = await streamManager.validateStream({
          url: currentUrl,
          type: streamData.type,
          auth: streamData.auth
        });

        if (validation.valid) {
          // Create stream proxy
          streamManager.createStreamProxy(channelId, {
            ...streamData,
            url: currentUrl
          }, req, res);
          
          return; // Exit the function as response is handled by stream proxy
        } else {
          logger.stream('Stream validation failed', { 
            channelId, 
            url: currentUrl, 
            error: validation.error 
          });
        }
      } catch (error) {
        logger.stream('Stream attempt failed', { 
          channelId, 
          url: currentUrl, 
          attempt: attempts + 1,
          error: error.message 
        });
      }

      // Try backup URL if available
      attempts++;
      if (attempts < maxAttempts && streamData.backup_urls && streamData.backup_urls[attempts - 1]) {
        currentUrl = streamData.backup_urls[attempts - 1];
        logger.stream('Trying backup URL', { channelId, url: currentUrl, attempt: attempts + 1 });
      } else {
        break;
      }
    }

    // All URLs failed
    logger.stream('All stream URLs failed', { channelId, attempts });
    res.status(503).json({ error: 'Stream temporarily unavailable' });

  } catch (error) {
    logger.error('Stream endpoint error', { channelId, error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Stream preview endpoint
router.get('/preview/:streamId', async (req, res) => {
  const streamId = req.params.streamId;
  
  try {
    const streamData = await database.get('SELECT * FROM streams WHERE id = ?', [streamId]);
    
    if (!streamData) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Parse additional data
    const parsedStreamData = {
      ...streamData,
      backup_urls: streamData.backup_urls ? JSON.parse(streamData.backup_urls) : [],
      auth: streamData.auth_username ? {
        username: streamData.auth_username,
        password: streamData.auth_password
      } : null,
      headers: streamData.headers ? JSON.parse(streamData.headers) : {},
      protocol_options: streamData.protocol_options ? JSON.parse(streamData.protocol_options) : {}
    };

    // Create a short preview stream (30 seconds)
    streamManager.createStreamProxy(`preview_${streamId}`, parsedStreamData, req, res);

  } catch (error) {
    logger.error('Stream preview error', { streamId, error: error.message });
    res.status(500).json({ error: 'Preview failed' });
  }
});

// Stream validation endpoint
router.post('/validate', async (req, res) => {
  try {
    const { url, type, auth, headers } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    logger.stream('Stream validation request', { url, type });

    const streamData = {
      url,
      type,
      auth,
      headers
    };

    const validation = await streamManager.validateStream(streamData);
    
    res.json(validation);

  } catch (error) {
    logger.error('Stream validation error', { error: error.message });
    res.status(500).json({ error: 'Validation failed' });
  }
});

// Bulk stream validation
router.post('/validate-bulk', async (req, res) => {
  try {
    const { streams } = req.body;

    if (!Array.isArray(streams)) {
      return res.status(400).json({ error: 'Streams array is required' });
    }

    logger.stream('Bulk stream validation request', { count: streams.length });

    const results = [];
    
    // Process streams in batches to avoid overwhelming the system
    const batchSize = 5;
    for (let i = 0; i < streams.length; i += batchSize) {
      const batch = streams.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (stream, index) => {
        try {
          const validation = await streamManager.validateStream(stream);
          return {
            index: i + index,
            url: stream.url,
            ...validation
          };
        } catch (error) {
          return {
            index: i + index,
            url: stream.url,
            valid: false,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    res.json({ results });

  } catch (error) {
    logger.error('Bulk validation error', { error: error.message });
    res.status(500).json({ error: 'Bulk validation failed' });
  }
});

// Stream information endpoint
router.get('/info/:streamId', async (req, res) => {
  const streamId = req.params.streamId;
  
  try {
    // Check cache first
    const cachedInfo = await cacheService.getStreamInfo(streamId);
    if (cachedInfo) {
      return res.json(cachedInfo);
    }

    const streamData = await database.get('SELECT * FROM streams WHERE id = ?', [streamId]);
    
    if (!streamData) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Get detailed stream information
    const streamInfo = await streamManager.detectStreamFormat(streamData.url);
    
    const info = {
      id: streamId,
      name: streamData.name,
      url: streamData.url,
      type: streamData.type,
      detected: streamInfo,
      enabled: streamData.enabled,
      created_at: streamData.created_at,
      updated_at: streamData.updated_at
    };

    // Cache the information
    await cacheService.setStreamInfo(streamId, info);

    res.json(info);

  } catch (error) {
    logger.error('Stream info error', { streamId, error: error.message });
    res.status(500).json({ error: 'Failed to get stream info' });
  }
});

// Active streams endpoint
router.get('/active', (req, res) => {
  try {
    const activeStreams = streamManager.getActiveStreams();
    res.json({
      count: activeStreams.length,
      maximum: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10,
      streams: activeStreams
    });
  } catch (error) {
    logger.error('Active streams error', { error: error.message });
    res.status(500).json({ error: 'Failed to get active streams' });
  }
});

// Stream statistics endpoint
router.get('/stats', async (req, res) => {
  try {
    const activeStreams = streamManager.getActiveStreams();
    const totalStreams = await database.get('SELECT COUNT(*) as count FROM streams WHERE enabled = 1');
    const totalChannels = await database.get('SELECT COUNT(*) as count FROM channels WHERE enabled = 1');
    
    // Get stream sessions from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentSessions = await database.all(`
      SELECT stream_id, COUNT(*) as session_count, SUM(bytes_transferred) as total_bytes
      FROM stream_sessions 
      WHERE started_at > ? 
      GROUP BY stream_id
    `, [oneDayAgo]);

    const stats = {
      current: {
        activeStreams: activeStreams.length,
        maxConcurrent: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10
      },
      totals: {
        streams: totalStreams.count,
        channels: totalChannels.count
      },
      last24Hours: {
        sessions: recentSessions.length,
        totalBytes: recentSessions.reduce((sum, session) => sum + (session.total_bytes || 0), 0)
      },
      activeStreamDetails: activeStreams
    };

    res.json(stats);

  } catch (error) {
    logger.error('Stream stats error', { error: error.message });
    res.status(500).json({ error: 'Failed to get stream statistics' });
  }
});

// Stop all streams (admin endpoint)
router.post('/stop-all', (req, res) => {
  try {
    const activeStreams = streamManager.getActiveStreams();
    const stoppedCount = activeStreams.length;
    
    streamManager.cleanup();
    
    logger.stream('All streams stopped by admin', { count: stoppedCount });
    
    res.json({ 
      message: 'All streams stopped',
      stoppedCount
    });

  } catch (error) {
    logger.error('Stop all streams error', { error: error.message });
    res.status(500).json({ error: 'Failed to stop streams' });
  }
});

// M3U playlist endpoint for Plex
router.get('/playlist.m3u', async (req, res) => {
  try {
    logger.stream('M3U playlist request', { 
      clientIP: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Get all enabled channels with streams
    const channels = await database.all(`
      SELECT c.id, c.name, c.number, c.logo, c.epg_id, s.url, s.type
      FROM channels c 
      JOIN streams s ON c.id = s.channel_id 
      WHERE c.enabled = 1 AND s.enabled = 1
      ORDER BY c.number
    `);

    if (channels.length === 0) {
      return res.status(404).type('text/plain').send('# No channels available');
    }

    // Get server host for stream URLs
    const serverHost = req.get('host') || `${req.hostname}:${process.env.PORT || 8080}`;
    const protocol = req.secure ? 'https' : 'http';

    // Generate M3U playlist
    let m3u = '#EXTM3U\n';
    
    for (const channel of channels) {
      const streamUrl = `${protocol}://${serverHost}/stream/${channel.id}`;
      
      // Add channel entry
      m3u += `#EXTINF:-1`;
      
      // Add channel number
      if (channel.number) {
        m3u += ` tvg-chno="${channel.number}"`;
      }
      
      // Add EPG ID
      if (channel.epg_id) {
        m3u += ` tvg-id="${channel.epg_id}"`;
      }
      
      // Add logo
      if (channel.logo) {
        m3u += ` tvg-logo="${channel.logo}"`;
      }
      
      // Add channel name
      m3u += `,${channel.name}\n`;
      
      // Add stream URL
      m3u += `${streamUrl}\n`;
    }

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Content-Disposition', 'attachment; filename="plextv.m3u"');
    res.send(m3u);

  } catch (error) {
    logger.error('M3U playlist error', { error: error.message });
    res.status(500).type('text/plain').send('# M3U playlist generation failed');
  }
});

module.exports = router;
