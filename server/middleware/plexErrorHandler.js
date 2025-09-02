/**
 * Plex Error Handler Middleware
 * 
 * Specifically handles critical Plex errors that cause streaming failures:
 * - "expected MediaContainer element, found html" 
 * - "No part decision to choose from"
 * - "Unknown metadata type"
 * - "Unable to find title for item of type 5"
 */

const logger = require('../utils/logger');
const { createMediaContainerResponse, createUnifiedChannelMetadata } = require('../utils/plexMetadataUnificationFix');

/**
 * Detects if the request is coming from a Plex client
 */
function isPlexClient(req) {
  const userAgent = req.get('User-Agent') || '';
  const plexIdentifiers = [
    'plex',
    'pms',
    'plexapp',
    'lavf',           // FFmpeg/libav from Plex
    'ffmpeg',         // Direct FFmpeg
    'androidtv',      // Android TV
    'com.plexapp'     // Plex app package
  ];
  
  return plexIdentifiers.some(identifier => 
    userAgent.toLowerCase().includes(identifier.toLowerCase())
  );
}

/**
 * Detects if Plex is expecting a MediaContainer XML response
 */
function expectsMediaContainer(req) {
  const accept = req.get('Accept') || '';
  const contentType = req.get('Content-Type') || '';
  
  return accept.includes('xml') || 
         contentType.includes('xml') ||
         req.path.includes('/library/') ||
         req.path.includes('/metadata/') ||
         req.query.X_PLEX_CONTAINER_START !== undefined;
}

/**
 * Error handler for Plex-specific streaming and metadata errors
 */
function plexErrorHandler(error, req, res, next) {
  // Only handle errors for Plex clients
  if (!isPlexClient(req)) {
    return next(error);
  }

  const errorMessage = error.message || error.toString();
  const isPlexMetadataError = 
    errorMessage.includes('metadata') ||
    errorMessage.includes('type 5') ||
    errorMessage.includes('part decision') ||
    errorMessage.includes('MediaContainer') ||
    res.statusCode === 500;

  if (isPlexMetadataError) {
    logger.error('Plex metadata error intercepted', {
      error: errorMessage,
      path: req.path,
      userAgent: req.get('User-Agent'),
      method: req.method,
      statusCode: res.statusCode
    });

    // If Plex expects MediaContainer XML, provide it
    if (expectsMediaContainer(req)) {
      return handleMediaContainerError(req, res);
    }

    // For streaming endpoints, provide proper JSON metadata
    if (req.path.includes('/stream/') || req.path.includes('/lineup')) {
      return handleStreamingMetadataError(req, res);
    }

    // Generic Plex error response
    return handleGenericPlexError(req, res, error);
  }

  // Not a Plex metadata error, pass to next handler
  next(error);
}

/**
 * Handles MediaContainer XML errors
 * Fixes "expected MediaContainer element, found html" errors
 */
async function handleMediaContainerError(req, res) {
  try {
    // Get channels for MediaContainer response
    const database = require('../services/database');
    const channels = await database.all(`
      SELECT c.*, s.url, s.type 
      FROM channels c 
      LEFT JOIN streams s ON c.id = s.channel_id 
      WHERE c.enabled = 1 AND s.enabled = 1
      ORDER BY c.number
      LIMIT 10
    `);

    // Get base URL for proper MediaContainer generation
    const baseHost = process.env.ADVERTISED_HOST || req.get('host') || 'localhost:3000';
    const baseURL = baseHost.startsWith('http') ? baseHost : `http://${baseHost}`;

    // Generate proper MediaContainer XML
    const mediaContainerXML = createMediaContainerResponse(channels, baseURL);

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Plex-Content-Type': 'MediaContainer',
      'X-Plex-Protocol': '1.0',
      'Cache-Control': 'no-cache'
    });

    logger.info('Generated MediaContainer XML response for Plex error recovery', {
      channelCount: channels.length,
      path: req.path,
      userAgent: req.get('User-Agent')
    });

    res.status(200).send(mediaContainerXML);
  } catch (fallbackError) {
    logger.error('Failed to generate MediaContainer fallback', fallbackError);
    
    // Minimal MediaContainer fallback
    const minimalMediaContainer = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="0" allowSync="0" identifier="com.plexapp.plugins.library" mediaTagPrefix="/system/bundle/media/flags/" mediaTagVersion="1640111100" mixedParents="0">
</MediaContainer>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(minimalMediaContainer);
  }
}

/**
 * Handles streaming metadata errors
 * Fixes "No part decision" and type errors
 */
async function handleStreamingMetadataError(req, res) {
  try {
    // Extract channel ID from path
    const channelIdMatch = req.path.match(/\/stream\/(\d+)/);
    const channelId = channelIdMatch ? channelIdMatch[1] : '1';

    // Get base URL
    const baseHost = process.env.ADVERTISED_HOST || req.get('host') || 'localhost:3000';
    const baseURL = baseHost.startsWith('http') ? baseHost : `http://${baseHost}`;

    // Create fallback channel metadata
    const fallbackChannel = {
      id: channelId,
      name: 'Live TV',
      number: channelId,
      enabled: 1
    };

    // Generate unified metadata
    const unifiedMetadata = createUnifiedChannelMetadata(fallbackChannel, baseURL);

    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Plex-Content-Type': 'episode',
      'X-Plex-Media-Type': 'episode',
      'X-Plex-Protocol': '1.0',
      'Cache-Control': 'no-cache'
    });

    logger.info('Generated unified metadata for Plex streaming error recovery', {
      channelId,
      path: req.path,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json([unifiedMetadata]);
  } catch (fallbackError) {
    logger.error('Failed to generate streaming metadata fallback', fallbackError);
    res.status(500).json({ error: 'Streaming metadata error' });
  }
}

/**
 * Handles generic Plex errors
 */
function handleGenericPlexError(req, res, error) {
  const errorResponse = {
    error: 'Plex streaming error',
    message: 'Live TV temporarily unavailable',
    type: 'episode',
    contentType: 1,
    mediaType: 'episode',
    timestamp: new Date().toISOString(),
    path: req.path,
    recovery: true
  };

  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'X-Plex-Error-Recovery': 'true',
    'X-Plex-Content-Type': 'episode'
  });

  logger.warn('Generic Plex error recovery response', {
    error: error.message,
    path: req.path,
    userAgent: req.get('User-Agent')
  });

  res.status(503).json(errorResponse);
}

/**
 * Middleware to prevent HTML responses to Plex clients
 * Ensures Plex always gets JSON or XML, never HTML
 */
function preventHTMLForPlex(req, res, next) {
  if (isPlexClient(req)) {
    // Override res.render and res.send to prevent HTML responses
    const originalSend = res.send;
    const originalRender = res.render;

    res.send = function(body) {
      if (typeof body === 'string' && body.includes('<html')) {
        logger.warn('Prevented HTML response to Plex client', {
          path: req.path,
          userAgent: req.get('User-Agent')
        });

        // Convert to JSON error response
        const errorResponse = {
          error: 'HTML response prevented',
          message: 'Plex clients require JSON or XML responses',
          type: 'episode',
          contentType: 1
        };

        res.set('Content-Type', 'application/json');
        return originalSend.call(this, JSON.stringify(errorResponse));
      }

      return originalSend.call(this, body);
    };

    res.render = function(view, options, callback) {
      logger.warn('Prevented template render for Plex client', {
        path: req.path,
        view,
        userAgent: req.get('User-Agent')
      });

      // Return JSON instead of rendered template
      const jsonResponse = {
        error: 'Template render prevented',
        message: 'Plex clients require JSON responses',
        type: 'episode',
        contentType: 1
      };

      res.set('Content-Type', 'application/json');
      return res.send(JSON.stringify(jsonResponse));
    };
  }

  next();
}

module.exports = {
  plexErrorHandler,
  preventHTMLForPlex,
  isPlexClient,
  expectsMediaContainer
};