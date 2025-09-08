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
const androidTVSessionManager = require('../services/androidTVSessionManager');
const hlsSegmentResolver = require('../services/hlsSegmentResolver');

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
    
    const isAndroidTV = userAgent.toLowerCase().includes('androidtv') || 
                        userAgent.toLowerCase().includes('android tv') ||
                        userAgent.toLowerCase().includes('nexusplayer') ||
                        userAgent.toLowerCase().includes('mibox') ||
                        userAgent.toLowerCase().includes('shield') ||
                        userAgent.toLowerCase().includes('android');
    
    // Get channel and stream info early for targetUrl resolution
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
    
    // Determine the target URL early for session creation
    let targetUrl = stream.url;
    
    // CRITICAL FIX: Process beacon URLs at the initial URL resolution stage
    // This ensures beacon URLs are processed for ALL requests (Plex, web, mobile)
    if (!isSubFile && streamManager.isBeaconTrackingUrl(targetUrl)) {
      try {
        logger.info('Detected beacon tracking URL, processing...', {
          channelId,
          originalUrl: targetUrl.substring(0, 100) + '...',
          isPlexRequest,
          userAgent: req.get('User-Agent')
        });
        
        // Process the beacon URL to extract the clean streaming URL
        const processedUrl = await streamManager.processPlaylistWithBeacons(targetUrl, req, channelId);
        
        if (processedUrl && processedUrl !== targetUrl) {
          targetUrl = processedUrl;
          logger.info('Successfully processed beacon URL', {
            channelId,
            originalLength: stream.url.length,
            processedLength: targetUrl.length,
            hasBeaconParams: stream.url.includes('bcn=') || stream.url.includes('redirect_url='),
            isPlexRequest
          });
        } else {
          logger.warn('Beacon URL processing returned same URL', {
            channelId,
            originalUrl: stream.url.substring(0, 100) + '...'
          });
        }
      } catch (beaconError) {
        logger.error('Failed to process beacon URL, using original', {
          channelId,
          error: beaconError.message,
          originalUrl: stream.url.substring(0, 100) + '...'
        });
        // Continue with original URL if beacon processing fails
      }
    }

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
      
      // CRITICAL: Create enhanced Android TV session for long-running stream stability
      if (isAndroidTV) {
        try {
          const androidTVSession = await androidTVSessionManager.createAndroidTVSession({
            sessionId,
            channelId,
            streamUrl: targetUrl,
            clientInfo: {
              userAgent,
              platform: isAndroidTV ? 'AndroidTV' : 'Unknown',
              remoteAddress: req.ip || req.connection.remoteAddress
            },
            plexSessionId: consumerSessionId,
            consumerSessionId: consumerSessionId
          });
          
          logger.info('Created Android TV enhanced session for long-running stability', {
            sessionId,
            channelId,
            consumerSessionId,
            sessionUptime: 0,
            healthMonitoringEnabled: true
          });
        } catch (androidTVError) {
          logger.error('Failed to create Android TV enhanced session - using fallback', {
            error: androidTVError.message,
            sessionId,
            channelId
          });
        }
      }
      
      // Helper function to sanitize headers
      const sanitizeHeader = (header) => {
        if (!header) return null;
        // Prevent SQL injection, XSS, and limit length
        return header.toString().substring(0, 255).replace(/[<>'"]/g, '');
      };

      // Extract comprehensive Plex client information with validation
      const plexHeaders = {
        clientIdentifier: sanitizeHeader(req.headers['x-plex-client-identifier']) || `unknown-${req.ip}`,
        clientName: sanitizeHeader(req.headers['x-plex-client-name']) || 'Unknown Plex Client',
        clientVersion: sanitizeHeader(req.headers['x-plex-client-version']) || 'unknown',
        product: sanitizeHeader(req.headers['x-plex-product']) || 'Plex',
        platform: sanitizeHeader(req.headers['x-plex-platform']) || (isAndroidTV ? 'AndroidTV' : 'Unknown'),
        platformVersion: sanitizeHeader(req.headers['x-plex-platform-version']) || 'unknown',
        device: sanitizeHeader(req.headers['x-plex-device']) || 'Unknown Device',
        deviceName: sanitizeHeader(req.headers['x-plex-device-name']) || 'Unknown',
        username: sanitizeHeader(req.headers['x-plex-username']) || sanitizeHeader(req.headers['x-plex-user']) || null,
        token: sanitizeHeader(req.headers['x-plex-token']) || null,
        session: sanitizeHeader(req.headers['x-plex-session-identifier']) || consumerSessionId,
        // Add validation flags
        hasUserInfo: !!(req.headers['x-plex-username'] || req.headers['x-plex-user']),
        hasClientInfo: !!req.headers['x-plex-client-identifier']
      };

      // Log when critical headers are missing for debugging
      if (!plexHeaders.hasClientInfo) {
        logger.warn('Missing Plex client identifier, session tracking may be limited', {
          ip: req.ip,
          userAgent: userAgent,
          headers: Object.keys(req.headers).filter(h => h.startsWith('x-plex'))
        });
      }

      const clientInfo = {
        userAgent,
        platform: plexHeaders.platform,
        product: plexHeaders.product,
        remoteAddress: req.ip || req.connection.remoteAddress,
        consumerSessionId: consumerSessionId,
        // Enhanced Plex client tracking (matching database schema)
        plex_client_id: plexHeaders.clientIdentifier,
        plex_client_name: plexHeaders.clientName,
        plex_username: plexHeaders.username,
        plex_device: plexHeaders.device,
        plex_device_name: plexHeaders.deviceName,
        // Create unique client identifier for session differentiation
        unique_client_id: `${plexHeaders.clientIdentifier}_${req.ip}_${plexHeaders.session}`,
        display_name: plexHeaders.username || plexHeaders.deviceName || plexHeaders.clientName || req.ip
      };
      
      // Generate collision-resistant session ID using crypto
      const crypto = require('crypto');
      const uniqueSessionId = `session_${channelId}_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
      
      // Create or get existing persistent session
      const persistentSession = sessionManager.createSession(channelId, uniqueSessionId, null, clientInfo);
      
      // CRITICAL ANDROID TV FIX: Always create both session IDs as consumers
      // This prevents the "Failed to find consumer" error in Plex server logs
      
      // Create primary session
      sessionManager.createSession(channelId, sessionId, null, clientInfo);
      
      // Always create consumer session alias (even if same ID) to ensure Plex can find consumer
      sessionManager.createSession(channelId, consumerSessionId, null, {
        ...clientInfo,
        isConsumerAlias: true,
        primarySessionId: sessionId,
        consumerType: 'plex_session_identifier'
      });
      
      // CRITICAL: Also register with consumer manager for "Failed to find consumer" fix
      const consumerManager = getConsumerManager();
      if (consumerManager && consumerManager.registerConsumer) {
        // Register both session IDs as active consumers
        consumerManager.registerConsumer(sessionId, {
          channelId,
          streamUrl: targetUrl,
          clientInfo,
          sessionType: 'primary',
          timestamp: Date.now()
        });
        
        consumerManager.registerConsumer(consumerSessionId, {
          channelId,
          streamUrl: targetUrl,
          clientInfo,
          sessionType: 'consumer_alias',
          primarySessionId: sessionId,
          timestamp: Date.now()
        });
        
        logger.info('Registered consumers to prevent "Failed to find consumer" errors', {
          primarySessionId: sessionId,
          consumerSessionId: consumerSessionId,
          channelId
        });
      }
      
      logger.info('Created enhanced consumer session management', {
        primarySessionId: sessionId,
        consumerSessionId: consumerSessionId,
        isAndroidTV,
        channelId
      });
      
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
      
      // ANDROID TV SESSION RESILIENCE: Prevent premature termination
      if (isAndroidTV) {
        // Extract quality parameters for Android TV
        const quality = req.query.quality || req.query.Quality || 'high';
        const audioBoost = req.query.audioBoost || req.query.AudioBoost || '100';
        const directStream = req.query.directStream || req.query.DirectStream || '1';
        
        res.set({
          'X-Android-TV-Session': 'true',
          'X-Session-Timeout': '300',  // 5 minutes timeout for Android TV
          'X-Reconnect-Grace': '30',   // 30 seconds grace period for reconnection
          'X-Buffer-Resilience': 'high', // High resilience for buffering
          'X-Quality-Selected': quality,
          'X-Audio-Boost': audioBoost,
          'X-Direct-Stream': directStream,
          'X-Transcoding-Compatible': 'true',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        
        logger.info('Applied Android TV session resilience headers', {
          sessionId,
          consumerSessionId,
          channelId,
          timeout: '300s',
          gracePeriod: '30s'
        });
      }
      
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
    
    if (isSubFile) {
      // CRITICAL FIX: Use HLS Segment Resolver for proper segment URL resolution
      // This fixes Android TV 404 errors by dynamically resolving segment URLs from playlists
      if (filename.endsWith('.ts') || filename.endsWith('.m4s') || filename.endsWith('.mp4')) {
        try {
          // Use the HLS segment resolver to get the actual segment URL
          targetUrl = await hlsSegmentResolver.resolveSegmentUrl(stream.url, filename, {
            userAgent: req.get('User-Agent')
          });
          
          logger.info('Resolved HLS segment URL dynamically', {
            originalUrl: stream.url,
            segmentFilename: filename,
            resolvedUrl: targetUrl.substring(0, 80) + '...',
            isAndroidTV
          });
        } catch (resolveError) {
          logger.error('Failed to resolve HLS segment URL, using fallback', {
            error: resolveError.message,
            streamUrl: stream.url,
            filename
          });
          
          // Fallback to old logic temporarily
          if (stream.url.includes('i.mjh.nz/.r/discovery-hgtv.m3u8')) {
            // HGTV redirects to https://mediapackage-hgtv-source.fullscreen.nz/index.m3u8
            targetUrl = `https://mediapackage-hgtv-source.fullscreen.nz/${filename}`;
            logger.info('Using hardcoded HGTV target URL', { targetUrl, filename });
          } else {
            // Try to construct based on base URL
            const baseUrl = stream.url.replace(/\/[^\/]*\.m3u8.*$/, '/');
            targetUrl = baseUrl + filename;
          }
        }
      } else if (stream.url.includes('i.mjh.nz/.r/discovery-hgtv.m3u8')) {
        // HGTV redirects to https://mediapackage-hgtv-source.fullscreen.nz/index.m3u8
        targetUrl = `https://mediapackage-hgtv-source.fullscreen.nz/${filename}`;
        logger.info('Using hardcoded HGTV target URL', { targetUrl, filename });
      } else {
        // For other sub-files (like .m3u8 variants), try to resolve redirect using curl-like approach
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
      // Handle ALL segment types with proper error recovery (not just .ts)
      if (filename.endsWith('.ts') || filename.endsWith('.m4s') || filename.endsWith('.mp4') || filename.match(/\d+\.ts$/)) {
        logger.info('Handling media segment request', {
          channelId,
          filename,
          targetUrl,
          sessionId,
          fileType: filename.split('.').pop()
        });
        
        // ANDROID TV CRITICAL FIX: Enhanced error handling for segment requests
        try {
          // Use segment handler for reliability with Android TV specific options
          return await segmentHandler.streamSegment(targetUrl, res, {
            userAgent: userAgent,
            headers: {
              'X-Session-ID': sessionId,
              'Accept': '*/*',
              'Connection': 'keep-alive'
            },
            // Android TV specific timeout and retry settings
            timeout: 15000,
            maxRetries: 5,
            androidTV: isAndroidTV
          });
        } catch (segmentError) {
          logger.error('Segment handler failed, attempting direct fallback', {
            targetUrl,
            filename,
            error: segmentError.message,
            isAndroidTV
          });
          
          // FALLBACK: Direct proxy attempt if segment handler fails
          try {
            const axios = require('axios');
            const response = await axios.get(targetUrl, {
              responseType: 'arraybuffer',
              timeout: 10000,
              headers: {
                'User-Agent': userAgent || 'PlexBridge/1.0',
                'Accept': '*/*'
              }
            });
            
            res.set({
              'Content-Type': response.headers['content-type'] || 'video/mp2t',
              'Content-Length': response.headers['content-length'],
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Access-Control-Allow-Origin': '*'
            });
            
            return res.send(Buffer.from(response.data));
            
          } catch (fallbackError) {
            logger.error('Both segment handler and fallback failed', {
              targetUrl,
              filename,
              segmentError: segmentError.message,
              fallbackError: fallbackError.message,
              isAndroidTV
            });
            
            // LAST RESORT: Return specific 404 with Android TV friendly error
            if (isAndroidTV) {
              res.status(410).set({
                'Content-Type': 'text/plain',
                'X-Android-TV-Error': 'segment-unavailable'
              }).send('Segment temporarily unavailable - please retry');
            } else {
              res.status(404).send('Segment not found');
            }
            return;
          }
        }
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
                extendTimeout: 300000, // 5 minutes timeout instead of default
                bufferingProtection: true, // Protect against buffering-induced termination
                resilientMode: true // Enable resilient streaming mode
              });
              
              logger.debug('Android TV session extended for HLS segment', {
                sessionId: finalSessionId,
                filename,
                channelId,
                resilientMode: true
              });
            } catch (sessionError) {
              logger.warn('Failed to update Android TV session activity:', sessionError.message);
            }
          }
          
          // ENHANCED: Update Android TV session manager for proactive health monitoring
          if (isAndroidTV && finalSessionId) {
            androidTVSessionManager.updateSessionActivity(finalSessionId, 'hls_segment_request');
            logger.debug('Updated Android TV session manager activity', {
              sessionId: finalSessionId,
              activityType: 'hls_segment_request',
              filename
            });
          }
          
          // ADDITIONAL ANDROID TV FIX: Monitor for session health
          if (isAndroidTV && finalSessionId) {
            try {
              // Emit session health event to prevent premature termination
              const io = global.io;
              if (io) {
                io.emit('android-tv-session-active', {
                  sessionId: finalSessionId,
                  channelId,
                  timestamp: new Date().toISOString(),
                  segmentRequest: filename,
                  healthy: true
                });
              }
            } catch (emitError) {
              // Non-critical error, just log
              logger.debug('Failed to emit Android TV session health:', emitError.message);
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

// Cleaned playlist proxy endpoint for beacon URL processing
router.get('/stream/playlist/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;
    
    logger.debug('Cleaned playlist request', { playlistId });
    
    // Get cleaned playlist from StreamManager
    const cleanedPlaylists = streamManager.cleanedPlaylists;
    if (!cleanedPlaylists || !cleanedPlaylists.has(playlistId)) {
      logger.warn('Cleaned playlist not found or expired', { playlistId });
      return res.status(404).send('Playlist not found or expired');
    }
    
    const playlistData = cleanedPlaylists.get(playlistId);
    const now = Date.now();
    
    // Check if playlist has expired (older than 5 minutes)
    if (now - playlistData.timestamp > 5 * 60 * 1000) {
      cleanedPlaylists.delete(playlistId);
      logger.warn('Cleaned playlist expired', { playlistId });
      return res.status(404).send('Playlist expired');
    }
    
    // Set appropriate headers for HLS playlist
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization'
    });
    
    logger.info('Serving cleaned playlist', {
      playlistId,
      originalUrl: playlistData.originalUrl,
      contentLength: playlistData.content.length
    });
    
    res.send(playlistData.content);
    
  } catch (error) {
    logger.error('Error serving cleaned playlist', {
      playlistId: req.params.playlistId,
      error: error.message,
      stack: error.stack
    });
    res.status(500).send('Internal server error');
  }
});

// HLS segment endpoint for Plex Web Client streaming
router.get('/api/streams/segment/:sessionId/:filename', async (req, res) => {
  try {
    const { sessionId, filename } = req.params;
    const fs = require('fs');
    const path = require('path');
    
    logger.debug('HLS segment request', { sessionId, filename });
    
    // Validate the filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      logger.warn('Invalid segment filename', { sessionId, filename });
      return res.status(400).send('Invalid filename');
    }
    
    // Construct the segment path
    const segmentPath = path.join('data/cache', filename);
    
    // Check if the file exists
    if (!fs.existsSync(segmentPath)) {
      logger.warn('HLS segment not found', { sessionId, filename, segmentPath });
      return res.status(404).send('Segment not found');
    }
    
    // Get file stats for content length
    const stats = fs.statSync(segmentPath);
    
    // Set proper headers for MPEG-TS segment
    res.set({
      'Content-Type': 'video/mp2t',
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Accept-Ranges': 'bytes'
    });
    
    // Stream the file
    const stream = fs.createReadStream(segmentPath);
    stream.pipe(res);
    
    stream.on('error', (error) => {
      logger.error('Error streaming HLS segment', {
        sessionId,
        filename,
        error: error.message
      });
      if (!res.headersSent) {
        res.status(500).send('Error streaming segment');
      }
    });
    
  } catch (error) {
    logger.error('HLS segment endpoint error', {
      sessionId: req.params.sessionId,
      filename: req.params.filename,
      error: error.message
    });
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
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