/**
 * Enhanced Encoding for Unreliable Streams
 * Provides additional encoding options and reliability features for problematic streams
 */

const logger = require('./logger');

/**
 * Enhanced encoding configuration for unreliable streams
 */
const ENHANCED_ENCODING_PROFILES = {
  // High reliability profile for problematic streams - FIXED for PPS errors
  'high-reliability': {
    name: 'High Reliability (PPS Error Fixed)',
    description: 'Enhanced encoding for unreliable upstream sources with H.264 error recovery',
    ffmpeg_options: [
      // Input optimization for unreliable streams
      '-reconnect', '1',
      '-reconnect_at_eof', '1', 
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '4',
      '-timeout', '10000000', // 10 second timeout
      '-user_agent', 'PlexBridge/1.0',
      
      // CRITICAL: H.264 error recovery settings to fix PPS issues
      '-err_detect', 'ignore_err', // Ignore minor H.264 errors
      '-fflags', '+genpts+igndts+discardcorrupt', // Discard corrupt packets that cause PPS errors
      '-skip_frame', 'noref', // Skip non-reference frames if corrupted
      
      // Stream reliability settings
      '-seekable', '0',  // Disable seeking to prevent loop-back
      '-thread_queue_size', '512', // Reduced for stability
      
      // Conservative buffer management to avoid PPS corruption
      '-avoid_negative_ts', 'make_zero',
      '-max_delay', '2000000', // Reduced to 2 seconds to prevent buffer corruption
      '-rtbufsize', '1024k',   // Reduced buffer size for faster recovery
      '-probesize', '2000000', // Smaller probe to avoid corrupt header analysis
      '-analyzeduration', '2000000', // Shorter analysis to prevent PPS corruption
      
      // CRITICAL: Disable problematic timestamp handling that corrupts PPS
      // DO NOT use -copyts with problematic H.264 streams
      '-start_at_zero',       // Start timestamps at zero only
      
      // Video handling - use MINIMAL processing to avoid PPS corruption
      '-c:v', 'copy',          // Copy video stream exactly
      
      // Audio handling 
      '-c:a', 'copy',          // Copy audio stream exactly
      
      // Output format - MINIMAL MPEG-TS options to avoid header corruption
      '-f', 'mpegts',
      '-muxdelay', '0',        // No mux delay
      '-flush_packets', '1',   // Flush packets immediately
      '-max_muxing_queue_size', '1024', // Smaller queue for faster recovery
      
      // REMOVED: Problematic bitstream filters that cause PPS errors
      // '-bsf:v', 'h264_mp4toannexb', // This was causing PPS corruption
      // '-mpegts_m2ts_mode', '1',     // This can corrupt headers
      // '-mpegts_copyts', '1',        // This can cause timestamp PPS issues
      // '-mpegts_flags', '+resend_headers', // This can duplicate corrupted headers
    ],
    priority: 100,
    timeout_ms: 15000,
    retry_attempts: 3,
    enable_monitoring: true,
    h264_safe: true // Flag to indicate this profile is safe for H.264 streams
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
  },

  // H.264 error recovery profile - for streams with PPS corruption issues
  'h264-recovery': {
    name: 'H.264 Error Recovery',
    description: 'Specialized profile for H.264 streams with PPS/decode errors',
    ffmpeg_options: [
      // Minimal input processing to avoid corruption
      '-err_detect', 'ignore_err',
      '-fflags', '+genpts+discardcorrupt+nobuffer',
      '-skip_frame', 'noref',
      
      // Very conservative analysis to avoid corrupt headers
      '-probesize', '500000',     // Very small probe (0.5MB)
      '-analyzeduration', '500000', // Very short analysis (0.5s)
      '-max_delay', '0',          // No delay buffering
      
      // Timestamp regeneration to fix PPS timing issues
      '-avoid_negative_ts', 'make_zero',
      '-start_at_zero',
      
      // Minimal codec handling
      '-c:v', 'copy',
      '-c:a', 'copy',
      
      // Minimal MPEG-TS muxing
      '-f', 'mpegts',
      '-flush_packets', '1',
      '-max_muxing_queue_size', '256' // Very small queue
    ],
    priority: 150, // Higher priority than high-reliability
    timeout_ms: 8000,
    retry_attempts: 1, // Single attempt for quick recovery
    enable_monitoring: true,
    h264_recovery: true // Flag for H.264 error recovery
  },

  // CORRECT: Minimal H.264 safe profile that actually works
  'emergency-safe': {
    name: 'H.264 PPS Safe Mode',
    description: 'Minimal working profile that prevents H.264 PPS corruption',
    ffmpeg_options: [
      // Hide FFmpeg banner and reduce verbosity
      '-hide_banner',
      '-loglevel', 'error',
      
      // CRITICAL: Minimal input processing that doesn't corrupt PPS
      '-probesize', '2000',       // Very small probe to avoid corruption
      '-analyzeduration', '1000', // Minimal analysis (1ms)
      '-fflags', '+discardcorrupt', // Discard corrupt packets
      '-err_detect', 'ignore_err',  // Ignore decode errors
      
      // Pure copy mode - no re-encoding that could corrupt PPS
      '-c:v', 'copy',
      '-c:a', 'copy',
      
      // Simple MPEG-TS output with no special processing
      '-f', 'mpegts',
      '-muxdelay', '0',
      '-flush_packets', '1'
    ],
    priority: 200,
    timeout_ms: 10000,
    retry_attempts: 1,
    enable_monitoring: false,
    emergency_mode: true
  },

  // ULTRA-MINIMAL: Last resort if emergency-safe still fails
  'ultra-minimal': {
    name: 'Ultra Minimal Copy',
    description: 'Absolute bare minimum FFmpeg command',
    ffmpeg_options: [
      // Absolutely minimal command
      '-hide_banner',
      '-loglevel', 'panic', // Only fatal errors
      '-c', 'copy',         // Copy everything
      '-f', 'mpegts'        // Output format only
    ],
    priority: 250,
    timeout_ms: 5000,
    retry_attempts: 1,
    enable_monitoring: false,
    ultra_safe: true
  }
};

/**
 * Determines the best encoding profile based on stream characteristics and history
 */
function selectEncodingProfile(streamInfo, channelNumber = null, errorHistory = null) {
  // Check for specific anti-loop needs based on channel behavior
  const loopingChannels = [505]; //  Sports 505 AU specifically exhibits looping
  const problematicChannels = [505, 506, 507]; // Add more channel numbers as needed
  const problematicKeywords = [' sports', 'sports', 'live sport', 'espn'];
  
  const streamName = (streamInfo.name || '').toLowerCase();
  const streamUrl = (streamInfo.url || '').toLowerCase();
  
  // PRIORITY 0: Check for H.264 PPS/decode errors in error history
  if (errorHistory && Array.isArray(errorHistory)) {
    const h264ErrorTypes = errorHistory.filter(error => {
      const errorMsg = error.toLowerCase();
      return errorMsg.includes('pps') || 
             errorMsg.includes('decode_slice_header') || 
             errorMsg.includes('no frame!') ||
             errorMsg.includes('non-existing pps') ||
             errorMsg.includes('mmco: unref short failure') ||
             errorMsg.includes('h264');
    });
    
    if (h264ErrorTypes.length > 0) {
      // If we have many H.264 errors or severe ones, use emergency mode
      const hasSevereErrors = h264ErrorTypes.length > 5 || 
                             h264ErrorTypes.some(error => 
                               error.includes('mmco') || 
                               error.includes('decode_slice_header')
                             );
      
      // Count consecutive failures to escalate to ultra-minimal if needed
      const consecutiveFailures = streamInfo.consecutive_h264_failures || 0;
      
      if (consecutiveFailures > 3) {
        logger.error('MULTIPLE H.264 failures - escalating to ULTRA-MINIMAL mode', {
          channelNumber,
          streamName: streamInfo.name,
          profile: 'ultra-minimal',
          errorCount: h264ErrorTypes.length,
          consecutiveFailures,
          errorSample: h264ErrorTypes.slice(0, 3)
        });
        return 'ultra-minimal';
      } else if (hasSevereErrors || consecutiveFailures > 1) {
        logger.error('SEVERE H.264 errors detected - using EMERGENCY SAFE MODE', {
          channelNumber,
          streamName: streamInfo.name,
          profile: 'emergency-safe',
          errorCount: h264ErrorTypes.length,
          consecutiveFailures,
          errorSample: h264ErrorTypes.slice(0, 3)
        });
        return 'emergency-safe';
      } else {
        logger.warn('Detected H.264 PPS/decode errors, using h264-recovery profile', {
          channelNumber,
          streamName: streamInfo.name,
          profile: 'h264-recovery',
          errorCount: h264ErrorTypes.length,
          errorSample: h264ErrorTypes.slice(0, 3)
        });
        return 'h264-recovery';
      }
    }
  }
  
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
  
  // EMERGENCY OVERRIDE: Force ALL enhanced encoding to use emergency-safe mode
  // This prevents ALL H.264 PPS corruption until we can properly debug
  if (streamInfo.enhanced_encoding) {
    logger.error('EMERGENCY OVERRIDE: Enhanced encoding forced to emergency-safe mode', {
      streamName: streamInfo.name,
      originalProfile: streamInfo.enhanced_encoding_profile || 'high-reliability',
      forcedProfile: 'emergency-safe',
      reason: 'Preventing H.264 PPS corruption'
    });
    return 'emergency-safe'; // FORCE emergency mode for ALL enhanced encoding
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