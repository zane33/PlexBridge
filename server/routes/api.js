const express = require('express');
const router = express.Router();
const database = require('../services/database');
const cacheService = require('../services/cacheService');
const streamManager = require('../services/streamManager');
const epgService = require('../services/epgService');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');

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

// Multi-channel stream import endpoint
router.post('/streams/import', async (req, res) => {
  try {
    const { url, type, auth_username, auth_password, auto_create_channels = false } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    logger.info('Multi-channel stream import requested', { url, type });

    // Parse the stream source for multiple channels
    const channels = await parseStreamSource(url, type, { auth_username, auth_password });
    
    if (channels.length === 0) {
      return res.status(400).json({ error: 'No channels found in the provided source' });
    }

    // If auto_create_channels is true, create channels and streams automatically
    if (auto_create_channels) {
      const createdChannels = [];
      const createdStreams = [];

      await database.transaction(async (db) => {
        for (const channelData of channels) {
          // Create channel
          const channelId = uuidv4();
          await db.run(`
            INSERT INTO channels (id, name, number, enabled, logo, epg_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            channelId,
            channelData.name,
            channelData.number || createdChannels.length + 1,
            true,
            channelData.logo || null,
            channelData.epg_id || null
          ]);

          createdChannels.push({ id: channelId, ...channelData });

          // Create stream for this channel
          const streamId = uuidv4();
          await db.run(`
            INSERT INTO streams (id, channel_id, name, url, type, backup_urls, auth_username, auth_password, headers, protocol_options, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            streamId,
            channelId,
            `${channelData.name} Stream`,
            channelData.url,
            channelData.type || type || 'hls',
            JSON.stringify([]),
            auth_username || null,
            auth_password || null,
            JSON.stringify({}),
            JSON.stringify({}),
            true
          ]);

          createdStreams.push({ id: streamId, channel_id: channelId, ...channelData });
        }
      });

      // Clear channel lineup cache
      await cacheService.del('lineup:channels');

      logger.info('Multi-channel import completed', { 
        channelsCreated: createdChannels.length,
        streamsCreated: createdStreams.length
      });

      return res.json({
        message: 'Import completed successfully',
        channelsCreated: createdChannels.length,
        streamsCreated: createdStreams.length,
        channels: createdChannels,
        streams: createdStreams
      });
    } else {
      // Return parsed channels for review
      return res.json({
        message: 'Channels parsed successfully',
        channelsFound: channels.length,
        channels: channels.map(ch => ({
          name: ch.name,
          number: ch.number,
          url: ch.url,
          logo: ch.logo,
          epg_id: ch.epg_id,
          type: ch.type || type || 'hls'
        }))
      });
    }

  } catch (error) {
    logger.error('Multi-channel stream import failed:', error);
    res.status(500).json({ error: error.message || 'Import failed' });
  }
});

// Stream source parser function
async function parseStreamSource(url, type, auth = {}) {
  const channels = [];

  try {
    // Fetch the source
    const headers = { 'User-Agent': 'PlexTV/1.0' };
    if (auth.auth_username) {
      headers['Authorization'] = `Basic ${Buffer.from(`${auth.auth_username}:${auth.auth_password}`).toString('base64')}`;
    }

    const response = await require('axios').get(url, {
      timeout: 30000,
      headers
    });

    const content = response.data;

    // Parse M3U/M3U8 playlists
    if (content.includes('#EXTM3U') || url.toLowerCase().includes('.m3u')) {
      return parseM3UPlaylist(content, url);
    }

    // Parse XMLTV (for channel info, not streams)
    if (content.includes('<tv') && content.includes('<channel')) {
      return parseXMLTVChannels(content);
    }

    // If it's a single stream, return as one channel
    return [{
      name: 'Imported Channel',
      url: url,
      type: type || 'hls',
      number: 1
    }];

  } catch (error) {
    logger.error('Stream source parsing failed:', { url, error: error.message });
    throw new Error(`Failed to parse stream source: ${error.message}`);
  }
}

// M3U playlist parser
function parseM3UPlaylist(content, baseUrl) {
  const channels = [];
  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  
  let currentChannel = null;
  let channelNumber = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXTINF:')) {
      // Parse channel info from EXTINF line
      currentChannel = {
        number: channelNumber++,
        name: 'Unknown Channel',
        logo: null,
        epg_id: null,
        group: null
      };

      // Extract channel name (after the comma)
      const nameMatch = line.match(/,(.+)$/);
      if (nameMatch) {
        currentChannel.name = nameMatch[1].trim();
      }

      // Extract additional info from attributes
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) {
        currentChannel.logo = logoMatch[1];
      }

      const epgIdMatch = line.match(/tvg-id="([^"]+)"/);
      if (epgIdMatch) {
        currentChannel.epg_id = epgIdMatch[1];
      }

      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) {
        currentChannel.group = groupMatch[1];
      }

      const numberMatch = line.match(/tvg-chno="([^"]+)"/);
      if (numberMatch) {
        currentChannel.number = parseInt(numberMatch[1]) || currentChannel.number;
      }

    } else if (currentChannel && line && !line.startsWith('#')) {
      // This should be the stream URL
      currentChannel.url = line;
      
      // Determine stream type from URL
      if (line.includes('.m3u8')) {
        currentChannel.type = 'hls';
      } else if (line.includes('.mpd')) {
        currentChannel.type = 'dash';
      } else if (line.startsWith('rtsp://')) {
        currentChannel.type = 'rtsp';
      } else if (line.startsWith('rtmp://')) {
        currentChannel.type = 'rtmp';
      } else if (line.startsWith('udp://')) {
        currentChannel.type = 'udp';
      } else {
        currentChannel.type = 'http';
      }

      channels.push(currentChannel);
      currentChannel = null;
    }
  }

  return channels;
}

// XMLTV channel parser (for channel metadata)
function parseXMLTVChannels(content) {
  const channels = [];
  
  try {
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    
    parser.parseString(content, (err, result) => {
      if (err || !result.tv || !result.tv.channel) return;
      
      const xmlChannels = Array.isArray(result.tv.channel) ? result.tv.channel : [result.tv.channel];
      
      xmlChannels.forEach((channel, index) => {
        if (channel.$ && channel.$.id) {
          channels.push({
            name: channel['display-name']?._ || channel['display-name'] || `Channel ${index + 1}`,
            number: index + 1,
            epg_id: channel.$.id,
            logo: channel.icon?.$.src || null,
            url: '', // XMLTV doesn't contain stream URLs
            type: 'hls'
          });
        }
      });
    });
  } catch (error) {
    logger.error('XMLTV parsing failed:', error);
  }

  return channels;
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

router.get('/epg/sources/:id/channels', async (req, res) => {
  try {
    // Get unique channel IDs available in EPG data for this source
    const availableChannels = await database.all(`
      SELECT DISTINCT p.channel_epg_id, COUNT(*) as program_count
      FROM epg_programs p
      WHERE p.source_id = ?
      GROUP BY p.channel_epg_id
      ORDER BY p.channel_epg_id
    `, [req.params.id]);

    res.json({
      source_id: req.params.id,
      available_channels: availableChannels.map(ch => ({
        epg_id: ch.channel_epg_id,
        program_count: ch.program_count
      }))
    });
  } catch (error) {
    logger.error('EPG source channels error:', error);
    res.status(500).json({ error: 'Failed to fetch EPG source channels' });
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
    const { level, limit = 100, offset = 0 } = req.query;
    
    // This would require implementing the DatabaseLogger
    // For now, return a simple response
    res.json({
      message: 'Logs endpoint - implementation depends on logging configuration',
      query: { level, limit, offset }
    });
  } catch (error) {
    logger.error('Logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// SETTINGS API
router.get('/settings', async (req, res) => {
  try {
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

module.exports = router;
