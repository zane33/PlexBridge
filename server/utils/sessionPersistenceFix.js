/**
 * Session Persistence Fix for PlexBridge
 * Addresses "Failed to find consumer" and "buildLiveM3U8: no instance available" errors
 */

const logger = require('./logger');
const { spawn } = require('child_process');

/**
 * Enhanced Session Manager with persistence and recovery
 * Proper consumer session isolation for concurrent access
 */
class PersistentSessionManager {
  constructor() {
    this.activeSessions = new Map(); // Individual sessions (one FFmpeg per session)
    this.consumerMap = new Map();    // Maps Plex consumer IDs to internal session IDs
    this.sessionRecovery = new Map();
    this.healthCheckInterval = null;
    this.startHealthMonitoring();
  }

  /**
   * Creates an individual persistent streaming session (separate FFmpeg per session)
   */
  createSession(channelId, sessionId, streamUrl, clientInfo = {}) {
    logger.info('Creating individual persistent streaming session', {
      channelId,
      sessionId,
      clientInfo: clientInfo.userAgent || 'Unknown',
      consumerSessionId: clientInfo.consumerSessionId
    });

    // Create individual session with its own FFmpeg process
    const session = {
      channelId,
      sessionId,
      consumerSessionId: clientInfo.consumerSessionId || sessionId,
      streamUrl,
      clientInfo,
      startTime: Date.now(),
      lastActivity: Date.now(),
      status: 'initializing',
      process: null,
      reconnectAttempts: 0,
      maxReconnects: 3,
      
      // Session persistence data
      persistent: true,
      keepAlive: true,
      autoRecover: true,
      
      // Streaming properties
      isLive: true,
      hasConsumer: true,
      instanceAvailable: true,
      
      // Consumer properties for Plex tracking
      isConsumerAlias: clientInfo.isConsumerAlias || false,
      primarySessionId: clientInfo.primarySessionId
    };

    // Store the session
    this.activeSessions.set(sessionId, session);
    
    // Map Plex consumer session ID to internal session ID for tracking
    if (clientInfo.consumerSessionId && clientInfo.consumerSessionId !== sessionId) {
      this.consumerMap.set(clientInfo.consumerSessionId, sessionId);
      logger.info('Created consumer session mapping for Plex tracking', {
        consumerSessionId: clientInfo.consumerSessionId,
        internalSessionId: sessionId,
        channelId
      });
    }
    
    logger.info('Individual streaming session created', {
      channelId,
      sessionId,
      consumerSessionId: session.consumerSessionId
    });

    return session;
  }

  /**
   * Starts FFmpeg process with enhanced error handling
   */
  async startStream(session, options = {}) {
    try {
      const {
        outputFormat = 'mpegts',
        videoCodec = 'copy',
        audioCodec = 'copy',
        isEnhancedEncoding = false,
        enhancedArgs = []
      } = options;

      // Use enhanced args if provided, otherwise use standard stability args
      let ffmpegArgs;
      if (isEnhancedEncoding && enhancedArgs.length > 0) {
        // For enhanced encoding, use the provided args but ensure stability
        ffmpegArgs = enhancedArgs;
        logger.info('Using enhanced encoding args for persistent session', {
          sessionId: session.sessionId,
          argsCount: ffmpegArgs.length
        });
      } else {
        // Standard FFmpeg command for stability
        ffmpegArgs = [
          '-hide_banner',
          '-loglevel', 'error',
          '-fflags', '+genpts+igndts',
          '-avoid_negative_ts', 'make_zero',
          '-analyzeduration', '2000000',
          '-probesize', '2000000',
          '-thread_queue_size', '1024',
          '-i', session.streamUrl,
          '-c:v', videoCodec,
          '-c:a', audioCodec,
          '-f', outputFormat,
          '-muxrate', '8000k',
          '-bufsize', '2000k',
          '-flush_packets', '1',
          'pipe:1'
        ];
      }

      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      session.process = ffmpegProcess;
      session.status = 'running';
      session.pid = ffmpegProcess.pid;

      logger.info('FFmpeg process started for persistent session', {
        sessionId: session.sessionId,
        pid: session.pid,
        channelId: session.channelId
      });

      // Enhanced error handling
      ffmpegProcess.on('error', (error) => {
        logger.error('FFmpeg process error in persistent session', {
          sessionId: session.sessionId,
          error: error.message
        });
        this.handleSessionError(session, error);
      });

      ffmpegProcess.on('exit', (code, signal) => {
        logger.warn('FFmpeg process exited in persistent session', {
          sessionId: session.sessionId,
          code,
          signal
        });
        this.handleSessionExit(session, code, signal);
      });

      ffmpegProcess.stderr.on('data', (data) => {
        const errorMessage = data.toString();
        if (errorMessage.includes('Connection refused') || 
            errorMessage.includes('Server returned 4')) {
          logger.warn('Stream connection issue detected', {
            sessionId: session.sessionId,
            error: errorMessage.trim()
          });
          this.scheduleReconnect(session);
        }
      });

      return ffmpegProcess;

    } catch (error) {
      logger.error('Failed to start persistent stream', {
        sessionId: session.sessionId,
        error: error.message
      });
      session.status = 'failed';
      throw error;
    }
  }

  /**
   * Handles session errors with recovery
   */
  handleSessionError(session, error) {
    session.status = 'error';
    session.lastError = error.message;
    session.lastActivity = Date.now();

    if (session.autoRecover && session.reconnectAttempts < session.maxReconnects) {
      logger.info('Scheduling session recovery', {
        sessionId: session.sessionId,
        attempt: session.reconnectAttempts + 1
      });
      this.scheduleReconnect(session);
    } else {
      logger.error('Session recovery failed, marking as dead', {
        sessionId: session.sessionId,
        attempts: session.reconnectAttempts
      });
      session.status = 'dead';
      this.activeSessions.delete(session.sessionId);
    }
  }

  /**
   * Handles session exit with recovery
   */
  handleSessionExit(session, code, signal) {
    session.status = 'exited';
    session.exitCode = code;
    session.exitSignal = signal;
    session.lastActivity = Date.now();

    // Only attempt recovery for unexpected exits
    if (code !== 0 && session.autoRecover && session.reconnectAttempts < session.maxReconnects) {
      logger.info('Process exited unexpectedly, scheduling recovery', {
        sessionId: session.sessionId,
        code,
        signal
      });
      this.scheduleReconnect(session);
    }
  }

  /**
   * Schedules session reconnection
   */
  scheduleReconnect(session) {
    session.reconnectAttempts++;
    const delay = Math.min(2000 * session.reconnectAttempts, 10000); // Exponential backoff

    setTimeout(async () => {
      try {
        logger.info('Attempting session recovery', {
          sessionId: session.sessionId,
          attempt: session.reconnectAttempts
        });

        // Kill existing process if still running
        if (session.process && !session.process.killed) {
          session.process.kill('SIGKILL');
        }

        // Restart the stream
        session.status = 'recovering';
        await this.startStream(session);

        logger.info('Session recovery successful', {
          sessionId: session.sessionId
        });

      } catch (error) {
        logger.error('Session recovery failed', {
          sessionId: session.sessionId,
          error: error.message
        });
        this.handleSessionError(session, error);
      }
    }, delay);
  }

  /**
   * Updates session activity to prevent timeout
   */
  updateSessionActivity(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      session.hasConsumer = true;
      session.instanceAvailable = true;
    }
  }

  /**
   * Gets session status
   */
  getSessionStatus(sessionId) {
    // Check if this is a Plex consumer session ID that needs mapping to internal session ID
    const internalSessionId = this.consumerMap.get(sessionId) || sessionId;
    const session = this.activeSessions.get(internalSessionId);
    
    if (!session) {
      logger.debug('Session not found', { 
        requestedSessionId: sessionId, 
        mappedSessionId: internalSessionId 
      });
      return {
        exists: false,
        hasConsumer: false,
        instanceAvailable: false
      };
    }

    return {
      exists: true,
      hasConsumer: session.hasConsumer,
      instanceAvailable: session.instanceAvailable,
      status: session.status,
      isRunning: session.status === 'running',
      lastActivity: session.lastActivity,
      uptime: Date.now() - session.startTime,
      consumerSessionId: session.consumerSessionId,
      isMapped: sessionId !== internalSessionId
    };
  }

  /**
   * Removes an individual session and its FFmpeg process
   */
  removeSession(sessionId) {
    const internalSessionId = this.consumerMap.get(sessionId) || sessionId;
    const session = this.activeSessions.get(internalSessionId);
    
    if (!session) {
      logger.debug('Session not found for removal', { sessionId });
      return false;
    }

    logger.info('Removing individual session', {
      sessionId: internalSessionId,
      consumerSessionId: session.consumerSessionId,
      channelId: session.channelId
    });

    // Kill FFmpeg process if running
    if (session.process) {
      logger.info('Terminating FFmpeg process for session', {
        sessionId: internalSessionId,
        pid: session.process.pid
      });
      session.process.kill('SIGTERM');
    }

    // Remove session
    this.activeSessions.delete(internalSessionId);
    
    // Remove consumer mapping if exists
    if (this.consumerMap.has(sessionId)) {
      this.consumerMap.delete(sessionId);
    }

    return true;
  }

  /**
   * Updates session activity for keep-alive
   */
  updateSessionActivity(sessionId) {
    const internalSessionId = this.consumerMap.get(sessionId) || sessionId;
    const session = this.activeSessions.get(internalSessionId);
    
    if (session) {
      session.lastActivity = Date.now();
      logger.debug('Updated session activity', { 
        sessionId: internalSessionId,
        consumerSessionId: session.consumerSessionId
      });
      return true;
    }
    
    logger.debug('Session not found for activity update', { sessionId });
    return false;
  }

  /**
   * Starts health monitoring for all sessions
   */
  startHealthMonitoring() {
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeoutThreshold = 60000; // 60 seconds - increased for enhanced encoding streams

      for (const [sessionId, session] of this.activeSessions.entries()) {
        // Check for inactive sessions
        if (now - session.lastActivity > timeoutThreshold) {
          logger.warn('Session inactive, marking as stale', {
            sessionId,
            inactiveFor: now - session.lastActivity
          });
          
          // Don't immediately mark as no consumer - give more time for enhanced encoding
          if (now - session.lastActivity > 120000) { // 2 minutes
            session.hasConsumer = false;
            session.instanceAvailable = false;
          }

          // If session is really stale (10 minutes), clean it up
          if (now - session.lastActivity > 600000) {
            this.cleanupSession(sessionId);
          }
        } else {
          // Session is active - ensure consumer flags are set
          session.hasConsumer = true;
          session.instanceAvailable = true;
        }

        // Check process health
        if (session.process && session.status === 'running') {
          // Verify process is still alive
          try {
            process.kill(session.pid, 0); // Signal 0 just checks if process exists
          } catch (error) {
            logger.warn('Process no longer exists, marking session for recovery', {
              sessionId,
              pid: session.pid
            });
            this.handleSessionError(session, new Error('Process died'));
          }
        }
      }
    }, 5000); // Check every 5 seconds

    logger.info('Session health monitoring started');
  }

  /**
   * Cleans up a session
   */
  cleanupSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      logger.info('Cleaning up stale session', { sessionId });

      if (session.process && !session.process.killed) {
        session.process.kill('SIGTERM');
        setTimeout(() => {
          if (!session.process.killed) {
            session.process.kill('SIGKILL');
          }
        }, 2000);
      }

      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Gets all active sessions
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.values()).map(session => ({
      sessionId: session.sessionId,
      channelId: session.channelId,
      status: session.status,
      hasConsumer: session.hasConsumer,
      instanceAvailable: session.instanceAvailable,
      uptime: Date.now() - session.startTime,
      lastActivity: session.lastActivity,
      reconnectAttempts: session.reconnectAttempts
    }));
  }

  /**
   * Shutdown all sessions
   */
  shutdown() {
    logger.info('Shutting down persistent session manager');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    for (const sessionId of this.activeSessions.keys()) {
      this.cleanupSession(sessionId);
    }
  }
}

// Singleton instance
let sessionManager = null;

function getSessionManager() {
  if (!sessionManager) {
    sessionManager = new PersistentSessionManager();
  }
  return sessionManager;
}

/**
 * Middleware to maintain session activity
 */
function sessionKeepAlive() {
  return (req, res, next) => {
    // Extract session ID from URL or headers
    const sessionId = req.params.sessionId || 
                     req.headers['x-session-id'] || 
                     req.query.sessionId;

    if (sessionId) {
      const manager = getSessionManager();
      manager.updateSessionActivity(sessionId);
    }

    next();
  };
}

/**
 * Enhanced stream response headers for Plex compatibility
 */
function addStreamHeaders(req, res, sessionId) {
  const manager = getSessionManager();
  const status = manager.getSessionStatus(sessionId);

  res.set({
    'X-Session-ID': sessionId,
    'X-Session-Status': status.status || 'unknown',
    'X-Has-Consumer': status.hasConsumer ? 'true' : 'false',
    'X-Instance-Available': status.instanceAvailable ? 'true' : 'false',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  });
}

module.exports = {
  getSessionManager,
  PersistentSessionManager,
  sessionKeepAlive,
  addStreamHeaders
};