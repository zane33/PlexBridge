const axios = require('axios');
const logger = require('../utils/logger');
const url = require('url');
const path = require('path');

/**
 * HLS Segment Resolver Service
 * Resolves and caches HLS segment URLs from master and variant playlists
 * Critical for Android TV compatibility
 */
class HLSSegmentResolver {
  constructor() {
    // Cache for playlist content and segment URLs
    this.playlistCache = new Map();
    this.segmentUrlCache = new Map();
    this.cacheDuration = 10000; // 10 seconds cache for playlists
    this.segmentCacheDuration = 30000; // 30 seconds cache for segment URLs
  }

  /**
   * Resolve the actual URL for an HLS segment
   * @param {string} streamUrl - The original stream URL
   * @param {string} segmentFilename - The segment filename (e.g., "segment123.ts")
   * @param {Object} options - Additional options
   * @returns {Promise<string>} The resolved segment URL
   */
  async resolveSegmentUrl(streamUrl, segmentFilename, options = {}) {
    const cacheKey = `${streamUrl}:${segmentFilename}`;
    
    // Check cache first
    const cached = this.segmentUrlCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.segmentCacheDuration) {
      logger.debug('Using cached segment URL', { 
        segmentFilename, 
        cachedUrl: cached.url.substring(0, 50) + '...'
      });
      return cached.url;
    }

    try {
      // First, fetch the master/variant playlist to find segment URLs
      const playlist = await this.fetchPlaylist(streamUrl, options);
      
      // Parse the playlist to find the segment URL
      const segmentUrl = this.findSegmentUrlInPlaylist(playlist, segmentFilename, streamUrl);
      
      if (segmentUrl) {
        // Cache the resolved URL
        this.segmentUrlCache.set(cacheKey, {
          url: segmentUrl,
          timestamp: Date.now()
        });
        
        logger.info('Resolved HLS segment URL', {
          segmentFilename,
          resolvedUrl: segmentUrl.substring(0, 50) + '...',
          baseUrl: streamUrl.substring(0, 50) + '...'
        });
        
        return segmentUrl;
      }
      
      // If not found in playlist, try constructing based on common patterns
      return this.constructSegmentUrl(streamUrl, segmentFilename, playlist);
      
    } catch (error) {
      logger.error('Failed to resolve segment URL', {
        streamUrl: streamUrl.substring(0, 50) + '...',
        segmentFilename,
        error: error.message
      });
      
      // Fallback: construct based on base URL
      return this.constructFallbackUrl(streamUrl, segmentFilename);
    }
  }

  /**
   * Fetch and cache HLS playlist
   * @param {string} playlistUrl - URL of the playlist
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Playlist data
   */
  async fetchPlaylist(playlistUrl, options = {}) {
    const cacheKey = playlistUrl;
    
    // Check cache
    const cached = this.playlistCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }

    // Follow redirects to get the actual playlist URL
    const response = await axios.get(playlistUrl, {
      maxRedirects: 5,
      timeout: 10000,
      headers: {
        'User-Agent': options.userAgent || 'PlexBridge/1.0',
        'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*'
      },
      validateStatus: (status) => status < 400
    });

    const playlistData = {
      content: response.data,
      finalUrl: response.request.res.responseUrl || playlistUrl,
      baseUrl: this.extractBaseUrl(response.request.res.responseUrl || playlistUrl),
      headers: response.headers
    };

    // Cache the playlist
    this.playlistCache.set(cacheKey, {
      data: playlistData,
      timestamp: Date.now()
    });

    return playlistData;
  }

  /**
   * Find segment URL in playlist content
   * @param {Object} playlist - Playlist data
   * @param {string} segmentFilename - Segment filename to find
   * @param {string} streamUrl - Original stream URL
   * @returns {string|null} Found segment URL or null
   */
  findSegmentUrlInPlaylist(playlist, segmentFilename, streamUrl) {
    const lines = playlist.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if this line contains our segment
      if (line.includes(segmentFilename)) {
        // If it's a full URL, return it
        if (line.startsWith('http://') || line.startsWith('https://')) {
          return line;
        }
        
        // If it's a relative path, construct full URL
        if (line.startsWith('/')) {
          // Absolute path
          const urlParts = url.parse(playlist.finalUrl);
          return `${urlParts.protocol}//${urlParts.host}${line}`;
        } else {
          // Relative path
          return url.resolve(playlist.baseUrl, line);
        }
      }
      
      // Check if this is a variant playlist reference
      if (line.endsWith('.m3u8') && !line.startsWith('#')) {
        // This might be a variant playlist, check if we need to fetch it
        const variantUrl = url.resolve(playlist.baseUrl, line);
        
        // Check if the segment might be in this variant
        // (This is a simplified check - in production, you might want to be more sophisticated)
        if (this.mightContainSegment(line, segmentFilename)) {
          try {
            const variantPlaylist = this.fetchPlaylist(variantUrl);
            const segmentUrl = this.findSegmentUrlInPlaylist(variantPlaylist, segmentFilename, variantUrl);
            if (segmentUrl) return segmentUrl;
          } catch (error) {
            logger.debug('Failed to check variant playlist', { variantUrl, error: error.message });
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Construct segment URL based on playlist patterns
   * @param {string} streamUrl - Stream URL
   * @param {string} segmentFilename - Segment filename
   * @param {Object} playlist - Playlist data
   * @returns {string} Constructed segment URL
   */
  constructSegmentUrl(streamUrl, segmentFilename, playlist) {
    // Look for segment patterns in the playlist
    const lines = playlist.content.split('\n');
    let segmentPattern = null;
    
    for (const line of lines) {
      if (line.includes('.ts') && !line.startsWith('#')) {
        // Found a segment line, extract the pattern
        const match = line.match(/(\d+)\.ts/);
        if (match) {
          segmentPattern = line.replace(/\d+\.ts/, segmentFilename);
          break;
        }
      }
    }
    
    if (segmentPattern) {
      // Construct URL based on pattern
      if (segmentPattern.startsWith('http://') || segmentPattern.startsWith('https://')) {
        return segmentPattern;
      }
      return url.resolve(playlist.baseUrl, segmentPattern);
    }
    
    // Default: append to base URL
    return url.resolve(playlist.baseUrl, segmentFilename);
  }

  /**
   * Construct fallback URL when resolution fails
   * @param {string} streamUrl - Stream URL
   * @param {string} segmentFilename - Segment filename
   * @returns {string} Fallback URL
   */
  constructFallbackUrl(streamUrl, segmentFilename) {
    // Remove any query parameters and fragment
    const cleanUrl = streamUrl.split('?')[0].split('#')[0];
    
    // If URL ends with .m3u8, replace with segment filename
    if (cleanUrl.endsWith('.m3u8')) {
      return cleanUrl.replace(/[^\/]+\.m3u8$/, segmentFilename);
    }
    
    // Otherwise, append segment to base path
    const baseUrl = cleanUrl.replace(/\/[^\/]*$/, '/');
    return baseUrl + segmentFilename;
  }

  /**
   * Extract base URL from a full URL
   * @param {string} fullUrl - Full URL
   * @returns {string} Base URL
   */
  extractBaseUrl(fullUrl) {
    const urlParts = url.parse(fullUrl);
    const pathParts = urlParts.pathname.split('/');
    pathParts.pop(); // Remove filename
    return `${urlParts.protocol}//${urlParts.host}${pathParts.join('/')}/`;
  }

  /**
   * Check if a variant playlist might contain a segment
   * @param {string} variantName - Variant playlist name
   * @param {string} segmentFilename - Segment filename
   * @returns {boolean} Whether it might contain the segment
   */
  mightContainSegment(variantName, segmentFilename) {
    // Simple heuristic: check if they share similar naming patterns
    // This can be made more sophisticated based on your needs
    const variantBase = variantName.replace(/\.m3u8$/, '');
    const segmentBase = segmentFilename.replace(/\d+\.ts$/, '');
    
    return variantBase.includes(segmentBase) || segmentBase.includes(variantBase);
  }

  /**
   * Clear caches (useful for long-running processes)
   */
  clearCaches() {
    const now = Date.now();
    
    // Clear expired playlist cache entries
    for (const [key, value] of this.playlistCache.entries()) {
      if (now - value.timestamp > this.cacheDuration * 2) {
        this.playlistCache.delete(key);
      }
    }
    
    // Clear expired segment URL cache entries
    for (const [key, value] of this.segmentUrlCache.entries()) {
      if (now - value.timestamp > this.segmentCacheDuration * 2) {
        this.segmentUrlCache.delete(key);
      }
    }
  }
}

// Export singleton instance
module.exports = new HLSSegmentResolver();