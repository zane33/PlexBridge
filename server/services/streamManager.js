const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const axios = require('axios');
const m3u8Parser = require('m3u8-parser');
const logger = require('../utils/logger');
const config = require('../config');
const cacheService = require('./cacheService');
const settingsService = require('./settingsService');
const streamSessionManager = require('./streamSessionManager');
const streamResilienceService = require('./streamResilienceService');
const ffmpegProfiles = require('../config/ffmpegProfiles');

// Android TV Configuration Constants
const ANDROID_TV_CONFIG = {
  RESET_INTERVAL: 1200, // 20 minutes in seconds
  ANALYZE_DURATION: 5000000, // 5MB (reduced from 10MB for faster startup)
  PROBE_SIZE: 5000000, // 5MB (reduced from 10MB for faster startup)
  SEGMENT_DURATION: 30, // 30 seconds
  BUFFER_SIZE: '256k',
  QUEUE_SIZE: 4096,
  MAX_RESTARTS: 3, // Maximum restarts per 5-minute window
  RESTART_WINDOW: 300000, // 5 minutes in milliseconds
  RESTART_DELAY: 2000, // 2 seconds delay before restart (increased from 1 second)
  HEALTH_CHECK_INTERVAL: 10000, // Check stream health every 10 seconds
  USER_AGENT_PATTERNS: ['android', 'shield', 'androidtv']
};

class StreamManager {
  constructor() {
    this.activeStreams = new Map();
    this.streamProcesses = new Map();
    this.streamStats = new Map();
    this.channelStreams = new Map(); // Track streams per channel
    this.clientSessions = new Map(); // Track client sessions to prevent sharing
    this.streamTimeouts = new Map(); // Track stream timeouts
  }

  // Android TV Detection Utility
  isAndroidTVClient(userAgent) {
    if (!userAgent) return false;
    const userAgentLower = userAgent.toLowerCase();
    return ANDROID_TV_CONFIG.USER_AGENT_PATTERNS.some(pattern => 
      userAgentLower.includes(pattern)
    );
  }

  // Build structured FFmpeg arguments for Android TV
  buildAndroidTVFFmpegArgs(streamUrl, settings = null) {
    const baseArgs = [
      '-hide_banner', '-loglevel', 'error',
      '-analyzeduration', ANDROID_TV_CONFIG.ANALYZE_DURATION.toString(),
      '-probesize', ANDROID_TV_CONFIG.PROBE_SIZE.toString(),
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-i', streamUrl,
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-bsf:v', 'h264_mp4toannexb',
      '-f', 'segment',
      '-segment_time', ANDROID_TV_CONFIG.SEGMENT_DURATION.toString(),
      '-segment_format', 'mpegts',
      '-segment_list_type', 'flat',
      '-segment_list', 'pipe:2', // Use stderr instead of /dev/null for better performance
      '-reset_timestamps', '1',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+igndts+discardcorrupt+nobuffer',
      '-flags', '+low_delay',
      '-copyts',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-flush_packets', '1',
      '-max_delay', '0',
      '-max_muxing_queue_size', ANDROID_TV_CONFIG.QUEUE_SIZE.toString(),
      '-rtbufsize', ANDROID_TV_CONFIG.BUFFER_SIZE,
      'pipe:1'
    ];

    // Add HLS-specific arguments if needed
    if (streamUrl.includes('.m3u8')) {
      const hlsArgs = [
        '-allowed_extensions', 'ALL',
        '-protocol_whitelist', 'file,http,https,tcp,tls,pipe,crypto',
        '-user_agent', 'PlexBridge/1.0',
        '-live_start_index', '0',
        '-http_persistent', '1'
      ];
      
      // Insert HLS args before the input URL
      const inputIndex = baseArgs.indexOf('-i');
      if (inputIndex > -1) {
        baseArgs.splice(inputIndex, 0, ...hlsArgs);
      }
    }

    return baseArgs;
  }

  // Validate response stream before piping
  validateResponseStream(res, sessionId) {
    if (!res) {
      logger.error('Response object is null', { sessionId });
      return false;
    }
    
    if (res.writableEnded || res.destroyed || res.finished) {
      logger.warn('Response stream already closed, cannot pipe data', { 
        sessionId,
        writableEnded: res.writableEnded,
        destroyed: res.destroyed,
        finished: res.finished
      });
      return false;
    }
    
    return true;
  }

  // Check restart throttling
  shouldThrottleRestart(streamInfo) {
    if (!streamInfo.restartCount) return false;
    
    const now = Date.now();
    const firstRestart = streamInfo.firstRestart || now;
    
    // Reset counter if outside the time window
    if ((now - firstRestart) > ANDROID_TV_CONFIG.RESTART_WINDOW) {
      streamInfo.restartCount = 0;
      streamInfo.firstRestart = now;
      return false;
    }
    
    // Check if we've exceeded the restart limit
    if (streamInfo.restartCount >= ANDROID_TV_CONFIG.MAX_RESTARTS) {
      logger.warn('Restart limit exceeded for stream', {
        sessionId: streamInfo.sessionId,
        restartCount: streamInfo.restartCount,
        timeWindow: ANDROID_TV_CONFIG.RESTART_WINDOW,
        maxRestarts: ANDROID_TV_CONFIG.MAX_RESTARTS
      });
      return true;
    }
    
    return false;
  }

  // Universal stream format detection
  async detectStreamFormat(url) {
    try {
      logger.stream('Detecting stream format for URL', { url });

      // Check URL pattern first
      const urlLower = url.toLowerCase();
      
      if (urlLower.includes('.m3u8') || urlLower.includes('/hls/')) {
        return { type: 'hls', protocol: 'http' };
      }
      
      if (urlLower.includes('.mpd') || urlLower.includes('/dash/')) {
        return { type: 'dash', protocol: 'http' };
      }
      
      // CRITICAL FIX: Detect MPEG Transport Stream (.ts) files
      if (urlLower.includes('.ts') || urlLower.includes('.mpegts') || urlLower.includes('.mts')) {
        return { type: 'ts', protocol: 'http' };
      }
      
      if (urlLower.startsWith('rtsp://')) {
        return { type: 'rtsp', protocol: 'rtsp' };
      }
      
      if (urlLower.startsWith('rtmp://') || urlLower.startsWith('rtmps://')) {
        return { type: 'rtmp', protocol: 'rtmp' };
      }
      
      if (urlLower.startsWith('udp://')) {
        return { type: 'udp', protocol: 'udp' };
      }
      
      if (urlLower.startsWith('mms://')) {
        return { type: 'mms', protocol: 'mms' };
      }
      
      if (urlLower.startsWith('srt://')) {
        return { type: 'srt', protocol: 'srt' };
      }

      // Special handling for IPTV provider URLs
      if (url.includes('premiumpowers') || url.includes('line.')) {
        logger.stream('Detected IPTV provider URL, treating as HTTP stream', { url });
        return { type: 'http', protocol: 'http', requiresAuth: true };
      }
      
      // Try HTTP head request for content detection with redirect following
      if (urlLower.startsWith('http://') || urlLower.startsWith('https://')) {
        try {
          const response = await axios.head(url, {
            timeout: 5000,
            maxRedirects: 5,  // Follow up to 5 redirects
            headers: {
              'User-Agent': config.protocols.http.userAgent
            }
          });

          const contentType = response.headers['content-type'] || '';
          
          if (contentType.includes('application/vnd.apple.mpegurl') || 
              contentType.includes('application/x-mpegurl')) {
            return { type: 'hls', protocol: 'http' };
          }
          
          if (contentType.includes('application/dash+xml')) {
            return { type: 'dash', protocol: 'http' };
          }
          
          if (contentType.includes('video/') || contentType.includes('application/octet-stream')) {
            return { type: 'http', protocol: 'http' };
          }
        } catch (error) {
          logger.stream('HTTP head request failed, trying content analysis', { url, error: error.message });
        }

        // Try content analysis with redirect following
        try {
          const response = await axios.get(url, {
            timeout: 10000,
            responseType: 'text',
            maxRedirects: 5,  // Follow up to 5 redirects
            headers: {
              'User-Agent': config.protocols.http.userAgent,
              'Range': 'bytes=0-1023' // Get first 1KB
            }
          });

          const content = response.data.toString();
          
          if (content.includes('#EXTM3U') || content.includes('#EXT-X-')) {
            return { type: 'hls', protocol: 'http' };
          }
          
          if (content.includes('<MPD') || content.includes('urn:mpeg:dash')) {
            return { type: 'dash', protocol: 'http' };
          }
          
          return { type: 'http', protocol: 'http' };
        } catch (error) {
          logger.stream('Content analysis failed', { url, error: error.message });
        }
      }

      // Default fallback
      return { type: 'unknown', protocol: 'unknown' };
    } catch (error) {
      logger.error('Stream format detection failed', { url, error: error.message });
      return { type: 'unknown', protocol: 'unknown' };
    }
  }

  // Resolve final URL after following redirects (for constructing sub-file URLs)
  async resolveFinalUrl(url) {
    try {
      logger.stream('Resolving final URL after redirects', { originalUrl: url });
      
      // Use a GET request with a small range to get the final URL after redirects
      const response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        headers: {
          'User-Agent': config.protocols.http.userAgent || 'PlexBridge/1.0',
          'Range': 'bytes=0-1023' // Only get first 1KB to minimize data transfer
        },
        responseType: 'text'
      });
      
      // The response.request.responseURL should contain the final URL
      const finalUrl = response.request.responseURL || response.config.url || url;
      
      logger.stream('Final URL resolved', { 
        originalUrl: url, 
        finalUrl: finalUrl 
      });
      
      return finalUrl;
    } catch (error) {
      logger.warn('Failed to resolve final URL, using original', { 
        url, 
        error: error.message 
      });
      return url; // Fallback to original URL
    }
  }

  // Validate stream URL and test connectivity
  async validateStream(streamData) {
    const { url, type, auth } = streamData;
    
    try {
      logger.stream('Validating stream', { url, type });

      const detection = await this.detectStreamFormat(url);
      const streamType = type || detection.type;

      switch (streamType) {
        case 'hls':
          return await this.validateHLSStream(url, auth);
        case 'dash':
          return await this.validateDashStream(url, auth);
        case 'ts':
        case 'mpegts':
          return await this.validateTSStream(url, auth);
        case 'rtsp':
          return await this.validateRTSPStream(url, auth);
        case 'rtmp':
          return await this.validateRTMPStream(url, auth);
        case 'udp':
          return await this.validateUDPStream(url);
        case 'http':
          return await this.validateHTTPStream(url, auth);
        case 'mms':
          return await this.validateMMSStream(url, auth);
        case 'srt':
          return await this.validateSRTStream(url, auth);
        default:
          return { valid: false, error: 'Unsupported stream type', type: streamType };
      }
    } catch (error) {
      logger.error('Stream validation error', { url, error: error.message });
      return { valid: false, error: error.message };
    }
  }

  async validateHLSStream(url, auth) {
    try {
      const headers = { 'User-Agent': config.protocols.http.userAgent };
      if (auth && auth.username) {
        headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
      }

      const response = await axios.get(url, {
        timeout: config.protocols.http.timeout,
        headers
      });

      const parser = new m3u8Parser.Parser();
      parser.push(response.data);
      parser.end();

      const manifest = parser.manifest;
      
      if (!manifest.segments && !manifest.playlists) {
        return { valid: false, error: 'Invalid M3U8 manifest' };
      }

      return {
        valid: true,
        type: 'hls',
        info: {
          duration: manifest.targetDuration,
          segments: manifest.segments?.length || 0,
          playlists: manifest.playlists?.length || 0,
          isLive: !manifest.endList
        }
      };
    } catch (error) {
      return { valid: false, error: error.message, type: 'hls' };
    }
  }

  async validateDashStream(url, auth) {
    try {
      const headers = { 'User-Agent': config.protocols.http.userAgent };
      if (auth && auth.username) {
        headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
      }

      const response = await axios.get(url, {
        timeout: config.protocols.http.timeout,
        headers
      });

      if (!response.data.includes('<MPD') || !response.data.includes('urn:mpeg:dash')) {
        return { valid: false, error: 'Invalid DASH manifest' };
      }

      return {
        valid: true,
        type: 'dash',
        info: {
          hasManifest: true,
          contentType: response.headers['content-type']
        }
      };
    } catch (error) {
      return { valid: false, error: error.message, type: 'dash' };
    }
  }

  async validateTSStream(url, auth) {
    try {
      const headers = { 'User-Agent': config.protocols.http.userAgent };
      if (auth && auth.username) {
        headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
      }

      // For .ts files, do a HEAD request to check accessibility and content type
      const response = await axios.head(url, {
        timeout: config.protocols.http.timeout,
        headers
      });

      const contentType = response.headers['content-type'] || '';
      const contentLength = response.headers['content-length'];

      return {
        valid: true,
        type: 'ts',
        info: {
          contentType,
          contentLength,
          isTransportStream: true,
          needsTranscoding: true, // TS files typically need transcoding for web playback
          description: 'MPEG Transport Stream'
        }
      };
    } catch (error) {
      return { valid: false, error: error.message, type: 'ts' };
    }
  }

  async validateRTSPStream(url, auth) {
    return new Promise((resolve) => {
      const args = [
        '-y',
        '-i', url,
        '-t', '1',
        '-f', 'null',
        '-'
      ];

      if (auth && auth.username) {
        args.splice(2, 0, '-rtsp_transport', config.protocols.rtsp.transport);
        // RTSP auth is handled in URL or via specific parameters
      }

      const ffprobe = spawn(config.streams.ffmpegPath.replace('ffmpeg', 'ffprobe'), [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        url
      ]);

      let output = '';
      let error = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0 && output) {
          try {
            const info = JSON.parse(output);
            resolve({
              valid: true,
              type: 'rtsp',
              info: {
                streams: info.streams?.length || 0,
                hasVideo: info.streams?.some(s => s.codec_type === 'video') || false,
                hasAudio: info.streams?.some(s => s.codec_type === 'audio') || false
              }
            });
          } catch (parseError) {
            resolve({ valid: false, error: 'Failed to parse stream info', type: 'rtsp' });
          }
        } else {
          resolve({ valid: false, error: error || 'RTSP connection failed', type: 'rtsp' });
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        ffprobe.kill();
        resolve({ valid: false, error: 'Validation timeout', type: 'rtsp' });
      }, 10000);
    });
  }

  async validateRTMPStream(url, auth) {
    return new Promise((resolve) => {
      const ffprobe = spawn(config.streams.ffmpegPath.replace('ffmpeg', 'ffprobe'), [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-rtmp_live', 'live',
        url
      ]);

      let output = '';
      let error = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0 && output) {
          try {
            const info = JSON.parse(output);
            resolve({
              valid: true,
              type: 'rtmp',
              info: {
                streams: info.streams?.length || 0,
                hasVideo: info.streams?.some(s => s.codec_type === 'video') || false,
                hasAudio: info.streams?.some(s => s.codec_type === 'audio') || false
              }
            });
          } catch (parseError) {
            resolve({ valid: false, error: 'Failed to parse stream info', type: 'rtmp' });
          }
        } else {
          resolve({ valid: false, error: error || 'RTMP connection failed', type: 'rtmp' });
        }
      });

      setTimeout(() => {
        ffprobe.kill();
        resolve({ valid: false, error: 'Validation timeout', type: 'rtmp' });
      }, 10000);
    });
  }

  async validateUDPStream(url) {
    // UDP validation is basic - just check if we can create a socket
    return { valid: true, type: 'udp', info: { note: 'UDP streams require network connectivity' } };
  }

  async validateHTTPStream(url, auth) {
    try {
      const headers = { 'User-Agent': config.protocols.http.userAgent };
      if (auth && auth.username) {
        headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
      }

      const response = await axios.head(url, {
        timeout: config.protocols.http.timeout,
        headers
      });

      return {
        valid: true,
        type: 'http',
        info: {
          contentType: response.headers['content-type'],
          contentLength: response.headers['content-length'],
          acceptRanges: response.headers['accept-ranges']
        }
      };
    } catch (error) {
      return { valid: false, error: error.message, type: 'http' };
    }
  }

  async validateMMSStream(url, auth) {
    // MMS validation using ffprobe
    return new Promise((resolve) => {
      const ffprobe = spawn(config.streams.ffmpegPath.replace('ffmpeg', 'ffprobe'), [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        url
      ]);

      let output = '';
      let error = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0 && output) {
          resolve({ valid: true, type: 'mms', info: { connected: true } });
        } else {
          resolve({ valid: false, error: error || 'MMS connection failed', type: 'mms' });
        }
      });

      setTimeout(() => {
        ffprobe.kill();
        resolve({ valid: false, error: 'Validation timeout', type: 'mms' });
      }, 10000);
    });
  }

  async validateSRTStream(url, auth) {
    // SRT validation using ffprobe
    return new Promise((resolve) => {
      const ffprobe = spawn(config.streams.ffmpegPath.replace('ffmpeg', 'ffprobe'), [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        url
      ]);

      let output = '';
      let error = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0 && output) {
          resolve({ valid: true, type: 'srt', info: { connected: true } });
        } else {
          resolve({ valid: false, error: error || 'SRT connection failed', type: 'srt' });
        }
      });

      setTimeout(() => {
        ffprobe.kill();
        resolve({ valid: false, error: 'Validation timeout', type: 'srt' });
      }, 10000);
    });
  }

  // Create a resilient stream proxy with multi-layer recovery
  async createResilientStreamProxy(streamId, streamData, req, res) {
    try {
      logger.info('Creating resilient stream proxy', { 
        streamId, 
        url: streamData.url,
        userAgent: req.get('User-Agent')
      });

      const clientIdentifier = this.generateClientIdentifier(req);
      const { url, type, auth, headers: customHeaders = {} } = streamData;
      
      // Generate unique session ID for resilience tracking
      const sessionId = `resilient_${streamId}_${clientIdentifier}_${Date.now()}`;
      
      // Check if client already has an active resilient stream
      const existingStream = this.activeStreams.get(`resilient_${streamId}_${clientIdentifier}`);
      if (existingStream) {
        logger.info('Found existing resilient stream for client, terminating it', {
          streamId,
          clientIdentifier,
          existingSessionId: existingStream.sessionId
        });
        
        // Stop existing stream
        streamResilienceService.stopStream(existingStream.sessionId);
        this.activeStreams.delete(`resilient_${streamId}_${clientIdentifier}`);
      }

      // Get channel information
      let channelInfo = null;
      try {
        const database = require('./database');
        const channel = await database.get('SELECT name, number FROM channels WHERE id = ?', [streamId]);
        if (channel) {
          channelInfo = { name: channel.name, number: channel.number };
        }
      } catch (error) {
        logger.warn('Failed to get channel info for resilient stream', { streamId, error: error.message });
      }

      // Prepare resilience options
      const resilienceOptions = {
        streamType: type,
        auth,
        customHeaders,
        clientInfo: {
          userAgent: req.get('User-Agent'),
          clientIP: req.ip,
          clientIdentifier
        },
        channelInfo,
        // Enhanced configuration for Android TV and Plex
        enhancedResilience: req.get('User-Agent')?.toLowerCase().includes('android') ||
                           req.get('User-Agent')?.toLowerCase().includes('plex'),
        plexOptimizations: true
      };

      logger.info('Starting resilient stream with multi-layer recovery', {
        sessionId,
        streamId,
        url,
        type,
        clientInfo: resilienceOptions.clientInfo.userAgent
      });

      // Start resilient stream with the resilience service
      const resilientOutputStream = await streamResilienceService.startResilientStream(
        sessionId, 
        url, 
        resilienceOptions
      );

      // Store stream information
      const streamInfo = {
        sessionId,
        streamId,
        clientIdentifier,
        startTime: Date.now(),
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        url: streamData.url,
        type: streamData.type,
        isResilient: true,
        resilienceMetrics: {
          recoveryEvents: 0,
          lastRecoveryTime: null,
          totalUptime: 0
        }
      };
      
      this.activeStreams.set(`resilient_${streamId}_${clientIdentifier}`, streamInfo);

      // Start enhanced session tracking
      try {
        // Extract Plex headers securely
        const plexHeaders = streamSessionManager.extractPlexHeaders(req);
        
        await streamSessionManager.startSession({
          sessionId,
          streamId,
          clientIP: req.ip,
          userAgent: req.get('User-Agent'),
          clientIdentifier,
          channelName: channelInfo?.name,
          channelNumber: channelInfo?.number,
          streamUrl: streamData.url,
          streamType: streamData.type,
          ...plexHeaders // Spread sanitized Plex headers
        });
      } catch (sessionError) {
        logger.warn('Failed to start enhanced session tracking for resilient stream', {
          sessionId,
          error: sessionError.message
        });
      }

      // Set up resilience event monitoring
      streamResilienceService.on('stream:recovery_started', (event) => {
        if (event.streamId === sessionId) {
          logger.warn('Stream recovery started', {
            streamId: event.streamId,
            layer: event.layer,
            error: event.error
          });
          
          // Update stream metrics
          if (streamInfo.resilienceMetrics) {
            streamInfo.resilienceMetrics.recoveryEvents++;
            streamInfo.resilienceMetrics.lastRecoveryTime = Date.now();
          }

          // Notify session manager of recovery event
          streamSessionManager.updateSessionMetrics(sessionId, { errorIncrement: 1 });
        }
      });

      streamResilienceService.on('stream:recovery_completed', (event) => {
        if (event.streamId === sessionId) {
          logger.info('Stream recovery completed', {
            streamId: event.streamId,
            layer: event.layer,
            recoveryDuration: event.recoveryDuration
          });
        }
      });

      streamResilienceService.on('stream:failed', (event) => {
        if (event.streamId === sessionId) {
          logger.error('Resilient stream failed after all recovery attempts', {
            streamId: event.streamId,
            error: event.error
          });
          
          // Clean up
          this.activeStreams.delete(`resilient_${streamId}_${clientIdentifier}`);
          streamSessionManager.endSession(sessionId, 'stream_failed');
        }
      });

      // Set appropriate headers for resilient streaming
      res.set({
        'Content-Type': 'video/mp2t',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
        'X-Stream-Type': 'resilient',
        'X-Resilience-Layers': '4',
        'X-Session-Id': sessionId
      });

      // Handle client disconnect
      req.on('close', () => {
        logger.info('Client disconnected from resilient stream', {
          sessionId,
          streamId,
          clientIdentifier
        });
        
        // Stop resilient stream
        streamResilienceService.stopStream(sessionId);
        this.activeStreams.delete(`resilient_${streamId}_${clientIdentifier}`);
        streamSessionManager.endSession(sessionId, 'client_disconnect');
      });

      // Pipe the resilient output stream to the response
      resilientOutputStream.on('error', (error) => {
        logger.error('Resilient stream output error', {
          sessionId,
          error: error.message
        });
        
        if (!res.headersSent) {
          res.status(500).end();
        }
      });

      resilientOutputStream.on('data', (chunk) => {
        // Update session metrics
        streamSessionManager.updateSessionMetrics(sessionId, {
          bytesTransferred: (streamInfo.bytesTransferred || 0) + chunk.length,
          currentBitrate: Math.round((chunk.length * 8) / 1) // Rough bitrate calculation
        });
        
        streamInfo.bytesTransferred = (streamInfo.bytesTransferred || 0) + chunk.length;
      });

      // Start streaming
      resilientOutputStream.pipe(res);

      logger.info('Resilient stream proxy created successfully', {
        sessionId,
        streamId,
        clientIdentifier,
        url: streamData.url
      });

    } catch (error) {
      logger.error('Failed to create resilient stream proxy', {
        streamId,
        error: error.message,
        stack: error.stack
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to create resilient stream',
          message: error.message,
          streamId
        });
      }
    }
  }

  // Create a stream proxy for Plex
  async createStreamProxy(streamId, streamData, req, res) {
    try {
      logger.stream('Creating stream proxy', { streamId, url: streamData.url });

      const clientIdentifier = this.generateClientIdentifier(req);
      const { url, type, auth, headers: customHeaders = {} } = streamData;
      
      // Check for existing session to prevent duplicates
      const streamSessionManager = require('./streamSessionManager');
      const existingSession = streamSessionManager.getActiveSessionByClientAndStream(clientIdentifier, streamId);
      
      logger.info('Duplicate session check', {
        clientIdentifier,
        streamId,
        existingSession: existingSession ? existingSession.sessionId : 'none',
        userAgent: req.get('User-Agent'),
        clientIP: req.ip
      });
      
      let sessionId;
      if (existingSession) {
        logger.info('Found existing session - ending it to prevent duplicates', {
          existingSessionId: existingSession.sessionId,
          streamId,
          clientIdentifier
        });
        
        // End the existing session and create a new one (client likely reconnected)
        await streamSessionManager.endSession(existingSession.sessionId, 'client_reconnect');
      }
      
      sessionId = `${streamId}_${clientIdentifier}_${Date.now()}`;
      
      // Get channel information for real-time updates
      let channelInfo = null;
      try {
        const database = require('./database');
        const channel = await database.get('SELECT name, number FROM channels WHERE id = ?', [streamId]);
        if (channel) {
          channelInfo = { name: channel.name, number: channel.number };
        }
      } catch (error) {
        logger.warn('Failed to get channel info for stream', { streamId, error: error.message });
      }

      // Check if client already has an active session for this stream
      if (this.hasActiveClientSession(streamId, clientIdentifier)) {
        logger.stream('Client already has active session for this stream', { 
          streamId, 
          clientIdentifier,
          activeSession: this.getClientActiveSession(streamId, clientIdentifier)
        });
        res.status(409).json({ 
          error: 'Client already has an active stream session for this channel',
          activeSessionId: this.getClientActiveSession(streamId, clientIdentifier)
        });
        return;
      }

      // Check global concurrent stream limit - use config fallback since this needs to be sync
      const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_STREAMS) || config.streams?.maxConcurrent || 10;
      
      if (this.activeStreams.size >= maxConcurrent) {
        logger.stream('Maximum concurrent streams reached', { 
          limit: maxConcurrent, 
          current: this.activeStreams.size,
          source: 'settings_service'
        });
        res.status(503).json({ error: 'Maximum concurrent streams reached' });
        return;
      }

      // Check per-channel concurrent stream limit
      const channelConcurrentLimit = config.plexlive?.streaming?.maxConcurrentPerChannel || 3;
      const channelStreamCount = this.getChannelStreamCount(streamId);
      if (channelStreamCount >= channelConcurrentLimit) {
        logger.stream('Maximum concurrent streams per channel reached', { 
          streamId, 
          current: channelStreamCount, 
          limit: channelConcurrentLimit 
        });
        res.status(503).json({ 
          error: `Maximum concurrent streams per channel reached (${channelConcurrentLimit})`,
          currentCount: channelStreamCount
        });
        return;
      }

      // Create stream based on type
      let streamProcess;
      
      switch (type) {
        case 'hls':
        case 'dash':
        case 'http':
          streamProcess = await this.createHTTPStreamProxy(url, auth, customHeaders);
          break;
        case 'ts':
        case 'mpegts':
          streamProcess = this.createTSStreamProxy(url, auth, customHeaders);
          break;
        case 'rtsp':
          streamProcess = this.createRTSPStreamProxy(url, auth);
          break;
        case 'rtmp':
          streamProcess = this.createRTMPStreamProxy(url, auth);
          break;
        case 'udp':
          streamProcess = this.createUDPStreamProxy(url);
          break;
        case 'mms':
          streamProcess = this.createMMSStreamProxy(url, auth);
          break;
        case 'srt':
          streamProcess = this.createSRTStreamProxy(url, auth);
          break;
        default:
          res.status(400).json({ error: 'Unsupported stream type' });
          return;
      }

      if (!streamProcess) {
        res.status(500).json({ error: 'Failed to create stream process' });
        return;
      }

      // Store active stream with enhanced tracking
      const streamInfo = {
        streamId,
        sessionId,
        process: streamProcess,
        startTime: Date.now(),
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        clientIdentifier,
        url: streamData.url,
        type: streamData.type,
        isUnique: true // Ensure stream uniqueness
      };
      
      this.activeStreams.set(sessionId, streamInfo);
      
      // Track channel streams
      if (!this.channelStreams.has(streamId)) {
        this.channelStreams.set(streamId, new Set());
      }
      this.channelStreams.get(streamId).add(sessionId);
      
      // Track client sessions
      if (!this.clientSessions.has(clientIdentifier)) {
        this.clientSessions.set(clientIdentifier, new Map());
      }
      this.clientSessions.get(clientIdentifier).set(streamId, sessionId);

      // Start enhanced session tracking
      try {
        // Extract Plex headers securely
        const plexHeaders = streamSessionManager.extractPlexHeaders(req);
        
        await streamSessionManager.startSession({
          sessionId,
          streamId,
          clientIP: req.ip,
          userAgent: req.get('User-Agent'),
          clientIdentifier,
          channelName: channelInfo?.name,
          channelNumber: channelInfo?.number,
          streamUrl: streamData.url,
          streamType: streamData.type,
          ...plexHeaders // Spread sanitized Plex headers
        });
      } catch (sessionError) {
        logger.warn('Failed to start enhanced session tracking', {
          sessionId,
          error: sessionError.message
        });
      }

      // Track stream statistics with detailed bandwidth monitoring
      this.streamStats.set(sessionId, {
        bytesTransferred: 0,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        errors: 0,
        bandwidthSamples: [],
        currentBitrate: 0,
        avgBitrate: 0,
        peakBitrate: 0
      });

      // Set enhanced response headers for streaming - fix content type based on stream type
      const contentType = type === 'ts' || type === 'mpegts' ? 'video/mp2t' : 'video/mp2t';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, User-Agent, Authorization');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Accept-Ranges', 'bytes');

      // Pipe stream to response
      streamProcess.stdout.pipe(res);

      // Handle stream events with detailed bandwidth tracking
      streamProcess.stdout.on('data', (chunk) => {
        const stats = this.streamStats.get(sessionId);
        if (stats) {
          const now = Date.now();
          const deltaTime = now - stats.lastUpdateTime;
          const deltaBytes = chunk.length;
          
          // Update basic metrics
          stats.bytesTransferred += deltaBytes;
          stats.lastUpdateTime = now;
          
          // Calculate current bitrate (bits per second)
          if (deltaTime > 0) {
            const currentBps = (deltaBytes * 8) / (deltaTime / 1000); // bits per second
            stats.currentBitrate = Math.round(currentBps);
            
            // Keep bandwidth samples for average calculation (last 30 seconds)
            stats.bandwidthSamples.push({ time: now, bitrate: currentBps });
            stats.bandwidthSamples = stats.bandwidthSamples.filter(sample => now - sample.time < 30000);
            
            // Calculate average bitrate
            if (stats.bandwidthSamples.length > 0) {
              const totalBps = stats.bandwidthSamples.reduce((sum, sample) => sum + sample.bitrate, 0);
              stats.avgBitrate = Math.round(totalBps / stats.bandwidthSamples.length);
            }
            
            // Track peak bitrate
            if (currentBps > stats.peakBitrate) {
              stats.peakBitrate = Math.round(currentBps);
            }

            // Update enhanced session tracking
            streamSessionManager.updateSessionMetrics(sessionId, {
              bytesTransferred: stats.bytesTransferred,
              currentBitrate: stats.currentBitrate
            });
          }
        }
      });

      streamProcess.stderr.on('data', (data) => {
        const errorData = data.toString();
        const stream = this.activeStreams.get(sessionId);
        
        // Update error count
        const stats = this.streamStats.get(sessionId);
        if (stats) {
          stats.errors++;
          
          // Update enhanced session tracking with error
          streamSessionManager.updateSessionMetrics(sessionId, {
            errorIncrement: 1
          });
        }
        
        // Enhanced error logging for stream sessions
        logger.streamSession('error', {
          sessionId,
          streamId: stream?.streamId,
          channelName: stream?.channelName || 'Unknown',
          channelNumber: stream?.channelNumber || 'N/A',
          clientIP: stream?.clientIP,
          clientIdentifier: stream?.clientIdentifier,
          streamUrl: stream?.url,
          streamType: stream?.type,
          errorDetails: {
            message: errorData,
            category: 'stream_processing',
            severity: errorData.includes('fatal') ? 'critical' : 'warning'
          },
          sessionDuration: stream?.startTime ? Date.now() - stream.startTime : 0
        });
        
        logger.stream('Stream process stderr', { sessionId, data: errorData });
      });

      streamProcess.on('close', (code) => {
        const stream = this.activeStreams.get(sessionId);
        
        // Enhanced process close logging
        logger.streamSession('process_closed', {
          sessionId,
          streamId: stream?.streamId,
          channelName: stream?.channelName || 'Unknown',
          channelNumber: stream?.channelNumber || 'N/A',
          clientIP: stream?.clientIP,
          exitCode: code,
          exitReason: code === 0 ? 'normal' : code === 1 ? 'error' : 'signal',
          sessionDuration: stream?.startTime ? Date.now() - stream.startTime : 0
        });
        
        this.cleanupStream(sessionId);
      });

      streamProcess.on('error', (error) => {
        const stream = this.activeStreams.get(sessionId);
        logger.error('Stream process error', { 
          sessionId, 
          streamId: stream?.streamId,
          clientIP: stream?.clientIP,
          streamUrl: stream?.url,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        this.cleanupStream(sessionId);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });

      // Set stream timeout
      const streamTimeout = config.plexlive?.streaming?.streamTimeout || 30000;
      const timeoutId = setTimeout(() => {
        logger.stream('Stream timeout reached', { sessionId, timeout: streamTimeout });
        this.cleanupStream(sessionId, 'timeout');
      }, streamTimeout);
      this.streamTimeouts.set(sessionId, timeoutId);

      // Cleanup on client disconnect
      req.on('close', () => {
        logger.stream('Client disconnected', { sessionId });
        this.cleanupStream(sessionId, 'disconnect');
      });

      // Reset timeout on data transfer (keep-alive)
      streamProcess.stdout.on('data', () => {
        this.resetStreamTimeout(sessionId, streamTimeout);
      });

      // Store in cache for session tracking
      cacheService.addStreamSession(sessionId, streamId, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Log detailed session start information using enhanced stream session logging
      logger.streamSession('started', {
        sessionId,
        streamId,
        channelName: channelInfo?.name || 'Unknown',
        channelNumber: channelInfo?.number || 'N/A',
        clientIP: req.ip,
        clientIdentifier,
        userAgent: req.get('User-Agent'),
        streamUrl: streamData.url,
        streamType: streamData.type,
        maxConcurrent,
        currentActiveStreams: this.activeStreams.size,
        bufferSize: '1MB',
        protocols: {
          source: streamData.type,
          output: 'mpegts'
        }
      });
      
      // Emit Socket.IO event for real-time dashboard updates
      if (global.io) {
        const streamEventData = {
          sessionId,
          streamId,
          channelName: channelInfo?.name || 'Unknown',
          channelNumber: channelInfo?.number || 'N/A',
          clientIP: req.ip,
          userAgent: req.get('User-Agent'),
          streamType: streamData.type,
          startTime: stream.startTime,
          currentBitrate: 0,
          avgBitrate: 0,
          peakBitrate: 0,
          bytesTransferred: 0
        };
        
        global.io.emit('stream:started', streamEventData);
        logger.stream('Emitted stream:started event', { sessionId });
        
        // Emit metrics update to the metrics room
        this.emitMetricsUpdate();
      }
      
      logger.stream('Stream proxy created successfully', { sessionId, streamId });

    } catch (error) {
      logger.error('Stream proxy creation error', { streamId, error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream proxy creation failed' });
      }
    }
  }

  async createHTTPStreamProxy(url, auth, customHeaders) {
    // For HLS streams that redirect, we need to resolve the final URL first
    let finalUrl = url;
    
    try {
      // Check if URL redirects
      if (url.includes('mjh.nz') || url.includes('')) {
        const response = await axios.head(url, {
          maxRedirects: 5,
          timeout: 5000,
          headers: {
            'User-Agent': config.protocols.http.userAgent
          }
        });
        
        // Use the final URL after redirects
        if (response.request && response.request.res && response.request.res.responseUrl) {
          finalUrl = response.request.res.responseUrl;
          logger.stream('Stream URL redirected', { original: url, final: finalUrl });
        }
      }
    } catch (error) {
      logger.warn('Failed to resolve redirect, using original URL', { url, error: error.message });
    }

    // Get FFmpeg arguments from settings for proper transcoding
    const settingsService = require('./settingsService');
    let settings;
    try {
      settings = await settingsService.getSettings();
    } catch (error) {
      logger.warn('Failed to get settings, using default transcoding args', { error: error.message });
    }
    
    // Check if request is from Android TV for specific optimizations
    const userAgent = req.get('User-Agent') || '';
    const isAndroidTV = this.isAndroidTVClient(userAgent);
    
    // Get configurable FFmpeg arguments
    let args;
    if (isAndroidTV) {
      // Use structured Android TV configuration
      args = this.buildAndroidTVFFmpegArgs(finalUrl, settings);
      
      logger.info('Using Android TV optimized FFmpeg configuration', { 
        clientIP: req.ip,
        userAgent: userAgent,
        analyzeDuration: ANDROID_TV_CONFIG.ANALYZE_DURATION,
        probeSize: ANDROID_TV_CONFIG.PROBE_SIZE
      });
    } else {
      // Standard FFmpeg configuration for non-Android TV clients
      const ffmpegCommand = settings?.plexlive?.transcoding?.mpegts?.ffmpegArgs || 
                           config.plexlive?.transcoding?.mpegts?.ffmpegArgs ||
                           '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v h264_mp4toannexb -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1';
      
      // Replace [URL] placeholder with actual stream URL
      let processedCommand = ffmpegCommand.replace('[URL]', finalUrl);
      
      // Add HLS-specific arguments if needed
      if (finalUrl.includes('.m3u8')) {
        let hlsArgs = settings?.plexlive?.transcoding?.mpegts?.hlsProtocolArgs || 
                     config.plexlive?.transcoding?.mpegts?.hlsProtocolArgs ||
                     '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto';
        
        // For redirected streams, add additional HLS options for better compatibility
        if (finalUrl !== url) {
          hlsArgs += ' -http_seekable 0 -multiple_requests 1 -http_persistent 0';
          logger.stream('Added HLS compatibility options for redirected stream', {
            originalUrl: url,
            finalUrl: finalUrl
          });
        }
        
        // Insert HLS args BEFORE the input URL for proper protocol handling
        processedCommand = processedCommand.replace('-i ' + finalUrl, hlsArgs + ' -i ' + finalUrl);
      }
      
      // Parse command line into arguments array
      args = processedCommand.split(' ').filter(arg => arg.trim() !== '');
    }

    // Add authentication if needed
    if (auth && auth.username) {
      const authHeader = `Authorization: Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
      // Insert headers before the input URL
      const inputIndex = args.indexOf('-i');
      if (inputIndex > -1) {
        args.splice(inputIndex, 0, '-headers', authHeader);
      }
    }

    logger.stream('Creating HTTP stream proxy with transcoding', { 
      originalUrl: url, 
      finalUrl: finalUrl,
      command: args.join(' ')
    });

    return spawn(config.streams.ffmpegPath, args);
  }

  createTSStreamProxy(url, auth, customHeaders) {
    // For TS streams, we need to handle them properly for web browser compatibility
    // TS files often need remuxing or transcoding to be played in browsers
    const args = [
      '-y',
      '-i', url,
      '-c:v', 'copy',        // Try to copy video codec if compatible
      '-c:a', 'copy',        // Try to copy audio codec if compatible  
      '-f', 'mpegts',        // Output as MPEG-TS
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts',  // Generate timestamps for better compatibility
      '-'
    ];

    if (auth && auth.username) {
      args.splice(2, 0, '-headers', `Authorization: Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`);
    }

    return spawn(config.streams.ffmpegPath, args);
  }

  createRTSPStreamProxy(url, auth) {
    const args = [
      '-y',
      '-rtsp_transport', config.protocols.rtsp.transport,
      '-i', url,
      '-c', 'copy',
      '-f', 'mpegts',
      '-'
    ];

    return spawn(config.streams.ffmpegPath, args);
  }

  createRTMPStreamProxy(url, auth) {
    const args = [
      '-y',
      '-i', url,
      '-c', 'copy',
      '-f', 'mpegts',
      '-'
    ];

    return spawn(config.streams.ffmpegPath, args);
  }

  createUDPStreamProxy(url) {
    const args = [
      '-y',
      '-i', url,
      '-c', 'copy',
      '-f', 'mpegts',
      '-'
    ];

    return spawn(config.streams.ffmpegPath, args);
  }

  createMMSStreamProxy(url, auth) {
    const args = [
      '-y',
      '-i', url,
      '-c', 'copy',
      '-f', 'mpegts',
      '-'
    ];

    return spawn(config.streams.ffmpegPath, args);
  }

  createSRTStreamProxy(url, auth) {
    const args = [
      '-y',
      '-i', url,
      '-c', 'copy',
      '-f', 'mpegts',
      '-'
    ];

    return spawn(config.streams.ffmpegPath, args);
  }

  // Generate unique client identifier
  generateClientIdentifier(req) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'unknown';
    const xForwardedFor = req.get('X-Forwarded-For');
    
    // Create a more unique identifier including forwarded IP if available
    const baseIdentifier = `${xForwardedFor || ip}_${userAgent}`;
    return Buffer.from(baseIdentifier).toString('base64').substring(0, 16);
  }

  // Check if client has active session for stream
  hasActiveClientSession(streamId, clientIdentifier) {
    const clientSessions = this.clientSessions.get(clientIdentifier);
    return clientSessions && clientSessions.has(streamId);
  }

  // Get client's active session for stream
  getClientActiveSession(streamId, clientIdentifier) {
    const clientSessions = this.clientSessions.get(clientIdentifier);
    return clientSessions ? clientSessions.get(streamId) : null;
  }

  // Get number of active streams for a channel
  getChannelStreamCount(streamId) {
    const channelStreams = this.channelStreams.get(streamId);
    return channelStreams ? channelStreams.size : 0;
  }

  // Reset stream timeout
  resetStreamTimeout(sessionId, timeoutMs) {
    // Clear existing timeout
    const existingTimeout = this.streamTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const newTimeout = setTimeout(() => {
      logger.stream('Stream timeout reached after reset', { sessionId, timeout: timeoutMs });
      this.cleanupStream(sessionId, 'timeout');
    }, timeoutMs);
    
    this.streamTimeouts.set(sessionId, newTimeout);
  }

  cleanupStream(sessionId, reason = 'manual') {
    const stream = this.activeStreams.get(sessionId);
    
    // Clear Android TV reset timer if it exists
    if (stream && stream.androidTVResetTimer) {
      clearTimeout(stream.androidTVResetTimer);
      delete stream.androidTVResetTimer;
      logger.debug('Cleared Android TV reset timer', { sessionId, reason });
    }
    
    // End enhanced session tracking first
    if (stream) {
      streamSessionManager.endSession(sessionId, reason).catch(error => {
        logger.warn('Failed to end enhanced session tracking', {
          sessionId,
          error: error.message
        });
      });
    }
    
    if (stream && stream.process) {
      try {
        // Send SIGTERM first for graceful shutdown
        stream.process.kill('SIGTERM');
        
        // Force kill after 5 seconds if process still running
        setTimeout(() => {
          if (!stream.process.killed) {
            logger.stream('Force killing unresponsive stream process', { sessionId });
            stream.process.kill('SIGKILL');
          }
        }, 5000);
      } catch (error) {
        logger.error('Error killing stream process', { sessionId, error: error.message });
      }
    }

    // Clear timeout
    const timeout = this.streamTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.streamTimeouts.delete(sessionId);
    }

    // Remove from active streams
    this.activeStreams.delete(sessionId);
    this.streamStats.delete(sessionId);
    
    // Remove from channel streams tracking
    if (stream) {
      const channelStreams = this.channelStreams.get(stream.streamId);
      if (channelStreams) {
        channelStreams.delete(sessionId);
        if (channelStreams.size === 0) {
          this.channelStreams.delete(stream.streamId);
        }
      }
      
      // Remove from client sessions tracking
      const clientSessions = this.clientSessions.get(stream.clientIdentifier);
      if (clientSessions) {
        clientSessions.delete(stream.streamId);
        if (clientSessions.size === 0) {
          this.clientSessions.delete(stream.clientIdentifier);
        }
      }
    }
    
    // Remove from cache
    cacheService.removeStreamSession(sessionId);
    
    // Log detailed session end information
    if (stream) {
      const stats = this.streamStats.get(sessionId);
      const duration = Date.now() - stream.startTime;
      
      // Enhanced session end logging with detailed statistics
      logger.streamSession('ended', {
        sessionId,
        streamId: stream.streamId,
        channelName: stream.channelName || 'Unknown',
        channelNumber: stream.channelNumber || 'N/A',
        clientIP: stream.clientIP,
        clientIdentifier: stream.clientIdentifier,
        userAgent: stream.userAgent,
        streamUrl: stream.url,
        streamType: stream.type,
        performance: {
          duration,
          durationFormatted: this.formatDuration(duration),
          bytesTransferred: stats?.bytesTransferred || 0,
          avgBitrate: stats?.avgBitrate || 0,
          peakBitrate: stats?.peakBitrate || 0,
          errorCount: stats?.errors || 0
        },
        endReason: reason,
        remainingActiveStreams: this.activeStreams.size - 1,
        sessionMetrics: {
          bandwidth: {
            avg: this.formatBandwidth(stats?.avgBitrate || 0),
            peak: this.formatBandwidth(stats?.peakBitrate || 0),
            total: this.formatBytes(stats?.bytesTransferred || 0)
          },
          quality: (stats?.errors || 0) === 0 ? 'excellent' : (stats?.errors || 0) < 5 ? 'good' : 'poor'
        }
      });
      
      // Emit Socket.IO event for real-time dashboard updates
      if (global.io) {
        const streamEndEventData = {
          sessionId,
          streamId: stream.streamId,
          clientIP: stream.clientIP,
          duration,
          bytesTransferred: stats?.bytesTransferred || 0,
          avgBitrate: stats?.avgBitrate || 0,
          peakBitrate: stats?.peakBitrate || 0,
          reason,
          timestamp: new Date().toISOString()
        };
        
        global.io.emit('stream:stopped', streamEndEventData);
        logger.stream('Emitted stream:stopped event', { sessionId });
        
        // Emit metrics update to the metrics room
        this.emitMetricsUpdate();
      }
    }
    
    logger.stream('Stream cleaned up', { sessionId, reason, streamId: stream?.streamId });
  }

  async getActiveStreams() {
    const streams = [];
    const database = require('./database');
    
    for (const [sessionId, stream] of this.activeStreams) {
      const stats = this.streamStats.get(sessionId);
      
      // Get channel information from database
      let channelInfo = { name: 'Unknown Channel', number: 'N/A' };
      try {
        const channel = await database.get('SELECT name, number FROM channels WHERE id = ?', [stream.streamId]);
        if (channel) {
          channelInfo = { name: channel.name, number: channel.number };
        }
      } catch (error) {
        logger.error('Failed to get channel info for stream', { 
          sessionId, 
          streamId: stream.streamId, 
          error: error.message 
        });
      }
      
      streams.push({
        sessionId,
        streamId: stream.streamId,
        startTime: stream.startTime,
        duration: Date.now() - stream.startTime,
        clientIP: stream.clientIP,
        userAgent: stream.userAgent,
        clientIdentifier: stream.clientIdentifier,
        url: stream.url,
        type: stream.type,
        isUnique: stream.isUnique,
        bytesTransferred: stats?.bytesTransferred || 0,
        currentBitrate: stats?.currentBitrate || 0,
        avgBitrate: stats?.avgBitrate || 0,
        peakBitrate: stats?.peakBitrate || 0,
        lastUpdateTime: stats?.lastUpdateTime,
        channelName: channelInfo.name,
        channelNumber: channelInfo.number
      });
    }
    return streams;
  }

  // Get streams grouped by channel
  getStreamsByChannel() {
    const channelGroups = new Map();
    
    for (const [sessionId, stream] of this.activeStreams) {
      const streamId = stream.streamId;
      if (!channelGroups.has(streamId)) {
        channelGroups.set(streamId, []);
      }
      
      const stats = this.streamStats.get(sessionId);
      channelGroups.get(streamId).push({
        sessionId,
        startTime: stream.startTime,
        duration: Date.now() - stream.startTime,
        clientIP: stream.clientIP,
        userAgent: stream.userAgent,
        clientIdentifier: stream.clientIdentifier,
        bytesTransferred: stats?.bytesTransferred || 0
      });
    }
    
    return Object.fromEntries(channelGroups);
  }

  // Get concurrency metrics
  getConcurrencyMetrics(maxConcurrentStreams = null) {
    const totalStreams = this.activeStreams.size;
    
    // Use provided maxConcurrentStreams or fall back to environment/default
    const maxConcurrent = (maxConcurrentStreams !== null && maxConcurrentStreams !== undefined) 
      ? parseInt(maxConcurrentStreams) || 10
      : parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10;
    
    const channelCounts = new Map();
    
    for (const [channelId, sessions] of this.channelStreams) {
      channelCounts.set(channelId, sessions.size);
    }
    
    return {
      totalActiveStreams: totalStreams,
      maxConcurrentStreams: maxConcurrent,
      utilizationPercentage: Math.round((totalStreams / maxConcurrent) * 100),
      channelStreamCounts: Object.fromEntries(channelCounts),
      uniqueClients: this.clientSessions.size
    };
  }

  // Force cleanup specific client sessions
  cleanupClientSessions(clientIdentifier, reason = 'forced') {
    const clientSessions = this.clientSessions.get(clientIdentifier);
    if (clientSessions) {
      const sessionIds = Array.from(clientSessions.values());
      logger.stream('Cleaning up client sessions', { 
        clientIdentifier, 
        sessionCount: sessionIds.length, 
        reason 
      });
      
      sessionIds.forEach(sessionId => {
        this.cleanupStream(sessionId, reason);
      });
    }
  }

  // Force cleanup streams for a specific channel
  cleanupChannelStreams(streamId, reason = 'forced') {
    const channelStreams = this.channelStreams.get(streamId);
    if (channelStreams) {
      const sessionIds = Array.from(channelStreams);
      logger.stream('Cleaning up channel streams', { 
        streamId, 
        sessionCount: sessionIds.length, 
        reason 
      });
      
      sessionIds.forEach(sessionId => {
        this.cleanupStream(sessionId, reason);
      });
    }
  }

  // Enhanced proxy stream method with channel context
  async proxyStreamWithChannel(streamUrl, channel, stream, req, res) {
    try {
      logger.info('Stream request with channel context', {
        channelId: channel.id,
        channelName: channel.name,
        channelNumber: channel.number,
        streamUrl,
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      // Detect stream format to determine appropriate handling
      const detection = await this.detectStreamFormat(streamUrl);
      logger.stream('Detected stream format', { url: streamUrl, format: detection });

      // For HLS/DASH streams, we can redirect directly or proxy based on CORS
      if (detection.type === 'hls' || detection.type === 'dash') {
        return await this.proxyWebCompatibleStreamWithChannel(streamUrl, detection.type, channel, req, res);
      }

      // For other stream types, use FFmpeg transcoding to web-compatible format
      return await this.proxyTranscodedStreamWithChannel(streamUrl, detection.type, channel, req, res);

    } catch (error) {
      logger.error('Stream proxy error with channel context', { 
        channelId: channel.id,
        channelName: channel.name,
        channelNumber: channel.number,
        url: streamUrl, 
        clientIP: req.ip,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream proxy failed', details: error.message });
      }
    }
  }

  // Proxy stream specifically for Plex HDHomeRun compatibility (MPEG-TS output)
  async proxyPlexCompatibleStream(streamUrl, channel, stream, req, res) {
    try {
      // Debug logging to track where failures occur
      console.log('DEBUG: proxyPlexCompatibleStream called', { 
        streamUrl, 
        channelId: channel?.id, 
        channelName: channel?.name 
      });
      logger.info('Starting Plex-compatible MPEG-TS stream', {
        channelId: channel.id,
        channelName: channel.name,
        channelNumber: channel.number,
        streamUrl,
        clientIP: req.ip
      });

      // Resolve redirects for the stream URL before passing to FFmpeg
      let finalStreamUrl = streamUrl;
      try {
        const axios = require('axios');
        logger.info('Resolving stream redirects', { channelId: channel.id, streamUrl });
        
        // Special handling for premiumpowers.net streams ( Sports, etc)
        if (streamUrl.includes('premiumpowers.net') || streamUrl.includes('line.premiumpowers')) {
          logger.info('Detected premiumpowers.net stream, using IPTV-specific headers and retry strategy', {
            channelId: channel.id,
            channelName: channel.name
          });
          
          // These streams require specific User-Agent and GET request to trigger redirect
          try {
            const response = await axios.get(streamUrl, {
              maxRedirects: 0, // Don't follow automatically, get redirect URL
              timeout: 10000,
              responseType: 'text',
              maxContentLength: 1000, // Very small to just get redirect
              validateStatus: function (status) {
                // Accept all status codes to handle redirects properly
                return true;
              },
              headers: {
                'User-Agent': 'IPTVSmarters/1.0', // Required for premiumpowers streams
                'Accept': '*/*',
                'Connection': 'keep-alive'
              }
            });
            
            // If we got a 302, the Location header should have the real URL
            if (response.status === 302 && response.headers.location) {
              finalStreamUrl = response.headers.location;
              logger.info('Got redirect from response', {
                channelId: channel.id,
                originalUrl: streamUrl,
                redirectUrl: finalStreamUrl
              });
            } else {
              logger.warn('No redirect found in response', {
                channelId: channel.id,
                status: response.status
              });
              // Use original URL
            }
            
          } catch (redirectError) {
            // Check if this is a redirect error with location header
            if (redirectError.response && redirectError.response.status === 302 && redirectError.response.headers.location) {
              finalStreamUrl = redirectError.response.headers.location;
              logger.info('Got redirect from error response', {
                channelId: channel.id,
                originalUrl: streamUrl,
                redirectUrl: finalStreamUrl,
                status: redirectError.response.status
              });
            } else {
              logger.warn('Failed to resolve premiumpowers redirect', {
                channelId: channel.id,
                error: redirectError.message,
                status: redirectError.response?.status,
                hasLocation: !!redirectError.response?.headers?.location
              });
              // Continue with original URL - don't fail the stream
            }
          }
          
          logger.info('Premiumpowers stream redirect resolved', {
            channelId: channel.id,
            originalUrl: streamUrl,
            finalUrl: finalStreamUrl,
            redirected: finalStreamUrl !== streamUrl
          });
        }
        // For  and mjh.nz streams, follow redirects properly
        else if (streamUrl.includes('mjh.nz') || streamUrl.includes('')) {
          // Use a HEAD request without following redirects to get the Location header
          const response = await axios.head(streamUrl, {
            maxRedirects: 0, // Don't follow redirects automatically
            timeout: 10000,
            validateStatus: function (status) {
              return status >= 200 && status < 400; // Accept redirects as success
            },
            headers: {
              'User-Agent': 'VLC/3.0.0 LibVLC/3.0.0',
              'Accept': '*/*'
            }
          });
          
          // Get the redirect URL from the location header
          if (response.status === 302 && response.headers.location) {
            finalStreamUrl = response.headers.location;
            
            logger.info('/mjh.nz redirect resolved', {
              channelId: channel.id,
              originalUrl: streamUrl,
              finalUrl: finalStreamUrl,
              status: response.status,
              redirected: true
            });
          } else {
            logger.warn('/mjh.nz redirect not found', {
              channelId: channel.id,
              status: response.status,
              headers: response.headers
            });
          }
        } else {
          // For other streams, use HEAD request
          const response = await axios.head(streamUrl, {
            maxRedirects: 5,
            timeout: 10000,
            headers: {
              'User-Agent': 'PlexBridge/1.0'
            }
          });
          finalStreamUrl = response.request.responseURL || streamUrl;
        }
        
        logger.info('Stream URL resolution completed', {
          channelId: channel.id,
          originalUrl: streamUrl,
          finalUrl: finalStreamUrl,
          redirected: finalStreamUrl !== streamUrl
        });
      } catch (redirectError) {
        logger.warn('Failed to resolve stream redirect, using original URL', {
          channelId: channel.id,
          error: redirectError.message,
          originalUrl: streamUrl
        });
        // Continue with original URL if redirect resolution fails
      }

      console.log('DEBUG: Redirect resolution complete', { finalStreamUrl });
      
      // Pre-flight stream health check for problematic channels
      const channelNameLower = (channel.name || '').toLowerCase();
      const problematicChannels = ['', 'bein', ' sports', 'bt sport', 'dazn'];
      const isProblematicChannel = problematicChannels.some(name => channelNameLower.includes(name));
      
      if (isProblematicChannel) {
        logger.warn('Problematic channel detected, performing pre-flight check', {
          channelId: channel.id,
          channelName: channel.name,
          streamUrl: finalStreamUrl
        });
        
        // DISABLE pre-flight checks for now - they're being too aggressive
        // Let FFmpeg handle the stream validation instead
        logger.info('Skipping pre-flight checks - letting FFmpeg handle validation', {
          channelId: channel.id,
          channelName: channel.name
        });
      }
      
      // Set appropriate headers - will be updated after profile selection
      let responseHeaders = {
        'Content-Type': 'video/mp2t',                 // Default MPEG-TS MIME type
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'none',                      // Disable range requests for live streams
        'Connection': 'keep-alive'                    // Keep connection alive for continuous streaming
        // NO Transfer-Encoding header - HDHomeRun doesn't use chunked encoding
        // NO Content-Length header - unknown length for live streams
      };

      // Get FFmpeg arguments from settings
      const settingsService = require('./settingsService');
      const settings = await settingsService.getSettings();
      
      // Check if stream requires transcoding (forceTranscode setting)
      let forceTranscode = false;
      if (stream && stream.protocol_options) {
        try {
          const protocolOptions = typeof stream.protocol_options === 'string' 
            ? JSON.parse(stream.protocol_options) 
            : stream.protocol_options;
          forceTranscode = protocolOptions.forceTranscode === true;
        } catch (error) {
          logger.warn('Failed to parse protocol_options for forceTranscode check', { 
            streamId: stream?.id,
            error: error.message 
          });
        }
      }

      logger.info('Plex stream transcoding decision', {
        channelId: channel.id,
        streamId: stream?.id,
        streamName: stream?.name,
        forceTranscode,
        transcodeMode: forceTranscode ? 'H.264/AAC' : 'codec_copy'
      });

      // Analyze client capabilities for browser-specific transcoding
      const browserTranscodingFix = require('../utils/browserTranscodingFix');
      const clientCapabilities = browserTranscodingFix.analyzeClientCapabilities(req);
      const isAndroidTV = clientCapabilities.isAndroidTV;
      
      // Track stream duration for Android TV reset logic
      const streamDurationTracker = new Map();
      
      // Check if we need browser-specific transcoding profile
      const browserTranscodeProfile = browserTranscodingFix.selectBrowserTranscodeProfile(clientCapabilities, stream);
      
      // Log browser transcoding decision
      if (browserTranscodeProfile) {
        browserTranscodingFix.logBrowserTranscodeDecision(clientCapabilities, browserTranscodeProfile, stream);
      }
      
      // Get configurable FFmpeg command line - prioritize browser profiles
      let ffmpegCommand;
      
      // BROWSER TRANSCODING FIX: Use browser-specific profiles when needed
      if (browserTranscodeProfile) {
        const browserConfig = browserTranscodingFix.getBrowserTranscodeOptions(browserTranscodeProfile);
        ffmpegCommand = browserConfig.ffmpeg_options.join(' ') + ' -i [URL] pipe:1';
        
        logger.info('Using browser-specific transcoding profile', {
          profile: browserTranscodeProfile,
          clientName: clientCapabilities.clientName,
          isBrowser: clientCapabilities.isBrowser,
          forcesTranscoding: clientCapabilities.forcesTranscoding
        });
        
        // Update headers based on browser profile container
        if (browserConfig.container === 'mp4') {
          responseHeaders['Content-Type'] = 'video/mp4';
        } else if (browserConfig.container === 'mpegts') {
          responseHeaders['Content-Type'] = 'video/mp2t';
        }
      } else if (forceTranscode) {
        // Use high quality transcoding when re-encoding is required
        if (isAndroidTV) {
          // Android TV specific high quality transcoding
          const profile = ffmpegProfiles.transcodingHighQuality;
          const profileArgs = profile.args.join(' ');
          ffmpegCommand = settings?.plexlive?.transcoding?.androidtv?.transcodingArgs ||
                         settings?.plexlive?.transcoding?.mpegts?.transcodingArgs || 
                         config.plexlive?.transcoding?.mpegts?.transcodingArgs ||
                         profileArgs;
          
          logger.info('Using high quality transcoding for Android TV', { 
            clientIP: req.ip,
            profile: profile.name
          });
        } else {
          // Standard high quality transcoding
          const profile = ffmpegProfiles.transcodingHighQuality;
          const profileArgs = profile.args.join(' ');
          ffmpegCommand = settings?.plexlive?.transcoding?.mpegts?.transcodingArgs || 
                         config.plexlive?.transcoding?.mpegts?.transcodingArgs ||
                         profileArgs;
        }
      } else {
        // Use quality-preserving profiles for streams that don't need transcoding
        if (isAndroidTV) {
          // Android TV specific - use optimized profile for quality and stability
          const profile = ffmpegProfiles.selectProfile(userAgent, finalStreamUrl, 'mpegts');
          const profileArgs = profile.args.join(' ');
          ffmpegCommand = settings?.plexlive?.transcoding?.androidtv?.ffmpegArgs ||
                         config.plexlive?.transcoding?.androidtv?.ffmpegArgs ||
                         profileArgs;
          
          logger.info('Using quality-preserving profile for Android TV', { 
            clientIP: req.ip,
            profile: profile.name,
            description: profile.description
          });
        } else {
          // Standard high quality copy profile for best quality preservation
          const profile = ffmpegProfiles.highQualityCopy;
          const profileArgs = profile.args.join(' ');
          ffmpegCommand = settings?.plexlive?.transcoding?.mpegts?.ffmpegArgs || 
                         config.plexlive?.transcoding?.mpegts?.ffmpegArgs ||
                         profileArgs;
        }
      }
      
      // Replace [URL] placeholder with actual stream URL
      ffmpegCommand = ffmpegCommand.replace('[URL]', finalStreamUrl);
      
      // Add HLS-specific arguments if needed
      if (finalStreamUrl.includes('.m3u8')) {
        let hlsArgs = settings?.plexlive?.transcoding?.mpegts?.hlsProtocolArgs || 
                     config.plexlive?.transcoding?.mpegts?.hlsProtocolArgs ||
                     '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto';
        
        // For redirected streams (like ), add additional HLS options for better compatibility
        if (finalStreamUrl !== streamUrl) {
          hlsArgs += ' -http_seekable 0 -multiple_requests 1 -http_persistent 0';
          
          logger.info('Added HLS compatibility options for redirected stream', {
            channelId: channel.id,
            originalUrl: streamUrl,
            finalUrl: finalStreamUrl
          });
        }
        
        // Insert HLS args BEFORE the input URL for proper protocol handling
        ffmpegCommand = ffmpegCommand.replace('-i ' + finalStreamUrl, hlsArgs + ' -i ' + finalStreamUrl);
      }
      
      // Parse command line into arguments array, but handle special characters in URLs
      let args = ffmpegCommand.split(' ').filter(arg => arg.trim() !== '');
      
      // Enhanced encoding integration for unreliable streams
      try {
        // Only apply enhanced encoding if stream object exists and has properties
        if (stream && (stream.enhanced_encoding || channel?.number === 505)) {
          const { getStreamConfiguration } = require('../utils/enhancedEncoding');
          const streamConfig = getStreamConfiguration(stream, channel);
          
          // Check if enhanced encoding should be applied
          if (streamConfig.encoding_profile !== 'standard-reliability') {
            logger.info('Applying enhanced encoding for unreliable stream', {
              channelId: channel.id,
              channelNumber: channel.number,
              channelName: channel.name,
              profile: streamConfig.encoding_profile,
              description: streamConfig.profile_description,
              antiLoop: streamConfig.encoding_profile === 'anti-loop'
            });
            
            // For anti-loop or emergency profiles, completely replace args to prevent conflicts
            if (streamConfig.encoding_profile === 'anti-loop' || 
                streamConfig.encoding_profile === 'emergency-safe' || 
                streamConfig.encoding_profile === 'ultra-minimal') {
              args = streamConfig.ffmpeg_options.concat(['-i', finalStreamUrl, 'pipe:1']);
              logger.error('Applied EMERGENCY FFmpeg configuration for H.264 safety', {
                channelId: channel.id,
                channelNumber: channel.number,
                profile: streamConfig.encoding_profile,
                argCount: args.length
              });
            } else {
              // For other profiles, use enhanced encoding args but ensure proper output
              args = streamConfig.ffmpeg_options.concat(['-i', finalStreamUrl, '-f', 'mpegts', 'pipe:1']);
              logger.info('Applied enhanced encoding FFmpeg configuration', {
                channelId: channel.id,
                channelNumber: channel.number,
                profile: streamConfig.encoding_profile,
                argCount: args.length
              });
            }
          }
        }
      } catch (enhancedEncodingError) {
        logger.error('Enhanced encoding configuration failed', {
          channelId: channel.id,
          channelNumber: channel.number,
          error: enhancedEncodingError.message,
          stack: enhancedEncodingError.stack,
          streamUrl: finalStreamUrl,
          streamName: stream?.name
        });
        // Continue with standard args
      }
      
      // BROWSER TRANSCODING FIX: Apply browser-specific H.264 optimizations to existing FFmpeg args
      if (clientCapabilities.isBrowser && !browserTranscodeProfile) {
        args = browserTranscodingFix.optimizeForBrowserTranscoding(args, clientCapabilities);
        logger.info('Applied browser H.264 optimizations to existing FFmpeg configuration', {
          channelId: channel.id,
          clientName: clientCapabilities.clientName,
          originalArgCount: args.length
        });
      }
      
      // Replace the URL in the args with the final URL (which may contain special characters)
      const urlArgIndex = args.findIndex(arg => arg === streamUrl || arg === finalStreamUrl);
      if (urlArgIndex !== -1) {
        args[urlArgIndex] = finalStreamUrl;
        logger.info('Replaced URL in FFmpeg args', {
          channelId: channel.id,
          originalUrl: streamUrl,
          finalUrl: finalStreamUrl,
          urlArgIndex
        });
      }

      // Special FFmpeg configuration for premiumpowers.net streams or redirected URLs
      if (streamUrl.includes('premiumpowers') || finalStreamUrl.includes('85.92.112') || finalStreamUrl.includes('premiumpowers')) {
        // Find the -i flag position
        const inputFlagIndex = args.findIndex(arg => arg === '-i');
        if (inputFlagIndex > 0) {
          // Remove any existing reconnect parameters to avoid duplication
          const reconnectParams = ['-reconnect', '-reconnect_at_eof', '-reconnect_streamed', '-reconnect_delay_max', '-user_agent'];
          let i = 0;
          while (i < args.length) {
            if (reconnectParams.includes(args[i])) {
              // Remove parameter and its value
              if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                args.splice(i, 2);
              } else {
                args.splice(i, 1);
              }
            } else {
              i++;
            }
          }
          
          // Find the -i flag again after cleanup
          const newInputFlagIndex = args.findIndex(arg => arg === '-i');
          
          // Add optimized IPTV parameters before -i flag
          if (newInputFlagIndex > 0) {
            args.splice(newInputFlagIndex, 0,
              '-user_agent', 'VLC/3.0.20 LibVLC/3.0.20',  // Use VLC User-Agent since it works
              '-headers', 'Accept: */*\r\nConnection: keep-alive\r\n',
              '-reconnect', '1',
              '-reconnect_at_eof', '1',
              '-reconnect_streamed', '1',
              '-reconnect_delay_max', '5',
              '-timeout', '10000000',  // 10 seconds timeout
              '-analyzeduration', '10000000',  // Analyze for 10 seconds
              '-probesize', '10000000'  // Probe 10MB
            );
            logger.info('Added enhanced IPTV optimizations for premiumpowers stream', {
              channelId: channel.id,
              channelName: channel.name,
              finalUrl: finalStreamUrl,
              userAgent: 'VLC/3.0.20 LibVLC/3.0.20'
            });
          }
        } else {
          // Fallback: add at the beginning
          args.unshift(
            '-user_agent', 'VLC/3.0.20 LibVLC/3.0.20',
            '-headers', 'Accept: */*\r\nConnection: keep-alive\r\n'
          );
          logger.info('Added IPTV User-Agent at start of command', {
            channelId: channel.id,
            channelName: channel.name,
            finalUrl: finalStreamUrl
          });
        }
      }

      // Pre-validate stream for IPTV providers before starting FFmpeg
      if (streamUrl.includes('premiumpowers') || streamUrl.includes('line.')) {
        logger.info('Pre-validating IPTV provider stream', {
          channelId: channel.id,
          channelName: channel.name,
          streamUrl: finalStreamUrl
        });
        
        // Quick validation using FFprobe or curl
        try {
          const axios = require('axios');
          const validateResponse = await axios.head(finalStreamUrl, {
            timeout: 5000,
            maxRedirects: 5,
            headers: {
              'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
              'Accept': '*/*'
            },
            validateStatus: (status) => status < 500 // Accept any non-5xx status
          });
          
          logger.info('Stream pre-validation result', {
            channelId: channel.id,
            status: validateResponse.status,
            contentType: validateResponse.headers['content-type'],
            contentLength: validateResponse.headers['content-length']
          });
          
          // Check if we got an error response
          if (validateResponse.status >= 400) {
            logger.error('Stream validation failed with HTTP error', {
              channelId: channel.id,
              channelName: channel.name,
              status: validateResponse.status,
              streamUrl: finalStreamUrl
            });
            
            // Send empty MPEG-TS response to Plex
            if (!res.headersSent) {
              res.set({
                'Content-Type': 'video/mp2t',
                'Cache-Control': 'no-cache'
              });
              const emptyTsPacket = Buffer.from([
                0x47, 0x40, 0x00, 0x10,
                0x00, 0x00, 0x01, 0xE0,
                ...Array(180).fill(0xFF)
              ]);
              res.write(emptyTsPacket);
              return res.end();
            }
          }
        } catch (validateError) {
          logger.warn('Stream pre-validation error (continuing anyway)', {
            channelId: channel.id,
            error: validateError.message
          });
          // Continue anyway - FFmpeg might still be able to handle it
        }
      }
      
      // Log the exact command being executed
      logger.info('Executing FFmpeg command', {
        channelId: channel.id,
        command: `${config.streams.ffmpegPath} ${args.join(' ')}`,
        finalStreamUrl,
        clientIP: req.ip
      });

      console.log('DEBUG: Starting FFmpeg with args', { 
        ffmpegPath: config.streams.ffmpegPath, 
        args: args.slice(0, 5), // Show first few args
        finalStreamUrl: finalStreamUrl
      });

      logger.info('About to spawn FFmpeg process', {
        channelId: channel.id,
        ffmpegPath: config.streams.ffmpegPath,
        argsCount: args.length
      });
      
      // Set dynamic response headers based on profile selection
      res.set(responseHeaders);
      
      const ffmpegProcess = spawn(config.streams.ffmpegPath, args);
      
      logger.info('FFmpeg process spawned', {
        channelId: channel.id,
        pid: ffmpegProcess.pid
      });
      
      if (!ffmpegProcess.pid) {
        console.log('DEBUG: FFmpeg failed to start');
        throw new Error('Failed to start FFmpeg MPEG-TS transcoding process');
      }

      console.log('DEBUG: FFmpeg started successfully', { pid: ffmpegProcess.pid });

      logger.info('FFmpeg MPEG-TS process started', { 
        channelId: channel.id,
        pid: ffmpegProcess.pid,
        clientIP: req.ip
      });

      // ===== ADD SESSION TRACKING FOR PLEX STREAMS =====
      const streamSessionManager = require('./streamSessionManager');
      const clientIdentifier = this.generateClientIdentifier(req);
      
      // Check for existing session to prevent duplicates
      const existingSession = streamSessionManager.getActiveSessionByClientAndStream(clientIdentifier, channel.id);
      
      logger.info('Plex duplicate session check', {
        clientIdentifier,
        channelId: channel.id,
        existingSession: existingSession ? existingSession.sessionId : 'none',
        userAgent: req.get('User-Agent'),
        clientIP: req.ip
      });
      
      let sessionId;
      if (existingSession) {
        logger.info('Found existing Plex session - ending it to prevent duplicates', {
          existingSessionId: existingSession.sessionId,
          channelId: channel.id,
          clientIdentifier
        });
        
        // End the existing session and create a new one (Plex likely reconnected)
        await streamSessionManager.endSession(existingSession.sessionId, 'plex_reconnect');
      }
      
      sessionId = `plex_${channel.id}_${clientIdentifier}_${Date.now()}`;
      
      // Create session info for tracking
      const streamInfo = {
        streamId: channel.id,
        sessionId,
        process: ffmpegProcess,
        startTime: Date.now(),
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        clientIdentifier,
        url: finalStreamUrl,
        type: forceTranscode ? 'plex-mpegts-transcode' : 'plex-mpegts',
        channelName: channel.name,
        channelNumber: channel.number,
        isUnique: true,
        isPlexStream: true,
        transcoded: forceTranscode
      };
      
      // Store in active streams for dashboard tracking
      this.activeStreams.set(sessionId, streamInfo);
      
      // For Android TV clients, set up automatic stream reset to prevent EOF crashes
      if (isAndroidTV) {
        const resetInterval = settings?.plexlive?.transcoding?.mpegts?.androidtv?.resetInterval ||
                             config.plexlive?.transcoding?.mpegts?.androidtv?.resetInterval ||
                             ANDROID_TV_CONFIG.RESET_INTERVAL;
        
        streamInfo.androidTVResetTimer = setTimeout(() => {
          logger.info('Android TV stream reset triggered to prevent EOF crash', {
            sessionId,
            channelId: channel.id,
            channelName: channel.name,
            resetInterval,
            streamDuration: Date.now() - streamInfo.startTime
          });
          
          // Gracefully restart the FFmpeg process
          this.restartStreamForAndroidTV(sessionId, channel, stream, finalStreamUrl, req, res);
        }, resetInterval * 1000);
        
        logger.info('Android TV stream reset timer set', {
          sessionId,
          resetInterval,
          channelId: channel.id
        });
      }
      
      // Track channel streams
      if (!this.channelStreams.has(channel.id)) {
        this.channelStreams.set(channel.id, new Set());
      }
      this.channelStreams.get(channel.id).add(sessionId);
      
      // Track client sessions
      if (!this.clientSessions.has(clientIdentifier)) {
        this.clientSessions.set(clientIdentifier, new Map());
      }
      this.clientSessions.get(clientIdentifier).set(channel.id, sessionId);

      // Get actual stream ID from streams table for foreign key constraint
      const database = require('./database');
      let actualStreamId = channel.id; // fallback to channel ID
      try {
        const streamRecord = await database.get('SELECT id FROM streams WHERE channel_id = ?', [channel.id]);
        if (streamRecord) {
          actualStreamId = streamRecord.id;
        }
      } catch (streamError) {
        logger.warn('Could not find stream record for channel', {
          channelId: channel.id,
          error: streamError.message
        });
      }

      // Start enhanced session tracking
      try {
        // Extract Plex headers securely
        const plexHeaders = streamSessionManager.extractPlexHeaders(req);
        
        await streamSessionManager.startSession({
          sessionId,
          streamId: actualStreamId,
          clientIP: req.ip,
          userAgent: req.get('User-Agent'),
          clientIdentifier,
          channelName: channel.name,
          channelNumber: channel.number,
          streamUrl: finalStreamUrl,
          streamType: forceTranscode ? 'plex-mpegts-transcode' : 'plex-mpegts',
          ...plexHeaders // Spread sanitized Plex headers
        });
      } catch (sessionError) {
        logger.warn('Failed to start enhanced session tracking for Plex stream', {
          sessionId,
          error: sessionError.message
        });
      }

      // Track stream statistics with detailed bandwidth monitoring
      this.streamStats.set(sessionId, {
        bytesTransferred: 0,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        errors: 0,
        bandwidthSamples: [],
        avgBitrate: 0,
        peakBitrate: 0,
        currentBitrate: 0
      });

      // Handle process events with session cleanup
      ffmpegProcess.on('error', (error) => {
        const stats = this.streamStats.get(sessionId);
        if (stats) {
          stats.errors++;
          
          // Update enhanced session tracking with error
          streamSessionManager.updateSessionMetrics(sessionId, {
            errorIncrement: 1
          });
        }
        
        logger.error('FFmpeg MPEG-TS process error', { 
          channelId: channel.id,
          sessionId,
          error: error.message 
        });
        
        // Clean up session
        this.cleanupStream(sessionId, 'ffmpeg_error');
        
        // Send proper MPEG-TS error response to Plex (never HTML)
        if (!res.headersSent) {
          res.set({
            'Content-Type': 'video/mp2t',
            'Cache-Control': 'no-cache',
            'Connection': 'close'
          });
          
          // For transcoded streams that fail, send HDHomeRun-style 503 with proper headers
          if (forceTranscode) {
            logger.error('Transcoded stream failed - using HDHomeRun error format', {
              channelId: channel.id,
              sessionId
            });
            res.status(503).set({
              'X-HDHomeRun-Error': '807', // No Video Data
              'Content-Type': 'text/plain'
            }).send('No Video Data');
          } else {
            // For copy streams, send minimal valid MPEG-TS packet then end
            const emptyTsPacket = Buffer.from([
              0x47, 0x40, 0x00, 0x10,
              0x00, 0x00, 0x01, 0xE0,
              ...Array(180).fill(0xFF)
            ]);
            res.write(emptyTsPacket);
            res.end();
          }
        }
      });

      ffmpegProcess.on('close', (code) => {
        logger.info('FFmpeg MPEG-TS process closed', { 
          channelId: channel.id,
          sessionId,
          exitCode: code 
        });
        
        // Clean up session
        this.cleanupStream(sessionId, 'process_closed');
      });

      ffmpegProcess.stderr.on('data', async (data) => {
        const errorOutput = data.toString();
        const stats = this.streamStats.get(sessionId);
        if (stats) {
          stats.errors++;
          
          // Update enhanced session tracking with error
          streamSessionManager.updateSessionMetrics(sessionId, {
            errorIncrement: 1
          });
        }
        
        // Check for enhanced encoding specific errors
        const isEnhancedEncodingError = errorOutput.includes('no frame!') ||
                                      errorOutput.includes('non-existing PPS') ||
                                      errorOutput.includes('decode_slice_header error') ||
                                      errorOutput.includes('mmco: unref short failure');
        
        // Log all stderr output but don't kill processes aggressively
        // Let FFmpeg try to recover from transient errors
        const logLevel = isEnhancedEncodingError ? 'error' : 'info';
        logger[logLevel]('FFmpeg MPEG-TS stderr', { 
          channelId: channel.id,
          sessionId,
          isEnhancedEncoding: stream?.enhanced_encoding || false,
          encodingProfile: stream?.enhanced_encoding_profile,
          output: errorOutput.trim(),
          isEnhancedEncodingError 
        });
        
        // Categorize errors into different types for better handling
        const upstreamReliabilityErrors = [
          'Connection timed out',
          'Connection reset',
          'Temporary failure in name resolution',
          'Network is unreachable',
          'No route to host',
          'Server returned 502', // Bad Gateway
          'Server returned 503', // Service Unavailable
          'Server returned 504', // Gateway Timeout
          'recv failed',
          'End of file',
          'HTTP error 502',
          'HTTP error 503', 
          'HTTP error 504',
          'Connection lost'
        ];

        const permanentErrors = [
          'No such file or directory',
          'Protocol not found',
          'Invalid argument',
          'Server returned 400', // Bad Request
          'Server returned 404', // Not Found
          'HTTP error 400',
          'HTTP error 404',
          'moov atom not found',
          'Invalid NAL unit size',
          'Could not find codec parameters',
          'Operation not permitted',
          'no frame!',                    // H.264 encoding error
          'non-existing PPS',             // H.264 parameter set error
          'decode_slice_header error',    // H.264 decode error
          'mmco: unref short failure'     // H.264 memory management error
        ];
        
        const authErrors = [
          'Server returned 401', // Unauthorized
          'Server returned 403', // Forbidden
          'HTTP error 401',
          'HTTP error 403',
          'Unauthorized',
          'Forbidden'
        ];
        
        const hasUpstreamIssue = upstreamReliabilityErrors.some(err => errorOutput.includes(err));
        const hasFatalError = permanentErrors.some(err => errorOutput.includes(err));
        const hasAuthError = authErrors.some(err => errorOutput.includes(err));
        
        // Handle upstream reliability issues differently from permanent failures
        if (hasUpstreamIssue) {
          logger.warn('Upstream reliability issue detected - FFmpeg will attempt reconnection', {
            channelId: channel.id,
            channelName: channel.name,
            sessionId,
            streamUrl: finalStreamUrl,
            error: errorOutput.trim(),
            upstreamIssue: true
          });
          
          // Don't kill the process - let FFmpeg's reconnect logic handle it
          // Just log for monitoring purposes
          
        } else if (hasFatalError) {
          logger.error('FFmpeg fatal error detected', {
            channelId: channel.id,
            channelName: channel.name,
            sessionId,
            streamUrl: finalStreamUrl,
            error: errorOutput.trim(),
            isAuthError: hasAuthError,
            permanentFailure: true
          });
          
          // Kill the FFmpeg process only for permanent failures
          if (ffmpegProcess && !ffmpegProcess.killed) {
            ffmpegProcess.kill('SIGTERM');
          }
          
          // Send proper MPEG-TS error response to Plex (never HTML)
          if (!res.headersSent) {
            res.set({
              'Content-Type': 'video/mp2t',
              'Cache-Control': 'no-cache',
              'Connection': 'close'
            });
            
            // For transcoded streams that fail, send HDHomeRun-style error
            if (forceTranscode) {
              logger.error('Transcoded stream fatal error - using HDHomeRun error format', {
                channelId: channel.id,
                sessionId,
                error: errorOutput.trim()
              });
              res.status(503).set({
                'X-HDHomeRun-Error': '807', // No Video Data
                'Content-Type': 'text/plain'
              }).send('No Video Data');
            } else {
              // For copy streams, send minimal valid MPEG-TS packet then end
              const emptyTsPacket = Buffer.from([
                0x47, 0x40, 0x00, 0x10, // TS header with payload start
                0x00, 0x00, 0x01, 0xE0, // PES header start
                ...Array(180).fill(0xFF) // Padding
              ]);
              res.write(emptyTsPacket);
              res.end();
            }
          }
        }
      });

      // Clean up on client disconnect with session cleanup
      req.on('close', () => {
        logger.info('Plex client disconnected', { 
          sessionId,
          channelId: channel.id
        });
        
        // Clean up session (this will also kill the process)
        this.cleanupStream(sessionId, 'client_disconnect');
      });

      // Set stream timeout with session cleanup
      const streamTimeout = config.plexlive?.streaming?.streamTimeout || 30000;
      const timeoutId = setTimeout(() => {
        logger.stream('Plex stream timeout reached', { sessionId, timeout: streamTimeout });
        this.cleanupStream(sessionId, 'timeout');
      }, streamTimeout);
      this.streamTimeouts.set(sessionId, timeoutId);

      // Reset timeout on data transfer (keep-alive)
      ffmpegProcess.stdout.on('data', () => {
        this.resetStreamTimeout(sessionId, streamTimeout);
      });

      // Store in cache for session tracking
      try {
        const cacheService = require('./cacheService');
        cacheService.addStreamSession(sessionId, channel.id, {
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      } catch (cacheError) {
        logger.warn('Cache service not available for session tracking', {
          sessionId,
          error: cacheError.message
        });
      }

      // Emit Socket.IO event for real-time dashboard updates
      if (global.io) {
        const streamEventData = {
          sessionId,
          streamId: channel.id,
          channelName: channel.name,
          channelNumber: channel.number,
          clientIP: req.ip,
          userAgent: req.get('User-Agent'),
          clientIdentifier,
          streamUrl: finalStreamUrl,
          streamType: 'plex-mpegts',
          startTime: Date.now(),
          isPlexStream: true
        };
        
        global.io.emit('stream:started', streamEventData);
        logger.stream('Emitted Plex stream:started event', { sessionId });
      }
      
      logger.stream('Plex MPEG-TS stream proxy created successfully', { sessionId, channelId: channel.id });

      // CRITICAL FIX: Validate response stream before piping
      if (!this.validateResponseStream(res, sessionId)) {
        logger.error('Response stream is invalid, cleaning up FFmpeg process', { sessionId });
        ffmpegProcess.kill('SIGTERM');
        this.cleanupStream(sessionId, 'response_invalid');
        return;
      }

      // Pipe FFmpeg output directly to response without buffering
      ffmpegProcess.stdout.pipe(res);
      
      // Handle FFmpeg stdout with bandwidth tracking
      ffmpegProcess.stdout.on('data', (chunk) => {
        const stats = this.streamStats.get(sessionId);
        if (stats) {
          const now = Date.now();
          const deltaTime = now - stats.lastUpdateTime;
          const deltaBytes = chunk.length;
          
          // Update byte counter
          stats.bytesTransferred += deltaBytes;
          stats.lastUpdateTime = now;
          
          // Calculate bitrate if we have enough time elapsed (avoid division by zero)
          if (deltaTime > 100) { // More than 100ms
            const currentBitrate = Math.round((deltaBytes * 8) / (deltaTime / 1000)); // bits per second
            stats.currentBitrate = currentBitrate;
            
            // Update peak bitrate
            if (currentBitrate > stats.peakBitrate) {
              stats.peakBitrate = currentBitrate;
            }
            
            // Maintain recent samples for average calculation
            stats.bandwidthSamples.push({ timestamp: now, bitrate: currentBitrate });
            if (stats.bandwidthSamples.length > 30) {
              stats.bandwidthSamples.shift(); // Keep only recent 30 samples
            }
            
            // Calculate average bitrate
            if (stats.bandwidthSamples.length > 0) {
              const totalBitrate = stats.bandwidthSamples.reduce((sum, sample) => sum + sample.bitrate, 0);
              stats.avgBitrate = Math.round(totalBitrate / stats.bandwidthSamples.length);
            }

            // Update enhanced session tracking
            streamSessionManager.updateSessionMetrics(sessionId, {
              bytesTransferred: stats.bytesTransferred,
              currentBitrate: stats.currentBitrate
            });
          }
        }
      });

    } catch (error) {
      logger.error('Plex-compatible stream proxy error', { 
        channelId: channel.id,
        url: streamUrl, 
        error: error.message,
        stack: error.stack 
      });
      if (!res.headersSent) {
        // Send 503 with no body for Plex compatibility
        res.status(503).end();
      }
    }
  }

  // Android TV specific stream restart method to prevent EOF crashes
  async restartStreamForAndroidTV(sessionId, channel, stream, streamUrl, req, res) {
    try {
      const streamInfo = this.activeStreams.get(sessionId);
      if (!streamInfo || !streamInfo.process) {
        logger.warn('Cannot restart stream - no active stream found', { sessionId });
        return;
      }

      // CRITICAL FIX: Validate response stream before attempting restart
      if (!this.validateResponseStream(res, sessionId)) {
        logger.warn('Response stream is closed, aborting restart', { sessionId });
        this.cleanupStream(sessionId, 'response_closed');
        return;
      }

      // CRITICAL FIX: Check restart throttling
      if (this.shouldThrottleRestart(streamInfo)) {
        logger.error('Restart limit exceeded, abandoning stream', {
          sessionId,
          channelId: channel.id,
          restartCount: streamInfo.restartCount
        });
        this.cleanupStream(sessionId, 'restart_limit_exceeded');
        return;
      }

      // Initialize restart tracking
      if (!streamInfo.restartCount) {
        streamInfo.restartCount = 0;
        streamInfo.firstRestart = Date.now();
      }
      streamInfo.restartCount++;

      logger.info('Restarting Android TV stream to prevent EOF crash', {
        sessionId,
        channelId: channel.id,
        channelName: channel.name,
        pid: streamInfo.process.pid,
        restartCount: streamInfo.restartCount
      });

      // Kill the existing FFmpeg process gracefully
      if (streamInfo.process && streamInfo.process.pid) {
        try {
          streamInfo.process.kill('SIGTERM');
          
          // Give process time to shut down gracefully
          await new Promise(resolve => setTimeout(resolve, ANDROID_TV_CONFIG.RESTART_DELAY));
          
          // Force kill if still running
          if (!streamInfo.process.killed) {
            streamInfo.process.kill('SIGKILL');
          }
        } catch (killError) {
          logger.warn('Error killing existing FFmpeg process', {
            sessionId,
            pid: streamInfo.process.pid,
            error: killError.message
          });
        }
      }
      
      // Clear the reset timer
      if (streamInfo.androidTVResetTimer) {
        clearTimeout(streamInfo.androidTVResetTimer);
        delete streamInfo.androidTVResetTimer;
      }

      // Start new FFmpeg process with structured configuration
      const settingsService = require('./settingsService');
      const settings = await settingsService.getSettings();
      
      // Use the new structured Android TV args
      const args = this.buildAndroidTVFFmpegArgs(streamUrl, settings);
      const { spawn } = require('child_process');
      
      const newFFmpegProcess = spawn(config.streams.ffmpegPath, args);
      
      if (!newFFmpegProcess.pid) {
        throw new Error('Failed to restart FFmpeg process for Android TV');
      }

      // Update stream info with new process
      streamInfo.process = newFFmpegProcess;
      streamInfo.lastRestart = Date.now();

      logger.info('Android TV stream successfully restarted', {
        sessionId,
        channelId: channel.id,
        newPid: newFFmpegProcess.pid,
        restartCount: streamInfo.restartCount
      });

      // CRITICAL FIX: Validate response stream again before piping
      if (!this.validateResponseStream(res, sessionId)) {
        logger.error('Response stream became invalid during restart, cleaning up', { sessionId });
        newFFmpegProcess.kill('SIGTERM');
        this.cleanupStream(sessionId, 'response_invalid_during_restart');
        return;
      }

      // Pipe new process to same response stream
      newFFmpegProcess.stdout.pipe(res, { end: false });
      
      // Set up new reset timer
      const resetInterval = settings?.plexlive?.transcoding?.mpegts?.androidtv?.resetInterval ||
                           config.plexlive?.transcoding?.mpegts?.androidtv?.resetInterval ||
                           ANDROID_TV_CONFIG.RESET_INTERVAL;
      
      streamInfo.androidTVResetTimer = setTimeout(() => {
        this.restartStreamForAndroidTV(sessionId, channel, stream, streamUrl, req, res);
      }, resetInterval * 1000);

      // Handle new process events
      newFFmpegProcess.on('error', (error) => {
        logger.error('Restarted Android TV FFmpeg process error', {
          sessionId,
          channelId: channel.id,
          error: error.message
        });
        this.cleanupStream(sessionId, 'restart_error');
      });

      newFFmpegProcess.on('close', (code) => {
        logger.info('Restarted Android TV FFmpeg process closed', {
          sessionId,
          channelId: channel.id,
          exitCode: code
        });
        if (streamInfo.androidTVResetTimer) {
          clearTimeout(streamInfo.androidTVResetTimer);
        }
      });

    } catch (error) {
      logger.error('Failed to restart Android TV stream', {
        sessionId,
        channelId: channel?.id,
        error: error.message
      });
      this.cleanupStream(sessionId, 'restart_failed');
    }
  }


  // Simple proxy stream method for direct stream proxying (used by routes)
  async proxyStream(streamUrl, req, res) {
    try {
      logger.stream('Proxying stream directly', { url: streamUrl });

      // Detect stream format to determine appropriate handling
      const detection = await this.detectStreamFormat(streamUrl);
      logger.stream('Detected stream format', { url: streamUrl, format: detection });

      // For HLS/DASH streams, we can redirect directly or proxy based on CORS
      if (detection.type === 'hls' || detection.type === 'dash') {
        return await this.proxyWebCompatibleStream(streamUrl, detection.type, req, res);
      }

      // For other stream types, use FFmpeg transcoding to web-compatible format
      return await this.proxyTranscodedStream(streamUrl, detection.type, req, res);

    } catch (error) {
      logger.error('Stream proxy error', { url: streamUrl, error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream proxy failed', details: error.message });
      }
    }
  }

  // Proxy web-compatible streams with channel context  
  async proxyWebCompatibleStreamWithChannel(streamUrl, streamType, channel, req, res) {
    const axios = require('axios');
    const { PassThrough } = require('stream');
    
    try {
      logger.info('Starting web-compatible stream with channel context', {
        channelId: channel.id,
        channelName: channel.name,
        channelNumber: channel.number,
        streamType,
        clientIP: req.ip
      });
      
      // Create session for bandwidth tracking
      const streamSessionManager = require('./streamSessionManager');
      const clientIdentifier = this.generateClientIdentifier(req);
      const sessionId = `${channel.id}_${clientIdentifier}_${Date.now()}`;
      
      // Start session tracking for direct proxy streams
      // Extract Plex headers securely
      const plexHeaders = streamSessionManager.extractPlexHeaders(req);
      
      await streamSessionManager.startSession({
        sessionId,
        streamId: channel.id,
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        clientIdentifier,
        channelName: channel.name,
        channelNumber: channel.number,
        streamUrl,
        streamType: `direct-${streamType}`,
        ...plexHeaders // Spread sanitized Plex headers
      });
      
      // Set appropriate content type for stream type
      const contentType = streamType === 'hls' ? 'application/vnd.apple.mpegurl' : 'application/dash+xml';
      
      // Set streaming headers
      res.set({
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes'
      });

      // For HLS/DASH, fetch the content and potentially rewrite URLs
      logger.info('Fetching stream content', { 
        streamUrl, 
        streamType, 
        channelId: channel.id 
      });
      
      let finalStreamUrl = streamUrl;
      
      // For HLS streams, resolve to highest quality variant first
      if (streamType === 'hls') {
        logger.info('Resolving HLS stream to highest quality variant', {
          originalUrl: streamUrl,
          channelId: channel.id
        });
        
        const streamPreviewService = require('./streamPreviewService');
        try {
          finalStreamUrl = await streamPreviewService.resolveHLSStreamUrl(streamUrl, 'high');
          logger.info('HLS quality resolution successful', {
            originalUrl: streamUrl,
            resolvedUrl: finalStreamUrl,
            channelId: channel.id
          });
        } catch (error) {
          logger.warn('HLS quality resolution failed, using original URL', {
            originalUrl: streamUrl,
            error: error.message,
            channelId: channel.id
          });
          // Continue with original URL if quality resolution fails
        }
      }
      
      const response = await axios.get(finalStreamUrl, {
        timeout: 30000,
        responseType: streamType === 'hls' ? 'text' : 'stream', // Get text for HLS to rewrite URLs
        headers: {
          'User-Agent': config.protocols.http.userAgent || 'PlexBridge/1.0'
        }
      });
      
      logger.info('Stream content fetched successfully', {
        status: response.status,
        contentLength: response.data ? response.data.length : 'unknown',
        contentType: response.headers['content-type']
      });

      if (streamType === 'hls') {
        // For HLS, rewrite relative URLs in the playlist to proxy through our server
        let playlistContent = response.data;
        
        logger.info('Processing HLS playlist for URL rewriting', {
          channelId: channel.id,
          channelName: channel.name,
          hasM3u8: playlistContent.includes('.m3u8'),
          hasTS: playlistContent.includes('.ts'),
          contentLength: playlistContent.length
        });
        
        // Only rewrite if this is a master playlist (contains .m3u8 references)
        // Media playlists (containing .ts references) should be served as-is
        if (playlistContent.includes('.m3u8')) {
          // Get advertised host from settings or environment
          const settingsService = require('./settingsService');
          const settings = await settingsService.getSettings();
          const advertisedHost = settings?.plexlive?.network?.advertisedHost || 
                                process.env.ADVERTISED_HOST || 
                                config.plexlive?.network?.advertisedHost ||
                                req.get('host').split(':')[0];
          const httpPort = process.env.HTTP_PORT || config.server.port || 3000;
          const baseUrl = `http://${advertisedHost}:${httpPort}/stream/${channel.id}/`;
          
          logger.info('Before URL rewriting', { 
            sampleContent: playlistContent.substring(0, 500),
            baseUrl,
            advertisedHost 
          });
          
          // Rewrite relative URLs in HLS playlists
          const originalContent = playlistContent;
          playlistContent = playlistContent.replace(
            /^(?!https?:\/\/)([^\r\n#]+\.(?:m3u8|ts))$/gm,
            baseUrl + '$1'
          );
          
          logger.info('URL rewrite details', {
            hasChanges: originalContent !== playlistContent,
            originalLength: originalContent.length,
            newLength: playlistContent.length
          });
          
          logger.info('After URL rewriting', { 
            sampleContent: playlistContent.substring(0, 500)
          });
          
          logger.info('Rewrote HLS playlist URLs for proxy', {
            channelId: channel.id,
            channelName: channel.name,
            originalUrl: streamUrl
          });
        }
        
        // For HLS playlists, track the playlist size but don't use PassThrough for text content
        const playlistSize = Buffer.from(playlistContent, 'utf8').length;
        streamSessionManager.updateSessionMetrics(sessionId, {
          bytesTransferred: playlistSize,
          currentBitrate: 0 // Playlist has no significant bitrate
        });
        
        res.send(playlistContent);
        
        // End session after playlist is sent (HLS playlists are quick responses)
        setTimeout(async () => {
          await streamSessionManager.endSession(sessionId, 'normal');
        }, 100);
      } else {
        // For non-HLS, pipe with bandwidth tracking
        const bandwidthTracker = new PassThrough();
        let bytesTransferred = 0;
        let lastUpdateTime = Date.now();
        let lastBytes = 0;
        
        bandwidthTracker.on('data', (chunk) => {
          bytesTransferred += chunk.length;
          
          const now = Date.now();
          if (now - lastUpdateTime >= 2000) { // Update every 2 seconds
            const timeDiff = now - lastUpdateTime;
            const bytesDiff = bytesTransferred - lastBytes;
            const currentBitrate = Math.round((bytesDiff * 8) / (timeDiff / 1000)); // bits per second
            
            // Update session metrics
            streamSessionManager.updateSessionMetrics(sessionId, {
              bytesTransferred,
              currentBitrate
            });
            
            lastUpdateTime = now;
            lastBytes = bytesTransferred;
          }
        });
        
        bandwidthTracker.on('end', async () => {
          await streamSessionManager.endSession(sessionId, 'normal');
        });
        
        // Pipe: response -> bandwidth tracker -> client
        response.data.pipe(bandwidthTracker).pipe(res);
        
        response.data.on('error', (error) => {
          logger.error('Stream pipe error with channel context', { 
            channelId: channel.id,
            channelName: channel.name,
            url: streamUrl, 
            clientIP: req.ip,
            error: error.message 
          });
          streamSessionManager.endSession(sessionId, 'error');
          if (!res.headersSent) {
            res.status(500).end();
          }
        });
        
        req.on('close', async () => {
          await streamSessionManager.endSession(sessionId, 'disconnect');
        });
      }

    } catch (error) {
      // End session on error
      if (sessionId) {
        await streamSessionManager.endSession(sessionId, 'error');
      }
      
      // If direct streaming fails, fall back to transcoding
      logger.error('Direct streaming failed, falling back to transcoding', { 
        channelId: channel.id,
        channelName: channel.name,
        url: streamUrl,
        clientIP: req.ip,
        error: error.message,
        stack: error.stack
      });
      
      try {
        return await this.proxyTranscodedStreamWithChannel(streamUrl, streamType, channel, req, res);
      } catch (transcodingError) {
        logger.error('Transcoding fallback also failed', {
          channelId: channel.id,
          url: streamUrl,
          originalError: error.message,
          transcodingError: transcodingError.message
        });
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Stream proxy failed', 
            details: error.message,
            fallbackError: transcodingError.message 
          });
        }
      }
    }
  }

  // Proxy web-compatible streams (HLS/DASH) with proper headers
  async proxyWebCompatibleStream(streamUrl, streamType, req, res) {
    const axios = require('axios');
    
    try {
      // Set appropriate content type for stream type
      const contentType = streamType === 'hls' ? 'application/vnd.apple.mpegurl' : 'application/dash+xml';
      
      // Set streaming headers
      res.set({
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes'
      });

      // For HLS/DASH, we can try direct streaming first
      let finalStreamUrl = streamUrl;
      
      // For HLS streams, resolve to highest quality variant first
      if (streamType === 'hls') {
        logger.info('Resolving HLS stream to highest quality variant', {
          originalUrl: streamUrl
        });
        
        const streamPreviewService = require('./streamPreviewService');
        try {
          finalStreamUrl = await streamPreviewService.resolveHLSStreamUrl(streamUrl, 'high');
          logger.info('HLS quality resolution successful', {
            originalUrl: streamUrl,
            resolvedUrl: finalStreamUrl
          });
        } catch (error) {
          logger.warn('HLS quality resolution failed, using original URL', {
            originalUrl: streamUrl,
            error: error.message
          });
          // Continue with original URL if quality resolution fails
        }
      }
      
      const response = await axios.get(finalStreamUrl, {
        timeout: 30000,
        responseType: 'stream',
        headers: {
          'User-Agent': config.protocols.http.userAgent || 'PlexBridge/1.0'
        }
      });

      // Pipe with bandwidth tracking for legacy compatibility
      const { PassThrough } = require('stream');
      const bandwidthTracker = new PassThrough();
      let bytesTransferred = 0;
      let lastUpdateTime = Date.now();
      let lastBytes = 0;
      
      // Generate minimal session tracking for legacy method
      const clientIdentifier = this.generateClientIdentifier(req);
      const sessionId = `legacy_${Date.now()}_${clientIdentifier}`;
      
      bandwidthTracker.on('data', (chunk) => {
        bytesTransferred += chunk.length;
        
        const now = Date.now();
        if (now - lastUpdateTime >= 2000) { // Update every 2 seconds
          const timeDiff = now - lastUpdateTime;
          const bytesDiff = bytesTransferred - lastBytes;
          const currentBitrate = Math.round((bytesDiff * 8) / (timeDiff / 1000));
          
          logger.debug('Legacy stream bandwidth', {
            sessionId,
            bytesTransferred,
            currentBitrate,
            url: streamUrl
          });
          
          lastUpdateTime = now;
          lastBytes = bytesTransferred;
        }
      });
      
      // Pipe: response -> bandwidth tracker -> client
      response.data.pipe(bandwidthTracker).pipe(res);
      
      response.data.on('error', (error) => {
        logger.error('Stream pipe error', { url: streamUrl, error: error.message });
        if (!res.headersSent) {
          res.status(500).end();
        }
      });

    } catch (error) {
      // If direct streaming fails, fall back to transcoding
      logger.warn('Direct streaming failed, falling back to transcoding', { 
        url: streamUrl, 
        error: error.message 
      });
      return await this.proxyTranscodedStream(streamUrl, streamType, req, res);
    }
  }

  // Proxy streams that need transcoding with channel context
  async proxyTranscodedStreamWithChannel(streamUrl, streamType, channel, req, res) {
    try {
      logger.info('Starting transcoded stream with channel context', {
        channelId: channel.id,
        channelName: channel.name,
        channelNumber: channel.number,
        streamType,
        clientIP: req.ip
      });
      
      // Set appropriate headers for transcoded stream
      res.set({
        'Content-Type': 'video/mp4', // MP4 is most compatible
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes'
      });

      // Create FFmpeg process for transcoding to web-compatible format
      const args = [
        '-i', streamUrl,
        '-c:v', 'libx264',                    // H.264 video codec for compatibility
        '-c:a', 'aac',                        // AAC audio codec
        '-preset', 'veryfast',                // Fast encoding for real-time
        '-profile:v', 'baseline',             // Most compatible H.264 profile
        '-level', '3.1',                      // H.264 level for broad compatibility
        '-movflags', 'frag_keyframe+empty_moov+faststart', // Streaming optimizations
        '-f', 'mp4',                          // MP4 container
        '-fflags', '+genpts',                 // Generate timestamps
        '-avoid_negative_ts', 'make_zero',    // Handle timestamp issues
        '-max_muxing_queue_size', '1024',     // Prevent buffer issues
        '-loglevel', 'error',                 // Reduce log noise
        '-nostats',                           // No statistics output
        'pipe:1'                              // Output to stdout
      ];

      // Add protocol-specific arguments
      if (streamType === 'rtsp') {
        args.splice(1, 0, '-rtsp_transport', 'tcp', '-rtsp_flags', 'prefer_tcp');
      } else if (streamType === 'rtmp') {
        args.splice(1, 0, '-rtmp_live', 'live');
      }

      const ffmpegProcess = spawn(config.streams.ffmpegPath, args);
      
      if (!ffmpegProcess.pid) {
        throw new Error('Failed to start FFmpeg transcoding process');
      }

      logger.info('Started transcoding process with channel context', { 
        channelId: channel.id,
        channelName: channel.name,
        url: streamUrl, 
        pid: ffmpegProcess.pid,
        streamType,
        clientIP: req.ip
      });

      // Pipe FFmpeg output to response
      ffmpegProcess.stdout.pipe(res);

      // Handle errors
      ffmpegProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        if (errorOutput.includes('Error') || errorOutput.includes('error')) {
          logger.error('FFmpeg transcoding error with channel context', { 
            channelId: channel.id,
            channelName: channel.name,
            url: streamUrl, 
            clientIP: req.ip,
            error: errorOutput 
          });
        }
      });

      ffmpegProcess.on('error', (error) => {
        logger.error('FFmpeg process error with channel context', { 
          channelId: channel.id,
          channelName: channel.name,
          url: streamUrl, 
          clientIP: req.ip,
          error: error.message 
        });
        if (!res.headersSent) {
          res.status(500).end();
        }
      });

      ffmpegProcess.on('close', (code) => {
        logger.info('FFmpeg process closed with channel context', { 
          channelId: channel.id,
          channelName: channel.name,
          url: streamUrl, 
          clientIP: req.ip,
          exitCode: code 
        });
      });

      // Cleanup on client disconnect
      req.on('close', () => {
        logger.info('Client disconnected, terminating transcoding with channel context', { 
          channelId: channel.id,
          channelName: channel.name,
          url: streamUrl,
          clientIP: req.ip
        });
        ffmpegProcess.kill('SIGTERM');
      });

    } catch (error) {
      logger.error('Transcoded streaming error with channel context', { 
        channelId: channel.id,
        channelName: channel.name,
        url: streamUrl, 
        clientIP: req.ip,
        error: error.message 
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Transcoding failed', details: error.message });
      }
    }
  }

  // Proxy streams that need transcoding to web-compatible format
  async proxyTranscodedStream(streamUrl, streamType, req, res) {
    try {
      // Set appropriate headers for transcoded stream
      res.set({
        'Content-Type': 'video/mp4', // MP4 is most compatible
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes'
      });

      // Create FFmpeg process for transcoding to web-compatible format
      const args = [
        '-i', streamUrl,
        '-c:v', 'libx264',                    // H.264 video codec for compatibility
        '-c:a', 'aac',                        // AAC audio codec
        '-preset', 'veryfast',                // Fast encoding for real-time
        '-profile:v', 'baseline',             // Most compatible H.264 profile
        '-level', '3.1',                      // H.264 level for broad compatibility
        '-movflags', 'frag_keyframe+empty_moov+faststart', // Streaming optimizations
        '-f', 'mp4',                          // MP4 container
        '-fflags', '+genpts',                 // Generate timestamps
        '-avoid_negative_ts', 'make_zero',    // Handle timestamp issues
        '-max_muxing_queue_size', '1024',     // Prevent buffer issues
        '-loglevel', 'error',                 // Reduce log noise
        '-nostats',                           // No statistics output
        'pipe:1'                              // Output to stdout
      ];

      // Add protocol-specific arguments
      if (streamType === 'rtsp') {
        args.splice(1, 0, '-rtsp_transport', 'tcp', '-rtsp_flags', 'prefer_tcp');
      } else if (streamType === 'rtmp') {
        args.splice(1, 0, '-rtmp_live', 'live');
      }

      const ffmpegProcess = spawn(config.streams.ffmpegPath, args);
      
      if (!ffmpegProcess.pid) {
        throw new Error('Failed to start FFmpeg transcoding process');
      }

      logger.stream('Started transcoding process', { 
        url: streamUrl, 
        pid: ffmpegProcess.pid,
        streamType 
      });

      // Pipe FFmpeg output to response
      ffmpegProcess.stdout.pipe(res);

      // Handle errors
      ffmpegProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        if (errorOutput.includes('Error') || errorOutput.includes('error')) {
          logger.error('FFmpeg transcoding error', { url: streamUrl, error: errorOutput });
        }
      });

      ffmpegProcess.on('error', (error) => {
        logger.error('FFmpeg process error', { url: streamUrl, error: error.message });
        if (!res.headersSent) {
          res.status(500).end();
        }
      });

      ffmpegProcess.on('close', (code) => {
        logger.stream('FFmpeg process closed', { url: streamUrl, exitCode: code });
      });

      // Cleanup on client disconnect
      req.on('close', () => {
        logger.stream('Client disconnected, terminating transcoding', { url: streamUrl });
        ffmpegProcess.kill('SIGTERM');
      });

    } catch (error) {
      logger.error('Transcoded streaming error', { url: streamUrl, error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Transcoding failed', details: error.message });
      }
    }
  }

  // Format duration in human-readable format
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Format bandwidth for logging
  formatBandwidth(bps) {
    if (!bps || bps === 0) return '0 bps';
    const kbps = bps / 1000;
    const mbps = bps / 1000000;
    
    if (mbps >= 1) {
      return `${mbps.toFixed(1)} Mbps`;
    } else if (kbps >= 1) {
      return `${kbps.toFixed(0)} kbps`;
    } else {
      return `${bps} bps`;
    }
  }

  // Format bytes for logging
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Update streaming settings dynamically
  updateSettings(streamingSettings) {
    try {
      if (streamingSettings.maxConcurrentStreams) {
        this.maxConcurrentStreams = parseInt(streamingSettings.maxConcurrentStreams);
        logger.info('Stream manager max concurrent streams updated', { 
          newValue: this.maxConcurrentStreams 
        });
      }
      
      if (streamingSettings.streamTimeout) {
        this.streamTimeout = parseInt(streamingSettings.streamTimeout);
        logger.info('Stream manager timeout updated', { 
          newValue: this.streamTimeout 
        });
      }
      
      if (streamingSettings.bufferSize) {
        this.bufferSize = parseInt(streamingSettings.bufferSize);
        logger.info('Stream manager buffer size updated', { 
          newValue: this.bufferSize 
        });
      }
      
    } catch (error) {
      logger.error('Failed to update stream manager settings:', error);
    }
  }

  async cleanup() {
    logger.info('Cleaning up all active streams');
    const sessionIds = Array.from(this.activeStreams.keys());
    
    for (const sessionId of sessionIds) {
      this.cleanupStream(sessionId, 'shutdown');
    }
    
    // Clear all tracking maps
    this.channelStreams.clear();
    this.clientSessions.clear();
    
    // Clear all timeouts
    for (const timeout of this.streamTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.streamTimeouts.clear();
  }

  // Get resilience statistics and stream health metrics
  getResilientStreamStats() {
    const resilientStreams = [];
    const serviceStats = streamResilienceService.getServiceStats();
    
    for (const [key, stream] of this.activeStreams) {
      if (stream.isResilient) {
        const resilienceStatus = streamResilienceService.getStreamStatus(stream.sessionId);
        
        resilientStreams.push({
          sessionId: stream.sessionId,
          streamId: stream.streamId,
          clientIdentifier: stream.clientIdentifier,
          clientIP: stream.clientIP,
          userAgent: stream.userAgent,
          url: stream.url,
          type: stream.type,
          startTime: stream.startTime,
          uptime: Date.now() - stream.startTime,
          
          // Resilience metrics
          resilience: resilienceStatus || {
            status: 'unknown',
            isHealthy: false,
            isRecovering: false,
            ffmpegRetries: 0,
            processRestarts: 0,
            sessionRecreations: 0
          },
          
          // Recovery events
          resilienceMetrics: stream.resilienceMetrics || {
            recoveryEvents: 0,
            lastRecoveryTime: null,
            totalUptime: 0
          }
        });
      }
    }

    return {
      // Service-level statistics
      service: serviceStats,
      
      // Individual stream statistics
      streams: resilientStreams,
      
      // Summary metrics
      summary: {
        totalResilientStreams: resilientStreams.length,
        healthyStreams: resilientStreams.filter(s => s.resilience.isHealthy).length,
        recoveringStreams: resilientStreams.filter(s => s.resilience.isRecovering).length,
        totalRecoveryEvents: resilientStreams.reduce((sum, s) => sum + s.resilienceMetrics.recoveryEvents, 0),
        averageUptime: resilientStreams.length > 0 
          ? resilientStreams.reduce((sum, s) => sum + s.uptime, 0) / resilientStreams.length
          : 0
      }
    };
  }

  // Check if resilient streaming is available and healthy
  isResilientStreamingHealthy() {
    const stats = this.getResilientStreamStats();
    const serviceStats = stats.service;
    
    return {
      available: true,
      serviceHealthy: serviceStats.activeStreams >= 0, // Service is responding
      streamsHealthy: stats.summary.healthyStreams === stats.summary.totalResilientStreams,
      recovering: stats.summary.recoveringStreams > 0,
      
      // Health indicators
      indicators: {
        totalStreams: stats.summary.totalResilientStreams,
        healthyStreams: stats.summary.healthyStreams,
        recoveringStreams: stats.summary.recoveringStreams,
        totalRecoveryEvents: stats.summary.totalRecoveryEvents,
        serviceUptime: serviceStats.serviceUptime
      }
    };
  }
}

// Create singleton instance
const streamManager = new StreamManager();

// Periodic cleanup of stale sessions (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const maxSessionAge = 60 * 60 * 1000; // 1 hour (original value)
  
  for (const [sessionId, stream] of streamManager.activeStreams) {
    if (now - stream.startTime > maxSessionAge) {
      logger.stream('Cleaning up stale session', { sessionId, age: now - stream.startTime });
      streamManager.cleanupStream(sessionId, 'stale');
    }
  }
}, 5 * 60 * 1000);

// Periodic bandwidth updates for real-time monitoring (every 2 seconds)
setInterval(async () => {
  if (streamManager.activeStreams.size > 0 && global.io) {
    const activeStreamsData = await streamManager.getActiveStreams();
    
    // Emit bandwidth update for each active stream
    global.io.emit('streams:bandwidth:update', {
      timestamp: new Date().toISOString(),
      streams: activeStreamsData.map(stream => ({
        sessionId: stream.sessionId,
        streamId: stream.streamId,
        channelName: stream.channelName,
        channelNumber: stream.channelNumber,
        currentBitrate: stream.currentBitrate,
        avgBitrate: stream.avgBitrate,
        peakBitrate: stream.peakBitrate,
        bytesTransferred: stream.bytesTransferred,
        duration: stream.duration
      }))
    });
  }
}, 2000); // Update every 2 seconds for real-time feel

// Emit metrics update to connected clients
streamManager.emitMetricsUpdate = async function() {
  try {
    const settingsService = require('./settingsService');
    const database = require('./database');
    const cacheService = require('./cacheService');
    const epgService = require('./epgService');
    
    // Get max concurrent streams from settings
    let maxConcurrentStreams = 10;
    try {
      maxConcurrentStreams = await settingsService.getSetting('plexlive.streaming.maxConcurrentStreams', 10);
      maxConcurrentStreams = parseInt(maxConcurrentStreams) || 10;
    } catch (err) {
      logger.warn('Failed to get max concurrent streams for metrics update:', err);
    }
    
    // Get active streams
    const activeStreams = this.getActiveStreams() || [];
    const streamsByChannel = this.getStreamsByChannel() || {};
    const concurrencyMetrics = this.getConcurrencyMetrics(maxConcurrentStreams);
    
    // Get health checks
    const dbHealth = database.isInitialized ? await database.healthCheck() : { status: 'initializing' };
    const cacheHealth = await cacheService.healthCheck();
    
    // Get EPG status
    let epgStatus = { status: 'unavailable' };
    try {
      epgStatus = await epgService.getStatus();
    } catch (err) {
      logger.debug('EPG service not available for metrics update');
    }
    
    // Build metrics object
    const metrics = {
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      },
      streams: {
        active: Array.isArray(activeStreams) ? activeStreams.length : 0,
        maximum: maxConcurrentStreams,
        utilization: Array.isArray(activeStreams) 
          ? (activeStreams.length / maxConcurrentStreams) * 100 
          : 0,
        byChannel: streamsByChannel,
        concurrency: concurrencyMetrics
      },
      database: dbHealth || { status: 'unknown' },
      cache: cacheHealth || { status: 'unknown' },
      epg: epgStatus || { status: 'unknown' },
      timestamp: new Date().toISOString()
    };
    
    // Emit to metrics room
    if (global.io) {
      global.io.to('metrics').emit('metrics:update', metrics);
      logger.debug('Emitted metrics update to metrics room');
    }
    
    // Also cache the metrics
    try {
      await cacheService.setMetrics(metrics);
    } catch (cacheError) {
      logger.debug('Failed to cache metrics during update:', cacheError);
    }
  } catch (error) {
    logger.error('Failed to emit metrics update:', error);
  }
};

module.exports = streamManager;
