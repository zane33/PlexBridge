const express = require('express');
const router = express.Router();
const database = require('../services/database');
const streamManager = require('../services/streamManager');
const logger = require('../utils/logger');

// Stream proxy endpoint for Plex
router.get('/stream/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    logger.info(`Stream request for channel: ${channelId}`);
    
    // Get channel info from database
    const channel = await database.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).send('Channel not found');
    }
    
    // Get stream info for channel
    const stream = await database.get('SELECT * FROM streams WHERE channel_id = ?', [channelId]);
    if (!stream) {
      return res.status(404).send('Stream not found for channel');
    }
    
    // Proxy the stream
    await streamManager.proxyStream(stream.url, req, res);
    
  } catch (error) {
    logger.error('Stream proxy error:', error);
    res.status(500).send('Stream error');
  }
});

// Stream preview endpoint
router.get('/streams/preview/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;
    logger.info(`Stream preview request for: ${streamId}`);
    
    // Get stream info
    const stream = await database.get('SELECT * FROM streams WHERE id = ?', [streamId]);
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    
    // Set appropriate headers for video streaming
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache'
    });
    
    // Proxy the stream
    await streamManager.proxyStream(stream.url, req, res);
    
  } catch (error) {
    logger.error('Stream preview error:', error);
    res.status(500).json({ error: 'Stream preview failed', details: error.message });
  }
});

// Active streams endpoint
router.get('/streams/active', (req, res) => {
  try {
    const activeStreams = streamManager.getActiveStreams();
    res.json(activeStreams);
  } catch (error) {
    logger.error('Error getting active streams:', error);
    res.status(500).json({ error: 'Failed to get active streams' });
  }
});

module.exports = router;