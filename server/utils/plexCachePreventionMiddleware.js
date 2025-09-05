/**
 * Plex Cache Prevention Middleware
 * 
 * Ensures Plex never caches metadata responses that could contain type 5 errors.
 * Forces Plex to always request fresh metadata from PlexBridge.
 */

const logger = require('./logger');

/**
 * Comprehensive anti-caching headers for Plex endpoints
 */
function plexCachePreventionMiddleware(req, res, next) {
  // Add comprehensive anti-caching headers
  res.set({
    // Prevent all forms of caching
    'Cache-Control': 'no-cache, no-store, must-revalidate, private, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Last-Modified': new Date().toUTCString(),
    'ETag': `"plexbridge-${Date.now()}-${Math.random()}"`, // Unique ETag every time
    
    // Prevent proxy caching
    'Surrogate-Control': 'no-store',
    'Vary': 'User-Agent, Accept, Accept-Encoding',
    
    // Plex-specific headers to prevent caching
    'X-Plex-Cache-Control': 'no-cache',
    'X-Plex-Content-Fresh': 'true',
    'X-PlexBridge-Validated': 'true',
    'X-Content-Type-Options': 'nosniff',
    'X-Plex-Grabber-Bypass': 'force-refresh',
    'X-Type5-Prevention': 'active',
    
    // Ensure fresh metadata responses
    'X-Metadata-Version': Date.now().toString(),
    'X-Response-Timestamp': new Date().toISOString()
  });

  // Log cache prevention for debugging
  logger.debug('Applied cache prevention headers', {
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent')?.substring(0, 100),
    timestamp: new Date().toISOString()
  });

  next();
}

/**
 * Specific cache prevention for critical Plex metadata endpoints
 */
function criticalPlexEndpointMiddleware(req, res, next) {
  // Extra aggressive caching prevention for critical endpoints
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private, max-age=0, s-maxage=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Last-Modified': new Date().toUTCString(),
    'ETag': `"critical-${Date.now()}-${Math.random()}"`,
    
    // Force reload indicators
    'X-Accel-Expires': '0',
    'X-Plex-Force-Refresh': 'true',
    'X-No-Cache': 'true',
    'X-Fresh-Content': 'true',
    
    // Metadata validation indicators
    'X-PlexBridge-Type5-Prevention': 'active',
    'X-Metadata-Validated': 'true',
    'X-Content-Type': 'live-tv-episode'
  });

  logger.info('Applied critical endpoint cache prevention', {
    path: req.path,
    method: req.method,
    isPlexClient: req.get('User-Agent')?.includes('Plex') || false,
    timestamp: new Date().toISOString()
  });

  next();
}

/**
 * Determine if request is from Plex client
 */
function isPlexClient(req) {
  const userAgent = req.get('User-Agent') || '';
  return userAgent.toLowerCase().includes('plex') || 
         userAgent.toLowerCase().includes('lavf') ||
         userAgent.toLowerCase().includes('plexrelay');
}

/**
 * Middleware that applies cache prevention only for Plex clients
 */
function plexOnlyCachePreventionMiddleware(req, res, next) {
  if (isPlexClient(req)) {
    plexCachePreventionMiddleware(req, res, next);
  } else {
    next();
  }
}

module.exports = {
  plexCachePreventionMiddleware,
  criticalPlexEndpointMiddleware,
  plexOnlyCachePreventionMiddleware,
  isPlexClient
};