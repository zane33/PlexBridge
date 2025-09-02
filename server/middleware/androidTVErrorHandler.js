/**
 * Android TV Error Handler Middleware
 * Provides immediate fallback responses to prevent streaming failures
 */

const logger = require('../utils/logger');
const { generateImmediateEPGResponse } = require('../utils/channelSwitchingFix');
const { getSessionManager } = require('../utils/sessionPersistenceFix');

/**
 * Error handler specifically for Android TV streaming issues
 * Catches errors and provides immediate fallback responses
 */
function androidTVErrorHandler() {
  return (err, req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    const isAndroidTV = userAgent.toLowerCase().includes('android');
    
    if (!isAndroidTV) {
      return next(err);
    }
    
    logger.warn('Android TV error handler triggered', {
      error: err.message,
      url: req.url,
      method: req.method,
      userAgent: req.get('User-Agent')
    });
    
    // Check for session-related errors and attempt recovery
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    if (sessionId && (err.message.includes('Failed to find consumer') || 
                     err.message.includes('buildLiveM3U8: no instance available') ||
                     err.message.includes('This live TV session has ended'))) {
      try {
        const sessionManager = getSessionManager();
        const session = sessionManager.getSessionStatus(sessionId);
        
        if (!session.exists || !session.isRunning) {
          logger.info('Attempting session recovery for Android TV', {
            sessionId,
            error: err.message
          });
          
          // Extract channel ID from URL for recovery
          const channelId = req.params.channelId || extractChannelIdFromUrl(req.url);
          if (channelId) {
            // Try to recreate the session
            const clientInfo = {
              userAgent: req.get('User-Agent'),
              platform: 'AndroidTV',
              product: 'Plex',
              remoteAddress: req.ip
            };
            
            const recoveredSession = sessionManager.createSession(channelId, sessionId, null, clientInfo);
            
            logger.info('Session recovery initiated for Android TV', {
              sessionId,
              channelId,
              status: recoveredSession.status
            });
            
            // Add recovery headers
            res.set({
              'X-Session-Recovery': 'true',
              'X-Android-TV-Recovery': 'session-recreated'
            });
          }
        }
      } catch (recoveryError) {
        logger.error('Session recovery failed for Android TV', {
          sessionId,
          error: recoveryError.message
        });
      }
    }
    
    // Handle EPG/metadata related errors (fixes "Unable to find title" and "Unknown metadata type")
    if (req.url.includes('/epg/now/') || req.url.includes('/lineup.json')) {
      const channelId = req.params.channelId || extractChannelIdFromUrl(req.url);
      
      if (channelId) {
        const { ensureAndroidTVCompatibility } = require('../utils/androidTvCompat');
        let fallbackResponse = generateImmediateEPGResponse(channelId, true);
        
        // Ensure fallback has complete Android TV metadata
        const channelInfo = { id: channelId, name: 'Live TV', number: '0' };
        fallbackResponse = ensureAndroidTVCompatibility(fallbackResponse, channelInfo);
        
        res.set({
          'Content-Type': 'application/json; charset=utf-8',
          'X-Android-TV-Fallback': 'true',
          'X-Error-Recovery': 'metadata-fallback',
          'X-Metadata-Type': fallbackResponse.type || 'episode'
        });
        
        logger.info('Provided Android TV fallback response with enhanced metadata', { 
          channelId, 
          fallbackTitle: fallbackResponse.title,
          type: fallbackResponse.type,
          metadata_type: fallbackResponse.metadata_type
        });
        
        return res.json(fallbackResponse);
      }
    }
    
    // Handle lineup errors
    if (req.url.includes('/lineup.json')) {
      const fallbackLineup = generateFallbackLineup();
      
      res.set({
        'X-Android-TV-Fallback': 'true',
        'X-Error-Recovery': 'lineup-fallback'
      });
      
      return res.json(fallbackLineup);
    }
    
    // Continue with standard error handling for other errors
    next(err);
  };
}

/**
 * Extract channel ID from URL path
 */
function extractChannelIdFromUrl(url) {
  const matches = url.match(/\/(?:epg\/now|stream)\/([^\/\?]+)/);
  return matches ? matches[1] : null;
}

/**
 * Generate minimal fallback lineup for Android TV
 */
function generateFallbackLineup() {
  return [
    {
      GuideNumber: "1",
      GuideName: "Live TV",
      URL: "/stream/fallback",
      HD: 1,
      DRM: 0,
      Favorite: 0,
      EPGAvailable: false,
      EPGChannelID: "fallback",
      CurrentTitle: "Live Programming",
      CurrentDescription: "Live television programming",
      ContentType: "4",
      MediaType: "LiveTV",
      
      // Proper metadata types for Android TV (fixes "Unknown metadata type" errors)
      type: 'episode',
      metadata_type: 'episode',
      content_type: 4,
      mediaType: 'episode',
      contentType: 4,
      
      // Episode metadata structure
      grandparentTitle: 'Live TV',
      parentTitle: 'Live Programming',
      title: 'Live Programming',
      originalTitle: 'Live Programming',
      summary: 'Live television programming',
      
      // Episode numbering
      index: 1,
      parentIndex: 1,
      year: new Date().getFullYear(),
      
      // Live TV identifiers
      guid: `plexbridge://fallback/emergency/${Date.now()}`,
      key: '/library/metadata/fallback_emergency',
      live: 1,
      duration: 86400000,
      
      AndroidTVFallback: true
    }
  ];
}

/**
 * Middleware to add Android TV specific headers for better error handling
 */
function addAndroidTVHeaders() {
  return (req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    const isAndroidTV = userAgent.toLowerCase().includes('android');
    
    if (isAndroidTV) {
      // Add headers to help with Android TV compatibility
      res.set({
        'X-PlexBridge-AndroidTV': 'true',
        'X-Metadata-Ready': 'true',
        'X-Channel-Switch-Optimized': 'true'
      });
    }
    
    next();
  };
}

/**
 * Request timeout handler for Android TV
 * Prevents long waits that cause "Unable to find title" errors
 */
function androidTVTimeout(timeoutMs = 5000) {
  return (req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    const isAndroidTV = userAgent.toLowerCase().includes('android');
    
    if (!isAndroidTV) {
      return next();
    }
    
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Android TV request timeout, providing fallback', {
          url: req.url,
          timeout: timeoutMs
        });
        
        // Provide immediate response for EPG requests
        if (req.url.includes('/epg/now/')) {
          const channelId = req.params.channelId || extractChannelIdFromUrl(req.url);
          if (channelId) {
            const fallback = generateImmediateEPGResponse(channelId, true);
            res.set('X-Android-TV-Timeout-Fallback', 'true');
            return res.json(fallback);
          }
        }
        
        // Generic timeout response
        res.status(200).json({
          error: false,
          message: 'Response optimized for Android TV',
          fallback: true
        });
      }
    }, timeoutMs);
    
    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timeout);
    });
    
    next();
  };
}

module.exports = {
  androidTVErrorHandler,
  addAndroidTVHeaders,
  androidTVTimeout
};