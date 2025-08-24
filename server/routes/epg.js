const express = require('express');
const router = express.Router();
const epgService = require('../services/epgService');
const database = require('../services/database');
const logger = require('../utils/logger');

// XMLTV format EPG endpoint - both with and without .xml extension for Plex compatibility
// IMPORTANT: The .xml route MUST come before the parameterized route to avoid conflicts
router.get('/xmltv.xml', async (req, res) => {
  // Handle .xml extension endpoint by setting params and calling handler
  req.params = { ...req.params, channelId: undefined };
  return handleXMLTVRequest(req, res);
});

router.get('/xmltv/:channelId?', async (req, res) => {
  return handleXMLTVRequest(req, res);
});

// Shared XMLTV request handler
async function handleXMLTVRequest(req, res) {
  try {
    const channelId = req.params.channelId;
    const { days = 3 } = req.query;
    
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

    let programs;
    let channels;
    let epgSourceCategories = new Map();

    // Fetch EPG source categories for category mapping
    const epgSources = await database.all('SELECT id, category FROM epg_sources WHERE category IS NOT NULL');
    epgSources.forEach(source => {
      epgSourceCategories.set(source.id, source.category);
    });

    if (channelId) {
      // Single channel
      programs = await epgService.getEPGData(channelId, startTime, endTime);
      channels = await database.all('SELECT * FROM channels WHERE id = ?', [channelId]);
    } else {
      // All channels
      programs = await epgService.getAllEPGData(startTime, endTime);
      channels = await database.all('SELECT * FROM channels WHERE enabled = 1 ORDER BY number');
    }

    // If no programs exist, generate sample EPG data for Plex compatibility
    if (!programs || programs.length === 0) {
      logger.info('No EPG programs found, generating sample data for Plex compatibility');
      programs = generateSampleEPGData(channels);
    }

    // Generate XMLTV format with categories
    const xmltv = generateXMLTV(channels, programs, epgSourceCategories);
    
    res.set('Content-Type', 'application/xml');
    res.send(xmltv);

  } catch (error) {
    logger.error('XMLTV EPG error:', error);
    res.status(500).send('<?xml version="1.0"?><error>EPG generation failed</error>');
  }
}

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
function generateXMLTV(channels, programs, epgSourceCategories = new Map()) {
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
    
    // Get local timezone offset in minutes
    const timezoneOffset = -date.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
    const offsetMinutes = Math.abs(timezoneOffset) % 60;
    const offsetSign = timezoneOffset >= 0 ? '+' : '-';
    const offsetString = `${offsetSign}${String(offsetHours).padStart(2, '0')}${String(offsetMinutes).padStart(2, '0')}`;
    
    // Format in local time (what Plex expects)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hour}${minute}${second} ${offsetString}`;
  };

  // Generate proper channel ID mapping
  const channelIdMap = new Map();
  channels.forEach(channel => {
    // Create a consistent channel ID that matches what's expected
    // Use epg_id if available, otherwise create a normalized ID from channel name/number
    let channelId = channel.epg_id;
    if (!channelId) {
      // Create a normalized channel ID from name and number
      const normalizedName = channel.name.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      channelId = `ch-${channel.number}-${normalizedName}`;
    }
    channelIdMap.set(channel.id, channelId);
  });

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<!DOCTYPE tv SYSTEM "xmltv.dtd">\n';
  xml += '<tv source-info-name="PlexBridge IPTV" source-info-url="https://github.com/plextv/plexbridge" generator-info-name="PlexBridge" generator-info-url="https://github.com/plextv/plexbridge">\n';

  // Add channels with proper structure
  channels.forEach(channel => {
    const channelId = channelIdMap.get(channel.id);
    xml += `  <channel id="${escapeXML(channelId)}">\n`;
    xml += `    <display-name>${escapeXML(channel.name)}</display-name>\n`;
    xml += `    <display-name>${escapeXML(channel.number.toString())}</display-name>\n`;
    
    // Add logical channel number (LCN) for proper Plex integration
    xml += `    <lcn>${escapeXML(channel.number.toString())}</lcn>\n`;
    
    if (channel.logo) {
      xml += `    <icon src="${escapeXML(channel.logo)}" />\n`;
    }
    xml += '  </channel>\n';
  });

  // Add programs with corrected channel references
  programs.forEach(program => {
    // Map program channel_id to the correct channel
    let programChannelId = program.channel_id;
    
    // If program.channel_id looks like a UUID, map it to the correct channel ID
    const channel = channels.find(ch => ch.id === program.channel_id || ch.epg_id === program.channel_id);
    if (channel) {
      programChannelId = channelIdMap.get(channel.id) || program.channel_id;
    }
    
    xml += `  <programme start="${formatXMLTVTime(program.start_time)}" stop="${formatXMLTVTime(program.end_time)}" channel="${escapeXML(programChannelId)}">\n`;
    xml += `    <title lang="en">${escapeXML(program.title)}</title>\n`;
    
    if (program.description) {
      xml += `    <desc lang="en">${escapeXML(program.description)}</desc>\n`;
    }
    
    // Use category from EPG source if set, otherwise use program's category
    let categoryToUse = program.category;
    
    // Try to find the source category if available
    if (epgSourceCategories.size > 0 && program.source_id) {
      const sourceCategory = epgSourceCategories.get(program.source_id);
      if (sourceCategory) {
        categoryToUse = sourceCategory;
      }
    }
    
    if (categoryToUse) {
      xml += `    <category lang="en">${escapeXML(categoryToUse)}</category>\n`;
    }
    
    // Add sub-title (episode title) if available
    if (program.sub_title || program.subtitle) {
      xml += `    <sub-title lang="en">${escapeXML(program.sub_title || program.subtitle)}</sub-title>\n`;
    }
    
    // Add original air date if available
    if (program.original_air_date || program.date) {
      const airDate = program.original_air_date || program.date;
      // Extract year from date for XMLTV format
      const dateMatch = airDate.match(/(\d{4})/);
      if (dateMatch) {
        xml += `    <date>${escapeXML(dateMatch[1])}</date>\n`;
      }
    }
    
    // Add keywords if available
    if (program.keywords || program.category) {
      const keywords = program.keywords || [program.category];
      if (Array.isArray(keywords)) {
        keywords.forEach(keyword => {
          xml += `    <keyword>${escapeXML(keyword)}</keyword>\n`;
        });
      } else {
        xml += `    <keyword>${escapeXML(keywords)}</keyword>\n`;
      }
    }
    
    // Add episode information in multiple formats for better compatibility
    if (program.episode_number && program.season_number) {
      // XMLTV NS format (season.episode.part/total) - Plex expects the full format
      const seasonIndex = program.season_number - 1;
      const episodeIndex = program.episode_number - 1;
      const partIndex = program.part_number ? program.part_number - 1 : 0;
      const totalParts = program.total_parts || 1;
      
      xml += `    <episode-num system="xmltv_ns">${seasonIndex}.${episodeIndex}.${partIndex}/${totalParts}</episode-num>\n`;
      
      // Common alternative format
      xml += `    <episode-num system="onscreen">S${String(program.season_number).padStart(2, '0')}E${String(program.episode_number).padStart(2, '0')}</episode-num>\n`;
    }
    
    // Add video technical details (important for Plex)
    xml += `    <video>\n`;
    xml += `      <colour>yes</colour>\n`;
    xml += `      <aspect>${program.aspect_ratio || '16:9'}</aspect>\n`;
    if (program.resolution) {
      xml += `      <quality>${escapeXML(program.resolution)}</quality>\n`;
    }
    xml += `    </video>\n`;
    
    // Add audio technical details (important for Plex)
    xml += `    <audio>\n`;
    xml += `      <stereo>${program.audio_type || 'stereo'}</stereo>\n`;
    xml += `    </audio>\n`;
    
    // Add rating information if available
    if (program.rating) {
      // Use a generic rating system that's more likely to be accepted
      xml += `    <rating system="VCHIP">\n`;
      xml += `      <value>${escapeXML(program.rating)}</value>\n`;
      xml += `    </rating>\n`;
    }
    
    // Add star rating if available
    if (program.star_rating) {
      xml += `    <star-rating>\n`;
      xml += `      <value>${escapeXML(program.star_rating)}/10</value>\n`;
      xml += `    </star-rating>\n`;
    }
    
    // Add credits if available
    if (program.credits) {
      xml += `    <credits>\n`;
      if (program.credits.director) {
        xml += `      <director>${escapeXML(program.credits.director)}</director>\n`;
      }
      if (program.credits.actors) {
        program.credits.actors.forEach(actor => {
          xml += `      <actor>${escapeXML(actor)}</actor>\n`;
        });
      }
      xml += `    </credits>\n`;
    }
    
    xml += '  </programme>\n';
  });

  xml += '</tv>\n';
  
  return xml;
}

// Generate sample EPG data for Plex compatibility when no EPG sources are configured
function generateSampleEPGData(channels) {
  const samplePrograms = [];
  const now = new Date();
  
  channels.forEach(channel => {
    // Generate 24 hours of sample programming for each channel
    for (let hour = 0; hour < 24; hour++) {
      const startTime = new Date(now.getTime() + (hour * 60 * 60 * 1000));
      const endTime = new Date(startTime.getTime() + (60 * 60 * 1000)); // 1 hour programs
      
      const programTypes = [
        { title: 'News Update', description: 'Latest news and updates' },
        { title: 'Movie Time', description: 'Featured movie presentation' },
        { title: 'Sports Center', description: 'Sports highlights and analysis' },
        { title: 'Documentary', description: 'Educational documentary programming' },
        { title: 'Talk Show', description: 'Celebrity interviews and discussion' },
        { title: 'Comedy Hour', description: 'Comedy and entertainment' },
        { title: 'Drama Series', description: 'Dramatic television series' },
        { title: 'Reality TV', description: 'Reality television programming' }
      ];
      
      const randomProgram = programTypes[Math.floor(Math.random() * programTypes.length)];
      
      samplePrograms.push({
        channel_id: channel.id, // This will be mapped correctly in generateXMLTV
        title: `${randomProgram.title}`,
        sub_title: `Episode ${hour + 1}`,
        description: `${randomProgram.description} on ${channel.name}`,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        category: 'Entertainment',
        keywords: ['Entertainment', channel.name],
        episode_number: (hour % 24) + 1,
        season_number: 1,
        part_number: 1,
        total_parts: 1,
        date: new Date().getFullYear().toString(),
        aspect_ratio: '16:9',
        audio_type: 'stereo',
        rating: 'TV-G'
      });
    }
  });
  
  return samplePrograms;
}

module.exports = router;
