const express = require('express');
const router = express.Router();
const ssdpService = require('../services/ssdpService');
const streamManager = require('../services/streamManager');
const database = require('../services/database');
const logger = require('../utils/logger');
const { cacheMiddleware, responseTimeMonitor, generateLightweightEPG } = require('../utils/performanceOptimizer');
const cacheService = require('../services/cacheService');
const { getSessionManager } = require('../utils/sessionPersistenceFix');
const { enhanceLineupForStreamingDecisions, validateStreamingMetadata, generateDeviceXMLWithStreamingInfo } = require('../utils/streamingDecisionFix');
const { channelSwitchingMiddleware, optimizeLineupForChannelSwitching } = require('../utils/channelSwitchingFix');
const { getConsumerManager } = require('../services/consumerManager');
const coordinatedSessionManager = require('../services/coordinatedSessionManager');
const clientCrashDetector = require('../services/clientCrashDetector');
const { v4: uuidv4 } = require('uuid');

// HDHomeRun discovery endpoint with caching
router.get('/discover.json', cacheMiddleware('discover'), responseTimeMonitor(100), async (req, res) => {
  try {
    // Set timeout to ensure response within reasonable time
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        logger.error('Discovery endpoint timeout', { userAgent: req.get('User-Agent') });
        res.status(503).json({ error: 'Discovery service temporarily unavailable' });
      }
    }, 5000);

    const discovery = await ssdpService.generateDiscoveryResponse();
    clearTimeout(timeoutId);
    
    if (!res.headersSent) {
      // Set appropriate headers to prevent caching issues
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Type': 'application/json'
      });
      
      logger.debug('HDHomeRun discovery request', { userAgent: req.get('User-Agent') });
      res.json(discovery);
    }
  } catch (error) {
    logger.error('Discovery endpoint error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Discovery failed' });
    }
  }
});

// Device description XML with streaming capabilities
router.get('/device.xml', responseTimeMonitor(50), async (req, res) => {
  try {
    // Get device info from SSDP service
    const discovery = await ssdpService.generateDiscoveryResponse();
    const deviceInfo = {
      friendlyName: discovery.FriendlyName || 'PlexBridge',
      uuid: discovery.DeviceID || 'plexbridge-001',
      tunerCount: discovery.TunerCount || 4
    };
    
    // Generate simple device XML
    const deviceXml = `<?xml version="1.0" encoding="UTF-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <friendlyName>${deviceInfo.friendlyName}</friendlyName>
    <manufacturer>Silicondust</manufacturer>
    <manufacturerURL>http://www.silicondust.com/</manufacturerURL>
    <modelName>HDHomeRun</modelName>
    <modelNumber>HDHR4-2US</modelNumber>
    <serialNumber>${deviceInfo.uuid}</serialNumber>
    <UDN>uuid:${deviceInfo.uuid}</UDN>
    <presentationURL>http://${req.get('host')}/</presentationURL>
  </device>
</root>`;
    
    res.set({
      'Content-Type': 'application/xml',
      'Cache-Control': 'private, max-age=600' // 10 minute cache
    });
    res.send(deviceXml);
  } catch (error) {
    logger.error('Device description error:', error);
    res.status(500).send('<?xml version="1.0"?><error>Device description failed</error>');
  }
});

// Lineup status endpoint with caching
router.get('/lineup_status.json', cacheMiddleware('lineup_status'), responseTimeMonitor(100), async (req, res) => {
  try {
    const activeStreams = await streamManager.getActiveStreams();
    const tunerStatus = ssdpService.generateTunerStatus();
    
    // Update tuner status based on active streams
    activeStreams.forEach((stream, index) => {
      if (index < tunerStatus.length) {
        tunerStatus[index].InUse = 1;
        tunerStatus[index].VctNumber = stream.channelNumber || '';
        tunerStatus[index].VctName = stream.channelName || '';
        tunerStatus[index].TargetIP = `${stream.clientIP}:0`;
      }
    });

    // Get current settings to determine advertised host
    const settingsService = require('../services/settingsService');
    const config = require('../config');
    const settings = await settingsService.getSettings();
    
    // Priority order: Settings > Environment variable > Config > Auto-detect fallback
    let baseHost = settings?.plexlive?.network?.advertisedHost ||              // Settings UI
                  process.env.ADVERTISED_HOST ||                              // Docker environment
                  config.plexlive?.network?.advertisedHost ||                 // Config file  
                  config.network?.advertisedHost;                             // Legacy config
    
    if (!baseHost) {
      // Auto-detect IP as fallback
      const networkInterfaces = require('os').networkInterfaces();
      let localIP = '127.0.0.1';
      for (const interfaceName in networkInterfaces) {
        const addresses = networkInterfaces[interfaceName];
        for (const address of addresses) {
          if (address.family === 'IPv4' && !address.internal) {
            localIP = address.address;
            break;
          }
        }
        if (localIP !== '127.0.0.1') break;
      }
      
      // Get port from request host or use default
      const defaultPort = config.server?.port || process.env.HTTP_PORT || process.env.PORT || 3000;
      const hostHeader = req.get('host') || `localhost:${defaultPort}`;
      const port = hostHeader.split(':')[1] || defaultPort;
      baseHost = `${localIP}:${port}`;
    }
    
    // Ensure we have port if not included
    if (!baseHost.includes(':')) {
      const streamingPort = settings?.plexlive?.network?.streamingPort || 
                           config.plexlive?.network?.streamingPort || 
                           config.server?.port || 
                           process.env.HTTP_PORT || 
                           process.env.PORT || 
                           3000;
      baseHost += `:${streamingPort}`;
    }
    
    // Ensure we have http:// prefix
    const baseURL = baseHost.startsWith('http') ? baseHost : `http://${baseHost}`;
    
    // Use cached EPG count for performance
    let epgCount = await cacheService.get('epg:count');
    if (!epgCount) {
      epgCount = await database.get('SELECT COUNT(*) as count FROM epg_programs');
      await cacheService.set('epg:count', epgCount, 300); // Cache for 5 minutes
    }
    const hasEPGData = epgCount && epgCount.count > 0;

    const status = {
      ScanInProgress: 0,
      ScanPossible: 1,
      Source: 'Cable',
      SourceList: ['Cable'],
      
      // Enhanced EPG Status Information for Android TV
      EPGAvailable: true,
      EPGSource: `${baseURL}/epg/xmltv.xml`,
      EPGURL: `${baseURL}/epg/xmltv.xml`,
      GuideURL: `${baseURL}/epg/xmltv.xml`,
      XMLTVGuideDataURL: `${baseURL}/epg/xmltv.xml`,
      EPGDataURL: `${baseURL}/epg/xmltv.xml`,
      EPGDays: 7,
      EPGLastUpdate: new Date().toISOString(),
      SupportsEPG: true,
      
      // Android TV metadata hints
      HasProgramData: hasEPGData,
      ProgramCount: epgCount?.count || 0,
      DeviceModel: 'PlexBridge HDHomeRun',
      FirmwareVersion: '1.0.0',
      DeviceAuth: 'plexbridge'
    };

    res.json(status);
  } catch (error) {
    logger.error('Lineup status error:', error);
    res.status(500).json({ error: 'Lineup status failed' });
  }
});

// Channel lineup endpoint - FIXED for Plex MediaContainer compatibility
router.get('/lineup.json', async (req, res) => {
  try {
    // Get all enabled channels
    const channels = await database.all(`
      SELECT c.*, s.url, s.type 
      FROM channels c 
      LEFT JOIN streams s ON c.id = s.channel_id 
      WHERE c.enabled = 1 AND s.enabled = 1
      ORDER BY c.number
    `);

    // Get base URL for streams
    const settingsService = require('../services/settingsService');
    const config = require('../config');
    const settings = await settingsService.getSettings();
    
    let baseHost = process.env.ADVERTISED_HOST ||
                  settings?.plexlive?.network?.advertisedHost ||
                  config.plexlive?.network?.advertisedHost ||
                  config.network?.advertisedHost ||
                  req.get('host') ||
                  `localhost:${config.server?.port || process.env.HTTP_PORT || process.env.PORT || 3000}`;
    
    if (!baseHost.includes(':')) {
      const streamingPort = settings?.plexlive?.network?.streamingPort || 
                           config.plexlive?.network?.streamingPort || 
                           config.server?.port || 
                           process.env.HTTP_PORT || 
                           process.env.PORT || 
                           3000;
      baseHost += `:${streamingPort}`;
    }
    
    const baseURL = baseHost.startsWith('http') ? baseHost : `http://${baseHost}`;
    
    // Create enhanced lineup for Android TV compatibility
    let lineup = channels.map(channel => ({
      GuideNumber: channel.number.toString(),
      GuideName: channel.name,
      VideoCodec: 'H264', // H264 for better Android TV support
      AudioCodec: 'AAC',
      Container: 'MPEGTS',
      URL: `${baseURL}/stream/${channel.id}`,
      // Android TV compatibility fields
      MediaType: 'LiveTV',
      ContentType: 4,
      Live: true
    }));
    
    // Detect Android TV clients and optimize lineup
    const userAgent = req.get('User-Agent') || '';
    const isAndroidTV = userAgent.toLowerCase().includes('androidtv') || 
                       userAgent.toLowerCase().includes('android tv') ||
                       userAgent.toLowerCase().includes('nexusplayer') ||
                       userAgent.toLowerCase().includes('mibox') ||
                       userAgent.toLowerCase().includes('shield');
    
    if (isAndroidTV) {
      lineup = optimizeLineupForChannelSwitching(lineup, true);
      lineup = enhanceLineupForStreamingDecisions(lineup, true);
    }

    logger.debug('Channel lineup request', { 
      channelCount: lineup.length,
      userAgent: req.get('User-Agent')
    });

    // CRITICAL: Proper headers to prevent HTML response errors and force cache refresh
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': `"plexbridge-lineup-${Date.now()}"`,
      'Last-Modified': new Date().toUTCString(),
      'Vary': 'User-Agent, Accept',
      'X-Content-Type': 'live-tv-lineup',
      'X-Metadata-Version': '4.0-corrected'  // Signal that metadata is corrected
    });

    res.json(lineup);
  } catch (error) {
    logger.error('Channel lineup error:', error);
    
    // Return minimal JSON response instead of HTML error
    res.set({
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.status(500).json([]);
  }
});

// Consumer tracking endpoint - prevents "Failed to find consumer" errors
router.get('/consumer/:sessionId/:action?', async (req, res) => {
  try {
    const { sessionId, action } = req.params;
    const userAgent = req.get('User-Agent') || '';
    const clientIP = req.ip || req.connection.remoteAddress;
    
    logger.info('Plex consumer request', { 
      sessionId, 
      action, 
      userAgent,
      clientIP,
      headers: {
        'x-plex-session-identifier': req.headers['x-plex-session-identifier'],
        'x-session-id': req.headers['x-session-id']
      },
      query: req.query
    });

    // Detect Android TV clients
    const isAndroidTV = userAgent.toLowerCase().includes('androidtv') || 
                       userAgent.toLowerCase().includes('android tv') ||
                       userAgent.toLowerCase().includes('nexusplayer') ||
                       userAgent.toLowerCase().includes('mibox') ||
                       userAgent.toLowerCase().includes('shield');

    // Update coordinated session activity with crash detection
    const activityRecorded = coordinatedSessionManager.updateSessionActivity(
      sessionId, 
      'consumer', 
      { 
        action: action || 'status',
        userAgent,
        clientIP,
        isAndroidTV
      }
    );

    // Check session health using crash detector
    const sessionHealth = clientCrashDetector.checkSessionHealth(sessionId);
    
    // If session is unhealthy, respond accordingly but don't crash
    if (!sessionHealth.healthy) {
      logger.warn('Consumer request for unhealthy session', {
        sessionId,
        healthReason: sessionHealth.reason,
        action: sessionHealth.action,
        isAndroidTV
      });
      
      // For confirmed crashes, return error state
      if (sessionHealth.reason === 'confirmed_crash' || sessionHealth.reason === 'confirmed_timeout_crash') {
        res.set({
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        
        return res.status(410).json({
          success: false,
          sessionId,
          status: 'terminated',
          consumer: {
            id: sessionId,
            available: false,
            active: false,
            state: 'crashed',
            lastActivity: Date.now(),
            status: 'disconnected',
            instanceAvailable: false,
            hasConsumer: false,
            crashReason: sessionHealth.reason
          },
          error: 'Session terminated due to client crash',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Update legacy session managers for compatibility
    const sessionManager = getSessionManager();
    if (sessionId && sessionManager) {
      sessionManager.updateSessionActivity(sessionId);
      
      const sessionStatus = sessionManager.getSessionStatus(sessionId);
      if (!sessionStatus.exists) {
        sessionManager.createSession('consumer', sessionId, '', {
          userAgent,
          isConsumerEndpoint: true,
          action: action || 'status'
        });
      }
    }

    // Always respond with success for consumer requests (unless crashed)
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    const consumerResponse = {
      success: true,
      sessionId: sessionId,
      status: sessionHealth.healthy ? 'active' : 'monitoring',
      consumer: {
        id: sessionId,
        available: true,
        active: sessionHealth.healthy,
        state: sessionHealth.healthy ? 'streaming' : 'monitoring',
        lastActivity: Date.now(),
        status: 'connected',
        instanceAvailable: sessionHealth.healthy,
        hasConsumer: sessionHealth.healthy,
        
        // Health information
        healthStatus: sessionHealth.reason,
        
        // Android TV specific consumer fields
        ...(isAndroidTV && {
          ready: sessionHealth.healthy,
          buffering: !sessionHealth.healthy,
          clientType: 'AndroidTV',
          metadata_type: 'clip',
          contentType: 4,
          live: 1
        })
      },
      session: {
        healthy: sessionHealth.healthy,
        reason: sessionHealth.reason
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(consumerResponse);
  } catch (error) {
    logger.error('Consumer tracking error:', error);
    // Always succeed to prevent crashes but include consumer object
    res.status(200).json({ 
      success: true,
      consumer: { available: true, state: 'error' }
    });
  }
});

// Timeline endpoint - prevents unknown metadata item errors  
router.get('/timeline/:itemId?', async (req, res) => {
  try {
    const { itemId } = req.params;
    
    // Enhanced logging for Grabber detection
    const userAgent = req.get('User-Agent') || '';
    const isGrabber = userAgent.includes('Grabber') || req.get('X-Plex-Client-Identifier')?.includes('grabber');
    
    logger.info('PLEX TIMELINE REQUEST - Enhanced monitoring', { 
      itemId,
      query: req.query,
      userAgent: userAgent.substring(0, 200),
      isGrabberRequest: isGrabber,
      plexClientId: req.get('X-Plex-Client-Identifier'),
      plexProduct: req.get('X-Plex-Product'),
      plexVersion: req.get('X-Plex-Version'),
      origin: req.get('origin'),
      referer: req.get('referer'),
      timestamp: new Date().toISOString()
    });
    
    if (isGrabber) {
      logger.warn('PLEX GRABBER DETECTED - Timeline metadata consistency critical', {
        itemId,
        userAgent: userAgent.substring(0, 100),
        preventingType5: true
      });
    }
    
    // Return complete timeline response with proper metadata
    res.set({
      'Content-Type': 'application/json; charset=utf-8', 
      'Cache-Control': 'no-cache, no-store, must-revalidate, private, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Last-Modified': new Date().toUTCString(),
      'ETag': `"timeline-${Date.now()}-${Math.random()}"`,
      
      // CRITICAL: Grabber-specific cache invalidation headers
      'X-Plex-Cache-Invalidate': 'force',
      'X-Plex-Grabber-Refresh': 'true',
      'X-Metadata-Consistency': 'episode-type-4-only',
      'X-Content-Type-Locked': '4',
      'X-Timeline-Type-Locked': 'episode',
      'X-Grabber-Cache-Prevent': 'active',
      
      'X-Metadata-Version': Date.now().toString(),
      'X-PlexBridge-Timeline': 'episode-type-4-validated'
    });
    
    // Provide a valid timeline entry to prevent completion duration errors
    const timeline = {
      MediaContainer: {
        size: 1,
        identifier: "com.plexapp.plugins.library",
        machineIdentifier: process.env.DEVICE_UUID || 'plextv-001',
        Timeline: [{
          state: "playing",
          type: "episode", // CRITICAL: Must match contentType: 4 = episode for Grabber consistency
          itemType: "episode", // Consistent with contentType: 4 = episode
          ratingKey: itemId || "18961",
          key: `/library/metadata/${itemId || "18961"}`,
          playQueueItemID: parseInt(itemId) || 18961,
          playQueueID: 1,
          playQueueVersion: 1,
          containerKey: `/playQueues/1`,
          metadataId: itemId || "18961",
          time: 0,
          duration: 86400000, // 24 hours for live TV
          seekRange: "0-86400000",
          playbackTime: 0,
          playbackRate: 1.0,
          repeat: 0,
          volume: 1.0,
          shuffle: false,
          viewOffset: 0,
          hasMDE: 1,
          audioStreamID: 1,
          videoStreamID: 1,
          subtitleStreamID: -1,
          playMethod: "directplay",
          protocol: "http",
          address: req.get('host'),
          port: process.env.PORT || 3000,
          machineIdentifier: process.env.DEVICE_UUID || 'plextv-001',
          
          // Android TV specific metadata fields to fix "type 5" errors
          contentType: 4, // Type 4 is "episode" for Live TV (NEVER 5)
          metadata_type: 'episode',
          mediaType: 'episode',
          live: 1,
          grandparentTitle: 'Live TV',
          parentTitle: 'Live Programming',
          title: 'Live Stream',
          originalTitle: 'Live Stream',
          summary: 'Live television programming',
          index: 1,
          parentIndex: 1,
          year: new Date().getFullYear(),
          guid: `plexbridge://timeline/${itemId || Date.now()}`
        }]
      }
    };
    
    // Apply metadata validation before sending
    const { validateAndCorrectMetadata } = require('../utils/metadataTypeValidator');
    const validatedTimeline = validateAndCorrectMetadata(timeline, 'timeline-endpoint');
    
    res.json(validatedTimeline);
  } catch (error) {
    logger.error('Timeline error:', error);
    // Still return valid structure on error
    res.status(200).json({
      MediaContainer: {
        size: 1,
        Timeline: [{
          state: "playing",
          type: "video",
          ratingKey: "1",
          duration: 86400000
        }]
      }
    });
  }
});

// Metadata endpoint - handles all metadata requests to prevent unknown item errors
router.get('/library/metadata/:metadataId', async (req, res) => {
  try {
    const { metadataId } = req.params;
    
    logger.debug('Plex metadata request', { 
      metadataId,
      userAgent: req.get('User-Agent')
    });
    
    // Extract channel ID if this is a channel metadata request
    let channelId = metadataId;
    if (metadataId && metadataId.includes('_')) {
      channelId = metadataId.split('_')[1];
    }
    
    // Try to get real channel data
    let channel = null;
    try {
      channel = await database.get(`
        SELECT c.*, s.url, s.type 
        FROM channels c 
        LEFT JOIN streams s ON c.id = s.channel_id 
        WHERE c.id = ? OR c.number = ?
      `, [channelId, channelId]);
    } catch (dbError) {
      logger.debug('Could not fetch channel for metadata', { channelId, error: dbError.message });
    }
    
    // Build metadata response with real or fallback data
    const metadata = {
      MediaContainer: {
        size: 1,
        allowSync: 0,
        identifier: "com.plexapp.plugins.library",
        librarySectionID: 1,
        librarySectionTitle: "Live TV",
        librarySectionUUID: "e05e77e4-1cc3-4e1e-9e79-8bf9b51f5f3f",
        Video: [{
          ratingKey: metadataId || "18961",
          key: `/library/metadata/${metadataId}`,
          parentRatingKey: `show_${channelId}`,
          grandparentRatingKey: `series_${channelId}`,
          guid: `plex://clip/${metadataId}`,
          type: "clip",
          title: channel?.name || `Channel ${channelId}`,
          grandparentTitle: channel?.name || `Channel ${channelId}`,
          parentTitle: "Live Programming",
          contentRating: "TV-PG",
          summary: channel?.description || "Live television programming",
          index: 1,
          parentIndex: 1,
          year: new Date().getFullYear(),
          
          // CRITICAL: Android TV requires type="clip" for Live TV streams
          contentType: 4, // Type 4 is "clip" for Live TV
          metadata_type: 'clip',
          mediaType: 'clip',
          thumb: `/library/metadata/${metadataId}/thumb`,
          art: `/library/metadata/${metadataId}/art`,
          parentThumb: `/library/metadata/${metadataId}/parentThumb`,
          grandparentThumb: `/library/metadata/${metadataId}/grandparentThumb`,
          duration: 86400000, // 24 hours for live TV
          addedAt: Math.floor(Date.now() / 1000),
          updatedAt: Math.floor(Date.now() / 1000),
          live: 1,
          Media: [{
            id: channelId,
            duration: 86400000,
            bitrate: 5000,
            width: 1920,
            height: 1080,
            aspectRatio: 1.78,
            audioChannels: 2,
            audioCodec: "aac",
            videoCodec: "h264",
            videoResolution: "1080",
            container: "mpegts",
            videoFrameRate: "25",
            optimizedForStreaming: 1,
            protocol: "http",
            Part: [{
              id: channelId,
              key: `/stream/${channelId}`,
              duration: 86400000,
              file: `/stream/${channelId}`,
              size: 0,
              container: "mpegts",
              indexes: "sd",
              hasThumbnail: 0,
              Stream: [
                {
                  id: 1,
                  streamType: 1,
                  codec: "h264",
                  index: 0,
                  bitrate: 4000,
                  language: "eng",
                  languageCode: "eng",
                  height: 1080,
                  width: 1920,
                  frameRate: 25.0,
                  profile: "high",
                  level: "40",
                  pixelFormat: "yuv420p"
                },
                {
                  id: 2,
                  streamType: 2,
                  codec: "aac",
                  index: 1,
                  channels: 2,
                  bitrate: 128,
                  language: "eng",
                  languageCode: "eng",
                  samplingRate: 48000,
                  profile: "lc"
                }
              ]
            }]
          }]
        }]
      }
    };
    
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': `"plexbridge-metadata-${metadataId}-${Date.now()}"`,
      'Last-Modified': new Date().toUTCString(),
      'X-Content-Type': 'live-tv-metadata',
      'X-Metadata-Version': '4.0-corrected'  // Signal that metadata uses type 4, not 5
    });
    
    res.json(metadata);
  } catch (error) {
    logger.error('Metadata request error:', error);
    // Return minimal valid metadata on error with Android TV compatibility
    res.status(200).json({
      MediaContainer: {
        size: 1,
        identifier: "com.plexapp.plugins.library",
        librarySectionID: 1,
        librarySectionTitle: "Live TV",
        Video: [{
          ratingKey: req.params.metadataId,
          type: "clip",
          title: "Live TV",
          grandparentTitle: "Live TV",
          parentTitle: "Live Programming",
          duration: 86400000,
          live: 1,
          
          // CRITICAL: Android TV requires type="clip" for Live TV
          contentType: 4, // Type 4 is "clip" for Live TV
          metadata_type: 'clip',
          mediaType: 'clip',
          index: 1,
          parentIndex: 1,
          year: new Date().getFullYear(),
          summary: "Live television programming"
        }]
      }
    });
  }
});

// Metadata thumbnail endpoints - prevent 404s for image requests
router.get('/library/metadata/:metadataId/:imageType', (req, res) => {
  const { metadataId, imageType } = req.params;
  
  logger.debug('Plex image request', { metadataId, imageType });
  
  // Return a 1x1 transparent pixel for any image request
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  
  res.set({
    'Content-Type': 'image/png',
    'Content-Length': pixel.length,
    'Cache-Control': 'public, max-age=86400'
  });
  
  res.send(pixel);
});

// Catch-all route for any library requests that aren't handled
router.get('/library/*', (req, res) => {
  logger.debug('Catch-all library request', { 
    url: req.url,
    userAgent: req.get('User-Agent')
  });
  
  // Always return valid JSON MediaContainer to prevent HTML errors
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  
  res.json({
    MediaContainer: {
      size: 0,
      identifier: "com.plexapp.plugins.library",
      librarySectionID: 1,
      librarySectionTitle: "Live TV",
      allowSync: 0,
      art: "/:/resources/show-fanart.jpg",
      banner: "/:/resources/show-banner.jpg",
      key: "/library/sections/1",
      primary: "photo",
      prompt: "Search Live TV",
      searchTypes: "",
      theme: "/:/resources/show-theme.mp3",
      thumb: "/:/resources/show.png",
      title1: "Live TV",
      title2: "",
      viewGroup: "show",
      viewMode: 65592
    }
  });
});

// Live TV sessions endpoint - handles Plex Live TV session requests
router.get('/livetv/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { includeBandwidths, offset } = req.query;
    const userAgent = req.get('User-Agent') || '';
    const clientIP = req.ip || req.connection.remoteAddress;
    
    logger.debug('Plex Live TV session request', { 
      sessionId,
      includeBandwidths,
      offset,
      query: req.query,
      userAgent,
      clientIP
    });

    // CRITICAL: Check session health BEFORE responding
    // This prevents timeline calls from continuing after client crashes
    const sessionHealth = clientCrashDetector.checkSessionHealth(sessionId);
    
    if (!sessionHealth.healthy) {
      logger.warn('LiveTV session request for unhealthy session', {
        sessionId,
        healthReason: sessionHealth.reason,
        action: sessionHealth.action,
        userAgent
      });
      
      // For confirmed crashes, return error XML to stop timeline calls
      if (sessionHealth.reason === 'confirmed_crash' || sessionHealth.reason === 'confirmed_timeout_crash') {
        res.set({
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        
        const errorXML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="0" identifier="com.plexapp.plugins.library" error="Session terminated">
  <Error code="410" message="Session terminated due to client crash" />
</MediaContainer>`;
        
        logger.error('Returning error XML for crashed session', { sessionId });
        return res.status(410).send(errorXML);
      }
      
      // For possible crashes, don't create new sessions
      if (sessionHealth.reason === 'android_tv_possible_crash' || sessionHealth.reason === 'client_timeout') {
        res.set({
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        
        const timeoutXML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="0" identifier="com.plexapp.plugins.library" />`;
        
        logger.warn('Returning empty XML for possible crashed session', { sessionId });
        return res.status(204).send(timeoutXML);
      }
    }

    // Record timeline activity for crash detection
    coordinatedSessionManager.updateSessionActivity(sessionId, 'timeline', {
      includeBandwidths,
      offset,
      userAgent,
      clientIP,
      isLiveTVSession: true
    });
    
    // CRITICAL: Return XML MediaContainer that Plex expects (not JSON)
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    
    // Update session activity in legacy session manager for compatibility
    const sessionManager = getSessionManager();
    if (sessionId && sessionManager) {
      sessionManager.updateSessionActivity(sessionId);
      
      const sessionStatus = sessionManager.getSessionStatus(sessionId);
      if (!sessionStatus.exists) {
        // Only create session if health check passed
        if (sessionHealth.healthy) {
          sessionManager.createSession('livetv', sessionId, '', {
            userAgent,
            isLiveTVSession: true,
            isUniversalTranscode: true,
            keepAlive: true
          });
          logger.info('Created new LiveTV session for consumer tracking', {
            sessionId,
            userAgent
          });
        }
      } else {
        logger.debug('Updated existing LiveTV session activity', { sessionId });
      }
    }

    // Generate proper XML response for Plex Universal Transcode
    // CRITICAL: Use type="clip" (type 4) for Live TV - Android TV requires this
    const mediaContainerXML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1" identifier="com.plexapp.plugins.library" mediaTagPrefix="/system/bundle/media/flags/" mediaTagVersion="${Math.floor(Date.now() / 1000)}">
  <Video sessionKey="${sessionId}" key="/library/metadata/live-${sessionId}" ratingKey="live-${sessionId}" type="clip" title="Live TV Stream" duration="86400000" viewOffset="${offset || 0}" live="1" addedAt="${Math.floor(Date.now() / 1000)}" updatedAt="${Math.floor(Date.now() / 1000)}">
    <Media duration="86400000" container="mpegts" videoCodec="h264" audioCodec="aac" width="1920" height="1080" aspectRatio="1.78" bitrate="5000" audioChannels="2" videoFrameRate="25">
      <Part key="/stream/${sessionId}" file="/stream/${sessionId}" container="mpegts" duration="86400000" size="999999999" />
    </Media>
  </Video>
</MediaContainer>`;

    res.send(mediaContainerXML);

  } catch (error) {
    logger.error('Live TV session XML error:', error);
    
    // Record error for crash detection
    if (req.params.sessionId) {
      clientCrashDetector.recordActivity(req.params.sessionId, 'error', {
        error: error.message,
        type: 'livetv_session',
        httpCode: 500
      });
    }
    
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" />');
  }
});

// SSDP discovery endpoints continue below
// POST endpoint for Live TV session creation/updates
router.post('/livetv/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    logger.debug('Plex Live TV session POST', { 
      sessionId,
      body: req.body,
      query: req.query
    });
    
    // Return success response for session creation/update
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    
    res.json({
      MediaContainer: {
        size: 1,
        identifier: "com.plexapp.plugins.library",
        Session: [{
          id: sessionId,
          key: sessionId,
          status: "active",
          created: true
        }]
      }
    });
  } catch (error) {
    logger.error('Live TV session POST error:', error);
    res.status(200).json({
      MediaContainer: { size: 0 }
    });
  }
});

// Session-based HLS streaming endpoints for Android TV
router.get('/livetv/sessions/:sessionId/:clientId/index.m3u8', async (req, res) => {
  try {
    const { sessionId, clientId } = req.params;
    
    logger.info('Android TV HLS index request', { 
      sessionId, 
      clientId,
      query: req.query,
      userAgent: req.get('User-Agent')
    });
    
    // Get session info to determine channel
    const consumerManager = getConsumerManager();
    const consumer = consumerManager.getConsumer(sessionId);
    
    if (!consumer) {
      logger.error('No consumer found for session - attempting recovery', { sessionId });
      
      // Try to recover from database or recreate session
      const consumerManager = getConsumerManager();
      
      // First, check if this is an Android TV session pattern
      if (sessionId && sessionId.length > 20) {
        logger.info('Attempting to recover Android TV session', { sessionId });
        
        // Try to extract channel ID from the client or use a fallback approach
        try {
          // Create a temporary consumer to prevent immediate failure
          consumerManager.createConsumer(sessionId, null, null, {
            userAgent: req.get('User-Agent'),
            clientIp: req.ip,
            state: 'streaming',
            metadata: {
              recovered: true,
              originalRequest: req.originalUrl,
              timestamp: Date.now()
            }
          });
          
          logger.info('Created recovery consumer session', { sessionId });
          
          // Return a generic stream URL that will attempt to start any available stream
          const streamUrl = `/stream/1?session=${sessionId}&client=${clientId}&recovery=true`;
          res.redirect(302, streamUrl);
          return;
        } catch (recoveryError) {
          logger.error('Session recovery failed', { sessionId, error: recoveryError.message });
        }
      }
      
      return res.status(404).send('Session not found');
    }
    
    // Validate session IP for security
    if (consumer.clientIp && consumer.clientIp !== req.ip) {
      logger.warn('Session IP validation failed for HLS request', { 
        sessionId, 
        expectedIp: consumer.clientIp,
        requestIp: req.ip 
      });
      return res.status(403).send('Session access denied');
    }
    
    // Get channel from consumer
    const channel = await database.get('SELECT * FROM channels WHERE id = ?', [consumer.channelId]);
    
    if (!channel) {
      logger.error('No channel found for consumer', { 
        sessionId, 
        channelId: consumer.channelId 
      });
      return res.status(404).send('Channel not found');
    }
    
    // Redirect to actual stream with session tracking
    const streamUrl = `/stream/${channel.id}?session=${sessionId}&client=${clientId}`;
    
    logger.info('Redirecting Android TV HLS request', {
      sessionId,
      clientId,
      channelId: channel.id,
      streamUrl
    });
    
    // Update consumer activity
    consumerManager.updateActivity(sessionId);
    
    // Also update persistent session manager
    const sessionManager = getSessionManager();
    if (sessionManager) {
      sessionManager.updateSessionActivity(sessionId);
    }
    
    res.redirect(302, streamUrl);
    
  } catch (error) {
    logger.error('Session HLS index error:', error);
    res.status(500).send('Stream unavailable');
  }
});

// Session-based HLS segment endpoints for Android TV  
router.get('/livetv/sessions/:sessionId/:clientId/:filename', async (req, res) => {
  try {
    const { sessionId, clientId, filename } = req.params;
    
    logger.debug('Android TV HLS segment request', { 
      sessionId, 
      clientId, 
      filename,
      query: req.query
    });
    
    // Get session info
    const consumerManager = getConsumerManager();
    const consumer = consumerManager.getConsumer(sessionId);
    
    if (!consumer) {
      return res.status(404).send('Session not found');
    }
    
    // Validate session IP for security
    if (consumer.clientIp && consumer.clientIp !== req.ip) {
      logger.warn('Session IP validation failed for segment request', { 
        sessionId, 
        filename,
        expectedIp: consumer.clientIp,
        requestIp: req.ip 
      });
      return res.status(403).send('Session access denied');
    }
    
    // Get channel from consumer
    const channel = await database.get('SELECT * FROM channels WHERE id = ?', [consumer.channelId]);
    
    if (!channel) {
      return res.status(404).send('Channel not found');
    }
    
    // Redirect to actual stream segment
    const segmentUrl = `/stream/${channel.id}/${filename}?session=${sessionId}&client=${clientId}`;
    
    // Update consumer activity
    consumerManager.updateActivity(sessionId);
    
    // Also update persistent session manager
    const sessionManager = getSessionManager();
    if (sessionManager) {
      sessionManager.updateSessionActivity(sessionId);
    }
    
    res.redirect(302, segmentUrl);
    
  } catch (error) {
    logger.error('Session HLS segment error:', error);
    res.status(404).send('Segment unavailable');
  }
});

// Channel tuning endpoint for Android TV
router.post('/livetv/dvrs/:dvrId/channels/:channelNumber/tune', async (req, res) => {
  try {
    const { dvrId, channelNumber } = req.params;
    const { autoPreview } = req.query;
    
    logger.info('Android TV channel tune request', {
      dvrId,
      channelNumber, 
      autoPreview,
      query: req.query,
      body: req.body,
      userAgent: req.get('User-Agent')
    });
    
    // Find channel by number
    const channel = await database.get('SELECT * FROM channels WHERE number = ?', [channelNumber]);
    
    if (!channel) {
      logger.error('Channel not found for tuning', { channelNumber });
      return res.status(404).json({
        error: 'Channel not found',
        channelNumber
      });
    }
    
    // Create session for this tuning request
    const sessionId = uuidv4();
    const clientId = req.headers['x-plex-client-identifier'] || 'android-tv-client';
    
    // Create consumer session with channel association
    const consumerManager = getConsumerManager();
    
    // Check for existing session to prevent conflicts
    const existingSession = consumerManager.getConsumer(sessionId);
    if (existingSession && existingSession.clientIp !== req.ip) {
      logger.warn('Session IP mismatch detected', { 
        sessionId, 
        existingIp: existingSession.clientIp,
        requestIp: req.ip 
      });
      return res.status(403).json({ 
        error: 'Session access denied',
        code: 'SESSION_IP_MISMATCH'
      });
    }
    
    const consumer = consumerManager.createConsumer(sessionId, channel.id, null, {
      userAgent: req.get('User-Agent'),
      clientIp: req.ip,
      state: 'streaming',
      metadata: {
        channelNumber: channel.number,
        channelName: channel.name,
        dvrId: dvrId,
        clientId: clientId
      }
    });
    
    // Return session info in format Plex expects
    const sessionResponse = {
      MediaContainer: {
        size: 1,
        identifier: "com.plexapp.plugins.library",
        Session: [{
          id: sessionId,
          key: `/livetv/sessions/${sessionId}`,
          ratingKey: `live-${channel.id}`,
          sessionKey: sessionId,
          type: "clip",
          title: channel.name,
          summary: `Live TV on ${channel.name}`,
          duration: 86400000,
          viewOffset: 0,
          live: 1,
          addedAt: Math.floor(Date.now() / 1000),
          updatedAt: Math.floor(Date.now() / 1000),
          Media: [{
            id: 1,
            duration: 86400000,
            bitrate: 5000,
            width: 1920,
            height: 1080,
            aspectRatio: 1.78,
            audioChannels: 2,
            audioCodec: "aac",
            videoCodec: "h264", 
            videoResolution: "1080",
            container: "mpegts",
            videoFrameRate: "25p",
            Part: [{
              id: 1,
              key: `/livetv/sessions/${sessionId}/${clientId}/index.m3u8`,
              file: `/stream/${channel.id}`,
              size: 999999999,
              duration: 86400000,
              container: "mpegts"
            }]
          }]
        }]
      }
    };
    
    logger.info('Created tuning session', {
      sessionId,
      channelId: channel.id,
      channelNumber: channel.number,
      channelName: channel.name
    });
    
    res.json(sessionResponse);
    
  } catch (error) {
    logger.error('Channel tune error:', error);
    res.status(500).json({
      error: 'Tuning failed',
      message: error.message
    });
  }
});

// Catch-all for other Live TV endpoints (GET)
router.get('/livetv/*', async (req, res) => {
  logger.debug('Plex Live TV catch-all GET request', { 
    path: req.path,
    query: req.query,
    userAgent: req.get('User-Agent')
  });
  
  // Always return valid MediaContainer
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  
  res.json({
    MediaContainer: {
      size: 0,
      identifier: "com.plexapp.plugins.library",
      machineIdentifier: process.env.DEVICE_UUID || 'plextv-001'
    }
  });
});

// Catch-all for other Live TV endpoints (POST)
router.post('/livetv/*', async (req, res) => {
  logger.debug('Plex Live TV catch-all POST request', { 
    path: req.path,
    body: req.body,
    query: req.query
  });
  
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  
  res.json({
    MediaContainer: {
      size: 0,
      identifier: "com.plexapp.plugins.library"
    }
  });
});

// Live TV consumer status - handles Plex live TV consumer tracking
router.get('/live/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    logger.debug('Plex live consumer status request', { sessionId });
    
    // Always report consumer as active to prevent "Failed to find consumer"
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    
    res.json({
      sessionId: sessionId,
      status: 'streaming',
      consumer: {
        id: sessionId,
        state: 'active',
        available: true
      },
      instance: {
        available: true,
        ready: true
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Live consumer status error:', error);
    res.status(200).json({ 
      status: 'active',
      consumer: { state: 'active' }
    });
  }
});

// Capital /Live/ endpoint - Plex sometimes uses capital L for Live TV consumer tracking
router.get('/Live/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userAgent = req.get('User-Agent') || '';
    
    logger.info('Plex /Live/ consumer request (capital L)', { 
      sessionId, 
      userAgent,
      headers: req.headers,
      query: req.query,
      ip: req.ip || req.connection.remoteAddress,
      url: req.originalUrl,
      path: req.path
    });

    // Update session activity in both managers
    const sessionManager = getSessionManager();
    const consumerManager = getConsumerManager();
    
    if (sessionId && sessionManager) {
      sessionManager.updateSessionActivity(sessionId);
      
      // Check if session exists
      const sessionStatus = sessionManager.getSessionStatus(sessionId);
      
      // If session doesn't exist, create a placeholder consumer session
      if (!sessionStatus.exists) {
        sessionManager.createSession('live', sessionId, '', {
          userAgent,
          isConsumerEndpoint: true,
          isLiveEndpoint: true,
          action: 'consumer'
        });
      }
    }
    
    // Create or update persistent consumer for HDHomeRun emulation
    if (sessionId && consumerManager) {
      const existingConsumer = consumerManager.getConsumer(sessionId);
      
      if (!existingConsumer) {
        // Create new persistent consumer
        consumerManager.createConsumer(sessionId, null, null, {
          userAgent,
          clientIp: req.ip || req.connection.remoteAddress,
          state: 'streaming',
          metadata: {
            endpoint: '/Live/',
            method: 'GET',
            requestPath: req.originalUrl
          }
        });
        
        logger.info('Created persistent consumer for HDHomeRun emulation', {
          sessionId,
          userAgent
        });
      } else {
        // Update activity
        consumerManager.updateActivity(sessionId);
        consumerManager.updateState(sessionId, 'streaming');
      }
    }

    // Always respond with success to prevent "Failed to find consumer" errors
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // Get persistent consumer data
    const persistentConsumer = consumerManager.getConsumer(sessionId);
    
    const consumerResponse = {
      success: true,
      sessionId: sessionId,
      consumer: {
        id: persistentConsumer?.id || sessionId,
        available: true,
        active: true,
        state: persistentConsumer?.state || 'streaming',
        lastActivity: persistentConsumer?.lastActivity || Date.now(),
        status: 'connected',
        instanceAvailable: true,
        hasConsumer: true,
        ready: true,
        // HDHomeRun-specific fields for better emulation
        persistent: true,
        createdAt: persistentConsumer?.createdAt || Date.now(),
        updatedAt: persistentConsumer?.updatedAt || Date.now()
      },
      instance: {
        available: true,
        ready: true,
        active: true
      },
      live: true,
      persistent: true,
      timestamp: new Date().toISOString()
    };
    
    res.json(consumerResponse);
  } catch (error) {
    logger.error('/Live/ consumer tracking error:', error);
    // Always succeed to prevent stream crashes
    res.status(200).json({ 
      success: true,
      consumer: { 
        available: true,
        active: true,
        state: 'streaming'
      }
    });
  }
});

// Also handle /Live/ with action parameter
router.get('/Live/:sessionId/:action', async (req, res) => {
  try {
    const { sessionId, action } = req.params;
    
    logger.info('Plex /Live/ consumer action request', { 
      sessionId, 
      action,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl
    });

    // Update session activity and consumer
    const sessionManager = getSessionManager();
    const consumerManager = getConsumerManager();
    
    if (sessionId && sessionManager) {
      sessionManager.updateSessionActivity(sessionId);
    }
    
    // Update persistent consumer with action
    if (sessionId && consumerManager) {
      consumerManager.updateActivity(sessionId);
      
      // Handle specific consumer actions
      switch (action) {
        case 'stop':
        case 'close':
          consumerManager.updateState(sessionId, 'stopped');
          break;
        case 'pause':
          consumerManager.updateState(sessionId, 'paused');
          break;
        case 'play':
        case 'resume':
          consumerManager.updateState(sessionId, 'streaming');
          break;
        default:
          consumerManager.updateState(sessionId, 'streaming');
      }
    }

    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    
    res.json({
      success: true,
      sessionId: sessionId,
      action: action,
      consumer: {
        id: sessionId,
        available: true,
        active: true,
        state: 'streaming'
      },
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('/Live/ consumer action error:', error);
    res.status(200).json({ 
      success: true,
      consumer: { available: true }
    });
  }
});

// POST handlers for /Live/ endpoints (some Plex versions use POST)
router.post('/Live/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    logger.info('Plex /Live/ POST request', {
      sessionId,
      body: req.body,
      userAgent: req.get('User-Agent')
    });
    
    // Update or create session
    const sessionManager = getSessionManager();
    const consumerManager = getConsumerManager();
    
    if (sessionId && sessionManager) {
      sessionManager.updateSessionActivity(sessionId);
      
      const sessionStatus = sessionManager.getSessionStatus(sessionId);
      if (!sessionStatus.exists) {
        sessionManager.createSession('live', sessionId, '', {
          userAgent: req.get('User-Agent'),
          isConsumerEndpoint: true,
          method: 'POST'
        });
      }
    }
    
    // Create or update persistent consumer
    if (sessionId && consumerManager) {
      const existingConsumer = consumerManager.getConsumer(sessionId);
      
      if (!existingConsumer) {
        consumerManager.createConsumer(sessionId, null, null, {
          userAgent: req.get('User-Agent'),
          clientIp: req.ip || req.connection.remoteAddress,
          state: 'streaming',
          metadata: {
            endpoint: '/Live/',
            method: 'POST',
            body: req.body
          }
        });
      } else {
        consumerManager.updateActivity(sessionId);
        consumerManager.updateState(sessionId, 'streaming');
      }
    }
    
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    
    res.json({
      success: true,
      sessionId: sessionId,
      consumer: {
        id: sessionId,
        available: true,
        active: true,
        state: 'streaming'
      }
    });
  } catch (error) {
    logger.error('/Live/ POST error:', error);
    res.status(200).json({
      success: true,
      consumer: { available: true }
    });
  }
});

// Removed duplicate endpoint - fixing the original one above

// Catch-all for any /Live/* requests not handled above
router.all('/Live/*', async (req, res) => {
  const path = req.path;
  const sessionId = path.split('/')[2]; // Extract session ID from path
  
  logger.warn('Unhandled /Live/ request', {
    method: req.method,
    path: req.path,
    sessionId,
    userAgent: req.get('User-Agent')
  });
  
  // Always return success to prevent crashes
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  
  res.json({
    success: true,
    consumer: {
      available: true,
      active: true,
      state: 'streaming'
    }
  });
});

// Transcode endpoints - handle Plex transcoding session requests
router.get('/Transcode/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    logger.info('Plex Transcode session request', {
      sessionId,
      query: req.query,
      userAgent: req.get('User-Agent')
    });
    
    // Return transcoding session info
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    
    res.json({
      sessionId: sessionId,
      status: 'running',
      progress: -1, // Live stream, no fixed progress
      duration: 86400000, // 24 hours for live
      speed: 1.0,
      throttled: false,
      complete: false,
      context: 'streaming',
      videoDecision: 'directplay',
      audioDecision: 'directplay',
      protocol: 'http',
      container: 'mpegts',
      videoCodec: 'h264',
      audioCodec: 'aac',
      transcodeHwRequested: false,
      transcodeHwFullPipeline: false
    });
  } catch (error) {
    logger.error('Transcode session error:', error);
    res.status(200).json({
      sessionId: req.params.sessionId,
      status: 'running'
    });
  }
});

// Transcode runner status endpoint
router.get('/Transcode/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    logger.debug('Transcode status check', { sessionId });
    
    res.json({
      sessionId: sessionId,
      alive: true,
      status: 'running',
      lastActivity: Date.now()
    });
  } catch (error) {
    logger.error('Transcode status error:', error);
    res.status(200).json({ alive: true });
  }
});

// Handle POST to Transcode endpoints
router.post('/Transcode/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    logger.info('Transcode POST request', {
      sessionId,
      body: req.body
    });
    
    res.json({
      success: true,
      sessionId: sessionId,
      status: 'running'
    });
  } catch (error) {
    logger.error('Transcode POST error:', error);
    res.status(200).json({ success: true });
  }
});

// Tuner status endpoint
router.get('/tuner.json', (req, res) => {
  try {
    const tunerStatus = ssdpService.generateTunerStatus();
    res.json(tunerStatus);
  } catch (error) {
    logger.error('Tuner status error:', error);
    res.status(500).json({ error: 'Tuner status failed' });
  }
});

// Channel lineup scan endpoint - Used by Plex for rescan functionality
router.post('/lineup.post', async (req, res) => {
  try {
    logger.info('Plex channel rescan triggered', { userAgent: req.get('User-Agent') });
    
    // Plex uses this endpoint to trigger a channel scan
    // We return the current lineup immediately since we're always "scanned"
    const channels = await database.all(`
      SELECT c.*, s.url, s.type 
      FROM channels c 
      LEFT JOIN streams s ON c.id = s.channel_id 
      WHERE c.enabled = 1 AND s.enabled = 1
      ORDER BY c.number
    `);

    // Get current settings to determine advertised host
    const settingsService = require('../services/settingsService');
    const config = require('../config');
    const settings = await settingsService.getSettings();
    
    // Priority order: Environment variable > Settings > Config > Host header fallback
    let baseHost = process.env.ADVERTISED_HOST ||
                  settings?.plexlive?.network?.advertisedHost ||
                  config.plexlive?.network?.advertisedHost ||
                  config.network?.advertisedHost ||
                  req.get('host') ||
                  `localhost:${config.server?.port || process.env.HTTP_PORT || process.env.PORT || 3000}`;
    
    // Ensure we have port if not included
    if (!baseHost.includes(':')) {
      const streamingPort = settings?.plexlive?.network?.streamingPort || 
                           config.plexlive?.network?.streamingPort || 
                           config.server?.port || 
                           process.env.HTTP_PORT || 
                           process.env.PORT || 
                           3000;
      baseHost += `:${streamingPort}`;
    }
    
    // Ensure we have http:// prefix
    const baseURL = baseHost.startsWith('http') ? baseHost : `http://${baseHost}`;
    
    const lineup = channels.map(channel => ({
      GuideNumber: channel.number.toString(),
      GuideName: channel.name,
      URL: `${baseURL}/stream/${channel.id}`,
      HD: 1, // Assume HD for all channels
      DRM: 0, // No DRM
      Favorite: 0,
      
      // EPG Information for this channel
      EPGAvailable: true,
      EPGSource: `${baseURL}/epg/xmltv.xml`,
      EPGURL: `${baseURL}/epg/xmltv.xml`,
      GuideURL: `${baseURL}/epg/xmltv/${channel.id}`,
      EPGChannelID: channel.epg_id || channel.id
    }));

    logger.info('Channel rescan completed', { 
      channelCount: lineup.length,
      userAgent: req.get('User-Agent')
    });

    // Return the lineup to Plex
    res.json(lineup);
  } catch (error) {
    logger.error('Channel lineup scan error:', error);
    res.status(500).json({ error: 'Channel scan failed' });
  }
});

// Auto-discovery endpoint (alternative)
router.get('/auto/:device', async (req, res) => {
  try {
    const device = req.params.device;
    
    if (device === 'hdhr') {
      const discovery = await ssdpService.generateDiscoveryResponse();
      res.json(discovery);
    } else {
      res.status(404).json({ error: 'Device not found' });
    }
  } catch (error) {
    logger.error('Auto-discovery error:', error);
    res.status(500).json({ error: 'Auto-discovery failed' });
  }
});

// Content directory service descriptor
router.get('/contentdirectory.xml', (req, res) => {
  const serviceXml = `<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <actionList>
    <action>
      <name>Browse</name>
      <argumentList>
        <argument>
          <name>ObjectID</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_ObjectID</relatedStateVariable>
        </argument>
        <argument>
          <name>BrowseFlag</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_BrowseFlag</relatedStateVariable>
        </argument>
        <argument>
          <name>Filter</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_Filter</relatedStateVariable>
        </argument>
        <argument>
          <name>StartingIndex</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_Index</relatedStateVariable>
        </argument>
        <argument>
          <name>RequestedCount</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable>
        </argument>
        <argument>
          <name>SortCriteria</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_SortCriteria</relatedStateVariable>
        </argument>
        <argument>
          <name>Result</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_Result</relatedStateVariable>
        </argument>
        <argument>
          <name>NumberReturned</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable>
        </argument>
        <argument>
          <name>TotalMatches</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable>
        </argument>
        <argument>
          <name>UpdateID</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_UpdateID</relatedStateVariable>
        </argument>
      </argumentList>
    </action>
  </actionList>
  <serviceStateTable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_ObjectID</name>
      <dataType>string</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_BrowseFlag</name>
      <dataType>string</dataType>
      <allowedValueList>
        <allowedValue>BrowseMetadata</allowedValue>
        <allowedValue>BrowseDirectChildren</allowedValue>
      </allowedValueList>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_Filter</name>
      <dataType>string</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_Index</name>
      <dataType>ui4</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_Count</name>
      <dataType>ui4</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_SortCriteria</name>
      <dataType>string</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_Result</name>
      <dataType>string</dataType>
    </stateVariable>
    <stateVariable sendEvents="yes">
      <name>A_ARG_TYPE_UpdateID</name>
      <dataType>ui4</dataType>
    </stateVariable>
  </serviceStateTable>
</scpd>`;

  res.set('Content-Type', 'application/xml');
  res.send(serviceXml);
});

// Handle content directory control requests
router.post('/contentdirectory/control', (req, res) => {
  // Basic SOAP response for content directory requests
  const soapResponse = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <Result>&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"&gt;&lt;/DIDL-Lite&gt;</Result>
      <NumberReturned>0</NumberReturned>
      <TotalMatches>0</TotalMatches>
      <UpdateID>0</UpdateID>
    </u:BrowseResponse>
  </s:Body>
</s:Envelope>`;

  res.set('Content-Type', 'text/xml');
  res.send(soapResponse);
});

// Guide endpoint - redirect to XMLTV endpoint for Plex compatibility
router.get('/guide', (req, res) => {
  try {
    const hostHeader = req.get('host') || `localhost:${config.server?.port || process.env.HTTP_PORT || process.env.PORT || 3000}`;
    res.redirect(`http://${hostHeader}/epg/xmltv.xml`);
  } catch (error) {
    logger.error('Guide redirect error:', error);
    res.status(500).json({ error: 'Guide redirect failed' });
  }
});

// Guide.xml endpoint - some Plex versions look for this
router.get('/guide.xml', (req, res) => {
  try {
    const hostHeader = req.get('host') || `localhost:${config.server?.port || process.env.HTTP_PORT || process.env.PORT || 3000}`;
    res.redirect(`http://${hostHeader}/epg/xmltv.xml`);
  } catch (error) {
    logger.error('Guide.xml redirect error:', error);
    res.status(500).json({ error: 'Guide.xml redirect failed' });
  }
});

// Status endpoint for monitoring
router.get('/status', async (req, res) => {
  try {
    const ssdpStatus = ssdpService.getStatus();
    const activeStreams = await streamManager.getActiveStreams();
    
    res.json({
      ssdp: ssdpStatus,
      streams: {
        active: activeStreams.length,
        maximum: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10,
        sessions: activeStreams
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Status endpoint error:', error);
    res.status(500).json({ error: 'Status request failed' });
  }
});

// Consumer statistics endpoint for monitoring HDHomeRun emulation
router.get('/consumers', async (req, res) => {
  try {
    const consumerManager = getConsumerManager();
    const stats = consumerManager.getStats();
    const activeConsumers = consumerManager.getActiveConsumers();
    
    res.json({
      success: true,
      statistics: stats,
      activeConsumers: activeConsumers.map(consumer => ({
        id: consumer.id,
        sessionId: consumer.sessionId,
        state: consumer.state,
        lastActivity: consumer.lastActivity,
        uptime: Date.now() - consumer.createdAt,
        userAgent: consumer.userAgent
      })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Consumer stats endpoint error:', error);
    res.status(500).json({ error: 'Failed to get consumer stats' });
  }
});

// CRITICAL: Transcode decision endpoint for Android TV compatibility
router.get('/video/:/transcode/universal/decision', async (req, res) => {
  try {
    const { path, session, mediaIndex } = req.query;
    
    logger.info('Plex transcode decision request (Android TV)', {
      path,
      session,
      mediaIndex,
      query: req.query,
      userAgent: req.get('User-Agent')
    });
    
    // Extract metadata ID from path if available
    const pathMatch = path ? path.match(/metadata\/(.+?)(?:\/|$)/) : null;
    const metadataId = pathMatch ? pathMatch[1] : 'live-tv-stream';
    
    // Return proper MediaContainer XML for transcoding decision
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    
    const transcodeDecisionXML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1" identifier="com.plexapp.plugins.library">
  <Video ratingKey="${metadataId}" key="/library/metadata/${metadataId}" type="clip" title="Live TV Stream" summary="Live television programming" duration="86400000" live="1" addedAt="${Math.floor(Date.now() / 1000)}" updatedAt="${Math.floor(Date.now() / 1000)}">
    <Media id="1" duration="86400000" bitrate="5000" width="1920" height="1080" aspectRatio="1.78" audioChannels="2" audioCodec="aac" videoCodec="h264" videoResolution="1080" container="mpegts" videoFrameRate="25p" audioProfile="lc" videoProfile="high">
      <Part id="1" key="/stream/${session || metadataId}" file="/stream/${session || metadataId}" size="999999999" duration="86400000" container="mpegts" hasThumbnail="0">
        <Stream id="1" streamType="1" default="1" codec="h264" index="0" bitrate="4000" bitDepth="8" height="1080" width="1920" displayTitle="1080p (H.264)" extendedDisplayTitle="1080p (H.264)" />
        <Stream id="2" streamType="2" selected="1" default="1" codec="aac" index="1" channels="2" bitrate="128" audioChannelLayout="stereo" samplingRate="48000" displayTitle="Stereo (AAC)" extendedDisplayTitle="Stereo (AAC)" />
      </Part>
    </Media>
  </Video>
</MediaContainer>`;

    res.send(transcodeDecisionXML);
  } catch (error) {
    logger.error('Transcode decision endpoint error:', error);
    
    // Return minimal valid MediaContainer on error
    res.set({
      'Content-Type': 'application/xml; charset=utf-8'
    });
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" />');
  }
});

module.exports = router;
