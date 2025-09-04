/**
 * Intelligent Client Crash Detection Service
 * 
 * Distinguishes between temporary network issues and actual client failures
 * Provides coordinated session cleanup across multiple session managers
 */

const logger = require('../utils/logger');
const { EventEmitter } = require('events');

class ClientCrashDetector extends EventEmitter {
  constructor() {
    super();
    this.clientSessions = new Map(); // clientId -> session metadata
    this.activityPatterns = new Map(); // sessionId -> activity pattern
    this.crashIndicators = new Map(); // sessionId -> crash signals
    this.timelineRequests = new Map(); // sessionId -> timeline activity
    
    // Detection thresholds
    this.NETWORK_HICCUP_THRESHOLD = 15000; // 15 seconds
    this.CLIENT_TIMEOUT_THRESHOLD = 45000;  // 45 seconds  
    this.CRASH_CONFIRMATION_THRESHOLD = 90000; // 90 seconds
    
    // Start monitoring
    this.startCrashMonitoring();
  }

  /**
   * Register a new client session with crash detection
   */
  registerClientSession(sessionId, clientInfo) {
    const clientId = clientInfo.clientIdentifier || 
                    clientInfo.userAgent?.split(' ')[0] || 
                    clientInfo.clientIP;
    
    const sessionData = {
      sessionId,
      clientId,
      clientIP: clientInfo.clientIP,
      userAgent: clientInfo.userAgent,
      startTime: Date.now(),
      lastActivity: Date.now(),
      lastTimelineCall: Date.now(),
      activityPattern: [],
      
      // Crash detection flags
      networkIssueDetected: false,
      possibleCrash: false,
      confirmedCrash: false,
      
      // Android TV specific tracking
      isAndroidTV: this.isAndroidTVClient(clientInfo.userAgent),
      androidTVVersion: this.extractAndroidTVVersion(clientInfo.userAgent),
      
      // Activity counters
      timelineCallCount: 0,
      consumerRequestCount: 0,
      lastErrorTime: null,
      errorPattern: []
    };

    this.clientSessions.set(sessionId, sessionData);
    this.activityPatterns.set(sessionId, []);
    this.timelineRequests.set(sessionId, []);
    
    logger.info('Client session registered for crash detection', {
      sessionId,
      clientId,
      isAndroidTV: sessionData.isAndroidTV,
      androidTVVersion: sessionData.androidTVVersion
    });
    
    return sessionData;
  }

  /**
   * Record client activity with pattern analysis
   */
  recordActivity(sessionId, activityType, details = {}) {
    const session = this.clientSessions.get(sessionId);
    if (!session) return false;
    
    const now = Date.now();
    session.lastActivity = now;
    
    // Record activity pattern
    const activity = {
      timestamp: now,
      type: activityType,
      details,
      timeSinceLastActivity: now - (session.activityPattern[session.activityPattern.length - 1]?.timestamp || session.startTime)
    };
    
    session.activityPattern.push(activity);
    
    // Keep only recent activity (last 5 minutes)
    const fiveMinutesAgo = now - 300000;
    session.activityPattern = session.activityPattern.filter(a => a.timestamp > fiveMinutesAgo);
    
    // Update specific activity counters
    switch (activityType) {
      case 'timeline':
        session.lastTimelineCall = now;
        session.timelineCallCount++;
        this.recordTimelineActivity(sessionId, details);
        break;
      case 'consumer':
        session.consumerRequestCount++;
        break;
      case 'stream':
        // Reset crash indicators on active streaming
        session.networkIssueDetected = false;
        session.possibleCrash = false;
        break;
      case 'error':
        this.recordError(sessionId, details);
        break;
    }
    
    // Clear crash flags on activity
    if (activityType !== 'error') {
      session.networkIssueDetected = false;
      session.possibleCrash = false;
      session.confirmedCrash = false;
    }
    
    logger.debug('Activity recorded for crash detection', {
      sessionId,
      activityType,
      timeSinceLastActivity: activity.timeSinceLastActivity,
      patternLength: session.activityPattern.length
    });
    
    return true;
  }

  /**
   * Record timeline activity for Android TV crash detection
   */
  recordTimelineActivity(sessionId, details) {
    let timelineHistory = this.timelineRequests.get(sessionId) || [];
    
    timelineHistory.push({
      timestamp: Date.now(),
      ...details
    });
    
    // Keep only last 10 timeline requests
    timelineHistory = timelineHistory.slice(-10);
    this.timelineRequests.set(sessionId, timelineHistory);
    
    // Analyze timeline pattern for crash indicators
    this.analyzeTimelinePattern(sessionId, timelineHistory);
  }

  /**
   * Analyze timeline request patterns for crash indicators
   */
  analyzeTimelinePattern(sessionId, timelineHistory) {
    if (timelineHistory.length < 3) return;
    
    const session = this.clientSessions.get(sessionId);
    if (!session) return;
    
    // Check for rapid timeline requests (crash indicator)
    const last3Requests = timelineHistory.slice(-3);
    const intervals = [];
    for (let i = 1; i < last3Requests.length; i++) {
      intervals.push(last3Requests[i].timestamp - last3Requests[i-1].timestamp);
    }
    
    // If all intervals are < 2 seconds, might indicate crash/retry behavior
    const rapidRequests = intervals.every(interval => interval < 2000);
    
    if (rapidRequests && session.isAndroidTV) {
      session.possibleCrash = true;
      logger.warn('Rapid timeline requests detected - possible Android TV crash', {
        sessionId,
        intervals,
        timelineCount: timelineHistory.length
      });
    }
  }

  /**
   * Record error for crash pattern analysis
   */
  recordError(sessionId, errorDetails) {
    const session = this.clientSessions.get(sessionId);
    if (!session) return;
    
    const now = Date.now();
    session.lastErrorTime = now;
    session.errorPattern.push({
      timestamp: now,
      error: errorDetails.error || 'Unknown error',
      type: errorDetails.type || 'generic',
      httpCode: errorDetails.httpCode
    });
    
    // Keep only recent errors (last 10 minutes)
    const tenMinutesAgo = now - 600000;
    session.errorPattern = session.errorPattern.filter(e => e.timestamp > tenMinutesAgo);
    
    // Analyze error patterns for crash indicators
    this.analyzeErrorPattern(sessionId, session);
  }

  /**
   * Analyze error patterns for crash detection
   */
  analyzeErrorPattern(sessionId, session) {
    const recentErrors = session.errorPattern.filter(e => 
      Date.now() - e.timestamp < 60000 // Last minute
    );
    
    // Multiple errors in short time = possible crash
    if (recentErrors.length >= 3) {
      session.possibleCrash = true;
      
      // Check for specific Android TV crash patterns
      const has404Errors = recentErrors.some(e => e.httpCode === 404);
      const hasTranscodeErrors = recentErrors.some(e => 
        e.error.toLowerCase().includes('transcode') || 
        e.error.toLowerCase().includes('decision')
      );
      const hasNullPointerErrors = recentErrors.some(e => 
        e.error.toLowerCase().includes('nullpointer') ||
        e.error.toLowerCase().includes('null object reference')
      );
      
      if (session.isAndroidTV && (has404Errors || hasTranscodeErrors || hasNullPointerErrors)) {
        logger.error('Android TV crash pattern detected', {
          sessionId,
          errorCount: recentErrors.length,
          has404Errors,
          hasTranscodeErrors,
          hasNullPointerErrors,
          errors: recentErrors.map(e => ({ type: e.type, error: e.error, httpCode: e.httpCode }))
        });
        
        // Mark as confirmed crash for Android TV
        session.confirmedCrash = true;
        this.emit('clientCrash', {
          sessionId,
          clientId: session.clientId,
          reason: 'android_tv_error_pattern',
          errors: recentErrors
        });
      }
    }
  }

  /**
   * Check session health and detect crashes
   */
  checkSessionHealth(sessionId) {
    const session = this.clientSessions.get(sessionId);
    if (!session) return { healthy: false, reason: 'session_not_found' };
    
    const now = Date.now();
    const timeSinceActivity = now - session.lastActivity;
    const timeSinceTimeline = now - session.lastTimelineCall;
    
    // Confirmed crash
    if (session.confirmedCrash) {
      return { 
        healthy: false, 
        reason: 'confirmed_crash',
        action: 'terminate_immediately'
      };
    }
    
    // For Android TV, use different thresholds
    if (session.isAndroidTV) {
      // If no timeline calls for 60 seconds = likely crash
      if (timeSinceTimeline > 60000) {
        logger.warn('Android TV client silent - possible crash', {
          sessionId,
          timeSinceTimeline,
          timeSinceActivity,
          timelineCallCount: session.timelineCallCount
        });
        
        session.possibleCrash = true;
        return { 
          healthy: false, 
          reason: 'android_tv_silent',
          action: 'mark_for_cleanup'
        };
      }
      
      // If errors detected and no activity for 30 seconds
      if (session.possibleCrash && timeSinceActivity > 30000) {
        return { 
          healthy: false, 
          reason: 'android_tv_possible_crash',
          action: 'mark_for_cleanup'
        };
      }
    }
    
    // Network hiccup detection
    if (timeSinceActivity > this.NETWORK_HICCUP_THRESHOLD && timeSinceActivity < this.CLIENT_TIMEOUT_THRESHOLD) {
      if (!session.networkIssueDetected) {
        session.networkIssueDetected = true;
        logger.info('Network hiccup detected', { sessionId, timeSinceActivity });
      }
      return { 
        healthy: true, 
        reason: 'network_hiccup',
        action: 'monitor'
      };
    }
    
    // Client timeout
    if (timeSinceActivity > this.CLIENT_TIMEOUT_THRESHOLD) {
      session.possibleCrash = true;
      return { 
        healthy: false, 
        reason: 'client_timeout',
        action: 'mark_for_cleanup'
      };
    }
    
    // Confirmed crash after extended silence
    if (timeSinceActivity > this.CRASH_CONFIRMATION_THRESHOLD) {
      session.confirmedCrash = true;
      return { 
        healthy: false, 
        reason: 'confirmed_timeout_crash',
        action: 'terminate_immediately'
      };
    }
    
    return { healthy: true, reason: 'active' };
  }

  /**
   * Force session termination due to crash
   */
  forceTerminateSession(sessionId, reason = 'crash_detected') {
    const session = this.clientSessions.get(sessionId);
    if (!session) return false;
    
    logger.error('Force terminating crashed client session', {
      sessionId,
      clientId: session.clientId,
      reason,
      uptime: Date.now() - session.startTime,
      lastActivity: Date.now() - session.lastActivity
    });
    
    // Mark as crashed
    session.confirmedCrash = true;
    
    // Emit crash event for cleanup
    this.emit('sessionTerminated', {
      sessionId,
      clientId: session.clientId,
      reason,
      forced: true
    });
    
    // Remove from tracking
    this.clientSessions.delete(sessionId);
    this.activityPatterns.delete(sessionId);
    this.timelineRequests.delete(sessionId);
    
    return true;
  }

  /**
   * Start crash monitoring service
   */
  startCrashMonitoring() {
    setInterval(() => {
      for (const [sessionId, session] of this.clientSessions.entries()) {
        const health = this.checkSessionHealth(sessionId);
        
        if (!health.healthy) {
          switch (health.action) {
            case 'terminate_immediately':
              this.forceTerminateSession(sessionId, health.reason);
              break;
              
            case 'mark_for_cleanup':
              this.emit('sessionCleanupRequired', {
                sessionId,
                clientId: session.clientId,
                reason: health.reason,
                priority: session.isAndroidTV ? 'high' : 'normal'
              });
              break;
              
            case 'monitor':
              // Continue monitoring
              break;
          }
        }
      }
    }, 10000); // Check every 10 seconds
    
    logger.info('Client crash monitoring service started');
  }

  /**
   * Get crash statistics
   */
  getCrashStatistics() {
    const stats = {
      totalSessions: this.clientSessions.size,
      androidTVSessions: 0,
      possibleCrashes: 0,
      confirmedCrashes: 0,
      networkIssues: 0
    };
    
    for (const session of this.clientSessions.values()) {
      if (session.isAndroidTV) stats.androidTVSessions++;
      if (session.possibleCrash) stats.possibleCrashes++;
      if (session.confirmedCrash) stats.confirmedCrashes++;
      if (session.networkIssueDetected) stats.networkIssues++;
    }
    
    return stats;
  }

  /**
   * Helper: Detect Android TV clients
   */
  isAndroidTVClient(userAgent) {
    if (!userAgent) return false;
    
    const androidTVIndicators = [
      'androidtv', 'android tv', 'nexusplayer', 'mibox', 'shield',
      'firetv', 'chromecast', 'mi box', 'nvidia shield'
    ];
    
    const lowerUA = userAgent.toLowerCase();
    return androidTVIndicators.some(indicator => lowerUA.includes(indicator));
  }

  /**
   * Helper: Extract Android TV version
   */
  extractAndroidTVVersion(userAgent) {
    if (!userAgent) return null;
    
    const versionMatch = userAgent.match(/android[tv\s]*[\s\/](\d+(?:\.\d+)*)/i);
    return versionMatch ? versionMatch[1] : null;
  }

  /**
   * Cleanup on shutdown
   */
  cleanup() {
    this.clientSessions.clear();
    this.activityPatterns.clear();
    this.crashIndicators.clear();
    this.timelineRequests.clear();
    this.removeAllListeners();
  }
}

// Create singleton instance
const clientCrashDetector = new ClientCrashDetector();

module.exports = clientCrashDetector;