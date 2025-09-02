/**
 * Plex Request Logger
 * Comprehensive logging of all Plex requests to identify problem patterns
 */

const logger = require('../utils/logger');

/**
 * Detailed request logging middleware for debugging Plex issues
 */
function plexRequestLogger(req, res, next) {
  const userAgent = req.get('User-Agent') || '';
  const isPlexClient = userAgent.toLowerCase().includes('plex') || 
                      userAgent.toLowerCase().includes('lavf') ||
                      userAgent.toLowerCase().includes('android');

  if (isPlexClient) {
    // Log detailed request information
    const requestInfo = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      url: req.url,
      originalUrl: req.originalUrl,
      userAgent: userAgent,
      headers: {
        accept: req.get('Accept'),
        contentType: req.get('Content-Type'),
        authorization: req.get('Authorization') ? '[PRESENT]' : '[NONE]',
        xPlexToken: req.get('X-Plex-Token') ? '[PRESENT]' : '[NONE]',
        xPlexClientIdentifier: req.get('X-Plex-Client-Identifier'),
        xPlexProduct: req.get('X-Plex-Product'),
        xPlexVersion: req.get('X-Plex-Version'),
        xPlexPlatform: req.get('X-Plex-Platform'),
        xPlexDevice: req.get('X-Plex-Device'),
        xPlexContainerStart: req.get('X-Plex-Container-Start'),
        xPlexContainerSize: req.get('X-Plex-Container-Size'),
        host: req.get('Host'),
        referer: req.get('Referer'),
        connection: req.get('Connection'),
        cacheControl: req.get('Cache-Control')
      },
      query: req.query,
      params: req.params,
      body: req.method === 'POST' ? req.body : undefined,
      clientIP: req.ip || req.connection.remoteAddress
    };

    // Log the request
    logger.info('🔍 PLEX REQUEST CAPTURED', requestInfo);

    // Store original res.json and res.send to log responses
    const originalJson = res.json;
    const originalSend = res.send;
    const originalStatus = res.status;

    let responseLogged = false;
    let statusCode = 200;

    // Override res.status to capture status code
    res.status = function(code) {
      statusCode = code;
      return originalStatus.call(this, code);
    };

    // Override res.json to log JSON responses
    res.json = function(obj) {
      if (!responseLogged) {
        responseLogged = true;
        logger.info('📤 PLEX RESPONSE (JSON)', {
          path: req.path,
          statusCode: statusCode,
          contentType: res.get('Content-Type'),
          responseSize: JSON.stringify(obj).length,
          responsePreview: typeof obj === 'object' ? 
            (Array.isArray(obj) ? `Array[${obj.length}]` : `Object(${Object.keys(obj).join(', ')})`) : 
            String(obj).substring(0, 200),
          headers: {
            contentType: res.get('Content-Type'),
            cacheControl: res.get('Cache-Control'),
            connection: res.get('Connection'),
            xPlexContentType: res.get('X-Plex-Content-Type'),
            xPlexMediaType: res.get('X-Plex-Media-Type')
          }
        });
      }
      return originalJson.call(this, obj);
    };

    // Override res.send to log other responses
    res.send = function(body) {
      if (!responseLogged) {
        responseLogged = true;
        const isHTML = typeof body === 'string' && body.includes('<html');
        const isXML = typeof body === 'string' && body.includes('<?xml');
        const bodyType = isHTML ? 'HTML' : (isXML ? 'XML' : typeof body);
        
        logger.info('📤 PLEX RESPONSE (SEND)', {
          path: req.path,
          statusCode: statusCode,
          contentType: res.get('Content-Type'),
          bodyType: bodyType,
          bodySize: typeof body === 'string' ? body.length : 0,
          bodyPreview: typeof body === 'string' ? body.substring(0, 200) : String(body),
          isHTML: isHTML,
          isXML: isXML,
          headers: {
            contentType: res.get('Content-Type'),
            cacheControl: res.get('Cache-Control'),
            connection: res.get('Connection')
          }
        });

        // Alert if sending HTML to Plex (this causes MediaContainer errors)
        if (isHTML) {
          logger.error('🚨 SENDING HTML TO PLEX CLIENT - This will cause "expected MediaContainer element, found html" error', {
            path: req.path,
            userAgent: userAgent,
            statusCode: statusCode
          });
        }
      }
      return originalSend.call(this, body);
    };

    // Log when request completes
    res.on('finish', () => {
      if (!responseLogged) {
        logger.info('📤 PLEX RESPONSE (FINISH)', {
          path: req.path,
          statusCode: res.statusCode,
          contentType: res.get('Content-Type'),
          headersSent: res.headersSent
        });
      }
    });

    // Log any errors
    res.on('error', (error) => {
      logger.error('📤 PLEX RESPONSE ERROR', {
        path: req.path,
        error: error.message,
        userAgent: userAgent
      });
    });
  }

  next();
}

/**
 * Middleware to capture specific metadata requests that cause problems
 */
function plexMetadataCapture(req, res, next) {
  const userAgent = req.get('User-Agent') || '';
  const isPlexClient = userAgent.toLowerCase().includes('plex') || 
                      userAgent.toLowerCase().includes('lavf') ||
                      userAgent.toLowerCase().includes('android');

  // Look for specific problematic request patterns
  if (isPlexClient && (
    req.path.includes('/library/') ||
    req.path.includes('/metadata/') ||
    req.query['X-Plex-Container-Start'] !== undefined ||
    req.get('Accept')?.includes('xml')
  )) {
    logger.error('🎯 POTENTIAL PROBLEM REQUEST DETECTED', {
      path: req.path,
      query: req.query,
      accept: req.get('Accept'),
      userAgent: userAgent,
      pattern: 'metadata/library/container request'
    });
  }

  next();
}

module.exports = {
  plexRequestLogger,
  plexMetadataCapture
};