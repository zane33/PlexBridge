const express = require('express');
const router = express.Router();
const epgService = require('../services/epgService');
const database = require('../services/database');
const logger = require('../utils/logger');

// XMLTV format EPG endpoint
router.get('/xmltv/:channelId?', async (req, res) => {
  try {
    const channelId = req.params.channelId;
    const { days = 3 } = req.query;
    
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

    let programs;
    let channels;

    if (channelId) {
      // Single channel
      programs = await epgService.getEPGData(channelId, startTime, endTime);
      channels = await database.all('SELECT * FROM channels WHERE id = ?', [channelId]);
    } else {
      // All channels
      programs = await epgService.getAllEPGData(startTime, endTime);
      channels = await database.all('SELECT * FROM channels WHERE enabled = 1 ORDER BY number');
    }

    // Generate XMLTV format
    const xmltv = generateXMLTV(channels, programs);
    
    res.set('Content-Type', 'application/xml');
    res.send(xmltv);

  } catch (error) {
    logger.error('XMLTV EPG error:', error);
    res.status(500).send('<?xml version="1.0"?><error>EPG generation failed</error>');
  }
});

// JSON EPG endpoint
router.get('/json/:channelId?', async (req, res) => {
  try {
    const channelId = req.params.channelId;
    const { days = 3 } = req.query;
    
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

    let programs;
    
    if (channelId) {
      programs = await epgService.getEPGData(channelId, startTime, endTime);
    } else {
      programs = await epgService.getAllEPGData(startTime, endTime);
    }

    res.json({
      generatedAt: new Date().toISOString(),
      startTime,
      endTime,
      channelId: channelId || 'all',
      programs
    });

  } catch (error) {
    logger.error('JSON EPG error:', error);
    res.status(500).json({ error: 'EPG generation failed' });
  }
});

// Current program for channel
router.get('/now/:channelId', async (req, res) => {
  try {
    const channelId = req.params.channelId;
    const now = new Date().toISOString();

    // First try to get the EPG ID if channelId is an internal ID
    let epgChannelId = channelId;
    const channel = await database.get('SELECT epg_id FROM channels WHERE id = ?', [channelId]);
    if (channel && channel.epg_id) {
      epgChannelId = channel.epg_id;
    }

    const program = await database.get(`
      SELECT p.*, c.name as channel_name, c.number as channel_number
      FROM epg_programs p
      JOIN channels c ON c.epg_id = p.channel_id
      WHERE p.channel_id = ? 
      AND p.start_time <= ? 
      AND p.end_time > ?
      LIMIT 1
    `, [epgChannelId, now, now]);

    if (!program) {
      return res.status(404).json({ error: 'No current program found' });
    }

    res.json(program);

  } catch (error) {
    logger.error('Current program error:', error);
    res.status(500).json({ error: 'Failed to get current program' });
  }
});

// Next program for channel
router.get('/next/:channelId', async (req, res) => {
  try {
    const channelId = req.params.channelId;
    const now = new Date().toISOString();

    // First try to get the EPG ID if channelId is an internal ID
    let epgChannelId = channelId;
    const channel = await database.get('SELECT epg_id FROM channels WHERE id = ?', [channelId]);
    if (channel && channel.epg_id) {
      epgChannelId = channel.epg_id;
    }

    const program = await database.get(`
      SELECT p.*, c.name as channel_name, c.number as channel_number
      FROM epg_programs p
      JOIN channels c ON c.epg_id = p.channel_id
      WHERE p.channel_id = ? 
      AND p.start_time > ?
      ORDER BY p.start_time ASC
      LIMIT 1
    `, [epgChannelId, now]);

    if (!program) {
      return res.status(404).json({ error: 'No upcoming program found' });
    }

    res.json(program);

  } catch (error) {
    logger.error('Next program error:', error);
    res.status(500).json({ error: 'Failed to get next program' });
  }
});

// Search programs
router.get('/search', async (req, res) => {
  try {
    const { q, channel_id, start, end, limit = 50 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    let query = `
      SELECT p.*, c.name as channel_name, c.number as channel_number
      FROM epg_programs p
      JOIN channels c ON c.epg_id = p.channel_id
      WHERE (p.title LIKE ? OR p.description LIKE ?)
    `;
    
    const params = [`%${q}%`, `%${q}%`];

    if (channel_id) {
      query += ' AND p.channel_id = ?';
      params.push(channel_id);
    }

    if (start) {
      query += ' AND p.start_time >= ?';
      params.push(start);
    }

    if (end) {
      query += ' AND p.end_time <= ?';
      params.push(end);
    }

    query += ' ORDER BY p.start_time ASC LIMIT ?';
    params.push(parseInt(limit));

    const programs = await database.all(query, params);

    res.json({
      query: q,
      results: programs.length,
      programs
    });

  } catch (error) {
    logger.error('EPG search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get programs by time range
router.get('/grid', async (req, res) => {
  try {
    const { 
      start = new Date().toISOString(),
      end = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours
      channels
    } = req.query;

    let channelFilter = '';
    let params = [start, end];

    if (channels) {
      const channelIds = channels.split(',');
      const placeholders = channelIds.map(() => '?').join(',');
      channelFilter = ` AND c.id IN (${placeholders})`;
      params.push(...channelIds);
    }

    const programs = await database.all(`
      SELECT p.*, c.name as channel_name, c.number as channel_number, c.logo as channel_logo
      FROM epg_programs p
      JOIN channels c ON c.epg_id = p.channel_id
      WHERE p.start_time < ? AND p.end_time > ?${channelFilter}
      ORDER BY c.number, p.start_time
    `, params);

    // Group by channel
    const grid = {};
    programs.forEach(program => {
      const channelId = program.channel_id;
      if (!grid[channelId]) {
        grid[channelId] = {
          id: channelId,
          name: program.channel_name,
          number: program.channel_number,
          logo: program.channel_logo,
          programs: []
        };
      }
      grid[channelId].programs.push(program);
    });

    res.json({
      start,
      end,
      channels: Object.values(grid)
    });

  } catch (error) {
    logger.error('EPG grid error:', error);
    res.status(500).json({ error: 'Failed to generate EPG grid' });
  }
});

// Helper function to generate XMLTV format
function generateXMLTV(channels, programs) {
  const escapeXML = (str) => {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
  };

  const formatXMLTVTime = (isoString) => {
    const date = new Date(isoString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    const second = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hour}${minute}${second} +0000`;
  };

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<!DOCTYPE tv SYSTEM "xmltv.dtd">\n';
  xml += '<tv generator-info-name="PlexTV" generator-info-url="https://github.com/plextv">\n';

  // Add channels
  channels.forEach(channel => {
    xml += `  <channel id="${escapeXML(channel.id)}">\n`;
    xml += `    <display-name>${escapeXML(channel.name)}</display-name>\n`;
    xml += `    <display-name>${escapeXML(channel.number.toString())}</display-name>\n`;
    if (channel.logo) {
      xml += `    <icon src="${escapeXML(channel.logo)}" />\n`;
    }
    xml += '  </channel>\n';
  });

  // Add programs
  programs.forEach(program => {
    xml += `  <programme start="${formatXMLTVTime(program.start_time)}" stop="${formatXMLTVTime(program.end_time)}" channel="${escapeXML(program.channel_id)}">\n`;
    xml += `    <title>${escapeXML(program.title)}</title>\n`;
    
    if (program.description) {
      xml += `    <desc>${escapeXML(program.description)}</desc>\n`;
    }
    
    if (program.category) {
      xml += `    <category>${escapeXML(program.category)}</category>\n`;
    }
    
    if (program.episode_number && program.season_number) {
      xml += `    <episode-num system="xmltv_ns">${program.season_number - 1}.${program.episode_number - 1}.</episode-num>\n`;
    }
    
    xml += '  </programme>\n';
  });

  xml += '</tv>\n';
  
  return xml;
}

module.exports = router;
