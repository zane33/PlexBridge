/**
 * Real-time Type 5 Monitoring Routes
 * 
 * Provides endpoints for monitoring and debugging type 5 metadata issues in real-time
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { validateAndCorrectMetadata, validateForWebClient } = require('../utils/metadataTypeValidator');
const { getClientType, isWebClient } = require('../utils/webClientDetector');

// Store recent type 5 detection events
const recentType5Events = [];
const MAX_EVENTS = 100;

/**
 * Add event to monitoring history
 */
function recordType5Event(event) {
  recentType5Events.push({
    timestamp: new Date().toISOString(),
    ...event
  });
  
  // Keep only recent events
  if (recentType5Events.length > MAX_EVENTS) {
    recentType5Events.shift();
  }
}

/**
 * Live monitoring endpoint for type 5 issues
 */
router.get('/monitor', (req, res) => {
  const isWebClientRequest = isWebClient(req);
  const clientType = getClientType(req);
  
  const report = {
    timestamp: new Date().toISOString(),
    status: 'monitoring',
    clientType,
    isWebClient: isWebClientRequest,
    recentEvents: recentType5Events.slice(-20), // Last 20 events
    monitoring: {
      globalValidationActive: true,
      webClientProtectionActive: isWebClientRequest,
      totalEventsRecorded: recentType5Events.length
    },
    userAgent: req.get('User-Agent'),
    path: req.path
  };
  
  logger.info('Type 5 monitoring report requested', {
    clientType,
    userAgent: req.get('User-Agent')?.substring(0, 100),
    eventCount: recentType5Events.length
  });
  
  res.json(report);
});

/**
 * Test endpoint that deliberately creates type 5 metadata for testing validation
 */
router.get('/test-validation', (req, res) => {
  const clientType = getClientType(req);
  
  // Create test data with type 5 issues
  const testMetadata = {
    type: 5,  // FORBIDDEN for Live TV
    contentType: 5,  // FORBIDDEN 
    content_type: 5,  // Alternative field
    mediaType: 'trailer',  // FORBIDDEN for Live TV
    title: 'Test Channel',
    Video: [{
      type: 5,  // Nested type 5
      Media: [{
        type: 5  // Deeply nested type 5
      }]
    }],
    MediaContainer: {
      type: 5,
      contentType: 5
    }
  };
  
  logger.warn('TEST VALIDATION: Intentionally created type 5 metadata for validation testing', {
    clientType,
    path: req.path,
    originalMetadata: testMetadata
  });
  
  // Record this test event
  recordType5Event({
    type: 'validation_test',
    clientType,
    path: req.path,
    originalType5Count: 7,  // Count of type 5 issues in test data
    userAgent: req.get('User-Agent')?.substring(0, 100)
  });
  
  // Let the global validation middleware handle this
  // If working correctly, all type 5 values should be converted
  res.json(testMetadata);
});

/**
 * Clear monitoring history
 */
router.delete('/monitor/clear', (req, res) => {
  const eventCount = recentType5Events.length;
  recentType5Events.length = 0;
  
  logger.info('Type 5 monitoring history cleared', {
    clearedEventCount: eventCount,
    userAgent: req.get('User-Agent')?.substring(0, 100)
  });
  
  res.json({
    status: 'cleared',
    clearedEvents: eventCount,
    timestamp: new Date().toISOString()
  });
});

/**
 * Get validation statistics
 */
router.get('/stats', (req, res) => {
  const clientType = getClientType(req);
  
  const stats = {
    timestamp: new Date().toISOString(),
    clientType,
    events: {
      total: recentType5Events.length,
      webClient: recentType5Events.filter(e => e.clientType === 'web').length,
      androidTV: recentType5Events.filter(e => e.clientType === 'android-tv').length,
      native: recentType5Events.filter(e => e.clientType === 'native').length
    },
    recentActivity: recentType5Events.slice(-10)
  };
  
  res.json(stats);
});

// Export the recording function for use by validation middleware
router.recordType5Event = recordType5Event;

module.exports = router;