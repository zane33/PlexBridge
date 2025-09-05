/**
 * FFmpeg Profiles for PlexBridge
 * Optimized configurations for different streaming scenarios
 */

module.exports = {
  // High Quality Copy - No re-encoding, preserves original quality
  highQualityCopy: {
    name: 'High Quality Copy',
    description: 'Direct copy of video and audio, no quality loss',
    args: [
      '-hide_banner',
      '-loglevel', 'error',
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
    description: 'Optimized for HLS streams with quality preservation',
    args: [
      '-hide_banner',
      '-loglevel', 'error',
      '-allowed_extensions', 'ALL',
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
  }
};

// Function to select best profile based on client and stream
module.exports.selectProfile = function(userAgent, streamUrl, streamType) {
  const isAndroidTV = userAgent && userAgent.toLowerCase().includes('android');
  const isHLS = streamUrl && streamUrl.includes('.m3u8');
  
  if (isAndroidTV) {
    return module.exports.androidTVOptimized;
  }
  
  if (isHLS) {
    return module.exports.hlsHighQuality;
  }
  
  // Default to high quality copy
  return module.exports.highQualityCopy;
};