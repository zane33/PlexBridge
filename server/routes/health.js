const express = require('express');
const router = express.Router();
const database = require('../services/database');
const logger = require('../utils/logger');
const os = require('os');
const path = require('path');

// Comprehensive health check endpoint
router.get('/health', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Basic system info
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: require('../../package.json').version,
      environment: process.env.NODE_ENV || 'development',
      
      // System resources
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        memory: {
          rss: process.memoryUsage().rss,
          heapUsed: process.memoryUsage().heapUsed,
          heapTotal: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external,
          systemFree: os.freemem(),
          systemTotal: os.totalmem()
        },
        cpu: {
          loadAverage: os.loadavg(),
          cores: os.cpus().length
        }
      },
      
      // Service health checks
      services: {}
    };

    // Check database health
    try {
      const dbHealth = await database.healthCheck();
      health.services.database = dbHealth;
    } catch (dbError) {
      health.services.database = {
        status: 'unhealthy',
        error: dbError.message,
        timestamp: new Date().toISOString()
      };
      health.status = 'degraded';
    }

    // Check cache service
    try {
      const cacheService = require('../services/cacheService');
      if (cacheService && typeof cacheService.isConnected !== 'undefined') {
        const cacheHealth = await cacheService.healthCheck();
        health.services.cache = {
          status: cacheHealth.status === 'healthy' ? 'healthy' : 'degraded',
          type: cacheHealth.type || 'memory',
          timestamp: new Date().toISOString()
        };
      } else {
        health.services.cache = {
          status: 'healthy',
          type: 'memory',
          timestamp: new Date().toISOString()
        };
      }
    } catch (cacheError) {
      health.services.cache = {
        status: 'degraded',
        error: cacheError.message,
        type: 'memory',
        timestamp: new Date().toISOString()
      };
    }

    // Check Socket.IO connections
    try {
      const io = global.io;
      if (io) {
        const sockets = io.of('/').sockets;
        health.services.websocket = {
          status: 'healthy',
          activeConnections: sockets.size,
          timestamp: new Date().toISOString()
        };
      } else {
        health.services.websocket = {
          status: 'unhealthy',
          error: 'Socket.IO not initialized',
          timestamp: new Date().toISOString()
        };
      }
    } catch (wsError) {
      health.services.websocket = {
        status: 'unhealthy',
        error: wsError.message,
        timestamp: new Date().toISOString()
      };
      health.status = 'degraded';
    }

    // Check SSDP service
    try {
      const ssdpService = require('../services/ssdpService');
      if (ssdpService && typeof ssdpService.isRunning !== 'undefined') {
        health.services.ssdp = {
          status: ssdpService.isRunning ? 'healthy' : 'stopped',
          timestamp: new Date().toISOString()
        };
      } else {
        health.services.ssdp = {
          status: 'stopped',
          timestamp: new Date().toISOString()
        };
      }
    } catch (ssdpError) {
      health.services.ssdp = {
        status: 'degraded',
        error: ssdpError.message,
        timestamp: new Date().toISOString()
      };
    }

    // Check EPG service
    try {
      const epgService = require('../services/epgService');
      if (epgService && epgService.getStatus) {
        const epgStatus = await epgService.getStatus();
        health.services.epg = {
          status: epgStatus.isInitialized ? 'healthy' : 'stopped',
          lastRefresh: epgStatus.lastRefresh,
          nextRefresh: epgStatus.nextRefresh,
          sources: epgStatus.sources ? epgStatus.sources.length : 0,
          timestamp: new Date().toISOString()
        };
      } else {
        health.services.epg = {
          status: 'stopped',
          timestamp: new Date().toISOString()
        };
      }
    } catch (epgError) {
      health.services.epg = {
        status: 'degraded',
        error: epgError.message,
        timestamp: new Date().toISOString()
      };
    }

    // Check streaming service
    try {
      const streamManager = require('../services/streamManager');
      if (streamManager && streamManager.getActiveStreams) {
        const activeStreams = streamManager.getActiveStreams();
        health.services.streaming = {
          status: 'healthy',
          activeStreams: activeStreams.length,
          timestamp: new Date().toISOString()
        };
      } else {
        health.services.streaming = {
          status: 'healthy',
          activeStreams: 0,
          timestamp: new Date().toISOString()
        };
      }
    } catch (streamError) {
      health.services.streaming = {
        status: 'degraded',
        error: streamError.message,
        timestamp: new Date().toISOString()
      };
    }

    // Calculate response time
    health.responseTime = Date.now() - startTime;

    // Determine overall health status
    const unhealthyServices = Object.values(health.services).filter(s => s.status === 'unhealthy');
    const degradedServices = Object.values(health.services).filter(s => s.status === 'degraded');
    
    if (unhealthyServices.length > 0) {
      health.status = 'unhealthy';
      res.status(503);
    } else if (degradedServices.length > 0) {
      health.status = 'degraded';
      res.status(200);
    } else {
      health.status = 'healthy';
      res.status(200);
    }

    res.json(health);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime
    });
  }
});

// Simple liveness check (for container orchestration)
router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Readiness check (checks if app is ready to serve traffic)
router.get('/health/ready', async (req, res) => {
  try {
    // Quick database check
    const dbHealth = await database.healthCheck();
    if (dbHealth.status === 'healthy') {
      res.status(200).json({ 
        status: 'ready', 
        timestamp: new Date().toISOString() 
      });
    } else {
      res.status(503).json({ 
        status: 'not_ready', 
        reason: 'database_unhealthy',
        timestamp: new Date().toISOString() 
      });
    }
  } catch (error) {
    res.status(503).json({ 
      status: 'not_ready', 
      error: error.message,
      timestamp: new Date().toISOString() 
    });
  }
});

// Serve favicon for health page
router.get('/favicon.svg', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/build/favicon.svg'));
});

module.exports = router;