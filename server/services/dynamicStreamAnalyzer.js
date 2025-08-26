const axios = require('axios');
const { URL } = require('url');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Dynamic Stream Analyzer - Intelligently analyzes any stream URI without domain-specific logic
 * 
 * This service replaces hardcoded domain checks with intelligent stream characteristic analysis,
 * allowing PlexBridge to handle any IPTV source optimally based on stream behavior rather than URL patterns.
 */
class DynamicStreamAnalyzer {
  constructor() {
    this.analysisCache = new Map(); // Cache analysis results to avoid repeated requests
    this.cacheTimeout = 300000; // 5 minutes cache timeout
  }

  /**
   * Analyzes stream characteristics to determine optimal handling strategy
   * @param {string} url - Stream URL to analyze
   * @returns {Promise<Object>} Stream characteristics and recommended handling methods
   */
  async analyzeStreamCharacteristics(url) {
    // Check cache first
    const cacheKey = url;
    const cached = this.analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      logger.stream('Using cached stream analysis', { url, characteristics: cached.data.supportedMethods });
      return cached.data;
    }

    try {
      logger.stream('Analyzing stream characteristics for dynamic handling', { url });
      
      const characteristics = {
        hasRedirects: false,
        hasTokenAuth: false,
        hasComplexPlaylist: false,
        isLiveStream: false,
        isCDNBacked: false,
        requiresSpecialHandling: false,
        supportedMethods: [],
        confidence: 'low',
        streamType: 'unknown',
        authenticationMethod: 'none',
        playlistComplexity: 'simple'
      };

      // Analyze URL structure patterns
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();
      const query = urlObj.searchParams;
      
      // Detect token-based authentication patterns
      const tokenParams = ['token', 'auth', 'key', 'signature', 'expires', 'sessionID', 'sid', 'jwt', 'bearer'];
      const hasTokenParam = tokenParams.some(param => query.has(param));
      const hasTokenInPath = tokenParams.some(param => path.includes(param.toLowerCase()));
      
      if (hasTokenParam || hasTokenInPath) {
        characteristics.hasTokenAuth = true;
        characteristics.requiresSpecialHandling = true;
        characteristics.authenticationMethod = 'token';
        logger.stream('Token-based authentication detected', { url, type: hasTokenParam ? 'query' : 'path' });
      }

      // Analyze for CDN characteristics
      const hostname = urlObj.hostname.toLowerCase();
      const cdnIndicators = ['cdn', 'edge', 'cache', 'akamai', 'cloudfront', 'fastly', 'cloudflare', 'azure', 'amazonaws'];
      const pathIndicators = ['/hls/', '/dash/', '/playlist/', '/manifest/', '/stream/'];
      
      const isCDN = cdnIndicators.some(indicator => hostname.includes(indicator)) ||
                    pathIndicators.some(indicator => path.includes(indicator));
      
      if (isCDN) {
        characteristics.isCDNBacked = true;
        logger.stream('CDN-backed stream detected', { url, hostname });
      }

      // Test for redirects with a HEAD request
      try {
        const headResponse = await axios.head(url, {
          maxRedirects: 0,
          validateStatus: (status) => status < 400 || status === 302 || status === 301,
          timeout: 5000,
          headers: {
            'User-Agent': config.protocols?.http?.userAgent || 'PlexBridge/1.0'
          }
        });

        if (headResponse.status === 302 || headResponse.status === 301) {
          characteristics.hasRedirects = true;
          characteristics.requiresSpecialHandling = true;
          logger.stream('Redirect behavior detected', { url, redirectStatus: headResponse.status });
        }
      } catch (error) {
        // Non-redirect or network error - continue analysis
        logger.stream('HEAD request failed, continuing analysis', { url, error: error.message });
      }

      // Analyze playlist complexity for HLS streams
      if (path.includes('.m3u8') || url.includes('m3u8')) {
        characteristics.streamType = 'hls';
        
        try {
          const playlistResponse = await axios.get(url, {
            timeout: 8000,
            maxRedirects: 3, // Limited redirects for analysis
            responseType: 'text',
            headers: {
              'User-Agent': config.protocols?.http?.userAgent || 'PlexBridge/1.0'
            }
          });

          const playlistContent = playlistResponse.data;
          
          // Analyze playlist complexity markers
          const complexityMarkers = {
            multipleVariants: (playlistContent.match(/#EXT-X-STREAM-INF/g) || []).length > 1,
            segmentEncryption: playlistContent.includes('#EXT-X-KEY'),
            discontinuities: playlistContent.includes('#EXT-X-DISCONTINUITY'),
            isLive: playlistContent.includes('#EXT-X-TARGETDURATION') && !playlistContent.includes('#EXT-X-ENDLIST'),
            hasBeaconSegments: playlistContent.includes('beacon') || playlistContent.includes('tracking'),
            hasTimestamps: playlistContent.includes('#EXT-X-PROGRAM-DATE-TIME'),
            hasByteRanges: playlistContent.includes('#EXT-X-BYTERANGE')
          };

          const complexityScore = Object.values(complexityMarkers).filter(Boolean).length;
          
          if (complexityScore >= 3) {
            characteristics.hasComplexPlaylist = true;
            characteristics.requiresSpecialHandling = true;
            characteristics.playlistComplexity = 'complex';
          } else if (complexityScore >= 1) {
            characteristics.playlistComplexity = 'moderate';
          }

          if (complexityMarkers.isLive) {
            characteristics.isLiveStream = true;
          }

          characteristics.confidence = 'high';
          logger.stream('HLS playlist analysis completed', {
            url,
            complexity: characteristics.playlistComplexity,
            markers: complexityMarkers,
            score: complexityScore
          });

        } catch (error) {
          logger.stream('HLS playlist analysis failed, using URL-based detection', {
            url,
            error: error.message
          });
          characteristics.confidence = 'medium';
          characteristics.isLiveStream = true; // Assume live for safety
        }
      } else if (path.includes('.mpd') || url.includes('dash')) {
        characteristics.streamType = 'dash';
        characteristics.isLiveStream = true; // DASH streams are typically live
        characteristics.confidence = 'medium';
      } else if (path.match(/\.(ts|mp4|webm|mkv)$/)) {
        characteristics.streamType = 'direct';
        characteristics.isLiveStream = false;
        characteristics.confidence = 'high';
      }

      // Determine optimal handling methods based on characteristics
      this.determineOptimalMethods(characteristics);

      // Cache the results
      this.analysisCache.set(cacheKey, {
        timestamp: Date.now(),
        data: characteristics
      });

      logger.stream('Stream characteristics analysis complete', {
        url,
        characteristics: {
          type: characteristics.streamType,
          methods: characteristics.supportedMethods,
          special: characteristics.requiresSpecialHandling,
          confidence: characteristics.confidence
        }
      });

      return characteristics;
    } catch (error) {
      logger.error('Stream characteristics analysis failed', { url, error: error.message });
      
      // Return safe fallback characteristics
      const fallback = {
        hasRedirects: false,
        hasTokenAuth: false,
        hasComplexPlaylist: false,
        isLiveStream: true, // Assume live for safety
        isCDNBacked: false,
        requiresSpecialHandling: true, // Err on side of caution
        supportedMethods: ['minimal_intervention'],
        confidence: 'low',
        streamType: 'unknown',
        authenticationMethod: 'unknown',
        playlistComplexity: 'unknown'
      };

      // Cache fallback briefly to avoid repeated failures
      this.analysisCache.set(cacheKey, {
        timestamp: Date.now(),
        data: fallback
      });

      return fallback;
    }
  }

  /**
   * Determines optimal handling methods based on stream characteristics
   * @param {Object} characteristics - Stream characteristics object to update
   */
  determineOptimalMethods(characteristics) {
    characteristics.supportedMethods = [];

    // Priority-ordered method selection based on characteristics
    if (characteristics.hasTokenAuth && characteristics.hasComplexPlaylist) {
      // Token auth + complex playlists need minimal intervention
      characteristics.supportedMethods = ['master_playlist_direct', 'minimal_intervention'];
    } else if (characteristics.hasTokenAuth) {
      // Token auth streams need careful handling to preserve auth
      characteristics.supportedMethods = ['token_preservation', 'minimal_intervention'];
    } else if (characteristics.hasRedirects && !characteristics.hasTokenAuth) {
      // Redirect-based streams can use direct resolution
      characteristics.supportedMethods = ['resolve_redirects', 'direct_stream_url'];
    } else if (characteristics.isCDNBacked && !characteristics.hasComplexPlaylist) {
      // CDN streams benefit from enhanced connection handling
      characteristics.supportedMethods = ['segment_proxy', 'persistent_connections'];
    } else if (characteristics.hasComplexPlaylist) {
      // Complex playlists need enhanced error recovery
      characteristics.supportedMethods = ['enhanced_recovery', 'playlist_rewrite'];
    } else {
      // Standard streams
      characteristics.supportedMethods = ['standard_proxy', 'direct_passthrough'];
    }

    // Add fallback methods
    if (!characteristics.supportedMethods.includes('minimal_intervention')) {
      characteristics.supportedMethods.push('minimal_intervention');
    }
  }

  /**
   * Generates optimal FFmpeg configuration based on stream characteristics
   * @param {Object} characteristics - Stream characteristics
   * @param {Object} settings - Application settings
   * @returns {string} FFmpeg command string
   */
  generateOptimalFFmpegConfig(characteristics, settings = {}) {
    let command;
    let logLevel = '-loglevel error';
    
    // Adjust log level based on complexity
    if (characteristics.requiresSpecialHandling || characteristics.confidence === 'low') {
      logLevel = '-v info'; // More verbose logging for complex streams
    }

    if (characteristics.requiresSpecialHandling) {
      if (characteristics.hasTokenAuth && characteristics.hasComplexPlaylist) {
        // Minimal intervention for token + complex playlist streams
        command = `-hide_banner ${logLevel} ` +
                  '-tls_verify 0 ' +  // Skip certificate verification for tracking URLs
                  '-reconnect 1 -reconnect_streamed 1 -reconnect_on_network_error 1 ' +
                  '-reconnect_delay_max 5 ' +
                  '-i [URL] ' +
                  '-c:v copy -c:a copy ' +
                  '-f mpegts -muxdelay 0 -muxpreload 0 ' +
                  'pipe:1';
      } else if (characteristics.isCDNBacked) {
        // CDN-optimized configuration
        command = `-hide_banner ${logLevel} ` +
                  '-http_persistent 1 -multiple_requests 1 ' +
                  '-i [URL] ' +
                  '-c:v copy -c:a copy ' +
                  '-f mpegts -muxdelay 0 ' +
                  'pipe:1';
      } else if (characteristics.hasComplexPlaylist) {
        // Complex playlist handling with enhanced recovery
        command = `-hide_banner ${logLevel} ` +
                  '-reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 ' +
                  '-i [URL] ' +
                  '-c:v copy -c:a copy ' +
                  '-f mpegts pipe:1';
      } else {
        // General special handling
        command = `-hide_banner ${logLevel} ` +
                  '-reconnect 1 -reconnect_at_eof 1 ' +
                  '-i [URL] ' +
                  '-c:v copy -c:a copy ' +
                  '-f mpegts pipe:1';
      }
    } else {
      // Standard configuration for simple streams
      command = settings?.plexlive?.transcoding?.mpegts?.command || 
                config?.plexlive?.transcoding?.mpegts?.command ||
                `-hide_banner ${logLevel} -i [URL] -c:v copy -c:a copy -f mpegts pipe:1`;
    }

    return command;
  }

  /**
   * Determines if HLS protocol arguments should be added
   * @param {Object} characteristics - Stream characteristics
   * @returns {boolean} Whether to add HLS args
   */
  shouldAddHLSArgs(characteristics) {
    // Don't add HLS args for token-based streams or very complex playlists
    return !characteristics.hasTokenAuth && characteristics.playlistComplexity !== 'complex';
  }

  /**
   * Clears analysis cache
   */
  clearCache() {
    this.analysisCache.clear();
    logger.stream('Stream analysis cache cleared');
  }

  /**
   * Gets cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const [url, entry] of this.analysisCache.entries()) {
      if (now - entry.timestamp < this.cacheTimeout) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.analysisCache.size,
      validEntries,
      expiredEntries,
      cacheTimeout: this.cacheTimeout
    };
  }
}

module.exports = new DynamicStreamAnalyzer();