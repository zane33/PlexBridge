const logger = require('../utils/logger');
const database = require('./database');
const dns = require('dns');
const { promisify } = require('util');

/**
 * Enhanced Stream Session Manager for Real-time Monitoring
 * 
 * This service provides comprehensive tracking of streaming sessions with:
 * - Real-time bandwidth monitoring
 * - Client hostname resolution
 * - Detailed performance metrics
 * - Persistent session history
 * - Socket.IO real-time updates
 */
class StreamSessionManager {
  constructor() {
    this.activeSessions = new Map(); // sessionId -> session data
    this.bandwidthSamples = new Map(); // sessionId -> array of bandwidth samples
    this.hostnameCache = new Map(); // IP -> hostname cache
    this.dnsReverse = promisify(dns.reverse);
    
    // Performance monitoring settings
    this.bandwidthWindowMs = 30000; // 30 seconds for bandwidth calculation
    this.updateIntervalMs = 2000; // Update metrics every 2 seconds
    this.maxBandwidthSamples = 15; // Keep 15 samples (30 seconds at 2s intervals)
    
    // Start periodic updates
    this.startPeriodicUpdates();
  }

  /**
   * Start a new streaming session with comprehensive tracking
   */
  async startSession(sessionData) {
    const {
      sessionId,
      streamId,
      clientIP,
      userAgent,
      clientIdentifier,
      channelName,
      channelNumber,
      streamUrl,
      streamType
    } = sessionData;

    try {
      // Check if there's already an active session for this client+stream
      // This prevents duplicate sessions when Plex makes multiple requests
      const existingSession = this.getActiveSessionByClientAndStream(clientIdentifier, streamId);
      if (existingSession) {
        logger.info('Session already exists for client+stream, updating last access', {
          sessionId: existingSession.sessionId,
          clientIdentifier,
          streamId
        });
        
        // Update last access time
        existingSession.lastUpdate = Date.now();
        return existingSession;
      }
      
      // Resolve client hostname asynchronously
      const hostname = await this.resolveHostname(clientIP);
      
      // Create session record
      const session = {
        sessionId,
        streamId,
        clientIP,
        clientHostname: hostname,
        userAgent,
        clientIdentifier,
        channelName: channelName || 'Unknown',
        channelNumber: channelNumber || 0,
        streamUrl,
        streamType,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        
        // Performance metrics
        bytesTransferred: 0,
        currentBitrate: 0,
        avgBitrate: 0,
        peakBitrate: 0,
        errorCount: 0,
        
        // Status - start with 'connecting' and update to 'streaming' once data flows
        status: 'connecting',
        streamingStatus: 'Starting stream...'
      };

      // Store in memory for real-time access
      this.activeSessions.set(sessionId, session);
      this.bandwidthSamples.set(sessionId, []);

      // Persist to database
      await this.persistSession(session);

      // Emit real-time update
      this.emitSessionUpdate('session:started', session);

      logger.info('Stream session started with enhanced tracking', {
        sessionId,
        streamId,
        channelName,
        clientIP,
        clientHostname: hostname,
        streamType
      });

      return session;
    } catch (error) {
      logger.error('Failed to start stream session', {
        sessionId,
        streamId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update session with bandwidth and performance data
   */
  updateSessionMetrics(sessionId, metrics) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    const now = Date.now();
    const {
      bytesTransferred = 0,
      currentBitrate = 0,
      errorIncrement = 0
    } = metrics;

    // Update basic metrics
    session.bytesTransferred = bytesTransferred;
    session.currentBitrate = currentBitrate;
    session.lastUpdate = now;
    session.errorCount += errorIncrement;

    // Update peak bitrate
    if (currentBitrate > session.peakBitrate) {
      session.peakBitrate = currentBitrate;
    }

    // Update status to streaming once data starts flowing
    if (currentBitrate > 0 && session.status === 'connecting') {
      session.status = 'streaming';
      session.streamingStatus = 'Streaming Now';
    } else if (bytesTransferred > 0 && session.status === 'connecting') {
      session.status = 'streaming';
      session.streamingStatus = 'Streaming Now';
    }

    // Add bandwidth sample for average calculation
    if (currentBitrate > 0) {
      const samples = this.bandwidthSamples.get(sessionId) || [];
      samples.push({
        timestamp: now,
        bitrate: currentBitrate
      });

      // Keep only recent samples within the window
      const windowStart = now - this.bandwidthWindowMs;
      const recentSamples = samples.filter(sample => sample.timestamp >= windowStart);
      
      // Limit number of samples to prevent memory bloat
      if (recentSamples.length > this.maxBandwidthSamples) {
        recentSamples.splice(0, recentSamples.length - this.maxBandwidthSamples);
      }

      this.bandwidthSamples.set(sessionId, recentSamples);

      // Calculate average bitrate from recent samples
      if (recentSamples.length > 0) {
        const totalBitrate = recentSamples.reduce((sum, sample) => sum + sample.bitrate, 0);
        session.avgBitrate = Math.round(totalBitrate / recentSamples.length);
      }
    }

    // Update session in memory
    this.activeSessions.set(sessionId, session);

    return true;
  }

  /**
   * End a streaming session and calculate final metrics
   */
  async endSession(sessionId, endReason = 'normal') {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      logger.warn('Attempted to end non-existent session', { sessionId });
      return false;
    }

    try {
      const now = Date.now();
      const duration = now - session.startTime;

      // Update final metrics
      session.endTime = now;
      session.duration = duration;
      session.endReason = endReason;
      session.status = 'ended';

      // Calculate final statistics
      const finalStats = {
        duration,
        durationFormatted: this.formatDuration(duration),
        bytesTransferred: session.bytesTransferred,
        avgBitrate: session.avgBitrate,
        peakBitrate: session.peakBitrate,
        errorCount: session.errorCount,
        totalMB: Math.round(session.bytesTransferred / (1024 * 1024) * 100) / 100
      };

      // Update database record
      await this.updateSessionInDatabase(sessionId, {
        ended_at: new Date(now).toISOString(),
        duration_ms: duration,
        bytes_transferred: session.bytesTransferred,
        current_bitrate: session.currentBitrate,
        avg_bitrate: session.avgBitrate,
        peak_bitrate: session.peakBitrate,
        error_count: session.errorCount,
        end_reason: endReason,
        status: 'ended'
      });

      // Emit real-time update
      this.emitSessionUpdate('session:ended', {
        ...session,
        finalStats
      });

      // Clean up memory
      this.activeSessions.delete(sessionId);
      this.bandwidthSamples.delete(sessionId);

      logger.info('Stream session ended with final metrics', {
        sessionId,
        streamId: session.streamId,
        channelName: session.channelName,
        clientIP: session.clientIP,
        endReason,
        ...finalStats
      });

      return finalStats;
    } catch (error) {
      logger.error('Failed to end stream session', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all active sessions with current metrics
   */
  getActiveSessions() {
    const sessions = Array.from(this.activeSessions.values()).map(session => ({
      ...session,
      duration: Date.now() - session.startTime,
      durationFormatted: this.formatDuration(Date.now() - session.startTime)
    }));

    return sessions;
  }

  /**
   * Get active session by client identifier and stream ID
   * This prevents duplicate sessions for the same client+stream combination
   */
  getActiveSessionByClientAndStream(clientIdentifier, streamId) {
    for (const session of this.activeSessions.values()) {
      if (session.clientIdentifier === clientIdentifier && 
          session.streamId === streamId &&
          session.status === 'active') {
        return session;
      }
    }
    return null;
  }

  /**
   * Get capacity and utilization metrics
   */
  getCapacityMetrics(maxConcurrentStreams = 10) {
    const activeCount = this.activeSessions.size;
    const utilization = Math.round((activeCount / maxConcurrentStreams) * 100);

    // Group sessions by channel
    const channelGroups = new Map();
    for (const session of this.activeSessions.values()) {
      const key = session.streamId;
      if (!channelGroups.has(key)) {
        channelGroups.set(key, []);
      }
      channelGroups.get(key).push(session);
    }

    // Get unique clients
    const uniqueClients = new Set();
    for (const session of this.activeSessions.values()) {
      uniqueClients.add(session.clientIdentifier);
    }

    return {
      totalActiveStreams: activeCount,
      maxConcurrentStreams,
      utilizationPercentage: utilization,
      availableStreams: Math.max(0, maxConcurrentStreams - activeCount),
      channelStreamCounts: Object.fromEntries(
        Array.from(channelGroups.entries()).map(([channelId, sessions]) => [
          channelId,
          {
            count: sessions.length,
            channelName: sessions[0]?.channelName || 'Unknown',
            channelNumber: sessions[0]?.channelNumber || 0
          }
        ])
      ),
      uniqueClients: uniqueClients.size,
      status: utilization >= 90 ? 'critical' : utilization >= 70 ? 'warning' : 'normal'
    };
  }

  /**
   * Get bandwidth statistics for all active sessions
   */
  getBandwidthStats() {
    const sessions = this.getActiveSessions();
    
    const totalBitrate = sessions.reduce((sum, s) => sum + (s.currentBitrate || 0), 0);
    const avgBitrate = sessions.length > 0 ? Math.round(totalBitrate / sessions.length) : 0;
    const peakBitrate = Math.max(...sessions.map(s => s.peakBitrate || 0), 0);
    const totalBytes = sessions.reduce((sum, s) => sum + (s.bytesTransferred || 0), 0);

    return {
      totalCurrentBitrate: totalBitrate,
      averageSessionBitrate: avgBitrate,
      peakSessionBitrate: peakBitrate,
      totalBytesTransferred: totalBytes,
      totalMBTransferred: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
      formattedStats: {
        totalBandwidth: this.formatBandwidth(totalBitrate),
        avgBandwidth: this.formatBandwidth(avgBitrate),
        peakBandwidth: this.formatBandwidth(peakBitrate),
        totalData: this.formatBytes(totalBytes)
      }
    };
  }

  /**
   * Get session history from database
   */
  async getSessionHistory(limit = 100, offset = 0) {
    try {
      const sessions = await database.all(`
        SELECT 
          id,
          stream_id,
          client_ip,
          client_hostname,
          channel_name,
          channel_number,
          stream_type,
          started_at,
          ended_at,
          duration_ms,
          bytes_transferred,
          avg_bitrate,
          peak_bitrate,
          error_count,
          end_reason,
          status
        FROM stream_sessions 
        ORDER BY started_at DESC 
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      return sessions.map(session => ({
        ...session,
        durationFormatted: session.duration_ms ? this.formatDuration(session.duration_ms) : 'N/A',
        bytesFormatted: this.formatBytes(session.bytes_transferred || 0),
        avgBitrateFormatted: this.formatBandwidth(session.avg_bitrate || 0)
      }));
    } catch (error) {
      logger.error('Failed to get session history', { error: error.message });
      return [];
    }
  }

  /**
   * Resolve hostname from IP address with caching
   */
  async resolveHostname(ip) {
    // Check cache first
    if (this.hostnameCache.has(ip)) {
      return this.hostnameCache.get(ip);
    }

    try {
      const hostnames = await this.dnsReverse(ip);
      const hostname = hostnames && hostnames.length > 0 ? hostnames[0] : ip;
      
      // Cache the result for 5 minutes
      this.hostnameCache.set(ip, hostname);
      setTimeout(() => this.hostnameCache.delete(ip), 5 * 60 * 1000);
      
      return hostname;
    } catch (error) {
      // If reverse DNS fails, use IP address
      const hostname = ip;
      this.hostnameCache.set(ip, hostname);
      return hostname;
    }
  }

  /**
   * Persist session to database
   */
  async persistSession(session) {
    try {
      await database.run(`
        INSERT INTO stream_sessions (
          id, stream_id, client_ip, client_hostname, user_agent, client_identifier,
          channel_name, channel_number, stream_url, stream_type, started_at,
          bytes_transferred, current_bitrate, avg_bitrate, peak_bitrate,
          error_count, status, last_update
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        session.sessionId,
        session.streamId,
        session.clientIP,
        session.clientHostname,
        session.userAgent,
        session.clientIdentifier,
        session.channelName,
        session.channelNumber,
        session.streamUrl,
        session.streamType,
        new Date(session.startTime).toISOString(),
        session.bytesTransferred,
        session.currentBitrate,
        session.avgBitrate,
        session.peakBitrate,
        session.errorCount,
        session.status,
        new Date(session.lastUpdate).toISOString()
      ]);
    } catch (error) {
      logger.error('Failed to persist session to database', {
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
        UPDATE stream_sessions 
        SET ${setClause}, last_update = CURRENT_TIMESTAMP
        WHERE id = ?
      `, values);
    } catch (error) {
      logger.error('Failed to update session in database', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * Emit real-time updates via Socket.IO
   */
  emitSessionUpdate(event, data) {
    if (global.io) {
      // Emit to streaming room for targeted updates
      global.io.to('streaming').emit(event, {
        timestamp: new Date().toISOString(),
        ...data
      });
      
      // Also emit to metrics room for dashboard updates
      global.io.to('metrics').emit(event, {
        timestamp: new Date().toISOString(),
        ...data
      });
    }
  }

  /**
   * Start periodic updates for real-time monitoring
   */
  startPeriodicUpdates() {
    setInterval(() => {
      if (this.activeSessions.size > 0) {
        const capacity = this.getCapacityMetrics();
        const bandwidth = this.getBandwidthStats();
        const sessions = this.getActiveSessions();

        // Emit comprehensive monitoring update
        this.emitSessionUpdate('monitoring:update', {
          capacity,
          bandwidth,
          sessions: sessions.map(session => ({
            sessionId: session.sessionId,
            streamId: session.streamId,
            channelName: session.channelName,
            channelNumber: session.channelNumber,
            clientIP: session.clientIP,
            clientHostname: session.clientHostname,
            hostname: session.clientHostname, // For Dashboard compatibility
            duration: session.duration,
            durationFormatted: session.durationFormatted,
            currentBitrate: session.currentBitrate,
            avgBitrate: session.avgBitrate,
            peakBitrate: session.peakBitrate,
            bytesTransferred: session.bytesTransferred,
            errorCount: session.errorCount,
            status: session.status,
            streamingStatus: session.streamingStatus
          }))
        });
      }
    }, this.updateIntervalMs);
  }

  /**
   * Utility: Format duration in human-readable format
   */
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Utility: Format bandwidth for display
   */
  formatBandwidth(bps) {
    if (!bps || bps === 0) return '0 bps';
    const kbps = bps / 1000;
    const mbps = bps / 1000000;
    
    if (mbps >= 1) {
      return `${mbps.toFixed(1)} Mbps`;
    } else if (kbps >= 1) {
      return `${kbps.toFixed(0)} kbps`;
    } else {
      return `${bps} bps`;
    }
  }

  /**
   * Utility: Format bytes for display
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Cleanup all sessions (for shutdown)
   */
  async cleanup() {
    logger.info('Cleaning up all stream sessions');
    
    const activeSessions = Array.from(this.activeSessions.keys());
    for (const sessionId of activeSessions) {
      await this.endSession(sessionId, 'shutdown');
    }

    // Clear caches
    this.hostnameCache.clear();
    this.bandwidthSamples.clear();
  }
}

// Create singleton instance
const streamSessionManager = new StreamSessionManager();

module.exports = streamSessionManager;