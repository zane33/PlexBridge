const logger = require('./logger');
const database = require('../services/database');

/**
 * Robust Transcode Decision Handler for Android TV Long-Running Sessions
 * 
 * Fixes the critical issue where transcode decision endpoint returns HTML errors 
 * instead of proper XML after 30+ minutes of streaming.
 * 
 * This handler ensures:
 * 1. Always returns valid XML MediaContainer format
 * 2. Handles database failures gracefully
 * 3. Provides fallback responses for stale sessions
 * 4. Prevents HTML error responses that crash Android TV clients
 */

/**
 * XML escape utility for safe XML generation
 */
function escapeXML(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate robust transcode decision response with comprehensive error handling
 */
async function generateRobustTranscodeDecision(req, res) {
  const startTime = Date.now();
  
  // CRITICAL: Always set XML headers first - prevents HTML fallback
  res.set({
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Android-TV-Compatible': 'true',
    'X-Transcode-Decision': 'robust-handler',
    'X-Response-Format': 'xml-guaranteed'
  });

  try {
    const { 
      path, 
      session, 
      mediaIndex, 
      audioBoost = 100,
      autoAdjustQuality = 0,
      directPlay = 0,
      directStream = 1,
      quality = 'high'
    } = req.query;
    
    const userAgent = req.get('User-Agent') || '';
    const isAndroidTV = userAgent.toLowerCase().includes('androidtv') || 
                       userAgent.toLowerCase().includes('android tv') ||
                       userAgent.toLowerCase().includes('nexusplayer') ||
                       userAgent.toLowerCase().includes('mibox') ||
                       userAgent.toLowerCase().includes('shield');
    
    logger.info('Robust transcode decision request', {
      path,
      session,
      mediaIndex,
      quality,
      audioBoost,
      autoAdjustQuality,
      directPlay,
      directStream,
      isAndroidTV,
      userAgent: isAndroidTV ? userAgent.substring(0, 100) : undefined
    });
    
    // Extract metadata ID from path with robust parsing
    let metadataId = 'live-tv-stream';
    let channelId = null;
    
    if (path) {
      const pathMatch = path.match(/metadata\/(.+?)(?:\/|$)/);
      if (pathMatch) {
        metadataId = pathMatch[1];
        
        // Try to extract channel ID from various formats
        const channelMatch = metadataId.match(/live-(\d+)|channel-(\d+)|(\d+)/);
        if (channelMatch) {
          channelId = channelMatch[1] || channelMatch[2] || channelMatch[3];
        }
      }
    }
    
    // Also try to get channel ID from session parameter
    if (!channelId && session) {
      const sessionMatch = session.match(/channel-(\d+)|(\d+)/);
      if (sessionMatch) {
        channelId = sessionMatch[1] || sessionMatch[2];
      }
    }

    // Get channel/stream info with comprehensive fallback handling
    let channelInfo = null;
    let streamResolution = { width: 1920, height: 1080, bitrate: 5000 };
    let videoQuality = '1080p';
    let displayTitle = 'Live TV';
    
    // Try multiple database queries with timeout protection
    try {
      const dbPromise = Promise.race([
        // Try to find channel by various IDs
        database.get(`
          SELECT c.*, s.url, s.type 
          FROM channels c 
          LEFT JOIN streams s ON c.id = s.channel_id 
          WHERE c.id = ? OR c.number = ? OR s.id = ?
        `, [channelId, channelId, channelId]),
        // Timeout after 2 seconds to prevent hanging
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 2000)
        )
      ]);
      
      channelInfo = await dbPromise;
      
      if (channelInfo) {
        displayTitle = channelInfo.name || `Channel ${channelInfo.number}` || 'Live TV';
        logger.debug('Found channel info for robust transcode decision', { 
          channelId: channelInfo.id, 
          channelName: channelInfo.name,
          streamType: channelInfo.type
        });
      } else {
        logger.warn('No channel found for transcode decision, using fallback', { 
          channelId,
          session,
          metadataId
        });
      }
    } catch (dbError) {
      logger.warn('Database query failed for transcode decision, using fallback', { 
        error: dbError.message,
        channelId,
        session
      });
      
      // Create fallback channel info
      channelInfo = {
        id: channelId || 'fallback',
        name: `Channel ${channelId || 'Unknown'}`,
        number: channelId || 1,
        description: 'Live television programming'
      };
      displayTitle = channelInfo.name;
    }
    
    // Apply quality mapping (matching HLS quality fixes)
    switch(quality.toLowerCase()) {
      case 'high':
      case '1080p':
        streamResolution = { width: 1920, height: 1080, bitrate: 5000 };
        videoQuality = '1080p';
        break;
      case 'medium':
      case '720p':
        streamResolution = { width: 1280, height: 720, bitrate: 3000 };
        videoQuality = '720p';
        break;
      case 'low':
      case '480p':
        streamResolution = { width: 854, height: 480, bitrate: 1500 };
        videoQuality = '480p';
        break;
      default:
        // Keep default 1080p for unknown quality settings
        break;
    }
    
    // Android TV specific adjustments
    if (isAndroidTV) {
      // Android TV prefers specific codecs and containers
      var videoCodec = 'h264';
      var audioCodec = 'aac';
      var containerFormat = 'mpegts';
      var audioChannels = 2;
      
      // Ensure bitrate is reasonable for Android TV
      if (streamResolution.bitrate > 8000) {
        streamResolution.bitrate = 8000; // Cap at 8Mbps for stability
      }
    } else {
      var videoCodec = 'h264';
      var audioCodec = 'aac';
      var containerFormat = 'mpegts';
      var audioChannels = 2;
    }
    
    // Create unique stream key for session tracking
    const streamKey = session || metadataId || `fallback_${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Generate comprehensive MediaContainer XML response with Android TV compatibility
    const transcodeDecisionXML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1" identifier="com.plexapp.plugins.library" librarySectionID="1" librarySectionTitle="Live TV" machineIdentifier="plexbridge" totalSize="1">
  <Video
    ratingKey="${escapeXML(metadataId)}"
    key="/library/metadata/${escapeXML(metadataId)}"
    type="clip"
    title="${escapeXML(displayTitle)}"
    titleSort="${escapeXML(displayTitle)}"
    summary="${escapeXML(channelInfo?.description || 'Live television programming')}"
    duration="86400000"
    live="1"
    addedAt="${timestamp}"
    updatedAt="${timestamp}"
    year="${new Date().getFullYear()}"
    contentRating="TV-PG"
    index="1"
    parentIndex="1"
    librarySectionID="1"
    librarySectionTitle="Live TV"
    thumb="/thumb/${escapeXML(metadataId)}"
    art="/art/${escapeXML(metadataId)}"
    guid="tv.plex.xmltv://${escapeXML(metadataId)}"
    originallyAvailableAt="${new Date().toISOString().split('T')[0]}"
    viewCount="0"
    skipCount="0"
    lastViewedAt="0"
    audienceRating="7.5"
    audienceRatingImage="rottentomatoes://image.rating.upright"
    chapterSource="media"
    primaryExtraKey="/library/metadata/${escapeXML(metadataId)}/extras"
    ratingImage="mpaa://TV-PG"
    studio="${escapeXML(channelInfo?.name || 'PlexBridge')}"
    tagline="Live Television Programming"
    userRating="0"
    viewOffset="0"
    skipParent="0">
    <Media 
      id="1" 
      duration="86400000" 
      bitrate="${streamResolution.bitrate}" 
      width="${streamResolution.width}" 
      height="${streamResolution.height}" 
      aspectRatio="${(streamResolution.width/streamResolution.height).toFixed(2)}" 
      audioChannels="${audioChannels}" 
      audioCodec="${audioCodec}" 
      videoCodec="${videoCodec}" 
      videoResolution="${videoQuality.replace('p','')}" 
      container="${containerFormat}" 
      videoFrameRate="25p" 
      audioProfile="lc" 
      videoProfile="high" 
      optimizedForStreaming="1"
      protocol="http">
      <Part 
        id="1" 
        key="/stream/${escapeXML(channelInfo?.id || channelId || metadataId)}" 
        duration="86400000" 
        file="/stream/${escapeXML(channelInfo?.id || channelId || metadataId)}" 
        size="999999999" 
        container="${containerFormat}" 
        indexes="sd" 
        hasThumbnail="0">
        <Stream 
          id="1" 
          streamType="1" 
          codec="${videoCodec}" 
          index="0" 
          bitrate="${Math.round(streamResolution.bitrate * 0.8)}" 
          language="eng" 
          languageCode="eng" 
          height="${streamResolution.height}" 
          width="${streamResolution.width}" 
          frameRate="25.0" 
          profile="high" 
          level="40" 
          pixelFormat="yuv420p" />
        <Stream 
          id="2" 
          streamType="2" 
          codec="${audioCodec}" 
          index="1" 
          channels="${audioChannels}" 
          bitrate="128" 
          language="eng" 
          languageCode="eng" 
          samplingRate="48000" 
          profile="lc" />
      </Part>
    </Media>
  </Video>
</MediaContainer>`;

    const responseTime = Date.now() - startTime;
    
    logger.info('Robust transcode decision response generated successfully', {
      metadataId,
      streamKey,
      resolution: `${streamResolution.width}x${streamResolution.height}`,
      bitrate: streamResolution.bitrate,
      quality: videoQuality,
      videoCodec,
      audioCodec,
      containerFormat,
      isAndroidTV,
      responseTime,
      channelId: channelInfo?.id,
      channelName: channelInfo?.name,
      hasChannelInfo: !!channelInfo
    });

    // Always return 200 status with valid XML
    res.status(200).send(transcodeDecisionXML);
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error('Transcode decision endpoint error - providing robust fallback', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      userAgent: req.get('User-Agent'),
      responseTime
    });
    
    // CRITICAL: Always return valid XML even on complete failure
    // This prevents the HTML error responses that crash Android TV
    // ANDROID TV FIX: Ensure all required attributes are present to prevent NullPointerException
    const fallbackXML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1" identifier="com.plexapp.plugins.library" librarySectionID="1" librarySectionTitle="Live TV" machineIdentifier="plexbridge" totalSize="1">
  <Video
    ratingKey="fallback-live-tv"
    key="/library/metadata/fallback-live-tv"
    type="clip"
    title="Live TV"
    titleSort="Live TV"
    summary="Live television programming"
    duration="86400000"
    live="1"
    addedAt="${Math.floor(Date.now() / 1000)}"
    updatedAt="${Math.floor(Date.now() / 1000)}"
    year="${new Date().getFullYear()}"
    contentRating="TV-PG"
    index="1"
    parentIndex="1"
    librarySectionID="1"
    librarySectionTitle="Live TV"
    thumb="/thumb/fallback"
    art="/art/fallback"
    guid="tv.plex.fallback://fallback-live-tv"
    originallyAvailableAt="${new Date().toISOString().split('T')[0]}"
    viewCount="0"
    skipCount="0"
    lastViewedAt="0"
    audienceRating="7.5"
    audienceRatingImage="rottentomatoes://image.rating.upright"
    chapterSource="media"
    primaryExtraKey="/library/metadata/fallback-live-tv/extras"
    ratingImage="mpaa://TV-PG"
    studio="PlexBridge"
    tagline="Live Television Programming"
    userRating="0"
    viewOffset="0"
    skipParent="0">
    <Media 
      id="1" 
      duration="86400000" 
      bitrate="5000" 
      width="1920" 
      height="1080" 
      aspectRatio="1.78" 
      audioChannels="2" 
      audioCodec="aac" 
      videoCodec="h264" 
      videoResolution="1080" 
      container="mpegts" 
      videoFrameRate="25p" 
      audioProfile="lc" 
      videoProfile="high" 
      optimizedForStreaming="1"
      protocol="http">
      <Part 
        id="1" 
        key="/stream/fallback" 
        duration="86400000" 
        file="/stream/fallback" 
        size="999999999" 
        container="mpegts" 
        indexes="sd" 
        hasThumbnail="0">
        <Stream 
          id="1" 
          streamType="1" 
          codec="h264" 
          index="0" 
          bitrate="4000" 
          language="eng" 
          languageCode="eng" 
          height="1080" 
          width="1920" 
          frameRate="25.0" 
          profile="high" 
          level="40" 
          pixelFormat="yuv420p" />
        <Stream 
          id="2" 
          streamType="2" 
          codec="aac" 
          index="1" 
          channels="2" 
          bitrate="128" 
          language="eng" 
          languageCode="eng" 
          samplingRate="48000" 
          profile="lc" />
      </Part>
    </Media>
  </Video>
</MediaContainer>`;
    
    // ALWAYS return 200 status - never 500 which can cause HTML error pages
    res.status(200).send(fallbackXML);
  }
}

/**
 * Enhanced middleware for transcode decision handling
 */
function robustTranscodeDecisionMiddleware() {
  return async (req, res, next) => {
    try {
      // Only handle the transcode decision endpoint
      if (req.path === '/video/:/transcode/universal/decision') {
        await generateRobustTranscodeDecision(req, res);
        return; // Don't call next() - we've handled the response
      } else {
        next();
      }
    } catch (error) {
      logger.error('Robust transcode decision middleware error', {
        error: error.message,
        path: req.path
      });
      
      // Even middleware errors should return XML for transcode decision endpoint
      if (req.path === '/video/:/transcode/universal/decision') {
        res.set({
          'Content-Type': 'application/xml; charset=utf-8'
        });
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" identifier="com.plexapp.plugins.library" />');
      } else {
        next(error);
      }
    }
  };
}

module.exports = {
  generateRobustTranscodeDecision,
  robustTranscodeDecisionMiddleware,
  escapeXML
};