const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const axios = require('axios');
const m3u8Parser = require('m3u8-parser');
const logger = require('../utils/logger');
const config = require('../config');
const cacheService = require('./cacheService');
const settingsService = require('./settingsService');
const streamSessionManager = require('./streamSessionManager');

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
      // These need transcoding for Plex compatibility
      if (urlLower.includes('.ts') && !urlLower.includes('.m3u8')) {
        return { type: 'ts', protocol: 'http' };
      }
      
      if (urlLower.includes('.mpegts') || urlLower.includes('.mts')) {
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
        await streamSessionManager.startSession({
          sessionId,
          streamId,
          clientIP: req.ip,
          userAgent: req.get('User-Agent'),
          clientIdentifier,
          channelName: channelInfo?.name,
          channelNumber: channelInfo?.number,
          streamUrl: streamData.url,
          streamType: streamData.type
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

            // Update enhanced session tracking with comprehensive metrics
            const updateResult = streamSessionManager.updateSessionMetrics(sessionId, {
              bytesTransferred: stats.bytesTransferred,
              currentBitrate: stats.currentBitrate
            });
            
            // Log bandwidth update for debugging
            if (stats.currentBitrate > 0) {
              logger.debug('Bandwidth update for session', {
                sessionId,
                currentBitrate: stats.currentBitrate,
                avgBitrate: stats.avgBitrate,
                peakBitrate: stats.peakBitrate,
                bytesTransferred: stats.bytesTransferred,
                updateSuccessful: updateResult
              });
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
      if (url.includes('mjh.nz') || url.includes('tvnz')) {
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
    
    // Get configurable FFmpeg command line with proper transcoding
    let ffmpegCommand;
    
    // Use simpler FFmpeg args for Amagi streams to avoid TLS/beacon issues
    if (finalUrl.includes('amagi.tv') || finalUrl.includes('tsv2.amagi.tv')) {
      ffmpegCommand = '-hide_banner -loglevel error -i [URL] -c:v copy -c:a copy -f mpegts pipe:1';
    } else {
      ffmpegCommand = settings?.plexlive?.transcoding?.mpegts?.ffmpegArgs || 
                       config.plexlive?.transcoding?.mpegts?.ffmpegArgs ||
                       '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1';
    }
    
    // Replace [URL] placeholder with actual stream URL
    ffmpegCommand = ffmpegCommand.replace('[URL]', finalUrl);
    
    // Add HLS-specific arguments if needed (but skip for Amagi streams)
    if (finalUrl.includes('.m3u8') && !finalUrl.includes('amagi.tv') && !finalUrl.includes('tsv2.amagi.tv')) {
      let hlsArgs = settings?.plexlive?.transcoding?.mpegts?.hlsProtocolArgs || 
                   config.plexlive?.transcoding?.mpegts?.hlsProtocolArgs ||
                   '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto';
      
      // VLC-style approach: Parse master playlist and use direct stream URL like VLC does
      // NOTE: Disabled for Amagi streams as they use token-based auth that expires
      // The master playlist handles auth better than direct stream URLs
      if (false && (finalUrl.includes('amagi.tv') || finalUrl.includes('tsv2.amagi.tv'))) {
        try {
          // Fetch the master playlist like VLC does
          const axios = require('axios');
          const response = await axios.get(finalUrl, { timeout: 10000 });
          const playlist = response.data;
          
          // Parse for highest quality up to 1080p (like VLC would select)
          const lines = playlist.split('\n');
          let targetStreamUrl = null;
          
          // Look for 1080p first (highest quality)
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('1920x1080') && lines[i + 1] && lines[i + 1].startsWith('https://')) {
              targetStreamUrl = lines[i + 1].trim();
              break;
            }
          }
          
          // Fallback to 720p if 1080p not found
          if (!targetStreamUrl) {
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes('1280x720') && lines[i + 1] && lines[i + 1].startsWith('https://')) {
                targetStreamUrl = lines[i + 1].trim();
                break;
              }
            }
          }
          
          if (targetStreamUrl) {
            // Update ffmpeg command to use the selected stream URL instead of master playlist
            ffmpegCommand = ffmpegCommand.replace(finalUrl, targetStreamUrl);
            finalUrl = targetStreamUrl;
            const quality = targetStreamUrl.includes('1920x1080') ? '1080p' : targetStreamUrl.includes('1280x720') ? '720p' : 'unknown';
            logger.stream(`VLC-style approach: Using direct ${quality} stream URL`, {
              originalUrl: url,
              masterPlaylist: url,
              directStreamUrl: targetStreamUrl,
              selectedQuality: quality
            });
          }
        } catch (error) {
          logger.stream('Failed to parse master playlist, using original URL', {
            originalUrl: url,
            error: error.message
          });
        }
      }
      // For other redirected streams, add standard HLS options
      else if (finalUrl !== url) {
        hlsArgs += ' -http_seekable 0 -multiple_requests 1 -http_persistent 0';
        logger.stream('Added HLS compatibility options for redirected stream', {
          originalUrl: url,
          finalUrl: finalUrl
        });
      }
      
      // Insert HLS args BEFORE the input URL for proper protocol handling
      ffmpegCommand = ffmpegCommand.replace('-i ' + finalUrl, hlsArgs + ' -i ' + finalUrl);
    }
    
    // Parse command line into arguments array
    const args = ffmpegCommand.split(' ').filter(arg => arg.trim() !== '');

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
    
    // Get enhanced session data from StreamSessionManager
    const streamSessionManager = require('./streamSessionManager');
    const enhancedSessions = streamSessionManager.getActiveSessions();
    const sessionMap = new Map();
    enhancedSessions.forEach(session => {
      sessionMap.set(session.sessionId, session);
    });
    
    for (const [sessionId, stream] of this.activeStreams) {
      const stats = this.streamStats.get(sessionId);
      
      // Get enhanced session data if available
      const enhancedSession = sessionMap.get(sessionId);
      
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
      
      // Combine StreamManager and StreamSessionManager data
      streams.push({
        sessionId,
        streamId: stream.streamId,
        startTime: stream.startTime,
        duration: enhancedSession?.duration || (Date.now() - stream.startTime),
        durationFormatted: enhancedSession?.durationFormatted || this.formatDuration(Date.now() - stream.startTime),
        clientIP: stream.clientIP,
        clientHostname: enhancedSession?.clientHostname || stream.clientIP,
        userAgent: stream.userAgent,
        clientIdentifier: stream.clientIdentifier,
        url: stream.url,
        type: stream.type,
        isUnique: stream.isUnique,
        
        // Enhanced bandwidth metrics from StreamSessionManager
        bytesTransferred: enhancedSession?.bytesTransferred || stats?.bytesTransferred || 0,
        currentBitrate: enhancedSession?.currentBitrate || stats?.currentBitrate || 0,
        avgBitrate: enhancedSession?.avgBitrate || stats?.avgBitrate || 0,
        peakBitrate: enhancedSession?.peakBitrate || stats?.peakBitrate || 0,
        errorCount: enhancedSession?.errorCount || 0,
        lastUpdateTime: stats?.lastUpdateTime,
        
        // Channel information (prefer enhanced session data)
        channelName: enhancedSession?.channelName || channelInfo.name,
        channelNumber: enhancedSession?.channelNumber || channelInfo.number,
        
        // Status
        status: enhancedSession?.status || 'active'
      });
    }
    return streams;
  }
  
  // Utility: Format duration in human-readable format
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
  async proxyPlexCompatibleStream(streamUrl, channel, req, res) {
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
        
        // For TVNZ and mjh.nz streams, follow redirects properly
        if (streamUrl.includes('mjh.nz') || streamUrl.includes('tvnz')) {
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
            
            logger.info('TVNZ/mjh.nz redirect resolved', {
              channelId: channel.id,
              originalUrl: streamUrl,
              finalUrl: finalStreamUrl,
              status: response.status,
              redirected: true
            });
          } else {
            logger.warn('TVNZ/mjh.nz redirect not found', {
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
      
      // Set appropriate headers for MPEG-TS stream with Plex optimizations
      res.set({
        'Content-Type': 'video/mp2t',                 // MPEG-TS MIME type
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'none',                      // Disable range requests for live streams
        'Connection': 'keep-alive',                   // Keep connection alive
        'Transfer-Encoding': 'chunked'                // Use chunked encoding for streaming
      });

      // Get FFmpeg arguments from settings
      const settingsService = require('./settingsService');
      const settings = await settingsService.getSettings();
      
      // Get configurable FFmpeg command line
      let ffmpegCommand;
      
      // Use simpler FFmpeg args for Amagi streams to avoid TLS/beacon issues
      if (finalStreamUrl.includes('amagi.tv') || finalStreamUrl.includes('tsv2.amagi.tv')) {
        ffmpegCommand = '-hide_banner -loglevel error -i [URL] -c:v copy -c:a copy -f mpegts pipe:1';
      } else {
        ffmpegCommand = settings?.plexlive?.transcoding?.mpegts?.ffmpegArgs || 
                         config.plexlive?.transcoding?.mpegts?.ffmpegArgs ||
                         '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1';
      }
      
      // Replace [URL] placeholder with actual stream URL
      ffmpegCommand = ffmpegCommand.replace('[URL]', finalStreamUrl);
      
      // Add HLS-specific arguments if needed (but skip for Amagi streams)
      if (finalStreamUrl.includes('.m3u8') && !finalStreamUrl.includes('amagi.tv') && !finalStreamUrl.includes('tsv2.amagi.tv')) {
        let hlsArgs = settings?.plexlive?.transcoding?.mpegts?.hlsProtocolArgs || 
                     config.plexlive?.transcoding?.mpegts?.hlsProtocolArgs ||
                     '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto';
        
        // VLC-style approach: Parse master playlist and use direct stream URL like VLC does
        // NOTE: Disabled for Amagi streams as they use token-based auth that expires
        // The master playlist handles auth better than direct stream URLs
        if (false && (finalStreamUrl.includes('amagi.tv') || finalStreamUrl.includes('tsv2.amagi.tv'))) {
          try {
            // Fetch the master playlist like VLC does
            const axios = require('axios');
            const response = await axios.get(finalStreamUrl, { timeout: 10000 });
            const playlist = response.data;
            
            // Parse for highest quality up to 1080p (like VLC would select)
            const lines = playlist.split('\n');
            let targetStreamUrl = null;
            
            // Look for 1080p first (highest quality)
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes('1920x1080') && lines[i + 1] && lines[i + 1].startsWith('https://')) {
                targetStreamUrl = lines[i + 1].trim();
                break;
              }
            }
            
            // Fallback to 720p if 1080p not found
            if (!targetStreamUrl) {
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('1280x720') && lines[i + 1] && lines[i + 1].startsWith('https://')) {
                  targetStreamUrl = lines[i + 1].trim();
                  break;
                }
              }
            }
            
            if (targetStreamUrl) {
              // Update ffmpeg command to use the selected stream URL instead of master playlist
              ffmpegCommand = ffmpegCommand.replace(finalStreamUrl, targetStreamUrl);
              finalStreamUrl = targetStreamUrl;
              const quality = targetStreamUrl.includes('1920x1080') ? '1080p' : targetStreamUrl.includes('1280x720') ? '720p' : 'unknown';
              logger.info(`VLC-style approach: Using direct ${quality} stream URL (Plex)`, {
                channelId: channel.id,
                originalUrl: streamUrl,
                masterPlaylist: streamUrl,
                directStreamUrl: targetStreamUrl,
                selectedQuality: quality
              });
            }
          } catch (error) {
            logger.info('Failed to parse master playlist, using original URL (Plex)', {
              channelId: channel.id,
              originalUrl: streamUrl,
              error: error.message
            });
          }
        }
        // For other redirected streams (like TVNZ), add standard HLS options
        else if (finalStreamUrl !== streamUrl) {
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
      
      // Parse command line into arguments array
      const args = ffmpegCommand.split(' ').filter(arg => arg.trim() !== '');

      // Log the exact command being executed
      logger.info('Executing FFmpeg command', {
        channelId: channel.id,
        command: `${config.streams.ffmpegPath} ${args.join(' ')}`,
        finalStreamUrl,
        clientIP: req.ip
      });

      console.log('DEBUG: Starting FFmpeg with args', { 
        ffmpegPath: config.streams.ffmpegPath, 
        args: args.slice(0, 5) + '...' // Show first few args
      });

      const ffmpegProcess = spawn(config.streams.ffmpegPath, args);
      
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
        type: 'plex-mpegts',
        channelName: channel.name,
        channelNumber: channel.number,
        isUnique: true,
        isPlexStream: true
      };
      
      // Store in active streams for dashboard tracking
      this.activeStreams.set(sessionId, streamInfo);
      
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
        await streamSessionManager.startSession({
          sessionId,
          streamId: actualStreamId,
          clientIP: req.ip,
          userAgent: req.get('User-Agent'),
          clientIdentifier,
          channelName: channel.name,
          channelNumber: channel.number,
          streamUrl: finalStreamUrl,
          streamType: 'plex-mpegts'
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
        
        if (!res.headersSent) {
          res.status(500).send('Transcoding failed');
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

      ffmpegProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        const stats = this.streamStats.get(sessionId);
        if (stats) {
          stats.errors++;
          
          // Update enhanced session tracking with error
          streamSessionManager.updateSessionMetrics(sessionId, {
            errorIncrement: 1
          });
        }
        
        // Log all stderr output for debugging
        logger.info('FFmpeg MPEG-TS stderr', { 
          channelId: channel.id,
          sessionId,
          output: errorOutput.trim() 
        });
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

            // Update enhanced session tracking with comprehensive metrics
            const updateResult = streamSessionManager.updateSessionMetrics(sessionId, {
              bytesTransferred: stats.bytesTransferred,
              currentBitrate: stats.currentBitrate
            });
            
            // Log bandwidth update for debugging
            if (stats.currentBitrate > 0) {
              logger.debug('Bandwidth update for session', {
                sessionId,
                currentBitrate: stats.currentBitrate,
                avgBitrate: stats.avgBitrate,
                peakBitrate: stats.peakBitrate,
                bytesTransferred: stats.bytesTransferred,
                updateSuccessful: updateResult
              });
            }
          }
        }
      });

    } catch (error) {
      logger.error('Plex-compatible stream proxy error', { 
        channelId: channel.id,
        url: streamUrl, 
        error: error.message 
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Plex stream proxy failed', details: error.message });
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
      await streamSessionManager.startSession({
        sessionId,
        streamId: channel.id,
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        clientIdentifier,
        channelName: channel.name,
        channelNumber: channel.number,
        streamUrl,
        streamType: `direct-${streamType}`
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
      
      const response = await axios.get(streamUrl, {
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
      const response = await axios.get(streamUrl, {
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
    
    // Get max concurrent streams from settings using centralized method
    const maxConcurrentStreams = await settingsService.getMaxConcurrentStreams();
    
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
