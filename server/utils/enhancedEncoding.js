/**
 * Enhanced Encoding for Unreliable Streams
 * Provides additional encoding options and reliability features for problematic streams
 */

const logger = require('./logger');

/**
 * Enhanced encoding configuration for unreliable streams
 */
const ENHANCED_ENCODING_PROFILES = {
  // High reliability profile for problematic streams like FOX Sports 505 AU
  'high-reliability': {
    name: 'High Reliability',
    description: 'Enhanced encoding for unreliable upstream sources',
    ffmpeg_options: [
      // Input optimization for unreliable streams
      '-reconnect', '1',
      '-reconnect_at_eof', '1', 
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '4',
      '-timeout', '10000000', // 10 second timeout
      '-user_agent', 'PlexBridge/1.0',
      
      // Buffer management
      '-fflags', '+genpts+igndts',
      '-avoid_negative_ts', 'make_zero',
      '-max_delay', '2000000', // 2 second max delay
      
      // Video encoding (maintain quality while improving reliability)
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-crf', '23',
      '-maxrate', '8M',
      '-bufsize', '16M',
      '-g', '50', // GOP size for seeking
      
      // Audio encoding (ensure compatibility)
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-ar', '48000',
      
      // Output format optimization for Plex
      '-f', 'mpegts',
      '-mpegts_m2ts_mode', '1',
      '-mpegts_copyts', '1',
      '-start_number', '0',
      '-hls_time', '2', // 2 second segments for faster recovery
      '-hls_list_size', '10',
      '-hls_flags', 'delete_segments+append_list'
    ],
    priority: 100,
    timeout_ms: 15000,
    retry_attempts: 3,
    enable_monitoring: true
  },
  
  // Standard reliability profile  
  'standard-reliability': {
    name: 'Standard Reliability',
    description: 'Basic enhanced encoding for mildly unreliable streams',
    ffmpeg_options: [
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-timeout', '5000000',
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-f', 'mpegts',
      '-avoid_negative_ts', 'make_zero'
    ],
    priority: 50,
    timeout_ms: 10000,
    retry_attempts: 2,
    enable_monitoring: false
  },

  // Direct copy profile (fastest, least reliable)
  'direct-copy': {
    name: 'Direct Copy',
    description: 'Direct stream copy with minimal processing',
    ffmpeg_options: [
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-f', 'mpegts'
    ],
    priority: 10,
    timeout_ms: 5000,
    retry_attempts: 1,
    enable_monitoring: false
  }
};

/**
 * Determines the best encoding profile based on stream characteristics and history
 */
function selectEncodingProfile(streamInfo, channelNumber = null) {
  // Check if this is FOX Sports 505 AU or similar problematic channels
  const problematicChannels = [505, 506, 507]; // Add more channel numbers as needed
  const problematicKeywords = ['fox sports', 'sports', 'live sport', 'espn'];
  
  const streamName = (streamInfo.name || '').toLowerCase();
  const streamUrl = (streamInfo.url || '').toLowerCase();
  
  // Check for known problematic channels
  if (channelNumber && problematicChannels.includes(channelNumber)) {
    logger.info('Using high-reliability encoding for known problematic channel', {
      channelNumber,
      streamName: streamInfo.name
    });
    return 'high-reliability';
  }
  
  // Check for sports content which tends to be more problematic
  const isSportsContent = problematicKeywords.some(keyword => 
    streamName.includes(keyword) || streamUrl.includes(keyword)
  );
  
  if (isSportsContent) {
    logger.info('Using high-reliability encoding for sports content', {
      streamName: streamInfo.name
    });
    return 'high-reliability';
  }
  
  // Check stream history/reliability if available
  if (streamInfo.reliability_score && streamInfo.reliability_score < 0.8) {
    logger.info('Using high-reliability encoding based on reliability score', {
      streamName: streamInfo.name,
      reliabilityScore: streamInfo.reliability_score
    });
    return 'high-reliability';
  }
  
  // Check for specific enhanced encoding flag
  if (streamInfo.enhanced_encoding) {
    logger.info('Using enhanced encoding per stream configuration', {
      streamName: streamInfo.name,
      profile: streamInfo.enhanced_encoding_profile || 'high-reliability'
    });
    return streamInfo.enhanced_encoding_profile || 'high-reliability';
  }
  
  // Default to standard reliability
  return 'standard-reliability';
}

/**
 * Gets FFmpeg options for the specified encoding profile
 */
function getEncodingOptions(profile) {
  const config = ENHANCED_ENCODING_PROFILES[profile];
  if (!config) {
    logger.warn('Unknown encoding profile, using standard-reliability', { profile });
    return ENHANCED_ENCODING_PROFILES['standard-reliability'];
  }
  
  return config;
}

/**
 * Adds enhanced encoding monitoring for a stream
 */
function enableStreamMonitoring(streamId, profile) {
  const config = ENHANCED_ENCODING_PROFILES[profile];
  if (!config || !config.enable_monitoring) {
    return;
  }
  
  logger.info('Enhanced encoding monitoring enabled', {
    streamId,
    profile,
    timeout: config.timeout_ms,
    retries: config.retry_attempts
  });
  
  // Implementation would include:
  // - Stream health monitoring
  // - Automatic profile switching on failures
  // - Performance metrics collection
  // - Alert generation for persistent issues
}

/**
 * Database migration to add enhanced encoding support
 */
async function addEnhancedEncodingSupport(database) {
  try {
    // Check if columns already exist
    const tableInfo = database.prepare("PRAGMA table_info(streams)").all();
    const hasEnhancedEncoding = tableInfo.some(col => col.name === 'enhanced_encoding');
    
    if (!hasEnhancedEncoding) {
      logger.info('Adding enhanced encoding support to streams table');
      
      // Add enhanced encoding columns
      database.exec(`
        ALTER TABLE streams ADD COLUMN enhanced_encoding INTEGER DEFAULT 0;
        ALTER TABLE streams ADD COLUMN enhanced_encoding_profile TEXT DEFAULT 'standard-reliability';
        ALTER TABLE streams ADD COLUMN reliability_score REAL DEFAULT 1.0;
        ALTER TABLE streams ADD COLUMN last_failure DATETIME;
        ALTER TABLE streams ADD COLUMN failure_count INTEGER DEFAULT 0;
        ALTER TABLE streams ADD COLUMN monitoring_enabled INTEGER DEFAULT 0;
      `);
      
      // Enable enhanced encoding for channel 505 (FOX Sports AU) if it exists
      const foxSportsUpdate = database.prepare(`
        UPDATE streams 
        SET enhanced_encoding = 1, 
            enhanced_encoding_profile = 'high-reliability',
            monitoring_enabled = 1
        WHERE id IN (
          SELECT s.id FROM streams s
          INNER JOIN channels c ON s.channel_id = c.id
          WHERE c.number = 505 OR c.name LIKE '%FOX Sports%'
        )
      `);
      
      const updatedRows = foxSportsUpdate.run();
      if (updatedRows.changes > 0) {
        logger.info('Enhanced encoding enabled for FOX Sports channels', {
          updatedChannels: updatedRows.changes
        });
      }
      
      logger.info('Enhanced encoding support added successfully');
    } else {
      logger.debug('Enhanced encoding support already exists');
    }
  } catch (error) {
    logger.error('Failed to add enhanced encoding support', error);
    throw error;
  }
}

/**
 * Gets stream configuration with enhanced encoding options
 */
function getStreamConfiguration(streamInfo, channelInfo = null) {
  const profile = selectEncodingProfile(streamInfo, channelInfo?.number);
  const encodingConfig = getEncodingOptions(profile);
  
  return {
    ...streamInfo,
    encoding_profile: profile,
    ffmpeg_options: encodingConfig.ffmpeg_options,
    timeout_ms: encodingConfig.timeout_ms,
    retry_attempts: encodingConfig.retry_attempts,
    monitoring_enabled: encodingConfig.enable_monitoring,
    profile_description: encodingConfig.description
  };
}

module.exports = {
  ENHANCED_ENCODING_PROFILES,
  selectEncodingProfile,
  getEncodingOptions,
  enableStreamMonitoring,
  addEnhancedEncodingSupport,
  getStreamConfiguration
};