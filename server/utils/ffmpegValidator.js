const Joi = require('joi');

class FFmpegValidator {
  // Whitelist of allowed FFmpeg flags
  static ALLOWED_FLAGS = [
    '-hide_banner', '-loglevel', '-reconnect', '-reconnect_at_eof',
    '-reconnect_streamed', '-reconnect_delay_max', '-reconnect_on_network_error',
    '-reconnect_on_http_error', '-i', '-c:v', '-c:a', '-b:v', '-b:a',
    '-preset', '-crf', '-profile:v', '-level', '-pix_fmt', '-maxrate',
    '-bufsize', '-g', '-keyint_min', '-sc_threshold', '-x264opts',
    '-ar', '-ac', '-f', '-mpegts_copyts', '-mpegts_start_pid',
    '-mpegts_pmt_start_pid', '-mpegts_pcr_period', '-avoid_negative_ts',
    '-fflags', '-flags', '-copyts', '-copytb', '-muxdelay', '-muxpreload',
    '-flush_packets', '-max_delay', '-max_muxing_queue_size', '-rtbufsize',
    '-probesize', '-analyzeduration', '-thread_queue_size', '-bsf:v',
    '-bsf:a', '-map', '-movflags', '-hls_time', '-hls_list_size',
    '-hls_flags', '-segment_time', '-segment_format', '-reset_timestamps',
    '-start_at_zero', '-threads', '-thread_type', '-err_detect', '-ec',
    '-strict', '-xerror', '-skip_frame', '-max_analyze_duration',
    '-allowed_extensions', '-protocol_whitelist', '-user_agent',
    '-http_persistent', '-http_seekable', '-multiple_requests',
    '-max_reload', '-m3u8_hold_counters', '-live_start_index',
    '-rtsp_transport', '-rtsp_flags', '-timeout', '-buffer_size',
    '-pkt_size', '-fifo_size', '-overrun_nonfatal', '-dump_extra',
    '-extract_extradata', '-h264_mp4toannexb', '-aac_adtstoasc'
  ];

  // Dangerous patterns that should never appear
  static DANGEROUS_PATTERNS = [
    /;\s*rm\s/,      // Command chaining with rm
    /;\s*cat\s/,     // Command chaining with cat
    />\s*\/dev\//,   // Redirecting to /dev/
    /\|\s*sh/,       // Piping to shell
    /\|\s*bash/,     // Piping to bash
    /`.*`/,          // Command substitution
    /\$\(.*\)/,      // Command substitution
    /&&/,            // Command chaining
    /\|\|/,          // Command chaining
    /\.\.\//,        // Directory traversal (fixed regex)
    /~\//            // Home directory access
  ];

  // Validate stream URL
  static isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      const allowedProtocols = ['http:', 'https:', 'rtmp:', 'rtsp:', 'udp:', 'srt:', 'file:'];

      if (!allowedProtocols.includes(urlObj.protocol)) {
        return { valid: false, error: `Invalid protocol: ${urlObj.protocol}` };
      }

      // Check for localhost/private IPs only in production
      if (process.env.NODE_ENV === 'production') {
        const hostname = urlObj.hostname;
        const privateIPRegex = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|localhost)/;
        if (privateIPRegex.test(hostname)) {
          return { valid: false, error: 'Private/local addresses not allowed in production' };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  // Escape shell arguments safely
  static escapeShellArg(arg) {
    if (!arg) return '""';

    // If argument contains special characters, quote it
    if (/[^a-zA-Z0-9_\-.:\/]/.test(arg)) {
      // Escape any existing quotes and backslashes
      const escaped = arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `"${escaped}"`;
    }

    return arg;
  }

  // Validate FFmpeg arguments - VALIDATION DISABLED per user request
  static validateFFmpegArgs(args) {
    if (!args || typeof args !== 'string') {
      return { valid: false, error: 'Invalid FFmpeg arguments format' };
    }

    // VALIDATION COMPLETELY DISABLED per user request
    // Allow any FFmpeg arguments without restrictions
    return { valid: true };
  }

  // Parse FFmpeg arguments into array
  static parseFFmpegArgs(args) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let escapeNext = false;

    for (let i = 0; i < args.length; i++) {
      const char = args[i];

      if (escapeNext) {
        current += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ' ' && !inQuotes) {
        if (current) {
          result.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      result.push(current);
    }

    return result;
  }

  // Process FFmpeg arguments safely - FFmpeg validation removed per user request
  static processFFmpegArgs(ffmpegArgs, hlsArgs, streamUrl) {
    // Validate stream URL (keeping URL validation for security)
    const urlValidation = this.isValidUrl(streamUrl);
    if (!urlValidation.valid) {
      throw new Error(`Invalid stream URL: ${urlValidation.error}`);
    }

    // FFmpeg argument validation removed - accept any arguments
    // Basic type checking only
    if (!ffmpegArgs || typeof ffmpegArgs !== 'string') {
      throw new Error('FFmpeg arguments must be a non-empty string');
    }

    // Escape the stream URL properly
    const escapedUrl = this.escapeShellArg(streamUrl);

    // Replace [URL] placeholder with escaped URL
    let processedArgs = ffmpegArgs.replace(/\[URL\]/g, escapedUrl);

    // If HLS args are provided and the stream is HLS, insert them before -i
    if (hlsArgs && streamUrl.toLowerCase().includes('.m3u8')) {
      // HLS argument validation removed - accept any arguments
      // Basic type checking only
      if (typeof hlsArgs !== 'string') {
        throw new Error('HLS arguments must be a string');
      }

      const inputIndex = processedArgs.indexOf('-i ');
      if (inputIndex > -1) {
        processedArgs = processedArgs.substring(0, inputIndex) + hlsArgs + ' ' + processedArgs.substring(inputIndex);
      }
    }

    return this.parseFFmpegArgs(processedArgs);
  }

  // Validate profile data - FFmpeg validation removed per user request
  static validateProfileData(data) {
    const CLIENT_TYPES = ['web_browser', 'android_mobile', 'android_tv', 'ios_mobile', 'apple_tv'];

    const schema = Joi.object({
      name: Joi.string()
        .max(100)
        .pattern(/^[a-zA-Z0-9\s\-_()]+$/)
        .required()
        .messages({
          'string.pattern.base': 'Profile name can only contain letters, numbers, spaces, hyphens, underscores, and parentheses'
        }),
      description: Joi.string().max(500).allow('').optional(),
      is_default: Joi.boolean().optional(),
      clients: Joi.object().pattern(
        Joi.string().valid(...CLIENT_TYPES),
        Joi.object({
          // VALIDATION REMOVED: Accept any FFmpeg arguments without restrictions
          ffmpeg_args: Joi.string()
            .max(10000) // Increased limit for complex FFmpeg configurations
            .required(),
          // VALIDATION REMOVED: Accept any HLS arguments without restrictions
          hls_args: Joi.string()
            .max(5000) // Increased limit for complex HLS configurations
            .allow('')
            .optional()
        })
      ).optional()
    });

    return schema.validate(data);
  }

  // Validate stream IDs array
  static validateStreamIds(streamIds) {
    if (!Array.isArray(streamIds)) {
      return { valid: false, error: 'Stream IDs must be an array' };
    }

    if (streamIds.length === 0) {
      return { valid: false, error: 'No stream IDs provided' };
    }

    if (streamIds.length > 1000) {
      return { valid: false, error: 'Maximum 1000 stream IDs allowed per operation' };
    }

    // Validate each ID is a valid UUID v4
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const id of streamIds) {
      if (typeof id !== 'string' || !uuidRegex.test(id)) {
        return { valid: false, error: `Invalid stream ID format: ${id}` };
      }
    }

    return { valid: true };
  }
}

module.exports = FFmpegValidator;