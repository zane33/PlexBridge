/**
 * Connection Manager for IPTV Streams
 * 
 * This module manages connections to IPTV servers that have strict connection limits,
 * implementing VLC-compatible connection patterns to avoid 403 "Max Connections Reached" errors.
 * 
 * Features Plex client detection with adaptive delays:
 * - Plex clients get minimal delays (500ms max) to prevent timeouts
 * - Non-Plex requests get full protection delays
 * - Context-aware delay management based on User-Agent patterns
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
    
    // Optimized delays for Plex clients to prevent timeouts
    this.plexOptimizedDelays = {
      '38.64.138.128': 500,   // Reduced to 500ms for Plex
      'default': 300          // Minimal delay for other domains
    };
    
    // Plex User-Agent detection patterns
    this.plexUserAgents = [
      /plex/i,
      /plexamp/i,
      /plex media server/i,
      /plex tv/i,
      /plex web/i,
      /plex for/i
    ];
  }

  /**
   * Detect if a User-Agent is from a Plex client
   */
  isPlexClient(userAgent) {
    if (!userAgent) return false;
    
    // Check against known Plex User-Agent patterns
    return this.plexUserAgents.some(pattern => pattern.test(userAgent));
  }
  
  /**
   * Get appropriate delay for a domain with Plex optimization
   */
  getDelayForDomain(hostname, userAgent = null) {
    const isPlexRequest = this.isPlexClient(userAgent);
    
    if (isPlexRequest) {
      // Use optimized delays for Plex clients
      const delay = this.plexOptimizedDelays[hostname] || this.plexOptimizedDelays['default'];
      logger.debug('Using Plex-optimized delay', {
        hostname,
        delay: `${delay}ms`,
        userAgent: userAgent?.substring(0, 50) + '...'
      });
      return delay;
    }
    
    // Use standard delays for non-Plex requests
    return this.requestDelay[hostname] || this.requestDelay['default'];
  }

  /**
   * Wait for appropriate delay before making request to domain
   * Now supports context-aware delays based on User-Agent
   */
  async waitForRequestSlot(url, userAgent = null) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const now = Date.now();
      
      const lastRequestTime = this.lastRequestTimes.get(hostname) || 0;
      const requiredDelay = this.getDelayForDomain(hostname, userAgent);
      const timeSinceLastRequest = now - lastRequestTime;
      const isPlexRequest = this.isPlexClient(userAgent);
      
      if (timeSinceLastRequest < requiredDelay) {
        const waitTime = requiredDelay - timeSinceLastRequest;
        logger.debug('Waiting for connection slot', {
          hostname,
          waitTime: `${waitTime}ms`,
          clientType: isPlexRequest ? 'Plex' : 'Standard',
          reason: isPlexRequest ? 'Plex-optimized rate limiting' : 'Rate limiting to avoid connection limits'
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
      // Longer timeouts for IPTV streams (increased for 15-second upstream connections)
      timeout: baseConfig.timeout || 45000,
      maxRedirects: baseConfig.maxRedirects || 10
    };
  }

  /**
   * Make a VLC-compatible request with proper connection management and Plex optimization
   */
  async makeVLCCompatibleRequest(axios, url, config = {}) {
    // Extract User-Agent from config or use default
    const userAgent = config.userAgent || config.headers?.['User-Agent'];
    
    // Wait for appropriate slot with context awareness
    await this.waitForRequestSlot(url, userAgent);
    
    // Create VLC-compatible configuration
    const vlcConfig = this.createVLCCompatibleConfig(config);
    
    const isPlexRequest = this.isPlexClient(userAgent);
    
    logger.debug('Making VLC-compatible request', {
      url: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
      headers: vlcConfig.headers,
      timeout: vlcConfig.timeout,
      clientType: isPlexRequest ? 'Plex' : 'Standard',
      optimized: isPlexRequest
    });

    try {
      const response = await axios.get(url, vlcConfig);
      
      logger.debug('VLC-compatible request successful', {
        url: url.substring(0, 50) + '...',
        status: response.status,
        contentLength: response.data?.length || 'unknown',
        clientType: isPlexRequest ? 'Plex' : 'Standard'
      });
      
      return response;
      
    } catch (error) {
      logger.error('VLC-compatible request failed', {
        url: url.substring(0, 50) + '...',
        error: error.message,
        status: error.response?.status,
        response: error.response?.data,
        clientType: isPlexRequest ? 'Plex' : 'Standard'
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
   * Get connection statistics with Plex optimization info
   */
  getStats() {
    const stats = {};
    for (const [hostname, lastTime] of this.lastRequestTimes.entries()) {
      stats[hostname] = {
        lastRequestTime: new Date(lastTime).toISOString(),
        timeSinceLastRequest: Date.now() - lastTime,
        standardDelay: this.requestDelay[hostname] || this.requestDelay['default'],
        plexOptimizedDelay: this.plexOptimizedDelays[hostname] || this.plexOptimizedDelays['default']
      };
    }
    return {
      domains: stats,
      plexOptimizationsActive: true,
      supportedPlexPatterns: this.plexUserAgents.map(pattern => pattern.toString())
    };
  }
  
  /**
   * Test if a User-Agent would be detected as Plex (utility for debugging)
   */
  testPlexDetection(userAgent) {
    return {
      userAgent,
      isPlexClient: this.isPlexClient(userAgent),
      matchingPattern: this.plexUserAgents.find(pattern => pattern.test(userAgent))?.toString()
    };
  }
}

// Export singleton instance
module.exports = new ConnectionManager();