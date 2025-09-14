/**
 * Centralized FFmpeg default arguments configuration
 * All FFmpeg argument defaults should be managed here
 */

class FFmpegDefaults {
  // Default arguments broken down by category for maintainability
  static get DEFAULT_ARGS() {
    return {
      base: ['-hide_banner', '-loglevel', 'error'],
      reconnect: [
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '2'
      ],
      input: ['-i', '[URL]'],
      copy: ['-c:v', 'copy', '-c:a', 'copy'],
      bitstream: ['-bsf:v', 'dump_extra'],
      output_format: ['-f', 'mpegts'],
      timestamp_handling: [
        '-mpegts_copyts', '1',
        '-avoid_negative_ts', 'make_zero',
        '-copyts'
      ],
      error_resilience: [
        '-fflags', '+genpts+igndts+discardcorrupt'
      ],
      performance: [
        '-muxdelay', '0',
        '-muxpreload', '0',
        '-flush_packets', '1',
        '-max_delay', '0',
        '-max_muxing_queue_size', '9999'
      ],
      output_target: ['pipe:1']
    };
  }

  // HLS-specific protocol arguments
  static get HLS_PROTOCOL_ARGS() {
    return [
      '-allowed_extensions', 'ALL',
      '-protocol_whitelist', 'file,http,https,tcp,tls,pipe,crypto'
    ];
  }

  // Build complete default arguments as a string
  static buildDefaultArgsString() {
    const args = [
      ...this.DEFAULT_ARGS.base,
      ...this.DEFAULT_ARGS.reconnect,
      ...this.DEFAULT_ARGS.input,
      ...this.DEFAULT_ARGS.copy,
      ...this.DEFAULT_ARGS.bitstream,
      ...this.DEFAULT_ARGS.output_format,
      ...this.DEFAULT_ARGS.timestamp_handling,
      ...this.DEFAULT_ARGS.error_resilience,
      ...this.DEFAULT_ARGS.performance,
      ...this.DEFAULT_ARGS.output_target
    ];
    return args.join(' ');
  }

  // Build HLS protocol args as a string
  static buildHLSArgsString() {
    return this.HLS_PROTOCOL_ARGS.join(' ');
  }

  // Build complete default arguments as an array
  static buildDefaultArgsArray(inputUrl = '[URL]') {
    return [
      ...this.DEFAULT_ARGS.base,
      ...this.DEFAULT_ARGS.reconnect,
      '-i', inputUrl,
      ...this.DEFAULT_ARGS.copy,
      ...this.DEFAULT_ARGS.bitstream,
      ...this.DEFAULT_ARGS.output_format,
      ...this.DEFAULT_ARGS.timestamp_handling,
      ...this.DEFAULT_ARGS.error_resilience,
      ...this.DEFAULT_ARGS.performance,
      ...this.DEFAULT_ARGS.output_target
    ];
  }

  // Get optimized arguments for specific client types
  static getOptimizedArgs(clientType, streamCharacteristics = {}) {
    const baseArgs = this.buildDefaultArgsArray('[URL]');

    // For now, all client types use the same optimized settings
    // This can be extended in the future for client-specific optimizations
    switch (clientType) {
      case 'android_tv':
        // Android TV might benefit from specific settings in the future
        return baseArgs;

      case 'web_browser':
        // Web browsers might need different buffer sizes
        return baseArgs;

      case 'ios_mobile':
      case 'apple_tv':
        // Apple devices might need specific HLS optimizations
        return baseArgs;

      case 'android_mobile':
        // Android mobile might need lower buffer sizes
        return baseArgs;

      default:
        return baseArgs;
    }
  }

  // Validate that custom arguments don't conflict with defaults
  static validateCustomArgs(customArgs) {
    const required = ['-i', 'pipe:1'];
    const customArgsList = customArgs.split(' ');

    for (const req of required) {
      if (!customArgsList.includes(req)) {
        return {
          valid: false,
          error: `Required argument missing: ${req}`
        };
      }
    }

    return { valid: true };
  }

  // Merge custom arguments with defaults (for migration)
  static mergeWithDefaults(customArgs) {
    if (!customArgs) {
      return this.buildDefaultArgsString();
    }

    // Parse custom args
    const customArgsList = customArgs.split(' ').filter(arg => arg.length > 0);

    // Extract URL if present
    const urlIndex = customArgsList.indexOf('-i');
    let url = '[URL]';
    if (urlIndex > -1 && urlIndex < customArgsList.length - 1) {
      url = customArgsList[urlIndex + 1];
    }

    // Check if custom args have critical flags
    const hasBase = customArgsList.some(arg => arg === '-hide_banner');
    const hasReconnect = customArgsList.some(arg => arg === '-reconnect');
    const hasOutput = customArgsList.some(arg => arg === 'pipe:1');

    // If missing critical components, use defaults
    if (!hasBase || !hasReconnect || !hasOutput) {
      return this.buildDefaultArgsString();
    }

    return customArgs;
  }
}

module.exports = FFmpegDefaults;