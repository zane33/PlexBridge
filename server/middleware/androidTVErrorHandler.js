/**
 * Android TV Error Handler Middleware
 * Provides immediate fallback responses to prevent streaming failures
 */

const logger = require('../utils/logger');
const { generateImmediateEPGResponse } = require('../utils/channelSwitchingFix');

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
    
    // Handle EPG/metadata related errors
    if (req.url.includes('/epg/now/') || req.url.includes('/lineup.json')) {
      const channelId = req.params.channelId || extractChannelIdFromUrl(req.url);
      
      if (channelId) {
        const fallbackResponse = generateImmediateEPGResponse(channelId, true);
        
        res.set({
          'X-Android-TV-Fallback': 'true',
          'X-Error-Recovery': 'metadata-fallback'
        });
        
        logger.info('Provided Android TV fallback response', { 
          channelId, 
          fallbackTitle: fallbackResponse.title 
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
      ContentType: "5",
      MediaType: "LiveTV",
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