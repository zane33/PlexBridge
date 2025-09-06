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
    const { transcode, quality = 'high', timeout = 30000 } = req.query;
    
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

      // Detect stream format and codecs if not specified
      let streamFormat = stream.type;
      let codecInfo = null;
      
      if (!streamFormat || streamFormat === 'unknown') {
        const detection = await streamManager.detectStreamFormat(stream.url);
        streamFormat = detection.type;
        logger.stream('Stream format detected', { streamId, detectedFormat: streamFormat });
      }
      
      // For HLS streams, analyze codec compatibility
      if (streamFormat === 'hls' || stream.url.includes('.m3u8')) {
        codecInfo = await this.detectHLSCodecs(stream.url);
        logger.stream('HLS codec analysis results', {
          streamId,
          codecInfo,
          needsTranscoding: codecInfo.needsTranscoding
        });
      }

      // Check if this is a .ts file that needs conversion for browser compatibility
      const needsHLSConversion = this.needsHLSConversion(stream.url, streamFormat);
      
      // Determine if transcoding is needed based on codec analysis
      let needsTranscoding;
      
      // If transcode=true is explicitly requested, always transcode
      if (transcode === 'true') {
        needsTranscoding = true;
        logger.stream('Transcoding required based on explicit request', {
          streamId,
          reason: 'explicit_transcode_request',
          streamFormat
        });
      } else if (codecInfo && codecInfo.needsTranscoding) {
        // HLS codec analysis indicates transcoding needed
        needsTranscoding = true;
        logger.stream('Transcoding required based on codec analysis', {
          streamId,
          reason: 'codec_compatibility',
          videoCodecs: codecInfo.video,
          audioCodecs: codecInfo.audio,
          encrypted: codecInfo.encrypted
        });
      } else {
        // Use existing logic for non-HLS streams
        needsTranscoding = this.shouldTranscode(streamFormat, false) || needsHLSConversion;
      }
      
      // Special handling for encrypted HLS streams
      if (codecInfo && codecInfo.encrypted && (streamFormat === 'hls' || stream.url.includes('.m3u8'))) {
        logger.stream('Detected encrypted HLS stream, using specialized handler', {
          streamId,
          encryptionMethod: codecInfo.encryptionMethod?.method,
          keyUri: codecInfo.encryptionMethod?.keyUri
        });
        return await this.handleEncryptedHLSStream(stream, req, res, quality, parseInt(timeout));
      }
      
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
    
    // If forceTranscode is true, also transcode HLS streams for browser compatibility
    if (forceTranscode && streamFormat === 'hls') {
      return true;
    }
    
    return needsTranscodingFormats.includes(streamFormat);
  }

  // Enhanced HLS codec detection and compatibility checking
  async detectHLSCodecs(streamUrl) {
    try {
      // Fetch HLS manifest to analyze codecs using axios
      const axios = require('axios');
      const response = await axios.get(streamUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*'
        },
        timeout: 10000, // 10 second timeout
        maxRedirects: 5, // Follow redirects to get final manifest
        validateStatus: function (status) {
          return status >= 200 && status < 400; // Accept 2xx and 3xx responses
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const manifestText = response.data;
      
      // Check if HLS stream uses encryption
      const isEncrypted = manifestText.includes('#EXT-X-KEY:METHOD=AES-128') ||
                          manifestText.includes('#EXT-X-KEY:METHOD=SAMPLE-AES') ||
                          manifestText.includes('EXT-X-KEY');
      
      // Parse codec information from HLS manifest
      const codecMatches = manifestText.match(/CODECS="([^"]+)"/g) || [];
      const codecs = codecMatches.map(match => match.match(/CODECS="([^"]+)"/)[1]);
      
      // Analyze supported codecs
      const supportedCodecs = {
        video: [],
        audio: [],
        needsTranscoding: false,
        browserCompatible: true,
        encrypted: isEncrypted,
        encryptionMethod: isEncrypted ? this.detectEncryptionMethod(manifestText) : null
      };
      
      for (const codecString of codecs) {
        const [videoCodec, audioCodec] = codecString.split(',').map(c => c.trim());
        
        // Video codec analysis
        if (videoCodec) {
          if (videoCodec.startsWith('avc1.')) {
            // H.264 codec - extract profile and level
            const profile = this.parseH264Profile(videoCodec);
            supportedCodecs.video.push({
              codec: 'H.264',
              profile: profile.name,
              level: profile.level,
              browserSupported: profile.browserSupported,
              original: videoCodec
            });
            
            if (!profile.browserSupported) {
              supportedCodecs.needsTranscoding = true;
            }
          } else if (videoCodec.startsWith('hev1.') || videoCodec.startsWith('hvc1.')) {
            // H.265/HEVC codec - needs transcoding for browser compatibility
            supportedCodecs.video.push({
              codec: 'H.265/HEVC',
              profile: 'Unknown',
              level: 'Unknown',
              browserSupported: false,
              original: videoCodec
            });
            supportedCodecs.needsTranscoding = true;
            supportedCodecs.browserCompatible = false;
          }
        }
        
        // Audio codec analysis
        if (audioCodec) {
          if (audioCodec.startsWith('mp4a.40.2')) {
            // AAC-LC - widely supported
            supportedCodecs.audio.push({
              codec: 'AAC-LC',
              profile: 'Low Complexity',
              browserSupported: true,
              original: audioCodec
            });
          } else if (audioCodec.startsWith('mp4a.40.')) {
            // Other AAC variants
            supportedCodecs.audio.push({
              codec: 'AAC',
              profile: audioCodec,
              browserSupported: true,
              original: audioCodec
            });
          } else {
            // Unknown audio codec - may need transcoding
            supportedCodecs.audio.push({
              codec: 'Unknown',
              profile: audioCodec,
              browserSupported: false,
              original: audioCodec
            });
            supportedCodecs.needsTranscoding = true;
          }
        }
      }
      
      // Force transcoding for encrypted streams to handle decryption properly
      if (isEncrypted) {
        supportedCodecs.needsTranscoding = true;
        logger.stream('Encrypted HLS stream detected, forcing transcoding for proper decryption', {
          url: streamUrl,
          encryptionMethod: supportedCodecs.encryptionMethod,
          encrypted: true
        });
      }
      
      logger.stream('HLS codec analysis completed', {
        url: streamUrl,
        codecs: supportedCodecs,
        manifestCodecs: codecs,
        encrypted: isEncrypted,
        encryptionMethod: supportedCodecs.encryptionMethod
      });
      
      return supportedCodecs;
      
    } catch (error) {
      logger.warn('Failed to analyze HLS codecs, assuming transcoding needed', {
        url: streamUrl,
        error: error.message
      });
      
      return {
        video: [{ codec: 'Unknown', browserSupported: false }],
        audio: [{ codec: 'Unknown', browserSupported: false }],
        needsTranscoding: true,
        browserCompatible: false,
        encrypted: false, // Unknown encryption status
        encryptionMethod: null
      };
    }
  }
  
  // Detect encryption method from HLS manifest
  detectEncryptionMethod(manifestText) {
    const keyMethodMatch = manifestText.match(/#EXT-X-KEY:METHOD=([^,\s]+)/);
    if (keyMethodMatch) {
      const method = keyMethodMatch[1];
      const uriMatch = manifestText.match(/#EXT-X-KEY:.*?URI="([^"]+)"/);
      const keyUri = uriMatch ? uriMatch[1] : null;
      const ivMatch = manifestText.match(/#EXT-X-KEY:.*?IV=0x([A-Fa-f0-9]+)/);
      const iv = ivMatch ? ivMatch[1] : null;
      
      return {
        method: method,
        keyUri: keyUri,
        iv: iv,
        requiresDecryption: true
      };
    }
    return null;
  }
  
  // Handle encrypted HLS streams with specialized logic
  async handleEncryptedHLSStream(stream, req, res, quality, timeoutMs) {
    const sessionId = `encrypted_${stream.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.stream('Handling encrypted HLS stream with specialized processing', {
      streamId: stream.id,
      sessionId,
      url: stream.url
    });
    
    try {
      // Test key accessibility first
      const codecInfo = await this.detectHLSCodecs(stream.url);
      if (codecInfo.encryptionMethod && codecInfo.encryptionMethod.keyUri) {
        const keyAccessible = await this.testEncryptionKeyAccess(codecInfo.encryptionMethod.keyUri);
        if (!keyAccessible) {
          logger.warn('Encryption key not accessible, attempting direct stream', {
            sessionId,
            keyUri: codecInfo.encryptionMethod.keyUri
          });
          return await this.handleDirectPreview(stream, req, res);
        }
      }
      
      // Proceed with enhanced transcoding for encrypted streams
      return await this.handleTranscodedPreview(stream, req, res, quality, timeoutMs);
      
    } catch (error) {
      logger.error('Encrypted HLS stream handling failed', {
        sessionId,
        streamId: stream.id,
        error: error.message
      });
      
      // Fallback to direct stream
      logger.warn('Falling back to direct stream for encrypted HLS', { sessionId });
      return await this.handleDirectPreview(stream, req, res);
    }
  }
  
  // Test if encryption key is accessible
  async testEncryptionKeyAccess(keyUri) {
    try {
      const axios = require('axios');
      const response = await axios.head(keyUri, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      return response.status === 200 && response.headers['content-length'] === '16';
    } catch (error) {
      logger.warn('Encryption key accessibility test failed', {
        keyUri,
        error: error.message
      });
      return false;
    }
  }
  
  // Parse H.264 profile and level information
  parseH264Profile(codecString) {
    // Format: avc1.PPCCLL where PP=profile, CC=constraints, LL=level
    const profileMap = {
      '42': { name: 'Baseline', browserSupported: true },
      '4D': { name: 'Main', browserSupported: true },
      '58': { name: 'Extended', browserSupported: false },
      '64': { name: 'High', browserSupported: true },
      '6E': { name: 'High 10', browserSupported: false },
      '7A': { name: 'High 4:2:2', browserSupported: false },
      'F4': { name: 'High 4:4:4', browserSupported: false }
    };
    
    const parts = codecString.split('.');
    if (parts.length >= 2 && parts[1].length >= 6) {
      const profileHex = parts[1].substring(0, 2);
      const levelHex = parts[1].substring(4, 6);
      
      const profile = profileMap[profileHex] || { name: 'Unknown', browserSupported: false };
      const level = parseInt(levelHex, 16) / 10; // Convert hex to decimal level
      
      return {
        ...profile,
        level: level.toString(),
        profileHex,
        levelHex
      };
    }
    
    return { name: 'Unknown', level: 'Unknown', browserSupported: false };
  }
  
  // Resolve HLS stream URL by following redirects and selecting a variant
  async resolveHLSStreamUrl(streamUrl, quality = 'medium') {
    const axios = require('axios');
    
    try {
      // Step 1: Follow redirects to get the final master playlist URL
      logger.stream('Resolving HLS stream redirects', { streamUrl });
      
      const response = await axios.get(streamUrl, {
        maxRedirects: 5,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/vnd.apple.mpegurl, */*'
        }
      });
      
      const finalUrl = response.request.res.responseUrl || response.config.url;
      const masterPlaylist = response.data;
      
      logger.stream('Retrieved master playlist', {
        originalUrl: streamUrl,
        finalUrl: finalUrl,
        contentLength: masterPlaylist.length
      });
      
      // Step 2: Parse the master playlist to find variant streams
      const lines = masterPlaylist.split('\n').filter(line => line.trim());
      const variants = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          // Parse stream info
          const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
          const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
          const codecsMatch = line.match(/CODECS="([^"]+)"/);
          
          if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
            const variantUrl = lines[i + 1].trim();
            
            // Convert relative URL to absolute
            let absoluteUrl = variantUrl;
            if (!variantUrl.startsWith('http')) {
              const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);
              absoluteUrl = baseUrl + variantUrl;
            }
            
            variants.push({
              url: absoluteUrl,
              bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0,
              resolution: resolutionMatch ? resolutionMatch[1] : 'unknown',
              codecs: codecsMatch ? codecsMatch[1] : 'unknown'
            });
          }
        }
      }
      
      if (variants.length === 0) {
        // Not a master playlist, might be a direct media playlist
        logger.stream('No variants found, using direct URL', { finalUrl });
        return finalUrl;
      }
      
      // Step 3: Select appropriate variant based on quality
      let selectedVariant;
      
      // Sort variants by bandwidth
      variants.sort((a, b) => a.bandwidth - b.bandwidth);
      
      // Select based on quality preference - always prefer highest quality unless explicitly requested
      if (quality === 'low') {
        selectedVariant = variants[0]; // Lowest bandwidth
      } else if (quality === 'medium') {
        // For medium, select middle variant (no 720p hunting)
        const middleIndex = Math.floor(variants.length / 2);
        selectedVariant = variants[middleIndex];
      } else {
        // Default to highest quality (including quality === 'high' and any other values)
        selectedVariant = variants[variants.length - 1]; // Highest bandwidth
      }
      
      logger.stream('Selected HLS variant for transcoding', {
        quality: quality,
        selectedUrl: selectedVariant.url,
        bandwidth: selectedVariant.bandwidth,
        resolution: selectedVariant.resolution,
        codecs: selectedVariant.codecs,
        totalVariants: variants.length
      });
      
      return selectedVariant.url;
      
    } catch (error) {
      logger.error('Failed to resolve HLS stream URL', {
        streamUrl: streamUrl,
        error: error.message,
        stack: error.stack
      });
      
      // Return original URL as fallback
      throw error;
    }
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

      // For other formats, use simple proxy for HTTP-based streams (including HLS)
      if (stream.type === 'http' || stream.type === 'hls') {
        logger.stream('Using HTTP proxy for stream', { 
          streamId: stream.id,
          streamType: stream.type,
          url: stream.url
        });
        return this.simpleHttpProxy(stream.url, req, res);
      } else {
        // For non-HTTP streams (RTSP, etc.), fallback to redirect for now
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
    let isEncryptedStream = false;
    let encryptionInfo = null;
    
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

      // Pre-analyze HLS streams for encryption
      if (stream.type === 'hls' || stream.url.includes('.m3u8')) {
        try {
          const codecInfo = await this.detectHLSCodecs(stream.url);
          isEncryptedStream = codecInfo.encrypted;
          encryptionInfo = codecInfo.encryptionMethod;
        } catch (error) {
          logger.warn('Failed to pre-analyze stream encryption, proceeding with transcoding', {
            streamId: stream.id,
            error: error.message
          });
        }
      }

      logger.stream('Starting transcoded preview', { 
        streamId: stream.id,
        sessionId,
        quality,
        timeout: timeoutMs,
        encrypted: isEncryptedStream
      });

      const transcodingResult = await this.createTranscodingProcess(stream, quality, sessionId, isEncryptedStream, encryptionInfo);
      const ffmpegProcess = transcodingResult?.process;
      
      if (!ffmpegProcess) {
        logger.warn('FFmpeg not available, falling back to direct stream', { 
          streamId: stream.id,
          fallbackUrl: stream.url 
        });
        return await this.handleDirectPreview(stream, req, res);
      }
      
      // Update encryption info from transcoding result if available
      if (transcodingResult?.isEncrypted !== undefined) {
        isEncryptedStream = transcodingResult.isEncrypted;
        encryptionInfo = transcodingResult.encryptionInfo;
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

      // Set response headers for MP4 streaming with proper CORS and caching
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, User-Agent');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Transfer-Encoding', 'chunked');
      
      logger.stream('Set MP4 streaming headers for H.264 High Profile transcoding', {
        sessionId,
        contentType: 'video/mp4',
        cors: 'enabled',
        caching: 'disabled'
      });

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

      // Handle FFmpeg stderr (errors and info) with enhanced error detection
      let stderrBuffer = '';
      let encryptionErrors = 0;
      let segmentErrors = 0;
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderrBuffer += output;
        
        // Detect specific error types for better handling
        const errorLines = output.split('\n')
          .filter(line => line.includes('error') || line.includes('Error') || line.includes('ERROR'))
          .filter(line => line.trim().length > 0);
        
        // Count encryption and segment-specific errors
        for (const line of errorLines) {
          if (line.includes('Error when loading first segment') || 
              line.includes('Error opening input file') ||
              line.includes('Unable to open key') ||
              line.includes('Invalid key') ||
              line.includes('decryption')) {
            encryptionErrors++;
          }
          if (line.includes('.ts') && (line.includes('404') || line.includes('403'))) {
            segmentErrors++;
          }
        }
        
        if (errorLines.length > 0) {
          logger.error('FFmpeg errors', { 
            sessionId, 
            errors: errorLines,
            encryptionErrors,
            segmentErrors,
            streamEncrypted: isEncryptedStream
          });
        }
      });

      // Handle process completion with enhanced error analysis
      ffmpegProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        logger.stream('Transcoding process closed', { 
          sessionId, 
          exitCode: code,
          encryptionErrors,
          segmentErrors,
          streamEncrypted: isEncryptedStream
        });
        
        if (code !== 0) {
          const recentStderr = stderrBuffer.slice(-2000); // Last 2000 chars for better error context
          const isEncryptionFailure = encryptionErrors > 0 || 
                                    recentStderr.includes('Error when loading first segment') ||
                                    recentStderr.includes('Error opening input file') ||
                                    recentStderr.includes('Unable to open key');
          
          logger.error('Transcoding failed', { 
            sessionId, 
            exitCode: code,
            stderr: recentStderr,
            encryptionErrors,
            segmentErrors,
            isEncryptionFailure,
            streamEncrypted: isEncryptedStream
          });
          
          // For encryption failures on encrypted streams, attempt direct stream fallback
          if (isEncryptedStream && isEncryptionFailure && !res.headersSent) {
            logger.warn('Encryption-related transcoding failure, attempting direct stream fallback', {
              sessionId,
              streamId: stream.id,
              exitCode: code
            });
            
            return this.handleDirectPreview(stream, req, res).catch(fallbackError => {
              logger.error('Direct stream fallback failed after transcoding failure', {
                sessionId,
                transcodingExitCode: code,
                fallbackError: fallbackError.message
              });
              if (!res.headersSent) {
                res.status(500).json({ 
                  error: 'Stream processing failed',
                  message: 'Unable to process encrypted stream through transcoding or direct access',
                  details: {
                    transcodingExitCode: code,
                    encryptionErrors,
                    isEncryptionFailure,
                    fallbackAttempted: true
                  }
                });
              }
            });
          }
        }
        
        this.cleanupTranscodingSession(sessionId, 'completed');
      });

      // Handle process errors with intelligent fallbacks
      ffmpegProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        logger.error('Transcoding process error', { 
          sessionId, 
          error: error.message,
          encryptionErrors,
          segmentErrors,
          streamEncrypted: isEncryptedStream
        });
        this.cleanupTranscodingSession(sessionId, 'error');
        
        // For encrypted streams with decryption errors, try direct streaming as fallback
        if (isEncryptedStream && encryptionErrors > 0 && !res.headersSent) {
          logger.warn('Transcoding failed for encrypted stream, attempting direct stream fallback', {
            sessionId,
            streamId: stream.id,
            encryptionErrors
          });
          
          // Attempt direct stream as fallback
          return this.handleDirectPreview(stream, req, res).catch(fallbackError => {
            logger.error('Direct stream fallback also failed', {
              sessionId,
              originalError: error.message,
              fallbackError: fallbackError.message
            });
            if (!res.headersSent) {
              res.status(500).json({ 
                error: 'Stream unavailable',
                message: 'Both transcoding and direct streaming failed for this encrypted stream',
                details: {
                  transcodingError: error.message,
                  directStreamError: fallbackError.message,
                  encrypted: true
                }
              });
            }
          });
        }
        
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Transcoding failed',
            message: isEncryptedStream ? 
              'Encrypted stream transcoding failed. The stream may use unsupported encryption or have connectivity issues.' :
              'Video transcoding process encountered an error',
            details: {
              encrypted: isEncryptedStream,
              encryptionErrors,
              segmentErrors
            }
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
  async createTranscodingProcess(stream, quality = 'medium', sessionId, preAnalyzedEncrypted = false, preAnalyzedEncryptionInfo = null) {
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
      
      // CRITICAL FIX: Handle HLS redirects and master playlists properly
      let inputUrl = stream.url;
      let isEncryptedStream = preAnalyzedEncrypted;
      let encryptionInfo = preAnalyzedEncryptionInfo;
      
      // For HLS streams, resolve redirects and select a variant from master playlist
      if (stream.type === 'hls' || stream.url.includes('.m3u8')) {
        try {
          // Use pre-analyzed encryption info or detect if not provided
          let codecInfo;
          if (!preAnalyzedEncrypted && !preAnalyzedEncryptionInfo) {
            codecInfo = await this.detectHLSCodecs(stream.url);
            isEncryptedStream = codecInfo.encrypted;
            encryptionInfo = codecInfo.encryptionMethod;
          } else {
            // Use pre-analyzed info to avoid duplicate analysis
            codecInfo = { encrypted: isEncryptedStream, encryptionMethod: encryptionInfo };
          }
          
          logger.stream('HLS stream analysis for transcoding', {
            originalUrl: stream.url,
            encrypted: isEncryptedStream,
            encryptionMethod: encryptionInfo?.method,
            needsTranscoding: codecInfo.needsTranscoding
          });
          
          // For encrypted streams, use the original master playlist URL
          // FFmpeg will handle the decryption and segment downloading
          if (isEncryptedStream) {
            inputUrl = stream.url; // Keep original URL for encrypted streams
            logger.stream('Using original URL for encrypted HLS stream', {
              originalUrl: stream.url,
              reason: 'encrypted_stream_ffmpeg_handling'
            });
          } else {
            // For non-encrypted streams, resolve to specific variant
            inputUrl = await this.resolveHLSStreamUrl(stream.url, quality);
            logger.stream('Resolved HLS stream URL for transcoding', {
              originalUrl: stream.url,
              resolvedUrl: inputUrl,
              quality: quality
            });
          }
        } catch (error) {
          logger.error('Failed to resolve HLS stream URL, using original', {
            error: error.message,
            originalUrl: stream.url
          });
          // Fall back to original URL if resolution fails
          inputUrl = stream.url;
        }
      }
      
      // Enhanced FFmpeg arguments for HLS streaming compatibility with H.264 High Profile support
      // CRITICAL FIX: Support H.264 High Profile (avc1.4D4028, avc1.4D401F) and AAC-LC (mp4a.40.2)
      // ENCRYPTION FIX: Enhanced configuration for encrypted HLS streams
      const args = [
        '-fflags', '+genpts+discardcorrupt',  // Generate timestamps and handle corrupted packets
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', // User agent for HLS servers
        '-headers', 'Connection: keep-alive\r\nAccept: */*\r\nAccept-Encoding: identity\r\n', // HTTP headers with identity encoding
        ...(isEncryptedStream ? ['-timeout', '30000000'] : ['-re']), // For encrypted: timeout instead of real-time, for others: real-time
        '-i', inputUrl,
        
        // Input stream mapping with fallback options
        '-map', '0:v:0',                      // Map first video stream
        '-map', '0:a:0?',                     // Map first audio stream if exists (optional)
        
        // Video codec configuration for H.264 High Profile compatibility
        '-c:v', 'libx264',                    // H.264 video codec
        '-preset', 'fast',                    // Balanced speed/quality for real-time
        '-tune', 'zerolatency',               // Optimize for low latency streaming
        '-profile:v', 'high',                 // High Profile for better compression (supports avc1.4D4028, avc1.4D401F)
        '-level', '4.0',                      // H.264 level 4.0 for 1080p support
        '-pix_fmt', 'yuv420p',                // 4:2:0 chroma subsampling for web compatibility
        
        // Video quality and bitrate settings
        '-s', qualityProfile.resolution,      // Video resolution
        '-b:v', qualityProfile.bitrate,       // Video bitrate
        '-maxrate', qualityProfile.bitrate,   // Max bitrate (same as target)
        '-bufsize', `${parseInt(qualityProfile.bitrate) * 2}k`, // Buffer size (2x bitrate)
        '-crf', '23',                         // Constant Rate Factor for quality
        
        // GOP and keyframe settings for HLS compatibility
        '-g', '50',                           // GOP size (2 seconds at 25fps)
        '-keyint_min', '25',                  // Minimum keyframe interval
        '-sc_threshold', '0',                 // Disable scene change detection
        '-force_key_frames', 'expr:gte(t,n_forced*2)', // Force keyframes every 2 seconds
        
        // Audio codec configuration for AAC-LC (mp4a.40.2) compatibility
        '-c:a', 'aac',                        // AAC audio codec
        '-profile:a', 'aac_low',              // AAC-LC profile (mp4a.40.2)
        '-b:a', '128k',                       // Audio bitrate
        '-ar', '48000',                       // 48kHz sample rate (standard for broadcast)
        '-ac', '2',                           // Stereo audio
        
        // MP4 output format for browser compatibility when transcoding is requested
        '-f', 'mp4',                          // MP4 output format for browser compatibility
        '-movflags', 'frag_keyframe+empty_moov+faststart', // MP4 streaming optimizations
        
        // Stream handling and error recovery
        '-avoid_negative_ts', 'make_zero',    // Handle timestamp issues
        '-vsync', 'cfr',                      // Constant frame rate
        '-async', '1',                        // Audio sync
        '-max_muxing_queue_size', '9999',     // Large queue to prevent packet drops
        '-max_interleave_delta', '0',         // Interleave packets immediately
        
        // Performance and logging
        '-threads', '0',                      // Auto-select optimal thread count
        '-loglevel', 'info',                  // Show info level logs for debugging
        '-progress', 'pipe:2',                // Send progress to stderr
        
        'pipe:1'                              // Output to stdout
      ];

      // Additional input options for HLS streams with codec compatibility
      if (stream.type === 'hls' || stream.url.includes('.m3u8')) {
        // Insert HLS-specific input options after the input URL
        const inputIndex = args.findIndex(arg => arg === inputUrl);
        if (inputIndex !== -1) {
          // Enhanced protocol support for encrypted streams
          const protocolList = isEncryptedStream ? 
            'file,http,https,tcp,tls,crypto,data' : 
            'file,http,https,tcp,tls,crypto';
          
          const hlsInputOptions = [
            '-protocol_whitelist', protocolList, // Extended protocol support for encryption
            '-allowed_extensions', 'ALL',        // Allow all file extensions
            '-reconnect', '1',                   // Auto-reconnect on connection loss
            '-reconnect_streamed', '1',          // Reconnect for live streams
            '-reconnect_delay_max', isEncryptedStream ? '10' : '5', // Longer delay for encrypted streams
            '-reconnect_at_eof', '1',            // Reconnect at end of file
            '-multiple_requests', '1',           // Use multiple HTTP requests for segments
            '-seekable', '0',                    // Treat as non-seekable live stream
            '-analyzeduration', isEncryptedStream ? '10000000' : '5000000', // Longer analysis for encrypted
            '-probesize', isEncryptedStream ? '50M' : '10M', // Larger probe for encrypted streams
          ];
          
          // Add encryption-specific options
          if (isEncryptedStream) {
            hlsInputOptions.push(
              '-max_reload', '8192',             // Increase reload attempts for key fetching
              '-hls_flags', 'delete_segments+round_durations', // Handle segment cleanup
              '-http_persistent', '1',           // Keep HTTP connections alive
              '-rw_timeout', '30000000'          // 30 second read/write timeout
            );
          }
          
          args.splice(inputIndex - 1, 0, ...hlsInputOptions);
        }
        
        logger.stream('Configured FFmpeg for HLS stream with enhanced encryption support', { 
          streamId: stream.id,
          videoCodec: 'H.264 High Profile (avc1.4D4028, avc1.4D401F)',
          audioCodec: 'AAC-LC (mp4a.40.2)',
          sampleRate: '48000Hz',
          channels: 'stereo',
          profile: 'high',
          level: '4.0',
          encrypted: isEncryptedStream,
          encryptionMethod: encryptionInfo?.method || 'none',
          protocolWhitelist: isEncryptedStream ? 'extended' : 'standard'
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

      return {
        process: ffmpegProcess,
        isEncrypted: isEncryptedStream,
        encryptionInfo: encryptionInfo
      };

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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes'
      });
      
      // Set appropriate content type based on URL
      if (streamUrl.includes('.m3u8')) {
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
      } else if (streamUrl.includes('.ts')) {
        res.set('Content-Type', 'video/MP2T');
      } else {
        res.set('Content-Type', 'video/mp4');
      }

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

// Process event handlers removed to prevent premature shutdown

module.exports = streamPreviewService;