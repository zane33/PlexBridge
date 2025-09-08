const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const logger = require('../utils/logger');
const EventEmitter = require('events');
const ffmpegProfiles = require('../config/ffmpegProfiles');
const config = require('../config');

/**
 * Enhanced Stream Resilience Service
 * 
 * Provides multi-layer connection recovery for streaming:
 * - Layer 1: FFmpeg-level reconnection (0-5s)
 * - Layer 2: Process-level restart (5-15s) 
 * - Layer 3: Session-level recreation (15-30s)
 * - Layer 4: Source-level failover (30s+)
 */
class StreamResilienceService extends EventEmitter {
  constructor() {
    super();
    this.activeStreams = new Map();
    this.processWatchdogs = new Map();
    this.bufferManagers = new Map();
    this.retryConfigs = new Map();
    
    // Resilience configuration
    this.config = {
      // Layer 1: FFmpeg reconnection with H.264 error tolerance
      ffmpeg: {
        reconnectDelayMs: 1000,      // Initial reconnect delay
        maxReconnectAttempts: 8,     // Increased for H.264 corruption (was 5)
        reconnectBackoffFactor: 1.3, // Reduced backoff for faster recovery
        networkTimeoutMs: 15000,     // Increased timeout for slow recovery (was 10000)
        h264ErrorTolerance: 'maximum', // H.264 corruption tolerance level
        corruptionRetryLimit: 3      // Max retries specifically for H.264 corruption
      },
      
      // Layer 2: Process restart
      process: {
        restartDelayMs: 2000,        // Initial restart delay
        maxRestartAttempts: 3,       // Max process restarts
        restartBackoffFactor: 2.0,   // Exponential backoff
        healthCheckIntervalMs: 5000, // Process health check interval
        staleThresholdMs: 30000      // Consider process stale after 30s
      },
      
      // Layer 3: Session recreation
      session: {
        recreateDelayMs: 5000,       // Initial recreation delay
        maxRecreateAttempts: 2,      // Max session recreations
        recreateBackoffFactor: 2.0,  // Exponential backoff
        sessionTimeoutMs: 60000      // Session timeout
      },
      
      // Layer 4: Smart buffering
      buffer: {
        prebufferMs: 15000,          // Pre-buffer 15 seconds
        maxBufferMs: 30000,          // Maximum buffer size
        bufferThresholdMs: 5000,     // Switch to buffer when < 5s
        recoveryBufferMs: 10000      // Maintain 10s during recovery
      }
    };
  }

  /**
   * Start resilient stream with multi-layer recovery
   */
  async startResilientStream(streamId, streamUrl, options = {}) {
    try {
      logger.info('Starting resilient stream', {
        streamId,
        streamUrl,
        options
      });

      // Initialize resilience tracking
      const resilienceState = {
        streamId,
        streamUrl,
        options,
        startTime: Date.now(),
        status: 'initializing',
        
        // Retry counters for each layer
        ffmpegRetries: 0,
        processRestarts: 0,
        sessionRecreations: 0,
        
        // Current process and streams
        currentProcess: null,
        outputStream: new PassThrough(),
        bufferStream: new PassThrough(),
        
        // Health monitoring
        lastDataTime: Date.now(),
        bytesProcessed: 0,
        isHealthy: true,
        
        // Recovery state
        isRecovering: false,
        recoveryStartTime: null,
        recoveryLayer: null
      };

      this.activeStreams.set(streamId, resilienceState);
      this.retryConfigs.set(streamId, { ...this.config });

      // Start the stream with Layer 1 (FFmpeg) resilience
      await this.startFFmpegWithResilience(resilienceState);
      
      // Start process watchdog (Layer 2)
      this.startProcessWatchdog(streamId);
      
      // Start buffer manager (Layer 4)
      this.startBufferManager(streamId);
      
      resilienceState.status = 'streaming';
      this.emit('stream:started', { streamId, status: 'streaming' });

      return resilienceState.outputStream;
    } catch (error) {
      logger.error('Failed to start resilient stream', {
        streamId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Layer 1: Enhanced FFmpeg with aggressive reconnection
   */
  async startFFmpegWithResilience(resilienceState) {
    const { streamId, streamUrl, options } = resilienceState;
    
    const ffmpegArgs = [
      '-i', streamUrl,
      
      // ENHANCED RECONNECTION PARAMETERS
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '30', // Max 30 second delay
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',
      
      // AGGRESSIVE TIMEOUT SETTINGS
      '-timeout', this.config.ffmpeg.networkTimeoutMs * 1000, // microseconds
      '-tcp_nodelay', '1',
      '-fflags', '+genpts+igndts',
      '-avoid_negative_ts', 'make_zero',
      
      // EXPONENTIAL BACKOFF FOR RETRIES
      '-reconnect_delay_max', Math.min(
        this.config.ffmpeg.reconnectDelayMs * Math.pow(
          this.config.ffmpeg.reconnectBackoffFactor,
          resilienceState.ffmpegRetries
        ),
        30000 // Cap at 30 seconds
      ).toString(),
      
      // OUTPUT FORMAT OPTIMIZATION
      '-f', 'mpegts',
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-copyts',
      '-start_at_zero',
      
      // BUFFER OPTIMIZATION
      '-buffer_size', '4096k',
      '-max_delay', '5000000', // 5 seconds max delay
      '-fflags', '+flush_packets',
      
      // REAL-TIME PROCESSING
      '-re', // Read input at native frame rate
      '-threads', '2', // Limit threads for stability
      
      // OUTPUT TO STDOUT
      'pipe:1'
    ];

    logger.info('Starting FFmpeg with enhanced resilience', {
      streamId,
      ffmpegRetries: resilienceState.ffmpegRetries,
      args: ffmpegArgs.slice(0, 10) // Log first 10 args for brevity
    });

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    resilienceState.currentProcess = ffmpeg;

    // Enhanced error handling with automatic restart
    ffmpeg.on('error', async (error) => {
      logger.error('FFmpeg process error', {
        streamId,
        error: error.message,
        ffmpegRetries: resilienceState.ffmpegRetries
      });

      await this.handleFFmpegFailure(resilienceState, error);
    });

    ffmpeg.on('exit', async (code, signal) => {
      logger.warn('FFmpeg process exited', {
        streamId,
        code,
        signal,
        ffmpegRetries: resilienceState.ffmpegRetries
      });

      // Only restart if not intentionally stopped
      if (resilienceState.status !== 'stopped' && code !== 0) {
        await this.handleFFmpegFailure(resilienceState, new Error(`FFmpeg exited with code ${code}`));
      }
    });

    // Enhanced data flow monitoring
    ffmpeg.stdout.on('data', (chunk) => {
      resilienceState.lastDataTime = Date.now();
      resilienceState.bytesProcessed += chunk.length;
      
      // Update health status
      resilienceState.isHealthy = true;
      
      // If recovering, switch back to live stream
      if (resilienceState.isRecovering) {
        this.completeRecovery(resilienceState);
      }
      
      // Pipe to both output and buffer streams
      resilienceState.outputStream.write(chunk);
      if (resilienceState.bufferStream.writable) {
        resilienceState.bufferStream.write(chunk);
      }
    });

    // Monitor stderr for connection issues and upstream session events
    ffmpeg.stderr.on('data', (data) => {
      const errorText = data.toString();
      logger.debug('FFmpeg stderr', { streamId, stderr: errorText.trim() });
      
      // Enhanced upstream session logging
      this.logUpstreamSessionEvents(streamId, errorText);
      
      // Detect specific connection issues for proactive recovery
      if (this.isConnectionError(errorText)) {
        logger.warn('Connection error detected in FFmpeg', {
          streamId,
          error: errorText.trim()
        });
        
        // Don't immediately restart, let FFmpeg handle it first
        // But prepare for potential recovery
        if (!resilienceState.isRecovering) {
          this.prepareForRecovery(resilienceState, 'connection_error');
        }
      }
      
      // Detect upstream session termination
      if (this.isUpstreamSessionTermination(errorText)) {
        logger.info('Upstream session terminated - initiating seamless reconnection', {
          streamId,
          upstreamError: errorText.trim(),
          action: 'automatic_reconnection'
        });
        
        // Start immediate reconnection instead of failing
        this.handleUpstreamDisconnection(resilienceState, errorText);
      }
    });

    return ffmpeg;
  }

  /**
   * Layer 2: Process watchdog with automatic restart
   */
  startProcessWatchdog(streamId) {
    const watchdogInterval = setInterval(() => {
      const resilienceState = this.activeStreams.get(streamId);
      if (!resilienceState) {
        clearInterval(watchdogInterval);
        return;
      }

      const now = Date.now();
      const timeSinceLastData = now - resilienceState.lastDataTime;

      // Check if process is stale (no data for threshold period)
      if (timeSinceLastData > this.config.process.staleThresholdMs && 
          resilienceState.status === 'streaming' &&
          !resilienceState.isRecovering) {
        
        logger.warn('Process appears stale, initiating restart', {
          streamId,
          timeSinceLastData,
          threshold: this.config.process.staleThresholdMs
        });

        this.handleProcessFailure(resilienceState, new Error('Process stale - no data received'));
      }
    }, this.config.process.healthCheckIntervalMs);

    this.processWatchdogs.set(streamId, watchdogInterval);
  }

  /**
   * Layer 4: Smart buffering for seamless recovery
   */
  startBufferManager(streamId) {
    const resilienceState = this.activeStreams.get(streamId);
    if (!resilienceState) return;

    const bufferManager = {
      buffer: Buffer.alloc(0),
      maxBufferSize: this.config.buffer.maxBufferMs * 1000, // Rough bytes estimate
      isBuffering: false,
      bufferStartTime: null
    };

    // Store buffer manager
    this.bufferManagers.set(streamId, bufferManager);

    // Buffer data from the stream
    resilienceState.bufferStream.on('data', (chunk) => {
      // Maintain rolling buffer
      bufferManager.buffer = Buffer.concat([bufferManager.buffer, chunk]);
      
      // Trim buffer to max size
      if (bufferManager.buffer.length > bufferManager.maxBufferSize) {
        const trimSize = bufferManager.buffer.length - bufferManager.maxBufferSize;
        bufferManager.buffer = bufferManager.buffer.slice(trimSize);
      }
    });
  }

  /**
   * Handle FFmpeg-level failures with exponential backoff
   */
  async handleFFmpegFailure(resilienceState, error) {
    const { streamId } = resilienceState;

    if (resilienceState.ffmpegRetries >= this.config.ffmpeg.maxReconnectAttempts) {
      logger.error('FFmpeg max retries exceeded, escalating to process restart', {
        streamId,
        retries: resilienceState.ffmpegRetries
      });
      
      return this.handleProcessFailure(resilienceState, error);
    }

    // Start recovery process
    this.startRecovery(resilienceState, 'ffmpeg_retry', error);

    resilienceState.ffmpegRetries++;
    const backoffDelay = this.config.ffmpeg.reconnectDelayMs * Math.pow(
      this.config.ffmpeg.reconnectBackoffFactor,
      resilienceState.ffmpegRetries - 1
    );

    logger.info('Attempting FFmpeg reconnection', {
      streamId,
      attempt: resilienceState.ffmpegRetries,
      backoffDelay,
      error: error.message
    });

    // Wait for backoff delay, then restart FFmpeg
    setTimeout(async () => {
      try {
        // Clean up current process
        if (resilienceState.currentProcess) {
          resilienceState.currentProcess.kill('SIGKILL');
        }

        // Restart FFmpeg with enhanced parameters
        await this.startFFmpegWithResilience(resilienceState);
        
        logger.info('FFmpeg reconnection successful', {
          streamId,
          attempt: resilienceState.ffmpegRetries
        });
      } catch (restartError) {
        logger.error('FFmpeg reconnection failed', {
          streamId,
          attempt: resilienceState.ffmpegRetries,
          error: restartError.message
        });
        
        // Try again or escalate
        await this.handleFFmpegFailure(resilienceState, restartError);
      }
    }, backoffDelay);
  }

  /**
   * Handle process-level failures with restart
   */
  async handleProcessFailure(resilienceState, error) {
    const { streamId } = resilienceState;

    if (resilienceState.processRestarts >= this.config.process.maxRestartAttempts) {
      logger.error('Process max restarts exceeded, escalating to session recreation', {
        streamId,
        restarts: resilienceState.processRestarts
      });
      
      return this.handleSessionFailure(resilienceState, error);
    }

    // Start recovery process
    this.startRecovery(resilienceState, 'process_restart', error);

    resilienceState.processRestarts++;
    resilienceState.ffmpegRetries = 0; // Reset FFmpeg retries

    const backoffDelay = this.config.process.restartDelayMs * Math.pow(
      this.config.process.restartBackoffFactor,
      resilienceState.processRestarts - 1
    );

    logger.info('Attempting process restart', {
      streamId,
      attempt: resilienceState.processRestarts,
      backoffDelay,
      error: error.message
    });

    // Use buffered data during restart
    this.startBufferedPlayback(streamId);

    setTimeout(async () => {
      try {
        // Complete process restart
        await this.restartStreamProcess(resilienceState);
        
        logger.info('Process restart successful', {
          streamId,
          attempt: resilienceState.processRestarts
        });
      } catch (restartError) {
        logger.error('Process restart failed', {
          streamId,
          attempt: resilienceState.processRestarts,
          error: restartError.message
        });
        
        // Try again or escalate
        await this.handleProcessFailure(resilienceState, restartError);
      }
    }, backoffDelay);
  }

  /**
   * Handle session-level failures with recreation
   */
  async handleSessionFailure(resilienceState, error) {
    const { streamId } = resilienceState;

    if (resilienceState.sessionRecreations >= this.config.session.maxRecreateAttempts) {
      logger.error('Session max recreations exceeded, stream failed', {
        streamId,
        recreations: resilienceState.sessionRecreations
      });
      
      this.failStream(resilienceState, error);
      return;
    }

    // Start recovery process
    this.startRecovery(resilienceState, 'session_recreation', error);

    resilienceState.sessionRecreations++;
    resilienceState.processRestarts = 0; // Reset process restarts
    resilienceState.ffmpegRetries = 0;   // Reset FFmpeg retries

    const backoffDelay = this.config.session.recreateDelayMs * Math.pow(
      this.config.session.recreateBackoffFactor,
      resilienceState.sessionRecreations - 1
    );

    logger.info('Attempting session recreation', {
      streamId,
      attempt: resilienceState.sessionRecreations,
      backoffDelay,
      error: error.message
    });

    // Use buffered data during recreation
    this.startBufferedPlayback(streamId);

    setTimeout(async () => {
      try {
        // Complete session recreation
        await this.recreateStreamSession(resilienceState);
        
        logger.info('Session recreation successful', {
          streamId,
          attempt: resilienceState.sessionRecreations
        });
      } catch (recreateError) {
        logger.error('Session recreation failed', {
          streamId,
          attempt: resilienceState.sessionRecreations,
          error: recreateError.message
        });
        
        // Try again or fail completely
        await this.handleSessionFailure(resilienceState, recreateError);
      }
    }, backoffDelay);
  }

  /**
   * Start recovery process with buffered playback
   */
  startRecovery(resilienceState, layer, error) {
    const { streamId } = resilienceState;
    
    resilienceState.isRecovering = true;
    resilienceState.recoveryStartTime = Date.now();
    resilienceState.recoveryLayer = layer;
    resilienceState.isHealthy = false;

    logger.info('Starting stream recovery', {
      streamId,
      layer,
      error: error.message
    });

    this.emit('stream:recovery_started', {
      streamId,
      layer,
      error: error.message,
      timestamp: Date.now()
    });
  }

  /**
   * Complete recovery and return to normal streaming
   */
  completeRecovery(resilienceState) {
    const { streamId } = resilienceState;
    
    if (!resilienceState.isRecovering) return;

    const recoveryDuration = Date.now() - resilienceState.recoveryStartTime;
    
    resilienceState.isRecovering = false;
    resilienceState.recoveryStartTime = null;
    resilienceState.isHealthy = true;

    logger.info('Stream recovery completed', {
      streamId,
      layer: resilienceState.recoveryLayer,
      recoveryDuration
    });

    this.emit('stream:recovery_completed', {
      streamId,
      layer: resilienceState.recoveryLayer,
      recoveryDuration,
      timestamp: Date.now()
    });

    resilienceState.recoveryLayer = null;
  }

  /**
   * Start buffered playback during recovery
   */
  startBufferedPlayback(streamId) {
    const bufferManager = this.bufferManagers.get(streamId);
    const resilienceState = this.activeStreams.get(streamId);

    if (!bufferManager || !resilienceState || bufferManager.buffer.length === 0) {
      return;
    }

    logger.info('Starting buffered playback during recovery', {
      streamId,
      bufferSize: bufferManager.buffer.length
    });

    bufferManager.isBuffering = true;
    bufferManager.bufferStartTime = Date.now();

    // Stream buffer data to maintain playback
    const chunkSize = 8192; // 8KB chunks
    let offset = 0;

    const streamBufferChunk = () => {
      if (offset >= bufferManager.buffer.length || !bufferManager.isBuffering) {
        return;
      }

      const chunk = bufferManager.buffer.slice(offset, offset + chunkSize);
      if (resilienceState.outputStream.writable) {
        resilienceState.outputStream.write(chunk);
      }

      offset += chunkSize;

      // Continue streaming at appropriate rate
      setTimeout(streamBufferChunk, 100); // 100ms between chunks
    };

    streamBufferChunk();
  }

  /**
   * Stop buffered playback when recovery completes
   */
  stopBufferedPlayback(streamId) {
    const bufferManager = this.bufferManagers.get(streamId);
    if (bufferManager) {
      bufferManager.isBuffering = false;
      
      logger.info('Stopped buffered playback', { streamId });
    }
  }

  /**
   * Restart stream process completely
   */
  async restartStreamProcess(resilienceState) {
    // Clean up old process
    if (resilienceState.currentProcess) {
      resilienceState.currentProcess.kill('SIGKILL');
      resilienceState.currentProcess = null;
    }

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start fresh FFmpeg process
    await this.startFFmpegWithResilience(resilienceState);
  }

  /**
   * Recreate entire stream session
   */
  async recreateStreamSession(resilienceState) {
    const { streamId, streamUrl, options } = resilienceState;

    // Clean up current session
    this.stopStream(streamId, false);

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create new session
    const newOutputStream = await this.startResilientStream(streamId, streamUrl, options);
    
    // Update the output stream reference
    resilienceState.outputStream = newOutputStream;
  }

  /**
   * Prepare for recovery without starting it
   */
  prepareForRecovery(resilienceState, reason) {
    logger.debug('Preparing for potential recovery', {
      streamId: resilienceState.streamId,
      reason
    });

    // Pre-emptively start buffering more aggressively
    const bufferManager = this.bufferManagers.get(resilienceState.streamId);
    if (bufferManager) {
      // Increase buffer size temporarily
      bufferManager.maxBufferSize = this.config.buffer.maxBufferMs * 1500; // 50% increase
    }
  }

  /**
   * Fail stream completely after all recovery attempts
   */
  failStream(resilienceState, error) {
    const { streamId } = resilienceState;

    logger.error('Stream failed after all recovery attempts', {
      streamId,
      error: error.message,
      ffmpegRetries: resilienceState.ffmpegRetries,
      processRestarts: resilienceState.processRestarts,
      sessionRecreations: resilienceState.sessionRecreations
    });

    resilienceState.status = 'failed';
    
    this.emit('stream:failed', {
      streamId,
      error: error.message,
      timestamp: Date.now()
    });

    // Close output stream
    if (resilienceState.outputStream && !resilienceState.outputStream.destroyed) {
      resilienceState.outputStream.destroy(error);
    }
  }

  /**
   * Stop resilient stream
   */
  stopStream(streamId, cleanup = true) {
    const resilienceState = this.activeStreams.get(streamId);
    if (!resilienceState) return;

    logger.info('Stopping resilient stream', { streamId });

    resilienceState.status = 'stopped';

    // Stop current process
    if (resilienceState.currentProcess) {
      resilienceState.currentProcess.kill('SIGTERM');
      setTimeout(() => {
        if (resilienceState.currentProcess) {
          resilienceState.currentProcess.kill('SIGKILL');
        }
      }, 5000);
    }

    // Clean up watchdog
    const watchdog = this.processWatchdogs.get(streamId);
    if (watchdog) {
      clearInterval(watchdog);
      this.processWatchdogs.delete(streamId);
    }

    // Close streams
    if (resilienceState.outputStream && !resilienceState.outputStream.destroyed) {
      resilienceState.outputStream.end();
    }
    
    if (resilienceState.bufferStream && !resilienceState.bufferStream.destroyed) {
      resilienceState.bufferStream.end();
    }

    if (cleanup) {
      // Clean up tracking
      this.activeStreams.delete(streamId);
      this.bufferManagers.delete(streamId);
      this.retryConfigs.delete(streamId);
    }

    this.emit('stream:stopped', { streamId, timestamp: Date.now() });
  }

  /**
   * Get stream status and resilience metrics
   */
  getStreamStatus(streamId) {
    const resilienceState = this.activeStreams.get(streamId);
    if (!resilienceState) {
      return null;
    }

    const now = Date.now();
    const uptime = now - resilienceState.startTime;
    const timeSinceLastData = now - resilienceState.lastDataTime;

    return {
      streamId,
      status: resilienceState.status,
      isHealthy: resilienceState.isHealthy,
      isRecovering: resilienceState.isRecovering,
      recoveryLayer: resilienceState.recoveryLayer,
      
      // Uptime and activity
      uptime,
      timeSinceLastData,
      
      // Retry counts
      ffmpegRetries: resilienceState.ffmpegRetries,
      processRestarts: resilienceState.processRestarts,
      sessionRecreations: resilienceState.sessionRecreations,
      
      // Data metrics
      bytesProcessed: resilienceState.bytesProcessed,
      
      // Buffer status
      bufferStatus: this.getBufferStatus(streamId)
    };
  }

  /**
   * Get buffer manager status
   */
  getBufferStatus(streamId) {
    const bufferManager = this.bufferManagers.get(streamId);
    if (!bufferManager) {
      return null;
    }

    return {
      bufferSize: bufferManager.buffer.length,
      maxBufferSize: bufferManager.maxBufferSize,
      isBuffering: bufferManager.isBuffering,
      bufferUsagePercent: Math.round(
        (bufferManager.buffer.length / bufferManager.maxBufferSize) * 100
      )
    };
  }

  /**
   * Check if error text indicates H.264 corruption
   */
  isH264CorruptionError(errorText) {
    const h264CorruptionErrors = [
      'non-existing pps',
      'decode_slice_header error', 
      'no frame!',
      'pps 0 referenced',
      'sps 0 referenced',
      'mmco: unref short failure',
      'error while decoding mb',
      'concealing errors',
      'slice header damaged',
      'invalid nal unit',
      'corrupted frame',
      'reference picture missing',
      'decode error',
      'parser error'
    ];

    const lowerError = errorText.toLowerCase();
    return h264CorruptionErrors.some(error => lowerError.includes(error));
  }
  
  /**
   * Check if error text indicates a connection issue
   */
  isConnectionError(errorText) {
    const connectionErrors = [
      'connection refused',
      'connection timed out',
      'network unreachable',
      'host unreachable',
      'no route to host',
      'connection reset',
      'broken pipe',
      'end of file',
      'server returned 4',
      'server returned 5',
      'timeout',
      'would block'
    ];

    const lowerError = errorText.toLowerCase();
    return connectionErrors.some(error => lowerError.includes(error));
  }

  /**
   * Enhanced upstream session logging to track connection lifecycle
   */
  logUpstreamSessionEvents(streamId, errorText) {
    const lowerError = errorText.toLowerCase();
    
    // Log session opening events
    if (lowerError.includes('opening') || lowerError.includes('connected to') || 
        lowerError.includes('handshake') || lowerError.includes('stream found')) {
      logger.info('Upstream session opened', {
        streamId,
        event: 'upstream_session_open',
        details: errorText.trim(),
        timestamp: new Date().toISOString()
      });
    }
    
    // Log session closing events  
    if (lowerError.includes('closing') || lowerError.includes('disconnected') || 
        lowerError.includes('connection closed') || lowerError.includes('eof')) {
      logger.info('Upstream session closed', {
        streamId,
        event: 'upstream_session_close',
        details: errorText.trim(),
        timestamp: new Date().toISOString()
      });
    }
    
    // Log authentication events
    if (lowerError.includes('auth') || lowerError.includes('login') || 
        lowerError.includes('credentials') || lowerError.includes('unauthorized')) {
      logger.info('Upstream authentication event', {
        streamId,
        event: 'upstream_auth',
        details: errorText.trim(),
        timestamp: new Date().toISOString()
      });
    }
    
    // Log server response codes
    if (errorText.match(/4\d\d|5\d\d/)) {
      logger.warn('Upstream server error response', {
        streamId,
        event: 'upstream_server_error',
        details: errorText.trim(),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Check if error indicates upstream session termination (should reconnect, not fail)
   */
  isUpstreamSessionTermination(errorText) {
    const upstreamTerminationErrors = [
      'connection closed by server',
      'server disconnected', 
      'peer disconnected',
      'end of file',
      'eof',
      'connection reset by peer',
      'broken pipe',
      'server closed connection',
      'remote host closed connection',
      '403 forbidden',
      '404 not found', 
      '503 service unavailable',
      '502 bad gateway',
      'upstream connect error',
      'stream not found',
      'playlist not found',
      'segment not found'
    ];

    const lowerError = errorText.toLowerCase();
    return upstreamTerminationErrors.some(error => lowerError.includes(error));
  }

  /**
   * Handle upstream disconnection with immediate reconnection attempt
   */
  async handleUpstreamDisconnection(resilienceState, errorText) {
    const { streamId } = resilienceState;
    
    logger.info('Handling upstream disconnection - maintaining session continuity', {
      streamId,
      upstreamError: errorText.trim(),
      action: 'seamless_reconnection',
      retryAttempt: resilienceState.ffmpegRetries + 1
    });

    // Mark as recovering but don't change status to failed
    resilienceState.isRecovering = true;
    resilienceState.recoveryStartTime = Date.now();
    resilienceState.lastRecoveryReason = 'upstream_disconnection';

    // Emit recovery event
    this.emit('stream:recovery_started', {
      streamId,
      reason: 'upstream_disconnection',
      layer: 'seamless_reconnection',
      attempt: resilienceState.ffmpegRetries + 1
    });

    // Use shorter delay for upstream disconnections (they should reconnect quickly)
    const reconnectDelay = Math.min(1000, this.config.ffmpeg.reconnectDelayMs * Math.pow(this.config.ffmpeg.reconnectBackoffFactor, resilienceState.ffmpegRetries));
    
    setTimeout(async () => {
      // Only proceed if stream hasn't been stopped
      if (resilienceState.status === 'stopped') return;

      try {
        // Let FFmpeg handle the reconnection internally first
        // If that fails, the normal error handling will kick in
        logger.info('Upstream reconnection delay completed - relying on FFmpeg reconnection', {
          streamId,
          reconnectDelay,
          ffmpegRetries: resilienceState.ffmpegRetries
        });
        
        // Reset recovery state - FFmpeg should handle this internally
        this.completeRecovery(resilienceState);
        
      } catch (error) {
        logger.error('Failed to handle upstream disconnection', {
          streamId,
          error: error.message
        });
        
        // Fall back to normal FFmpeg failure handling
        await this.handleFFmpegFailure(resilienceState, error);
      }
    }, reconnectDelay);
  }

  /**
   * Get overall service statistics
   */
  getServiceStats() {
    const activeStreamsCount = this.activeStreams.size;
    const healthyStreamsCount = Array.from(this.activeStreams.values())
      .filter(state => state.isHealthy).length;
    const recoveringStreamsCount = Array.from(this.activeStreams.values())
      .filter(state => state.isRecovering).length;

    const totalRetries = Array.from(this.activeStreams.values())
      .reduce((sum, state) => sum + state.ffmpegRetries + state.processRestarts + state.sessionRecreations, 0);

    return {
      activeStreams: activeStreamsCount,
      healthyStreams: healthyStreamsCount,
      recoveringStreams: recoveringStreamsCount,
      totalRetries,
      
      // Service uptime
      serviceUptime: Date.now() - (this.serviceStartTime || Date.now()),
      
      // Configuration
      config: this.config
    };
  }
}

// Create singleton instance
const streamResilienceService = new StreamResilienceService();
streamResilienceService.serviceStartTime = Date.now();

module.exports = streamResilienceService;