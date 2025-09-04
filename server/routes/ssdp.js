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
      ContentType: 5,
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

    // CRITICAL: Proper headers to prevent HTML response errors
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
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
    
    logger.info('Plex consumer request', { 
      sessionId, 
      action, 
      userAgent,
      headers: {
        'x-plex-session-identifier': req.headers['x-plex-session-identifier'],
        'x-session-id': req.headers['x-session-id']
      },
      query: req.query,
      ip: req.ip || req.connection.remoteAddress
    });

    // Update session activity in the persistent session manager
    const sessionManager = getSessionManager();
    
    // Update or create session tracking
    if (sessionId) {
      sessionManager.updateSessionActivity(sessionId);
      
      // Check if session exists and is healthy
      const sessionStatus = sessionManager.getSessionStatus(sessionId);
      
      // If session doesn't exist, create a placeholder
      if (!sessionStatus.exists) {
        sessionManager.createSession('consumer', sessionId, '', {
          userAgent,
          isConsumerEndpoint: true,
          action: action || 'status'
        });
      }
    }

    // Always respond with success for consumer requests
    // This prevents "Failed to find consumer" errors that crash streams
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // Get session status for better consumer response
    const sessionStatus = sessionManager ? sessionManager.getSessionStatus(sessionId) : null;
    
    // Detect Android TV for enhanced consumer response
    const isAndroidTV = userAgent.toLowerCase().includes('androidtv') || 
                       userAgent.toLowerCase().includes('android tv') ||
                       userAgent.toLowerCase().includes('nexusplayer') ||
                       userAgent.toLowerCase().includes('mibox') ||
                       userAgent.toLowerCase().includes('shield');
    
    const consumerResponse = {
      success: true,
      sessionId: sessionId,
      status: sessionStatus?.exists ? 'active' : 'available',
      consumer: {
        id: sessionId,
        available: true,
        active: sessionStatus?.exists || false,
        state: sessionStatus?.exists ? 'streaming' : 'ready',
        lastActivity: Date.now(),
        status: 'connected',
        instanceAvailable: sessionStatus?.instanceAvailable || true,
        hasConsumer: sessionStatus?.hasConsumer || true,
        
        // Android TV specific consumer fields
        ...(isAndroidTV && {
          ready: true,
          buffering: false,
          clientType: 'AndroidTV',
          metadata_type: 'clip',
          contentType: 4,
          live: 1
        })
      },
      session: sessionStatus ? {
        exists: sessionStatus.exists,
        isRunning: sessionStatus.isRunning,
        isMapped: sessionStatus.isMapped
      } : null,
      timestamp: new Date().toISOString()
    };
    
    res.json(consumerResponse);
  } catch (error) {
    logger.error('Consumer tracking error:', error);
    // Always succeed to prevent crashes but include consumer object
    res.status(200).json({ 
      success: true,
      consumer: { available: true }
    });
  }
});

// Timeline endpoint - prevents unknown metadata item errors  
router.get('/timeline/:itemId?', async (req, res) => {
  try {
    const { itemId } = req.params;
    
    logger.debug('Plex timeline request', { 
      itemId,
      query: req.query,
      userAgent: req.get('User-Agent')
    });
    
    // Return complete timeline response with proper metadata
    res.set({
      'Content-Type': 'application/json; charset=utf-8', 
      'Cache-Control': 'no-cache'
    });
    
    // Provide a valid timeline entry to prevent completion duration errors
    const timeline = {
      MediaContainer: {
        size: 1,
        identifier: "com.plexapp.plugins.library",
        machineIdentifier: process.env.DEVICE_UUID || 'plextv-001',
        Timeline: [{
          state: "playing",
          type: "video",
          itemType: "episode", // Android TV expects episode type for live TV
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
          contentType: 4, // Type 4 is "clip" for Live TV (not episode)
          metadata_type: 'clip',
          mediaType: 'clip',
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
    
    res.json(timeline);
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
      'Cache-Control': 'no-cache'
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
    
    logger.debug('Plex Live TV session request', { 
      sessionId,
      includeBandwidths,
      offset,
      query: req.query,
      userAgent: req.get('User-Agent')
    });
    
    // CRITICAL: Return XML MediaContainer that Plex expects (not JSON)
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    
    // Update session activity to prevent consumer timeout
    const sessionManager = getSessionManager();
    if (sessionId && sessionManager) {
      sessionManager.updateSessionActivity(sessionId);
      
      const sessionStatus = sessionManager.getSessionStatus(sessionId);
      if (!sessionStatus.exists) {
        // Create session if it doesn't exist
        sessionManager.createSession('livetv', sessionId, '', {
          userAgent: req.get('User-Agent'),
          isLiveTVSession: true,
          isUniversalTranscode: true,
          keepAlive: true
        });
        logger.info('Created new LiveTV session for consumer tracking', {
          sessionId,
          userAgent: req.get('User-Agent')
        });
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

    // Update session activity in the persistent session manager
    const sessionManager = getSessionManager();
    
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

    // Always respond with success to prevent "Failed to find consumer" errors
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    const consumerResponse = {
      success: true,
      sessionId: sessionId,
      consumer: {
        id: sessionId,
        available: true,
        active: true,
        state: 'streaming',
        lastActivity: Date.now(),
        status: 'connected',
        instanceAvailable: true,
        hasConsumer: true,
        ready: true
      },
      instance: {
        available: true,
        ready: true,
        active: true
      },
      live: true,
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

    // Update session activity
    const sessionManager = getSessionManager();
    if (sessionId && sessionManager) {
      sessionManager.updateSessionActivity(sessionId);
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

module.exports = router;
