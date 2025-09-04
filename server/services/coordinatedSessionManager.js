/**
 * Coordinated Session Manager
 * 
 * Integrates crash detection with both StreamSessionManager and ConsumerManager
 * Provides intelligent session lifecycle management with proper crash handling
 */

const logger = require('../utils/logger');
const streamSessionManager = require('./streamSessionManager');
const { getConsumerManager } = require('./consumerManager');
const { getSessionManager } = require('../utils/sessionPersistenceFix');
const clientCrashDetector = require('./clientCrashDetector');

class CoordinatedSessionManager {
  constructor() {
    this.consumerManager = getConsumerManager();
    this.sessionPersistenceManager = getSessionManager();
    
    // Session coordination maps
    this.sessionCoordination = new Map(); // sessionId -> coordination metadata
    this.clientSessions = new Map(); // clientId -> array of sessionIds
    this.conflictResolution = new Map(); // sessionId -> conflict data
    
    this.setupCrashDetectorListeners();
    this.startConflictDetection();
    
    logger.info('Coordinated Session Manager initialized');
  }

  /**
   * Setup crash detector event listeners
   */
  setupCrashDetectorListeners() {
    clientCrashDetector.on('clientCrash', (crashData) => {
      this.handleClientCrash(crashData);
    });

    clientCrashDetector.on('sessionCleanupRequired', (cleanupData) => {
      this.handleSessionCleanup(cleanupData);
    });

    clientCrashDetector.on('sessionTerminated', (terminationData) => {
      this.handleSessionTermination(terminationData);
    });
  }

  /**
   * Start a new coordinated session
   */
  async startCoordinatedSession(sessionData) {
    const {
      sessionId,
      streamId,
      channelId,
      clientInfo,
      streamUrl
    } = sessionData;

    try {
      logger.info('Starting coordinated session', {
        sessionId,
        streamId,
        channelId,
        clientIdentifier: clientInfo.clientIdentifier,
        clientIP: clientInfo.clientIP,
        isAndroidTV: clientCrashDetector.isAndroidTVClient(clientInfo.userAgent)
      });

      // Check for session conflicts first
      const conflict = this.detectSessionConflict(sessionId, clientInfo);
      if (conflict.hasConflict) {
        await this.resolveSessionConflict(conflict);
      }

      // Register with crash detector
      clientCrashDetector.registerClientSession(sessionId, clientInfo);

      // Start session in all managers
      const streamSession = await streamSessionManager.startSession({
        sessionId,
        streamId,
        clientIP: clientInfo.clientIP,
        userAgent: clientInfo.userAgent,
        clientIdentifier: clientInfo.clientIdentifier,
        channelName: sessionData.channelName,
        channelNumber: sessionData.channelNumber,
        streamUrl,
        streamType: sessionData.streamType || 'hls'
      });

      // Create consumer tracking
      const consumer = this.consumerManager.createConsumer(
        sessionId, 
        channelId, 
        streamUrl, 
        {
          userAgent: clientInfo.userAgent,
          clientIp: clientInfo.clientIP,
          state: 'streaming',
          metadata: {
            isAndroidTV: clientCrashDetector.isAndroidTVClient(clientInfo.userAgent),
            coordinated: true
          }
        }
      );

      // Create session persistence
      const persistentSession = this.sessionPersistenceManager.createSession(
        channelId,
        sessionId,
        streamUrl,
        {
          userAgent: clientInfo.userAgent,
          consumerSessionId: sessionId,
          isConsumerAlias: false,
          primarySessionId: sessionId
        }
      );

      // Coordinate all sessions
      const coordination = {
        sessionId,
        clientId: clientInfo.clientIdentifier || clientInfo.clientIP,
        streamSessionId: streamSession.sessionId,
        consumerSessionId: consumer.sessionId,
        persistentSessionId: persistentSession.sessionId,
        startTime: Date.now(),
        lastActivity: Date.now(),
        
        // Session health tracking
        isHealthy: true,
        crashDetected: false,
        conflictResolved: conflict.hasConflict,
        
        // Client info
        clientInfo,
        
        // Manager references
        streamSession,
        consumer,
        persistentSession
      };

      this.sessionCoordination.set(sessionId, coordination);
      this.addClientSession(clientInfo.clientIdentifier || clientInfo.clientIP, sessionId);

      logger.info('Coordinated session started successfully', {
        sessionId,
        clientId: coordination.clientId,
        streamSessionId: coordination.streamSessionId,
        conflictResolved: coordination.conflictResolved
      });

      return coordination;

    } catch (error) {
      logger.error('Failed to start coordinated session', {
        sessionId,
        error: error.message
      });
      
      // Cleanup partial session creation
      await this.cleanupFailedSession(sessionId);
      throw error;
    }
  }

  /**
   * Update session activity across all managers
   */
  updateSessionActivity(sessionId, activityType = 'general', details = {}) {
    const coordination = this.sessionCoordination.get(sessionId);
    if (!coordination) return false;

    const now = Date.now();
    coordination.lastActivity = now;

    // Update crash detector
    clientCrashDetector.recordActivity(sessionId, activityType, details);

    // Update all session managers
    if (coordination.streamSession) {
      streamSessionManager.updateSessionMetrics(sessionId, {
        bytesTransferred: details.bytesTransferred || 0,
        currentBitrate: details.currentBitrate || 0
      });
    }

    if (coordination.consumerSessionId) {
      this.consumerManager.updateActivity(coordination.consumerSessionId);
    }

    if (coordination.persistentSessionId && this.sessionPersistenceManager) {
      this.sessionPersistenceManager.updateSessionActivity(coordination.persistentSessionId);
    }

    logger.debug('Session activity updated across all managers', {
      sessionId,
      activityType,
      clientId: coordination.clientId
    });

    return true;
  }

  /**
   * Handle client crash
   */
  async handleClientCrash(crashData) {
    const { sessionId, clientId, reason, errors } = crashData;
    
    logger.error('Handling client crash', {
      sessionId,
      clientId,
      reason,
      errorCount: errors?.length || 0
    });

    const coordination = this.sessionCoordination.get(sessionId);
    if (!coordination) return;

    coordination.crashDetected = true;
    coordination.isHealthy = false;

    // Immediately terminate all sessions
    await this.terminateCoordinatedSession(sessionId, reason);
  }

  /**
   * Handle session cleanup request
   */
  async handleSessionCleanup(cleanupData) {
    const { sessionId, clientId, reason, priority } = cleanupData;
    
    logger.info('Handling session cleanup request', {
      sessionId,
      clientId,
      reason,
      priority
    });

    // For high priority (Android TV), clean up immediately
    if (priority === 'high') {
      await this.terminateCoordinatedSession(sessionId, `cleanup_${reason}`);
    } else {
      // Mark for cleanup but give some time
      setTimeout(() => {
        this.terminateCoordinatedSession(sessionId, `delayed_cleanup_${reason}`);
      }, 30000); // 30 second delay for regular clients
    }
  }

  /**
   * Handle session termination
   */
  async handleSessionTermination(terminationData) {
    const { sessionId, reason } = terminationData;
    
    logger.info('Handling forced session termination', {
      sessionId,
      reason
    });

    await this.terminateCoordinatedSession(sessionId, reason);
  }

  /**
   * Terminate coordinated session
   */
  async terminateCoordinatedSession(sessionId, reason = 'manual') {
    const coordination = this.sessionCoordination.get(sessionId);
    if (!coordination) return false;

    logger.info('Terminating coordinated session', {
      sessionId,
      clientId: coordination.clientId,
      reason
    });

    try {
      // End session in stream session manager
      if (coordination.streamSession) {
        await streamSessionManager.endSession(sessionId, reason);
      }

      // Remove consumer
      if (coordination.consumerSessionId) {
        this.consumerManager.removeConsumer(coordination.consumerSessionId);
      }

      // Remove persistent session
      if (coordination.persistentSessionId && this.sessionPersistenceManager) {
        this.sessionPersistenceManager.removeSession(coordination.persistentSessionId);
      }

      // Remove from client tracking
      this.removeClientSession(coordination.clientId, sessionId);

      // Remove coordination
      this.sessionCoordination.delete(sessionId);

      logger.info('Coordinated session terminated successfully', {
        sessionId,
        reason
      });

      return true;

    } catch (error) {
      logger.error('Failed to terminate coordinated session', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Detect session conflicts
   */
  detectSessionConflict(sessionId, clientInfo) {
    const clientId = clientInfo.clientIdentifier || clientInfo.clientIP;
    const existingSessions = this.clientSessions.get(clientId) || [];
    
    // Check for active sessions from the same client
    const activeConflicts = existingSessions.filter(existingSessionId => {
      const coordination = this.sessionCoordination.get(existingSessionId);
      return coordination && coordination.isHealthy;
    });

    if (activeConflicts.length > 0) {
      logger.warn('Session conflict detected', {
        newSessionId: sessionId,
        clientId,
        conflictingSessions: activeConflicts
      });

      return {
        hasConflict: true,
        conflictingSessions: activeConflicts,
        clientId,
        newSessionId: sessionId
      };
    }

    return { hasConflict: false };
  }

  /**
   * Resolve session conflict
   */
  async resolveSessionConflict(conflict) {
    const { conflictingSessions, clientId, newSessionId } = conflict;

    logger.info('Resolving session conflict', {
      clientId,
      newSessionId,
      conflictingCount: conflictingSessions.length
    });

    // Terminate conflicting sessions
    for (const conflictingSessionId of conflictingSessions) {
      const coordination = this.sessionCoordination.get(conflictingSessionId);
      
      // Check if session is actually still active
      if (coordination) {
        const health = clientCrashDetector.checkSessionHealth(conflictingSessionId);
        
        if (!health.healthy || health.reason === 'confirmed_crash') {
          logger.info('Terminating unhealthy conflicting session', {
            sessionId: conflictingSessionId,
            reason: health.reason
          });
          await this.terminateCoordinatedSession(conflictingSessionId, 'conflict_resolution');
        } else {
          logger.warn('Healthy session conflict - keeping newer session', {
            existingSessionId: conflictingSessionId,
            newSessionId
          });
        }
      }
    }
  }

  /**
   * Add client session tracking
   */
  addClientSession(clientId, sessionId) {
    const sessions = this.clientSessions.get(clientId) || [];
    sessions.push(sessionId);
    this.clientSessions.set(clientId, sessions);
  }

  /**
   * Remove client session tracking
   */
  removeClientSession(clientId, sessionId) {
    const sessions = this.clientSessions.get(clientId) || [];
    const filtered = sessions.filter(id => id !== sessionId);
    
    if (filtered.length === 0) {
      this.clientSessions.delete(clientId);
    } else {
      this.clientSessions.set(clientId, filtered);
    }
  }

  /**
   * Start conflict detection monitoring
   */
  startConflictDetection() {
    setInterval(() => {
      this.detectStaleConflicts();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Detect and resolve stale conflicts
   */
  detectStaleConflicts() {
    for (const [sessionId, coordination] of this.sessionCoordination.entries()) {
      const health = clientCrashDetector.checkSessionHealth(sessionId);
      
      if (!health.healthy && coordination.isHealthy) {
        coordination.isHealthy = false;
        
        logger.info('Session marked as unhealthy by conflict detection', {
          sessionId,
          reason: health.reason,
          clientId: coordination.clientId
        });
      }
    }
  }

  /**
   * Cleanup failed session creation
   */
  async cleanupFailedSession(sessionId) {
    try {
      // Try to clean up from all possible managers
      await streamSessionManager.endSession(sessionId, 'creation_failed');
      this.consumerManager.removeConsumer(sessionId);
      
      if (this.sessionPersistenceManager) {
        this.sessionPersistenceManager.removeSession(sessionId);
      }

      this.sessionCoordination.delete(sessionId);
    } catch (error) {
      logger.error('Failed to cleanup failed session', { sessionId, error: error.message });
    }
  }

  /**
   * Get coordination statistics
   */
  getCoordinationStats() {
    const stats = {
      totalCoordinatedSessions: this.sessionCoordination.size,
      healthySessions: 0,
      crashedSessions: 0,
      conflictResolvedSessions: 0,
      clientCount: this.clientSessions.size,
      crashDetectorStats: clientCrashDetector.getCrashStatistics()
    };

    for (const coordination of this.sessionCoordination.values()) {
      if (coordination.isHealthy) stats.healthySessions++;
      if (coordination.crashDetected) stats.crashedSessions++;
      if (coordination.conflictResolved) stats.conflictResolvedSessions++;
    }

    return stats;
  }

  /**
   * Shutdown cleanup
   */
  async shutdown() {
    logger.info('Shutting down coordinated session manager');
    
    // Terminate all coordinated sessions
    const sessions = Array.from(this.sessionCoordination.keys());
    for (const sessionId of sessions) {
      await this.terminateCoordinatedSession(sessionId, 'shutdown');
    }

    // Cleanup crash detector
    clientCrashDetector.cleanup();
  }
}

// Create singleton instance
const coordinatedSessionManager = new CoordinatedSessionManager();

module.exports = coordinatedSessionManager;