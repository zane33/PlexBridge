const express = require('express');
const router = express.Router();
const database = require('../services/database');
const streamManager = require('../services/streamManager');
const streamSessionManager = require('../services/streamSessionManager');
const streamPreviewService = require('../services/streamPreviewService');
const logger = require('../utils/logger');
const { createStreamingSession } = require('../utils/streamingDecisionFix');
const { getSessionManager, sessionKeepAlive, addStreamHeaders } = require('../utils/sessionPersistenceFix');
const { getConsumerManager } = require('../services/consumerManager');
const { v4: uuidv4 } = require('uuid');
const segmentHandler = require('../services/segmentHandler');
const hlsQualitySelector = require('../services/hlsQualitySelector');

// Apply session keep-alive middleware to all stream endpoints
router.use(sessionKeepAlive());

/**
 * Determine if resilient streaming should be used based on request and stream characteristics
 */
function shouldUseResilientStreaming(req, stream) {
  const userAgent = req.get('User-Agent') || '';
  const isAndroidTV = userAgent.toLowerCase().includes('androidtv') || 
                     userAgent.toLowerCase().includes('android tv') ||
                     userAgent.toLowerCase().includes('nexusplayer') ||
                     userAgent.toLowerCase().includes('mibox') ||
                     userAgent.toLowerCase().includes('shield');
  
  const isPlexClient = userAgent.toLowerCase().includes('plex') ||
                      userAgent.toLowerCase().includes('pms') ||
                      userAgent.toLowerCase().includes('lavf');
  
  // Check for explicit resilience request
  if (req.query.resilient === 'true' || req.query.resilience === 'true') {
    return { 
      enabled: true, 
      reason: 'explicit_request',
      layer: 'user_requested'
    };
  }
  
  // Enable for Android TV clients (prone to connection issues)
  if (isAndroidTV) {
    return { 
      enabled: true, 
      reason: 'android_tv_client',
      layer: 'client_optimization'
    };
  }
  
  // Enable for Plex clients streaming certain problematic stream types
  if (isPlexClient && stream) {
    const problematicTypes = ['rtsp', 'rtmp', 'udp', 'mms', 'srt'];
    if (problematicTypes.includes(stream.type)) {
      return { 
        enabled: true, 
        reason: 'problematic_stream_type',
        layer: 'protocol_optimization',
        streamType: stream.type
      };
    }
    
    // Enable for streams with known connection issues
    if (stream.url && (
      stream.url.includes('unstable') || 
      stream.url.includes('backup') ||
      stream.url.includes('fallback')
    )) {
      return { 
        enabled: true, 
        reason: 'unreliable_source',
        layer: 'source_optimization'
      };
    }
  }
  
  // Enable based on system load (when regular streams are struggling)
  try {
    const os = require('os');
    const loadAverage = os.loadavg()[0]; // 1-minute load average
    const cpuCount = os.cpus().length;
    const loadPercentage = (loadAverage / cpuCount) * 100;
    
    // If system is under high load, use resilient streaming to help recovery
    if (loadPercentage > 80) {
      return { 
        enabled: true, 
        reason: 'high_system_load',
        layer: 'system_optimization',
        loadPercentage: Math.round(loadPercentage)
      };
    }
  } catch (error) {
    // Ignore load checking errors
  }
  
  // Check for network instability indicators in headers
  const connectionHeader = req.get('Connection') || '';
  const userNetworkHints = req.get('X-Network-Type') || '';
  
  if (connectionHeader.toLowerCase().includes('unstable') || 
      userNetworkHints.toLowerCase().includes('cellular') ||
      userNetworkHints.toLowerCase().includes('wifi-weak')) {
    return { 
      enabled: true, 
      reason: 'network_instability',
      layer: 'network_optimization'
    };
  }
  
  // Default: don't use resilient streaming
  return { 
    enabled: false, 
    reason: 'standard_streaming_sufficient'
  };
}

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
                         userAgent.toLowerCase().includes('vlc') ||       // VLC Media Player
                         userAgent.toLowerCase().includes('libvlc') ||    // VLC Library
                         req.query.format === 'mpegts' ||
                         req.query.raw === 'true';
    
    const isAndroidTV = userAgent.toLowerCase().includes('android');
    
    // Generate or extract session ID for persistent session management
    let sessionId = req.headers['x-session-id'] || 
                   req.query.sessionId || 
                   `session_${channelId}_${Date.now()}`;
    
    // Create persistent streaming session for consumer tracking (fixes "Failed to find consumer")
    if (isPlexRequest && !isSubFile) {
      const sessionManager = getSessionManager();
      
      // Extract the consumer session ID that Plex will use
      const consumerSessionId = req.headers['x-plex-session-identifier'] ||
                               req.query.X_Plex_Session_Identifier ||
                               req.query.session ||
                               sessionId;
      
      const clientInfo = {
        userAgent,
        platform: isAndroidTV ? 'AndroidTV' : 'Other',
        product: 'Plex',
        remoteAddress: req.ip || req.connection.remoteAddress,
        consumerSessionId: consumerSessionId
      };
      
      // Create or get existing persistent session
      const persistentSession = sessionManager.createSession(channelId, sessionId, null, clientInfo);
      
      // Also create a consumer session alias if different
      if (consumerSessionId !== sessionId) {
        sessionManager.createSession(channelId, consumerSessionId, null, {
          ...clientInfo,
          isConsumerAlias: true,
          primarySessionId: sessionId
        });
        logger.info('Created consumer session alias', {
          primarySessionId: sessionId,
          consumerSessionId: consumerSessionId
        });
      }
      
      // Create streaming session for decision tracking (critical for Android TV)
      const streamingSession = createStreamingSession(channelId, clientInfo);
      
      // Add session info to response headers for Plex decision making and consumer tracking
      addStreamHeaders(req, res, sessionId);
      res.set({
        'X-PlexBridge-Session': streamingSession.sessionId,
        'X-Persistent-Session': persistentSession.sessionId,
        'X-Consumer-Session': consumerSessionId,
        'X-Content-Type': 'live-tv',
        'X-Media-Type': '4'  // Episode type for Live TV, not 5 (trailer)
      });
      
      logger.info('Created persistent streaming session', {
        sessionId,
        consumerSessionId,
        channelId,
        clientInfo: clientInfo.userAgent,
        sessionStatus: persistentSession.status
      });
    }
    
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
    
    // Get channel info from database - first try as channel ID
    let channel = await database.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    let stream = null;
    
    if (channel) {
      // Found channel, get associated stream
      stream = await database.get('SELECT * FROM streams WHERE channel_id = ?', [channelId]);
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
    } else {
      // No channel found, try as stream ID directly
      stream = await database.get('SELECT * FROM streams WHERE id = ?', [channelId]);
      if (stream && stream.channel_id) {
        // Found stream, get associated channel
        channel = await database.get('SELECT * FROM channels WHERE id = ?', [stream.channel_id]);
      }
      
      if (!stream) {
        logger.warn('Neither channel nor stream found', { channelId, filename, clientIP: req.ip });
        return res.status(404).send('Channel not found');
      }
      
      // Log that we're using stream ID access
      logger.info('Stream accessed directly by stream ID', { 
        streamId: channelId, 
        streamName: stream.name,
        channelId: stream.channel_id,
        channelName: channel ? channel.name : 'Unknown'
      });
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
        // For other streams, try to resolve redirect using curl-like approach
        try {
          const axios = require('axios');
          
          // First, do a HEAD request to get the redirect location
          const headResponse = await axios.request({
            method: 'HEAD',
            url: stream.url,
            maxRedirects: 0,  // Don't follow redirects automatically
            timeout: 10000,
            headers: {
              'User-Agent': 'PlexBridge/1.0'
            },
            validateStatus: function (status) {
              return status >= 200 && status < 400; // Accept 2xx and 3xx responses
            }
          });
          
          let finalUrl = stream.url;
          
          // If we get a redirect, extract the location header
          if (headResponse.status >= 300 && headResponse.status < 400 && headResponse.headers.location) {
            finalUrl = headResponse.headers.location;
            logger.info('Found redirect location', {
              originalUrl: stream.url,
              redirectLocation: finalUrl,
              status: headResponse.status
            });
          }
          
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
    
    // For sub-files (segments), use enhanced segment handler with retry logic
    if (isSubFile) {
      // Handle .ts segments with proper error recovery
      if (filename.endsWith('.ts')) {
        logger.info('Handling MPEG-TS segment request', {
          channelId,
          filename,
          targetUrl,
          sessionId
        });
        
        // Use segment handler for reliability
        return await segmentHandler.streamSegment(targetUrl, res, {
          userAgent: userAgent,
          headers: {
            'X-Session-ID': sessionId
          }
        });
      }
      
      try {
        const axios = require('axios');
        
        // CRITICAL FIX: Enhanced session activity tracking for HLS segments
        // This prevents sessions from being marked as "no consumer" during active streaming
        const consumerManager = getConsumerManager();
        const sessionManager = getSessionManager();
        const coordinatedSessionManager = require('../services/coordinatedSessionManager');
        
        // Extract session ID from multiple possible sources (more comprehensive)
        const streamingSessionId = req.query.session || 
                                  req.query.sessionId || 
                                  req.query.X_Plex_Session_Identifier ||
                                  req.headers['x-session-id'] ||
                                  req.headers['x-plex-session-identifier'] ||
                                  sessionId;
        
        // ANDROID TV FIX: Detect Android TV and prevent session cleanup
        const userAgent = req.get('User-Agent') || '';
        const isAndroidTV = userAgent.toLowerCase().includes('android') ||
                           userAgent.toLowerCase().includes('shield') ||
                           userAgent.toLowerCase().includes('tv');
        
        // Also try to extract from the URL path if it's a session-based request
        let urlSessionId = null;
        const sessionPathMatch = req.originalUrl.match(/\/sessions\/([^\/]+)/);
        if (sessionPathMatch) {
          urlSessionId = sessionPathMatch[1];
        }
        
        // Use the most specific session ID available
        const finalSessionId = streamingSessionId || urlSessionId;
        
        // Update activity in all relevant managers
        if (finalSessionId) {
          let activityUpdated = false;
          
          if (consumerManager && consumerManager.updateActivity) {
            consumerManager.updateActivity(finalSessionId);
            activityUpdated = true;
          }
          
          if (sessionManager && sessionManager.updateSessionActivity) {
            sessionManager.updateSessionActivity(finalSessionId);
            activityUpdated = true;
          }
          
          // Also try to find and update any related session IDs (for session mapping)
          if (consumerManager && consumerManager.getConsumer) {
            const consumer = consumerManager.getConsumer(finalSessionId);
            if (consumer && consumer.sessionId !== finalSessionId) {
              consumerManager.updateActivity(consumer.sessionId);
              sessionManager.updateSessionActivity(consumer.sessionId);
            }
          }
          
          if (activityUpdated) {
            logger.debug('Enhanced session activity update for HLS segment', {
              finalSessionId,
              originalSessionId: streamingSessionId,
              urlSessionId,
              filename,
              channelId,
              isAndroidTV,
              userAgent: isAndroidTV ? userAgent.substring(0, 50) : undefined,
              timestamp: new Date().toISOString()
            });
          }
          
          // ANDROID TV CRITICAL FIX: Extended session keepalive for Android TV clients
          if (isAndroidTV && finalSessionId && coordinatedSessionManager) {
            try {
              coordinatedSessionManager.updateSessionActivity(finalSessionId, 'hls_segment', {
                isAndroidTV: true,
                filename,
                channelId,
                preventTimeout: true,
                extendTimeout: 300000 // 5 minutes timeout instead of default
              });
              
              logger.debug('Android TV session extended for HLS segment', {
                sessionId: finalSessionId,
                filename,
                channelId
              });
            } catch (sessionError) {
              logger.warn('Failed to update Android TV session activity:', sessionError.message);
            }
          }
        }
        
        logger.info('Direct proxying sub-file', { targetUrl, filename, sessionId: streamingSessionId });
        
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
      // For main playlist requests, handle with persistent session management
      if (isPlexRequest && !isSubFile) {
        // Plex needs direct MPEG-TS stream with persistent session management
        logger.info('Plex request detected - using persistent session management', { 
          channelId, 
          sessionId,
          userAgent: req.get('User-Agent')
        });
        
        // Get the persistent session manager
        const sessionManager = getSessionManager();
        const session = sessionManager.getSessionStatus(sessionId);
        
        if (session.exists && session.isRunning) {
          // Session already running, just update activity
          sessionManager.updateSessionActivity(sessionId);
          logger.info('Using existing persistent session', { sessionId, channelId });
        } else {
          // Start new stream with persistent session management
          const persistentSession = sessionManager.activeSessions.get(sessionId);
          if (persistentSession) {
            persistentSession.streamUrl = targetUrl;
            await sessionManager.startStream(persistentSession, {
              outputFormat: 'mpegts',
              videoCodec: 'copy',
              audioCodec: 'copy'
            });
            
            logger.info('Started persistent streaming session', {
              sessionId,
              channelId,
              pid: persistentSession.pid,
              status: persistentSession.status
            });
          }
        }
        
        // Check if resilient streaming should be used
        const resilienceDecision = shouldUseResilientStreaming(req, stream);
        
        if (resilienceDecision.enabled) {
          logger.info('Using resilient streaming for Plex request', {
            channelId: channel ? channel.id : stream.id,
            channelName: channel ? channel.name : stream.name,
            userAgent: req.get('User-Agent'),
            reason: resilienceDecision.reason
          });
          
          // Use resilient streaming with multi-layer recovery
          await streamManager.createResilientStreamProxy(
            channel ? channel.id : stream.id,
            {
              url: targetUrl,
              type: stream.type,
              auth: stream.auth,
              headers: {}
            },
            req,
            res
          );
        } else {
          // Let streamManager handle MPEG-TS transcoding with session awareness
          await streamManager.proxyPlexCompatibleStream(targetUrl, channel, stream, req, res);
        }
      } else {
        // Check if resilient streaming should be used for non-Plex requests
        const resilienceDecision = shouldUseResilientStreaming(req, stream);
        
        if (resilienceDecision.enabled) {
          logger.info('Using resilient streaming for regular request', {
            channelId: channel ? channel.id : stream.id,
            channelName: channel ? channel.name : stream.name,
            userAgent: req.get('User-Agent'),
            reason: resilienceDecision.reason
          });
          
          // Use resilient streaming
          await streamManager.createResilientStreamProxy(
            channel ? channel.id : stream.id,
            {
              url: targetUrl,
              type: stream.type,
              auth: stream.auth,
              headers: {}
            },
            req,
            res
          );
        } else {
          // For regular requests, let streamManager handle session creation and URL rewriting
          await streamManager.proxyStreamWithChannel(targetUrl, channel, stream, req, res);
        }
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

// Active streams endpoint - Enhanced with persistent session management
// Resilience statistics endpoint
router.get('/streams/resilience', async (req, res) => {
  try {
    logger.info('Getting stream resilience statistics');

    // Get resilience stats from stream manager
    const resilientStats = streamManager.getResilientStreamStats();
    const healthCheck = streamManager.isResilientStreamingHealthy();

    // Helper function to format duration
    function formatDuration(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      
      if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
      } else {
        return `${seconds}s`;
      }
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      
      // Service health
      health: healthCheck,
      
      // Detailed statistics
      statistics: resilientStats,
      
      // Configuration
      configuration: {
        resilienceLayers: 4,
        layerDescriptions: {
          1: 'FFmpeg reconnection (0-5s)',
          2: 'Process restart (5-15s)', 
          3: 'Session recreation (15-30s)',
          4: 'Smart buffering (continuous)'
        }
      },
      
      // Usage summary
      summary: {
        totalResilientStreams: resilientStats.summary.totalResilientStreams,
        healthyStreamsPercent: resilientStats.summary.totalResilientStreams > 0 
          ? Math.round((resilientStats.summary.healthyStreams / resilientStats.summary.totalResilientStreams) * 100)
          : 100,
        averageUptimeFormatted: resilientStats.summary.averageUptime > 0
          ? formatDuration(resilientStats.summary.averageUptime)
          : 'N/A',
        totalRecoveryEvents: resilientStats.summary.totalRecoveryEvents
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get resilience statistics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve resilience statistics',
      details: error.message
    });
  }
});

router.get('/streams/active', async (req, res) => {
  try {
    // Get max concurrent streams from settings
    const settingsService = require('../services/settingsService');
    const settings = await settingsService.getSettings();
    const maxConcurrent = settings?.plexlive?.streaming?.maxConcurrentStreams || 5;
    
    // Use streamSessionManager for more accurate session tracking
    const activeSessions = streamSessionManager.getActiveSessions();
    const capacity = streamSessionManager.getCapacityMetrics(maxConcurrent);
    const bandwidth = streamSessionManager.getBandwidthStats();
    
    // Get persistent sessions from session manager
    const sessionManager = getSessionManager();
    const persistentSessions = sessionManager.getActiveSessions();
    
    // Also get legacy streams for compatibility
    const legacyStreams = await streamManager.getActiveStreams();
    
    // Combine all session data
    const streams = activeSessions.length > 0 ? activeSessions : legacyStreams;
    
    res.json({ 
      streams, 
      persistentSessions,
      capacity,
      bandwidth,
      sessionCount: activeSessions.length,
      persistentCount: persistentSessions.length,
      legacyCount: legacyStreams.length,
      totalActiveSessions: activeSessions.length + persistentSessions.length
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