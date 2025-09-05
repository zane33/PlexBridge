/**
 * Plex Query Parameter Handler Middleware
 * 
 * Handles invalid/unknown query parameters that Plex clients send,
 * preventing "QueryParser: Invalid field" warnings and errors.
 * 
 * This middleware recognizes known Plex parameters and gracefully handles
 * unknown ones to maintain compatibility with all Plex client versions.
 */

const logger = require('../utils/logger');

/**
 * Known Plex query parameters that should be handled gracefully
 */
const KNOWN_PLEX_PARAMETERS = [
  // Library and content parameters
  'sectionID',
  'contentDirectoryID', 
  'pinnedContentDirectoryID',
  'librarySectionID',
  'ratingKey',
  'key',
  'metadataId',
  
  // Streaming parameters
  'session',
  'offset',
  'duration',
  'directPlay',
  'directStream',
  'protocol',
  'videoCodec',
  'audioCodec',
  
  // Client identification
  'X-Plex-Client-Identifier',
  'X-Plex-Product',
  'X-Plex-Version',
  'X-Plex-Platform',
  'X-Plex-Session-Identifier',
  
  // HDHomeRun emulation parameters
  'consumer',
  'tuner',
  'channel',
  'transcode',
  'profile',
  
  // Timeline and playback parameters
  'time',
  'viewOffset',
  'state',
  'playbackTime',
  'volume',
  
  // Media parameters
  'width',
  'height',
  'bitrate',
  'audioChannels',
  'videoFrameRate',
  'subtitleStreamID',
  'audioStreamID',
  'videoStreamID'
];

/**
 * Middleware to handle Plex query parameters gracefully
 */
function plexQueryHandler() {
  return (req, res, next) => {
    try {
      const originalUrl = req.originalUrl;
      const isPlexRequest = req.get('User-Agent')?.includes('Plex') || 
                           req.path.includes('/Live/') ||
                           req.path.includes('/livetv/') ||
                           req.path.includes('/library/') ||
                           req.path.includes('/timeline/') ||
                           req.path.includes('/consumer/');
      
      if (isPlexRequest && req.query && Object.keys(req.query).length > 0) {
        // Check for unknown parameters
        const unknownParams = [];
        const knownParams = [];
        
        Object.keys(req.query).forEach(param => {
          if (KNOWN_PLEX_PARAMETERS.includes(param)) {
            knownParams.push(param);
          } else {
            unknownParams.push(param);
          }
        });
        
        if (unknownParams.length > 0) {
          logger.debug('Plex request with unknown parameters (handling gracefully)', {
            path: req.path,
            unknownParams,
            knownParams,
            userAgent: req.get('User-Agent')?.substring(0, 100),
            allParams: Object.keys(req.query)
          });
          
          // Clean unknown parameters to prevent parser warnings
          unknownParams.forEach(param => {
            delete req.query[param];
          });
        }
        
        // Log recognition of known Plex parameters
        if (knownParams.length > 0) {
          logger.debug('Recognized Plex parameters', {
            path: req.path,
            recognizedParams: knownParams,
            paramCount: knownParams.length
          });
        }
      }
      
      next();
    } catch (error) {
      logger.error('Error in Plex query handler middleware', {
        error: error.message,
        path: req.path,
        query: req.query
      });
      // Continue processing even if middleware fails
      next();
    }
  };
}

/**
 * Enhanced error handler for Plex-specific errors
 */
function plexErrorHandler() {
  return (err, req, res, next) => {
    const isPlexRequest = req.get('User-Agent')?.includes('Plex') || 
                         req.path.includes('/Live/') ||
                         req.path.includes('/library/');
    
    if (isPlexRequest) {
      logger.warn('Plex request error (providing graceful response)', {
        error: err.message,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent')?.substring(0, 100),
        status: err.status || 500
      });
      
      // For Plex library requests, return valid MediaContainer structure
      if (req.path.includes('/library/') || req.path.includes('/timeline/')) {
        return res.status(200).json({
          MediaContainer: {
            size: 0,
            identifier: "com.plexapp.plugins.library",
            message: "Resource temporarily unavailable",
            error: "graceful_handling"
          }
        });
      }
      
      // For Live TV requests, return appropriate error
      if (req.path.includes('/Live/') || req.path.includes('/livetv/')) {
        return res.status(404).json({
          error: "Consumer not found",
          message: "Live TV session not available"
        });
      }
      
      // Generic Plex-compatible error response
      return res.status(err.status || 500).json({
        error: "Plex compatibility error",
        message: "Request handled gracefully",
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    
    // Not a Plex request, continue with normal error handling
    next(err);
  };
}

/**
 * Middleware to add Plex-compatible response headers
 */
function plexResponseHeaders() {
  return (req, res, next) => {
    const isPlexRequest = req.get('User-Agent')?.includes('Plex');
    
    if (isPlexRequest) {
      // Add Plex-compatible response headers
      res.set({
        'X-Plex-Protocol': '1.0',
        'X-PlexBridge-Compatible': 'true',
        'X-Query-Handler': 'active',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Plex-Client-Identifier, X-Plex-Product, X-Plex-Version, X-Plex-Platform'
      });
    }
    
    next();
  };
}

module.exports = {
  plexQueryHandler,
  plexErrorHandler,
  plexResponseHeaders,
  KNOWN_PLEX_PARAMETERS
};