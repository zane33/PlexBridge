/**
 * Enhanced Encoding for Unreliable Streams
 * Provides additional encoding options and reliability features for problematic streams
 */

const logger = require('./logger');

/**
 * Enhanced encoding configuration for unreliable streams
 */
const ENHANCED_ENCODING_PROFILES = {
  // High reliability profile for problematic streams like  Sports 505 AU with anti-loop protection
  'high-reliability': {
    name: 'High Reliability',
    description: 'Enhanced encoding for unreliable upstream sources with anti-loop protection',
    ffmpeg_options: [
      // Input optimization for unreliable streams
      '-reconnect', '1',
      '-reconnect_at_eof', '1', 
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '4',
      '-timeout', '10000000', // 10 second timeout
      '-user_agent', 'PlexBridge/1.0',
      
      // CRITICAL: Stream reliability settings
      '-seekable', '0',  // Disable seeking to prevent loop-back
      '-thread_queue_size', '1024', // Thread queue for stability
      
      // Advanced buffer management for Plex compatibility
      '-fflags', '+genpts+igndts+flush_packets',  // Generate PTS, ignore DTS, flush packets
      '-avoid_negative_ts', 'make_zero',
      '-max_delay', '5000000', // 5 second max delay for better stability
      '-rtbufsize', '2048k',    // Increased buffer for consumer session stability
      '-probesize', '5000000', // Larger probe size for better stream analysis
      '-analyzeduration', '5000000', // Longer analysis for stability
      '-err_detect', 'ignore_err', // Ignore minor errors that could crash stream
      
      // Timestamp handling for HLS loop prevention
      '-copyts',              // Copy original timestamps
      '-start_at_zero',       // Start timestamps at zero
      // Removed wallclock timestamps as it causes session sync issues
      // '-use_wallclock_as_timestamps', '1', // Causes consumer session loss
      // '-timestamp_monotonic', '1', // Not needed without wallclock
      
      // Video handling (copy to avoid encoding errors that cause crashes)
      '-c:v', 'copy',          // Copy video stream to avoid H.264 encoding issues
      
      // Audio handling (copy to avoid encoding issues)
      '-c:a', 'copy',          // Copy audio stream to avoid encoding issues
      
      // Output format optimization for Plex compatibility
      '-f', 'mpegts',
      '-mpegts_m2ts_mode', '1',
      '-mpegts_copyts', '1',
      '-mpegts_flags', '+resend_headers', // Ensure headers are sent regularly
      '-muxdelay', '0',        // No mux delay
      '-muxpreload', '0',      // No mux preload
      '-flush_packets', '1',   // Flush packets immediately
      '-max_muxing_queue_size', '2048', // Larger queue for stability
      
      // Stream reliability flags
      '-bsf:v', 'h264_mp4toannexb', // Convert to Annex B format for MPEG-TS (if H.264)
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

  // Anti-loop profile specifically for streams that loop every 10 seconds
  'anti-loop': {
    name: 'Anti-Loop Protection',
    description: 'Specialized profile for streams that loop back to start every 10-15 seconds',
    ffmpeg_options: [
      // Aggressive input handling to break loops
      '-reconnect', '0',      // DISABLE reconnect to prevent loop restart
      '-reconnect_at_eof', '0', // DISABLE EOF reconnect
      '-eof_action', 'repeat', // Repeat last frame instead of looping
      '-stream_loop', '0',    // Explicitly disable stream looping
      '-timeout', '5000000',  // 5 second timeout (shorter)
      
      // Force linear playback
      '-ss', '0',             // Start at absolute beginning
      '-copyts',              // Copy timestamps exactly
      '-start_at_zero',       // Reset timestamps to zero
      '-avoid_negative_ts', 'make_zero',
      
      // Buffer controls to prevent circular buffering  
      '-fflags', '+genpts+igndts+discardcorrupt+nobuffer+flush_packets',
      '-analyzeduration', '500000',  // Very short analysis (0.5s)
      '-probesize', '500000',        // Small probe size
      '-max_delay', '500000',        // 0.5 second max delay
      
      // Timestamp monotonic enforcement
      '-use_wallclock_as_timestamps', '1',
      '-timestamp_monotonic', '1',
      '-vstats_file', '/dev/null', // Disable video stats to prevent seeking
      
      // Simple copy to avoid re-encoding loops
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-bsf:v', 'extract_extradata', // Extract video metadata once
      
      // Output with strict packet ordering
      '-f', 'mpegts',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-flush_packets', '1',
      '-max_muxing_queue_size', '512',
      
      // Disable any HLS processing that might cause loops
      '-hls_time', '0',       // Disable HLS segmentation
      '-hls_list_size', '0'   // Disable HLS playlist
    ],
    priority: 200, // Higher priority than high-reliability
    timeout_ms: 8000, // Must be less than the 10-second loop
    retry_attempts: 1, // Single attempt to avoid restart loops
    enable_monitoring: true,
    anti_loop: true
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
  // Check for specific anti-loop needs based on channel behavior
  const loopingChannels = [505]; //  Sports 505 AU specifically exhibits looping
  const problematicChannels = [505, 506, 507]; // Add more channel numbers as needed
  const problematicKeywords = [' sports', 'sports', 'live sport', 'espn'];
  
  const streamName = (streamInfo.name || '').toLowerCase();
  const streamUrl = (streamInfo.url || '').toLowerCase();
  
  // PRIORITY 1: Check for known looping channels first
  if (channelNumber && loopingChannels.includes(channelNumber)) {
    logger.info('Using anti-loop encoding for channel with known looping behavior', {
      channelNumber,
      streamName: streamInfo.name,
      profile: 'anti-loop'
    });
    return 'anti-loop';
  }
  
  // PRIORITY 2: Check failure history for looping patterns
  if (streamInfo.failure_count > 2 && streamInfo.last_failure) {
    const timeSinceFailure = Date.now() - new Date(streamInfo.last_failure).getTime();
    // If recent failures and low reliability, might be looping
    if (timeSinceFailure < 300000 && streamInfo.reliability_score < 0.5) { // 5 minutes
      logger.info('Using anti-loop encoding based on failure pattern', {
        channelNumber,
        streamName: streamInfo.name,
        failureCount: streamInfo.failure_count,
        reliabilityScore: streamInfo.reliability_score
      });
      return 'anti-loop';
    }
  }
  
  // PRIORITY 3: Check for known problematic channels (use high-reliability)
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
      
      // Enable anti-loop encoding for channel 505 ( Sports AU) which has looping issues
      const SportsLoopUpdate = database.prepare(`
        UPDATE streams 
        SET enhanced_encoding = 1, 
            enhanced_encoding_profile = 'anti-loop',
            monitoring_enabled = 1,
            reliability_score = 0.3
        WHERE id IN (
          SELECT s.id FROM streams s
          INNER JOIN channels c ON s.channel_id = c.id
          WHERE c.number = 505
        )
      `);
      
      const loopUpdatedRows = SportsLoopUpdate.run();
      if (loopUpdatedRows.changes > 0) {
        logger.info('Anti-loop encoding enabled for  Sports 505 AU (looping channel)', {
          updatedChannels: loopUpdatedRows.changes
        });
      }
      
      // Enable high-reliability encoding for other  Sports channels
      const otherSportsUpdate = database.prepare(`
        UPDATE streams 
        SET enhanced_encoding = 1, 
            enhanced_encoding_profile = 'high-reliability',
            monitoring_enabled = 1
        WHERE id IN (
          SELECT s.id FROM streams s
          INNER JOIN channels c ON s.channel_id = c.id
          WHERE (c.number IN (506, 507) OR c.name LIKE '% Sports%') 
          AND c.number != 505
        )
      `);
      
      const otherUpdatedRows = otherSportsUpdate.run();
      if (otherUpdatedRows.changes > 0) {
        logger.info('High-reliability encoding enabled for other  Sports channels', {
          updatedChannels: otherUpdatedRows.changes
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
  // Handle null stream object (when channel is accessed directly)
  const safeStreamInfo = streamInfo || {
    name: channelInfo?.name || 'Unknown Stream',
    url: '',
    enhanced_encoding: false,
    reliability_score: 1.0,
    failure_count: 0
  };
  
  const profile = selectEncodingProfile(safeStreamInfo, channelInfo?.number);
  const encodingConfig = getEncodingOptions(profile);
  
  return {
    ...safeStreamInfo,
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