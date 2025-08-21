const express = require('express');
const router = express.Router();
const database = require('../services/database');
const cacheService = require('../services/cacheService');
const streamManager = require('../services/streamManager');
const epgService = require('../services/epgService');
const settingsService = require('../services/settingsService');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Input validation schemas
const channelSchema = Joi.object({
  name: Joi.string().required().max(255),
  number: Joi.number().integer().min(1).max(9999).required(),
  enabled: Joi.boolean().default(true),
  logo: Joi.string().allow(null, '').max(500).default(null),
  epg_id: Joi.string().allow(null, '').max(255).default(null)
});

const streamSchema = Joi.object({
  channel_id: Joi.string().required(),
  name: Joi.string().required().max(255),
  url: Joi.string().uri().required(),
  type: Joi.string().valid('hls', 'dash', 'rtsp', 'rtmp', 'udp', 'http', 'mms', 'srt').required(),
  backup_urls: Joi.array().items(Joi.string().uri()).default([]),
  auth_username: Joi.string().allow(null).max(255),
  auth_password: Joi.string().allow(null).max(255),
  headers: Joi.object().default({}),
  protocol_options: Joi.object().default({}),
  enabled: Joi.boolean().default(true)
});

const epgSourceSchema = Joi.object({
  name: Joi.string().required().max(255),
  url: Joi.string().uri().required(),
  refresh_interval: Joi.string().pattern(/^\d+[hmd]$/).default('4h'),
  enabled: Joi.boolean().default(true)
});

// Settings validation schemas
const plexliveSettingsSchema = Joi.object({
  ssdp: Joi.object({
    enabled: Joi.boolean().default(true),
    discoverableInterval: Joi.number().integer().min(5000).max(300000).default(30000),
    announceInterval: Joi.number().integer().min(300000).max(7200000).default(1800000),
    multicastAddress: Joi.string().ip({ version: ['ipv4'] }).default('239.255.255.250'),
    deviceDescription: Joi.string().max(255).default('IPTV to Plex Bridge Interface')
  }).default(),
  streaming: Joi.object({
    maxConcurrentStreams: Joi.number().integer().min(1).max(100).default(10),
    streamTimeout: Joi.number().integer().min(5000).max(300000).default(30000),
    reconnectAttempts: Joi.number().integer().min(0).max(10).default(3),
    bufferSize: Joi.number().integer().min(1024).max(1048576).default(65536),
    adaptiveBitrate: Joi.boolean().default(true),
    preferredProtocol: Joi.string().valid('hls', 'dash', 'rtsp', 'rtmp', 'udp', 'http').default('hls')
  }).default(),
  transcoding: Joi.object({
    enabled: Joi.boolean().default(true),
    hardwareAcceleration: Joi.boolean().default(false),
    preset: Joi.string().valid('ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow').default('medium'),
    videoCodec: Joi.string().valid('h264', 'h265', 'vp8', 'vp9', 'av1').default('h264'),
    audioCodec: Joi.string().valid('aac', 'mp3', 'ac3', 'opus').default('aac'),
    qualityProfiles: Joi.object({
      low: Joi.object({
        resolution: Joi.string().pattern(/^\d+x\d+$/).default('720x480'),
        bitrate: Joi.string().pattern(/^\d+k$/).default('1000k')
      }),
      medium: Joi.object({
        resolution: Joi.string().pattern(/^\d+x\d+$/).default('1280x720'),
        bitrate: Joi.string().pattern(/^\d+k$/).default('2500k')
      }),
      high: Joi.object({
        resolution: Joi.string().pattern(/^\d+x\d+$/).default('1920x1080'),
        bitrate: Joi.string().pattern(/^\d+k$/).default('5000k')
      })
    }).default(),
    defaultProfile: Joi.string().valid('low', 'medium', 'high').default('medium')
  }).default(),
  caching: Joi.object({
    enabled: Joi.boolean().default(true),
    duration: Joi.number().integer().min(300).max(86400).default(3600),
    maxSize: Joi.number().integer().min(104857600).max(107374182400).default(1073741824), // 100MB to 100GB
    cleanup: Joi.object({
      enabled: Joi.boolean().default(true),
      interval: Joi.number().integer().min(300000).max(86400000).default(3600000), // 5 min to 24 hours
      maxAge: Joi.number().integer().min(3600000).max(604800000).default(86400000) // 1 hour to 7 days
    }).default()
  }).default(),
  device: Joi.object({
    name: Joi.string().max(255).default('PlexTV'),
    id: Joi.string().alphanum().max(50).default('PLEXTV001'),
    tunerCount: Joi.number().integer().min(1).max(32).default(4),
    firmware: Joi.string().pattern(/^\d+\.\d+\.\d+$/).default('1.0.0'),
    baseUrl: Joi.string().uri().default('http://localhost:8080')
  }).default(),
  network: Joi.object({
    bindAddress: Joi.string().ip().default('0.0.0.0'),
    advertisedHost: Joi.string().hostname().allow(null).default(null),
    streamingPort: Joi.number().integer().min(1024).max(65535).default(8080),
    discoveryPort: Joi.number().integer().min(1024).max(65535).default(1900),
    ipv6Enabled: Joi.boolean().default(false)
  }).default(),
  compatibility: Joi.object({
    hdHomeRunMode: Joi.boolean().default(true),
    plexPassRequired: Joi.boolean().default(false),
    gracePeriod: Joi.number().integer().min(1000).max(60000).default(10000),
    channelLogoFallback: Joi.boolean().default(true)
  }).default(),
  localization: Joi.object({
    timezone: Joi.string().default('UTC'),
    locale: Joi.string().pattern(/^[a-z]{2}(-[A-Z]{2})?$/).default('en-US'),
    dateFormat: Joi.string().valid('YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'DD.MM.YYYY').default('YYYY-MM-DD'),
    timeFormat: Joi.string().valid('12h', '24h').default('24h'),
    firstDayOfWeek: Joi.number().integer().min(0).max(6).default(1)
  }).default()
}).default();

const settingsSchema = Joi.object({
  plexlive: plexliveSettingsSchema
});

// Middleware for input validation
const validate = (schema) => {
  return (req, res, next) => {
    console.log('Validating request body:', req.body);
    const { error, value } = schema.validate(req.body);
    if (error) {
      console.log('Validation failed:', error.details.map(d => d.message));
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    console.log('Validation successful, validated body:', value);
    req.validatedBody = value;
    next();
  };
};

// CHANNELS API
router.get('/channels', async (req, res) => {
  try {
    // Check if database is initialized
    if (!database || !database.isInitialized) {
      logger.info('Database not initialized, returning empty channels array');
      return res.json([]); // Return empty array if database not initialized
    }

    const channels = await database.all(`
      SELECT c.*, 
             COUNT(s.id) as stream_count,
             MAX(s.enabled) as has_active_stream
      FROM channels c 
      LEFT JOIN streams s ON c.id = s.channel_id 
      GROUP BY c.id 
      ORDER BY c.number
    `);

    res.json(channels);
  } catch (error) {
    logger.error('Channels list error:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

router.get('/channels/:id', async (req, res) => {
  try {
    const channel = await database.get(`
      SELECT c.*, 
             COUNT(s.id) as stream_count
      FROM channels c 
      LEFT JOIN streams s ON c.id = s.channel_id 
      WHERE c.id = ?
      GROUP BY c.id
    `, [req.params.id]);

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Get streams for this channel
    const streams = await database.all('SELECT * FROM streams WHERE channel_id = ?', [req.params.id]);
    channel.streams = streams;

    res.json(channel);
  } catch (error) {
    logger.error('Channel get error:', error);
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

router.post('/channels', validate(channelSchema), async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.validatedBody;
    
    // Ensure proper null handling for SQLite
    const sqlParams = [
      id, 
      data.name, 
      data.number, 
      data.enabled ? 1 : 0,  // Convert boolean to integer for SQLite
      data.logo && data.logo.trim() ? data.logo.trim() : null,     // Convert empty strings to null
      data.epg_id && data.epg_id.trim() ? data.epg_id.trim() : null // Convert empty strings to null
    ];
    
    console.log('Creating channel with data:', data);
    console.log('SQL parameters:', sqlParams);
    console.log('Parameter types:', sqlParams.map(p => typeof p));

    await database.run(`
      INSERT INTO channels (id, name, number, enabled, logo, epg_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, sqlParams);

    const channel = await database.get('SELECT * FROM channels WHERE id = ?', [id]);
    
    // Clear channel lineup cache
    await cacheService.del('lineup:channels');
    
    logger.info('Channel created', { id, name: data.name, number: data.number });
    res.status(201).json(channel);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Channel number already exists' });
    } else {
      logger.error('Channel create error:', error);
      res.status(500).json({ error: 'Failed to create channel' });
    }
  }
});

// Bulk update channels (for drag-and-drop reordering) - MUST BE BEFORE /:id route
router.put('/channels/bulk-update', async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates array is required' });
    }

    // Validate updates
    for (const update of updates) {
      if (!update.id || typeof update.number !== 'number') {
        return res.status(400).json({ error: 'Each update must have id and number fields' });
      }
      if (update.number < 1 || update.number > 9999) {
        return res.status(400).json({ error: 'Channel number must be between 1 and 9999' });
      }
    }

    // Check for duplicate channel numbers
    const numbers = updates.map(u => u.number);
    const uniqueNumbers = new Set(numbers);
    if (numbers.length !== uniqueNumbers.size) {
      return res.status(400).json({ error: 'Duplicate channel numbers detected in updates' });
    }

    // Begin transaction for bulk update
    await database.run('BEGIN TRANSACTION');
    
    try {
      let updatedCount = 0;
      
      for (const update of updates) {
        const result = await database.run(
          'UPDATE channels SET number = ? WHERE id = ?',
          [update.number, update.id]
        );
        
        if (result.changes > 0) {
          updatedCount++;
        }
      }
      
      await database.run('COMMIT');
      
      // Clear channel lineup cache
      await cacheService.del('lineup:channels');
      
      logger.info('Bulk channel update completed', { 
        updatedCount, 
        totalRequested: updates.length,
        updateDetails: updates.map(u => ({ id: u.id, number: u.number }))
      });
      
      res.json({ 
        message: 'Channels updated successfully',
        updatedCount,
        totalRequested: updates.length
      });
      
    } catch (transactionError) {
      await database.run('ROLLBACK');
      throw transactionError;
    }
    
  } catch (error) {
    logger.error('Bulk channel update error:', error);
    res.status(500).json({ error: 'Failed to update channels' });
  }
});

router.put('/channels/:id', validate(channelSchema), async (req, res) => {
  try {
    const data = req.validatedBody;
    
    const result = await database.run(`
      UPDATE channels 
      SET name = ?, number = ?, enabled = ?, logo = ?, epg_id = ?
      WHERE id = ?
    `, [
      data.name, 
      data.number, 
      data.enabled ? 1 : 0, // Convert boolean to integer for SQLite
      data.logo && data.logo.trim() ? data.logo.trim() : null, // Convert empty string to null
      data.epg_id && data.epg_id.trim() ? data.epg_id.trim() : null, // Convert empty string to null
      req.params.id
    ]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const channel = await database.get('SELECT * FROM channels WHERE id = ?', [req.params.id]);
    
    // Clear channel lineup cache
    await cacheService.del('lineup:channels');
    
    logger.info('Channel updated', { id: req.params.id, name: data.name });
    res.json(channel);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Channel number already exists' });
    } else {
      logger.error('Channel update error:', { 
        error: error.message, 
        stack: error.stack,
        channelId: req.params.id,
        requestBody: req.body,
        validatedData: req.validatedBody
      });
      res.status(500).json({ 
        error: 'Failed to update channel',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
});

router.delete('/channels/:id', async (req, res) => {
  try {
    const result = await database.run('DELETE FROM channels WHERE id = ?', [req.params.id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Clear channel lineup cache
    await cacheService.del('lineup:channels');
    
    logger.info('Channel deleted', { id: req.params.id });
    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    logger.error('Channel delete error:', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// STREAMS API
router.get('/streams', async (req, res) => {
  try {
    // Check if database is initialized
    if (!database || !database.isInitialized) {
      logger.info('Database not initialized, returning empty streams array');
      return res.json([]); // Return empty array if database not initialized
    }

    const streams = await database.all(`
      SELECT s.*, c.name as channel_name, c.number as channel_number
      FROM streams s
      LEFT JOIN channels c ON s.channel_id = c.id
      ORDER BY c.number, s.name
    `);

    res.json(streams);
  } catch (error) {
    logger.error('Streams list error:', error);
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});

router.get('/streams/:id', async (req, res) => {
  try {
    const stream = await database.get(`
      SELECT s.*, c.name as channel_name, c.number as channel_number
      FROM streams s
      LEFT JOIN channels c ON s.channel_id = c.id
      WHERE s.id = ?
    `, [req.params.id]);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Parse JSON fields
    if (stream.backup_urls) {
      stream.backup_urls = JSON.parse(stream.backup_urls);
    }
    if (stream.headers) {
      stream.headers = JSON.parse(stream.headers);
    }
    if (stream.protocol_options) {
      stream.protocol_options = JSON.parse(stream.protocol_options);
    }

    res.json(stream);
  } catch (error) {
    logger.error('Stream get error:', error);
    res.status(500).json({ error: 'Failed to fetch stream' });
  }
});

router.post('/streams', validate(streamSchema), async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.validatedBody;

    await database.run(`
      INSERT INTO streams (id, channel_id, name, url, type, backup_urls, auth_username, auth_password, headers, protocol_options, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      data.channel_id,
      data.name,
      data.url,
      data.type,
      JSON.stringify(data.backup_urls),
      data.auth_username,
      data.auth_password,
      JSON.stringify(data.headers),
      JSON.stringify(data.protocol_options),
      data.enabled
    ]);

    const stream = await database.get('SELECT * FROM streams WHERE id = ?', [id]);
    
    logger.info('Stream created', { id, name: data.name, url: data.url });
    res.status(201).json(stream);
  } catch (error) {
    logger.error('Stream create error:', error);
    res.status(500).json({ error: 'Failed to create stream' });
  }
});

router.put('/streams/:id', validate(streamSchema), async (req, res) => {
  try {
    const data = req.validatedBody;
    
    const result = await database.run(`
      UPDATE streams 
      SET channel_id = ?, name = ?, url = ?, type = ?, backup_urls = ?, 
          auth_username = ?, auth_password = ?, headers = ?, protocol_options = ?, enabled = ?
      WHERE id = ?
    `, [
      data.channel_id,
      data.name,
      data.url,
      data.type,
      JSON.stringify(data.backup_urls),
      data.auth_username,
      data.auth_password,
      JSON.stringify(data.headers),
      JSON.stringify(data.protocol_options),
      data.enabled,
      req.params.id
    ]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const stream = await database.get('SELECT * FROM streams WHERE id = ?', [req.params.id]);
    
    // Clear stream cache
    await cacheService.del(`stream:${req.params.id}`);
    
    logger.info('Stream updated', { id: req.params.id, name: data.name });
    res.json(stream);
  } catch (error) {
    logger.error('Stream update error:', error);
    res.status(500).json({ error: 'Failed to update stream' });
  }
});

router.delete('/streams/:id', async (req, res) => {
  try {
    const result = await database.run('DELETE FROM streams WHERE id = ?', [req.params.id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Clear stream cache
    await cacheService.del(`stream:${req.params.id}`);
    
    logger.info('Stream deleted', { id: req.params.id });
    res.json({ message: 'Stream deleted successfully' });
  } catch (error) {
    logger.error('Stream delete error:', error);
    res.status(500).json({ error: 'Failed to delete stream' });
  }
});

// M3U playlist import endpoint with enhanced functionality
router.post('/streams/import', async (req, res) => {
  const requestStart = Date.now();
  
  try {
    logger.info('M3U import request received', { 
      clientIP: req.ip,
      userAgent: req.get('User-Agent'),
      hasUrl: !!req.body.url
    });

    // Use the new M3U import service
    const M3UImportService = require('../services/m3uImportService');
    const importService = new M3UImportService();
    
    const result = await importService.importPlaylist(req.body);
    
    const duration = Date.now() - requestStart;
    
    if (result.success) {
      // Log successful import
      logger.info('M3U import completed successfully', {
        source: result.source,
        duration,
        type: result.type,
        channelsProcessed: result.channelsCreated || result.channelsToImport || 0,
        clientIP: req.ip
      });

      res.json(result);
    } else {
      // Log failed import
      logger.warn('M3U import failed', {
        source: result.source,
        duration,
        error: result.error,
        clientIP: req.ip
      });

      res.status(400).json({
        error: result.error,
        source: result.source,
        duration
      });
    }

  } catch (error) {
    const duration = Date.now() - requestStart;
    logger.error('M3U import endpoint error', {
      error: error.message,
      stack: error.stack,
      duration,
      clientIP: req.ip
    });

    res.status(500).json({
      error: 'Internal server error during M3U import',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Import failed',
      duration
    });
  }
});

// M3U URL validation endpoint
router.post('/streams/validate-m3u', async (req, res) => {
  try {
    const { url, auth_username, auth_password, headers } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    logger.info('M3U URL validation requested', { url, hasAuth: !!auth_username });

    const M3UImportService = require('../services/m3uImportService');
    const importService = new M3UImportService();
    
    const validation = await importService.validateM3UUrl(url);
    
    res.json(validation);

  } catch (error) {
    logger.error('M3U URL validation error', { error: error.message });
    res.status(500).json({ error: 'Validation failed' });
  }
});

// M3U statistics endpoint (preview without importing)
router.post('/streams/m3u-stats', async (req, res) => {
  try {
    const { url, auth_username, auth_password, headers } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    logger.info('M3U statistics requested', { url, hasAuth: !!auth_username });

    const M3UImportService = require('../services/m3uImportService');
    const importService = new M3UImportService();
    
    const stats = await importService.getImportStatistics(url, {
      auth_username,
      auth_password,
      headers
    });
    
    res.json(stats);

  } catch (error) {
    logger.error('M3U statistics error', { error: error.message });
    res.status(500).json({ error: 'Failed to get M3U statistics' });
  }
});

// Legacy stream source parser (deprecated - use M3UImportService instead)
// Kept for backward compatibility, redirects to new service
async function parseStreamSource(url, type, auth = {}) {
  logger.warn('Using deprecated parseStreamSource function, consider using M3UImportService', { url });
  
  try {
    const M3UImportService = require('../services/m3uImportService');
    const importService = new M3UImportService();
    
    const result = await importService.getImportStatistics(url, {
      auth_username: auth.auth_username,
      auth_password: auth.auth_password
    });
    
    if (result.success && result.sampleChannels) {
      return result.sampleChannels.map(ch => ({
        name: ch.name,
        number: ch.number,
        url: url, // Simplified for legacy compatibility
        type: ch.type,
        logo: ch.hasLogo ? 'placeholder' : null,
        epg_id: ch.hasEpgId ? 'placeholder' : null,
        group: ch.group
      }));
    }
    
    return [];
  } catch (error) {
    logger.error('Legacy stream source parsing failed:', { url, error: error.message });
    throw error;
  }
}

// EPG API
router.get('/epg', async (req, res) => {
  try {
    const { start, end, channel_id } = req.query;
    
    const startTime = start || new Date().toISOString();
    const endTime = end || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    let programs;
    if (channel_id) {
      programs = await epgService.getEPGData(channel_id, startTime, endTime);
    } else {
      programs = await epgService.getAllEPGData(startTime, endTime);
    }

    res.json({
      start: startTime,
      end: endTime,
      programs
    });
  } catch (error) {
    logger.error('EPG get error:', error);
    res.status(500).json({ error: 'Failed to fetch EPG data' });
  }
});

router.post('/epg/refresh', async (req, res) => {
  try {
    const { source_id, force_initialize = false } = req.body;
    
    // Force EPG service initialization if requested
    if (force_initialize && !epgService.isInitialized) {
      logger.info('Force initializing EPG service');
      await epgService.initialize();
    }
    
    if (source_id) {
      await epgService.forceRefresh(source_id);
      res.json({ 
        message: `EPG refresh started for source ${source_id}`,
        initialized: epgService.isInitialized
      });
    } else {
      const sources = await database.all('SELECT id FROM epg_sources WHERE enabled = 1');
      for (const source of sources) {
        epgService.forceRefresh(source.id);
      }
      res.json({ 
        message: 'EPG refresh started for all sources',
        sourceCount: sources.length,
        initialized: epgService.isInitialized
      });
    }
  } catch (error) {
    logger.error('EPG refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh EPG' });
  }
});

// EPG Service initialization endpoint
router.post('/epg/initialize', async (req, res) => {
  try {
    logger.info('Manual EPG service initialization requested');
    
    if (epgService.isInitialized) {
      return res.json({ 
        message: 'EPG service already initialized',
        isInitialized: true,
        timestamp: new Date().toISOString()
      });
    }
    
    await epgService.initialize();
    
    res.json({ 
      message: 'EPG service initialized successfully',
      isInitialized: epgService.isInitialized,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('EPG initialization error:', error);
    res.status(500).json({ 
      error: 'Failed to initialize EPG service',
      message: error.message
    });
  }
});

router.get('/epg/sources', async (req, res) => {
  try {
    // Always return JSON content-type header
    res.setHeader('Content-Type', 'application/json');
    
    // Check if database is initialized
    if (!database || !database.isInitialized) {
      logger.info('Database not initialized, returning empty EPG sources array');
      return res.status(200).json([]); // Return empty array if database not initialized
    }

    const sources = await database.all('SELECT * FROM epg_sources ORDER BY name');
    const safeResponse = Array.isArray(sources) ? sources : [];
    
    res.status(200).json(safeResponse);
  } catch (error) {
    logger.error('EPG sources error:', error);
    
    // Always return JSON, never fallback to HTML
    res.status(200).json({
      error: 'Failed to fetch EPG sources',
      message: error.message,
      sources: [],
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/epg/sources', validate(epgSourceSchema), async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.validatedBody;

    await epgService.addSource({ id, ...data });
    
    const source = await database.get('SELECT * FROM epg_sources WHERE id = ?', [id]);
    
    logger.info('EPG source created', { id, name: data.name, url: data.url });
    res.status(201).json(source);
  } catch (error) {
    logger.error('EPG source create error:', error);
    res.status(500).json({ error: 'Failed to create EPG source' });
  }
});

router.put('/epg/sources/:id', validate(epgSourceSchema), async (req, res) => {
  try {
    const data = req.validatedBody;
    
    const result = await database.run(`
      UPDATE epg_sources 
      SET name = ?, url = ?, refresh_interval = ?, enabled = ?
      WHERE id = ?
    `, [data.name, data.url, data.refresh_interval, data.enabled, req.params.id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'EPG source not found' });
    }

    const source = await database.get('SELECT * FROM epg_sources WHERE id = ?', [req.params.id]);
    
    logger.info('EPG source updated', { id: req.params.id, name: data.name });
    res.json(source);
  } catch (error) {
    logger.error('EPG source update error:', error);
    res.status(500).json({ error: 'Failed to update EPG source' });
  }
});

// Get all available EPG channels across all sources
router.get('/epg/channels', async (req, res) => {
  try {
    // Always return JSON content-type header
    res.setHeader('Content-Type', 'application/json');
    
    // Check if database is initialized
    if (!database || !database.isInitialized) {
      logger.info('Database not initialized, returning empty EPG channels');
      return res.status(200).json({ available_channels: [] }); // Return empty array if database not initialized
    }

    // Get all EPG channels with display names from all sources
    // FIXED: Correct mapping between EPG channels and programs via epg_id
    const availableChannels = await database.all(`
      SELECT 
        ec.epg_id,
        ec.display_name as channel_name,
        ec.icon_url,
        ec.source_id,
        es.name as source_name,
        COALESCE(program_counts.program_count, 0) as program_count
      FROM epg_channels ec
      LEFT JOIN epg_sources es ON ec.source_id = es.id
      LEFT JOIN (
        SELECT 
          ep.channel_id as epg_id,
          COUNT(ep.id) as program_count
        FROM epg_programs ep
        WHERE ep.channel_id IS NOT NULL
        GROUP BY ep.channel_id
      ) program_counts ON ec.epg_id = program_counts.epg_id
      WHERE es.enabled = 1
      ORDER BY ec.display_name
    `);

    // Ensure we have an array
    const safeChannels = Array.isArray(availableChannels) ? availableChannels : [];

    // Format response with proper display names
    const channelsWithNames = safeChannels.map(ch => ({
      epg_id: ch.epg_id,
      program_count: ch.program_count || 0,
      channel_name: ch.channel_name || ch.epg_id, // Fallback to epg_id if no display name
      icon_url: ch.icon_url,
      source_name: ch.source_name,
      source_id: ch.source_id
    }));

    res.status(200).json({
      available_channels: channelsWithNames
    });
  } catch (error) {
    logger.error('EPG channels error:', error);
    
    // Always return JSON response with safe structure
    res.status(200).json({ 
      available_channels: [],
      error: error.message || 'Failed to fetch EPG channels',
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/epg/sources/:id/channels', async (req, res) => {
  try {
    // Get EPG channels with display names from the source
    // FIXED: Correct mapping between EPG channels and programs via epg_id
    const availableChannels = await database.all(`
      SELECT 
        ec.epg_id,
        ec.display_name as channel_name,
        ec.icon_url,
        COALESCE(program_counts.program_count, 0) as program_count
      FROM epg_channels ec
      LEFT JOIN (
        SELECT 
          ep.channel_id as epg_id,
          COUNT(ep.id) as program_count
        FROM epg_programs ep
        WHERE ep.channel_id IS NOT NULL
        GROUP BY ep.channel_id
      ) program_counts ON ec.epg_id = program_counts.epg_id
      WHERE ec.source_id = ?
      ORDER BY ec.display_name
    `, [req.params.id]);

    // If no EPG channels found for this source, fall back to channel IDs from programs
    if (availableChannels.length === 0) {
      const fallbackChannels = await database.all(`
        SELECT DISTINCT 
          channel_id as epg_id,
          COUNT(*) as program_count,
          MIN(title) as sample_program
        FROM epg_programs
        WHERE channel_id IS NOT NULL
        GROUP BY channel_id
        ORDER BY program_count DESC
        LIMIT 100
      `);

      const channelsWithFallbackNames = fallbackChannels.map(ch => {
        // Create a readable name using sample program and short ID
        const shortId = ch.epg_id.split('-').pop().substring(0, 8);
        const sampleProgram = ch.sample_program || 'Unknown';
        const displayName = `${sampleProgram} (${shortId})`;
        
        return {
          epg_id: ch.epg_id,
          program_count: ch.program_count,
          channel_name: displayName,
          sample_program: ch.sample_program
        };
      });

      return res.json({
        source_id: req.params.id,
        available_channels: channelsWithFallbackNames
      });
    }

    // Format response with proper display names
    const channelsWithNames = availableChannels.map(ch => ({
      epg_id: ch.epg_id,
      program_count: ch.program_count,
      channel_name: ch.channel_name || ch.epg_id, // Fallback to epg_id if no display name
      icon_url: ch.icon_url
    }));

    res.json({
      source_id: req.params.id,
      available_channels: channelsWithNames
    });
  } catch (error) {
    console.error('EPG source channels error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch EPG source channels' });
  }
});

// Debug EPG parsing endpoint
router.post('/epg/debug-parse/:id', async (req, res) => {
  try {
    const sourceId = req.params.id;
    const source = await database.get('SELECT * FROM epg_sources WHERE id = ? AND enabled = 1', [sourceId]);
    
    if (!source) {
      return res.status(404).json({ error: 'EPG source not found' });
    }

    // Download and parse EPG data manually for debugging
    const epgService = require('../services/epgService');
    const epgData = await epgService.downloadEPG(source);
    const programs = await epgService.parseEPG(epgData, sourceId);
    
    res.json({
      source: {
        id: source.id,
        name: source.name,
        url: source.url
      },
      parsing_results: {
        xmlSize: epgData.length,
        totalProgramsParsed: programs.length,
        samplePrograms: programs.slice(0, 5).map(p => ({
          id: p.id,
          channel_id: p.channel_id,
          title: p.title,
          start_time: p.start_time,
          end_time: p.end_time
        }))
      }
    });
  } catch (error) {
    logger.error('EPG debug parse error:', error);
    res.status(500).json({ 
      error: 'EPG debug parse failed',
      details: error.message
    });
  }
});

// Refresh a specific EPG source
router.post('/epg/sources/:id/refresh', async (req, res) => {
  try {
    const sourceId = req.params.id;
    
    logger.info('Manual EPG refresh requested', { sourceId });
    
    // FOR DEBUGGING: Run synchronously to capture results  
    try {
      // Get the source details
      const source = await database.get('SELECT * FROM epg_sources WHERE id = ? AND enabled = 1', [sourceId]);
      
      if (!source) {
        return res.status(404).json({ error: 'EPG source not found' });
      }

      // Download and parse EPG data manually for debugging
      const epgData = await epgService.downloadEPG(source);
      const programs = await epgService.parseEPG(epgData, sourceId);
      
      // Store programs manually 
      await epgService.storePrograms(programs);
      
      // Check final results
      const programCount = await database.get('SELECT COUNT(*) as count FROM epg_programs');
      const channelCount = await database.get('SELECT COUNT(*) as count FROM epg_channels WHERE source_id = ?', [sourceId]);
      
      res.json({ 
        message: 'EPG refresh completed successfully',
        sourceId,
        debug: {
          xmlSize: epgData.length,
          programsParsed: programs.length,
          samplePrograms: programs.slice(0, 3).map(p => ({
            id: p.id,
            channel_id: p.channel_id,
            title: p.title,
            start_time: p.start_time
          }))
        },
        results: {
          totalPrograms: programCount?.count || 0,
          channelsForSource: channelCount?.count || 0
        }
      });
    } catch (refreshError) {
      logger.error('EPG refresh failed:', refreshError);
      res.status(500).json({ 
        error: 'EPG refresh failed',
        details: refreshError.message,
        sourceId
      });
    }
  } catch (error) {
    logger.error('EPG refresh initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate EPG refresh' });
  }
});

router.delete('/epg/sources/:id', async (req, res) => {
  try {
    await epgService.removeSource(req.params.id);
    
    logger.info('EPG source deleted', { id: req.params.id });
    res.json({ message: 'EPG source deleted successfully' });
  } catch (error) {
    logger.error('EPG source delete error:', error);
    res.status(500).json({ error: 'Failed to delete EPG source' });
  }
});

// Get all EPG programs
router.get('/epg/programs', async (req, res) => {
  try {
    // Always return JSON content-type header
    res.setHeader('Content-Type', 'application/json');
    
    // Check if database is initialized
    if (!database || !database.isInitialized) {
      logger.info('Database not initialized, returning empty EPG programs');
      return res.status(200).json([]); // Return empty array if database not initialized
    }

    const { channel_id, start_time, end_time, limit = 1000 } = req.query;
    
    let query = `
      SELECT 
        p.*,
        ec.display_name as channel_name,
        es.name as source_name
      FROM epg_programs p
      LEFT JOIN epg_channels ec ON p.channel_id = ec.epg_id
      LEFT JOIN epg_sources es ON ec.source_id = es.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (channel_id) {
      conditions.push('p.channel_id = ?');
      params.push(channel_id);
    }
    
    if (start_time) {
      conditions.push('p.start_time >= ?');
      params.push(start_time);
    }
    
    if (end_time) {
      conditions.push('p.end_time <= ?');
      params.push(end_time);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY p.start_time ASC LIMIT ?';
    params.push(parseInt(limit));
    
    const programs = await database.all(query, params);
    const safePrograms = Array.isArray(programs) ? programs : [];
    
    res.status(200).json(safePrograms);
  } catch (error) {
    logger.error('EPG programs error:', error);
    
    // Always return JSON array, never 500 error
    res.status(200).json({
      programs: [],
      error: error.message || 'Failed to fetch EPG programs',
      timestamp: new Date().toISOString()
    });
  }
});

// EPG Mapping suggestions endpoint
router.get('/epg/mapping-suggestions', async (req, res) => {
  try {
    // Get unmapped channels
    const unmappedChannels = await database.all(`
      SELECT id, name, number, epg_id 
      FROM channels 
      WHERE epg_id IS NULL OR epg_id = '' OR epg_id NOT IN (
        SELECT DISTINCT epg_id FROM epg_channels
      )
      ORDER BY number
    `);

    // Get available EPG channels that aren't mapped
    const availableEpgChannels = await database.all(`
      SELECT 
        ec.epg_id,
        ec.display_name,
        ec.source_id,
        es.name as source_name,
        COALESCE(pc.program_count, 0) as program_count
      FROM epg_channels ec
      LEFT JOIN epg_sources es ON ec.source_id = es.id
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as program_count
        FROM epg_programs
        GROUP BY channel_id
      ) pc ON ec.epg_id = pc.channel_id
      WHERE ec.epg_id NOT IN (
        SELECT DISTINCT epg_id FROM channels WHERE epg_id IS NOT NULL AND epg_id != ''
      )
      ORDER BY ec.display_name
    `);

    // Generate smart mapping suggestions
    const suggestions = [];
    for (const channel of unmappedChannels) {
      const matches = availableEpgChannels.filter(epgCh => {
        const channelName = channel.name.toLowerCase();
        const epgName = epgCh.display_name.toLowerCase();
        
        // Direct name match
        if (channelName.includes(epgName) || epgName.includes(channelName)) {
          return true;
        }
        
        // Channel number match patterns
        const channelNumber = channel.number.toString();
        if (epgName.includes(channelNumber) || epgCh.epg_id.includes(channelNumber)) {
          return true;
        }
        
        return false;
      });
      
      if (matches.length > 0) {
        suggestions.push({
          channel: {
            id: channel.id,
            name: channel.name,
            number: channel.number,
            current_epg_id: channel.epg_id
          },
          suggestions: matches.map(match => ({
            epg_id: match.epg_id,
            display_name: match.display_name,
            source_name: match.source_name,
            program_count: match.program_count,
            confidence: match.display_name.toLowerCase() === channel.name.toLowerCase() ? 'high' : 'medium'
          }))
        });
      }
    }

    res.json({
      unmapped_channels: unmappedChannels.length,
      available_epg_channels: availableEpgChannels.length,
      suggestions,
      summary: {
        channels_needing_mapping: unmappedChannels.length,
        available_for_mapping: availableEpgChannels.length,
        suggested_mappings: suggestions.length
      }
    });
  } catch (error) {
    logger.error('EPG mapping suggestions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug EPG data endpoint
router.get('/debug/epg', async (req, res) => {
  try {
    // Get table schema
    const tableInfo = await database.all(`PRAGMA table_info(epg_programs)`);
    
    // Get sample EPG programs
    const samplePrograms = await database.all(`SELECT * FROM epg_programs LIMIT 5`);
    
    // Get distinct channel info
    const distinctChannels = await database.all(`
      SELECT DISTINCT 
        channel_id,
        COUNT(*) as program_count,
        MIN(title) as sample_program
      FROM epg_programs 
      WHERE channel_id IS NOT NULL 
      GROUP BY channel_id 
      ORDER BY program_count DESC 
      LIMIT 10
    `);

    // Get channel mapping status
    // FIXED: Correct mapping between channels and EPG programs via epg_id
    const channelMapping = await database.all(`
      SELECT 
        c.id,
        c.name,
        c.number,
        c.epg_id,
        COALESCE(COUNT(p.id), 0) as program_count
      FROM channels c
      LEFT JOIN epg_programs p ON c.epg_id = p.channel_id
      WHERE c.epg_id IS NOT NULL
      GROUP BY c.id
      UNION ALL
      SELECT 
        c.id,
        c.name,
        c.number,
        c.epg_id,
        0 as program_count
      FROM channels c
      WHERE c.epg_id IS NULL OR c.epg_id = ''
      ORDER BY number
    `);

    // Get EPG sources
    const epgSources = await database.all('SELECT * FROM epg_sources');

    // Get EPG channels from sources
    const epgChannels = await database.all(`
      SELECT 
        ec.epg_id,
        ec.display_name,
        ec.source_id,
        es.name as source_name
      FROM epg_channels ec
      LEFT JOIN epg_sources es ON ec.source_id = es.id
      ORDER BY es.name, ec.display_name
      LIMIT 20
    `);

    // Get total counts
    const totalPrograms = await database.get('SELECT COUNT(*) as count FROM epg_programs');
    const totalEPGChannels = await database.get('SELECT COUNT(*) as count FROM epg_channels');

    // Get invalid mappings (channels with EPG IDs that don't exist in sources)
    const invalidMappings = await database.all(`
      SELECT 
        c.id,
        c.name,
        c.number,
        c.epg_id
      FROM channels c
      WHERE c.epg_id IS NOT NULL 
        AND c.epg_id != ''
        AND c.epg_id NOT IN (
          SELECT DISTINCT epg_id FROM epg_channels
        )
      ORDER BY c.number
    `);

    res.json({
      table_schema: tableInfo,
      sample_programs: samplePrograms,
      distinct_channels: distinctChannels,
      channel_mapping: channelMapping,
      invalid_mappings: invalidMappings,
      epg_sources: epgSources,
      epg_channels: epgChannels,
      summary: {
        total_channels: channelMapping.length,
        channels_with_programs: channelMapping.filter(c => c.program_count > 0).length,
        channels_with_valid_epg_id: channelMapping.filter(c => c.epg_id).length,
        channels_with_invalid_epg_id: invalidMappings.length,
        total_programs: totalPrograms.count,
        total_epg_channels: totalEPGChannels.count,
        mapping_efficiency: channelMapping.length > 0 
          ? Math.round((channelMapping.filter(c => c.program_count > 0).length / channelMapping.length) * 100)
          : 0
      }
    });
  } catch (error) {
    logger.error('Debug EPG error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Server information endpoint
router.get('/server/info', (req, res) => {
  try {
    const os = require('os');
    const config = require('../config');
    
    // Get network interfaces
    const networkInterfaces = os.networkInterfaces();
    const ipAddresses = [];
    
    Object.keys(networkInterfaces).forEach(interfaceName => {
      const addresses = networkInterfaces[interfaceName];
      addresses.forEach(address => {
        if (address.family === 'IPv4' && !address.internal) {
          ipAddresses.push({
            interface: interfaceName,
            address: address.address,
            netmask: address.netmask
          });
        }
      });
    });

    // Get primary server host
    const serverHost = req.get('host') || `${req.hostname}:${process.env.PORT || 8080}`;
    const protocol = req.secure ? 'https' : 'http';
    const baseUrl = `${protocol}://${serverHost}`;

    const serverInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      port: process.env.PORT || 8080,
      baseUrl,
      ipAddresses,
      urls: {
        webInterface: baseUrl,
        m3uPlaylist: `${baseUrl}/playlist.m3u`,
        epgXml: `${baseUrl}/epg/xmltv`,
        tunerDiscovery: `${baseUrl}/device.xml`,
        channelLineup: `${baseUrl}/lineup.json`
      },
      tuner: {
        deviceType: 'SiliconDust HDHomeRun',
        friendlyName: process.env.DEVICE_NAME || 'PlexTV Bridge',
        manufacturer: 'PlexTV Bridge',
        modelName: 'PlexTV Bridge',
        deviceId: process.env.DEVICE_ID || 'PLEXTV001',
        firmwareVersion: '1.0.0'
      }
    };

    res.json(serverInfo);
  } catch (error) {
    logger.error('Server info error:', error);
    res.status(500).json({ error: 'Failed to get server information' });
  }
});

// STREAM MANAGEMENT API
router.get('/streams/active', async (req, res) => {
  try {
    // Get max concurrent streams from settings
    let maxConcurrentStreams = 10;
    try {
      maxConcurrentStreams = await settingsService.getSetting('plexlive.streaming.maxConcurrentStreams', 10);
      maxConcurrentStreams = parseInt(maxConcurrentStreams) || 10;
    } catch (error) {
      logger.warn('Failed to get max concurrent streams for active streams endpoint:', error);
    }
    
    logger.info('Getting active streams...');
    const activeStreams = await streamManager.getActiveStreams();
    logger.info('Getting streams by channel...');
    const streamsByChannel = streamManager.getStreamsByChannel();
    logger.info('Getting concurrency metrics...');
    const concurrencyMetrics = streamManager.getConcurrencyMetrics(maxConcurrentStreams);
    logger.info('Active streams endpoint data prepared successfully');
    
    res.json({
      streams: activeStreams, // Dashboard expects "streams" property
      activeStreams, // Keep for backward compatibility
      streamsByChannel,
      metrics: concurrencyMetrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Active streams error:', error);
    res.status(500).json({ error: 'Failed to fetch active streams' });
  }
});

router.delete('/streams/active/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason = 'manual' } = req.body;
    
    streamManager.cleanupStream(sessionId, reason);
    
    logger.info('Stream manually terminated', { sessionId, reason });
    res.json({ message: 'Stream terminated successfully', sessionId });
  } catch (error) {
    logger.error('Stream termination error:', error);
    res.status(500).json({ error: 'Failed to terminate stream' });
  }
});

router.delete('/streams/active/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { reason = 'admin' } = req.body;
    
    streamManager.cleanupClientSessions(clientId, reason);
    
    logger.info('Client sessions terminated', { clientId, reason });
    res.json({ message: 'Client sessions terminated successfully', clientId });
  } catch (error) {
    logger.error('Client session termination error:', error);
    res.status(500).json({ error: 'Failed to terminate client sessions' });
  }
});

router.delete('/streams/active/channel/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;
    const { reason = 'admin' } = req.body;
    
    streamManager.cleanupChannelStreams(streamId, reason);
    
    logger.info('Channel streams terminated', { streamId, reason });
    res.json({ message: 'Channel streams terminated successfully', streamId });
  } catch (error) {
    logger.error('Channel stream termination error:', error);
    res.status(500).json({ error: 'Failed to terminate channel streams' });
  }
});

// SYSTEM API
router.get('/metrics', async (req, res) => {
  try {
    // Check cache first (skip cache if debug=1 query parameter)
    if (!req.query.debug) {
      const cached = await cacheService.getMetrics();
      if (cached && typeof cached === 'object' && cached.timestamp) {
        return res.json(cached);
      }
    }

    // Get real max concurrent streams from settings first
    let maxConcurrentStreams = 10; // fallback default
    try {
      maxConcurrentStreams = await settingsService.getSetting('plexlive.streaming.maxConcurrentStreams', 10);
      maxConcurrentStreams = parseInt(maxConcurrentStreams) || 10;
    } catch (settingsError) {
      logger.warn('Failed to get max concurrent streams from settings, using fallback:', settingsError);
      maxConcurrentStreams = parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10;
    }

    // Get active streams safely
    let activeStreams = [];
    let streamsByChannel = {};
    let concurrencyMetrics = {};
    
    try {
      activeStreams = streamManager.getActiveStreams() || [];
      streamsByChannel = streamManager.getStreamsByChannel() || {};
      
      // Call getConcurrencyMetrics with the correct maxConcurrentStreams value
      logger.info('Metrics API: Calling getConcurrencyMetrics with:', maxConcurrentStreams);
      concurrencyMetrics = streamManager.getConcurrencyMetrics(maxConcurrentStreams);
      logger.info('Metrics API: Got concurrency result:', concurrencyMetrics);
    } catch (streamError) {
      logger.warn('Stream manager not available for metrics:', streamError);
      activeStreams = [];
      streamsByChannel = {};
      concurrencyMetrics = {
        totalActiveStreams: 0,
        maxConcurrentStreams: maxConcurrentStreams,
        utilizationPercentage: 0,
        channelStreamCounts: {},
        uniqueClients: 0
      };
    }

    // Get health checks with fallbacks
    const dbHealth = database.isInitialized ? await database.healthCheck() : { status: 'initializing' };
    const cacheHealth = await cacheService.healthCheck();
    let epgStatus = { 
      status: 'unavailable', 
      sources: [],
      programs: { total: 0, upcoming24h: 0 },
      channels: { total: 0, mapped: 0, epgAvailable: 0 },
      mapping: { efficiency: 0, needsMapping: 0 },
      isInitialized: false
    };
    
    try {
      // Get EPG status with fallback for basic program counts
      try {
        epgStatus = await epgService.getStatus();
      } catch (serviceError) {
        logger.warn('EPG service status unavailable, using direct database query');
        
        // Fallback: direct database query for program counts
        const totalPrograms = await database.get('SELECT COUNT(*) as count FROM epg_programs') || { count: 0 };
        const now = new Date().toISOString();
        const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const upcomingPrograms = await database.get(`
          SELECT COUNT(*) as count FROM epg_programs 
          WHERE start_time BETWEEN ? AND ?
        `, [now, nextDay]) || { count: 0 };
        
        epgStatus = {
          status: 'database_fallback',
          programs: {
            total: totalPrograms.count,
            upcoming24h: upcomingPrograms.count
          },
          sources: [],
          channels: { total: 0, mapped: 0, epgAvailable: 0 },
          mapping: { efficiency: 0, needsMapping: 0 },
          isInitialized: epgService.isInitialized
        };
      }
      
      logger.debug('EPG status retrieved for metrics', {
        status: epgStatus.status,
        totalPrograms: epgStatus.programs?.total,
        upcoming24h: epgStatus.programs?.upcoming24h,
        mappedChannels: epgStatus.channels?.mapped,
        isInitialized: epgStatus.isInitialized
      });
    } catch (epgError) {
      logger.warn('EPG service not available for metrics:', epgError);
    }

    
    const metrics = {
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      },
      streams: {
        active: Array.isArray(activeStreams) ? activeStreams.length : 0,
        maximum: maxConcurrentStreams,
        utilization: Array.isArray(activeStreams) 
          ? (activeStreams.length / maxConcurrentStreams) * 100 
          : 0,
        byChannel: streamsByChannel,
        concurrency: concurrencyMetrics
      },
      database: dbHealth || { status: 'unknown' },
      cache: cacheHealth || { status: 'unknown' },
      epg: epgStatus || { status: 'unknown', sources: [] },
      timestamp: new Date().toISOString()
    };

    // Cache for 1 minute - only cache if successful
    try {
      await cacheService.setMetrics(metrics);
    } catch (cacheError) {
      logger.warn('Failed to cache metrics:', cacheError);
    }
    
    res.json(metrics);
  } catch (error) {
    logger.error('Metrics error:', error);
    
    // Get max concurrent streams for fallback
    let fallbackMaxStreams = 10;
    try {
      const streamingSetting = await database.get('SELECT value FROM settings WHERE key = ?', ['plexlive.streaming.maxConcurrentStreams']);
      if (streamingSetting) {
        fallbackMaxStreams = parseInt(streamingSetting.value) || 10;
      }
    } catch (settingsError) {
      fallbackMaxStreams = parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10;
    }
    
    // Return fallback metrics structure on error
    const fallbackMetrics = {
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: { user: 0, system: 0 },
        platform: process.platform,
        nodeVersion: process.version
      },
      streams: {
        active: 0,
        maximum: fallbackMaxStreams,
        utilization: 0,
        byChannel: {},
        concurrency: {}
      },
      database: { status: 'error', error: 'Database check failed' },
      cache: { status: 'error', error: 'Cache check failed' },
      epg: { status: 'error', sources: [], error: 'EPG check failed' },
      timestamp: new Date().toISOString(),
      error: 'Failed to fetch complete metrics'
    };
    
    res.status(200).json(fallbackMetrics); // Return 200 with error info instead of 500
  }
});

router.get('/logs', async (req, res) => {
  try {
    const { 
      level = null, 
      limit = 100, 
      offset = 0, 
      category = null,
      startDate = null,
      endDate = null,
      search = null
    } = req.query;
    
    // Initialize default response structure
    let logs = [];
    let fileLogs = [];
    
    // Get logs from database with error handling
    try {
      const dbLogs = await logger.getLogs({
        level,
        limit: parseInt(limit),
        offset: parseInt(offset),
        startDate,
        endDate,
        category,
        search
      });
      logs = Array.isArray(dbLogs) ? dbLogs : [];
    } catch (dbError) {
      logger.warn('Database logs not available:', dbError);
      logs = [];
    }
    
    // Get recent file logs for real-time viewing with error handling
    try {
      fileLogs = await getRecentFileLogs(level, 50);
      fileLogs = Array.isArray(fileLogs) ? fileLogs : [];
    } catch (fileError) {
      logger.warn('File logs not available:', fileError);
      fileLogs = [];
    }
    
    const response = {
      database_logs: logs,
      recent_file_logs: fileLogs,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: logs.length
      },
      filters: {
        level,
        category,
        startDate,
        endDate,
        search
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Logs error:', error);
    
    // Return safe fallback response
    const fallbackResponse = {
      database_logs: [],
      recent_file_logs: [],
      pagination: {
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0,
        total: 0
      },
      filters: {
        level: req.query.level || null,
        category: req.query.category || null,
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null,
        search: req.query.search || null
      },
      timestamp: new Date().toISOString(),
      error: 'Failed to fetch logs'
    };
    
    res.status(200).json(fallbackResponse); // Return 200 with error info instead of 500
  }
});

router.get('/logs/download', async (req, res) => {
  try {
    const { type = 'app', date = null, format = 'txt' } = req.query;
    
    const logDir = config.logging.path;
    let filename;
    
    if (date) {
      filename = `${type}-${date}.log`;
    } else {
      // Get today's log file
      const today = new Date().toISOString().split('T')[0];
      filename = `${type}-${today}.log`;
    }
    
    const filePath = path.join(logDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Log file not found' });
    }
    
    if (format === 'json') {
      // Convert logs to JSON format
      const logs = await parseLogFile(filePath);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-${date || 'latest'}.json"`);
      res.json(logs);
    } else {
      // Send raw log file
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(filePath);
    }
  } catch (error) {
    logger.error('Log download error:', error);
    res.status(500).json({ error: 'Failed to download log file' });
  }
});

router.get('/logs/files', async (req, res) => {
  try {
    const logDir = config.logging.path;
    
    if (!fs.existsSync(logDir)) {
      return res.json({ files: [] });
    }
    
    const files = fs.readdirSync(logDir)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        
        return {
          name: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          type: file.split('-')[0], // app, error, http, streams
          date: file.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null
        };
      })
      .sort((a, b) => b.modified - a.modified);
    
    res.json({ files });
  } catch (error) {
    logger.error('Log files error:', error);
    res.status(500).json({ error: 'Failed to fetch log files' });
  }
});

router.delete('/logs/cleanup', async (req, res) => {
  try {
    const { days = 30 } = req.body;
    
    const deletedCount = await logger.cleanupLogs(parseInt(days));
    
    logger.info('Log cleanup completed', { deletedCount, daysKept: days });
    res.json({ 
      message: 'Log cleanup completed',
      deletedCount,
      daysKept: parseInt(days)
    });
  } catch (error) {
    logger.error('Log cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup logs' });
  }
});

// Helper function to get recent file logs
async function getRecentFileLogs(level = null, limit = 50) {
  try {
    const logDir = config.logging.path;
    const today = new Date().toISOString().split('T')[0];
    const appLogFile = path.join(logDir, `app-${today}.log`);
    
    if (!fs.existsSync(appLogFile)) {
      return [];
    }
    
    const content = fs.readFileSync(appLogFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    // Get last N lines
    const recentLines = lines.slice(-limit);
    
    // Parse log lines and filter by level if specified
    const logs = recentLines
      .map(line => parseLogLine(line))
      .filter(log => log && (!level || log.level === level.toUpperCase()))
      .reverse(); // Most recent first
    
    return logs;
  } catch (error) {
    logger.error('Error reading recent file logs:', error);
    return [];
  }
}

// Helper function to parse log file
async function parseLogFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    return lines.map(line => parseLogLine(line)).filter(log => log);
  } catch (error) {
    logger.error('Error parsing log file:', error);
    return [];
  }
}

// Helper function to parse individual log line
function parseLogLine(line) {
  try {
    // Expected format: 2025-08-15 12:34:56 [INFO]: Message
    const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\]: (.+)$/);
    
    if (match) {
      const [, timestamp, level, message] = match;
      
      // Try to extract metadata if present
      let meta = {};
      const metaMatch = message.match(/^(.+?)\n(\{.+\})$/s);
      
      if (metaMatch) {
        try {
          meta = JSON.parse(metaMatch[2]);
          return {
            timestamp,
            level,
            message: metaMatch[1],
            meta
          };
        } catch (parseError) {
          // If JSON parsing fails, treat entire message as message
        }
      }
      
      return {
        timestamp,
        level,
        message,
        meta
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// SETTINGS API
router.get('/settings', async (req, res) => {
  try {
    // Always return JSON content-type header
    res.setHeader('Content-Type', 'application/json');
    
    const settings = await settingsService.getSettings();
    
    // Show effective advertised host (environment variable takes precedence)
    if (!settings.plexlive) settings.plexlive = {};
    if (!settings.plexlive.network) settings.plexlive.network = {};
    
    // Show the effective value that's actually being used
    const effectiveAdvertisedHost = process.env.ADVERTISED_HOST || settings.plexlive.network.advertisedHost;
    if (effectiveAdvertisedHost) {
      settings.plexlive.network.advertisedHost = effectiveAdvertisedHost;
      settings.plexlive.network._advertisedHostSource = process.env.ADVERTISED_HOST ? 'environment' : 'settings';
    }
    
    logger.info('Settings retrieved successfully', { 
      maxConcurrentStreams: settings.plexlive?.streaming?.maxConcurrentStreams,
      advertisedHost: effectiveAdvertisedHost,
      hasPlexlive: !!settings.plexlive
    });
    
    res.status(200).json(settings);
  } catch (error) {
    logger.error('Settings get error:', error);
    
    // Return safe fallback settings structure using the service defaults
    const fallbackSettings = {
      error: 'Failed to fetch settings',
      message: error.message,
      plexlive: settingsService.getDefaultSettings(),
      timestamp: new Date().toISOString()
    };
    
    res.status(200).json(fallbackSettings); // Return 200 with error info instead of 500
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = req.body;
    
    // Validate settings
    const validation = settingsService.validateSettings(settings);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }
    
    const updatedSettings = await settingsService.updateSettings(settings);
    
    logger.info('Settings updated via API', { 
      keys: Object.keys(settings),
      maxConcurrentStreams: settings.plexlive?.streaming?.maxConcurrentStreams
    });
    
    // Settings are automatically applied to services via settingsService.applySettingsToServices
    
    res.json({ 
      message: 'Settings updated successfully',
      settings: updatedSettings
    });
  } catch (error) {
    logger.error('Settings update error:', error);
    res.status(500).json({ 
      error: 'Failed to update settings',
      message: error.message
    });
  }
});

// Additional settings endpoints
router.get('/settings/:category', async (req, res) => {
  try {
    const category = req.params.category;
    const categorySettings = await settingsService.getCategory(category);
    
    res.json(categorySettings);
  } catch (error) {
    logger.error('Settings category get error:', error);
    res.status(500).json({ error: 'Failed to fetch settings category' });
  }
});

// Reset settings to defaults
router.post('/settings/reset', async (req, res) => {
  try {
    const { category } = req.body;
    
    const resetSettings = await settingsService.resetSettings(category);
    
    const message = category 
      ? `Settings category '${category}' reset to defaults`
      : 'All settings reset to defaults';
    
    logger.info('Settings reset via API', { category, message });
    
    res.json({ 
      message,
      settings: resetSettings
    });
  } catch (error) {
    logger.error('Settings reset error:', error);
    res.status(500).json({ 
      error: 'Failed to reset settings',
      message: error.message
    });
  }
});

// BACKUP/RESTORE API
router.get('/backup/export', async (req, res) => {
  try {
    const { format = 'json', includePasswords = false } = req.query;
    
    // Get all configuration data
    const channels = await database.all('SELECT * FROM channels ORDER BY number');
    const streams = await database.all('SELECT * FROM streams');
    const epgSources = await database.all('SELECT * FROM epg_sources');
    const settings = await database.all('SELECT * FROM settings');
    
    // Process streams to handle sensitive data
    const processedStreams = streams.map(stream => {
      const streamCopy = { ...stream };
      
      // Parse JSON fields
      if (streamCopy.backup_urls) {
        streamCopy.backup_urls = JSON.parse(streamCopy.backup_urls);
      }
      if (streamCopy.headers) {
        streamCopy.headers = JSON.parse(streamCopy.headers);
      }
      if (streamCopy.protocol_options) {
        streamCopy.protocol_options = JSON.parse(streamCopy.protocol_options);
      }
      
      // Handle sensitive data
      if (!includePasswords) {
        if (streamCopy.auth_password) {
          streamCopy.auth_password = '[REDACTED]';
        }
      }
      
      return streamCopy;
    });
    
    // Process settings
    const settingsObj = {};
    settings.forEach(setting => {
      let value = setting.value;
      if (setting.type === 'number') {
        value = parseFloat(value);
      } else if (setting.type === 'boolean') {
        value = value === 'true';
      } else if (setting.type === 'json') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // Keep as string if parsing fails
        }
      }
      settingsObj[setting.key] = value;
    });
    
    const backupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      includesPasswords: includePasswords,
      data: {
        channels,
        streams: processedStreams,
        epgSources,
        settings: settingsObj
      },
      metadata: {
        totalChannels: channels.length,
        totalStreams: streams.length,
        totalEpgSources: epgSources.length,
        totalSettings: Object.keys(settingsObj).length
      }
    };
    
    const filename = `plexbridge-backup-${new Date().toISOString().split('T')[0]}.json`;
    
    if (format === 'download') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    
    logger.info('Configuration backup exported', { 
      includePasswords,
      channels: channels.length,
      streams: streams.length,
      epgSources: epgSources.length
    });
    
    res.json(backupData);
  } catch (error) {
    logger.error('Backup export error:', error);
    res.status(500).json({ error: 'Failed to export backup' });
  }
});

// Backup import (simplified for now)
router.post('/backup/import', async (req, res) => {
  res.status(501).json({ error: 'Backup import temporarily disabled for container stability' });
});

// Backup validation (simplified for now)
router.post('/backup/validate', async (req, res) => {
  res.status(501).json({ error: 'Backup validation temporarily disabled for container stability' });
});

// Get setting descriptions/metadata
router.get('/settings/metadata', (req, res) => {
  try {
    const metadata = {
      plexlive: {
        title: 'Plex Live TV Settings',
        description: 'Configuration options for Plex Live TV integration',
        sections: {
          ssdp: {
            title: 'SSDP Discovery',
            description: 'Simple Service Discovery Protocol settings for device discovery'
          },
          streaming: {
            title: 'Streaming',
            description: 'Stream handling and performance settings'
          },
          transcoding: {
            title: 'Transcoding',
            description: 'Video/audio transcoding configuration'
          },
          caching: {
            title: 'Caching',
            description: 'Stream caching and performance optimization'
          },
          device: {
            title: 'Device Information',
            description: 'Device identification and capabilities'
          },
          network: {
            title: 'Network',
            description: 'Network binding and connectivity settings'
          },
          compatibility: {
            title: 'Compatibility',
            description: 'Plex and HDHomeRun compatibility options'
          }
        }
      }
    };
    
    res.json(metadata);
  } catch (error) {
    logger.error('Settings metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch settings metadata' });
  }
});

module.exports = router;
