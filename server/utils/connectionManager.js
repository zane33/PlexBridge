/**
 * Connection Manager for IPTV Streams
 * 
 * This module manages connections to IPTV servers that have strict connection limits,
 * implementing VLC-compatible connection patterns to avoid 403 "Max Connections Reached" errors.
 */

const logger = require('../utils/logger');

class ConnectionManager {
  constructor() {
    // Track last request times per domain to implement delays
    this.lastRequestTimes = new Map();
    
    // Minimum delay between requests to same domain (in ms)
    this.requestDelay = {
      '38.64.138.128': 2000,  // 2-second delay for problematic servers
      'default': 1000         // 1-second delay for others
    };
  }

  /**
   * Get appropriate delay for a domain
   */
  getDelayForDomain(hostname) {
    return this.requestDelay[hostname] || this.requestDelay['default'];
  }

  /**
   * Wait for appropriate delay before making request to domain
   */
  async waitForRequestSlot(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const now = Date.now();
      
      const lastRequestTime = this.lastRequestTimes.get(hostname) || 0;
      const requiredDelay = this.getDelayForDomain(hostname);
      const timeSinceLastRequest = now - lastRequestTime;
      
      if (timeSinceLastRequest < requiredDelay) {
        const waitTime = requiredDelay - timeSinceLastRequest;
        logger.debug('Waiting for connection slot', {
          hostname,
          waitTime: `${waitTime}ms`,
          reason: 'Rate limiting to avoid connection limits'
        });
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Update last request time
      this.lastRequestTimes.set(hostname, Date.now());
      
    } catch (error) {
      logger.warn('Error in connection slot management', { url, error: error.message });
      // Continue without delay if URL parsing fails
    }
  }

  /**
   * Create VLC-compatible axios configuration
   */
  createVLCCompatibleConfig(baseConfig = {}) {
    const { Agent } = require('http');
    const { Agent: HttpsAgent } = require('https');

    return {
      ...baseConfig,
      headers: {
        'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
        'Accept': '*/*',
        'Connection': 'close',  // Force connection closure
        ...baseConfig.headers
      },
      // Prevent connection pooling and reuse
      httpAgent: new Agent({ keepAlive: false }),
      httpsAgent: new HttpsAgent({ keepAlive: false }),
      // Longer timeouts for IPTV streams
      timeout: baseConfig.timeout || 30000,
      maxRedirects: baseConfig.maxRedirects || 10
    };
  }

  /**
   * Make a VLC-compatible request with proper connection management
   */
  async makeVLCCompatibleRequest(axios, url, config = {}) {
    // Wait for appropriate slot
    await this.waitForRequestSlot(url);
    
    // Create VLC-compatible configuration
    const vlcConfig = this.createVLCCompatibleConfig(config);
    
    logger.debug('Making VLC-compatible request', {
      url: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
      headers: vlcConfig.headers,
      timeout: vlcConfig.timeout
    });

    try {
      const response = await axios.get(url, vlcConfig);
      
      logger.debug('VLC-compatible request successful', {
        url: url.substring(0, 50) + '...',
        status: response.status,
        contentLength: response.data?.length || 'unknown'
      });
      
      return response;
      
    } catch (error) {
      logger.error('VLC-compatible request failed', {
        url: url.substring(0, 50) + '...',
        error: error.message,
        status: error.response?.status,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Reset connection tracking for a domain (useful for testing)
   */
  resetDomain(hostname) {
    this.lastRequestTimes.delete(hostname);
    logger.debug('Reset connection tracking for domain', { hostname });
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const stats = {};
    for (const [hostname, lastTime] of this.lastRequestTimes.entries()) {
      stats[hostname] = {
        lastRequestTime: new Date(lastTime).toISOString(),
        timeSinceLastRequest: Date.now() - lastTime
      };
    }
    return stats;
  }
}

// Export singleton instance
module.exports = new ConnectionManager();