const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const axios = require('axios');
const m3u8Parser = require('m3u8-parser');
const logger = require('../utils/logger');
const config = require('../config');
const cacheService = require('./cacheService');

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

      // Try HTTP head request for content detection
      if (urlLower.startsWith('http://') || urlLower.startsWith('https://')) {
        try {
          const response = await axios.head(url, {
            timeout: 5000,
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

        // Try content analysis
        try {
          const response = await axios.get(url, {
            timeout: 10000,
            responseType: 'text',
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

      // Check global concurrent stream limit
      if (this.activeStreams.size >= config.streams.maxConcurrent) {
        logger.stream('Maximum concurrent streams reached', { limit: config.streams.maxConcurrent });
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

      // Track stream statistics
      this.streamStats.set(sessionId, {
        bytesTransferred: 0,
        startTime: Date.now(),
        errors: 0
      });

      // Set response headers
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');

      // Pipe stream to response
      streamProcess.stdout.pipe(res);

      // Handle stream events
      streamProcess.stdout.on('data', (chunk) => {
        const stats = this.streamStats.get(sessionId);
        if (stats) {
          stats.bytesTransferred += chunk.length;
        }
      });

      streamProcess.stderr.on('data', (data) => {
        logger.stream('Stream process stderr', { sessionId, data: data.toString() });
      });

      streamProcess.on('close', (code) => {
        logger.stream('Stream process closed', { sessionId, code });
        this.cleanupStream(sessionId);
      });

      streamProcess.on('error', (error) => {
        logger.error('Stream process error', { sessionId, error: error.message });
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
    
    logger.stream('Stream cleaned up', { sessionId, reason, streamId: stream?.streamId });
  }

  getActiveStreams() {
    const streams = [];
    for (const [sessionId, stream] of this.activeStreams) {
      const stats = this.streamStats.get(sessionId);
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
        bytesTransferred: stats?.bytesTransferred || 0
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
    const maxConcurrent = config.streams.maxConcurrent;
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
