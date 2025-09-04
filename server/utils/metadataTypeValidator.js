/**
 * Metadata Type Validator - Prevents Type 5 Errors
 * 
 * This module ensures all metadata sent to Plex uses correct types:
 * - Live TV content MUST use contentType: 4 (episode) NOT type 5 (trailer)
 * - Video type MUST be "episode" or "clip" for Live TV
 * - Never allow type: 5 or contentType: 5 to reach Plex
 */

const logger = require('./logger');

// Valid content types for Live TV
const VALID_LIVE_TV_CONTENT_TYPES = {
  4: 'episode',  // Primary type for Live TV
  // Type 5 (trailer) is FORBIDDEN for Live TV
};

// Valid video types for Live TV  
const VALID_LIVE_TV_VIDEO_TYPES = ['episode', 'clip'];

/**
 * Validates and corrects metadata before sending to Plex
 * @param {Object} metadata - Metadata object to validate
 * @param {string} context - Context for logging (e.g., 'lineup', 'metadata', 'timeline')
 * @returns {Object} - Corrected metadata
 */
function validateAndCorrectMetadata(metadata, context = 'unknown') {
  if (!metadata || typeof metadata !== 'object') {
    return metadata;
  }

  let correctionsMade = 0;

  // Deep validation for nested structures
  if (Array.isArray(metadata)) {
    return metadata.map(item => validateAndCorrectMetadata(item, context));
  }

  // Create a copy to avoid mutating original
  const corrected = { ...metadata };

  // CRITICAL: Fix contentType field (most common issue)
  if (corrected.contentType === 5) {
    logger.warn('CORRECTING TYPE 5 ERROR: Found contentType: 5, changing to 4 (episode)', {
      context,
      original: corrected.contentType,
      corrected: 4
    });
    corrected.contentType = 4;
    correctionsMade++;
  }

  // CRITICAL: Fix content_type field  
  if (corrected.content_type === 5) {
    logger.warn('CORRECTING TYPE 5 ERROR: Found content_type: 5, changing to 4 (episode)', {
      context,
      original: corrected.content_type,
      corrected: 4
    });
    corrected.content_type = 4;
    correctionsMade++;
  }

  // CRITICAL: Fix type field if it's numeric 5
  if (corrected.type === 5 || corrected.type === '5') {
    logger.warn('CORRECTING TYPE 5 ERROR: Found type: 5, changing to "episode"', {
      context,
      original: corrected.type,
      corrected: 'episode'
    });
    corrected.type = 'episode';
    correctionsMade++;
  }

  // Fix mediaType if invalid
  if (corrected.mediaType === '5' || corrected.mediaType === 'trailer') {
    logger.warn('CORRECTING MEDIA TYPE ERROR: Found invalid mediaType, changing to "episode"', {
      context,
      original: corrected.mediaType,
      corrected: 'episode'
    });
    corrected.mediaType = 'episode';
    correctionsMade++;
  }

  // Validate and fix Video objects (nested metadata)
  if (corrected.Video && Array.isArray(corrected.Video)) {
    corrected.Video = corrected.Video.map(video => {
      const correctedVideo = { ...video };
      
      if (correctedVideo.type === 5 || correctedVideo.type === '5') {
        logger.warn('CORRECTING VIDEO TYPE 5 ERROR: Found Video.type: 5, changing to "episode"', {
          context: `${context}/Video`,
          original: correctedVideo.type,
          corrected: 'episode'
        });
        correctedVideo.type = 'episode';
        correctionsMade++;
      }

      // Validate Media objects within Video
      if (correctedVideo.Media && Array.isArray(correctedVideo.Media)) {
        correctedVideo.Media = correctedVideo.Media.map(media => {
          const correctedMedia = { ...media };
          
          if (correctedMedia.type === 5 || correctedMedia.type === '5') {
            logger.warn('CORRECTING MEDIA TYPE 5 ERROR: Found Media.type: 5, changing to "episode"', {
              context: `${context}/Video/Media`,
              original: correctedMedia.type,
              corrected: 'episode'
            });
            correctedMedia.type = 'episode';
            correctionsMade++;
          }

          return correctedMedia;
        });
      }

      return correctedVideo;
    });
  }

  // Validate and fix MediaContainer objects  
  if (corrected.MediaContainer) {
    corrected.MediaContainer = validateAndCorrectMetadata(corrected.MediaContainer, `${context}/MediaContainer`);
  }

  // Validate and fix any other nested objects
  Object.keys(corrected).forEach(key => {
    if (typeof corrected[key] === 'object' && corrected[key] !== null && !Array.isArray(corrected[key])) {
      corrected[key] = validateAndCorrectMetadata(corrected[key], `${context}/${key}`);
    }
  });

  if (correctionsMade > 0) {
    logger.info('Metadata validation completed with corrections', {
      context,
      correctionsMade,
      originalKeys: Object.keys(metadata),
      correctedKeys: Object.keys(corrected)
    });
  }

  return corrected;
}

/**
 * Web client specific validation - more strict than general validation
 */
function validateForWebClient(metadata, req) {
  const { isWebClient, getClientType } = require('./webClientDetector');
  
  if (!isWebClient(req)) return metadata;
  
  const webSafeMetadata = { ...metadata };
  let correctionsMade = 0;
  
  // Web clients are EXTREMELY sensitive to type 5 errors
  if (webSafeMetadata.type === 5 || webSafeMetadata.type === '5') {
    logger.error('CRITICAL WEB CLIENT TYPE 5 ERROR PREVENTED', {
      originalType: webSafeMetadata.type,
      userAgent: req.get('User-Agent')?.substring(0, 100),
      path: req.path
    });
    
    webSafeMetadata.type = 'episode';
    correctionsMade++;
  }
  
  if (webSafeMetadata.contentType === 5 || webSafeMetadata.contentType === '5') {
    logger.error('CRITICAL WEB CLIENT CONTENTTYPE 5 ERROR PREVENTED', {
      originalContentType: webSafeMetadata.contentType,
      userAgent: req.get('User-Agent')?.substring(0, 100),
      path: req.path
    });
    
    webSafeMetadata.contentType = 4;
    correctionsMade++;
  }
  
  // Web clients need specific metadata fields
  if (correctionsMade > 0 || !webSafeMetadata.itemType) {
    webSafeMetadata.itemType = 'episode';  // Critical for web clients
    webSafeMetadata.metadata_type = 'episode';
    webSafeMetadata.mediaType = 'episode';
    webSafeMetadata.content_type = 4;
    
    // Web-specific fields that prevent crashes
    webSafeMetadata._webClientOptimized = true;
    webSafeMetadata._preventType5 = true;
  }
  
  // Recursively fix nested objects for web clients
  if (webSafeMetadata.MediaContainer) {
    webSafeMetadata.MediaContainer = validateForWebClient(webSafeMetadata.MediaContainer, req);
  }
  
  if (webSafeMetadata.Video && Array.isArray(webSafeMetadata.Video)) {
    webSafeMetadata.Video = webSafeMetadata.Video.map(video => validateForWebClient(video, req));
  }
  
  if (webSafeMetadata.Timeline && Array.isArray(webSafeMetadata.Timeline)) {
    webSafeMetadata.Timeline = webSafeMetadata.Timeline.map(timeline => validateForWebClient(timeline, req));
  }
  
  if (correctionsMade > 0) {
    logger.info('Web client metadata corrections applied', {
      path: req.path,
      corrections: correctionsMade,
      userAgent: req.get('User-Agent')?.substring(0, 100)
    });
  }
  
  return webSafeMetadata;
}

/**
 * Express middleware to validate metadata responses with client-specific handling
 */
function metadataValidationMiddleware(req, res, next) {
  const { getClientType } = require('./webClientDetector');
  
  // Store original json method
  const originalJson = res.json;

  // Override res.json to validate metadata before sending
  res.json = function(data) {
    try {
      const context = `${req.method} ${req.path}`;
      const clientType = getClientType(req);
      
      // Apply general validation first
      let validatedData = validateAndCorrectMetadata(data, context);
      
      // Apply client-specific validation
      if (clientType === 'web') {
        validatedData = validateForWebClient(validatedData, req);
        
        // Add web client specific headers
        res.set({
          'X-Web-Client-Optimized': 'true',
          'X-Content-Type': 'live-tv-episode',
          'X-Metadata-Type': '4',
          'X-PlexBridge-Web-Safe': 'true'
        });
      }
      
      // Call original json method with validated data
      return originalJson.call(this, validatedData);
    } catch (error) {
      logger.error('Metadata validation middleware error', {
        path: req.path,
        method: req.method,
        error: error.message
      });
      // Fallback to original data if validation fails
      return originalJson.call(this, data);
    }
  };

  next();
}

/**
 * Validates specific endpoint responses commonly accessed by Plex
 */
function validatePlexEndpointResponse(data, endpoint) {
  const context = `plex-endpoint-${endpoint}`;
  return validateAndCorrectMetadata(data, context);
}

/**
 * Creates standardized Live TV metadata structure
 */
function createLiveTVMetadata(channel, options = {}) {
  const now = new Date();
  
  return {
    // CRITICAL: Use correct Live TV types
    type: 'episode', // NEVER 'trailer' or type 5
    contentType: 4,  // NEVER 5 (trailer)
    content_type: 4, // Alternative field name
    mediaType: 'episode', // NEVER 'trailer'
    
    // Required Live TV fields
    ratingKey: options.ratingKey || channel.id,
    key: options.key || `/library/metadata/${channel.id}`,
    guid: options.guid || `tv.plexbridge://channel/${channel.id}`,
    title: options.title || channel.name || 'Live TV',
    summary: options.summary || `Live TV channel: ${channel.name}`,
    
    // Episode structure for Live TV
    grandparentTitle: channel.name || 'Live TV',
    parentTitle: `Live TV - ${now.getFullYear()}`,
    index: 1,
    parentIndex: 1,
    year: now.getFullYear(),
    
    // Duration and timing
    duration: 86400000, // 24 hours in milliseconds
    addedAt: Math.floor(now.getTime() / 1000),
    updatedAt: Math.floor(now.getTime() / 1000),
    
    // Live TV specific
    live: 1,
    
    // Additional validation fields
    _plexbridge_validated: true,
    _validation_timestamp: now.toISOString()
  };
}

module.exports = {
  validateAndCorrectMetadata,
  metadataValidationMiddleware,
  validatePlexEndpointResponse,
  createLiveTVMetadata,
  VALID_LIVE_TV_CONTENT_TYPES,
  VALID_LIVE_TV_VIDEO_TYPES
};