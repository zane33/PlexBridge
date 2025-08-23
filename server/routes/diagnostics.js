const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const crashTracker = require('../utils/crashTracker');
const os = require('os');

/**
 * Diagnostics API - Provides system health and crash tracking information
 */

/**
 * GET /api/diagnostics/health
 * Get detailed system health information
 */
router.get('/health', async (req, res) => {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        ppid: process.ppid,
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: uptime,
        uptimeFormatted: formatUptime(uptime)
      },
      memory: {
        rss: formatBytes(memUsage.rss),
        heapTotal: formatBytes(memUsage.heapTotal),
        heapUsed: formatBytes(memUsage.heapUsed),
        external: formatBytes(memUsage.external),
        arrayBuffers: formatBytes(memUsage.arrayBuffers),
        heapUsagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      system: {
        hostname: os.hostname(),
        type: os.type(),
        release: os.release(),
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
        memoryUsagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
        cpus: os.cpus().length,
        loadAverage: os.loadavg()
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000000), // Convert to ms
        system: Math.round(cpuUsage.system / 1000000)
      }
    };
    
    res.json(health);
  } catch (error) {
    logger.error('Failed to get health information:', error);
    res.status(500).json({ error: 'Failed to get health information' });
  }
});

/**
 * GET /api/diagnostics/crashes
 * Get crash tracking and restart information
 */
router.get('/crashes', async (req, res) => {
  try {
    const crashReport = await crashTracker.getCrashReport();
    
    if (!crashReport) {
      return res.status(500).json({ error: 'Failed to generate crash report' });
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      current: {
        ...crashReport.current,
        uptime: process.uptime(),
        uptimeFormatted: formatUptime(process.uptime())
      },
      statistics: crashReport.statistics,
      recentCrashes: crashReport.recentCrashes,
      recentRestarts: crashReport.recentRestarts,
      alerts: generateAlerts(crashReport.statistics)
    });
  } catch (error) {
    logger.error('Failed to get crash report:', error);
    res.status(500).json({ error: 'Failed to get crash report' });
  }
});

/**
 * GET /api/diagnostics/memory
 * Get detailed memory usage information
 */
router.get('/memory', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const systemMem = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    };
    
    res.json({
      timestamp: new Date().toISOString(),
      process: {
        rss: {
          bytes: memUsage.rss,
          formatted: formatBytes(memUsage.rss),
          description: 'Resident Set Size - total memory allocated for the process'
        },
        heapTotal: {
          bytes: memUsage.heapTotal,
          formatted: formatBytes(memUsage.heapTotal),
          description: 'Total size of the allocated heap'
        },
        heapUsed: {
          bytes: memUsage.heapUsed,
          formatted: formatBytes(memUsage.heapUsed),
          description: 'Actual memory used during execution'
        },
        external: {
          bytes: memUsage.external,
          formatted: formatBytes(memUsage.external),
          description: 'Memory used by C++ objects bound to JavaScript'
        },
        arrayBuffers: {
          bytes: memUsage.arrayBuffers,
          formatted: formatBytes(memUsage.arrayBuffers),
          description: 'Memory used by ArrayBuffers and SharedArrayBuffers'
        }
      },
      system: {
        total: {
          bytes: systemMem.total,
          formatted: formatBytes(systemMem.total)
        },
        free: {
          bytes: systemMem.free,
          formatted: formatBytes(systemMem.free)
        },
        used: {
          bytes: systemMem.used,
          formatted: formatBytes(systemMem.used)
        },
        usagePercent: Math.round((systemMem.used / systemMem.total) * 100)
      },
      analysis: {
        heapUsagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
        processMemoryPercent: Math.round((memUsage.rss / systemMem.total) * 100),
        warning: memUsage.heapUsed / memUsage.heapTotal > 0.9 ? 'High heap usage detected' : null
      }
    });
  } catch (error) {
    logger.error('Failed to get memory information:', error);
    res.status(500).json({ error: 'Failed to get memory information' });
  }
});

/**
 * GET /api/diagnostics/logs/recent
 * Get recent application logs
 */
router.get('/logs/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level || 'all';
    
    // This would typically read from the log file or database
    // For now, return a placeholder
    res.json({
      message: 'Log retrieval endpoint',
      limit,
      level,
      note: 'Implement log file reading based on your logging setup'
    });
  } catch (error) {
    logger.error('Failed to get recent logs:', error);
    res.status(500).json({ error: 'Failed to get recent logs' });
  }
});

// Helper functions
function formatBytes(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}

function generateAlerts(statistics) {
  const alerts = [];
  
  if (statistics.crashesLastHour >= 3) {
    alerts.push({
      level: 'critical',
      message: `${statistics.crashesLastHour} crashes in the last hour - application unstable`
    });
  } else if (statistics.crashesLastHour >= 1) {
    alerts.push({
      level: 'warning',
      message: `${statistics.crashesLastHour} crash(es) in the last hour`
    });
  }
  
  if (statistics.crashesLast24h >= 10) {
    alerts.push({
      level: 'critical',
      message: `${statistics.crashesLast24h} crashes in the last 24 hours - investigate immediately`
    });
  } else if (statistics.crashesLast24h >= 5) {
    alerts.push({
      level: 'warning',
      message: `${statistics.crashesLast24h} crashes in the last 24 hours`
    });
  }
  
  if (statistics.averageUptime < 300) { // Less than 5 minutes
    alerts.push({
      level: 'critical',
      message: `Average uptime only ${statistics.averageUptimeFormatted} - application failing to stay running`
    });
  } else if (statistics.averageUptime < 3600) { // Less than 1 hour
    alerts.push({
      level: 'warning',
      message: `Average uptime is ${statistics.averageUptimeFormatted}`
    });
  }
  
  return alerts;
}

module.exports = router;