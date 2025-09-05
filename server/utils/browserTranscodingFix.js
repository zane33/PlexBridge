/**
 * Browser-Specific H.264 Transcoding Configuration
 * 
 * This module addresses the critical issue where Plex web browser clients
 * force transcoding of PlexBridge streams, leading to H.264 decode errors.
 * 
 * ROOT CAUSE ANALYSIS:
 * - Android TV clients: Direct play works (no H.264 errors)
 * - Web browser clients: Force transcoding → H.264 decode errors
 * - Browser limitation: Cannot direct play certain H.264 profiles/levels
 * 
 * SOLUTION APPROACH:
 * 1. Detect browser vs native clients
 * 2. Provide browser-optimized H.264 parameters for Plex transcoding
 * 3. Use different stream profiles based on client capabilities
 */

const logger = require('../utils/logger');

// Browser-specific H.264 configurations optimized for Plex transcoding
const BROWSER_TRANSCODING_PROFILES = {
  // Ultra-compatible profile for browsers that force Plex transcoding
  'browser-transcode-safe': {
    name: 'Browser Transcode Safe',
    description: 'H.264 profile optimized for Plex browser transcoding pipeline',
    ffmpeg_options: [
      '-hide_banner',
      '-loglevel', 'error',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-analyzeduration', '2000000',
      '-probesize', '2000000',
      
      // CRITICAL: H.264 encoding for browser transcoding compatibility
      '-c:v', 'libx264',
      '-preset', 'faster',              // Balance speed vs quality for real-time
      '-profile:v', 'main',             // Main profile is more compatible than High
      '-level', '3.1',                  // Level 3.1 maximum for browser compatibility
      '-pix_fmt', 'yuv420p',           // Standard chroma subsampling
      
      // Browser-specific H.264 parameter optimizations
      '-x264-params', 'keyint=60:min-keyint=30:scenecut=40:ref=2:bframes=2:weightb=1:weightp=2:rc-lookahead=20',
      
      // Bitrate settings for smooth transcoding
      '-b:v', '2000k',
      '-maxrate', '2500k',
      '-bufsize', '3000k',
      
      // Audio settings
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '2',
      
      // Container and streaming optimizations
      '-f', 'mpegts',
      '-mpegts_copyts', '1',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+igndts+discardcorrupt',
      
      // Critical: Use clean H.264 bitstream for Plex transcoding
      '-bsf:v', 'h264_metadata=aud=insert:sei=remove',
      
      // Buffering optimizations for browser playback
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-flush_packets', '1',
      '-max_muxing_queue_size', '2048'
    ],
    container: 'mpegts',
    video_codec: 'h264',
    audio_codec: 'aac',
    browser_compatible: true
  },

  // Direct browser playback profile (for capable browsers)
  'browser-direct-play': {
    name: 'Browser Direct Play',
    description: 'H.264 profile for direct browser playback without Plex transcoding',
    ffmpeg_options: [
      '-hide_banner',
      '-loglevel', 'error',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      
      // Copy codecs for direct playback when possible
      '-c:v', 'copy',
      '-c:a', 'copy',
      
      // Use MP4 container for browser compatibility
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+faststart',
      
      // Minimal processing for direct play
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts'
    ],
    container: 'mp4',
    video_codec: 'h264',
    audio_codec: 'aac',
    browser_compatible: true,
    direct_play: true
  },

  // Fallback profile for problematic streams
  'browser-emergency-transcode': {
    name: 'Browser Emergency Transcode',
    description: 'Emergency H.264 profile for streams that fail standard browser transcoding',
    ffmpeg_options: [
      '-hide_banner',
      '-loglevel', 'error',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      
      // Ultra-safe H.264 encoding
      '-c:v', 'libx264',
      '-preset', 'ultrafast',           // Prioritize speed for emergency mode
      '-profile:v', 'baseline',         // Most compatible profile
      '-level', '3.0',                  // Lower level for maximum compatibility
      '-pix_fmt', 'yuv420p',
      
      // Conservative bitrate settings
      '-b:v', '1500k',
      '-maxrate', '1800k',
      '-bufsize', '2000k',
      '-g', '60',                       // 2-second keyframes at 30fps
      
      // Simple audio
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ar', '44100',
      '-ac', '2',
      
      // Clean MPEG-TS output
      '-f', 'mpegts',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts'
    ],
    container: 'mpegts',
    video_codec: 'h264',
    audio_codec: 'aac',
    browser_compatible: true,
    emergency_mode: true
  }
};

/**
 * Detects if the request is from a web browser that will force Plex transcoding
 */
function isBrowserClient(userAgent, clientName) {
  if (!userAgent) return false;
  
  const browserPatterns = [
    'Mozilla/',
    'Chrome/',
    'Safari/',
    'Firefox/',
    'Edge/',
    'Opera/',
    'WebKit/'
  ];
  
  // Check for explicit browser user agents
  const isBrowser = browserPatterns.some(pattern => userAgent.includes(pattern));
  
  // Check for Plex web client specific identifiers
  const isPlexWeb = clientName && (
    clientName.includes('Plex Web') ||
    clientName.includes('Plex/Web') ||
    clientName.toLowerCase().includes('web')
  );
  
  return isBrowser || isPlexWeb;
}

/**
 * Detects client capabilities from Plex headers and user agent
 */
function analyzeClientCapabilities(req) {
  const userAgent = req.get('User-Agent') || '';
  const clientName = req.get('X-Plex-Client-Name') || '';
  const clientVersion = req.get('X-Plex-Client-Version') || '';
  const platform = req.get('X-Plex-Platform') || '';
  const platformVersion = req.get('X-Plex-Platform-Version') || '';
  
  const capabilities = {
    isBrowser: isBrowserClient(userAgent, clientName),
    isAndroidTV: platform.toLowerCase().includes('android') && platform.toLowerCase().includes('tv'),
    clientName,
    platform,
    userAgent,
    
    // Browser-specific H.264 capabilities
    supportsHighProfile: false,
    supportsDirectPlay: false,
    forcesTranscoding: false
  };
  
  // Analyze browser-specific H.264 support
  if (capabilities.isBrowser) {
    // Most browsers force transcoding for MPEG-TS H.264 streams
    capabilities.forcesTranscoding = true;
    
    // Chrome has better H.264 support than Firefox/Safari
    if (userAgent.includes('Chrome/') && !userAgent.includes('Edge/')) {
      capabilities.supportsHighProfile = true;
      capabilities.supportsDirectPlay = userAgent.includes('Chrome/9') || userAgent.includes('Chrome/8'); // Recent versions
    }
    
    // Safari has good H.264 support but prefers MP4
    if (userAgent.includes('Safari/') && userAgent.includes('Version/')) {
      capabilities.supportsHighProfile = true;
      capabilities.supportsDirectPlay = true;
    }
  } else {
    // Native clients typically support direct play
    capabilities.supportsDirectPlay = true;
    capabilities.supportsHighProfile = true;
  }
  
  return capabilities;
}

/**
 * Selects optimal streaming profile based on client capabilities
 */
function selectBrowserTranscodeProfile(clientCapabilities, streamInfo) {
  logger.info('Selecting browser transcode profile', {
    isBrowser: clientCapabilities.isBrowser,
    forcesTranscoding: clientCapabilities.forcesTranscoding,
    clientName: clientCapabilities.clientName,
    platform: clientCapabilities.platform
  });
  
  // For non-browser clients, use standard profiles
  if (!clientCapabilities.isBrowser) {
    return null; // Use existing logic
  }
  
  // Check if stream has a history of transcoding failures
  const hasTranscodeFailures = streamInfo?.transcode_failure_count > 0;
  const hasH264Errors = streamInfo?.h264_error_count > 0;
  
  // Emergency mode for streams with known issues
  if (hasTranscodeFailures > 2 || hasH264Errors > 0) {
    logger.warn('Using emergency browser transcode profile due to previous failures', {
      transcodeFailures: hasTranscodeFailures,
      h264Errors: hasH264Errors
    });
    return 'browser-emergency-transcode';
  }
  
  // Try direct play for capable browsers with MP4-friendly streams
  if (clientCapabilities.supportsDirectPlay && 
      streamInfo?.container !== 'mpegts' &&
      !clientCapabilities.forcesTranscoding) {
    return 'browser-direct-play';
  }
  
  // Default: Use browser-transcode-safe profile for Plex transcoding
  return 'browser-transcode-safe';
}

/**
 * Gets FFmpeg options for browser transcoding profile
 */
function getBrowserTranscodeOptions(profile) {
  const config = BROWSER_TRANSCODING_PROFILES[profile];
  if (!config) {
    logger.warn('Unknown browser transcode profile, using browser-transcode-safe', { profile });
    return BROWSER_TRANSCODING_PROFILES['browser-transcode-safe'];
  }
  
  return config;
}

/**
 * Applies browser-specific H.264 optimizations to FFmpeg command
 */
function optimizeForBrowserTranscoding(ffmpegArgs, clientCapabilities) {
  if (!clientCapabilities.isBrowser) {
    return ffmpegArgs; // No changes for non-browser clients
  }
  
  const optimizedArgs = [...ffmpegArgs];
  
  // Find and replace problematic H.264 parameters
  for (let i = 0; i < optimizedArgs.length; i++) {
    const arg = optimizedArgs[i];
    
    // Replace high profile with main profile for better browser compatibility
    if (arg === '-profile:v' && optimizedArgs[i + 1] === 'high') {
      optimizedArgs[i + 1] = 'main';
      logger.info('Changed H.264 profile from high to main for browser compatibility');
    }
    
    // Ensure level is browser-compatible
    if (arg === '-level' && parseFloat(optimizedArgs[i + 1]) > 4.0) {
      optimizedArgs[i + 1] = '3.1';
      logger.info('Limited H.264 level to 3.1 for browser compatibility');
    }
    
    // Replace problematic bitstream filters
    if (arg === '-bsf:v' && optimizedArgs[i + 1] === 'h264_mp4toannexb') {
      optimizedArgs[i + 1] = 'h264_metadata=aud=insert:sei=remove';
      logger.info('Applied browser-safe H.264 bitstream filter');
    }
  }
  
  return optimizedArgs;
}

/**
 * Logs browser transcoding decision for debugging
 */
function logBrowserTranscodeDecision(clientCapabilities, selectedProfile, streamInfo) {
  logger.info('Browser transcoding configuration selected', {
    client: {
      isBrowser: clientCapabilities.isBrowser,
      clientName: clientCapabilities.clientName,
      platform: clientCapabilities.platform,
      forcesTranscoding: clientCapabilities.forcesTranscoding,
      supportsDirectPlay: clientCapabilities.supportsDirectPlay
    },
    stream: {
      hasTranscodeFailures: streamInfo?.transcode_failure_count > 0,
      hasH264Errors: streamInfo?.h264_error_count > 0,
      container: streamInfo?.container
    },
    decision: {
      selectedProfile,
      reasoning: selectedProfile ? BROWSER_TRANSCODING_PROFILES[selectedProfile]?.description : 'Using default profile'
    }
  });
}

module.exports = {
  BROWSER_TRANSCODING_PROFILES,
  isBrowserClient,
  analyzeClientCapabilities,
  selectBrowserTranscodeProfile,
  getBrowserTranscodeOptions,
  optimizeForBrowserTranscoding,
  logBrowserTranscodeDecision
};