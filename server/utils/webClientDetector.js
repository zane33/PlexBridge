/**
 * Web Client Detection Utility
 * 
 * Distinguishes between Plex web browser clients and native apps.
 * Web clients have different metadata requirements and are more sensitive to type 5 errors.
 */

const logger = require('./logger');

/**
 * Detects if request is from Plex web browser client
 * @param {Object} req - Express request object
 * @returns {boolean} - True if web client
 */
function isWebClient(req) {
  const userAgent = req.get('User-Agent') || '';
  
  // Web browsers always have Mozilla in user agent
  const isBrowser = userAgent.includes('Mozilla/');
  
  // Contains browser engine signatures
  const hasBrowserEngine = userAgent.includes('Chrome/') || 
                          userAgent.includes('Firefox/') || 
                          userAgent.includes('Safari/') ||
                          userAgent.includes('Edge/') ||
                          userAgent.includes('WebKit/');
  
  // Contains Plex web client signatures
  const isPlexWeb = userAgent.includes('Plex/') || 
                   userAgent.includes('PlexWeb/') ||
                   userAgent.includes('Plex Web/') ||
                   // Some web clients just have the version
                   (isBrowser && userAgent.match(/Plex\/\d+\./));
  
  // Additional web client indicators
  const hasWebHeaders = req.get('sec-fetch-site') || 
                       req.get('sec-fetch-mode') ||
                       req.get('sec-ch-ua');
  
  const result = isBrowser && (hasBrowserEngine || hasWebHeaders) && 
                 (isPlexWeb || req.get('origin') || req.get('referer'));
  
  if (result) {
    logger.info('WEB CLIENT DETECTED - Enhanced monitoring active', {
      path: req.path,
      method: req.method,
      userAgent: userAgent.substring(0, 150),
      hasOrigin: !!req.get('origin'),
      hasReferer: !!req.get('referer'),
      hasWebHeaders: !!hasWebHeaders,
      origin: req.get('origin') || 'none',
      referer: req.get('referer')?.substring(0, 100) || 'none'
    });
  }
  
  return result;
}

/**
 * Detects Android TV clients (different from web and mobile Android)
 * @param {Object} req - Express request object  
 * @returns {boolean} - True if Android TV
 */
function isAndroidTVClient(req) {
  const userAgent = req.get('User-Agent') || '';
  const userAgentLower = userAgent.toLowerCase();
  
  return userAgentLower.includes('android') && 
         (userAgentLower.includes('tv') || 
          userAgentLower.includes('shield') ||
          userAgentLower.includes('androidtv'));
}

/**
 * Detects native Plex clients (mobile apps, desktop apps)
 * @param {Object} req - Express request object
 * @returns {boolean} - True if native client  
 */
function isNativeClient(req) {
  const userAgent = req.get('User-Agent') || '';
  
  return (userAgent.includes('Plex') || userAgent.includes('PlexMediaPlayer')) &&
         !userAgent.includes('Mozilla/') && // Not a browser
         !isAndroidTVClient(req); // Not Android TV
}

/**
 * Get specific client type for tailored handling
 * @param {Object} req - Express request object
 * @returns {string} - Client type: 'web', 'android-tv', 'native', 'unknown'
 */
function getClientType(req) {
  if (isWebClient(req)) return 'web';
  if (isAndroidTVClient(req)) return 'android-tv'; 
  if (isNativeClient(req)) return 'native';
  return 'unknown';
}

/**
 * Get web browser type for specific handling
 * @param {Object} req - Express request object
 * @returns {string} - Browser type: 'chrome', 'firefox', 'safari', 'edge', 'unknown'
 */
function getBrowserType(req) {
  if (!isWebClient(req)) return 'not-browser';
  
  const userAgent = req.get('User-Agent') || '';
  
  if (userAgent.includes('Chrome/')) return 'chrome';
  if (userAgent.includes('Firefox/')) return 'firefox'; 
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) return 'safari';
  if (userAgent.includes('Edge/')) return 'edge';
  
  return 'unknown';
}

/**
 * Check if client requires special metadata handling
 * @param {Object} req - Express request object
 * @returns {Object} - Client requirements
 */
function getClientRequirements(req) {
  const clientType = getClientType(req);
  const browserType = getBrowserType(req);
  
  return {
    clientType,
    browserType,
    requiresEpisodeType: clientType === 'web', // Web clients need episode type
    requiresStrictValidation: clientType === 'web', // Web clients are strict about type 5
    requiresSegmentStreaming: clientType === 'android-tv', // Android TV needs segments
    requiresCORSHeaders: clientType === 'web', // Web clients need CORS
    requiresAntiCaching: clientType === 'web', // Web clients cache aggressively
    supportsDirectStreaming: clientType === 'native', // Native clients handle direct streams
    needsTranscoding: clientType === 'web' || clientType === 'android-tv' // Transcoding for compatibility
  };
}

/**
 * Log client detection for debugging
 * @param {Object} req - Express request object
 * @param {string} context - Context for logging
 */
function logClientDetection(req, context = 'unknown') {
  const clientType = getClientType(req);
  const requirements = getClientRequirements(req);
  
  logger.debug('Client detection result', {
    context,
    clientType,
    browserType: requirements.browserType,
    userAgent: req.get('User-Agent')?.substring(0, 100),
    origin: req.get('origin'),
    referer: req.get('referer')?.substring(0, 100),
    requirements: {
      requiresEpisodeType: requirements.requiresEpisodeType,
      requiresStrictValidation: requirements.requiresStrictValidation,
      needsTranscoding: requirements.needsTranscoding
    }
  });
}

module.exports = {
  isWebClient,
  isAndroidTVClient, 
  isNativeClient,
  getClientType,
  getBrowserType,
  getClientRequirements,
  logClientDetection
};