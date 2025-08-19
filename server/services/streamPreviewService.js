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
      // Ensure database is initialized before querying
      if (!databaseService.isInitialized) {
        logger.info('Database not initialized, attempting initialization...');
        await databaseService.initialize();
      }

      if (!databaseService.db) {
        throw new Error('Database connection failed after initialization');
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

      // Check if this is a .ts file that needs conversion for browser compatibility
      const needsHLSConversion = this.needsHLSConversion(stream.url, streamFormat);
      
      // Determine if transcoding is needed (regular transcoding or .ts conversion)
      const needsTranscoding = this.shouldTranscode(streamFormat, transcode === 'true') || needsHLSConversion;
      
      if (needsTranscoding) {
        if (needsHLSConversion) {
          logger.stream('Triggering .ts to MP4 conversion for web browser compatibility', { 
            streamId, 
            url: stream.url,
            format: streamFormat 
          });
        }
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
    // CRITICAL: .ts files need transcoding for browser compatibility
    const needsTranscodingFormats = ['ts', 'mpegts', 'mts', 'rtsp', 'rtmp', 'udp', 'mms', 'srt'];
    return needsTranscodingFormats.includes(streamFormat);
  }

  // Check if stream needs HLS/MP4 conversion for web browser compatibility
  needsHLSConversion(streamUrl, streamFormat) {
    // Check for .ts file extension or MPEG-TS format
    const isTsFile = streamUrl.toLowerCase().includes('.ts') || 
                     streamUrl.toLowerCase().includes('.mts') ||
                     ['ts', 'mpegts', 'mts'].includes(streamFormat);
    
    logger.stream('HLS conversion check', { 
      url: streamUrl, 
      format: streamFormat, 
      needsConversion: isTsFile 
    });
    
    return isTsFile;
  }

  // Detect if the client is an external player (VLC, etc.) that needs proxying
  isExternalPlayer(userAgent) {
    if (!userAgent) return false;
    
    const externalPlayerIndicators = [
      'vlc', 'mpv', 'kodi', 'plex', 'jellyfin', 'emby',
      'libavformat', 'ffmpeg', 'gstreamer', 'mplayer',
      'potplayer', 'wmplayer', 'quicktime'
    ];
    
    const lowerUA = userAgent.toLowerCase();
    return externalPlayerIndicators.some(indicator => lowerUA.includes(indicator));
  }

  // Handle direct stream preview (no transcoding)
  async handleDirectPreview(stream, req, res) {
    try {
      const userAgent = req.get('User-Agent') || '';
      const isExternal = this.isExternalPlayer(userAgent);
      
      logger.stream('Handling direct stream preview', { 
        streamId: stream.id, 
        url: stream.url,
        type: stream.type,
        userAgent,
        isExternalPlayer: isExternal
      });

      // Set appropriate headers based on stream type
      this.setStreamHeaders(res, stream.type);

      // For HLS/DASH streams, always proxy through our backend to avoid CORS issues
      // Don't redirect directly as this can cause CORS problems
      if (['hls', 'dash'].includes(stream.type)) {
        return streamManager.proxyStream(stream.url, req, res);
      }
      
      // CRITICAL FIX: For external players (VLC, etc.), use simple HTTP proxy for basic streams
      // External players don't handle HTTP redirects well for streaming content
      if (isExternal && stream.type === 'http') {
        logger.stream('Using simple HTTP proxy for external player', { 
          streamId: stream.id,
          userAgent,
          streamType: stream.type
        });
        return this.simpleHttpProxy(stream.url, req, res);
      }
      
      // For browsers with direct HTTP video files, redirect only if not an external player
      if (stream.type === 'http' && (stream.url.includes('.mp4') || stream.url.includes('.webm')) && !isExternal) {
        logger.stream('Redirecting browser to direct video file', { 
          streamId: stream.id,
          url: stream.url
        });
        return res.redirect(stream.url);
      }

      // For other formats, use simple proxy if possible, otherwise fallback to redirect
      if (stream.type === 'http') {
        return this.simpleHttpProxy(stream.url, req, res);
      } else {
        // For non-HTTP streams, fallback to redirect for now
        logger.stream('Redirecting to stream URL for non-HTTP stream', { 
          streamId: stream.id,
          streamType: stream.type
        });
        return res.redirect(stream.url);
      }

    } catch (error) {
      logger.error('Direct preview error', { 
        streamId: stream.id, 
        error: error.message 
      });
      throw error;
    }
  }

  // Handle HLS conversion for .ts files
  async handleHLSConversion(stream, req, res) {
    const sessionId = `hls_${stream.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.stream('Starting HLS conversion for .ts stream', { 
        streamId: stream.id,
        sessionId,
        url: stream.url
      });

      // Create FFmpeg process to convert .ts to HLS
      const ffmpegPath = config.streams?.ffmpegPath || '/usr/bin/ffmpeg';
      
      // FFmpeg arguments for .ts to MP4 conversion with optimized streaming for browser compatibility
      const args = [
        '-i', stream.url,
        '-map', '0',                          // Map all input streams (video + audio)
        '-c:v', 'libx264',                    // H.264 codec for browser compatibility
        '-c:a', 'aac',                        // AAC audio codec for browser compatibility
        '-preset', 'ultrafast',               // Fastest encoding for real-time streaming
        '-profile:v', 'baseline',             // Baseline profile for maximum compatibility
        '-level', '3.1',                      // H.264 level for broad compatibility
        '-b:v', '2500k',                      // Video bitrate (2.5 Mbps)
        '-maxrate', '2500k',                  // Max bitrate
        '-bufsize', '5000k',                  // Buffer size (2x bitrate)
        '-b:a', '128k',                       // Audio bitrate
        '-ar', '48000',                       // Audio sample rate (48kHz for MPEG AAC compatibility)
        '-ac', '2',                           // Force stereo output (2 channels)
        '-g', '30',                           // GOP size (keyframe interval)
        '-force_key_frames', 'expr:gte(t,n_forced*2)', // Force keyframes every 2 seconds
        '-movflags', 'frag_keyframe+empty_moov+faststart', // MP4 streaming optimizations
        '-f', 'mp4',                          // Output as MP4 for browser compatibility
        '-fflags', '+genpts',                 // Generate presentation timestamps
        '-avoid_negative_ts', 'make_zero',    // Handle timestamp issues
        '-max_muxing_queue_size', '1024',     // Prevent buffer overflow
        '-threads', '2',                      // Limit CPU usage
        '-rtbufsize', '100M',                 // Real-time buffer size
        '-probesize', '10M',                  // Input probing size
        '-analyzeduration', '5000000',        // Analysis duration (5 seconds)
        '-strict', '-2',                      // Allow experimental AAC encoder if needed
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

      logger.stream('Creating FFmpeg HLS conversion process', { 
        sessionId,
        streamId: stream.id,
        command: `${ffmpegPath} ${args.join(' ')}`
      });

      const ffmpegProcess = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Verify process started successfully
      if (!ffmpegProcess.pid) {
        throw new Error('Failed to start FFmpeg HLS conversion process');
      }

      logger.stream('FFmpeg HLS conversion process started', { 
        sessionId,
        pid: ffmpegProcess.pid
      });

      // Track the conversion session
      this.activeTranscodes.set(sessionId, {
        process: ffmpegProcess,
        streamId: stream.id,
        startTime: Date.now(),
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        type: 'hls_conversion'
      });

      this.concurrencyCounter++;

      // Set response headers for MP4 streaming (MP4 format for browser compatibility)
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Accept-Ranges', 'bytes');

      // Pipe FFmpeg output to response
      ffmpegProcess.stdout.pipe(res);

      // Handle FFmpeg stderr (errors and info)
      let stderrBuffer = '';
      ffmpegProcess.stderr.on('data', (data) => {
        stderrBuffer += data.toString();
        const errorLines = data.toString().split('\n')
          .filter(line => line.includes('error') || line.includes('Error') || line.includes('ERROR'))
          .filter(line => line.trim().length > 0);
        
        if (errorLines.length > 0) {
          logger.error('FFmpeg HLS conversion errors', { sessionId, errors: errorLines });
        }
      });

      // Handle process completion
      ffmpegProcess.on('close', (code) => {
        logger.stream('HLS conversion process closed', { sessionId, exitCode: code });
        
        if (code !== 0) {
          logger.error('HLS conversion failed', { 
            sessionId, 
            exitCode: code,
            stderr: stderrBuffer.slice(-1000)
          });
        }
        
        this.cleanupTranscodingSession(sessionId, 'completed');
      });

      // Handle process errors
      ffmpegProcess.on('error', (error) => {
        logger.error('HLS conversion process error', { sessionId, error: error.message });
        this.cleanupTranscodingSession(sessionId, 'error');
        
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'HLS conversion failed',
            message: 'Failed to convert .ts stream to HLS format'
          });
        }
      });

      // Handle client disconnect
      req.on('close', () => {
        logger.stream('Client disconnected from HLS conversion session', { sessionId });
        this.cleanupTranscodingSession(sessionId, 'client_disconnect');
      });

      req.on('aborted', () => {
        logger.stream('Client aborted HLS conversion session', { sessionId });
        this.cleanupTranscodingSession(sessionId, 'client_abort');
      });

    } catch (error) {
      logger.error('HLS conversion setup error', { 
        streamId: stream.id,
        sessionId,
        error: error.message
      });
      
      this.cleanupTranscodingSession(sessionId, 'setup_error');
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
        logger.warn('FFmpeg not available, falling back to direct stream', { 
          streamId: stream.id,
          fallbackUrl: stream.url 
        });
        return await this.handleDirectPreview(stream, req, res);
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
      
      // If FFmpeg is not available, fallback to direct streaming
      if (error.message.includes('FFmpeg not found')) {
        logger.warn('FFmpeg not available, falling back to direct stream', { 
          streamId: stream.id,
          fallbackUrl: stream.url 
        });
        return await this.handleDirectPreview(stream, req, res);
      }
      
      throw error;
    }
  }

  // Check if FFmpeg is available
  async checkFFmpegAvailability(ffmpegPath) {
    return new Promise((resolve) => {
      const testProcess = spawn(ffmpegPath, ['-version'], { stdio: 'ignore' });
      testProcess.on('error', () => resolve(false));
      testProcess.on('close', (code) => resolve(code === 0));
    });
  }

  // Create FFmpeg transcoding process with enhanced configuration
  async createTranscodingProcess(stream, quality = 'medium', sessionId) {
    try {
      const qualityProfile = config.plexlive?.transcoding?.qualityProfiles?.[quality] || {
        resolution: '1280x720',
        bitrate: '2500k'
      };

      const ffmpegPath = config.streams?.ffmpegPath || '/usr/bin/ffmpeg';
      
      // Check if FFmpeg is available before attempting to use it
      const ffmpegAvailable = await this.checkFFmpegAvailability(ffmpegPath);
      if (!ffmpegAvailable) {
        logger.warn(`FFmpeg not found at ${ffmpegPath}. Transcoding not available.`);
        return null; // Signal that transcoding is not available
      }
      
      // Enhanced FFmpeg arguments for better compatibility and performance
      // CRITICAL FIX: Handle streams with/without audio properly
      const args = [
        '-i', stream.url,
        '-map', '0',                          // Map all input streams
        '-c:v', 'libx264',                    // H.264 video codec
        '-preset', 'veryfast',                // Fast encoding for real-time
        '-profile:v', 'baseline',             // Compatible H.264 profile
        '-level', '3.1',                      // H.264 level for broad compatibility
        '-s', qualityProfile.resolution,      // Video resolution
        '-b:v', qualityProfile.bitrate,       // Video bitrate
        '-maxrate', qualityProfile.bitrate,   // Max bitrate
        '-bufsize', `${parseInt(qualityProfile.bitrate) * 2}k`, // Buffer size
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

      // CRITICAL FIX: Conditionally handle audio based on stream content
      // Check if this is an HLS stream that likely has audio
      if (stream.type === 'hls' || stream.url.includes('.m3u8')) {
        // For HLS streams, expect audio and configure AAC codec
        args.splice(-8, 0, 
          '-c:a', 'aac',                      // AAC audio codec for HLS streams
          '-b:a', '128k',                     // Audio bitrate
          '-ar', '48000',                     // Audio sample rate (48kHz for MPEG AAC)
          '-ac', '2'                          // Stereo audio (2 channels)
        );
        logger.stream('Configured FFmpeg for HLS stream with audio', { 
          streamId: stream.id,
          audioCodec: 'aac',
          sampleRate: '48000Hz',
          channels: 'stereo'
        });
      } else {
        // For other streams, try to copy audio if present, skip if not
        args.splice(-8, 0,
          '-c:a', 'aac',                      // Convert any audio to AAC
          '-b:a', '128k',                     // Audio bitrate
          '-ar', '48000',                     // Audio sample rate
          '-ac', '2',                         // Stereo audio
          '-strict', '-2'                     // Allow experimental AAC encoder if needed
        );
        logger.stream('Configured FFmpeg with flexible audio handling', { 
          streamId: stream.id,
          audioCodec: 'aac_flexible'
        });
      }

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
      case 'mts':
        // CRITICAL FIX: Proper content type for Transport Stream files
        // When transcoded through proxy, these become MP4 streams
        res.setHeader('Content-Type', 'video/mp4');
        break;
      default:
        res.setHeader('Content-Type', 'video/mp4');
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Accept-Ranges', 'bytes');
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

  // Simple HTTP proxy for basic streams (VLC compatibility)
  async simpleHttpProxy(streamUrl, req, res) {
    const axios = require('axios');
    
    try {
      logger.stream('Creating simple HTTP proxy', { url: streamUrl });
      
      // Set streaming headers for compatibility
      res.set({
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes'
      });

      // Forward range requests for video seeking
      const headers = {
        'User-Agent': 'PlexBridge/1.0'
      };
      
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      // Create axios request with streaming response
      const response = await axios.get(streamUrl, {
        timeout: 30000,
        responseType: 'stream',
        headers
      });

      // Forward status code and headers from source
      res.status(response.status);
      
      if (response.headers['content-length']) {
        res.set('Content-Length', response.headers['content-length']);
      }
      
      if (response.headers['content-range']) {
        res.set('Content-Range', response.headers['content-range']);
      }
      
      if (response.headers['content-type']) {
        res.set('Content-Type', response.headers['content-type']);
      }

      // Pipe the response
      response.data.pipe(res);
      
      response.data.on('error', (error) => {
        logger.error('Simple HTTP proxy error', { url: streamUrl, error: error.message });
        if (!res.headersSent) {
          res.status(500).end();
        }
      });

      // Handle client disconnect
      req.on('close', () => {
        logger.stream('Client disconnected from simple HTTP proxy', { url: streamUrl });
        response.data.destroy();
      });

    } catch (error) {
      logger.error('Simple HTTP proxy failed', { url: streamUrl, error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'HTTP proxy failed',
          message: error.message
        });
      }
    }
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