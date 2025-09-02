/**
 * Comprehensive Metadata Type Fix
 * Forces all metadata to use type 4 (episode) instead of type 5 (trailer)
 */

const logger = require('./logger');

/**
 * Middleware to force correct metadata type on ALL responses
 */
function enforceCorrectMetadataType() {
  return (req, res, next) => {
    // Intercept json responses to fix metadata types
    const originalJson = res.json;
    res.json = function(data) {
      try {
        // Fix any metadata type references in the response
        const fixedData = fixMetadataTypes(data);
        return originalJson.call(this, fixedData);
      } catch (error) {
        logger.error('Error fixing metadata types in response', error);
        return originalJson.call(this, data);
      }
    };
    
    // Add headers to ensure correct content type
    res.set({
      'X-Metadata-Type': '4',  // Episode
      'X-Content-Type': 'episode'
    });
    
    next();
  };
}

/**
 * Recursively fixes metadata types in any data structure
 */
function fixMetadataTypes(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => fixMetadataTypes(item));
  }
  
  const fixed = { ...data };
  
  // Fix all possible metadata type fields
  const typeFields = [
    'type',
    'content_type', 
    'contentType',
    'ContentType',
    'metadata_type',
    'metadataType',
    'mediaType',
    'MediaType'
  ];
  
  typeFields.forEach(field => {
    if (fixed[field] === 5 || fixed[field] === '5') {
      logger.debug('Fixed metadata type field from 5 to 4', { field, originalValue: fixed[field] });
      fixed[field] = field.includes('Type') && typeof fixed[field] === 'string' ? '4' : 4;
    }
    
    // Ensure string type fields use 'episode' 
    if (field === 'type' && typeof fixed[field] === 'string') {
      if (fixed[field] === 'trailer' || fixed[field] === 'clip') {
        fixed[field] = 'episode';
        logger.debug('Fixed string type field from trailer/clip to episode', { field });
      }
    }
  });
  
  // Fix nested objects
  Object.keys(fixed).forEach(key => {
    if (typeof fixed[key] === 'object' && fixed[key] !== null) {
      fixed[key] = fixMetadataTypes(fixed[key]);
    }
  });
  
  return fixed;
}

/**
 * Forces EPG data to have correct metadata types
 */
function fixEPGMetadataTypes(programs) {
  if (!Array.isArray(programs)) {
    return programs;
  }
  
  return programs.map(program => {
    const fixed = { ...program };
    
    // Force all EPG programs to be episode type
    fixed.type = 'episode';
    fixed.content_type = 4;
    fixed.metadata_type = 'episode';
    fixed.mediaType = 'episode';
    
    // Add episode-specific fields if missing
    if (!fixed.grandparentTitle) {
      fixed.grandparentTitle = fixed.channel_name || 'Live TV';
    }
    
    if (!fixed.parentTitle) {
      fixed.parentTitle = 'Live Programming';
    }
    
    if (!fixed.index) {
      fixed.index = 1;
    }
    
    if (!fixed.parentIndex) {
      fixed.parentIndex = 1;
    }
    
    return fixed;
  });
}

/**
 * Fix metadata types in lineup data
 */
function fixLineupMetadataTypes(lineup) {
  if (!Array.isArray(lineup)) {
    return lineup;
  }
  
  return lineup.map(channel => {
    const fixed = { ...channel };
    
    // Ensure all lineup entries use correct metadata type
    fixed.ContentType = '4'; // String for HDHomeRun compatibility
    fixed.MediaType = 'LiveTV';
    fixed.Type = 'episode';
    
    return fixed;
  });
}

/**
 * Database cleanup to remove any stored type 5 references
 */
async function cleanupDatabaseMetadataTypes(database) {
  try {
    if (!database || !database.isInitialized) {
      logger.warn('Database not available for metadata type cleanup');
      return;
    }
    
    // Check if we need to add metadata type columns first
    const tables = ['channels', 'streams', 'epg_programs'];
    
    for (const table of tables) {
      try {
        // Add metadata type column if it doesn't exist
        await database.run(`ALTER TABLE ${table} ADD COLUMN metadata_type TEXT DEFAULT 'episode'`);
        logger.info(`Added metadata_type column to ${table} table`);
      } catch (error) {
        // Column probably already exists, that's fine
      }
      
      // Update any type 5 references to type 4
      const result = await database.run(`
        UPDATE ${table} 
        SET metadata_type = 'episode' 
        WHERE metadata_type = 'trailer' 
           OR metadata_type = 'clip'
           OR metadata_type = '5'
      `);
      
      if (result.changes > 0) {
        logger.info(`Updated ${result.changes} records in ${table} to use episode metadata type`);
      }
    }
    
    logger.info('Database metadata type cleanup completed');
  } catch (error) {
    logger.error('Error during database metadata type cleanup', error);
  }
}

/**
 * Force all responses to use episode type for Live TV
 */
function createMetadataTypeMiddleware() {
  return (req, res, next) => {
    // Intercept specific endpoints that return metadata
    const metadataEndpoints = [
      '/epg/now/',
      '/epg/channels/',
      '/library/metadata/',
      '/lineup.json',
      '/discover.json'
    ];
    
    const isMetadataEndpoint = metadataEndpoints.some(endpoint => 
      req.url.includes(endpoint)
    );
    
    if (isMetadataEndpoint) {
      // Force correct headers
      res.set({
        'X-PlexBridge-Metadata-Type': '4',
        'X-PlexBridge-Content-Type': 'episode'
      });
      
      // Intercept response to fix metadata
      const originalJson = res.json;
      res.json = function(data) {
        const fixedData = fixMetadataTypes(data);
        logger.debug('Applied metadata type fix to response', {
          endpoint: req.url,
          originalType: data?.type || data?.content_type,
          fixedType: fixedData?.type || fixedData?.content_type
        });
        return originalJson.call(this, fixedData);
      };
    }
    
    next();
  };
}

module.exports = {
  enforceCorrectMetadataType,
  fixMetadataTypes,
  fixEPGMetadataTypes, 
  fixLineupMetadataTypes,
  cleanupDatabaseMetadataTypes,
  createMetadataTypeMiddleware
};