const axios = require('axios');
const logger = require('../utils/logger');
const { PassThrough } = require('stream');

/**
 * Segment Handler Service
 * Handles HLS segment (.ts) requests with proper error recovery and continuity
 */
class SegmentHandler {
  constructor() {
    this.segmentCache = new Map();
    this.failedSegments = new Map();
    this.maxRetries = 3;
    this.cacheTimeout = 30000; // 30 seconds
  }

  /**
   * Handle segment request with retry logic and caching
   * @param {string} segmentUrl - URL of the segment
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Segment data and headers
   */
  async handleSegment(segmentUrl, options = {}) {
    const cacheKey = segmentUrl;
    
    // Check cache first
    if (this.segmentCache.has(cacheKey)) {
      const cached = this.segmentCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        logger.debug('Returning cached segment', { segmentUrl });
        return cached.data;
      }
      this.segmentCache.delete(cacheKey);
    }

    // Check if this segment has failed recently
    if (this.failedSegments.has(segmentUrl)) {
      const failInfo = this.failedSegments.get(segmentUrl);
      if (Date.now() - failInfo.timestamp < 5000) { // 5 second backoff
        logger.warn('Segment recently failed, returning error', { segmentUrl });
        throw new Error(`Segment temporarily unavailable: ${failInfo.error}`);
      }
    }

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchSegment(segmentUrl, options, attempt);
        
        // Cache successful response
        const segmentData = {
          data: response.data,
          headers: response.headers,
          timestamp: Date.now()
        };
        
        this.segmentCache.set(cacheKey, {
          data: segmentData,
          timestamp: Date.now()
        });
        
        // Remove from failed segments if it was there
        this.failedSegments.delete(segmentUrl);
        
        return segmentData;
        
      } catch (error) {
        lastError = error;
        logger.warn(`Segment fetch attempt ${attempt} failed`, {
          segmentUrl,
          error: error.message,
          attempt
        });
        
        if (attempt < this.maxRetries) {
          // Exponential backoff
          await this.delay(Math.pow(2, attempt - 1) * 1000);
        }
      }
    }

    // Mark segment as failed
    this.failedSegments.set(segmentUrl, {
      error: lastError.message,
      timestamp: Date.now()
    });

    throw lastError;
  }

  /**
   * Fetch segment with proper headers and timeout
   * @param {string} segmentUrl - URL of the segment
   * @param {Object} options - Request options
   * @param {number} attempt - Attempt number
   * @returns {Promise<Object>} Axios response
   */
  async fetchSegment(segmentUrl, options, attempt) {
    const timeout = 10000 + (attempt * 5000); // Increase timeout with retries
    
    const response = await axios.get(segmentUrl, {
      responseType: 'arraybuffer',
      timeout,
      headers: {
        'User-Agent': options.userAgent || 'PlexBridge/1.0',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate',
        ...options.headers
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 500 // Accept all non-5xx responses
    });

    if (response.status === 404) {
      throw new Error('Segment not found (404)');
    }

    if (response.status >= 400) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  /**
   * Stream segment with proper error handling
   * @param {string} segmentUrl - URL of the segment
   * @param {Object} res - Express response object
   * @param {Object} options - Streaming options
   */
  async streamSegment(segmentUrl, res, options = {}) {
    try {
      const segmentData = await this.handleSegment(segmentUrl, options);
      
      // Set proper headers for MPEG-TS segments
      res.set({
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes'
      });

      // Copy relevant headers from upstream
      if (segmentData.headers['content-length']) {
        res.set('Content-Length', segmentData.headers['content-length']);
      }

      // Send the segment data
      res.send(Buffer.from(segmentData.data));
      
    } catch (error) {
      logger.error('Failed to stream segment', {
        segmentUrl,
        error: error.message
      });
      
      // Return appropriate error response
      if (error.message.includes('404')) {
        res.status(404).send('Segment not found');
      } else if (error.message.includes('timeout')) {
        res.status(504).send('Segment fetch timeout');
      } else {
        res.status(502).send('Failed to fetch segment');
      }
    }
  }

  /**
   * Generate a dummy segment for error recovery
   * @param {number} duration - Segment duration in seconds
   * @returns {Buffer} Empty MPEG-TS segment
   */
  generateDummySegment(duration = 2) {
    // This creates a minimal valid MPEG-TS segment with silence
    // Used as a fallback when segments fail to prevent player crashes
    const logger = require('../utils/logger');
    logger.warn('Generating dummy segment for error recovery');
    
    // MPEG-TS packet size
    const packetSize = 188;
    const numPackets = Math.floor((duration * 50000) / packetSize); // Approximate bitrate
    
    const buffer = Buffer.alloc(numPackets * packetSize);
    
    // Fill with MPEG-TS sync bytes and padding
    for (let i = 0; i < numPackets; i++) {
      const offset = i * packetSize;
      buffer[offset] = 0x47; // Sync byte
      buffer[offset + 1] = 0x1F; // PID high byte (null packets)
      buffer[offset + 2] = 0xFF; // PID low byte
      buffer[offset + 3] = 0x10; // Continuity counter
      
      // Fill rest with 0xFF (padding)
      for (let j = 4; j < packetSize; j++) {
        buffer[offset + j] = 0xFF;
      }
    }
    
    return buffer;
  }

  /**
   * Clean up old cache entries
   */
  cleanupCache() {
    const now = Date.now();
    
    // Clean segment cache
    for (const [key, value] of this.segmentCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.segmentCache.delete(key);
      }
    }
    
    // Clean failed segments
    for (const [key, value] of this.failedSegments.entries()) {
      if (now - value.timestamp > 60000) { // Clear after 1 minute
        this.failedSegments.delete(key);
      }
    }
  }

  /**
   * Delay helper for retry logic
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start cleanup interval
const segmentHandler = new SegmentHandler();
setInterval(() => segmentHandler.cleanupCache(), 60000); // Clean every minute

module.exports = segmentHandler;