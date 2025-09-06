const logger = require('../utils/logger');
const database = require('./database');
const { EventEmitter } = require('events');

/**
 * Enhanced Session Lifecycle Manager for Android TV Long-Running Streams
 * 
 * Addresses the critical Android TV streaming issues:
 * 1. Sessions failing after 30+ minutes with 404 errors
 * 2. Consumer session tracking failures
 * 3. FFmpeg process lifecycle management
 * 4. Proactive session health monitoring and renewal
 */
class AndroidTVSessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // Enhanced session tracking
    this.ffmpegProcesses = new Map(); // FFmpeg process monitoring
    this.sessionHealthTimers = new Map(); // Health check timers
    this.urlRenewalTimers = new Map(); // URL renewal timers
    this.consumerMappings = new Map(); // Plex consumer session mappings
    
    // Android TV specific configuration
    this.config = {
      // Extended timeouts for Android TV
      sessionTimeout: 7200000, // 2 hours (vs 1 hour default)
      healthCheckInterval: 30000, // 30 seconds
      urlRenewalInterval: 1500000, // 25 minutes (before 30min expiry)
      ffmpegRestartThreshold: 3600000, // 1 hour - restart FFmpeg proactively
      maxRetryAttempts: 5,
      retryBackoffMs: 2000,
      
      // Android TV specific behavior
      extendedBuffering: true,
      aggressiveReconnection: true,
      preemptiveRenewal: true
    };
    
    this.startHealthMonitoring();
  }

  /**
   * Create or enhance existing session for Android TV streaming
   */
  async createAndroidTVSession(sessionData) {
    const {
      sessionId,
      channelId,
      streamUrl,
      clientInfo,
      plexSessionId,
      consumerSessionId,
      ffmpegProcess
    } = sessionData;

    try {
      // Check if session already exists and is healthy
      const existingSession = this.sessions.get(sessionId);
      if (existingSession && existingSession.status === 'active' && existingSession.healthy) {
        logger.info('Android TV session already active and healthy', { 
          sessionId, 
          uptime: Date.now() - existingSession.startTime 
        });
        return existingSession;
      }

      const session = {
        sessionId,
        channelId,
        streamUrl,
        originalStreamUrl: streamUrl, // Keep original for renewal
        clientInfo,
        plexSessionId,
        consumerSessionId,
        
        // Timing and lifecycle
        startTime: Date.now(),
        lastActivity: Date.now(),
        lastUrlRenewal: Date.now(),
        lastHealthCheck: Date.now(),
        lastFFmpegRestart: Date.now(),
        
        // Status and health
        status: 'initializing',
        healthy: true,
        errorCount: 0,
        consecutiveFailures: 0,
        urlRenewalCount: 0,
        ffmpegRestartCount: 0,
        
        // Process management
        ffmpegProcess: null,
        ffmpegPid: null,
        
        // Android TV specific flags
        isAndroidTV: this.isAndroidTVClient(clientInfo),
        extendedSession: true,
        proactiveManagement: true,
        
        // Metrics
        totalUptime: 0,
        dataTransferred: 0,
        avgBitrate: 0,
        peakBitrate: 0
      };

      // Store the session
      this.sessions.set(sessionId, session);
      
      // Create consumer session mapping for Plex
      if (consumerSessionId && consumerSessionId !== sessionId) {
        this.consumerMappings.set(consumerSessionId, sessionId);
        logger.info('Created consumer session mapping', { 
          consumerSessionId, 
          primarySessionId: sessionId 
        });
      }
      
      // Associate FFmpeg process if provided
      if (ffmpegProcess) {
        await this.associateFFmpegProcess(sessionId, ffmpegProcess);
      }
      
      // Start session-specific health monitoring
      this.startSessionHealthMonitoring(sessionId);
      
      // Start proactive URL renewal timer
      this.startUrlRenewalTimer(sessionId);
      
      session.status = 'active';
      
      logger.info('Android TV session created with enhanced lifecycle management', {
        sessionId,
        channelId,
        isAndroidTV: session.isAndroidTV,
        hasConsumerMapping: !!consumerSessionId,
        healthCheckInterval: this.config.healthCheckInterval,
        urlRenewalInterval: this.config.urlRenewalInterval
      });
      
      // Persist to database
      await this.persistSession(session);
      
      // Emit session started event
      this.emit('sessionStarted', session);
      
      return session;
      
    } catch (error) {
      logger.error('Failed to create Android TV session', {
        sessionId,
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Associate FFmpeg process with session for health monitoring
   */
  async associateFFmpegProcess(sessionId, ffmpegProcess) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.ffmpegProcess = ffmpegProcess;
    session.ffmpegPid = ffmpegProcess.pid;
    session.lastFFmpegRestart = Date.now();
    
    // Store in FFmpeg process map
    this.ffmpegProcesses.set(sessionId, {
      process: ffmpegProcess,
      startTime: Date.now(),
      restartCount: session.ffmpegRestartCount || 0,
      lastHealth: Date.now()
    });

    // Monitor FFmpeg process health
    ffmpegProcess.on('error', (error) => {
      logger.error('FFmpeg process error for Android TV session', {
        sessionId,
        pid: ffmpegProcess.pid,
        error: error.message
      });
      this.handleFFmpegError(sessionId, error);
    });

    ffmpegProcess.on('close', (code, signal) => {
      logger.warn('FFmpeg process closed for Android TV session', {
        sessionId,
        pid: ffmpegProcess.pid,
        code,
        signal
      });
      this.handleFFmpegClose(sessionId, code, signal);
    });

    logger.info('FFmpeg process associated with Android TV session', {
      sessionId,
      pid: ffmpegProcess.pid
    });
  }

  /**
   * Handle FFmpeg process errors with intelligent recovery
   */
  async handleFFmpegError(sessionId, error) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.errorCount++;
    session.consecutiveFailures++;
    session.healthy = false;
    session.lastActivity = Date.now();

    logger.error('FFmpeg error in Android TV session', {
      sessionId,
      errorCount: session.errorCount,
      consecutiveFailures: session.consecutiveFailures,
      error: error.message
    });

    // Determine recovery strategy
    if (session.consecutiveFailures >= 3) {
      // Multiple failures - restart FFmpeg with fresh URL
      await this.restartFFmpegWithUrlRenewal(sessionId);
    } else {
      // Single failure - try simple restart
      await this.restartFFmpeg(sessionId);
    }
  }

  /**
   * Handle FFmpeg process close with recovery
   */
  async handleFFmpegClose(sessionId, code, signal) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clean up process reference
    session.ffmpegProcess = null;
    session.ffmpegPid = null;
    this.ffmpegProcesses.delete(sessionId);

    // If session is still active, restart FFmpeg
    if (session.status === 'active' && session.healthy) {
      logger.info('Restarting FFmpeg for active Android TV session', {
        sessionId,
        exitCode: code,
        signal
      });
      
      // Use exponential backoff for restarts
      const backoffMs = this.config.retryBackoffMs * Math.pow(2, session.ffmpegRestartCount);
      setTimeout(async () => {
        await this.restartFFmpeg(sessionId);
      }, Math.min(backoffMs, 30000)); // Max 30 second delay
    }
  }

  /**
   * Restart FFmpeg process for a session
   */
  async restartFFmpeg(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      logger.info('Restarting FFmpeg for Android TV session', { sessionId });
      
      session.ffmpegRestartCount++;
      session.lastFFmpegRestart = Date.now();
      
      // Get fresh stream URL if needed
      let streamUrl = session.streamUrl;
      
      // If we've had multiple failures, renew the URL
      if (session.consecutiveFailures >= 2) {
        streamUrl = await this.renewStreamUrl(sessionId);
      }
      
      // Emit restart event for external handling
      this.emit('ffmpegRestartRequired', {
        sessionId,
        channelId: session.channelId,
        streamUrl,
        restartCount: session.ffmpegRestartCount
      });
      
      return true;
      
    } catch (error) {
      logger.error('Failed to restart FFmpeg for Android TV session', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Restart FFmpeg with URL renewal for persistent failures
   */
  async restartFFmpegWithUrlRenewal(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      logger.info('Restarting FFmpeg with URL renewal for Android TV session', { 
        sessionId,
        consecutiveFailures: session.consecutiveFailures
      });
      
      // Force URL renewal
      const newStreamUrl = await this.renewStreamUrl(sessionId);
      
      if (newStreamUrl) {
        session.streamUrl = newStreamUrl;
        session.consecutiveFailures = 0; // Reset failure count
        session.urlRenewalCount++;
        session.lastUrlRenewal = Date.now();
        
        // Emit restart with renewal event
        this.emit('ffmpegRestartWithRenewal', {
          sessionId,
          channelId: session.channelId,
          newStreamUrl,
          renewalCount: session.urlRenewalCount
        });
        
        return true;
      } else {
        logger.error('Failed to renew stream URL for Android TV session', { sessionId });
        return false;
      }
      
    } catch (error) {
      logger.error('Failed to restart FFmpeg with URL renewal', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Renew stream URL from database or source
   */
  async renewStreamUrl(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    try {
      // Get fresh stream information from database
      const stream = await database.get(
        'SELECT s.*, c.* FROM streams s JOIN channels c ON s.channel_id = c.id WHERE c.id = ?',
        [session.channelId]
      );
      
      if (stream && stream.url) {
        logger.info('Renewed stream URL for Android TV session', {
          sessionId,
          channelId: session.channelId,
          oldUrl: session.streamUrl.substring(0, 100),
          newUrl: stream.url.substring(0, 100)
        });
        return stream.url;
      } else {
        logger.warn('No stream URL found during renewal', { 
          sessionId, 
          channelId: session.channelId 
        });
        return null;
      }
      
    } catch (error) {
      logger.error('Failed to renew stream URL', {
        sessionId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Start health monitoring for a specific session
   */
  startSessionHealthMonitoring(sessionId) {
    // Clear existing timer
    if (this.sessionHealthTimers.has(sessionId)) {
      clearInterval(this.sessionHealthTimers.get(sessionId));
    }

    const healthTimer = setInterval(async () => {
      await this.performSessionHealthCheck(sessionId);
    }, this.config.healthCheckInterval);

    this.sessionHealthTimers.set(sessionId, healthTimer);
  }

  /**
   * Start URL renewal timer for proactive URL refreshing
   */
  startUrlRenewalTimer(sessionId) {
    // Clear existing timer
    if (this.urlRenewalTimers.has(sessionId)) {
      clearInterval(this.urlRenewalTimers.get(sessionId));
    }

    const renewalTimer = setInterval(async () => {
      await this.performProactiveUrlRenewal(sessionId);
    }, this.config.urlRenewalInterval);

    this.urlRenewalTimers.set(sessionId, renewalTimer);
  }

  /**
   * Perform health check on a session
   */
  async performSessionHealthCheck(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return;

    const now = Date.now();
    session.lastHealthCheck = now;
    
    // Check session age
    const sessionAge = now - session.startTime;
    const timeSinceActivity = now - session.lastActivity;
    
    // Check if FFmpeg process is still running
    const ffmpegInfo = this.ffmpegProcesses.get(sessionId);
    let ffmpegHealthy = false;
    
    if (ffmpegInfo && ffmpegInfo.process && !ffmpegInfo.process.killed) {
      ffmpegHealthy = true;
      ffmpegInfo.lastHealth = now;
    }

    // Health evaluation
    const isHealthy = ffmpegHealthy && timeSinceActivity < 120000; // 2 minutes
    
    if (!isHealthy && session.healthy) {
      logger.warn('Android TV session health degraded', {
        sessionId,
        sessionAge: Math.round(sessionAge / 1000),
        timeSinceActivity: Math.round(timeSinceActivity / 1000),
        ffmpegHealthy,
        errorCount: session.errorCount
      });
      
      session.healthy = false;
      this.emit('sessionHealthDegraded', { sessionId, session });
    }
    
    // Proactive FFmpeg restart for long-running sessions
    if (sessionAge > this.config.ffmpegRestartThreshold && 
        now - session.lastFFmpegRestart > this.config.ffmpegRestartThreshold) {
      
      logger.info('Proactive FFmpeg restart for long-running Android TV session', {
        sessionId,
        sessionAge: Math.round(sessionAge / 1000),
        timeSinceLastRestart: Math.round((now - session.lastFFmpegRestart) / 1000)
      });
      
      await this.restartFFmpeg(sessionId);
    }
  }

  /**
   * Perform proactive URL renewal before expiration
   */
  async performProactiveUrlRenewal(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return;

    const now = Date.now();
    const timeSinceRenewal = now - session.lastUrlRenewal;
    
    // Only renew if it's been long enough since last renewal
    if (timeSinceRenewal >= this.config.urlRenewalInterval * 0.9) { // 90% of interval
      logger.info('Performing proactive URL renewal for Android TV session', {
        sessionId,
        timeSinceRenewal: Math.round(timeSinceRenewal / 1000)
      });
      
      const newUrl = await this.renewStreamUrl(sessionId);
      if (newUrl && newUrl !== session.streamUrl) {
        session.streamUrl = newUrl;
        session.lastUrlRenewal = now;
        session.urlRenewalCount++;
        
        // Restart FFmpeg with new URL
        await this.restartFFmpeg(sessionId);
        
        this.emit('urlRenewed', { sessionId, newUrl });
      }
    }
  }

  /**
   * Update session activity timestamp
   */
  updateSessionActivity(sessionId, activityType = 'general') {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      
      // Reset consecutive failures on activity
      if (activityType === 'segment_request' || activityType === 'data_transfer') {
        session.consecutiveFailures = Math.max(0, session.consecutiveFailures - 1);
      }
      
      return true;
    }
    
    // Also check consumer mappings
    for (const [consumerSessionId, primarySessionId] of this.consumerMappings.entries()) {
      if (consumerSessionId === sessionId) {
        return this.updateSessionActivity(primarySessionId, activityType);
      }
    }
    
    return false;
  }

  /**
   * Get session status with health information
   */
  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Check consumer mappings
      const primarySessionId = this.consumerMappings.get(sessionId);
      if (primarySessionId) {
        return this.getSessionStatus(primarySessionId);
      }
      return { exists: false, healthy: false, status: 'not_found' };
    }

    const now = Date.now();
    return {
      exists: true,
      sessionId: session.sessionId,
      status: session.status,
      healthy: session.healthy,
      uptime: now - session.startTime,
      timeSinceActivity: now - session.lastActivity,
      errorCount: session.errorCount,
      consecutiveFailures: session.consecutiveFailures,
      urlRenewalCount: session.urlRenewalCount,
      ffmpegRestartCount: session.ffmpegRestartCount,
      isAndroidTV: session.isAndroidTV,
      hasFFmpeg: !!session.ffmpegProcess
    };
  }

  /**
   * End session and cleanup resources
   */
  async endSession(sessionId, reason = 'normal') {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    logger.info('Ending Android TV session', {
      sessionId,
      reason,
      uptime: Date.now() - session.startTime,
      errorCount: session.errorCount
    });

    // Update session status
    session.status = 'ended';
    session.endTime = Date.now();
    session.endReason = reason;
    session.totalUptime = session.endTime - session.startTime;

    // Cleanup timers
    if (this.sessionHealthTimers.has(sessionId)) {
      clearInterval(this.sessionHealthTimers.get(sessionId));
      this.sessionHealthTimers.delete(sessionId);
    }
    
    if (this.urlRenewalTimers.has(sessionId)) {
      clearInterval(this.urlRenewalTimers.get(sessionId));
      this.urlRenewalTimers.delete(sessionId);
    }

    // Cleanup FFmpeg process
    const ffmpegInfo = this.ffmpegProcesses.get(sessionId);
    if (ffmpegInfo && ffmpegInfo.process && !ffmpegInfo.process.killed) {
      try {
        ffmpegInfo.process.kill('SIGTERM');
        logger.info('Terminated FFmpeg process for ended Android TV session', {
          sessionId,
          pid: ffmpegInfo.process.pid
        });
      } catch (error) {
        logger.warn('Failed to terminate FFmpeg process', {
          sessionId,
          error: error.message
        });
      }
    }
    this.ffmpegProcesses.delete(sessionId);

    // Cleanup consumer mappings
    for (const [consumerSessionId, primarySessionId] of this.consumerMappings.entries()) {
      if (primarySessionId === sessionId) {
        this.consumerMappings.delete(consumerSessionId);
      }
    }

    // Update database
    try {
      await this.updateSessionInDatabase(sessionId, {
        status: 'ended',
        ended_at: new Date().toISOString(),
        end_reason: reason,
        total_uptime: session.totalUptime,
        error_count: session.errorCount,
        url_renewal_count: session.urlRenewalCount,
        ffmpeg_restart_count: session.ffmpegRestartCount
      });
    } catch (error) {
      logger.error('Failed to update ended session in database', {
        sessionId,
        error: error.message
      });
    }

    // Remove from memory
    this.sessions.delete(sessionId);

    // Emit session ended event
    this.emit('sessionEnded', { sessionId, session, reason });

    return true;
  }

  /**
   * Start global health monitoring
   */
  startHealthMonitoring() {
    // Monitor overall system health every minute
    setInterval(() => {
      this.performSystemHealthCheck();
    }, 60000);
    
    logger.info('Android TV session health monitoring started', {
      healthCheckInterval: this.config.healthCheckInterval,
      urlRenewalInterval: this.config.urlRenewalInterval,
      sessionTimeout: this.config.sessionTimeout
    });
  }

  /**
   * Perform system-wide health check
   */
  performSystemHealthCheck() {
    const now = Date.now();
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'active');
    const healthySessions = activeSessions.filter(s => s.healthy);
    
    logger.debug('Android TV system health check', {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      healthySessions: healthySessions.length,
      ffmpegProcesses: this.ffmpegProcesses.size,
      consumerMappings: this.consumerMappings.size
    });

    // Clean up very old sessions
    for (const session of this.sessions.values()) {
      const sessionAge = now - session.startTime;
      if (sessionAge > this.config.sessionTimeout) {
        logger.info('Cleaning up expired Android TV session', {
          sessionId: session.sessionId,
          age: Math.round(sessionAge / 1000)
        });
        this.endSession(session.sessionId, 'timeout');
      }
    }
  }

  /**
   * Check if client is Android TV
   */
  isAndroidTVClient(clientInfo) {
    if (!clientInfo) return false;
    
    const userAgent = (clientInfo.userAgent || '').toLowerCase();
    const platform = (clientInfo.platform || '').toLowerCase();
    
    return userAgent.includes('androidtv') || 
           userAgent.includes('android tv') ||
           userAgent.includes('nexusplayer') ||
           userAgent.includes('mibox') ||
           userAgent.includes('shield') ||
           platform.includes('androidtv');
  }

  /**
   * Persist session to database
   */
  async persistSession(session) {
    try {
      await database.run(`
        INSERT OR REPLACE INTO android_tv_sessions (
          session_id, channel_id, stream_url, client_info, plex_session_id,
          consumer_session_id, start_time, status, healthy, error_count,
          consecutive_failures, url_renewal_count, ffmpeg_restart_count,
          is_android_tv, extended_session, proactive_management
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        session.sessionId,
        session.channelId,
        session.streamUrl,
        JSON.stringify(session.clientInfo),
        session.plexSessionId,
        session.consumerSessionId,
        session.startTime,
        session.status,
        session.healthy ? 1 : 0,
        session.errorCount,
        session.consecutiveFailures,
        session.urlRenewalCount,
        session.ffmpegRestartCount,
        session.isAndroidTV ? 1 : 0,
        session.extendedSession ? 1 : 0,
        session.proactiveManagement ? 1 : 0
      ]);
    } catch (error) {
      logger.error('Failed to persist Android TV session', {
        sessionId: session.sessionId,
        error: error.message
      });
    }
  }

  /**
   * Update session in database
   */
  async updateSessionInDatabase(sessionId, updates) {
    try {
      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(sessionId);

      await database.run(`
        UPDATE android_tv_sessions 
        SET ${setClause}
        WHERE session_id = ?
      `, values);
    } catch (error) {
      logger.error('Failed to update Android TV session in database', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  /**
   * Shutdown the manager
   */
  async shutdown() {
    logger.info('Shutting down Android TV Session Manager');
    
    // Clear all timers
    for (const timer of this.sessionHealthTimers.values()) {
      clearInterval(timer);
    }
    for (const timer of this.urlRenewalTimers.values()) {
      clearInterval(timer);
    }
    
    // End all active sessions
    const activeSessions = this.getActiveSessions();
    for (const session of activeSessions) {
      await this.endSession(session.sessionId, 'shutdown');
    }
    
    // Clear all maps
    this.sessions.clear();
    this.ffmpegProcesses.clear();
    this.sessionHealthTimers.clear();
    this.urlRenewalTimers.clear();
    this.consumerMappings.clear();
    
    logger.info('Android TV Session Manager shutdown completed');
  }
}

// Create singleton instance
const androidTVSessionManager = new AndroidTVSessionManager();

module.exports = androidTVSessionManager;