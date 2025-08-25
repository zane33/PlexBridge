const express = require('express');
const router = express.Router();
const database = require('../services/database');
const streamManager = require('../services/streamManager');
const streamSessionManager = require('../services/streamSessionManager');
const streamPreviewService = require('../services/streamPreviewService');
const { isComplexStreamUrl } = require('../utils/streamAnalyzer');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Stream proxy endpoint for Plex - handles both main playlist and sub-files
router.get('/stream/:channelId/:filename?', async (req, res) => {
  try {
    const { channelId, filename } = req.params;
    const isSubFile = !!filename;
    
    // Check if this is a Plex request that needs MPEG-TS format
    const userAgent = req.get('User-Agent') || '';
    const isPlexRequest = userAgent.toLowerCase().includes('plex') || 
                         userAgent.toLowerCase().includes('pms') ||
                         userAgent.toLowerCase().includes('lavf') ||      // FFmpeg/libav from Plex
                         userAgent.toLowerCase().includes('ffmpeg') ||    // Direct FFmpeg
                         req.query.format === 'mpegts' ||
                         req.query.raw === 'true';
    
    // Simple debug logging
    logger.info('Stream request received', { 
      channelId, 
      filename, 
      isSubFile,
      userAgent: req.get('User-Agent'),
      method: req.method,
      url: req.url,
      isPlexRequest,
      queryParams: req.query
    });
    
    // TEMPORARY: Enhanced debugging for duplicate session investigation
    console.log('STREAM REQUEST DEBUG:', {
      channelId,
      isSubFile,
      userAgent: req.get('User-Agent'),
      isPlexRequest,
      method: req.method,
      clientIP: req.ip || req.connection.remoteAddress,
      url: req.url,
      headers: {
        'user-agent': req.get('User-Agent'),
        'range': req.get('Range'),
        'connection': req.get('Connection')
      }
    });
    
    // Handle HEAD requests for Plex (it sends HEAD first to check the stream)
    // Don't create sessions for HEAD requests - they're just checking availability
    if (req.method === 'HEAD') {
      logger.info('HEAD request for stream (not creating session)', { channelId, isPlexRequest });
      res.set({
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.status(200).end();
    }
    
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
      // Check for automatic transcoding needs based on stream complexity
      let shouldForceTranscode = req.query.transcode === 'true';
      
      // Parse protocol options to check for auto-transcoding settings
      let protocolOptions = {};
      try {
        protocolOptions = stream.protocol_options ? JSON.parse(stream.protocol_options) : {};
      } catch (e) {
        logger.warn('Failed to parse protocol options', { channelId, error: e.message });
      }
      
      // Auto-transcoding logic for complex streams
      if (!shouldForceTranscode && isPlexRequest && stream.type === 'hls') {
        // Check if transcoding was automatically recommended during stream creation
        if (protocolOptions.forceTranscode) {
          shouldForceTranscode = true;
          logger.info('Auto-transcoding enabled due to stream complexity analysis', { 
            channelId, 
            streamName: stream.name 
          });
        }
        // Quick URL pattern check as fallback
        else if (isComplexStreamUrl(stream.url)) {
          shouldForceTranscode = true;
          logger.info('Auto-transcoding enabled due to complex URL pattern', { 
            channelId, 
            streamName: stream.name,
            urlLength: stream.url.length 
          });
        }
      }
      
      // Apply transcoding parameter if needed
      if (shouldForceTranscode && !req.query.transcode) {
        req.query.transcode = 'true';
        logger.info('Transcoding parameter automatically applied', { 
          channelId, 
          streamName: stream.name 
        });
      }
      
      // For main playlist requests, let the streamManager handle session creation to avoid duplicates
      if (isPlexRequest && !isSubFile) {
        // Plex needs direct MPEG-TS stream, not HLS playlist
        logger.info('Plex request detected - forwarding to streamManager', { 
          channelId, 
          userAgent: req.get('User-Agent'),
          forceTranscode: shouldForceTranscode
        });
        
        // Let streamManager handle session creation and MPEG-TS transcoding for Plex compatibility
        await streamManager.proxyPlexCompatibleStream(targetUrl, channel, req, res);
      } else {
        // For regular requests, let streamManager handle session creation and URL rewriting
        await streamManager.proxyStreamWithChannel(targetUrl, channel, stream, req, res);
      }
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

// Active streams endpoint - Enhanced to return Promise-based data from session manager
router.get('/streams/active', async (req, res) => {
  try {
    // Get max concurrent streams from settings
    const settingsService = require('../services/settingsService');
    const settings = await settingsService.getSettings();
    const maxConcurrent = settings?.plexlive?.streaming?.maxConcurrentStreams || 10;
    
    // Use streamSessionManager for more accurate session tracking
    const activeSessions = streamSessionManager.getActiveSessions();
    const capacity = streamSessionManager.getCapacityMetrics(maxConcurrent);
    const bandwidth = streamSessionManager.getBandwidthStats();
    
    // Also get legacy streams for compatibility
    const legacyStreams = await streamManager.getActiveStreams();
    
    // Combine session data with legacy compatibility
    const streams = activeSessions.length > 0 ? activeSessions : legacyStreams;
    
    res.json({ 
      streams, 
      capacity,
      bandwidth,
      sessionCount: activeSessions.length,
      legacyCount: legacyStreams.length
    });
  } catch (error) {
    logger.error('Error getting active streams:', error);
    res.status(500).json({ error: 'Failed to get active streams' });
  }
});


// Test endpoint for FFmpeg transcoding (temporary for debugging)
router.get('/test/ffmpeg/:streamUrl', async (req, res) => {
  try {
    const testStreamUrl = decodeURIComponent(req.params.streamUrl);
    
    logger.info('FFmpeg test endpoint called', { testStreamUrl });
    
    // Resolve redirect manually
    const axios = require('axios');
    let finalUrl = testStreamUrl;
    try {
      const response = await axios.head(testStreamUrl, {
        maxRedirects: 5,
        timeout: 10000,
        headers: { 'User-Agent': 'PlexBridge/1.0' }
      });
      finalUrl = response.request.responseURL || testStreamUrl;
      logger.info('Test redirect resolution', { original: testStreamUrl, final: finalUrl });
    } catch (e) {
      logger.warn('Test redirect failed', { error: e.message });
    }
    
    // Set MPEG-TS headers
    res.set({
      'Content-Type': 'video/mp2t',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    
    // Get FFmpeg arguments from settings (same as main implementation)
    const settingsService = require('../services/settingsService');
    const config = require('../config');
    const settings = await settingsService.getSettings();
    
    // Get configurable FFmpeg command line
    let ffmpegCommand = settings?.plexlive?.transcoding?.mpegts?.ffmpegArgs || 
                       config.plexlive?.transcoding?.mpegts?.ffmpegArgs ||
                       '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 pipe:1';
    
    // Replace [URL] placeholder with actual stream URL
    ffmpegCommand = ffmpegCommand.replace('[URL]', finalUrl);
    
    // Add HLS-specific arguments if needed
    if (finalUrl.includes('.m3u8')) {
      const hlsArgs = settings?.plexlive?.transcoding?.mpegts?.hlsProtocolArgs || 
                     config.plexlive?.transcoding?.mpegts?.hlsProtocolArgs ||
                     '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,crypto';
      
      // Insert HLS args after the input URL
      ffmpegCommand = ffmpegCommand.replace('-i ' + finalUrl, '-i ' + finalUrl + ' ' + hlsArgs);
    }
    
    // Parse command line into arguments array
    const args = ffmpegCommand.split(' ').filter(arg => arg.trim() !== '');
    
    const { spawn } = require('child_process');
    
    logger.info('Test FFmpeg command', { command: `ffmpeg ${args.join(' ')}` });
    
    const ffmpeg = spawn('ffmpeg', args);
    
    if (!ffmpeg.pid) {
      return res.status(500).send('FFmpeg failed to start');
    }
    
    logger.info('Test FFmpeg started', { pid: ffmpeg.pid });
    
    ffmpeg.stdout.pipe(res);
    
    ffmpeg.stderr.on('data', (data) => {
      logger.warn('FFmpeg stderr', { error: data.toString() });
    });
    
    ffmpeg.on('error', (error) => {
      logger.error('FFmpeg error', { error: error.message });
      if (!res.headersSent) res.status(500).send('FFmpeg error');
    });
    
    ffmpeg.on('close', (code) => {
      logger.info('FFmpeg process closed', { code });
    });
    
    req.on('close', () => {
      logger.info('Client disconnected, terminating FFmpeg');
      ffmpeg.kill('SIGTERM');
    });
    
  } catch (error) {
    logger.error('Test endpoint error', { error: error.message });
    res.status(500).send('Test failed');
  }
});

module.exports = router;