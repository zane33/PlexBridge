const express = require('express');
const router = express.Router();
const epgService = require('../services/epgService');
const database = require('../services/database');
const logger = require('../utils/logger');
const { generateXMLTVCategories } = require('../utils/plexCategories');
const { cacheMiddleware, responseTimeMonitor, optimizeEPGData } = require('../utils/performanceOptimizer');
const { fixProgramMetadata, generateXMLTVProgramme } = require('../utils/plexMetadataFix');
const { channelSwitchingMiddleware, getCurrentProgramFast, generateImmediateEPGResponse } = require('../utils/channelSwitchingFix');

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

// Shared XMLTV request handler with performance optimization
async function handleXMLTVRequest(req, res) {
  const processingStart = Date.now();
  
  try {
    const channelId = req.params.channelId;
    const { days = 3 } = req.query;
    
    // Limit days for Android TV to reduce data size and processing time
    const maxDays = req.get('User-Agent')?.toLowerCase().includes('android') ? 2 : parseInt(days);
    
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000).toISOString();

    let programs;
    let channels;
    let epgSourceCategories = new Map();

    // Fetch EPG source categories and secondary genres for category mapping
    const epgSources = await database.all('SELECT id, category, secondary_genres FROM epg_sources');
    const epgSourceSecondaryGenres = new Map();
    epgSources.forEach(source => {
      if (source.category) {
        epgSourceCategories.set(source.id, source.category);
      }
      if (source.secondary_genres) {
        try {
          const genres = JSON.parse(source.secondary_genres);
          if (Array.isArray(genres) && genres.length > 0) {
            epgSourceSecondaryGenres.set(source.id, genres);
          }
        } catch (error) {
          logger.warn(`Failed to parse secondary genres for source ${source.id}:`, error);
        }
      }
    });

    if (channelId) {
      // Single channel - faster query
      programs = await epgService.getEPGData(channelId, startTime, endTime);
      channels = await database.all('SELECT * FROM channels WHERE id = ? LIMIT 1', [channelId]);
    } else {
      // All channels - use optimized query with limits
      programs = await epgService.getAllEPGData(startTime, endTime);
      channels = await database.all('SELECT * FROM channels WHERE enabled = 1 ORDER BY number LIMIT 100');
      
      // For XMLTV export, don't limit programs to allow Plex to import all EPG data
      // Only apply minimal optimization for Android TV which has stricter memory constraints
      const isAndroidTV = req.get('User-Agent')?.toLowerCase().includes('android');
      if (isAndroidTV) {
        programs = optimizeEPGData(programs, { 
          maxPrograms: 1000  // Increased from 500 for Android TV
        });
      }
      // No program limit for regular Plex clients - allow full EPG import
    }

    // If no programs exist, generate sample EPG data for Plex compatibility
    if (!programs || programs.length === 0) {
      logger.info('No EPG programs found, generating sample data for Plex Android TV compatibility');
      programs = generateSampleEPGData(channels);
    } else {
      // Ensure all programs have required fields for Android TV
      programs = programs.map(program => {
        // Ensure title is always present (Android TV requirement)
        if (!program.title || program.title.trim() === '') {
          program.title = 'Programming';
        }
        // Ensure description is present
        if (!program.description) {
          program.description = `${program.title} on this channel`;
        }
        return program;
      });
    }

    // Generate XMLTV format with categories and secondary genres
    const xmltv = generateXMLTV(channels, programs, epgSourceCategories, epgSourceSecondaryGenres);
    
    const processingTime = Date.now() - processingStart;
    
    res.set({
      'Content-Type': 'application/xml',
      'X-Processing-Time': `${processingTime}ms`,
      'Cache-Control': 'private, max-age=300' // 5 minute cache
    });
    
    if (processingTime > 200) {
      logger.warn('Slow XMLTV generation', {
        channelId: channelId || 'all',
        processingTime: `${processingTime}ms`,
        programCount: programs.length,
        userAgent: req.get('User-Agent')
      });
    }
    
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

// Test route to debug routing issue
router.get('/test-route', async (req, res) => {
  res.json({ message: 'EPG test route works', timestamp: new Date().toISOString() });
});

// Current program for channel with fast channel switching support
router.get('/now/:channelId', channelSwitchingMiddleware(), responseTimeMonitor(25), async (req, res) => {
  try {
    const channelId = req.params.channelId;
    const userAgent = req.get('User-Agent') || '';
    const isAndroidTV = userAgent.toLowerCase().includes('android');
    
    // For Android TV, use fast lookup to prevent channel switching delays
    if (isAndroidTV) {
      const fastProgram = await getCurrentProgramFast(channelId, true);
      
      if (fastProgram) {
        // Add channel info for fast response
        const channel = await database.get('SELECT name, number FROM channels WHERE id = ? OR epg_id = ?', [channelId, channelId]);
        if (channel) {
          fastProgram.channel_name = channel.name;
          fastProgram.channel_number = channel.number;
        }
        
        logger.debug('Fast EPG response for Android TV channel switch', { 
          channelId, 
          title: fastProgram.title,
          isFallback: fastProgram.is_fallback 
        });
        
        return res.json(fastProgram);
      }
    }
    
    // Standard lookup for non-Android TV or when fast lookup fails
    const now = new Date().toISOString();
    let epgChannelId = channelId;
    let internalChannelId = channelId;
    const channel = await database.get('SELECT id, epg_id FROM channels WHERE id = ? OR epg_id = ?', [channelId, channelId]);
    if (channel) {
      epgChannelId = channel.epg_id || channelId;
      internalChannelId = channel.id;
    }

    let program = await database.get(`
      SELECT p.title, p.description, p.start_time, p.end_time, p.category,
             COALESCE(c.name, ec.display_name, 'EPG Channel ' || p.channel_id) as channel_name,
             COALESCE(c.number, 9999) as channel_number
      FROM epg_programs p
      LEFT JOIN channels c ON (c.epg_id = p.channel_id OR c.id = p.channel_id)
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE (p.channel_id = ? OR p.channel_id = ?)
      AND p.start_time <= ?
      AND p.end_time > ?
      ORDER BY p.start_time DESC
      LIMIT 1
    `, [epgChannelId, internalChannelId, now, now]);

    if (!program) {
      // Generate fallback program with proper metadata types
      const channelInfo = await database.get('SELECT name, number FROM channels WHERE id = ? OR epg_id = ?', [channelId, channelId]);
      program = {
        title: channelInfo ? `${channelInfo.name} Live` : 'Live Programming',
        description: channelInfo ? `Live programming on ${channelInfo.name}` : 'Live television programming',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 3600000).toISOString(),
        category: 'Live TV',
        channel_name: channelInfo?.name || 'Unknown Channel',
        channel_number: channelInfo?.number || '0',
        is_fallback: true
      };
      logger.debug('Generated fallback EPG program', { channelId, title: program.title });
    }
    
    // CRITICAL: Apply Android TV metadata enhancements to ALL programs (fixes "Unable to find title" and "Unknown metadata type")
    if (isAndroidTV) {
      const { ensureAndroidTVCompatibility } = require('../utils/androidTvCompat');
      const channelInfo = { 
        id: channelId, 
        name: program.channel_name, 
        number: program.channel_number 
      };
      
      // Ensure we have the channel info for proper metadata enhancement
      if (!program.channel_name || !program.channel_number) {
        const fullChannelInfo = await database.get('SELECT name, number FROM channels WHERE id = ? OR epg_id = ?', [channelId, channelId]);
        if (fullChannelInfo) {
          program.channel_name = fullChannelInfo.name;
          program.channel_number = fullChannelInfo.number;
          channelInfo.name = fullChannelInfo.name;
          channelInfo.number = fullChannelInfo.number;
        }
      }
      
      program = ensureAndroidTVCompatibility(program, channelInfo);
      
      logger.info('Applied Android TV metadata compatibility', { 
        channelId, 
        title: program.title,
        type: program.type, 
        metadata_type: program.metadata_type,
        hasTitle: !!program.title,
        hasType: !!program.type
      });
    }

    // Add optimization headers for Android TV
    if (isAndroidTV) {
      res.set({
        'X-Channel-Switch-Ready': 'true',
        'X-EPG-Source': program.cached_response ? 'cache' : 'database'
      });
    }
    
    // Ensure proper JSON content-type to prevent "expected MediaContainer element, found html" errors
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, must-revalidate'
    });
    
    // Always return valid JSON with complete metadata
    res.json(program);

  } catch (error) {
    logger.error('Current program error:', error);
    
    // For Android TV, provide emergency fallback with proper metadata instead of error
    const userAgent = req.get('User-Agent') || '';
    const isAndroidTV = userAgent.toLowerCase().includes('android');
    
    if (isAndroidTV) {
      const { ensureAndroidTVCompatibility } = require('../utils/androidTvCompat');
      const emergencyProgram = {
        title: 'Live Programming',
        description: 'Live television programming',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 3600000).toISOString(),
        category: 'Live TV',
        channel_name: 'Live TV',
        channel_number: '0',
        is_emergency_fallback: true
      };
      
      const channelInfo = { id: req.params.channelId, name: 'Live TV', number: '0' };
      const enhancedProgram = ensureAndroidTVCompatibility(emergencyProgram, channelInfo);
      
      res.set({
        'Content-Type': 'application/json; charset=utf-8',
        'X-Emergency-Fallback': 'true'
      });
      
      logger.warn('Provided emergency Android TV fallback metadata', { 
        channelId: req.params.channelId,
        title: enhancedProgram.title,
        type: enhancedProgram.type 
      });
      
      return res.json(enhancedProgram);
    }
    
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
    let internalChannelId = channelId;
    const channel = await database.get('SELECT id, epg_id FROM channels WHERE id = ? OR epg_id = ?', [channelId, channelId]);
    if (channel) {
      epgChannelId = channel.epg_id || channelId;
      internalChannelId = channel.id;
    }

    const program = await database.get(`
      SELECT p.*,
             COALESCE(c.name, ec.display_name, 'EPG Channel ' || p.channel_id) as channel_name,
             COALESCE(c.number, 9999) as channel_number
      FROM epg_programs p
      LEFT JOIN channels c ON (c.epg_id = p.channel_id OR c.id = p.channel_id)
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE (p.channel_id = ? OR p.channel_id = ?)
      AND p.start_time > ?
      ORDER BY p.start_time ASC
      LIMIT 1
    `, [epgChannelId, internalChannelId, now]);

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
      SELECT p.*,
             COALESCE(c.name, ec.display_name, 'EPG Channel ' || p.channel_id) as channel_name,
             COALESCE(c.number, 9999) as channel_number
      FROM epg_programs p
      LEFT JOIN channels c ON (c.epg_id = p.channel_id OR c.id = p.channel_id)
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE (p.title LIKE ? OR p.description LIKE ?)
    `;

    const params = [`%${q}%`, `%${q}%`];

    if (channel_id) {
      // Handle both UUID and EPG ID for channel filtering
      const channelInfo = await database.get('SELECT id, epg_id FROM channels WHERE id = ? OR epg_id = ?', [channel_id, channel_id]);
      if (channelInfo) {
        query += ' AND (p.channel_id = ? OR p.channel_id = ?)';
        params.push(channelInfo.epg_id || channel_id, channelInfo.id);
      } else {
        query += ' AND p.channel_id = ?';
        params.push(channel_id);
      }
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
      SELECT p.*,
             COALESCE(c.name, ec.display_name, 'EPG Channel ' || p.channel_id) as channel_name,
             COALESCE(c.number, 9999) as channel_number,
             c.logo as channel_logo
      FROM epg_programs p
      LEFT JOIN channels c ON (c.epg_id = p.channel_id OR c.id = p.channel_id)
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
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
function generateXMLTV(channels, programs, epgSourceCategories = new Map(), epgSourceSecondaryGenres = new Map()) {
  // Create channel to EPG source mapping for category lookup
  const channelToEPGSource = new Map();
  
  // For now, we need to determine which EPG source provides data for each channel
  // This is a simplified approach - in a full implementation, this mapping should be stored in DB
  channels.forEach(channel => {
    // Try to match channel to EPG source based on EPG data origin
    // For  channels (epg_id starts with numbers or mjh-), use  source
    if (channel.epg_id && (channel.epg_id.match(/^\d/) || channel.epg_id.startsWith('mjh-'))) {
      // Find the  EPG source ID
      for (const [sourceId, category] of epgSourceCategories.entries()) {
        // This is a temporary solution - ideally this mapping should be in the database
        if (category) { // If source has a category set, it's likely the one being used
          channelToEPGSource.set(channel.epg_id, sourceId);
          break;
        }
      }
    }
  });
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
    let secondaryGenresToUse = null;
    
    // Try to find the source category and secondary genres if available
    // Map from program.channel_id to EPG source
    // program.channel_id corresponds to channel.epg_id, so use that for mapping
    const epgSourceId = channelToEPGSource.get(program.channel_id);
    if (epgSourceId) {
      const sourceCategory = epgSourceCategories.get(epgSourceId);
      if (sourceCategory) {
        categoryToUse = sourceCategory;
      }
      
      const sourceSecondaryGenres = epgSourceSecondaryGenres.get(epgSourceId);
      if (sourceSecondaryGenres) {
        secondaryGenresToUse = sourceSecondaryGenres;
      }
    }
    
    // Generate multiple Plex-compatible category tags with custom secondary genres
    if (categoryToUse) {
      const categoryElements = generateXMLTVCategories(
        categoryToUse, 
        program.title || '', 
        program.description || '',
        'en',
        secondaryGenresToUse
      );
      xml += categoryElements + '\n';
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
    // Generate 7 days of sample programming for each channel (Android TV needs more data)
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const dayOffset = day * 24 * 60 * 60 * 1000;
        const hourOffset = hour * 60 * 60 * 1000;
        const startTime = new Date(now.getTime() + dayOffset + hourOffset);
        const endTime = new Date(startTime.getTime() + (60 * 60 * 1000)); // 1 hour programs
        
        const programTypes = [
          { title: 'News Update', description: 'Latest news and updates', category: 'News' },
          { title: 'Movie Time', description: 'Featured movie presentation', category: 'Movie' },
          { title: 'Sports Center', description: 'Sports highlights and analysis', category: 'Sports' },
          { title: 'Documentary', description: 'Educational documentary programming', category: 'Documentary' },
          { title: 'Talk Show', description: 'Celebrity interviews and discussion', category: 'Talk' },
          { title: 'Comedy Hour', description: 'Comedy and entertainment', category: 'Comedy' },
          { title: 'Drama Series', description: 'Dramatic television series', category: 'Drama' },
          { title: 'Reality TV', description: 'Reality television programming', category: 'Reality' }
        ];
        
        const randomProgram = programTypes[Math.floor(Math.random() * programTypes.length)];
        
        // Use the channel's epg_id if available, otherwise use the channel.id
        // This ensures proper channel mapping for Android TV
        const channelId = channel.epg_id || channel.id;
        
        // Create program with proper metadata structure
        const program = {
          channel_id: channelId, // Use proper channel ID for mapping
          title: `${randomProgram.title}`, // Clean title without channel name
          sub_title: `Episode ${(day * 24 + hour + 1)}`,
          description: `${randomProgram.description} on ${channel.name}`,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          category: randomProgram.category,
          keywords: [randomProgram.category, channel.name, 'PlexBridge'],
          episode_number: ((day * 24 + hour) % 100) + 1,
          season_number: Math.floor((day * 24 + hour) / 100) + 1,
          part_number: 1,
          total_parts: 1,
          date: startTime.getFullYear().toString(),
          original_air_date: startTime.toISOString().split('T')[0],
          aspect_ratio: '16:9',
          resolution: 'HDTV',
          audio_type: 'stereo',
          rating: 'TV-PG',
          star_rating: (Math.floor(Math.random() * 5) + 5).toString()
        };
        
        // Apply Plex metadata fixes
        const fixedProgram = fixProgramMetadata(program, channel);
        samplePrograms.push(fixedProgram);
      }
    }
  });
  
  return samplePrograms;
}

// Debug endpoint to check EPG cron job status
router.get('/debug/jobs', async (req, res) => {
  try {
    const jobStatus = epgService.getActiveJobs();
    const currentTime = new Date();

    // Get EPG sources to compare with jobs
    const sources = await database.all('SELECT id, name, refresh_interval, last_refresh, last_success, enabled FROM epg_sources');

    res.json({
      timestamp: currentTime.toISOString(),
      timezone: 'UTC',
      epgService: {
        initialized: epgService.isInitialized,
        ...jobStatus
      },
      sources: sources.map(source => ({
        id: source.id,
        name: source.name,
        enabled: source.enabled,
        refresh_interval: source.refresh_interval,
        last_refresh: source.last_refresh,
        last_success: source.last_success,
        hasJob: jobStatus.jobs.some(job => job.sourceId === source.id),
        jobRunning: jobStatus.jobs.find(job => job.sourceId === source.id)?.isRunning || false
      })),
      summary: {
        totalSources: sources.length,
        enabledSources: sources.filter(s => s.enabled).length,
        totalJobs: jobStatus.totalJobs,
        runningJobs: jobStatus.jobs.filter(j => j.isRunning).length
      }
    });
  } catch (error) {
    logger.error('EPG debug endpoint error:', error);
    res.status(500).json({ error: 'Failed to get EPG debug info', details: error.message });
  }
});

// Comprehensive EPG diagnostic endpoint
router.get('/debug/diagnose/:sourceId?', async (req, res) => {
  try {
    const { sourceId } = req.params;
    const diagnosis = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      issues: [],
      recommendations: []
    };

    if (sourceId) {
      // Diagnose specific source
      const source = await database.get('SELECT * FROM epg_sources WHERE id = ?', [sourceId]);

      if (!source) {
        return res.status(404).json({ error: 'EPG source not found' });
      }

      diagnosis.source = {
        id: source.id,
        name: source.name,
        url: source.url,
        enabled: source.enabled,
        last_refresh: source.last_refresh,
        last_success: source.last_success,
        last_error: source.last_error
      };

      // Check connectivity
      try {
        const axios = require('axios');
        const testResponse = await axios.head(source.url, {
          timeout: 10000,
          maxRedirects: 10,
          headers: {
            'User-Agent': 'PlexBridge/1.0 (compatible; EPG Diagnostic)'
          }
        });

        diagnosis.connectivity = {
          status: 'success',
          httpStatus: testResponse.status,
          contentType: testResponse.headers['content-type'],
          contentLength: testResponse.headers['content-length'],
          finalUrl: testResponse.request?.res?.responseUrl || source.url
        };
      } catch (error) {
        diagnosis.connectivity = {
          status: 'failed',
          error: error.message,
          code: error.code,
          httpStatus: error.response?.status
        };
        diagnosis.issues.push(`Connectivity issue: ${error.message}`);
        diagnosis.recommendations.push('Check if the URL is accessible from the production environment');
        diagnosis.recommendations.push('Verify firewall rules and network connectivity');
      }

      // Check program data
      const programCount = await database.get(
        'SELECT COUNT(*) as count FROM epg_programs WHERE channel_id IN (SELECT epg_id FROM epg_channels WHERE source_id = ?)',
        [sourceId]
      );

      const channelCount = await database.get(
        'SELECT COUNT(*) as count FROM epg_channels WHERE source_id = ?',
        [sourceId]
      );

      diagnosis.data = {
        programs: programCount?.count || 0,
        channels: channelCount?.count || 0
      };

      if (programCount?.count === 0) {
        diagnosis.issues.push('No programs stored for this source');
        diagnosis.recommendations.push('Check if channels have correct EPG IDs mapped');
        diagnosis.recommendations.push('Verify XML parsing is working correctly');
      }

      // Check last error details
      if (source.last_error) {
        diagnosis.issues.push(`Last error: ${source.last_error}`);

        if (source.last_error.includes('timeout')) {
          diagnosis.recommendations.push('Increase timeout settings for large EPG files');
        }
        if (source.last_error.includes('parse')) {
          diagnosis.recommendations.push('Verify EPG data is in valid XMLTV format');
        }
      }

    } else {
      // General EPG system diagnosis
      const sources = await database.all('SELECT * FROM epg_sources');
      const totalPrograms = await database.get('SELECT COUNT(*) as count FROM epg_programs');
      const totalChannels = await database.get('SELECT COUNT(*) as count FROM channels');
      const mappedChannels = await database.get(
        'SELECT COUNT(*) as count FROM channels WHERE epg_id IS NOT NULL AND epg_id != \'\''
      );

      diagnosis.system = {
        sources: sources.length,
        enabledSources: sources.filter(s => s.enabled).length,
        totalPrograms: totalPrograms?.count || 0,
        totalChannels: totalChannels?.count || 0,
        mappedChannels: mappedChannels?.count || 0,
        unmappedChannels: (totalChannels?.count || 0) - (mappedChannels?.count || 0)
      };

      // Check for common issues
      if (diagnosis.system.unmappedChannels > 0) {
        diagnosis.issues.push(`${diagnosis.system.unmappedChannels} channels without EPG mapping`);
        diagnosis.recommendations.push('Map channels to EPG IDs in the channel manager');
      }

      const failedSources = sources.filter(s => s.last_error && s.enabled);
      if (failedSources.length > 0) {
        diagnosis.issues.push(`${failedSources.length} sources with errors`);
        diagnosis.failedSources = failedSources.map(s => ({
          id: s.id,
          name: s.name,
          error: s.last_error
        }));
      }

      // Check EPG service health
      const epgHealth = await epgService.getEPGHealth();
      diagnosis.health = epgHealth;

      if (epgHealth.status !== 'healthy') {
        diagnosis.issues.push(`EPG service status: ${epgHealth.status}`);
        diagnosis.issues.push(...epgHealth.issues);
      }
    }

    // Add general recommendations
    if (diagnosis.issues.length > 0) {
      diagnosis.recommendations.push('Check application logs for detailed error messages');
      diagnosis.recommendations.push('Ensure PlexBridge has sufficient memory and CPU resources');
      diagnosis.recommendations.push('Verify database is not corrupted (run integrity check)');
    }

    res.json(diagnosis);
  } catch (error) {
    logger.error('EPG diagnosis error:', error);
    res.status(500).json({
      error: 'Failed to diagnose EPG',
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Test EPG parsing endpoint - useful for debugging specific URLs
router.post('/debug/test-parse', async (req, res) => {
  try {
    const { url, sampleSize = 10 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const axios = require('axios');
    const xml2js = require('xml2js');

    // Download EPG data
    const response = await axios.get(url, {
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024, // 10MB for testing
      responseType: 'text',
      headers: {
        'User-Agent': 'PlexBridge/1.0 (compatible; EPG Test Parser)'
      }
    });

    // Parse XML
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true
    });

    const result = await parser.parseStringPromise(response.data);

    if (!result.tv) {
      return res.json({
        success: false,
        error: 'Invalid XMLTV format - missing tv root element'
      });
    }

    const channels = Array.isArray(result.tv.channel) ? result.tv.channel : [result.tv.channel];
    const programmes = Array.isArray(result.tv.programme) ? result.tv.programme : [result.tv.programme];

    // Sample data for response
    const sampleChannels = channels.slice(0, sampleSize);
    const sampleProgrammes = programmes.slice(0, sampleSize);

    res.json({
      success: true,
      stats: {
        totalChannels: channels.length,
        totalProgrammes: programmes.length,
        xmlSize: response.data.length
      },
      sampleChannels: sampleChannels.map(ch => ({
        id: ch.id,
        displayName: ch['display-name'],
        icon: ch.icon?.src
      })),
      sampleProgrammes: sampleProgrammes.map(p => ({
        channel: p.channel,
        start: p.start,
        stop: p.stop,
        title: p.title
      }))
    });
  } catch (error) {
    logger.error('EPG test parse error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText
      } : undefined
    });
  }
});

// Get available EPG channels for mapping
router.get('/channels/available/:sourceId?', async (req, res) => {
  try {
    const { sourceId } = req.params;

    if (sourceId) {
      // Get EPG channels from specific source
      const epgChannels = await database.all(`
        SELECT epg_id, display_name, icon_url
        FROM epg_channels
        WHERE source_id = ?
        ORDER BY display_name
      `, [sourceId]);

      res.json({
        sourceId,
        channels: epgChannels
      });
    } else {
      // Get all EPG channels across all sources
      const epgChannels = await database.all(`
        SELECT ec.epg_id, ec.display_name, ec.icon_url, es.name as source_name, es.id as source_id
        FROM epg_channels ec
        JOIN epg_sources es ON ec.source_id = es.id
        ORDER BY es.name, ec.display_name
      `);

      res.json({
        channels: epgChannels
      });
    }
  } catch (error) {
    logger.error('Failed to get available EPG channels:', error);
    res.status(500).json({
      error: 'Failed to get EPG channels',
      details: error.message
    });
  }
});

// Auto-suggest channel mappings
router.get('/channels/suggest-mappings/:sourceId?', async (req, res) => {
  try {
    const { sourceId } = req.params;

    // Get unmapped channels
    const unmappedChannels = await database.all(`
      SELECT id, name, number, epg_id
      FROM channels
      WHERE epg_id IS NULL OR epg_id = ''
      ORDER BY number
    `);

    // Get EPG channels
    let epgChannels;
    if (sourceId) {
      epgChannels = await database.all(`
        SELECT epg_id, display_name, icon_url
        FROM epg_channels
        WHERE source_id = ?
        ORDER BY display_name
      `, [sourceId]);
    } else {
      epgChannels = await database.all(`
        SELECT ec.epg_id, ec.display_name, ec.icon_url, es.name as source_name
        FROM epg_channels ec
        JOIN epg_sources es ON ec.source_id = es.id
        ORDER BY ec.display_name
      `);
    }

    // Suggest mappings based on name similarity
    const suggestions = [];

    for (const channel of unmappedChannels) {
      const channelName = channel.name.toLowerCase();

      // Find EPG channels with similar names
      const matches = epgChannels.filter(epgCh => {
        const epgName = epgCh.display_name.toLowerCase();

        // Exact match
        if (channelName === epgName) return true;

        // Contains match
        if (channelName.includes(epgName) || epgName.includes(channelName)) return true;

        // Common abbreviations
        const abbreviations = {
          'tvnz 1': ['tvnz1', 'one'],
          'tvnz 2': ['tvnz2', 'two'],
          'tvnz duke': ['duke'],
          'three': ['tv3', '3'],
          'bravo': ['bravo+1', 'bravo plus'],
          'whakaata māori': ['maori tv', 'māori tv'],
          'eden': ['eden tv']
        };

        for (const [full, abbrevs] of Object.entries(abbreviations)) {
          if (channelName.includes(full) && abbrevs.some(abbrev => epgName.includes(abbrev))) {
            return true;
          }
          if (epgName.includes(full) && abbrevs.some(abbrev => channelName.includes(abbrev))) {
            return true;
          }
        }

        return false;
      });

      if (matches.length > 0) {
        suggestions.push({
          channel: {
            id: channel.id,
            name: channel.name,
            number: channel.number
          },
          suggestions: matches.map(match => ({
            epg_id: match.epg_id,
            display_name: match.display_name,
            source_name: match.source_name || 'Unknown',
            confidence: channelName === match.display_name.toLowerCase() ? 'high' : 'medium'
          }))
        });
      }
    }

    res.json({
      unmappedChannels: unmappedChannels.length,
      totalSuggestions: suggestions.length,
      suggestions
    });

  } catch (error) {
    logger.error('Failed to suggest channel mappings:', error);
    res.status(500).json({
      error: 'Failed to suggest mappings',
      details: error.message
    });
  }
});

// Apply channel mapping
router.post('/channels/map', async (req, res) => {
  try {
    const { channelId, epgId } = req.body;

    if (!channelId || !epgId) {
      return res.status(400).json({
        error: 'Missing required fields: channelId and epgId'
      });
    }

    // Verify the channel exists
    const channel = await database.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Verify the EPG channel exists
    const epgChannel = await database.get('SELECT * FROM epg_channels WHERE epg_id = ?', [epgId]);
    if (!epgChannel) {
      return res.status(404).json({ error: 'EPG channel not found' });
    }

    // Check if another channel is already using this EPG ID
    const existing = await database.get('SELECT * FROM channels WHERE epg_id = ? AND id != ?', [epgId, channelId]);
    if (existing) {
      return res.status(409).json({
        error: 'EPG ID already in use',
        conflictChannel: { id: existing.id, name: existing.name }
      });
    }

    // Update the channel mapping
    await database.run('UPDATE channels SET epg_id = ? WHERE id = ?', [epgId, channelId]);

    logger.info('Channel EPG mapping updated', {
      channelId,
      channelName: channel.name,
      epgId,
      epgName: epgChannel.display_name
    });

    res.json({
      success: true,
      message: 'Channel mapping updated successfully',
      mapping: {
        channel: { id: channel.id, name: channel.name },
        epg: { id: epgChannel.epg_id, name: epgChannel.display_name }
      }
    });

  } catch (error) {
    logger.error('Failed to map channel:', error);
    res.status(500).json({
      error: 'Failed to update channel mapping',
      details: error.message
    });
  }
});

// Bulk apply channel mappings
router.post('/channels/map-bulk', async (req, res) => {
  try {
    const { mappings } = req.body;

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({
        error: 'Missing or invalid mappings array'
      });
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const mapping of mappings) {
      try {
        const { channelId, epgId } = mapping;

        if (!channelId || !epgId) {
          results.errors.push({ mapping, error: 'Missing channelId or epgId' });
          results.failed++;
          continue;
        }

        // Verify channel exists
        const channel = await database.get('SELECT * FROM channels WHERE id = ?', [channelId]);
        if (!channel) {
          results.errors.push({ mapping, error: 'Channel not found' });
          results.failed++;
          continue;
        }

        // Update mapping
        await database.run('UPDATE channels SET epg_id = ? WHERE id = ?', [epgId, channelId]);
        results.successful++;

      } catch (error) {
        results.errors.push({ mapping, error: error.message });
        results.failed++;
      }
    }

    logger.info('Bulk channel mapping completed', {
      successful: results.successful,
      failed: results.failed,
      total: mappings.length
    });

    res.json({
      success: results.failed === 0,
      results
    });

  } catch (error) {
    logger.error('Failed to bulk map channels:', error);
    res.status(500).json({
      error: 'Failed to bulk update channel mappings',
      details: error.message
    });
  }
});

module.exports = router;
