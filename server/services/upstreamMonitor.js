/**
 * Upstream Source Monitoring Service
 *
 * Provides comprehensive monitoring of upstream IPTV sources and FFmpeg processes
 * to detect connection issues, network problems, and source difficulties.
 *
 * This service helps identify when streaming issues are caused by upstream
 * sources rather than PlexBridge internal problems.
 */

const logger = require('../utils/logger');
const config = require('../config');

class UpstreamMonitor {
  constructor() {
    this.monitoredProcesses = new Map();
    this.upstreamStats = new Map();
    this.connectionPatterns = new Map();
    this.enabled = config.streaming?.upstreamMonitoring !== false;

    if (this.enabled) {
      logger.info('Upstream monitoring service initialized');
    }
  }

  /**
   * Register an FFmpeg process for upstream monitoring
   */
  monitorFFmpegProcess(sessionId, ffmpegProcess, streamUrl, options = {}) {
    if (!this.enabled || !ffmpegProcess) {
      return;
    }

    const monitorData = {
      sessionId,
      streamUrl,
      startTime: Date.now(),
      connectionAttempts: 0,
      reconnectionAttempts: 0,
      lastUpstreamError: null,
      upstreamErrors: [],
      networkIssues: [],
      qualityDegradation: false,
      processId: ffmpegProcess.pid,
      ...options
    };

    this.monitoredProcesses.set(sessionId, monitorData);

    // Monitor stderr for upstream connection issues
    if (ffmpegProcess.stderr) {
      ffmpegProcess.stderr.on('data', (data) => {
        this.analyzeFFmpegOutput(sessionId, data.toString());
      });
    }

    // Monitor process events
    ffmpegProcess.on('error', (error) => {
      this.handleProcessError(sessionId, error);
    });

    ffmpegProcess.on('exit', (code, signal) => {
      this.handleProcessExit(sessionId, code, signal);
    });

    logger.info('Upstream monitoring started for session', {
      sessionId,
      streamUrl: this.sanitizeUrl(streamUrl),
      processId: ffmpegProcess.pid
    });
  }

  /**
   * Analyze FFmpeg stderr output for upstream issues
   */
  analyzeFFmpegOutput(sessionId, output) {
    const monitorData = this.monitoredProcesses.get(sessionId);
    if (!monitorData) return;

    const now = Date.now();

    // Connection attempt patterns
    if (this.matchesPattern(output, [
      'Opening.*for reading',
      'Opening connection to',
      'Connecting to'
    ])) {
      monitorData.connectionAttempts++;
      logger.debug('Upstream connection attempt detected', {
        sessionId,
        attempt: monitorData.connectionAttempts,
        url: this.sanitizeUrl(monitorData.streamUrl)
      });
    }

    // Reconnection patterns
    if (this.matchesPattern(output, [
      'reconnecting',
      'Reconnecting to',
      'Connection lost',
      'trying to reconnect'
    ])) {
      monitorData.reconnectionAttempts++;
      logger.warn('Upstream reconnection attempt detected', {
        sessionId,
        reconnectionAttempt: monitorData.reconnectionAttempts,
        url: this.sanitizeUrl(monitorData.streamUrl),
        timeSinceStart: now - monitorData.startTime
      });

      this.logUpstreamIssue(sessionId, 'reconnection', output, {
        attempt: monitorData.reconnectionAttempts
      });
    }

    // Network timeout patterns
    if (this.matchesPattern(output, [
      'Connection timed out',
      'Operation timed out',
      'Read timed out',
      'Socket timeout',
      'connect timeout'
    ])) {
      const networkIssue = {
        type: 'timeout',
        timestamp: now,
        message: output.trim()
      };
      monitorData.networkIssues.push(networkIssue);

      logger.error('Upstream network timeout detected', {
        sessionId,
        url: this.sanitizeUrl(monitorData.streamUrl),
        timeoutCount: monitorData.networkIssues.filter(i => i.type === 'timeout').length,
        message: output.trim()
      });

      this.logUpstreamIssue(sessionId, 'network_timeout', output, {
        timeoutNumber: monitorData.networkIssues.filter(i => i.type === 'timeout').length
      });
    }

    // Connection refused patterns
    if (this.matchesPattern(output, [
      'Connection refused',
      'No connection could be made',
      'Connection reset by peer',
      'Host is unreachable',
      'Network unreachable'
    ])) {
      const networkIssue = {
        type: 'connection_refused',
        timestamp: now,
        message: output.trim()
      };
      monitorData.networkIssues.push(networkIssue);

      logger.error('Upstream connection refused', {
        sessionId,
        url: this.sanitizeUrl(monitorData.streamUrl),
        refusalCount: monitorData.networkIssues.filter(i => i.type === 'connection_refused').length,
        message: output.trim()
      });

      this.logUpstreamIssue(sessionId, 'connection_refused', output, {
        refusalNumber: monitorData.networkIssues.filter(i => i.type === 'connection_refused').length
      });
    }

    // HTTP error patterns
    if (this.matchesPattern(output, [
      'HTTP error',
      '404 Not Found',
      '403 Forbidden',
      '500 Internal Server Error',
      '502 Bad Gateway',
      '503 Service Unavailable',
      '504 Gateway Timeout'
    ])) {
      const httpErrorMatch = output.match(/(\d{3})\s+(.+?)(?:\n|$)/);
      const httpCode = httpErrorMatch ? httpErrorMatch[1] : 'unknown';
      const httpMessage = httpErrorMatch ? httpErrorMatch[2] : output.trim();

      logger.error('Upstream HTTP error detected', {
        sessionId,
        url: this.sanitizeUrl(monitorData.streamUrl),
        httpCode,
        httpMessage,
        message: output.trim()
      });

      this.logUpstreamIssue(sessionId, 'http_error', output, {
        httpCode,
        httpMessage
      });
    }

    // SSL/TLS certificate issues
    if (this.matchesPattern(output, [
      'SSL connection',
      'certificate',
      'TLS handshake',
      'SSL handshake',
      'SSL error'
    ])) {
      logger.warn('Upstream SSL/TLS issue detected', {
        sessionId,
        url: this.sanitizeUrl(monitorData.streamUrl),
        message: output.trim()
      });

      this.logUpstreamIssue(sessionId, 'ssl_issue', output);
    }

    // Stream format issues
    if (this.matchesPattern(output, [
      'Invalid data found',
      'Unknown format',
      'No video streams found',
      'Unsupported codec',
      'Stream not found',
      'Could not find codec parameters'
    ])) {
      logger.warn('Upstream stream format issue detected', {
        sessionId,
        url: this.sanitizeUrl(monitorData.streamUrl),
        message: output.trim()
      });

      this.logUpstreamIssue(sessionId, 'format_issue', output);
    }

    // Quality degradation indicators
    if (this.matchesPattern(output, [
      'dropping frames',
      'buffer underrun',
      'decode errors',
      'packet loss',
      'bitrate too low'
    ])) {
      if (!monitorData.qualityDegradation) {
        monitorData.qualityDegradation = true;
        logger.warn('Upstream quality degradation detected', {
          sessionId,
          url: this.sanitizeUrl(monitorData.streamUrl),
          message: output.trim()
        });

        this.logUpstreamIssue(sessionId, 'quality_degradation', output);
      }
    }
  }

  /**
   * Handle FFmpeg process errors
   */
  handleProcessError(sessionId, error) {
    const monitorData = this.monitoredProcesses.get(sessionId);
    if (!monitorData) return;

    monitorData.lastUpstreamError = {
      timestamp: Date.now(),
      error: error.message
    };

    logger.error('Upstream process error detected', {
      sessionId,
      url: this.sanitizeUrl(monitorData.streamUrl),
      error: error.message,
      processId: monitorData.processId
    });

    this.logUpstreamIssue(sessionId, 'process_error', error.message, {
      processId: monitorData.processId
    });
  }

  /**
   * Handle FFmpeg process exit
   */
  handleProcessExit(sessionId, code, signal) {
    const monitorData = this.monitoredProcesses.get(sessionId);
    if (!monitorData) return;

    const duration = Date.now() - monitorData.startTime;
    const exitType = signal ? 'signal' : 'code';
    const exitValue = signal || code;

    // Analyze exit reason
    let exitReason = 'normal';
    if (code !== 0 && code !== null) {
      exitReason = 'error';
    } else if (signal) {
      exitReason = 'killed';
    }

    logger.info('Upstream monitoring ended for session', {
      sessionId,
      url: this.sanitizeUrl(monitorData.streamUrl),
      duration: Math.round(duration / 1000),
      exitType,
      exitValue,
      exitReason,
      connectionAttempts: monitorData.connectionAttempts,
      reconnectionAttempts: monitorData.reconnectionAttempts,
      networkIssues: monitorData.networkIssues.length,
      qualityDegradation: monitorData.qualityDegradation
    });

    if (exitReason === 'error') {
      this.logUpstreamIssue(sessionId, 'process_exit_error', `Process exited with code ${code}`, {
        exitCode: code,
        duration: Math.round(duration / 1000)
      });
    }

    // Generate summary if there were issues
    if (monitorData.reconnectionAttempts > 0 || monitorData.networkIssues.length > 0) {
      this.generateUpstreamSummary(sessionId, monitorData, duration);
    }

    // Cleanup
    this.monitoredProcesses.delete(sessionId);
  }

  /**
   * Log structured upstream issue
   */
  logUpstreamIssue(sessionId, issueType, message, metadata = {}) {
    if (!this.enabled) return;

    const monitorData = this.monitoredProcesses.get(sessionId);
    const issue = {
      sessionId,
      issueType,
      timestamp: Date.now(),
      message: message.trim(),
      url: monitorData ? this.sanitizeUrl(monitorData.streamUrl) : 'unknown',
      ...metadata
    };

    // Store in monitor data
    if (monitorData) {
      monitorData.upstreamErrors.push(issue);
    }

    // Log with structured format for easy monitoring
    logger.warn('UPSTREAM_ISSUE', issue);

    // Update global stats
    this.updateUpstreamStats(issueType, monitorData?.streamUrl);
  }

  /**
   * Generate upstream issue summary
   */
  generateUpstreamSummary(sessionId, monitorData, duration) {
    const summary = {
      sessionId,
      url: this.sanitizeUrl(monitorData.streamUrl),
      duration: Math.round(duration / 1000),
      totalConnectionAttempts: monitorData.connectionAttempts,
      totalReconnectionAttempts: monitorData.reconnectionAttempts,
      networkTimeouts: monitorData.networkIssues.filter(i => i.type === 'timeout').length,
      connectionRefusals: monitorData.networkIssues.filter(i => i.type === 'connection_refused').length,
      totalUpstreamErrors: monitorData.upstreamErrors.length,
      qualityDegradation: monitorData.qualityDegradation,
      reliability: this.calculateReliability(monitorData, duration)
    };

    logger.info('UPSTREAM_SUMMARY', summary);
  }

  /**
   * Calculate stream reliability score
   */
  calculateReliability(monitorData, duration) {
    let score = 100;

    // Penalize for issues
    score -= (monitorData.reconnectionAttempts * 10);
    score -= (monitorData.networkIssues.length * 5);
    score -= (monitorData.upstreamErrors.length * 3);
    if (monitorData.qualityDegradation) score -= 15;

    // Consider duration
    const durationMinutes = duration / (1000 * 60);
    if (durationMinutes < 1) {
      score -= 20; // Penalty for very short streams
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * Update global upstream statistics
   */
  updateUpstreamStats(issueType, streamUrl) {
    const domain = this.extractDomain(streamUrl);
    if (!domain) return;

    if (!this.upstreamStats.has(domain)) {
      this.upstreamStats.set(domain, {
        domain,
        issues: {},
        totalSessions: 0,
        lastIssue: null
      });
    }

    const stats = this.upstreamStats.get(domain);
    stats.issues[issueType] = (stats.issues[issueType] || 0) + 1;
    stats.lastIssue = Date.now();
  }

  /**
   * Get upstream statistics
   */
  getUpstreamStats() {
    return Array.from(this.upstreamStats.values());
  }

  /**
   * Check if output matches any pattern
   */
  matchesPattern(output, patterns) {
    const lowerOutput = output.toLowerCase();
    return patterns.some(pattern =>
      lowerOutput.includes(pattern.toLowerCase())
    );
  }

  /**
   * Sanitize URL for logging (remove sensitive data)
   */
  sanitizeUrl(url) {
    if (!url) return 'unknown';

    try {
      const urlObj = new URL(url);
      if (urlObj.password) {
        urlObj.password = '***';
      }
      if (urlObj.username) {
        urlObj.username = '***';
      }
      return urlObj.toString();
    } catch {
      // If URL parsing fails, just mask common auth patterns
      return url.replace(/(:\/\/)[^:]+:[^@]+@/, '$1***:***@');
    }
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  /**
   * Stop monitoring a session
   */
  stopMonitoring(sessionId) {
    if (this.monitoredProcesses.has(sessionId)) {
      logger.debug('Stopping upstream monitoring for session', { sessionId });
      this.monitoredProcesses.delete(sessionId);
    }
  }

  /**
   * Get current monitoring status
   */
  getMonitoringStatus() {
    return {
      enabled: this.enabled,
      activeSessions: this.monitoredProcesses.size,
      totalUpstreamDomains: this.upstreamStats.size,
      sessions: Array.from(this.monitoredProcesses.entries()).map(([sessionId, data]) => ({
        sessionId,
        url: this.sanitizeUrl(data.streamUrl),
        duration: Date.now() - data.startTime,
        connectionAttempts: data.connectionAttempts,
        reconnectionAttempts: data.reconnectionAttempts,
        issues: data.upstreamErrors.length
      }))
    };
  }
}

// Singleton instance
const upstreamMonitor = new UpstreamMonitor();

module.exports = upstreamMonitor;