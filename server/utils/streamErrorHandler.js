const logger = require('./logger');
const axios = require('axios');
const { spawn } = require('child_process');

class StreamErrorHandler {
  constructor() {
    this.errorPatterns = {
      // Common FFmpeg errors
      'Invalid data found when processing input': 'INVALID_DATA',
      'Server returned 4[0-9][0-9]': 'HTTP_CLIENT_ERROR',
      'Server returned 5[0-9][0-9]': 'HTTP_SERVER_ERROR',
      'Connection refused': 'CONNECTION_REFUSED',
      'Connection reset': 'CONNECTION_RESET',
      'Connection timed out': 'CONNECTION_TIMEOUT',
      'No such file or directory': 'FILE_NOT_FOUND',
      'Protocol not found': 'PROTOCOL_NOT_SUPPORTED',
      'Invalid argument': 'INVALID_ARGUMENT',
      'Permission denied': 'PERMISSION_DENIED',
      'Unable to open': 'UNABLE_TO_OPEN',
      'moov atom not found': 'INVALID_MP4_FORMAT',
      'Invalid NAL unit size': 'INVALID_H264_FORMAT',
      'Could not find codec parameters': 'CODEC_NOT_FOUND',
      'Unsupported codec': 'CODEC_NOT_SUPPORTED',
      'Error while decoding': 'DECODE_ERROR',
      'Failed to read frame': 'READ_FRAME_ERROR'
    };

    this.streamTypeErrors = {
      'hls': {
        'Failed to open segment': 'HLS_SEGMENT_ERROR',
        'Failed to reload playlist': 'HLS_PLAYLIST_ERROR',
        'Discontinuity detected': 'HLS_DISCONTINUITY'
      },
      'dash': {
        'Failed to parse MPD': 'DASH_MANIFEST_ERROR',
        'Representation not found': 'DASH_REPRESENTATION_ERROR'
      },
      'rtsp': {
        'RTSP error': 'RTSP_PROTOCOL_ERROR',
        'Failed to connect': 'RTSP_CONNECTION_ERROR'
      }
    };
  }

  /**
   * Diagnose stream health by attempting to fetch and validate
   */
  async diagnoseStreamHealth(streamUrl, channel) {
    const diagnosis = {
      url: streamUrl,
      channelId: channel?.id,
      channelName: channel?.name,
      timestamp: new Date().toISOString(),
      checks: {},
      errors: [],
      recommendations: []
    };

    try {
      // Step 1: Check URL accessibility
      diagnosis.checks.urlAccessibility = await this.checkUrlAccessibility(streamUrl);
      
      // Step 2: Detect stream type
      diagnosis.checks.streamType = await this.detectStreamType(streamUrl);
      
      // Step 3: Validate stream format
      diagnosis.checks.formatValidation = await this.validateStreamFormat(streamUrl, diagnosis.checks.streamType);
      
      // Step 4: Test with FFmpeg probe
      diagnosis.checks.ffmpegProbe = await this.testFFmpegProbe(streamUrl);
      
      // Step 5: Check for geo-blocking or authentication
      diagnosis.checks.accessRestrictions = await this.checkAccessRestrictions(streamUrl);
      
      // Generate recommendations based on diagnosis
      diagnosis.recommendations = this.generateRecommendations(diagnosis);
      
    } catch (error) {
      diagnosis.errors.push({
        stage: 'diagnosis',
        error: error.message
      });
    }

    // Log comprehensive diagnosis
    logger.warn('Stream health diagnosis completed', diagnosis);
    
    return diagnosis;
  }

  /**
   * Check if URL is accessible
   */
  async checkUrlAccessibility(url, customHeaders = {}) {
    try {
      const headers = {
        'User-Agent': 'PlexBridge/1.0 (compatible; stream-check)',
        ...customHeaders
      };
      
      const response = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true, // Accept any status
        headers
      });

      return {
        accessible: response.status >= 200 && response.status < 400,
        statusCode: response.status,
        statusText: response.statusText,
        finalUrl: response.request.responseURL || url,
        redirected: response.request.responseURL !== url,
        headers: {
          contentType: response.headers['content-type'],
          contentLength: response.headers['content-length'],
          server: response.headers['server']
        }
      };
    } catch (error) {
      return {
        accessible: false,
        error: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * Detect stream type from URL and content
   */
  async detectStreamType(url) {
    const urlLower = url.toLowerCase();
    
    // URL pattern detection
    if (urlLower.includes('.m3u8') || urlLower.includes('/hls/')) {
      return 'hls';
    }
    if (urlLower.includes('.mpd') || urlLower.includes('/dash/')) {
      return 'dash';
    }
    if (urlLower.includes('.ts') || urlLower.includes('.mpegts')) {
      return 'mpegts';
    }
    if (urlLower.startsWith('rtsp://')) {
      return 'rtsp';
    }
    if (urlLower.startsWith('rtmp://')) {
      return 'rtmp';
    }

    // Content-based detection
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        maxRedirects: 5,
        responseType: 'text',
        headers: {
          'User-Agent': 'PlexBridge/1.0',
          'Range': 'bytes=0-1023'
        }
      });

      const content = response.data.toString().substring(0, 1024);
      
      if (content.includes('#EXTM3U') || content.includes('#EXT-X-')) {
        return 'hls';
      }
      if (content.includes('<MPD') || content.includes('urn:mpeg:dash')) {
        return 'dash';
      }
      
      // Check content type header
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('mpegurl')) return 'hls';
      if (contentType.includes('dash+xml')) return 'dash';
      if (contentType.includes('video/mp2t')) return 'mpegts';
      
    } catch (error) {
      // Ignore errors in content detection
    }

    return 'unknown';
  }

  /**
   * Validate stream format specifics
   */
  async validateStreamFormat(url, streamType) {
    const validation = {
      type: streamType,
      valid: false,
      details: {}
    };

    try {
      switch (streamType) {
        case 'hls':
          const hlsResponse = await axios.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': 'PlexBridge/1.0' }
          });
          
          const playlist = hlsResponse.data;
          validation.valid = playlist.includes('#EXTM3U');
          validation.details = {
            hasSegments: playlist.includes('#EXTINF:'),
            hasBandwidth: playlist.includes('#EXT-X-STREAM-INF:'),
            isLive: !playlist.includes('#EXT-X-ENDLIST'),
            version: playlist.match(/#EXT-X-VERSION:(\d+)/)?.[1]
          };
          break;

        case 'mpegts':
          // Basic check for MPEG-TS
          const tsResponse = await axios.get(url, {
            timeout: 5000,
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'PlexBridge/1.0',
              'Range': 'bytes=0-187' // MPEG-TS packet size
            }
          });
          
          const tsData = Buffer.from(tsResponse.data);
          validation.valid = tsData[0] === 0x47; // MPEG-TS sync byte
          validation.details = {
            syncByte: tsData[0] === 0x47,
            packetSize: 188
          };
          break;

        default:
          validation.valid = true; // Assume valid for unknown types
      }
    } catch (error) {
      validation.error = error.message;
    }

    return validation;
  }

  /**
   * Test stream with FFmpeg probe
   */
  async testFFmpegProbe(url) {
    return new Promise((resolve) => {
      const result = {
        success: false,
        streams: [],
        format: {},
        errors: []
      };

      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_streams',
        '-show_format',
        '-print_format', 'json',
        '-timeout', '10000000', // 10 seconds in microseconds
        url
      ]);

      let output = '';
      let errorOutput = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0 && output) {
          try {
            const probeData = JSON.parse(output);
            result.success = true;
            result.streams = probeData.streams?.map(s => ({
              type: s.codec_type,
              codec: s.codec_name,
              profile: s.profile,
              width: s.width,
              height: s.height,
              bitrate: s.bit_rate
            }));
            result.format = {
              name: probeData.format?.format_name,
              duration: probeData.format?.duration,
              bitrate: probeData.format?.bit_rate
            };
          } catch (error) {
            result.errors.push('Failed to parse FFprobe output');
          }
        } else {
          result.errors = this.parseFFmpegErrors(errorOutput);
        }
        resolve(result);
      });

      // Timeout fallback
      setTimeout(() => {
        ffprobe.kill();
        result.errors.push('FFprobe timeout');
        resolve(result);
      }, 15000);
    });
  }

  /**
   * Check for access restrictions
   */
  async checkAccessRestrictions(url) {
    const restrictions = {
      geoBlocked: false,
      authRequired: false,
      userAgentRequired: false,
      refererRequired: false
    };

    try {
      // Test with different user agents
      const userAgents = [
        'PlexBridge/1.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'VLC/3.0.0 LibVLC/3.0.0'
      ];

      for (const ua of userAgents) {
        try {
          const response = await axios.head(url, {
            timeout: 5000,
            headers: { 'User-Agent': ua },
            validateStatus: () => true
          });

          if (response.status === 403) {
            restrictions.geoBlocked = true;
          }
          if (response.status === 401) {
            restrictions.authRequired = true;
          }
          if (response.status >= 200 && response.status < 300) {
            if (ua !== userAgents[0]) {
              restrictions.userAgentRequired = true;
            }
            break;
          }
        } catch (error) {
          // Continue testing
        }
      }
    } catch (error) {
      // Ignore errors in restriction checking
    }

    return restrictions;
  }

  /**
   * Parse FFmpeg error output
   */
  parseFFmpegErrors(errorOutput) {
    const errors = [];
    const lines = errorOutput.split('\n');
    
    for (const line of lines) {
      for (const [pattern, errorType] of Object.entries(this.errorPatterns)) {
        if (new RegExp(pattern, 'i').test(line)) {
          errors.push({
            type: errorType,
            message: line.trim()
          });
        }
      }
    }

    return errors.length > 0 ? errors : [{ type: 'UNKNOWN', message: errorOutput.trim() }];
  }

  /**
   * Generate recommendations based on diagnosis
   */
  generateRecommendations(diagnosis) {
    const recommendations = [];

    // Check URL accessibility
    if (!diagnosis.checks.urlAccessibility?.accessible) {
      if (diagnosis.checks.urlAccessibility?.statusCode === 403) {
        recommendations.push('Stream appears to be geo-blocked. Consider using a VPN or proxy.');
      } else if (diagnosis.checks.urlAccessibility?.statusCode === 404) {
        recommendations.push('Stream URL is not found. The stream may have moved or expired.');
      } else {
        recommendations.push('Stream URL is not accessible. Check if the stream is still active.');
      }
    }

    // Check stream type
    if (diagnosis.checks.streamType === 'unknown') {
      recommendations.push('Unable to detect stream type. Ensure the URL points to a valid stream.');
    }

    // Check format validation
    if (diagnosis.checks.formatValidation && !diagnosis.checks.formatValidation.valid) {
      recommendations.push(`Stream format validation failed for ${diagnosis.checks.streamType}. The stream may be corrupted.`);
    }

    // Check FFmpeg probe
    if (diagnosis.checks.ffmpegProbe && !diagnosis.checks.ffmpegProbe.success) {
      const errors = diagnosis.checks.ffmpegProbe.errors || [];
      if (errors.some(e => e.type === 'CODEC_NOT_FOUND')) {
        recommendations.push('Stream codec not recognized. May need to update FFmpeg or use transcoding.');
      }
      if (errors.some(e => e.type === 'CONNECTION_TIMEOUT')) {
        recommendations.push('Stream connection timeout. The source may be overloaded or slow.');
      }
    }

    // Check access restrictions
    if (diagnosis.checks.accessRestrictions) {
      if (diagnosis.checks.accessRestrictions.geoBlocked) {
        recommendations.push('Stream is geo-blocked. Configure appropriate headers or use a proxy.');
      }
      if (diagnosis.checks.accessRestrictions.authRequired) {
        recommendations.push('Stream requires authentication. Add credentials to the stream configuration.');
      }
      if (diagnosis.checks.accessRestrictions.userAgentRequired) {
        recommendations.push('Stream requires specific User-Agent header. Configure in stream settings.');
      }
    }

    if (recommendations.length === 0 && diagnosis.checks.ffmpegProbe?.success) {
      recommendations.push('Stream appears healthy but may have intermittent issues. Monitor for patterns.');
    }

    return recommendations;
  }

  /**
   * Format error response for Plex
   */
  formatErrorResponse(res, error, diagnosis = null) {
    // Never send HTML to Plex - always send proper error responses
    const errorResponse = {
      error: true,
      message: error.message || 'Stream processing failed',
      code: error.code || 'STREAM_ERROR',
      timestamp: new Date().toISOString()
    };

    if (diagnosis) {
      errorResponse.diagnosis = {
        streamType: diagnosis.checks?.streamType,
        accessible: diagnosis.checks?.urlAccessibility?.accessible,
        recommendations: diagnosis.recommendations
      };
    }

    // Log the error for debugging
    logger.error('Stream error response', errorResponse);

    // Send appropriate response based on request type
    const userAgent = res.req?.get('User-Agent') || '';
    const isPlexRequest = userAgent.toLowerCase().includes('plex') || 
                         userAgent.toLowerCase().includes('lavf');

    if (isPlexRequest) {
      // For Plex, send empty MPEG-TS stream or close connection
      res.status(503).end();
    } else {
      // For other clients, send JSON error
      res.status(500).json(errorResponse);
    }
  }
}

module.exports = new StreamErrorHandler();