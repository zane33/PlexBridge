const express = require('express');
const router = express.Router();
const database = require('../services/database');
const streamManager = require('../services/streamManager');
const streamPreviewService = require('../services/streamPreviewService');
const logger = require('../utils/logger');

// Stream proxy endpoint for Plex
router.get('/stream/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    logger.info(`Stream request for channel: ${channelId}`, { 
      clientIP: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Get channel info from database
    const channel = await database.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      logger.warn('Channel not found for stream request', { channelId, clientIP: req.ip });
      return res.status(404).send('Channel not found');
    }
    
    // Get stream info for channel
    const stream = await database.get('SELECT * FROM streams WHERE channel_id = ?', [channelId]);
    if (!stream) {
      logger.warn('Stream not found for channel', { 
        channelId, 
        channelName: channel.name,
        channelNumber: channel.number,
        clientIP: req.ip 
      });
      return res.status(404).send('Stream not found for channel');
    }
    
    // Proxy the stream with channel context
    await streamManager.proxyStreamWithChannel(stream.url, channel, stream, req, res);
    
  } catch (error) {
    logger.error('Stream proxy error:', error);
    res.status(500).send('Stream error');
  }
});

// Stream preview endpoint - Use the enhanced StreamPreviewService
router.get('/streams/preview/:streamId', async (req, res) => {
  try {
    // Use the StreamPreviewService for proper stream handling with database integration
    await streamPreviewService.handleStreamPreview(req, res);
  } catch (error) {
    logger.error('Stream preview service error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream preview failed', details: error.message });
    }
  }
});

// HLS conversion endpoint for .ts streams
router.get('/streams/convert/hls/:streamId', async (req, res) => {
  try {
    logger.info(`HLS conversion request for stream: ${req.params.streamId}`);
    
    // Force transcoding for .ts conversion
    req.query.transcode = 'true';
    req.query.quality = req.query.quality || 'medium';
    
    // Use the StreamPreviewService with forced transcoding
    await streamPreviewService.handleStreamPreview(req, res);
    
  } catch (error) {
    logger.error('HLS conversion error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'HLS conversion failed', 
        details: error.message 
      });
    }
  }
});

// Active streams endpoint - Enhanced to return Promise-based data
router.get('/streams/active', async (req, res) => {
  try {
    const activeStreams = await streamManager.getActiveStreams();
    res.json({ streams: activeStreams });
  } catch (error) {
    logger.error('Error getting active streams:', error);
    res.status(500).json({ error: 'Failed to get active streams' });
  }
});


module.exports = router;