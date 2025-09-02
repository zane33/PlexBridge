const database = require('../services/database');
const streamManager = require('../services/streamManager');
const axios = require('axios');
const logger = require('./logger');

class StreamComparator {
  constructor() {
    this.workingChannels = [
      ' Sports 1',
      ' 1'
    ];
    
    this.failingChannels = [
      ' Cricket',
      ' Sports'
    ];
  }

  /**
   * Compare working and failing streams to identify differences
   */
  async compareStreams() {
    const comparison = {
      timestamp: new Date().toISOString(),
      working: [],
      failing: [],
      differences: {},
      patterns: {}
    };

    try {
      // Get all channels and streams from database
      const channels = await database.all(`
        SELECT c.*, s.url as stream_url, s.type as stream_type, 
               s.protocol_options, s.authentication, s.headers
        FROM channels c
        LEFT JOIN streams s ON c.id = s.channel_id
        WHERE c.enabled = 1
      `);

      // Categorize channels
      for (const channel of channels) {
        const analysis = await this.analyzeStream(channel);
        
        if (this.workingChannels.some(name => 
          channel.name?.toLowerCase().includes(name.toLowerCase()))) {
          comparison.working.push(analysis);
        } else if (this.failingChannels.some(name => 
          channel.name?.toLowerCase().includes(name.toLowerCase()))) {
          comparison.failing.push(analysis);
        }
      }

      // Identify key differences
      comparison.differences = this.identifyDifferences(comparison);
      
      // Find patterns
      comparison.patterns = this.findPatterns(comparison);

      // Log the comparison
      logger.info('Stream comparison completed', comparison);
      
      return comparison;
      
    } catch (error) {
      logger.error('Stream comparison failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze individual stream characteristics
   */
  async analyzeStream(channel) {
    const analysis = {
      channelId: channel.id,
      channelName: channel.name,
      channelNumber: channel.number,
      streamUrl: channel.stream_url,
      streamType: channel.stream_type,
      urlCharacteristics: {},
      headers: {},
      protocolOptions: {},
      accessibility: {},
      streamFormat: {}
    };

    try {
      // Parse URL characteristics
      if (channel.stream_url) {
        const url = new URL(channel.stream_url);
        analysis.urlCharacteristics = {
          protocol: url.protocol,
          hostname: url.hostname,
          pathname: url.pathname,
          hasM3U8: url.pathname.includes('.m3u8'),
          hasTS: url.pathname.includes('.ts'),
          hasMPD: url.pathname.includes('.mpd'),
          isRedirectService: url.hostname.includes('mjh.nz') || 
                            url.hostname.includes('i.mjh.nz') ||
                            url.hostname.includes(''),
          domain: this.extractDomain(url.hostname)
        };
      }

      // Parse protocol options
      if (channel.protocol_options) {
        try {
          analysis.protocolOptions = typeof channel.protocol_options === 'string'
            ? JSON.parse(channel.protocol_options)
            : channel.protocol_options;
        } catch (e) {
          analysis.protocolOptions = { parseError: true };
        }
      }

      // Parse headers
      if (channel.headers) {
        try {
          analysis.headers = typeof channel.headers === 'string'
            ? JSON.parse(channel.headers)
            : channel.headers;
        } catch (e) {
          analysis.headers = { parseError: true };
        }
      }

      // Check accessibility (without full diagnosis to be faster)
      try {
        const response = await axios.head(channel.stream_url, {
          timeout: 5000,
          maxRedirects: 5,
          validateStatus: () => true,
          headers: {
            'User-Agent': 'PlexBridge/1.0'
          }
        });

        analysis.accessibility = {
          statusCode: response.status,
          accessible: response.status >= 200 && response.status < 400,
          finalUrl: response.request.responseURL || channel.stream_url,
          redirected: response.request.responseURL !== channel.stream_url,
          contentType: response.headers['content-type'],
          server: response.headers['server'],
          cacheControl: response.headers['cache-control']
        };
      } catch (error) {
        analysis.accessibility = {
          accessible: false,
          error: error.message,
          errorCode: error.code
        };
      }

      // Detect stream format
      analysis.streamFormat = await streamManager.detectStreamFormat(channel.stream_url);

    } catch (error) {
      analysis.error = error.message;
    }

    return analysis;
  }

  /**
   * Identify key differences between working and failing streams
   */
  identifyDifferences(comparison) {
    const differences = {
      urlPatterns: {},
      accessibility: {},
      streamFormats: {},
      protocolOptions: {},
      domains: {}
    };

    // Compare URL patterns
    const workingUrls = comparison.working.map(s => s.urlCharacteristics);
    const failingUrls = comparison.failing.map(s => s.urlCharacteristics);

    // Check redirect services
    differences.urlPatterns.redirectServices = {
      working: workingUrls.filter(u => u?.isRedirectService).length,
      failing: failingUrls.filter(u => u?.isRedirectService).length
    };

    // Check protocols
    differences.urlPatterns.protocols = {
      working: [...new Set(workingUrls.map(u => u?.protocol).filter(Boolean))],
      failing: [...new Set(failingUrls.map(u => u?.protocol).filter(Boolean))]
    };

    // Check accessibility
    differences.accessibility = {
      working: {
        accessible: comparison.working.filter(s => s.accessibility?.accessible).length,
        total: comparison.working.length,
        percentage: Math.round((comparison.working.filter(s => s.accessibility?.accessible).length / comparison.working.length) * 100)
      },
      failing: {
        accessible: comparison.failing.filter(s => s.accessibility?.accessible).length,
        total: comparison.failing.length,
        percentage: Math.round((comparison.failing.filter(s => s.accessibility?.accessible).length / comparison.failing.length) * 100)
      }
    };

    // Check stream formats
    differences.streamFormats = {
      working: comparison.working.reduce((acc, s) => {
        const type = s.streamFormat?.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
      failing: comparison.failing.reduce((acc, s) => {
        const type = s.streamFormat?.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {})
    };

    // Check domains
    differences.domains = {
      working: [...new Set(workingUrls.map(u => u?.domain).filter(Boolean))],
      failing: [...new Set(failingUrls.map(u => u?.domain).filter(Boolean))]
    };

    // Check for force transcoding
    differences.protocolOptions.forceTranscode = {
      working: comparison.working.filter(s => s.protocolOptions?.forceTranscode === true).length,
      failing: comparison.failing.filter(s => s.protocolOptions?.forceTranscode === true).length
    };

    return differences;
  }

  /**
   * Find patterns in failing streams
   */
  findPatterns(comparison) {
    const patterns = {
      commonFailureReasons: [],
      recommendations: []
    };

    // Check if all failing streams are inaccessible
    const failingAccessible = comparison.failing.filter(s => s.accessibility?.accessible);
    if (failingAccessible.length === 0 && comparison.failing.length > 0) {
      patterns.commonFailureReasons.push('All failing streams are inaccessible (403/404 errors)');
      patterns.recommendations.push('Check if streams require authentication or have geo-blocking');
    }

    // Check for specific error codes
    const error403Count = comparison.failing.filter(s => s.accessibility?.statusCode === 403).length;
    const error404Count = comparison.failing.filter(s => s.accessibility?.statusCode === 404).length;
    
    if (error403Count > 0) {
      patterns.commonFailureReasons.push(`${error403Count} streams return 403 Forbidden`);
      patterns.recommendations.push('Streams may be geo-blocked or require specific headers/authentication');
    }
    
    if (error404Count > 0) {
      patterns.commonFailureReasons.push(`${error404Count} streams return 404 Not Found`);
      patterns.recommendations.push('Stream URLs may be expired or incorrect');
    }

    // Check for domain patterns
    const failingDomains = comparison.failing
      .map(s => s.urlCharacteristics?.domain)
      .filter(Boolean);
    
    const domainCounts = failingDomains.reduce((acc, domain) => {
      acc[domain] = (acc[domain] || 0) + 1;
      return acc;
    }, {});
    
    for (const [domain, count] of Object.entries(domainCounts)) {
      if (count > 1) {
        patterns.commonFailureReasons.push(`Multiple failures from domain: ${domain}`);
      }
    }

    // Check stream format patterns
    const failingFormats = comparison.failing
      .map(s => s.streamFormat?.type)
      .filter(Boolean);
    
    const formatCounts = failingFormats.reduce((acc, format) => {
      acc[format] = (acc[format] || 0) + 1;
      return acc;
    }, {});
    
    for (const [format, count] of Object.entries(formatCounts)) {
      if (format === 'unknown' && count > 0) {
        patterns.commonFailureReasons.push('Unable to detect stream format for failing channels');
        patterns.recommendations.push('Streams may be using non-standard formats or require special handling');
      }
    }

    // Compare with working streams
    const workingHasRedirects = comparison.working.some(s => s.urlCharacteristics?.isRedirectService);
    const failingHasRedirects = comparison.failing.some(s => s.urlCharacteristics?.isRedirectService);
    
    if (workingHasRedirects && !failingHasRedirects) {
      patterns.recommendations.push('Working streams use redirect services (mjh.nz) - consider if failing streams need similar setup');
    }

    return patterns;
  }

  /**
   * Extract domain from hostname
   */
  extractDomain(hostname) {
    if (!hostname) return null;
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  }

  /**
   * Generate detailed report
   */
  async generateReport() {
    const comparison = await this.compareStreams();
    
    const report = {
      summary: {
        totalWorking: comparison.working.length,
        totalFailing: comparison.failing.length,
        workingAccessible: comparison.working.filter(s => s.accessibility?.accessible).length,
        failingAccessible: comparison.failing.filter(s => s.accessibility?.accessible).length
      },
      differences: comparison.differences,
      patterns: comparison.patterns,
      failingChannels: comparison.failing.map(s => ({
        name: s.channelName,
        url: s.streamUrl,
        accessible: s.accessibility?.accessible,
        statusCode: s.accessibility?.statusCode,
        format: s.streamFormat?.type,
        error: s.accessibility?.error
      })),
      recommendations: [
        ...comparison.patterns.recommendations,
        'Enable enhanced error logging to capture more details',
        'Test streams with different User-Agent headers',
        'Consider implementing stream-specific authentication'
      ]
    };

    return report;
  }
}

module.exports = new StreamComparator();