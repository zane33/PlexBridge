const express = require('express');
const router = express.Router();
const database = require('../services/database');
const cacheService = require('../services/cacheService');
const streamManager = require('../services/streamManager');
const epgService = require('../services/epgService');
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
  logo: Joi.string().allow(null).max(500),
  epg_id: Joi.string().allow(null).max(255)
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
  }).default()
}).default();

const settingsSchema = Joi.object({
  plexlive: plexliveSettingsSchema
});

// Middleware for input validation
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    req.validatedBody = value;
    next();
  };
};

// CHANNELS API
router.get('/channels', async (req, res) => {
  try {
    // Check if database is initialized
    if (!database || !database.isInitialized || !database.db) {
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

    await database.run(`
      INSERT INTO channels (id, name, number, enabled, logo, epg_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, data.name, data.number, data.enabled, data.logo, data.epg_id]);

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

router.put('/channels/:id', validate(channelSchema), async (req, res) => {
  try {
    const data = req.validatedBody;
    
    const result = await database.run(`
      UPDATE channels 
      SET name = ?, number = ?, enabled = ?, logo = ?, epg_id = ?
      WHERE id = ?
    `, [data.name, data.number, data.enabled, data.logo, data.epg_id, req.params.id]);

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
      logger.error('Channel update error:', error);
      res.status(500).json({ error: 'Failed to update channel' });
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
    if (!database || !database.isInitialized || !database.db) {
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
    const { source_id } = req.body;
    
    if (source_id) {
      await epgService.forceRefresh(source_id);
      res.json({ message: `EPG refresh started for source ${source_id}` });
    } else {
      const sources = await database.all('SELECT id FROM epg_sources WHERE enabled = 1');
      for (const source of sources) {
        epgService.forceRefresh(source.id);
      }
      res.json({ message: 'EPG refresh started for all sources' });
    }
  } catch (error) {
    logger.error('EPG refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh EPG' });
  }
});

router.get('/epg/sources', async (req, res) => {
  try {
    // Check if database is initialized
    if (!database || !database.isInitialized || !database.db) {
      logger.info('Database not initialized, returning empty EPG sources array');
      return res.json([]); // Return empty array if database not initialized
    }

    const sources = await database.all('SELECT * FROM epg_sources ORDER BY name');
    res.json(sources);
  } catch (error) {
    logger.error('EPG sources error:', error);
    res.status(500).json({ error: 'Failed to fetch EPG sources' });
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
    // Check if database is initialized
    if (!database || !database.isInitialized || !database.db) {
      logger.info('Database not initialized, returning empty EPG channels');
      return res.json({ available_channels: [] }); // Return empty array if database not initialized
    }

    // Get all EPG channels with display names from all sources
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
          channel_id,
          COUNT(*) as program_count
        FROM epg_programs
        GROUP BY channel_id
      ) program_counts ON ec.epg_id = program_counts.channel_id
      WHERE es.enabled = 1
      ORDER BY ec.display_name
    `);

    // Format response with proper display names
    const channelsWithNames = availableChannels.map(ch => ({
      epg_id: ch.epg_id,
      program_count: ch.program_count,
      channel_name: ch.channel_name || ch.epg_id, // Fallback to epg_id if no display name
      icon_url: ch.icon_url,
      source_name: ch.source_name,
      source_id: ch.source_id
    }));

    res.json({
      available_channels: channelsWithNames
    });
  } catch (error) {
    console.error('EPG channels error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch EPG channels' });
  }
});

router.get('/epg/sources/:id/channels', async (req, res) => {
  try {
    // Get EPG channels with display names from the source
    const availableChannels = await database.all(`
      SELECT 
        ec.epg_id,
        ec.display_name as channel_name,
        ec.icon_url,
        COALESCE(program_counts.program_count, 0) as program_count
      FROM epg_channels ec
      LEFT JOIN (
        SELECT 
          channel_id,
          COUNT(*) as program_count
        FROM epg_programs
        GROUP BY channel_id
      ) program_counts ON ec.epg_id = program_counts.channel_id
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
    // Check if database is initialized
    if (!database || !database.isInitialized || !database.db) {
      logger.info('Database not initialized, returning empty EPG programs');
      return res.json([]); // Return empty array if database not initialized
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
    res.json(programs);
  } catch (error) {
    console.error('EPG programs error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch EPG programs' });
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
    const channelMapping = await database.all(`
      SELECT 
        c.id,
        c.name,
        c.number,
        c.epg_id,
        COUNT(p.id) as program_count
      FROM channels c
      LEFT JOIN epg_programs p ON c.id = p.channel_id
      GROUP BY c.id
      ORDER BY c.number
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

    res.json({
      table_schema: tableInfo,
      sample_programs: samplePrograms,
      distinct_channels: distinctChannels,
      channel_mapping: channelMapping,
      epg_sources: epgSources,
      epg_channels: epgChannels,
      summary: {
        total_channels: channelMapping.length,
        channels_with_programs: channelMapping.filter(c => c.program_count > 0).length,
        total_programs: totalPrograms.count,
        total_epg_channels: totalEPGChannels.count,
        channels_with_epg_id: channelMapping.filter(c => c.epg_id).length
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
    const activeStreams = streamManager.getActiveStreams();
    const streamsByChannel = streamManager.getStreamsByChannel();
    const concurrencyMetrics = streamManager.getConcurrencyMetrics();
    
    res.json({
      activeStreams,
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
    // Check cache first
    const cached = await cacheService.getMetrics();
    if (cached) {
      return res.json(cached);
    }

    const activeStreams = streamManager.getActiveStreams();
    const dbHealth = await database.healthCheck();
    const cacheHealth = await cacheService.healthCheck();
    const epgStatus = await epgService.getStatus();
    
    const metrics = {
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      },
      streams: {
        active: activeStreams.length,
        maximum: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10,
        utilization: (activeStreams.length / (parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10)) * 100
      },
      database: dbHealth,
      cache: cacheHealth,
      epg: epgStatus,
      timestamp: new Date().toISOString()
    };

    // Cache for 1 minute
    await cacheService.setMetrics(metrics);
    
    res.json(metrics);
  } catch (error) {
    logger.error('Metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
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
    
    // Get logs from database
    const logs = await logger.getLogs({
      level,
      limit: parseInt(limit),
      offset: parseInt(offset),
      startDate,
      endDate,
      category,
      search
    });
    
    // Also get recent file logs for real-time viewing
    const fileLogs = await getRecentFileLogs(level, 50);
    
    res.json({
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
    });
  } catch (error) {
    logger.error('Logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
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
    // Check if database is initialized
    if (!database || !database.isInitialized || !database.db) {
      logger.info('Database not initialized, returning default settings');
      // Return default settings structure when database not available
      return res.json({
        plexlive: {
          ssdp: {
            enabled: true,
            discoverableInterval: 30000,
            announceInterval: 1800000,
            multicastAddress: '239.255.255.250',
            deviceDescription: 'IPTV to Plex Bridge Interface'
          },
          streaming: {
            maxConcurrentStreams: 10,
            streamTimeout: 30000,
            reconnectAttempts: 3,
            bufferSize: 65536,
            adaptiveBitrate: true,
            preferredProtocol: 'hls'
          },
          transcoding: {
            enabled: true,
            hardwareAcceleration: false,
            preset: 'medium',
            videoCodec: 'h264',
            audioCodec: 'aac',
            qualityProfiles: {
              low: { resolution: '720x480', bitrate: '1000k' },
              medium: { resolution: '1280x720', bitrate: '2500k' },
              high: { resolution: '1920x1080', bitrate: '5000k' }
            },
            defaultProfile: 'medium'
          },
          caching: {
            enabled: true,
            duration: 3600,
            maxSize: 1073741824,
            cleanup: {
              enabled: true,
              interval: 3600000,
              maxAge: 86400000
            }
          },
          device: {
            name: 'PlexTV',
            id: 'PLEXTV001',
            tunerCount: 4,
            firmware: '1.0.0',
            baseUrl: 'http://localhost:8080'
          },
          network: {
            bindAddress: '0.0.0.0',
            advertisedHost: null,
            streamingPort: 8080,
            discoveryPort: 1900,
            ipv6Enabled: false
          },
          compatibility: {
            hdHomeRunMode: true,
            plexPassRequired: false,
            gracePeriod: 10000,
            channelLogoFallback: true
          }
        }
      });
    }

    const settings = await database.all('SELECT * FROM settings ORDER BY key');
    
    const settingsObj = {};
    settings.forEach(setting => {
      let value = setting.value;
      if (setting.type === 'number') {
        value = parseFloat(value);
      } else if (setting.type === 'boolean') {
        value = value === 'true';
      } else if (setting.type === 'json') {
        value = JSON.parse(value);
      }
      settingsObj[setting.key] = value;
    });

    res.json(settingsObj);
  } catch (error) {
    logger.error('Settings get error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = req.body;
    
    await database.transaction(async (db) => {
      for (const [key, value] of Object.entries(settings)) {
        let stringValue = value;
        let type = 'string';
        
        if (typeof value === 'number') {
          type = 'number';
          stringValue = value.toString();
        } else if (typeof value === 'boolean') {
          type = 'boolean';
          stringValue = value.toString();
        } else if (typeof value === 'object') {
          type = 'json';
          stringValue = JSON.stringify(value);
        }

        await db.run(`
          INSERT OR REPLACE INTO settings (key, value, type)
          VALUES (?, ?, ?)
        `, [key, stringValue, type]);
      }
    });

    logger.info('Settings updated', { keys: Object.keys(settings) });
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    logger.error('Settings update error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Additional settings endpoints
router.get('/settings/:category', async (req, res) => {
  try {
    const category = req.params.category;
    const settings = await database.all('SELECT * FROM settings WHERE key LIKE ? ORDER BY key', [`${category}.%`]);
    
    const settingsObj = {};
    settings.forEach(setting => {
      const key = setting.key.replace(`${category}.`, '');
      let value = setting.value;
      
      if (setting.type === 'number') {
        value = parseFloat(value);
      } else if (setting.type === 'boolean') {
        value = value === 'true';
      } else if (setting.type === 'json') {
        try {
          value = JSON.parse(value);
        } catch (parseError) {
          logger.warn(`Failed to parse JSON setting ${setting.key}:`, parseError);
          value = setting.value;
        }
      }
      
      // Build nested object structure
      const keys = key.split('.');
      let current = settingsObj;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
    });

    res.json(settingsObj);
  } catch (error) {
    logger.error('Settings category get error:', error);
    res.status(500).json({ error: 'Failed to fetch settings category' });
  }
});

// Reset settings to defaults
router.post('/settings/reset', async (req, res) => {
  try {
    const { category } = req.body;
    
    if (category) {
      // Reset specific category
      await database.run('DELETE FROM settings WHERE key LIKE ?', [`${category}.%`]);
      logger.info('Settings category reset', { category });
      res.json({ message: `Settings category '${category}' reset to defaults` });
    } else {
      // Reset all settings
      await database.run('DELETE FROM settings');
      logger.info('All settings reset to defaults');
      res.json({ message: 'All settings reset to defaults' });
    }
    
    // Clear cached configuration
    await cacheService.del('settings:config');
  } catch (error) {
    logger.error('Settings reset error:', error);
    res.status(500).json({ error: 'Failed to reset settings' });
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
