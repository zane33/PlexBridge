/**
 * Plex Request Logger Middleware
 * Logs all incoming requests to help diagnose Plex integration issues
 */

const logger = require('../utils/logger');

/**
 * Comprehensive request logging middleware for Plex debugging
 */
function plexRequestLogger() {
  return (req, res, next) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(2, 15);
    
    // Check if this is a Plex-related request
    const userAgent = req.get('User-Agent') || '';
    const isPlexRequest = userAgent.includes('Plex') || 
                         userAgent.includes('Lavf') || 
                         req.path.includes('/Live/') ||
                         req.path.includes('/live/') ||
                         req.path.includes('/consumer/') ||
                         req.path.includes('/livetv/') ||
                         req.path.includes('/transcode/');
    
    // Log all requests that might be from Plex
    if (isPlexRequest || req.path === '/' || !req.path.includes('.')) {
      logger.info('Incoming request', {
        requestId,
        method: req.method,
        path: req.path,
        url: req.url,
        originalUrl: req.originalUrl,
        userAgent,
        ip: req.ip || req.connection.remoteAddress,
        headers: {
          'x-plex-session-identifier': req.headers['x-plex-session-identifier'],
          'x-plex-client-identifier': req.headers['x-plex-client-identifier'],
          'x-plex-product': req.headers['x-plex-product'],
          'x-plex-version': req.headers['x-plex-version'],
          'x-plex-platform': req.headers['x-plex-platform'],
          'x-session-id': req.headers['x-session-id']
        },
        query: req.query,
        isPlexRequest
      });
    }
    
    // Track response
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;
    
    res.send = function(data) {
      res.send = originalSend;
      logResponse(data);
      return res.send(data);
    };
    
    res.json = function(data) {
      res.json = originalJson;
      logResponse(JSON.stringify(data));
      return res.json(data);
    };
    
    res.end = function(data) {
      res.end = originalEnd;
      logResponse(data);
      return res.end(data);
    };
    
    function logResponse(data) {
      const duration = Date.now() - startTime;
      
      if (isPlexRequest || res.statusCode >= 400) {
        const logData = {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          contentType: res.get('Content-Type')
        };
        
        // Log errors with more detail
        if (res.statusCode >= 400) {
          logData.responseBody = data ? data.toString().substring(0, 500) : 'empty';
          logger.error('Request failed', logData);
        } else if (duration > 5000) {
          logger.warn('Slow request', logData);
        } else {
          logger.debug('Request completed', logData);
        }
      }
    }
    
    next();
  };
}

/**
 * Middleware to handle malformed requests that cause "Error parsing HTTP request"
 */
function malformedRequestHandler() {
  return (err, req, res, next) => {
    if (err && err.status === 400) {
      const body = req.body || req.rawBody || 'unknown';
      logger.warn('Malformed request detected', {
        error: err.message,
        path: req.path,
        method: req.method,
        body: typeof body === 'string' ? body.substring(0, 100) : 'object',
        headers: req.headers
      });
      
      // Return a proper error response
      res.status(400).json({
        error: 'Bad Request',
        message: 'Malformed HTTP request'
      });
    } else {
      next(err);
    }
  };
}

module.exports = {
  plexRequestLogger,
  malformedRequestHandler
};