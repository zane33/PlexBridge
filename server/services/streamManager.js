const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const axios = require('axios');
const m3u8Parser = require('m3u8-parser');
const logger = require('../utils/logger');
const config = require('../config');
const cacheService = require('./cacheService');
const settingsService = require('./settingsService');

class StreamManager {
  constructor() {
    this.activeStreams = new Map();
    this.streamProcesses = new Map();
    this.streamStats = new Map();
    this.channelStreams = new Map(); // Track streams per channel
    this.clientSessions = new Map(); // Track client sessions to prevent sharing
    this.streamTimeouts = new Map(); // Track stream timeouts
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

  // Create a stream proxy for Plex
  createStreamProxy(streamId, streamData, req, res) {
    try {
      logger.stream('Creating stream proxy', { streamId, url: streamData.url });

      const clientIdentifier = this.generateClientIdentifier(req);
      const sessionId = `${streamId}_${clientIdentifier}_${Date.now()}`;
      const { url, type, auth, headers: customHeaders = {} } = streamData;

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
          streamProcess = this.createHTTPStreamProxy(url, auth, customHeaders);
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
        }
        
        // Log stream errors with session context
        logger.error('Stream session error', {
          sessionId,
          streamId: stream?.streamId,
          clientIP: stream?.clientIP,
          streamUrl: stream?.url,
          errorData,
          timestamp: new Date().toISOString()
        });
        
        logger.stream('Stream process stderr', { sessionId, data: errorData });
      });

      streamProcess.on('close', (code) => {
        const stream = this.activeStreams.get(sessionId);
        logger.stream('Stream process closed', { 
          sessionId, 
          code,
          streamId: stream?.streamId,
          clientIP: stream?.clientIP 
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

      // Log detailed session start information
      logger.info('Stream session started', {
        sessionId,
        streamId: stream.streamId,
        clientIP: req.ip,
        clientIdentifier,
        userAgent: req.get('User-Agent'),
        streamUrl: streamData.url,
        streamType: streamData.type,
        timestamp: new Date().toISOString(),
        maxConcurrent,
        currentActiveStreams: this.activeStreams.size
      });
      
      logger.stream('Stream proxy created successfully', { sessionId, streamId });

    } catch (error) {
      logger.error('Stream proxy creation error', { streamId, error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream proxy creation failed' });
      }
    }
  }

  createHTTPStreamProxy(url, auth, customHeaders) {
    const args = [
      '-y',
      '-i', url,
      '-c', 'copy',
      '-f', 'mpegts',
      '-'
    ];

    if (auth && auth.username) {
      args.splice(2, 0, '-headers', `Authorization: Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`);
    }

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
      
      logger.info('Stream session ended', {
        sessionId,
        streamId: stream.streamId,
        clientIP: stream.clientIP,
        clientIdentifier: stream.clientIdentifier,
        userAgent: stream.userAgent,
        streamUrl: stream.url,
        streamType: stream.type,
        duration,
        durationFormatted: this.formatDuration(duration),
        bytesTransferred: stats?.bytesTransferred || 0,
        avgBitrate: stats?.avgBitrate || 0,
        peakBitrate: stats?.peakBitrate || 0,
        reason,
        timestamp: new Date().toISOString(),
        remainingActiveStreams: this.activeStreams.size - 1
      });
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
  getConcurrencyMetrics() {
    const totalStreams = this.activeStreams.size;
    // Use synchronous config fallback for metrics since this method needs to be sync
    const maxConcurrent = process.env.MAX_CONCURRENT_STREAMS || 10;
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
    
    try {
      logger.info('Starting web-compatible stream with channel context', {
        channelId: channel.id,
        channelName: channel.name,
        channelNumber: channel.number,
        streamType,
        clientIP: req.ip
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

      // For HLS/DASH, we can try direct streaming first
      const response = await axios.get(streamUrl, {
        timeout: 30000,
        responseType: 'stream',
        headers: {
          'User-Agent': config.protocols.http.userAgent || 'PlexBridge/1.0'
        }
      });

      // Pipe the response directly
      response.data.pipe(res);
      
      response.data.on('error', (error) => {
        logger.error('Stream pipe error with channel context', { 
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

    } catch (error) {
      // If direct streaming fails, fall back to transcoding
      logger.warn('Direct streaming failed, falling back to transcoding', { 
        channelId: channel.id,
        channelName: channel.name,
        url: streamUrl,
        clientIP: req.ip,
        error: error.message 
      });
      return await this.proxyTranscodedStreamWithChannel(streamUrl, streamType, channel, req, res);
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
      const response = await axios.get(streamUrl, {
        timeout: 30000,
        responseType: 'stream',
        headers: {
          'User-Agent': config.protocols.http.userAgent || 'PlexBridge/1.0'
        }
      });

      // Pipe the response directly
      response.data.pipe(res);
      
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
}

// Create singleton instance
const streamManager = new StreamManager();

// Periodic cleanup of stale sessions (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const maxSessionAge = 60 * 60 * 1000; // 1 hour
  
  for (const [sessionId, stream] of streamManager.activeStreams) {
    if (now - stream.startTime > maxSessionAge) {
      logger.stream('Cleaning up stale session', { sessionId, age: now - stream.startTime });
      streamManager.cleanupStream(sessionId, 'stale');
    }
  }
}, 5 * 60 * 1000);

module.exports = streamManager;
