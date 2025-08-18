const { spawn } = require('child_process');
const streamManager = require('./streamManager');
const databaseService = require('./database');
const logger = require('../utils/logger');
const config = require('../config');

class StreamPreviewService {
  constructor() {
    this.activeTranscodes = new Map(); // Track active transcoding processes
    this.concurrencyCounter = 0;
    this.maxConcurrentTranscodes = config.plexlive?.transcoding?.maxConcurrent || 3;
    this.transcodingQueue = [];
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleProcesses();
    }, 30000); // Clean up every 30 seconds
  }

  // Get stream from database with validation
  async getStreamById(streamId) {
    try {
      if (!databaseService.db || !databaseService.isInitialized) {
        throw new Error('Database not initialized');
      }

      const stream = await databaseService.get(
        'SELECT * FROM streams WHERE id = ? AND enabled = 1',
        [streamId]
      );

      if (!stream) {
        logger.warn('Stream not found in database', { streamId });
        return null;
      }

      // Parse JSON fields
      if (stream.headers) {
        try {
          stream.headers = JSON.parse(stream.headers);
        } catch (error) {
          logger.warn('Invalid headers JSON in stream', { streamId, error: error.message });
          stream.headers = {};
        }
      }

      if (stream.protocol_options) {
        try {
          stream.protocol_options = JSON.parse(stream.protocol_options);
        } catch (error) {
          logger.warn('Invalid protocol_options JSON in stream', { streamId, error: error.message });
          stream.protocol_options = {};
        }
      }

      if (stream.backup_urls) {
        try {
          stream.backup_urls = JSON.parse(stream.backup_urls);
        } catch (error) {
          logger.warn('Invalid backup_urls JSON in stream', { streamId, error: error.message });
          stream.backup_urls = [];
        }
      }

      return stream;
    } catch (error) {
      logger.error('Database error retrieving stream', { streamId, error: error.message });
      throw error;
    }
  }

  // Enhanced stream preview with database integration
  async handleStreamPreview(req, res) {
    const { streamId } = req.params;
    const { transcode, quality = 'medium', timeout = 30000 } = req.query;
    
    logger.stream('Stream preview requested', { 
      streamId, 
      transcode: transcode === 'true',
      quality,
      timeout,
      userAgent: req.get('User-Agent'),
      clientIP: req.ip
    });

    try {
      // Get stream from database
      const stream = await this.getStreamById(streamId);
      
      if (!stream) {
        return res.status(404).json({ 
          error: 'Stream not found',
          message: 'The requested stream does not exist or is disabled'
        });
      }

      if (!stream.url) {
        return res.status(400).json({ 
          error: 'Stream configuration invalid',
          message: 'Stream has no URL configured'
        });
      }

      // Validate stream URL format
      let streamUrl;
      try {
        streamUrl = new URL(stream.url);
      } catch (urlError) {
        logger.error('Invalid stream URL format', { streamId, url: stream.url, error: urlError.message });
        return res.status(400).json({ 
          error: 'Invalid stream URL format',
          message: 'The stream URL is not properly formatted'
        });
      }

      // Detect stream format if not specified
      let streamFormat = stream.type;
      if (!streamFormat || streamFormat === 'unknown') {
        const detection = await streamManager.detectStreamFormat(stream.url);
        streamFormat = detection.type;
        logger.stream('Stream format detected', { streamId, detectedFormat: streamFormat });
      }

      // Determine if transcoding is needed
      const needsTranscoding = this.shouldTranscode(streamFormat, transcode === 'true');
      
      if (needsTranscoding) {
        return await this.handleTranscodedPreview(stream, req, res, quality, parseInt(timeout));
      } else {
        return await this.handleDirectPreview(stream, req, res);
      }

    } catch (error) {
      logger.error('Stream preview error', { 
        streamId, 
        error: error.message,
        stack: error.stack
      });

      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Stream preview failed',
          message: 'An internal error occurred while processing the stream preview'
        });
      }
    }
  }

  // Determine if transcoding is required
  shouldTranscode(streamFormat, forceTranscode = false) {
    if (forceTranscode) return true;

    // Formats that typically need transcoding for web playback
    const needsTranscodingFormats = ['ts', 'mpegts', 'rtsp', 'rtmp', 'udp', 'mms', 'srt'];
    return needsTranscodingFormats.includes(streamFormat);
  }

  // Handle direct stream preview (no transcoding)
  async handleDirectPreview(stream, req, res) {
    try {
      logger.stream('Handling direct stream preview', { 
        streamId: stream.id, 
        url: stream.url,
        type: stream.type 
      });

      // Set appropriate headers based on stream type
      this.setStreamHeaders(res, stream.type);

      // For HLS/DASH streams, proxy through our backend to avoid CORS issues
      // Don't redirect directly as this can cause CORS problems
      if (['hls', 'dash'].includes(stream.type)) {
        return streamManager.proxyStream(stream.url, req, res);
      }
      
      // For direct HTTP video files, we can redirect if CORS allows
      if (stream.type === 'http' && (stream.url.includes('.mp4') || stream.url.includes('.webm'))) {
        return res.redirect(stream.url);
      }

      // For other formats, use stream manager for proxying
      const streamData = {
        url: stream.url,
        type: stream.type,
        auth: stream.auth_username ? {
          username: stream.auth_username,
          password: stream.auth_password
        } : null,
        headers: stream.headers || {}
      };

      return streamManager.createStreamProxy(stream.id, streamData, req, res);

    } catch (error) {
      logger.error('Direct preview error', { 
        streamId: stream.id, 
        error: error.message 
      });
      throw error;
    }
  }

  // Handle transcoded stream preview
  async handleTranscodedPreview(stream, req, res, quality, timeoutMs) {
    const sessionId = `transcode_${stream.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Check concurrency limits
      if (this.concurrencyCounter >= this.maxConcurrentTranscodes) {
        logger.warn('Transcoding concurrency limit reached', { 
          current: this.concurrencyCounter,
          limit: this.maxConcurrentTranscodes
        });
        return res.status(503).json({ 
          error: 'Service temporarily unavailable',
          message: 'Maximum concurrent transcoding sessions reached. Please try again later.',
          retryAfter: 30
        });
      }

      logger.stream('Starting transcoded preview', { 
        streamId: stream.id,
        sessionId,
        quality,
        timeout: timeoutMs
      });

      const ffmpegProcess = await this.createTranscodingProcess(stream, quality, sessionId);
      
      if (!ffmpegProcess) {
        return res.status(500).json({ 
          error: 'Transcoding initialization failed',
          message: 'Unable to start video transcoding process'
        });
      }

      // Track the transcoding session
      this.activeTranscodes.set(sessionId, {
        process: ffmpegProcess,
        streamId: stream.id,
        startTime: Date.now(),
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        quality,
        timeout: timeoutMs
      });

      this.concurrencyCounter++;

      // Set response headers for video streaming
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Set up timeout
      const timeoutId = setTimeout(() => {
        logger.warn('Transcoding session timeout', { sessionId, timeout: timeoutMs });
        this.cleanupTranscodingSession(sessionId, 'timeout');
        if (!res.headersSent) {
          res.status(408).json({ 
            error: 'Request timeout',
            message: 'Transcoding session timed out'
          });
        }
      }, timeoutMs);

      // Pipe FFmpeg output to response
      ffmpegProcess.stdout.pipe(res);

      // Handle FFmpeg stderr (errors and info)
      let stderrBuffer = '';
      ffmpegProcess.stderr.on('data', (data) => {
        stderrBuffer += data.toString();
        // Log only error messages, not progress info
        const errorLines = data.toString().split('\n')
          .filter(line => line.includes('error') || line.includes('Error') || line.includes('ERROR'))
          .filter(line => line.trim().length > 0);
        
        if (errorLines.length > 0) {
          logger.error('FFmpeg errors', { sessionId, errors: errorLines });
        }
      });

      // Handle process completion
      ffmpegProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        logger.stream('Transcoding process closed', { sessionId, exitCode: code });
        
        if (code !== 0) {
          logger.error('Transcoding failed', { 
            sessionId, 
            exitCode: code,
            stderr: stderrBuffer.slice(-1000) // Last 1000 chars
          });
        }
        
        this.cleanupTranscodingSession(sessionId, 'completed');
      });

      // Handle process errors
      ffmpegProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        logger.error('Transcoding process error', { sessionId, error: error.message });
        this.cleanupTranscodingSession(sessionId, 'error');
        
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Transcoding failed',
            message: 'Video transcoding process encountered an error'
          });
        }
      });

      // Handle client disconnect
      req.on('close', () => {
        clearTimeout(timeoutId);
        logger.stream('Client disconnected from transcoding session', { sessionId });
        this.cleanupTranscodingSession(sessionId, 'client_disconnect');
      });

      req.on('aborted', () => {
        clearTimeout(timeoutId);
        logger.stream('Client aborted transcoding session', { sessionId });
        this.cleanupTranscodingSession(sessionId, 'client_abort');
      });

    } catch (error) {
      logger.error('Transcoded preview setup error', { 
        streamId: stream.id,
        sessionId,
        error: error.message
      });
      
      this.cleanupTranscodingSession(sessionId, 'setup_error');
      throw error;
    }
  }

  // Create FFmpeg transcoding process with enhanced configuration
  async createTranscodingProcess(stream, quality = 'medium', sessionId) {
    try {
      const qualityProfile = config.plexlive?.transcoding?.qualityProfiles?.[quality] || {
        resolution: '1280x720',
        bitrate: '2500k'
      };

      const ffmpegPath = config.streams?.ffmpegPath || '/usr/bin/ffmpeg';
      
      // Enhanced FFmpeg arguments for better compatibility and performance
      const args = [
        '-i', stream.url,
        '-c:v', 'libx264',                    // H.264 video codec
        '-c:a', 'aac',                        // AAC audio codec  
        '-preset', 'veryfast',                // Fast encoding for real-time
        '-profile:v', 'baseline',             // Compatible H.264 profile
        '-level', '3.1',                      // H.264 level for broad compatibility
        '-s', qualityProfile.resolution,      // Video resolution
        '-b:v', qualityProfile.bitrate,       // Video bitrate
        '-maxrate', qualityProfile.bitrate,   // Max bitrate
        '-bufsize', `${parseInt(qualityProfile.bitrate) * 2}k`, // Buffer size
        '-b:a', '128k',                       // Audio bitrate
        '-ar', '48000',                       // Audio sample rate
        '-movflags', 'frag_keyframe+empty_moov+faststart', // Web streaming optimizations
        '-f', 'mp4',                          // MP4 container
        '-fflags', '+genpts',                 // Generate presentation timestamps
        '-avoid_negative_ts', 'make_zero',    // Handle timestamp issues
        '-max_muxing_queue_size', '1024',     // Prevent buffer overflow
        '-threads', '2',                      // Limit CPU usage
        '-rtbufsize', '100M',                 // Real-time buffer size
        '-probesize', '10M',                  // Input probing size
        '-analyzeduration', '5000000',        // Analysis duration (5 seconds)
        '-loglevel', 'error',                 // Reduce log verbosity
        '-nostats',                           // Disable statistics output
        'pipe:1'                              // Output to stdout
      ];

      // Add authentication if required
      if (stream.auth_username && stream.auth_password) {
        const authString = `${stream.auth_username}:${stream.auth_password}`;
        const authHeader = `Authorization: Basic ${Buffer.from(authString).toString('base64')}`;
        args.splice(1, 0, '-headers', authHeader);
      }

      // Add custom headers if specified
      if (stream.headers && Object.keys(stream.headers).length > 0) {
        const headersString = Object.entries(stream.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\r\n');
        args.splice(-1, 0, '-headers', headersString);
      }

      // Add protocol-specific options
      if (stream.type === 'rtsp') {
        args.splice(1, 0, 
          '-rtsp_transport', config.protocols?.rtsp?.transport || 'tcp',
          '-rtsp_flags', 'prefer_tcp'
        );
      }

      logger.stream('Creating FFmpeg transcoding process', { 
        sessionId,
        streamId: stream.id,
        quality,
        args: args.join(' ')
      });

      const ffmpegProcess = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Verify process started successfully
      if (!ffmpegProcess.pid) {
        throw new Error('Failed to start FFmpeg process');
      }

      logger.stream('FFmpeg transcoding process started', { 
        sessionId,
        pid: ffmpegProcess.pid
      });

      return ffmpegProcess;

    } catch (error) {
      logger.error('Failed to create transcoding process', { 
        sessionId,
        streamId: stream.id,
        error: error.message
      });
      return null;
    }
  }

  // Set appropriate response headers based on stream type
  setStreamHeaders(res, streamType) {
    switch (streamType) {
      case 'hls':
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        break;
      case 'dash':
        res.setHeader('Content-Type', 'application/dash+xml');
        break;
      case 'ts':
      case 'mpegts':
        res.setHeader('Content-Type', 'video/mp2t');
        break;
      default:
        res.setHeader('Content-Type', 'video/mp4');
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Cache-Control', 'no-cache');
  }

  // Cleanup transcoding session
  cleanupTranscodingSession(sessionId, reason = 'manual') {
    const session = this.activeTranscodes.get(sessionId);
    
    if (session) {
      logger.stream('Cleaning up transcoding session', { 
        sessionId, 
        reason,
        duration: Date.now() - session.startTime
      });

      // Kill FFmpeg process gracefully
      if (session.process && !session.process.killed) {
        try {
          session.process.kill('SIGTERM');
          
          // Force kill after 5 seconds if still running
          setTimeout(() => {
            if (!session.process.killed) {
              logger.warn('Force killing transcoding process', { sessionId });
              session.process.kill('SIGKILL');
            }
          }, 5000);
        } catch (error) {
          logger.error('Error killing transcoding process', { 
            sessionId, 
            error: error.message 
          });
        }
      }

      this.activeTranscodes.delete(sessionId);
      this.concurrencyCounter = Math.max(0, this.concurrencyCounter - 1);
    }
  }

  // Cleanup stale transcoding processes
  cleanupStaleProcesses() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [sessionId, session] of this.activeTranscodes) {
      if (now - session.startTime > maxAge) {
        logger.warn('Cleaning up stale transcoding session', { 
          sessionId,
          age: now - session.startTime
        });
        this.cleanupTranscodingSession(sessionId, 'stale');
      }
    }
  }

  // Get active transcoding sessions status
  getTranscodingStatus() {
    const sessions = [];
    for (const [sessionId, session] of this.activeTranscodes) {
      sessions.push({
        sessionId,
        streamId: session.streamId,
        startTime: session.startTime,
        duration: Date.now() - session.startTime,
        clientIP: session.clientIP,
        userAgent: session.userAgent,
        quality: session.quality,
        pid: session.process?.pid
      });
    }

    return {
      activeSessions: sessions.length,
      maxConcurrent: this.maxConcurrentTranscodes,
      utilizationPercentage: Math.round((sessions.length / this.maxConcurrentTranscodes) * 100),
      sessions
    };
  }

  // Graceful shutdown
  async shutdown() {
    logger.info('Shutting down stream preview service');
    
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Cleanup all active transcoding sessions
    const sessionIds = Array.from(this.activeTranscodes.keys());
    for (const sessionId of sessionIds) {
      this.cleanupTranscodingSession(sessionId, 'shutdown');
    }

    // Wait for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Create singleton instance
const streamPreviewService = new StreamPreviewService();

// Handle graceful shutdown
process.on('SIGTERM', () => streamPreviewService.shutdown());
process.on('SIGINT', () => streamPreviewService.shutdown());

module.exports = streamPreviewService;