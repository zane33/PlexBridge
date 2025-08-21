const express = require('express');
const router = express.Router();
const database = require('../services/database');
const streamManager = require('../services/streamManager');
const streamPreviewService = require('../services/streamPreviewService');
const logger = require('../utils/logger');

// Stream proxy endpoint for Plex - handles both main playlist and sub-files
router.get('/stream/:channelId/:filename?', async (req, res) => {
  try {
    const { channelId, filename } = req.params;
    const isSubFile = !!filename;
    
    // Simple debug logging
    logger.info('Stream request received', { 
      channelId, 
      filename, 
      isSubFile,
      userAgent: req.get('User-Agent'),
      method: req.method,
      url: req.url
    });
    
    // Route is working - remove test response
    
    logger.info(`Stream request for channel: ${channelId}${isSubFile ? '/' + filename : ''}`, { 
      clientIP: req.ip,
      userAgent: req.get('User-Agent'),
      isSubFile,
      filename
    });
    
    // Get channel info from database
    const channel = await database.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      logger.warn('Channel not found for stream request', { channelId, filename, clientIP: req.ip });
      return res.status(404).send('Channel not found');
    }
    
    // Get stream info for channel
    const stream = await database.get('SELECT * FROM streams WHERE channel_id = ?', [channelId]);
    if (!stream) {
      logger.warn('Stream not found for channel', { 
        channelId, 
        channelName: channel.name,
        channelNumber: channel.number,
        filename,
        clientIP: req.ip 
      });
      return res.status(404).send('Stream not found for channel');
    }
    
    // Determine the target URL
    let targetUrl = stream.url;
    if (isSubFile) {
      // For sub-files, construct the target URL based on known redirect patterns
      if (stream.url.includes('i.mjh.nz/.r/discovery-hgtv.m3u8')) {
        // HGTV redirects to https://mediapackage-hgtv-source.fullscreen.nz/index.m3u8
        targetUrl = `https://mediapackage-hgtv-source.fullscreen.nz/${filename}`;
        logger.info('Using hardcoded HGTV target URL', { targetUrl, filename });
      } else {
        // For other streams, try to resolve redirect
        try {
          const axios = require('axios');
          const response = await axios.get(stream.url, {
            maxRedirects: 5,
            timeout: 10000,
            responseType: 'text',
            headers: {
              'User-Agent': 'PlexBridge/1.0',
              'Range': 'bytes=0-512'  // Get just a small part to find the final URL
            }
          });
          
          // Get the final URL from the response
          const finalUrl = response.request.responseURL || response.config.url || stream.url;
          const baseUrl = finalUrl.replace(/\/[^\/]*$/, '/');
          targetUrl = baseUrl + filename;
          
          logger.info('Resolved redirect for sub-file', {
            originalUrl: stream.url,
            finalUrl: finalUrl,
            targetUrl: targetUrl,
            filename: filename
          });
        } catch (error) {
          logger.error('Failed to resolve redirect for sub-file', {
            streamUrl: stream.url,
            filename: filename,
            error: error.message
          });
          // Fallback: construct based on original URL
          const baseUrl = stream.url.replace(/\/[^\/]*$/, '/');
          targetUrl = baseUrl + filename;
        }
      }
    }
    
    // For sub-files, use simpler direct proxy without detection/rewriting
    if (isSubFile) {
      try {
        const axios = require('axios');
        
        logger.info('Direct proxying sub-file', { targetUrl, filename });
        
        // Fetch the sub-file content as text first to debug
        const response = await axios.get(targetUrl, {
          responseType: 'text',
          timeout: 30000,
          headers: {
            'User-Agent': 'PlexBridge/1.0'
          }
        });
        
        logger.info('Sub-file fetch successful', {
          targetUrl: targetUrl,
          status: response.status,
          contentLength: response.data.length,
          contentType: response.headers['content-type']
        });
        
        // Set appropriate headers for HLS media playlist
        res.set({
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        
        // Send the content directly
        res.send(response.data);
        
      } catch (error) {
        logger.error('Sub-file proxy error', {
          targetUrl: targetUrl,
          filename: filename,
          error: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText
        });
        res.status(500).send(`Failed to proxy sub-file: ${error.message}`);
      }
    } else {
      // For main playlist, use the full stream manager with URL rewriting
      await streamManager.proxyStreamWithChannel(targetUrl, channel, stream, req, res);
    }
    
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