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
    
    // Get stream from database
    const stream = await streamPreviewService.getStreamById(req.params.streamId);
    
    if (!stream) {
      return res.status(404).json({ 
        error: 'Stream not found',
        message: 'The requested stream does not exist or is disabled'
      });
    }

    if (!stream.url) {
      return res.status(400).json({ 
        error: 'Stream configuration invalid',
        message: 'Stream has no URL configured'
      });
    }

    // Check if this is a .ts file
    const urlLower = stream.url.toLowerCase();
    const isTsFile = urlLower.includes('.ts') || urlLower.endsWith('.ts') || 
                     urlLower.includes('.mpegts') || urlLower.endsWith('.mpegts') ||
                     urlLower.includes('.mts') || urlLower.endsWith('.mts');
    
    if (!isTsFile) {
      logger.warn('HLS conversion requested for non-.ts stream', { 
        streamId: req.params.streamId, 
        url: stream.url 
      });
    }

    // Convert to HLS
    await streamPreviewService.handleHLSConversion(stream, req, res);
    
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

// .ts to HLS/MP4 conversion endpoint for web browser compatibility
router.get('/streams/convert/hls/:streamId', async (req, res) => {
  try {
    logger.info('HLS conversion request for stream:', req.params.streamId);
    
    // Force transcoding for .ts conversion
    req.query.transcode = 'true';
    req.query.quality = req.query.quality || 'medium';
    
    // Use the StreamPreviewService with forced transcoding
    await streamPreviewService.handleStreamPreview(req, res);
  } catch (error) {
    logger.error('HLS conversion service error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'HLS conversion failed', details: error.message });
    }
  }
});

module.exports = router;