const express = require('express');
const router = express.Router();
const streamSessionManager = require('../services/streamSessionManager');
const streamManager = require('../services/streamManager');
const settingsService = require('../services/settingsService');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Streaming Monitoring API Routes
 * 
 * Provides comprehensive real-time monitoring endpoints for:
 * - Active streaming sessions
 * - Capacity management
 * - Bandwidth analytics  
 * - Session history
 * - Performance metrics
 */

// Input validation schemas
const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(1000).default(100),
  offset: Joi.number().integer().min(0).default(0)
});

/**
 * GET /api/streaming/active
 * Get all currently active streaming sessions with detailed metrics
 */
router.get('/active', async (req, res) => {
  try {
    logger.info('Getting active streaming sessions');

    // Get active sessions from enhanced session manager
    const activeSessions = streamSessionManager.getActiveSessions();
    
    // Get capacity metrics
    const settings = await settingsService.getSettings();
    const maxConcurrent = settings?.plexlive?.streaming?.maxConcurrentStreams || 10;
    const capacity = streamSessionManager.getCapacityMetrics(maxConcurrent);
    
    // Get bandwidth statistics
    const bandwidth = streamSessionManager.getBandwidthStats();

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        sessions: activeSessions,
        capacity,
        bandwidth,
        summary: {
          totalSessions: activeSessions.length,
          availableSlots: capacity.availableStreams,
          utilizationPercent: capacity.utilizationPercentage,
          totalBandwidth: bandwidth.formattedStats.totalBandwidth,
          status: capacity.status
        }
      }
    };

    logger.info('Active sessions retrieved successfully', {
      sessionCount: activeSessions.length,
      capacity: capacity.utilizationPercentage + '%',
      bandwidth: bandwidth.formattedStats.totalBandwidth
    });

    res.json(response);
  } catch (error) {
    logger.error('Failed to get active streaming sessions', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve active sessions',
      details: error.message
    });
  }
});

/**
 * GET /api/streaming/capacity
 * Get current streaming capacity and utilization metrics
 */
router.get('/capacity', async (req, res) => {
  try {
    logger.info('Getting streaming capacity metrics');

    const settings = await settingsService.getSettings();
    const maxConcurrent = parseInt(settings?.plexlive?.streaming?.maxConcurrentStreams) || 10;
    
    const capacity = streamSessionManager.getCapacityMetrics(maxConcurrent);
    const bandwidth = streamSessionManager.getBandwidthStats();

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        ...capacity,
        bandwidth: bandwidth.formattedStats,
        limits: {
          maxConcurrentStreams: maxConcurrent,
          streamTimeout: parseInt(settings?.plexlive?.streaming?.streamTimeout) || 30000,
          reconnectAttempts: parseInt(settings?.plexlive?.streaming?.reconnectAttempts) || 3
        },
        health: {
          status: capacity.status,
          message: capacity.status === 'critical' 
            ? 'Server at capacity - new streams may be rejected'
            : capacity.status === 'warning'
            ? 'Server under heavy load'
            : 'Server operating normally'
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get capacity metrics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve capacity metrics',
      details: error.message
    });
  }
});

/**
 * GET /api/streaming/bandwidth
 * Get detailed bandwidth analytics for all active sessions
 */
router.get('/bandwidth', async (req, res) => {
  try {
    logger.info('Getting bandwidth analytics');

    const bandwidth = streamSessionManager.getBandwidthStats();
    const activeSessions = streamSessionManager.getActiveSessions();

    // Calculate per-session bandwidth details
    const sessionBandwidth = activeSessions.map(session => ({
      sessionId: session.sessionId,
      streamId: session.streamId,
      channelName: session.channelName,
      channelNumber: session.channelNumber,
      clientIP: session.clientIP,
      clientHostname: session.clientHostname,
      currentBitrate: session.currentBitrate,
      avgBitrate: session.avgBitrate,
      peakBitrate: session.peakBitrate,
      bytesTransferred: session.bytesTransferred,
      duration: session.duration,
      formattedMetrics: {
        currentBandwidth: streamSessionManager.formatBandwidth(session.currentBitrate),
        avgBandwidth: streamSessionManager.formatBandwidth(session.avgBitrate),
        peakBandwidth: streamSessionManager.formatBandwidth(session.peakBitrate),
        dataTransferred: streamSessionManager.formatBytes(session.bytesTransferred),
        duration: session.durationFormatted
      }
    }));

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        overall: bandwidth,
        sessions: sessionBandwidth,
        trends: {
          // Add simple trend analysis
          avgSessionBitrate: bandwidth.averageSessionBitrate,
          peakSessionBitrate: bandwidth.peakSessionBitrate,
          totalDataTransferred: bandwidth.totalMBTransferred
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get bandwidth analytics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve bandwidth analytics',
      details: error.message
    });
  }
});

/**
 * GET /api/streaming/sessions/:sessionId
 * Get detailed information about a specific streaming session
 */
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    logger.info('Getting session details', { sessionId });

    const activeSessions = streamSessionManager.getActiveSessions();
    const session = activeSessions.find(s => s.sessionId === sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        sessionId
      });
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        session,
        formattedMetrics: {
          duration: session.durationFormatted,
          currentBandwidth: streamSessionManager.formatBandwidth(session.currentBitrate),
          avgBandwidth: streamSessionManager.formatBandwidth(session.avgBitrate),
          peakBandwidth: streamSessionManager.formatBandwidth(session.peakBitrate),
          dataTransferred: streamSessionManager.formatBytes(session.bytesTransferred)
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get session details', { 
      sessionId: req.params.sessionId, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session details',
      details: error.message
    });
  }
});

/**
 * DELETE /api/streaming/sessions/:sessionId
 * Terminate a specific streaming session
 */
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    logger.info('Terminating streaming session', { sessionId });

    // End session in session manager
    const finalStats = await streamSessionManager.endSession(sessionId, 'manual_termination');
    
    if (!finalStats) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        sessionId
      });
    }

    // Also cleanup in stream manager
    streamManager.cleanupStream(sessionId, 'api_termination');

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Session terminated successfully',
      sessionId,
      finalStats
    };

    logger.info('Session terminated successfully', { sessionId, finalStats });
    res.json(response);
  } catch (error) {
    logger.error('Failed to terminate session', { 
      sessionId: req.params.sessionId, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to terminate session',
      details: error.message
    });
  }
});

/**
 * DELETE /api/streaming/sessions/client/:clientId
 * Terminate all sessions for a specific client
 */
router.delete('/sessions/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    logger.info('Terminating all sessions for client', { clientId });

    const activeSessions = streamSessionManager.getActiveSessions();
    const clientSessions = activeSessions.filter(s => s.clientIdentifier === clientId);

    if (clientSessions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active sessions found for client',
        clientId
      });
    }

    const terminatedSessions = [];
    for (const session of clientSessions) {
      const finalStats = await streamSessionManager.endSession(session.sessionId, 'client_cleanup');
      streamManager.cleanupStream(session.sessionId, 'api_client_cleanup');
      terminatedSessions.push({
        sessionId: session.sessionId,
        finalStats
      });
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      message: `Terminated ${terminatedSessions.length} sessions for client`,
      clientId,
      terminatedSessions
    };

    logger.info('Client sessions terminated successfully', { 
      clientId, 
      sessionCount: terminatedSessions.length 
    });
    res.json(response);
  } catch (error) {
    logger.error('Failed to terminate client sessions', { 
      clientId: req.params.clientId, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to terminate client sessions',
      details: error.message
    });
  }
});

/**
 * GET /api/streaming/history
 * Get historical streaming session data with pagination
 */
router.get('/history', async (req, res) => {
  try {
    // Validate pagination parameters
    const { error, value } = paginationSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pagination parameters',
        details: error.details[0].message
      });
    }

    const { limit, offset } = value;
    logger.info('Getting session history', { limit, offset });

    const history = await streamSessionManager.getSessionHistory(limit, offset);

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        sessions: history,
        pagination: {
          limit,
          offset,
          count: history.length,
          hasMore: history.length === limit
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get session history', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session history',
      details: error.message
    });
  }
});

/**
 * GET /api/streaming/stats
 * Get comprehensive streaming statistics and analytics
 */
router.get('/stats', async (req, res) => {
  try {
    logger.info('Getting comprehensive streaming statistics');

    const settings = await settingsService.getSettings();
    const maxConcurrent = settings?.plexlive?.streaming?.maxConcurrentStreams || 10;
    
    const capacity = streamSessionManager.getCapacityMetrics(maxConcurrent);
    const bandwidth = streamSessionManager.getBandwidthStats();
    const activeSessions = streamSessionManager.getActiveSessions();

    // Calculate additional statistics
    const sessionStats = {
      totalActive: activeSessions.length,
      longestSession: activeSessions.length > 0 
        ? Math.max(...activeSessions.map(s => s.duration))
        : 0,
      averageSessionDuration: activeSessions.length > 0
        ? activeSessions.reduce((sum, s) => sum + s.duration, 0) / activeSessions.length
        : 0,
      totalErrors: activeSessions.reduce((sum, s) => sum + (s.errorCount || 0), 0)
    };

    // Channel distribution
    const channelDistribution = {};
    activeSessions.forEach(session => {
      const key = `${session.channelName} (#${session.channelNumber})`;
      channelDistribution[key] = (channelDistribution[key] || 0) + 1;
    });

    // Client distribution
    const clientDistribution = {};
    activeSessions.forEach(session => {
      const key = session.clientHostname || session.clientIP;
      clientDistribution[key] = (clientDistribution[key] || 0) + 1;
    });

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        capacity,
        bandwidth,
        sessionStats: {
          ...sessionStats,
          longestSessionFormatted: streamSessionManager.formatDuration(sessionStats.longestSession),
          averageSessionFormatted: streamSessionManager.formatDuration(sessionStats.averageSessionDuration)
        },
        distribution: {
          channels: channelDistribution,
          clients: clientDistribution
        },
        health: {
          status: capacity.status,
          serverLoad: capacity.utilizationPercentage,
          totalBandwidth: bandwidth.formattedStats.totalBandwidth,
          errorRate: sessionStats.totalErrors > 0 ? 
            Math.round((sessionStats.totalErrors / sessionStats.totalActive) * 100) : 0
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get streaming statistics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve streaming statistics',
      details: error.message
    });
  }
});

/**
 * POST /api/streaming/cleanup
 * Force cleanup of stale or zombie sessions
 */
router.post('/cleanup', async (req, res) => {
  try {
    logger.info('Performing streaming session cleanup');

    const activeSessions = streamSessionManager.getActiveSessions();
    const now = Date.now();
    const staleThreshold = 60 * 60 * 1000; // 1 hour
    
    let cleanedCount = 0;
    const staleSessions = activeSessions.filter(session => 
      now - session.lastUpdate > staleThreshold
    );

    for (const session of staleSessions) {
      await streamSessionManager.endSession(session.sessionId, 'cleanup_stale');
      streamManager.cleanupStream(session.sessionId, 'api_cleanup');
      cleanedCount++;
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      message: `Cleaned up ${cleanedCount} stale sessions`,
      cleanedSessions: cleanedCount,
      remainingActive: activeSessions.length - cleanedCount
    };

    logger.info('Session cleanup completed', { 
      cleanedCount, 
      remainingActive: activeSessions.length - cleanedCount 
    });
    res.json(response);
  } catch (error) {
    logger.error('Failed to cleanup sessions', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup sessions',
      details: error.message
    });
  }
});

module.exports = router;