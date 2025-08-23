const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Crash Tracker - Monitors application restarts and crashes
 */
class CrashTracker {
  constructor() {
    this.trackingFile = path.join(process.cwd(), 'data', 'crash-tracking.json');
    this.startupId = require('crypto').randomBytes(4).toString('hex');
    this.startTime = Date.now();
  }

  /**
   * Record application startup
   */
  async recordStartup() {
    try {
      let trackingData = await this.loadTrackingData();
      
      const startup = {
        id: this.startupId,
        pid: process.pid,
        ppid: process.ppid,
        startTime: new Date(this.startTime).toISOString(),
        nodeVersion: process.version,
        platform: `${process.platform} ${process.arch}`,
        environment: process.env.NODE_ENV || 'development',
        memoryUsage: process.memoryUsage(),
        lastShutdown: trackingData.currentSession ? trackingData.currentSession.shutdownReason || 'CRASH' : 'INITIAL'
      };

      // Check for recent crashes
      const recentCrashes = trackingData.history
        .filter(h => h.shutdownReason === 'CRASH' || !h.shutdownReason)
        .filter(h => Date.now() - new Date(h.startTime).getTime() < 3600000); // Last hour

      if (recentCrashes.length >= 3) {
        console.error('⚠️  WARNING: Multiple crashes detected in the last hour!');
        logger.error('⚠️  CRASH PATTERN DETECTED', {
          recentCrashes: recentCrashes.length,
          crashes: recentCrashes.map(c => ({
            time: c.startTime,
            uptime: c.uptime,
            reason: c.shutdownReason
          }))
        });
      }

      // Update tracking data
      if (trackingData.currentSession) {
        // Move previous session to history
        trackingData.history.push({
          ...trackingData.currentSession,
          endTime: startup.startTime,
          uptime: this.calculateUptime(trackingData.currentSession.startTime)
        });
        
        // Keep only last 100 sessions
        if (trackingData.history.length > 100) {
          trackingData.history = trackingData.history.slice(-100);
        }
      }

      trackingData.currentSession = startup;
      trackingData.totalStarts = (trackingData.totalStarts || 0) + 1;
      trackingData.lastModified = new Date().toISOString();

      await this.saveTrackingData(trackingData);

      // Log startup statistics
      const stats = this.calculateStatistics(trackingData);
      logger.info('📊 STARTUP STATISTICS', stats);

      return startup;
    } catch (error) {
      logger.error('Failed to record startup:', error);
      return null;
    }
  }

  /**
   * Record graceful shutdown
   */
  async recordShutdown(reason = 'GRACEFUL') {
    try {
      let trackingData = await this.loadTrackingData();
      
      if (trackingData.currentSession) {
        trackingData.currentSession.shutdownReason = reason;
        trackingData.currentSession.shutdownTime = new Date().toISOString();
        trackingData.currentSession.uptime = process.uptime();
        trackingData.currentSession.finalMemoryUsage = process.memoryUsage();
        
        await this.saveTrackingData(trackingData);
      }

      logger.info('Shutdown recorded', { reason, uptime: process.uptime() });
    } catch (error) {
      logger.error('Failed to record shutdown:', error);
    }
  }

  /**
   * Load tracking data from file
   */
  async loadTrackingData() {
    try {
      const data = await fs.readFile(this.trackingFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted, create new
      return {
        history: [],
        currentSession: null,
        totalStarts: 0,
        created: new Date().toISOString()
      };
    }
  }

  /**
   * Save tracking data to file
   */
  async saveTrackingData(data) {
    try {
      await fs.mkdir(path.dirname(this.trackingFile), { recursive: true });
      await fs.writeFile(this.trackingFile, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save tracking data:', error);
    }
  }

  /**
   * Calculate uptime from start time
   */
  calculateUptime(startTime) {
    const start = new Date(startTime).getTime();
    const now = Date.now();
    const uptimeSeconds = Math.round((now - start) / 1000);
    
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    
    return {
      seconds: uptimeSeconds,
      formatted: `${hours}h ${minutes}m ${seconds}s`
    };
  }

  /**
   * Calculate statistics from tracking data
   */
  calculateStatistics(data) {
    const last24h = Date.now() - 86400000;
    const last1h = Date.now() - 3600000;
    
    const recentHistory = data.history.filter(h => 
      new Date(h.startTime).getTime() > last24h
    );

    const crashes24h = recentHistory.filter(h => 
      h.shutdownReason === 'CRASH' || !h.shutdownReason
    ).length;

    const crashes1h = data.history.filter(h => 
      new Date(h.startTime).getTime() > last1h &&
      (h.shutdownReason === 'CRASH' || !h.shutdownReason)
    ).length;

    const avgUptime = recentHistory.length > 0
      ? recentHistory.reduce((sum, h) => sum + (h.uptime?.seconds || 0), 0) / recentHistory.length
      : 0;

    return {
      totalStarts: data.totalStarts,
      startsLast24h: recentHistory.length,
      crashesLast24h: crashes24h,
      crashesLastHour: crashes1h,
      averageUptime: Math.round(avgUptime),
      averageUptimeFormatted: this.formatSeconds(avgUptime),
      crashRate: recentHistory.length > 0 
        ? `${Math.round((crashes24h / recentHistory.length) * 100)}%`
        : '0%'
    };
  }

  /**
   * Format seconds to readable string
   */
  formatSeconds(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  }

  /**
   * Get crash report for diagnostics
   */
  async getCrashReport() {
    try {
      const data = await this.loadTrackingData();
      const stats = this.calculateStatistics(data);
      
      return {
        current: data.currentSession,
        statistics: stats,
        recentCrashes: data.history
          .filter(h => h.shutdownReason === 'CRASH' || !h.shutdownReason)
          .slice(-10)
          .map(h => ({
            time: h.startTime,
            uptime: h.uptime?.formatted || 'unknown',
            pid: h.pid
          })),
        recentRestarts: data.history.slice(-10).map(h => ({
          time: h.startTime,
          reason: h.shutdownReason || 'CRASH',
          uptime: h.uptime?.formatted || 'unknown'
        }))
      };
    } catch (error) {
      logger.error('Failed to generate crash report:', error);
      return null;
    }
  }
}

// Create singleton instance
const crashTracker = new CrashTracker();

module.exports = crashTracker;