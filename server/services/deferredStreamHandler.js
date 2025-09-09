/**
 * Deferred Stream Handler for IPTV Timeout Prevention
 * 
 * This service implements a "Progressive Stream Initialization" pattern that:
 * 1. Immediately responds to Plex requests with HTTP 200
 * 2. Streams placeholder/padding data while upstream connects
 * 3. Seamlessly transitions to actual stream once available
 * 4. Maintains VLC compatibility and connection limits
 * 
 * Critical for handling slow IPTV servers (10-15 second connection times)
 * while preventing Plex timeouts (~20 seconds).
 */

const { spawn } = require('child_process');
const { PassThrough, Readable } = require('stream');
const logger = require('../utils/logger');
const connectionManager = require('../utils/connectionManager');

class DeferredStreamHandler {
  constructor() {
    this.activeStreams = new Map();
    this.streamBuffers = new Map();
  }

  /**
   * Generate MPEG-TS padding packets to keep Plex alive
   * These are valid empty transport stream packets that maintain connection
   */
  generateMpegTsPadding() {
    // MPEG-TS packet: sync_byte(0x47) + header + payload
    // 188 bytes per packet, null packet PID 0x1FFF for padding
    const packet = Buffer.alloc(188);
    packet[0] = 0x47; // Sync byte
    packet[1] = 0x1F; // PID high bits (null packet)
    packet[2] = 0xFF; // PID low bits
    packet[3] = 0x10; // No adaptation field, payload only
    // Rest filled with 0x00 (null payload)
    
    return packet;
  }

  /**
   * Create a readable stream that sends padding packets
   * This keeps Plex connection alive during upstream initialization
   */
  createPaddingStream(intervalMs = 100) {
    const paddingPacket = this.generateMpegTsPadding();
    let intervalId;
    
    const paddingStream = new Readable({
      read() {}
    });

    // Send padding packets at regular intervals
    intervalId = setInterval(() => {
      paddingStream.push(paddingPacket);
    }, intervalMs);

    // Cleanup on stream end
    paddingStream.on('end', () => {
      if (intervalId) clearInterval(intervalId);
    });

    paddingStream._cleanup = () => {
      if (intervalId) clearInterval(intervalId);
    };

    return paddingStream;
  }

  /**
   * Handle stream request with deferred initialization
   * This is the main entry point for Plex stream requests
   */
  async handleDeferredStream(req, res, channel, stream) {
    const sessionId = `${channel.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const userAgent = req.get('User-Agent') || '';
    const isPlexRequest = connectionManager.isPlexClient(userAgent);
    const hasConnectionLimits = stream?.connection_limits === 1 || stream?.connection_limits === true;
    
    logger.info('Starting deferred stream handling', {
      sessionId,
      channelId: channel.id,
      channelName: channel.name,
      streamUrl: stream?.url?.substring(0, 50) + '...',
      hasConnectionLimits,
      isPlexRequest,
      clientIP: req.ip
    });

    // Step 1: Immediately set response headers and send HTTP 200
    res.set({
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'close',
      'Transfer-Encoding': 'chunked'
    });
    
    // Send headers immediately - this prevents Plex timeout
    res.status(200);
    res.flushHeaders();
    
    logger.info('HTTP headers sent immediately to prevent Plex timeout', { sessionId });

    // Step 2: Start sending padding data to keep connection alive
    const paddingStream = this.createPaddingStream(200); // Every 200ms
    let paddingActive = true;
    
    // Pipe padding stream to response
    paddingStream.on('data', (chunk) => {
      if (paddingActive && !res.destroyed) {
        res.write(chunk);
      }
    });

    // Step 3: Initialize FFmpeg in background with connection limits
    const streamInitPromise = this.initializeBackgroundStream(sessionId, channel, stream, userAgent);
    
    // Track this session
    this.activeStreams.set(sessionId, {
      req,
      res,
      channel,
      stream,
      paddingStream,
      startTime: Date.now(),
      status: 'initializing'
    });

    try {
      // Step 4: Wait for actual stream to be ready
      const ffmpegProcess = await streamInitPromise;
      
      // Step 5: Stop padding and switch to real stream
      paddingActive = false;
      paddingStream._cleanup();
      
      logger.info('Switching from padding to real stream', {
        sessionId,
        initializationTime: Date.now() - this.activeStreams.get(sessionId).startTime
      });
      
      // Pipe FFmpeg output to response
      ffmpegProcess.stdout.pipe(res, { end: true });
      
      // Update session status
      const sessionData = this.activeStreams.get(sessionId);
      if (sessionData) {
        sessionData.status = 'streaming';
        sessionData.ffmpegProcess = ffmpegProcess;
      }
      
      // Handle FFmpeg process events
      ffmpegProcess.on('error', (error) => {
        logger.error('FFmpeg process error in deferred stream', {
          sessionId,
          error: error.message
        });
        this.cleanup(sessionId);
      });
      
      ffmpegProcess.on('close', (code) => {
        logger.info('FFmpeg process closed in deferred stream', {
          sessionId,
          exitCode: code
        });
        this.cleanup(sessionId);
      });
      
    } catch (error) {
      logger.error('Failed to initialize background stream', {
        sessionId,
        error: error.message,
        streamUrl: stream?.url?.substring(0, 50) + '...'
      });
      
      // Continue sending padding - better than closing connection
      // Plex will timeout naturally if stream never works
      setTimeout(() => {
        this.cleanup(sessionId);
      }, 30000); // Cleanup after 30 seconds
    }
    
    // Handle client disconnect
    req.on('close', () => {
      logger.info('Client disconnected from deferred stream', { sessionId });
      this.cleanup(sessionId);
    });
    
    res.on('close', () => {
      logger.info('Response closed for deferred stream', { sessionId });
      this.cleanup(sessionId);
    });
  }

  /**
   * Initialize FFmpeg process in background with proper connection management
   */
  async initializeBackgroundStream(sessionId, channel, stream, userAgent) {
    const hasConnectionLimits = stream?.connection_limits === 1 || stream?.connection_limits === true;
    
    if (hasConnectionLimits) {
      // Apply connection delays BEFORE starting FFmpeg
      logger.info('Applying connection delays for IPTV server limits', {
        sessionId,
        streamUrl: stream.url?.substring(0, 50) + '...'
      });
      
      await connectionManager.waitForRequestSlot(stream.url, userAgent);
    }
    
    // Build FFmpeg command for IPTV stream
    const ffmpegArgs = this.buildFFmpegArgs(stream, hasConnectionLimits);
    
    logger.info('Starting FFmpeg for deferred stream', {
      sessionId,
      command: `ffmpeg ${ffmpegArgs.join(' ')}`,
      hasConnectionLimits
    });
    
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ffmpegProcess.kill('SIGKILL');
        reject(new Error('FFmpeg initialization timeout'));
      }, hasConnectionLimits ? 60000 : 30000); // Longer timeout for connection-limited streams
      
      // Wait for first data to confirm stream is working
      const onFirstData = () => {
        clearTimeout(timeout);
        ffmpegProcess.stdout.removeListener('data', onFirstData);
        logger.info('FFmpeg process ready, first data received', { sessionId });
        resolve(ffmpegProcess);
      };
      
      ffmpegProcess.stdout.once('data', onFirstData);
      
      ffmpegProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      
      ffmpegProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        logger.debug('FFmpeg stderr for deferred stream', {
          sessionId,
          output: errorOutput
        });
        
        // Check for critical errors
        if (errorOutput.includes('HTTP error 403') || 
            errorOutput.includes('Connection refused') ||
            errorOutput.includes('Invalid data found')) {
          clearTimeout(timeout);
          reject(new Error(`FFmpeg error: ${errorOutput}`));
        }
      });
    });
  }

  /**
   * Build FFmpeg arguments optimized for IPTV streams
   */
  buildFFmpegArgs(stream, hasConnectionLimits) {
    const args = ['-hide_banner', '-loglevel', 'error'];
    
    // Input configuration
    if (hasConnectionLimits) {
      // VLC-compatible headers for connection-limited servers
      args.push(
        '-headers', 'User-Agent: VLC/3.0.20 LibVLC/3.0.20\r\nConnection: close\r\n',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '10'
      );
    }
    
    args.push('-i', stream.url);
    
    // Output configuration - copy codecs for efficiency
    args.push(
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-f', 'mpegts',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+flush_packets',
      '-tune', 'zerolatency',
      'pipe:1'
    );
    
    return args;
  }

  /**
   * Cleanup stream session and resources
   */
  cleanup(sessionId) {
    const sessionData = this.activeStreams.get(sessionId);
    if (!sessionData) return;
    
    logger.info('Cleaning up deferred stream session', { sessionId });
    
    // Stop padding stream
    if (sessionData.paddingStream && sessionData.paddingStream._cleanup) {
      sessionData.paddingStream._cleanup();
    }
    
    // Kill FFmpeg process
    if (sessionData.ffmpegProcess && !sessionData.ffmpegProcess.killed) {
      sessionData.ffmpegProcess.kill('SIGTERM');
      
      // Force kill if not dead in 5 seconds
      setTimeout(() => {
        if (!sessionData.ffmpegProcess.killed) {
          sessionData.ffmpegProcess.kill('SIGKILL');
        }
      }, 5000);
    }
    
    // Close response if still open
    if (sessionData.res && !sessionData.res.destroyed) {
      sessionData.res.end();
    }
    
    this.activeStreams.delete(sessionId);
  }

  /**
   * Get statistics for active deferred streams
   */
  getStats() {
    const sessions = Array.from(this.activeStreams.entries()).map(([sessionId, data]) => ({
      sessionId,
      channelId: data.channel.id,
      channelName: data.channel.name,
      status: data.status,
      uptime: Date.now() - data.startTime,
      clientIP: data.req.ip
    }));
    
    return {
      activeSessions: sessions.length,
      sessions
    };
  }
}

// Export singleton instance
module.exports = new DeferredStreamHandler();
