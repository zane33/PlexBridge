/**
 * Progressive Stream Handler for IPTV Timeout Prevention
 * 
 * This service implements a "Progressive Stream Response" pattern that:
 * 1. Immediately responds to Plex requests with HTTP 200
 * 2. Streams keepalive data while upstream connects (prevents Plex timeout)
 * 3. Uses advanced M3U8 resolver to handle complex IPTV streams
 * 4. Seamlessly transitions to actual stream once available
 * 5. Maintains VLC compatibility and connection limits
 * 
 * Critical for handling slow IPTV servers (10-15 second connection times)
 * while preventing Plex timeouts (~20 seconds).
 */

const { spawn } = require('child_process');
const { PassThrough, Readable } = require('stream');
const logger = require('../utils/logger');
const advancedM3U8Resolver = require('./advancedM3U8Resolver');
const connectionManager = require('../utils/connectionManager');

class ProgressiveStreamHandler {
  constructor() {
    this.activeStreams = new Map();
    
    // MPEG-TS keepalive pattern (null packet)
    this.keepAlivePacket = Buffer.alloc(188, 0x47); // TS sync byte + padding
    this.keepAlivePacket[1] = 0x1F; // PID 0x1FFF (null packet)
    this.keepAlivePacket[2] = 0xFF;
    this.keepAlivePacket[3] = 0x10; // No payload, adaptation field present
  }

  /**
   * Handle progressive stream request with immediate response
   * This prevents Plex from timing out during slow IPTV resolution
   */
  async handleProgressiveStream(streamUrl, streamData, req, res) {
    const sessionId = `progressive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isPlexClient = this.detectPlexClient(req.get('User-Agent'));
    
    logger.info('Starting progressive stream handler', {
      sessionId,
      streamUrl: streamUrl.substring(0, 100) + '...',
      streamName: streamData?.name,
      isPlexClient,
      connectionLimits: streamData?.connection_limits
    });

    try {
      // Step 1: Immediate HTTP 200 response to prevent Plex timeout
      const responseHeaders = {
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
        'Transfer-Encoding': 'chunked'
      };

      // Add CORS headers if needed
      if (req.get('Origin')) {
        responseHeaders['Access-Control-Allow-Origin'] = '*';
        responseHeaders['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
        responseHeaders['Access-Control-Allow-Headers'] = 'Range, User-Agent';
      }

      res.writeHead(200, responseHeaders);

      // Step 2: Create progressive stream state
      const streamState = {
        sessionId,
        startTime: Date.now(),
        phase: 'initializing',
        keepAliveActive: true,
        streamResolved: false,
        ffmpegProcess: null,
        actualStreamUrl: null,
        error: null
      };

      this.activeStreams.set(sessionId, streamState);

      // Step 3: Start keepalive immediately (prevents Plex timeout)
      const keepAliveInterval = this.startKeepAlive(res, streamState);

      // Step 4: Resolve stream in background (async, non-blocking)
      this.resolveStreamAsync(streamUrl, streamData, streamState, res, keepAliveInterval);

      // Handle client disconnect
      req.on('close', () => {
        logger.info('Client disconnected from progressive stream', { sessionId });
        this.cleanup(sessionId, keepAliveInterval);
      });

      req.on('error', (error) => {
        logger.warn('Client error in progressive stream', { sessionId, error: error.message });
        this.cleanup(sessionId, keepAliveInterval);
      });

      return { sessionId, handled: true };

    } catch (error) {
      logger.error('Progressive stream handler failed', {
        sessionId,
        streamUrl: streamUrl.substring(0, 100) + '...',
        error: error.message
      });

      if (!res.headersSent) {
        res.status(500).json({ error: 'Progressive stream initialization failed' });
      }

      return { sessionId, handled: false, error: error.message };
    }
  }

  /**
   * Start keepalive packets to prevent Plex timeout
   */
  startKeepAlive(res, streamState) {
    logger.debug('Starting keepalive for progressive stream', { sessionId: streamState.sessionId });
    
    const keepAliveInterval = setInterval(() => {
      if (!streamState.keepAliveActive || streamState.streamResolved) {
        clearInterval(keepAliveInterval);
        return;
      }

      try {
        // Send MPEG-TS null packet to keep connection alive
        res.write(this.keepAlivePacket);
        
        logger.debug('Sent keepalive packet', {
          sessionId: streamState.sessionId,
          phase: streamState.phase,
          elapsed: Date.now() - streamState.startTime
        });
        
      } catch (error) {
        logger.warn('Keepalive packet failed', {
          sessionId: streamState.sessionId,
          error: error.message
        });
        clearInterval(keepAliveInterval);
        streamState.keepAliveActive = false;
      }
    }, 2000); // Send keepalive every 2 seconds

    return keepAliveInterval;
  }

  /**
   * Resolve stream asynchronously while keepalive runs
   */
  async resolveStreamAsync(streamUrl, streamData, streamState, res, keepAliveInterval) {
    try {
      streamState.phase = 'resolving';
      logger.info('Starting async stream resolution', { sessionId: streamState.sessionId });

      // Step 1: Use advanced M3U8 resolver for complex IPTV streams
      const resolutionResult = await advancedM3U8Resolver.resolveM3U8Stream(streamUrl, {
        connectionLimits: streamData?.connection_limits === 1 || streamData?.connection_limits === true,
        userAgent: 'VLC/3.0.20 LibVLC/3.0.20',
        channelId: streamData?.channelId,
        enableKeepAlive: true
      });

      if (!resolutionResult.success) {
        throw new Error(`M3U8 resolution failed: ${resolutionResult.error}`);
      }

      streamState.actualStreamUrl = resolutionResult.finalUrl;
      streamState.phase = 'stream_resolved';
      
      logger.info('Stream resolution completed', {
        sessionId: streamState.sessionId,
        resolutionTime: resolutionResult.resolutionTime,
        finalUrl: resolutionResult.finalUrl.substring(0, 100) + '...'
      });

      // Step 2: Apply connection limits management if needed
      if (streamData?.connection_limits) {
        logger.debug('Applying connection limits delay before FFmpeg', { sessionId: streamState.sessionId });
        await connectionManager.waitForRequestSlot(streamState.actualStreamUrl, 'VLC/3.0.20 LibVLC/3.0.20');
      }

      // Step 3: Start FFmpeg with the resolved URL
      streamState.phase = 'starting_ffmpeg';
      await this.startFFmpegStream(streamState, res, keepAliveInterval);

    } catch (error) {
      logger.error('Async stream resolution failed', {
        sessionId: streamState.sessionId,
        error: error.message,
        phase: streamState.phase
      });

      streamState.error = error.message;
      streamState.phase = 'error';
      
      // Stop keepalive and close connection
      clearInterval(keepAliveInterval);
      streamState.keepAliveActive = false;
      
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  /**
   * Start FFmpeg stream and transition from keepalive
   */
  async startFFmpegStream(streamState, res, keepAliveInterval) {
    const { sessionId, actualStreamUrl } = streamState;
    
    try {
      logger.info('Starting FFmpeg for resolved stream', {
        sessionId,
        streamUrl: actualStreamUrl.substring(0, 100) + '...'
      });

      // Build FFmpeg arguments optimized for IPTV streams
      const ffmpegArgs = this.buildFFmpegArgs(actualStreamUrl);

      logger.debug('FFmpeg command', {
        sessionId,
        command: `ffmpeg ${ffmpegArgs.join(' ')}`
      });

      // Start FFmpeg process
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      streamState.ffmpegProcess = ffmpegProcess;
      streamState.phase = 'streaming';

      // Stop keepalive - real stream will start now
      clearInterval(keepAliveInterval);
      streamState.keepAliveActive = false;
      streamState.streamResolved = true;

      logger.info('Transitioning from keepalive to real stream', { sessionId });

      // Pipe FFmpeg output to response
      ffmpegProcess.stdout.pipe(res, { end: true });

      // Handle FFmpeg events
      ffmpegProcess.on('exit', (code, signal) => {
        logger.info('FFmpeg process exited', { sessionId, code, signal });
        streamState.phase = 'completed';
        
        if (!res.writableEnded) {
          res.end();
        }
      });

      ffmpegProcess.on('error', (error) => {
        logger.error('FFmpeg process error', { sessionId, error: error.message });
        streamState.error = error.message;
        streamState.phase = 'error';
        
        if (!res.writableEnded) {
          res.end();
        }
      });

      ffmpegProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        logger.debug('FFmpeg stderr', { sessionId, output: errorOutput.substring(0, 200) });
      });

    } catch (error) {
      logger.error('Failed to start FFmpeg stream', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Build FFmpeg arguments optimized for IPTV streams
   */
  buildFFmpegArgs(streamUrl) {
    return [
      '-hide_banner',
      '-loglevel', 'error',
      
      // Input configuration for IPTV streams
      '-allowed_extensions', 'ALL',
      '-protocol_whitelist', 'file,http,https,tcp,tls,pipe,crypto',
      '-user_agent', 'VLC/3.0.20 LibVLC/3.0.20',
      '-headers', 'Accept: */*\\r\\nConnection: close\\r\\n',
      
      // HLS-specific options
      '-live_start_index', '0',
      '-http_persistent', '0',
      '-http_seekable', '0',
      '-multiple_requests', '1',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-timeout', '45000000', // 45 second timeout
      
      // Advanced HLS options for complex streams
      '-max_reload', '3',
      '-http_multiple', '1',
      
      '-i', streamUrl,
      
      // Output configuration for Plex
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-bsf:v', 'h264_mp4toannexb',
      '-f', 'mpegts',
      '-mpegts_copyts', '1',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+igndts+discardcorrupt+nobuffer',
      '-copyts',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-flush_packets', '1',
      '-max_delay', '0',
      '-max_muxing_queue_size', '9999',
      
      // Output to stdout
      'pipe:1'
    ];
  }

  /**
   * Detect if client is Plex
   */
  detectPlexClient(userAgent) {
    if (!userAgent) return false;
    const userAgentLower = userAgent.toLowerCase();
    return userAgentLower.includes('plex') || 
           userAgentLower.includes('plexamp') ||
           userAgentLower.includes('plex media server');
  }

  /**
   * Cleanup progressive stream resources
   */
  cleanup(sessionId, keepAliveInterval = null) {
    const streamState = this.activeStreams.get(sessionId);
    if (!streamState) return;

    logger.info('Cleaning up progressive stream', { sessionId, phase: streamState.phase });

    // Stop keepalive
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
    }
    streamState.keepAliveActive = false;

    // Kill FFmpeg process if running
    if (streamState.ffmpegProcess && !streamState.ffmpegProcess.killed) {
      streamState.ffmpegProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!streamState.ffmpegProcess.killed) {
          streamState.ffmpegProcess.kill('SIGKILL');
        }
      }, 5000);
    }

    // Remove from active streams
    this.activeStreams.delete(sessionId);
  }

  /**
   * Check if stream should use progressive handler
   * ONLY based on the existing "IPTV Connection Limits" setting
   */
  shouldUseProgressiveHandler(streamUrl, streamData) {
    // Use progressive handler ONLY when "IPTV Connection Limits" is enabled on the stream
    return streamData?.connection_limits === 1 || streamData?.connection_limits === true;
  }

  /**
   * Get handler statistics
   */
  getStats() {
    const stats = {
      activeStreams: this.activeStreams.size,
      streams: []
    };

    for (const [sessionId, state] of this.activeStreams) {
      stats.streams.push({
        sessionId,
        phase: state.phase,
        elapsed: Date.now() - state.startTime,
        keepAliveActive: state.keepAliveActive,
        streamResolved: state.streamResolved,
        hasError: !!state.error
      });
    }

    return stats;
  }
}

// Export singleton instance
module.exports = new ProgressiveStreamHandler();