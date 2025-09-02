/**
 * Enhanced Encoding for Unreliable Streams
 * Provides additional encoding options and reliability features for problematic streams
 */

const logger = require('./logger');

/**
 * Enhanced encoding configuration for unreliable streams
 */
const ENHANCED_ENCODING_PROFILES = {
  // High reliability profile for problematic streams like FOX Sports 505 AU with anti-loop protection
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
      
      // CRITICAL: HLS Anti-Loop Protection
      '-live_start_index', '-1',  // Start from live edge, not beginning
      '-hls_flags', 'discont_start+omit_endlist',  // Handle discontinuities
      '-seekable', '0',  // Disable seeking to prevent loop-back
      
      // Advanced buffer management to prevent circular buffering
      '-fflags', '+genpts+igndts+discardcorrupt+nobuffer',
      '-avoid_negative_ts', 'make_zero',
      '-max_delay', '1000000', // 1 second max delay (reduced)
      '-rtbufsize', '512k',    // Smaller RT buffer to prevent accumulation
      '-probesize', '1000000', // Smaller probe size for faster detection
      '-analyzeduration', '1000000', // Shorter analysis to prevent buffering
      
      // Timestamp handling for HLS loop prevention
      '-copyts',              // Copy original timestamps
      '-start_at_zero',       // Start timestamps at zero
      '-use_wallclock_as_timestamps', '1', // Use wall clock time
      '-timestamp_monotonic', '1', // Ensure monotonic timestamps
      
      // Video encoding (maintain quality while improving reliability)
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-crf', '23',
      '-maxrate', '8M',
      '-bufsize', '8M',        // Smaller buffer to prevent accumulation
      '-g', '30',              // Smaller GOP for better seeking (was 50)
      '-keyint_min', '15',     // More frequent keyframes
      '-force_key_frames', 'expr:gte(t,n_forced*2)', // Keyframe every 2 seconds
      
      // Audio encoding (ensure compatibility)
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-ar', '48000',
      
      // Output format optimization for Plex with loop prevention
      '-f', 'mpegts',
      '-mpegts_m2ts_mode', '1',
      '-mpegts_copyts', '1',
      '-muxdelay', '0',        // No mux delay
      '-muxpreload', '0',      // No mux preload
      '-flush_packets', '1',   // Flush packets immediately
      '-max_muxing_queue_size', '1024', // Limit queue size to prevent buildup
      
      // HLS-specific anti-loop settings (if output becomes HLS)
      '-start_number', '0',
      '-hls_time', '2',        // 2 second segments
      '-hls_list_size', '5',   // Shorter playlist (was 10)  
      '-hls_wrap', '10',       // Wrap after 10 segments to prevent infinite growth
      '-hls_delete_threshold', '5', // Delete old segments aggressively
      '-hls_flags', 'delete_segments+append_list+discont_start+round_durations'
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
      '-y', // Overwrite output
      
      // Basic input handling with reliability
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1', 
      '-reconnect_delay_max', '3',
      '-timeout', '8000000',  // 8 second timeout (less than loop time)
      '-user_agent', 'PlexBridge/1.0',
      
      // Prevent looping behavior
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+igndts+discardcorrupt',
      '-analyzeduration', '1000000',  // 1 second analysis
      '-probesize', '2000000',        // 2MB probe size
      '-max_delay', '1000000',        // 1 second max delay
      
      // Simple transcoding to break problematic streams
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '28',  // Reasonable quality
      '-g', '30',    // GOP size
      '-keyint_min', '15',
      
      // Audio copy (usually works)
      '-c:a', 'copy',
      
      // MPEG-TS output for Plex
      '-f', 'mpegts',
      '-muxdelay', '0',
      '-muxpreload', '0'
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
  const loopingChannels = [505]; // FOX Sports 505 AU specifically exhibits looping
  const problematicChannels = [505, 506, 507]; // Add more channel numbers as needed
  const problematicKeywords = ['fox sports', 'sports', 'live sport', 'espn'];
  
  const streamName = (streamInfo.name || '').toLowerCase();
  const streamUrl = (streamInfo.url || '').toLowerCase();
  
  // TEMPORARY: Disable anti-loop for channel 505 due to FFmpeg errors
  // Use high-reliability instead until anti-loop is stabilized
  if (channelNumber && loopingChannels.includes(channelNumber)) {
    logger.info('Using high-reliability encoding for problematic channel (anti-loop temporarily disabled)', {
      channelNumber,
      streamName: streamInfo.name,
      profile: 'high-reliability'
    });
    return 'high-reliability';
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
      
      // Enable high-reliability encoding for channel 505 (FOX Sports AU) - anti-loop temporarily disabled
      const foxSportsLoopUpdate = database.prepare(`
        UPDATE streams 
        SET enhanced_encoding = 1, 
            enhanced_encoding_profile = 'high-reliability',
            monitoring_enabled = 1,
            reliability_score = 0.7
        WHERE id IN (
          SELECT s.id FROM streams s
          INNER JOIN channels c ON s.channel_id = c.id
          WHERE c.number = 505
        )
      `);
      
      const loopUpdatedRows = foxSportsLoopUpdate.run();
      if (loopUpdatedRows.changes > 0) {
        logger.info('High-reliability encoding enabled for FOX Sports 505 AU (anti-loop disabled temporarily)', {
          updatedChannels: loopUpdatedRows.changes
        });
      }
      
      // Enable high-reliability encoding for other FOX Sports channels
      const otherFoxSportsUpdate = database.prepare(`
        UPDATE streams 
        SET enhanced_encoding = 1, 
            enhanced_encoding_profile = 'high-reliability',
            monitoring_enabled = 1
        WHERE id IN (
          SELECT s.id FROM streams s
          INNER JOIN channels c ON s.channel_id = c.id
          WHERE (c.number IN (506, 507) OR c.name LIKE '%FOX Sports%') 
          AND c.number != 505
        )
      `);
      
      const otherUpdatedRows = otherFoxSportsUpdate.run();
      if (otherUpdatedRows.changes > 0) {
        logger.info('High-reliability encoding enabled for other FOX Sports channels', {
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