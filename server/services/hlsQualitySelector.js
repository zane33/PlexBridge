const axios = require('axios');
const logger = require('../utils/logger');
const m3u8Parser = require('m3u8-parser');

/**
 * HLS Quality Selector Service
 * Ensures highest quality variant is selected from HLS master playlists
 */
class HLSQualitySelector {
  constructor() {
    this.qualityPreference = ['1080p', '720p', '480p', '360p', '240p'];
  }

  /**
   * Parse and select highest quality variant from master playlist
   * @param {string} playlistContent - The M3U8 playlist content
   * @param {string} baseUrl - Base URL for resolving relative URLs
   * @returns {Promise<Object>} Selected variant info and URL
   */
  async selectBestVariant(playlistContent, baseUrl) {
    try {
      const parser = new m3u8Parser.Parser();
      parser.push(playlistContent);
      parser.end();

      const manifest = parser.manifest;
      
      if (!manifest.playlists || manifest.playlists.length === 0) {
        // Not a master playlist, return as-is
        return {
          url: baseUrl,
          content: playlistContent,
          isMaster: false
        };
      }

      // Sort playlists by bandwidth (highest first)
      const sortedPlaylists = manifest.playlists.sort((a, b) => {
        const bandwidthA = a.attributes?.BANDWIDTH || 0;
        const bandwidthB = b.attributes?.BANDWIDTH || 0;
        return bandwidthB - bandwidthA;
      });

      // Select the highest quality variant
      const bestVariant = sortedPlaylists[0];
      
      if (!bestVariant) {
        logger.warn('No variants found in master playlist');
        return {
          url: baseUrl,
          content: playlistContent,
          isMaster: true
        };
      }

      // Resolve the variant URL
      let variantUrl = bestVariant.uri;
      if (!variantUrl.startsWith('http')) {
        // Relative URL - resolve against base URL
        const baseUrlParts = baseUrl.split('/');
        baseUrlParts.pop(); // Remove filename
        variantUrl = baseUrlParts.join('/') + '/' + variantUrl;
      }

      logger.info('Selected highest quality HLS variant', {
        bandwidth: bestVariant.attributes?.BANDWIDTH,
        resolution: bestVariant.attributes?.RESOLUTION,
        codecs: bestVariant.attributes?.CODECS,
        frameRate: bestVariant.attributes?.['FRAME-RATE'],
        variantUrl
      });

      // Fetch the selected variant playlist
      const response = await axios.get(variantUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'PlexBridge/1.0'
        }
      });

      return {
        url: variantUrl,
        content: response.data,
        isMaster: true,
        selectedVariant: {
          bandwidth: bestVariant.attributes?.BANDWIDTH,
          resolution: bestVariant.attributes?.RESOLUTION,
          codecs: bestVariant.attributes?.CODECS
        }
      };

    } catch (error) {
      logger.error('Error selecting HLS variant', {
        error: error.message,
        baseUrl
      });
      
      // Return original content on error
      return {
        url: baseUrl,
        content: playlistContent,
        error: error.message
      };
    }
  }

  /**
   * Extract resolution from variant attributes
   * @param {Object} variant - HLS variant object
   * @returns {Object} Resolution info
   */
  extractResolution(variant) {
    const resolution = variant.attributes?.RESOLUTION;
    if (!resolution) {
      return { width: 0, height: 0, label: 'unknown' };
    }

    const [width, height] = resolution.split('x').map(Number);
    let label = 'unknown';

    if (height >= 1080) label = '1080p';
    else if (height >= 720) label = '720p';
    else if (height >= 480) label = '480p';
    else if (height >= 360) label = '360p';
    else label = '240p';

    return { width, height, label };
  }

  /**
   * Compare two variants to determine which is higher quality
   * @param {Object} a - First variant
   * @param {Object} b - Second variant
   * @returns {number} Comparison result
   */
  compareVariants(a, b) {
    // First compare by bandwidth
    const bandwidthA = a.attributes?.BANDWIDTH || 0;
    const bandwidthB = b.attributes?.BANDWIDTH || 0;
    
    if (bandwidthA !== bandwidthB) {
      return bandwidthB - bandwidthA; // Higher bandwidth first
    }

    // Then by resolution
    const resA = this.extractResolution(a);
    const resB = this.extractResolution(b);
    
    if (resA.height !== resB.height) {
      return resB.height - resA.height; // Higher resolution first
    }

    // Finally by frame rate
    const fpsA = parseFloat(a.attributes?.['FRAME-RATE'] || 0);
    const fpsB = parseFloat(b.attributes?.['FRAME-RATE'] || 0);
    
    return fpsB - fpsA; // Higher frame rate first
  }
}

module.exports = new HLSQualitySelector();