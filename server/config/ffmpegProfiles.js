/**
 * FFmpeg Profiles for PlexBridge
 * Optimized configurations for different streaming scenarios
 * 
 * RESILIENCE PROFILES FOR H.264 CORRUPTION HANDLING:
 * - h264CorruptionResilient: Maximum error tolerance for PPS/SPS corruption
 * - streamContinuity: Prioritizes uninterrupted streaming over quality
 * 
 * ERROR HANDLING CAPABILITIES:
 * - Handles "non-existing PPS 0 referenced" errors
 * - Manages "decode_slice_header error" situations
 * - Tolerates upstream bitstream corruption
 * - Maintains stream continuity during quality degradation
 */

module.exports = {
  // High Quality Copy - No re-encoding, preserves original quality
  highQualityCopy: {
    name: 'High Quality Copy',
    description: 'Direct copy of video and audio, no quality loss, with AES-128 encryption support',
    args: [
      '-hide_banner',
      '-loglevel', 'error',
      '-allowed_extensions', 'ALL',
      '-protocol_whitelist', 'file,http,https,tcp,tls,pipe,crypto',
      '-user_agent', 'VLC/3.0.20 LibVLC/3.0.20',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', '[URL]',
      '-c:v', 'copy',           // Copy video codec
      '-c:a', 'copy',           // Copy audio codec
      '-map', '0:v:0',          // Select best video stream
      '-map', '0:a:0',          // Select best audio stream
      '-bsf:v', 'h264_mp4toannexb',
      '-f', 'mpegts',
      '-mpegts_copyts', '1',
      '-avoid_negative_ts', 'disabled',
      '-max_delay', '5000000',
      '-max_muxing_queue_size', '9999',
      '-flush_packets', '0',
      'pipe:1'
    ]
  },

  // Android TV Optimized - Segmented output for stability
  androidTVOptimized: {
    name: 'Android TV Optimized',
    description: 'Optimized for Android TV with segment boundaries',
    args: [
      '-hide_banner',
      '-loglevel', 'error',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-analyzeduration', '10000000',
      '-probesize', '10000000',
      '-i', '[URL]',
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-map', '0:v:0',          // Select best video stream
      '-map', '0:a:0',          // Select best audio stream
      '-bsf:v', 'h264_mp4toannexb',
      '-f', 'segment',
      '-segment_time', '10',     // 10 second segments for stability
      '-segment_format', 'mpegts',
      '-segment_list_type', 'flat',
      '-segment_list', '/dev/null',
      '-reset_timestamps', '1',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+igndts+discardcorrupt',
      '-flags', '+global_header+low_delay',
      '-max_delay', '500000',
      '-max_muxing_queue_size', '4096',
      '-f', 'mpegts',
      'pipe:1'
    ]
  },

  // HLS High Quality - For HLS streams, preserves quality
  hlsHighQuality: {
    name: 'HLS High Quality',
    description: 'Optimized for HLS streams with quality preservation and AES-128 encryption support',
    args: [
      '-hide_banner',
      '-loglevel', 'error',
      '-allowed_extensions', 'ALL',
      '-protocol_whitelist', 'file,http,https,tcp,tls,pipe,crypto',
      '-user_agent', 'VLC/3.0.20 LibVLC/3.0.20',
      '-max_reload', '1000',
      '-m3u8_hold_counters', '10',
      '-live_start_index', '-1',
      '-analyzeduration', '20000000',
      '-probesize', '20000000',
      '-i', '[URL]',
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-map', '0:v:0',          // Select best video stream
      '-map', '0:a:0',          // Select best audio stream
      '-bsf:v', 'h264_mp4toannexb',
      '-f', 'mpegts',
      '-mpegts_copyts', '1',
      '-avoid_negative_ts', 'disabled',
      '-max_delay', '5000000',
      '-flush_packets', '0',
      'pipe:1'
    ]
  },

  // Optimized M3U8/HLS Profile - Conservative approach based on working config
  m3u8Optimized: {
    name: 'M3U8 Optimized',
    description: 'Conservative optimization for m3u8 streams with larger buffers',
    args: [
      '-hide_banner',
      '-loglevel', 'error',
      
      // Standard HLS support
      '-allowed_extensions', 'ALL',
      '-protocol_whitelist', 'file,http,https,tcp,tls,pipe,crypto',
      '-user_agent', 'VLC/3.0.20 LibVLC/3.0.20',
      
      // Standard network resilience (based on working config)
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      
      // Larger buffer for stability (key improvement)
      '-rtbufsize', '5M',                 // 5MB read buffer (increased from default)
      
      '-i', '[URL]',
      
      // Standard stream copying
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-bsf:v', 'h264_mp4toannexb',
      
      // Standard MPEG-TS output (based on working config)
      '-f', 'mpegts',
      '-mpegts_copyts', '1',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+igndts+discardcorrupt',
      '-copyts',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-flush_packets', '1',
      '-max_delay', '0',
      '-max_muxing_queue_size', '9999',
      
      'pipe:1'
    ]
  },

  // HTTP Stream Optimized - Conservative with larger buffers
  httpStreamOptimized: {
    name: 'HTTP Stream Optimized',
    description: 'Conservative optimization for HTTP streams with larger buffers',
    args: [
      '-hide_banner',
      '-loglevel', 'error',
      
      // Standard network resilience
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      
      // Larger buffer for HTTP streams (key improvement)
      '-rtbufsize', '10M',                // 10MB read buffer (increased)
      
      '-i', '[URL]',
      
      // Standard stream copying
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-bsf:v', 'h264_mp4toannexb',
      
      // Standard MPEG-TS output (based on working config)
      '-f', 'mpegts',
      '-mpegts_copyts', '1',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+igndts+discardcorrupt',
      '-copyts',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-flush_packets', '1',
      '-max_delay', '0',
      '-max_muxing_queue_size', '9999',
      
      'pipe:1'
    ]
  },

  // Transcoding High Quality - When transcoding is needed
  transcodingHighQuality: {
    name: 'Transcoding High Quality',
    description: 'High quality transcoding when re-encoding is required',
    args: [
      '-hide_banner',
      '-loglevel', 'error',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', '[URL]',
      '-c:v', 'libx264',
      '-preset', 'superfast',
      '-crf', '18',             // High quality (lower = better, 18 is visually lossless)
      '-maxrate', '20M',        // Max 20 Mbps
      '-bufsize', '40M',        // Buffer size
      '-profile:v', 'high',     // High profile for better quality
      '-level', '4.2',          // Level 4.2 supports up to 1080p60
      '-c:a', 'aac',
      '-b:a', '320k',           // High quality audio
      '-ar', '48000',           // 48kHz sample rate
      '-ac', '2',               // Stereo
      '-map', '0:v:0',          // Select best video stream
      '-map', '0:a:0',          // Select best audio stream
      '-f', 'mpegts',
      '-mpegts_copyts', '1',
      '-max_delay', '5000000',
      '-max_muxing_queue_size', '9999',
      'pipe:1'
    ]
  },

  // Adaptive Quality - Automatically adjusts based on source
  adaptiveQuality: {
    name: 'Adaptive Quality',
    description: 'Automatically adapts to source quality',
    getArgs: function(sourceInfo) {
      // If source is already high quality, use copy
      if (sourceInfo && sourceInfo.videoCodec === 'h264' && sourceInfo.bitrate > 5000000) {
        return this.highQualityCopy.args;
      }
      // If source needs transcoding, use high quality transcoding
      return this.transcodingHighQuality.args;
    }
  },

  // H.264 Corruption Resilient - Maximum error tolerance for corrupted streams
  h264CorruptionResilient: {
    name: 'H.264 Corruption Resilient',
    description: 'Maximum error tolerance for streams with H.264 corruption (PPS/SPS errors)',
    args: [
      '-hide_banner',
      '-loglevel', 'error',
      
      // AGGRESSIVE RECONNECTION FOR UPSTREAM ISSUES
      '-reconnect', '1',
      '-reconnect_at_eof', '1', 
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '15',      // Allow longer reconnect delays
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',
      
      // MAXIMUM ERROR TOLERANCE FOR H.264 CORRUPTION
      '-err_detect', 'ignore_err',       // Ignore all decoder errors
      '-fflags', '+genpts+igndts+discardcorrupt+nobuffer', // Discard corrupt packets
      '-skip_frame', 'noref',            // Skip non-reference frames if corrupted
      '-thread_type', 'slice',           // Use slice-based threading for better error isolation
      '-threads', '1',                   // Single thread to avoid race conditions
      
      // LENIENT STREAM ANALYSIS TO AVOID EARLY TERMINATION
      '-analyzeduration', '1000000',     // 1 second analysis (reduced from default)
      '-probesize', '2000000',           // 2MB probe size (reasonable but not excessive)
      '-max_analyze_duration', '2000000', // Max 2 seconds for analysis
      
      // INPUT BUFFERING FOR UPSTREAM INSTABILITY  
      '-rtbufsize', '2M',                // 2MB read buffer
      
      // DECODER ERROR RECOVERY
      '-ec', '2',                        // Error concealment: favor speed over accuracy
      '-strict', '-2',                   // Allow experimental/non-standard features
      
      '-i', '[URL]',
      
      // COPY CODECS TO AVOID RE-ENCODING CORRUPTION
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-map', '0:v:0?',                  // Best video stream, optional
      '-map', '0:a:0?',                  // Best audio stream, optional
      
      // H.264 BITSTREAM FILTERING FOR ANDROID TV COMPATIBILITY
      '-bsf:v', 'h264_mp4toannexb,extract_extradata', // Extract and convert parameter sets
      
      // MPEG-TS OUTPUT WITH ERROR TOLERANCE
      '-f', 'mpegts',
      '-mpegts_copyts', '1',
      '-avoid_negative_ts', 'make_zero',
      '-max_delay', '10000000',          // 10 second max delay tolerance
      '-max_muxing_queue_size', '9999',  // Large mux queue
      '-flush_packets', '1',
      '-muxdelay', '0',
      '-muxpreload', '0',
      
      // CONTINUOUS OUTPUT DESPITE ERRORS
      '-copyts',                         // Copy timestamps exactly
      '-start_at_zero',                  // Start timestamps at zero
      '-flags', '+global_header+low_delay+bitexact',
      
      'pipe:1'
    ]
  },

  // Stream Continuity Mode - Prioritizes uninterrupted output over quality
  streamContinuity: {
    name: 'Stream Continuity Mode', 
    description: 'Prioritizes continuous streaming over quality, maximum upstream fault tolerance',
    args: [
      '-hide_banner',
      '-loglevel', 'fatal',              // Only fatal errors (reduces log noise)
      
      // MAXIMUM RECONNECTION TOLERANCE
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1', 
      '-reconnect_delay_max', '30',      // Up to 30 second reconnect delays
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',
      
      // IGNORE ALL NON-FATAL ERRORS
      '-err_detect', 'ignore_err',
      '-fflags', '+genpts+igndts+discardcorrupt+nobuffer+flush_packets',
      '-skip_frame', 'nonkey',           // Skip all but keyframes if needed
      '-threads', '1',                   // Single thread for stability
      
      // MINIMAL ANALYSIS TO AVOID GETTING STUCK ON BAD STREAMS
      '-analyzeduration', '500000',      // 0.5 second analysis only
      '-probesize', '1000000',           // 1MB probe size
      '-max_analyze_duration', '1000000',
      
      // LARGE BUFFERS FOR UPSTREAM INSTABILITY
      '-rtbufsize', '5M',                // 5MB read buffer
      
      // MAXIMUM ERROR CONCEALMENT
      '-ec', '3',                        // Maximum error concealment
      '-strict', '-2',
      '-xerror',                         // Exit on error (will trigger restart)
      
      '-i', '[URL]',
      
      // COPY EVERYTHING POSSIBLE
      '-c', 'copy',                      // Copy all streams
      '-map', '0',                       // Map all streams
      
      // RELAXED BITSTREAM FILTERING
      '-bsf:v', 'h264_mp4toannexb',     // Basic conversion only
      
      // MPEG-TS WITH MAXIMUM TOLERANCE
      '-f', 'mpegts', 
      '-mpegts_copyts', '1',
      '-avoid_negative_ts', 'disabled',  // Don't adjust timestamps
      '-max_delay', '30000000',          // 30 second max delay
      '-max_muxing_queue_size', '16384', // Very large mux queue
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-flush_packets', '0',             // Don't force packet flushing
      
      // PRESERVE EVERYTHING
      '-copyts',
      '-copytb', '1',                    // Copy timebase
      '-flags', '+global_header',
      
      'pipe:1'
    ]
  }
};

// Function to select best profile based on client, stream, and resilience requirements
module.exports.selectProfile = function(userAgent, streamUrl, streamType, resilienceLevel = 'standard') {
  const isAndroidTV = userAgent && userAgent.toLowerCase().includes('android');
  const isM3U8 = streamUrl && streamUrl.includes('.m3u8');
  const isMJH = streamUrl && (streamUrl.includes('mjh.nz') || streamUrl.includes('i.mjh.nz'));
  const isHTTPStream = streamType === 'http' && !isM3U8;
  
  // Override profile selection based on resilience requirements
  if (resilienceLevel === 'maximum' || resilienceLevel === 'corruption_tolerant') {
    return module.exports.h264CorruptionResilient;
  }
  
  if (resilienceLevel === 'continuity_priority') {
    return module.exports.streamContinuity;
  }
  
  // Use optimized M3U8 profile for mjh.nz and m3u8 streams
  if (isMJH || isM3U8) {
    return module.exports.m3u8Optimized;
  }
  
  // Use HTTP optimized profile for direct HTTP streams
  if (isHTTPStream) {
    return module.exports.httpStreamOptimized;
  }
  
  if (isAndroidTV) {
    return module.exports.androidTVOptimized;
  }
  
  // Default to high quality copy
  return module.exports.highQualityCopy;
};

// Get profile by resilience level
module.exports.getResilienceProfile = function(level) {
  const profiles = {
    'standard': module.exports.highQualityCopy,
    'enhanced': module.exports.androidTVOptimized, 
    'maximum': module.exports.h264CorruptionResilient,
    'corruption_tolerant': module.exports.h264CorruptionResilient,
    'continuity_priority': module.exports.streamContinuity,
    'm3u8_optimized': module.exports.m3u8Optimized,
    'http_optimized': module.exports.httpStreamOptimized
  };
  
  return profiles[level] || module.exports.highQualityCopy;
};

// Get profile for specific stream types
module.exports.getStreamTypeProfile = function(streamUrl, streamType) {
  const isM3U8 = streamUrl && streamUrl.includes('.m3u8');
  const isMJH = streamUrl && (streamUrl.includes('mjh.nz') || streamUrl.includes('i.mjh.nz'));
  const isHTTPStream = streamType === 'http' && !isM3U8;
  
  if (isMJH || isM3U8) {
    return module.exports.m3u8Optimized;
  }
  
  if (isHTTPStream) {
    return module.exports.httpStreamOptimized;
  }
  
  return module.exports.highQualityCopy;
};