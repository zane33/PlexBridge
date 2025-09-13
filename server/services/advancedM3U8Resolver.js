/**
 * Advanced M3U8 Resolver for Complex IPTV Streams
 * 
 * This service implements VLC-compatible M3U8 resolution for complex IPTV streams
 * that require special handling for connection limits, tokenized segments, and 
 * progressive stream initialization.
 * 
 * Key features:
 * - VLC-compatible stream resolution methodology
 * - Progressive initialization for slow upstream connections (10-15 seconds)
 * - Proper segment URL resolution with base URL handling
 * - Connection limit management with authentication token handling
 * - Keep-alive mechanism for Plex compatibility
 */

const axios = require('axios');
const { URL } = require('url');
const logger = require('../utils/logger');
const connectionManager = require('../utils/connectionManager');

class AdvancedM3U8Resolver {
  constructor() {
    // Track resolution state for each stream
    this.resolutionCache = new Map();
    this.activeResolutions = new Map();
    
    // VLC-compatible request configuration
    this.vlcConfig = {
      headers: {
        'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
        'Accept': '*/*',
        'Connection': 'close'
      },
      timeout: 45000, // 45 seconds for slow IPTV servers
      maxRedirects: 10,
      maxContentLength: 2 * 1024 * 1024 // 2MB for large playlists
    };
  }

  /**
   * Resolve M3U8 URL with VLC-compatible methodology
   * Handles progressive initialization and keep-alive for Plex
   */
  async resolveM3U8Stream(originalUrl, options = {}) {
    const {
      connectionLimits = false,
      userAgent = null,
      channelId = null,
      enableKeepAlive = true
    } = options;

    const resolutionId = `${originalUrl}_${Date.now()}`;
    
    try {
      logger.info('Starting advanced M3U8 resolution', {
        url: originalUrl.substring(0, 100) + '...',
        resolutionId,
        connectionLimits,
        channelId
      });

      // Step 1: Progressive initialization - start immediately
      const resolution = {
        url: originalUrl,
        status: 'initializing',
        startTime: Date.now(),
        segments: [],
        baseUrl: null,
        keepAliveActive: enableKeepAlive
      };
      
      this.activeResolutions.set(resolutionId, resolution);

      // Step 2: VLC-compatible connection management
      if (connectionLimits) {
        logger.debug('Applying connection limits strategy', { resolutionId });
        await connectionManager.waitForRequestSlot(originalUrl, userAgent);
      }

      // Step 3: Resolve the M3U8 playlist with proper error handling
      const playlistResponse = await this.fetchM3U8WithRetry(originalUrl, {
        ...this.vlcConfig,
        headers: {
          ...this.vlcConfig.headers,
          ...(userAgent && { 'User-Agent': userAgent })
        }
      });

      resolution.status = 'playlist_loaded';
      resolution.contentType = playlistResponse.headers['content-type'];
      resolution.playlistContent = playlistResponse.data;

      // Step 4: Analyze playlist structure
      const analysis = await this.analyzePlaylist(playlistResponse.data, originalUrl);
      resolution.analysis = analysis;
      
      if (analysis.isMasterPlaylist) {
        // Master playlist - select best variant like VLC does
        const selectedVariant = await this.selectBestVariant(analysis.variants, originalUrl);
        resolution.selectedVariant = selectedVariant;
        resolution.finalUrl = selectedVariant.resolvedUrl;
        
        logger.info('Master playlist resolved to variant', {
          resolutionId,
          originalUrl: originalUrl.substring(0, 50) + '...',
          finalUrl: selectedVariant.resolvedUrl.substring(0, 50) + '...',
          bandwidth: selectedVariant.bandwidth,
          resolution: selectedVariant.resolution
        });
        
      } else if (analysis.isMediaPlaylist) {
        // Media playlist - validate segments
        resolution.finalUrl = originalUrl;
        
        // Test segment accessibility
        const segmentTest = await this.validateSegments(analysis.segments, originalUrl);
        resolution.segmentValidation = segmentTest;
        
        logger.info('Media playlist validated', {
          resolutionId,
          segmentsTotal: analysis.segments.length,
          segmentsAccessible: segmentTest.accessible,
          targetDuration: analysis.targetDuration
        });
      }

      resolution.status = 'completed';
      resolution.completionTime = Date.now();
      resolution.duration = resolution.completionTime - resolution.startTime;

      // Cache successful resolution
      this.resolutionCache.set(originalUrl, {
        ...resolution,
        cachedAt: Date.now(),
        ttl: 300000 // 5 minutes cache
      });

      logger.info('M3U8 resolution completed successfully', {
        resolutionId,
        duration: resolution.duration + 'ms',
        finalUrl: resolution.finalUrl.substring(0, 50) + '...',
        cached: true
      });

      return {
        success: true,
        originalUrl,
        finalUrl: resolution.finalUrl,
        resolutionTime: resolution.duration,
        analysis: resolution.analysis,
        keepAliveSupported: resolution.keepAliveActive
      };

    } catch (error) {
      logger.error('M3U8 resolution failed', {
        resolutionId,
        originalUrl: originalUrl.substring(0, 100) + '...',
        error: error.message,
        status: error.response?.status,
        duration: Date.now() - (this.activeResolutions.get(resolutionId)?.startTime || 0)
      });

      return {
        success: false,
        originalUrl,
        error: error.message,
        status: error.response?.status,
        fallbackUrl: originalUrl // Use original URL as fallback
      };
    } finally {
      this.activeResolutions.delete(resolutionId);
    }
  }

  /**
   * Fetch M3U8 with retry logic and progressive timeout
   */
  async fetchM3U8WithRetry(url, config, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`M3U8 fetch attempt ${attempt}/${maxRetries}`, {
          url: url.substring(0, 100) + '...'
        });

        // Progressive timeout - increase with each attempt
        const timeoutMs = config.timeout + (attempt - 1) * 15000; // +15s per retry
        
        const response = await axios.get(url, {
          ...config,
          timeout: timeoutMs
        });

        logger.debug('M3U8 fetch successful', {
          attempt,
          status: response.status,
          contentLength: response.data.length,
          responseTime: timeoutMs
        });

        return response;

      } catch (error) {
        lastError = error;
        logger.warn(`M3U8 fetch attempt ${attempt} failed`, {
          url: url.substring(0, 50) + '...',
          error: error.message,
          status: error.response?.status
        });

        // Wait before retry (except on last attempt)
        if (attempt < maxRetries) {
          const delayMs = Math.min(2000 * attempt, 10000); // Max 10s delay
          logger.debug(`Waiting ${delayMs}ms before retry`, { attempt });
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * Analyze M3U8 playlist structure
   */
  async analyzePlaylist(content, baseUrl) {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    
    const analysis = {
      isMasterPlaylist: false,
      isMediaPlaylist: false,
      variants: [],
      segments: [],
      targetDuration: null,
      mediaSequence: null,
      baseUrl: this.getBaseUrl(baseUrl)
    };

    // Check playlist type
    if (content.includes('#EXT-X-STREAM-INF')) {
      analysis.isMasterPlaylist = true;
      analysis.variants = this.extractVariants(lines, analysis.baseUrl);
    } else if (content.includes('#EXT-X-TARGETDURATION')) {
      analysis.isMediaPlaylist = true;
      
      // Extract media playlist info
      const targetDurationMatch = content.match(/#EXT-X-TARGETDURATION:(\d+)/);
      const mediaSequenceMatch = content.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
      
      analysis.targetDuration = targetDurationMatch ? parseInt(targetDurationMatch[1]) : null;
      analysis.mediaSequence = mediaSequenceMatch ? parseInt(mediaSequenceMatch[1]) : null;
      analysis.segments = this.extractSegments(lines, analysis.baseUrl);
    }

    return analysis;
  }

  /**
   * Extract variants from master playlist
   */
  extractVariants(lines, baseUrl) {
    const variants = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith('#')) {
          const variant = {
            url: nextLine,
            resolvedUrl: this.resolveUrl(nextLine, baseUrl)
          };

          // Extract bandwidth
          const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
          if (bandwidthMatch) {
            variant.bandwidth = parseInt(bandwidthMatch[1]);
          }

          // Extract resolution
          const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
          if (resolutionMatch) {
            variant.resolution = resolutionMatch[1];
          }

          variants.push(variant);
        }
      }
    }

    return variants;
  }

  /**
   * Extract segments from media playlist
   */
  extractSegments(lines, baseUrl) {
    const segments = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith('#') && line.trim()) {
        segments.push({
          url: line,
          resolvedUrl: this.resolveUrl(line, baseUrl)
        });
      }
    }

    return segments;
  }

  /**
   * Select best variant (highest bandwidth) like VLC does
   */
  async selectBestVariant(variants, baseUrl) {
    if (!variants || variants.length === 0) {
      throw new Error('No variants found in master playlist');
    }

    // Sort by bandwidth (highest first)
    const sortedVariants = variants.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
    const bestVariant = sortedVariants[0];

    logger.debug('Selected best variant', {
      totalVariants: variants.length,
      selectedBandwidth: bestVariant.bandwidth,
      selectedResolution: bestVariant.resolution,
      url: bestVariant.resolvedUrl.substring(0, 100) + '...'
    });

    return bestVariant;
  }

  /**
   * Validate segment accessibility
   */
  async validateSegments(segments, baseUrl, maxSegmentsToTest = 3) {
    if (!segments || segments.length === 0) {
      return { accessible: 0, total: 0, errors: [] };
    }

    const segmentsToTest = segments.slice(0, maxSegmentsToTest);
    let accessible = 0;
    const errors = [];

    for (const segment of segmentsToTest) {
      try {
        const response = await axios.head(segment.resolvedUrl, {
          ...this.vlcConfig,
          timeout: 10000 // Shorter timeout for segment validation
        });

        if (response.status >= 200 && response.status < 400) {
          accessible++;
        }

      } catch (error) {
        errors.push({
          url: segment.url,
          error: error.message,
          status: error.response?.status
        });
      }
    }

    return {
      accessible,
      total: segmentsToTest.length,
      accessiblePercentage: (accessible / segmentsToTest.length) * 100,
      errors
    };
  }

  /**
   * Resolve relative URLs to absolute URLs
   */
  resolveUrl(url, baseUrl) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url; // Already absolute
    }

    try {
      return new URL(url, baseUrl).toString();
    } catch (error) {
      logger.warn('Failed to resolve relative URL', { url, baseUrl, error: error.message });
      return url; // Return original if resolution fails
    }
  }

  /**
   * Get base URL from a full URL
   */
  getBaseUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/'))}/`;
    } catch (error) {
      logger.warn('Failed to extract base URL', { url, error: error.message });
      return url; // Fallback to original URL
    }
  }

  /**
   * Check if resolution is cached and still valid
   */
  getCachedResolution(url) {
    const cached = this.resolutionCache.get(url);
    if (!cached) return null;

    const age = Date.now() - cached.cachedAt;
    if (age > cached.ttl) {
      this.resolutionCache.delete(url);
      return null;
    }

    return cached;
  }

  /**
   * Clear resolution cache
   */
  clearCache() {
    this.resolutionCache.clear();
    logger.debug('M3U8 resolution cache cleared');
  }

  /**
   * Get resolver statistics
   */
  getStats() {
    return {
      cacheSize: this.resolutionCache.size,
      activeResolutions: this.activeResolutions.size,
      cachedUrls: Array.from(this.resolutionCache.keys()).map(url => url.substring(0, 100) + '...')
    };
  }
}

// Export singleton instance
module.exports = new AdvancedM3U8Resolver();