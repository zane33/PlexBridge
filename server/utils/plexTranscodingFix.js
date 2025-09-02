/**
 * Plex Transcoding Fix
 * 
 * Fixes H.264 transcoding errors that cause stream corruption:
 * - [h264] non-existing PPS 0 referenced
 * - [h264] decode_slice_header error  
 * - [h264] no frame!
 * - [h264] mmco: unref short failure
 */

const logger = require('./logger');

/**
 * CRITICAL: Fixed FFmpeg transcoding parameters for Plex compatibility
 * 
 * The key issues with the previous configuration:
 * 1. -preset ultrafast: Too aggressive, creates unstable H.264 streams
 * 2. -bufsize 1000k: Too small, causes discontinuities
 * 3. -g 30: Too frequent keyframes for live streams
 * 4. Missing proper H.264 parameter handling
 * 5. Incompatible with Plex's H.264 decoder expectations
 */

const PLEX_COMPATIBLE_TRANSCODING_CONFIG = {
  // Base configuration for stable H.264 transcoding
  base: {
    preset: 'fast',           // Balanced speed/quality (not ultrafast)
    tune: 'film',             // Better than zerolatency for Plex
    profile: 'high',          // H.264 High profile
    level: '4.0',             // H.264 level 4.0
    pixelFormat: 'yuv420p',   // Standard pixel format
    
    // Bitrate settings (stable for Plex)
    videoBitrate: '3000k',    // Higher than before for stability
    maxrate: '3500k',         // Allow some variance
    bufsize: '6000k',         // Much larger buffer for stability
    
    // Audio settings
    audioBitrate: '128k',
    audioSampleRate: '48000',
    audioChannels: 2,
    
    // Keyframe settings for live streams
    gopSize: 60,              // 60 frames = 2.4 seconds @ 25fps
    keyintMin: 30,            // Minimum keyframe interval
    scThreshold: 40,          // Scene change threshold
    
    // H.264 stability parameters
    refs: 1,                  // Single reference frame for live
    bframes: 0,               // No B-frames for live streams
    weightPred: false,        // Disable weighted prediction
    
    // Stream stability flags
    flags: [
      '+global_header',       // Required for MPEG-TS
      '+low_delay',           // Low delay mode
      '-loop'                 // Disable loop filter for speed
    ],
    
    // MPEG-TS specific settings
    mpegtsFlags: [
      'resend_headers',       // Resend headers for stability
      'system_b',             // System B timing
      'initial_discontinuity' // Handle discontinuities
    ]
  },
  
  // Android TV optimized settings
  androidTV: {
    preset: 'faster',         // Slightly faster for Android TV
    videoBitrate: '2500k',    // Lower bitrate for Android TV
    maxrate: '2800k',
    bufsize: '5000k',
    gopSize: 50,              // Shorter GOP for Android TV
    
    // Android TV specific H.264 parameters
    refs: 1,
    bframes: 0,
    weightPred: false,
    constrained: true,        // Constrained baseline for compatibility
    
    // Additional Android TV flags
    additionalFlags: [
      '+cgop',                // Closed GOP for seeking
      '+fast_pskip'           // Fast P-skip for performance
    ]
  }
};

/**
 * Generates Plex-compatible FFmpeg transcoding command
 */
function generatePlexTranscodingCommand(streamUrl, options = {}) {
  const isAndroidTV = options.isAndroidTV || false;
  const config = isAndroidTV ? 
    { ...PLEX_COMPATIBLE_TRANSCODING_CONFIG.base, ...PLEX_COMPATIBLE_TRANSCODING_CONFIG.androidTV } :
    PLEX_COMPATIBLE_TRANSCODING_CONFIG.base;
  
  // Build the complete FFmpeg command with proper H.264 parameters
  const args = [
    // Input handling
    '-hide_banner',
    '-loglevel', 'error',
    '-reconnect', '1',
    '-reconnect_at_eof', '1', 
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    
    // Input source
    '-i', streamUrl,
    
    // Video encoding (H.264 with stable parameters)
    '-c:v', 'libx264',
    '-preset', config.preset,
    '-tune', config.tune,
    '-profile:v', config.profile,
    '-level:v', config.level,
    '-pix_fmt', config.pixelFormat,
    
    // Bitrate control (critical for stability)
    '-b:v', config.videoBitrate,
    '-maxrate', config.maxrate,
    '-bufsize', config.bufsize,
    
    // Keyframe settings (prevents PPS errors)
    '-g', config.gopSize.toString(),
    '-keyint_min', config.keyintMin.toString(),
    '-sc_threshold', config.scThreshold.toString(),
    
    // H.264 stability parameters (CRITICAL for Plex compatibility)
    '-refs', config.refs.toString(),
    '-bf', config.bframes.toString(),
    ...(config.weightPred ? [] : ['-wpredp', '0']),
    ...(config.constrained ? ['-flags', '+cgop'] : []),
    
    // Audio encoding (AAC with proper stream format)
    '-c:a', 'aac',
    '-b:a', config.audioBitrate,
    '-ar', config.audioSampleRate,
    '-ac', config.audioChannels.toString(),
    '-aac_coder', 'twoloop',      // Better AAC quality
    '-profile:a', 'aac_low',      // AAC-LC profile
    
    // Bitstream filters (CRITICAL for MPEG-TS compatibility)
    '-bsf:v', 'h264_mp4toannexb', // Convert H.264 to Annex B format
    '-bsf:a', 'aac_adtstoaac',    // Fix AAC stream format
    
    // MPEG-TS output format
    '-f', 'mpegts',
    '-mpegts_copyts', '1',
    '-avoid_negative_ts', 'make_zero',
    
    // Stream stability flags
    '-fflags', '+genpts+igndts+discardcorrupt+nobuffer',
    '-flags', config.flags.join('+').replace(/^\+/, ''),
    
    // Muxer settings (prevents stream corruption)
    '-muxdelay', '0',
    '-muxpreload', '0',
    '-flush_packets', '1',
    '-max_muxing_queue_size', '9999',
    
    // Real-time streaming optimization
    '-re',                        // Read input at native frame rate
    '-avoid_negative_ts', 'make_zero',
    '-copyts',
    
    // Output to stdout
    'pipe:1'
  ];
  
  return args;
}

/**
 * Generates codec copy command (for non-transcoding streams)
 */
function generatePlexCopyCommand(streamUrl, options = {}) {
  const isAndroidTV = options.isAndroidTV || false;
  
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-reconnect', '1',
    '-reconnect_at_eof', '1',
    '-reconnect_streamed', '1', 
    '-reconnect_delay_max', '2',
    '-i', streamUrl,
    
    // Codec copy with bitstream filters
    '-c:v', 'copy',
    '-c:a', 'copy',
    
    // Bitstream filters for format compatibility
    '-bsf:v', 'h264_mp4toannexb,dump_extra',  // Ensure proper H.264 format
    '-bsf:a', 'aac_adtstoaac',                // Fix AAC format
    
    // MPEG-TS output
    '-f', 'mpegts',
    '-mpegts_copyts', '1',
    '-avoid_negative_ts', 'make_zero',
    
    // Stream handling flags
    '-fflags', '+genpts+igndts+discardcorrupt+nobuffer',
    '-flags', '+global_header+low_delay',
    
    // Muxer settings
    '-copyts',
    '-muxdelay', '0',
    '-muxpreload', '0',
    '-flush_packets', '1',
    '-max_delay', '0',
    '-max_muxing_queue_size', '9999',
    
    // Android TV optimizations
    ...(isAndroidTV ? [
      '-rtbufsize', '256k',
      '-probesize', '32',
      '-analyzeduration', '0'
    ] : []),
    
    'pipe:1'
  ];
  
  return args;
}

/**
 * Validates if a stream URL needs transcoding based on format
 */
function shouldForceTranscoding(streamUrl, protocolOptions = {}) {
  // Check explicit forceTranscode setting
  if (protocolOptions.forceTranscode === true) {
    return true;
  }
  
  // Check stream format for transcoding requirement
  const url = streamUrl.toLowerCase();
  
  // These formats typically need transcoding for Plex compatibility
  const needsTranscoding = [
    '.ts',          // Raw MPEG-TS may need re-encoding
    'rtsp://',      // RTSP usually needs transcoding
    'rtmp://',      // RTMP usually needs transcoding  
    'udp://',       // UDP multicast may need transcoding
    'rtp://'        // RTP streams may need transcoding
  ];
  
  return needsTranscoding.some(format => url.includes(format));
}

/**
 * Gets the appropriate FFmpeg command for a stream
 */
function getPlexCompatibleCommand(streamUrl, options = {}) {
  const {
    forceTranscode = false,
    isAndroidTV = false,
    protocolOptions = {}
  } = options;
  
  // Determine if transcoding is needed
  const needsTranscoding = forceTranscode || shouldForceTranscoding(streamUrl, protocolOptions);
  
  logger.info('FFmpeg command generation', {
    streamUrl: streamUrl.substring(0, 100),
    needsTranscoding,
    isAndroidTV,
    forceTranscode,
    commandType: needsTranscoding ? 'transcode' : 'copy'
  });
  
  if (needsTranscoding) {
    return generatePlexTranscodingCommand(streamUrl, { isAndroidTV });
  } else {
    return generatePlexCopyCommand(streamUrl, { isAndroidTV });
  }
}

module.exports = {
  generatePlexTranscodingCommand,
  generatePlexCopyCommand,
  getPlexCompatibleCommand,
  shouldForceTranscoding,
  PLEX_COMPATIBLE_TRANSCODING_CONFIG
};