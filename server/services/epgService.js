const axios = require('axios');
const xml2js = require('xml2js');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { gzip, gunzip } = require('zlib');
const { promisify } = require('util');

const logger = require('../utils/logger');
const config = require('../config');
const database = require('./database');
const cacheService = require('./cacheService');
const { ensureAndroidTVCompatibility, generateFallbackProgram } = require('../utils/androidTvCompat');

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

class EPGService {
  constructor() {
    this.isInitialized = false;
    this.refreshJobs = new Map();
    this.localizationSettings = {
      timezone: 'UTC',
      locale: 'en-US',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h'
    };
    this.parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true
    });
  }

  async initialize() {
    if (this.isInitialized) {
      logger.info('EPG service already initialized');
      return;
    }

    try {
      // Check if database is available and initialized
      if (!database || !database.isInitialized) {
        throw new Error('Database not initialized - cannot initialize EPG service');
      }

      // Get all EPG sources from database
      const sources = await database.all('SELECT * FROM epg_sources WHERE enabled = 1');
      
      logger.info('Found EPG sources for initialization', { 
        sourceCount: sources.length,
        sources: sources.map(s => ({ id: s.id, name: s.name, url: s.url }))
      });
      
      // Schedule refresh jobs for each source
      for (const source of sources) {
        await this.scheduleRefresh(source);
      }

      // Schedule cleanup job (daily at 2 AM)
      cron.schedule('0 2 * * *', async () => {
        await this.cleanup();
      });

      this.isInitialized = true;
      logger.info('✅ EPG service initialized successfully', { 
        sourceCount: sources.length,
        scheduledJobs: this.refreshJobs.size
      });

      // Trigger immediate refresh for sources that have never been refreshed
      const unrefreshedSources = sources.filter(s => !s.last_success);
      if (unrefreshedSources.length > 0) {
        logger.info('Triggering immediate refresh for unrefreshed sources', {
          sourceCount: unrefreshedSources.length
        });
        
        // Trigger refreshes in background without blocking initialization
        for (const source of unrefreshedSources) {
          setImmediate(() => this.refreshSource(source.id).catch(err => 
            logger.error('Background refresh failed:', { sourceId: source.id, error: err.message })
          ));
        }
      }

    } catch (error) {
      logger.error('❌ EPG service initialization failed:', error);
      this.isInitialized = false; // Ensure we stay uninitialized on failure
      throw error;
    }
  }

  async scheduleRefresh(source) {
    try {
      // Parse refresh interval
      const interval = this.parseInterval(source.refresh_interval);
      const cronExpression = this.intervalToCron(interval, source.id);

      // Cancel existing job if any
      if (this.refreshJobs.has(source.id)) {
        this.refreshJobs.get(source.id).destroy();
      }

      // Schedule new job with enhanced logging
      const job = cron.schedule(cronExpression, async () => {
        logger.info('EPG cron job triggered', { 
          sourceId: source.id, 
          sourceName: source.name,
          cronExpression,
          timestamp: new Date().toISOString()
        });
        try {
          await this.refreshSource(source.id);
        } catch (error) {
          logger.error('EPG cron job failed', { 
            sourceId: source.id, 
            sourceName: source.name,
            error: error.message,
            stack: error.stack
          });
        }
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      this.refreshJobs.set(source.id, job);
      
      logger.info('EPG refresh scheduled', { 
        sourceId: source.id, 
        interval: source.refresh_interval,
        cronExpression,
        category: 'epg'
      });

      // Perform initial refresh if never refreshed
      if (!source.last_success) {
        setImmediate(() => this.refreshSource(source.id));
      }

    } catch (error) {
      logger.error('EPG schedule error:', { sourceId: source.id, error: error.message });
    }
  }

  parseInterval(intervalStr) {
    const match = intervalStr.match(/^(\d+)([hmd])$/);
    if (!match) {
      throw new Error(`Invalid interval format: ${intervalStr}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'h': return { value, unit: 'hours' };
      case 'd': return { value, unit: 'days' };
      case 'm': return { value, unit: 'minutes' };
      default: throw new Error(`Invalid interval unit: ${unit}`);
    }
  }

  intervalToCron(interval, sourceId = null) {
    const { value, unit } = interval;

    // Generate a consistent minute offset for each source to prevent all sources
    // from refreshing at the same time (staggering)
    let minute = 0;
    if (sourceId) {
      // Use sourceId to generate a consistent but distributed minute offset
      const hash = sourceId.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);
      minute = Math.abs(hash) % 60; // 0-59 minutes
    }

    switch (unit) {
      case 'minutes':
        return `*/${value} * * * *`;
      case 'hours':
        return `${minute} */${value} * * *`;
      case 'days':
        return `${minute} 0 */${value} * *`;
      default:
        return `${minute} */4 * * *`; // Default: every 4 hours with staggered minutes
    }
  }

  async refreshSource(sourceId) {
    let source;
    
    try {
      source = await database.get('SELECT * FROM epg_sources WHERE id = ? AND enabled = 1', [sourceId]);
      
      if (!source) {
        logger.epg('EPG source not found or disabled', { sourceId });
        return;
      }

      logger.epg('Starting EPG refresh', { 
        sourceId, 
        sourceName: source.name,
        url: source.url 
      });

      // Update last refresh time
      await database.run(
        'UPDATE epg_sources SET last_refresh = CURRENT_TIMESTAMP WHERE id = ?',
        [sourceId]
      );

      // Download EPG data with error handling
      let epgData;
      try {
        epgData = await this.downloadEPG(source);
      } catch (downloadError) {
        logger.error('EPG download failed for source', {
          sourceId,
          sourceName: source.name,
          url: source.url,
          error: downloadError.message
        });
        
        // Update database with error status
        await database.run(
          'UPDATE epg_sources SET last_error = ? WHERE id = ?',
          [downloadError.message, sourceId]
        );
        
        // Don't throw during background refresh - just log and return
        logger.warn('EPG refresh failed for source, will retry on next cycle', {
          sourceId,
          sourceName: source.name,
          error: downloadError.message
        });
        return;
      }
      
      // Parse EPG XML (now includes storing channel information)
      let programs;
      try {
        programs = await this.parseEPG(epgData, sourceId);
      } catch (parseError) {
        logger.error('EPG parsing failed for source', {
          sourceId,
          sourceName: source.name,
          error: parseError.message,
          dataPreview: epgData.substring(0, 500)
        });
        
        // Update database with error status
        await database.run(
          'UPDATE epg_sources SET last_error = ? WHERE id = ?',
          ['Parse error: ' + parseError.message, sourceId]
        );
        
        // Don't throw during background refresh - just log and return
        logger.warn('EPG parsing failed for source, will retry on next cycle', {
          sourceId,
          sourceName: source.name,
          error: parseError.message
        });
        return;
      }
      
      if (programs.length === 0) {
        logger.warn('No programs parsed from EPG source', { 
          sourceId, 
          sourceName: source.name,
          url: source.url,
          dataLength: epgData.length 
        });
        
        // This might be okay - some sources might have channels but no current programs
        // Don't throw an error, just log it
      }
      
      // Store programs in database
      logger.info('About to store programs', {
        sourceId,
        programCount: programs.length,
        samplePrograms: programs.slice(0, 2).map(p => ({
          id: p.id,
          channel_id: p.channel_id,
          title: p.title,
          start_time: p.start_time
        }))
      });
      
      await this.storePrograms(programs);
      
      // Update success timestamp and clear any previous errors
      await database.run(
        'UPDATE epg_sources SET last_success = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?',
        [sourceId]
      );

      // Clear EPG cache
      await this.clearEPGCache();

      logger.epg('EPG refresh completed successfully', { 
        sourceId,
        sourceName: source.name,
        programCount: programs.length,
        url: source.url 
      });

    } catch (error) {
      logger.error('EPG refresh failed', { 
        sourceId, 
        sourceName: source?.name,
        url: source?.url,
        error: error.message,
        stack: error.stack
      });
      
      // Re-throw to maintain existing behavior
      throw error;
    }
  }

  async downloadEPG(source) {
    try {
      logger.info('Starting EPG download', { 
        url: source.url,
        sourceId: source.id,
        sourceName: source.name
      });

      const response = await axios.get(source.url, {
        timeout: config.epg.timeout || 60000, // Default 60 seconds
        maxContentLength: config.epg.maxFileSize || 50 * 1024 * 1024, // Default 50MB
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'PlexBridge/1.0 (compatible; EPG Fetcher)',
          'Accept': 'application/xml, text/xml, */*',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        // Follow redirects
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 300; // Accept only 2xx status codes
        }
      });

      logger.info('EPG download response received', {
        status: response.status,
        contentType: response.headers['content-type'],
        contentEncoding: response.headers['content-encoding'],
        contentLength: response.headers['content-length'],
        dataSize: response.data.length,
        finalUrl: response.request?.res?.responseUrl || source.url // Log the final URL after redirects
      });

      let data = response.data;

      // Handle various compression formats
      const encoding = response.headers['content-encoding'];
      if (encoding) {
        if (encoding.includes('gzip')) {
          logger.debug('Decompressing gzipped EPG data');
          data = await gunzipAsync(data);
        } else if (encoding.includes('deflate')) {
          logger.debug('Decompressing deflated EPG data');
          const inflate = promisify(require('zlib').inflate);
          data = await inflate(data);
        } else if (encoding.includes('br')) {
          logger.debug('Decompressing brotli EPG data');
          const brotliDecompress = promisify(require('zlib').brotliDecompress);
          data = await brotliDecompress(data);
        }
      }

      // Also check if data starts with gzip magic number even without encoding header
      if (data[0] === 0x1f && data[1] === 0x8b) {
        logger.debug('Detected gzip magic number, decompressing');
        data = await gunzipAsync(data);
      }

      // Convert to string
      const xmlData = data.toString('utf8');
      
      logger.debug('EPG data converted to string', {
        dataLength: xmlData.length,
        firstChars: xmlData.substring(0, 100)
      });
      
      // More comprehensive validation
      if (!xmlData || xmlData.trim().length === 0) {
        throw new Error('Empty EPG data received');
      }
      
      // Check for valid XML structure
      if (!xmlData.includes('<?xml') && !xmlData.includes('<tv')) {
        logger.warn('EPG data may not be valid XML', {
          first500Chars: xmlData.substring(0, 500)
        });
      }
      
      // Basic XMLTV validation
      if (!xmlData.includes('<tv') && !xmlData.includes('<programme')) {
        throw new Error('Invalid EPG XML format - missing required XMLTV elements');
      }

      logger.info('EPG download successful', {
        sourceId: source.id,
        dataSize: xmlData.length
      });

      return xmlData;

    } catch (error) {
      logger.error('EPG download failed', {
        sourceId: source.id,
        url: source.url,
        error: error.message,
        code: error.code,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers
        } : null
      });

      if (error.response) {
        if (error.response.status === 404) {
          throw new Error(`EPG source not found (404) - URL may be incorrect or the source may have moved`);
        } else if (error.response.status === 403) {
          throw new Error(`EPG source access forbidden (403) - check if authentication is required`);
        } else if (error.response.status >= 500) {
          throw new Error(`EPG source server error (${error.response.status}) - try again later`);
        } else {
          throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Download timeout - EPG source may be slow or unresponsive');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('EPG source URL could not be resolved - check the URL');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Connection refused - EPG source may be down');
      } else if (error.code === 'ETIMEDOUT') {
        throw new Error('Connection timeout - EPG source may be unreachable');
      } else {
        throw error;
      }
    }
  }

  async parseEPG(xmlData, sourceId) {
    try {
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result.tv) {
        throw new Error('Invalid XMLTV format - missing tv root element');
      }

      const channels = this.normalizeArray(result.tv.channel || []);
      const programmes = this.normalizeArray(result.tv.programme || []);

      logger.info('EPG parsing completed', { 
        sourceId,
        channelCount: channels.length,
        programmeCount: programmes.length,
        xmlSize: xmlData.length,
        sampleProgrammes: programmes.slice(0, 3).map(p => ({
          channel: p.channel,
          title: this.extractText(p.title),
          start: p.start,
          stop: p.stop
        }))
      });

      // Process and store channel information first
      const channelMap = new Map();
      const epgChannels = [];
      
      for (const channel of channels) {
        if (channel.id) {
          const displayName = this.extractText(channel['display-name']);
          const iconUrl = channel.icon?.src || null;
          
          channelMap.set(channel.id, {
            id: channel.id,
            name: displayName,
            icon: iconUrl
          });

          // Prepare for database storage
          epgChannels.push({
            epg_id: channel.id,
            display_name: displayName,
            icon_url: iconUrl,
            source_id: sourceId
          });
        }
      }

      // Store EPG channels in database
      if (epgChannels.length > 0) {
        await this.storeEPGChannels(epgChannels, sourceId);
      }

      // Process programmes
      const programs = [];
      let successfulParsed = 0;
      let failedParsed = 0;
      
      for (const programme of programmes) {
        try {
          const program = this.parseProgram(programme, channelMap);
          if (program) {
            programs.push(program);
            successfulParsed++;
          } else {
            failedParsed++;
          }
        } catch (error) {
          failedParsed++;
          logger.debug('Failed to parse program', { 
            programme: programme.channel,
            title: this.extractText(programme.title),
            error: error.message 
          });
        }
      }

      logger.info('EPG programme processing results', {
        sourceId,
        totalProgrammes: programmes.length,
        successfullyParsed: successfulParsed,
        failedToParse: failedParsed,
        finalProgramCount: programs.length
      });

      return programs;

    } catch (error) {
      logger.error('EPG XML parsing failed:', error);
      throw error;
    }
  }

  parseProgram(programme, channelMap) {
    // **CRITICAL FIX**: xml2js merges attributes into the main object when mergeAttrs: true
    // So programme.channel, programme.start, programme.stop should be the attribute values
    if (!programme.channel || !programme.start || !programme.stop) {
      logger.debug('Programme missing required fields', {
        hasChannel: !!programme.channel,
        hasStart: !!programme.start,
        hasStop: !!programme.stop,
        channel: programme.channel,
        rawProgramme: JSON.stringify(programme, null, 2)
      });
      return null;
    }

    try {
      // **CRITICAL FIX**: Use EPG channel ID directly, don't try to map to internal channel
      // This allows programs to be stored even without channel mapping
      const program = {
        id: `${programme.channel}_${programme.start}`,
        channel_id: programme.channel, // Use EPG channel ID directly
        title: this.extractText(programme.title) || 'Unknown',
        description: this.extractText(programme.desc) || null,
        start_time: this.parseXMLTVTime(programme.start),
        end_time: this.parseXMLTVTime(programme.stop),
        category: this.extractText(programme.category) || null,
        episode_number: programme['episode-num'] ? this.parseEpisodeNumber(programme['episode-num']) : null,
        season_number: programme['episode-num'] ? this.parseSeasonNumber(programme['episode-num']) : null
      };

      logger.debug('Successfully parsed programme', {
        id: program.id,
        channel_id: program.channel_id,
        title: program.title,
        start_time: program.start_time,
        end_time: program.end_time
      });

      return program;
    } catch (error) {
      logger.warn('Failed to parse programme', {
        channel: programme.channel,
        start: programme.start,
        stop: programme.stop,
        title: this.extractText(programme.title),
        error: error.message
      });
      return null;
    }
  }

  async findChannelByEpgId(epgId) {
    try {
      // First try exact EPG ID match
      const channel = await database.get('SELECT id FROM channels WHERE epg_id = ?', [epgId]);
      if (channel) {
        return channel.id;
      }

      // If no exact match, try case-insensitive match
      const channelCaseInsensitive = await database.get(
        'SELECT id FROM channels WHERE LOWER(epg_id) = LOWER(?)', 
        [epgId]
      );
      if (channelCaseInsensitive) {
        logger.debug('Found channel with case-insensitive EPG ID match', { 
          epgId, 
          channelId: channelCaseInsensitive.id 
        });
        return channelCaseInsensitive.id;
      }

      // Enhanced logging with mapping suggestions
      const epgChannelInfo = await database.get(
        'SELECT display_name FROM epg_channels WHERE epg_id = ?',
        [epgId]
      );
      
      logger.warn('No channel mapping found for EPG ID', { 
        epgId,
        displayName: epgChannelInfo?.display_name || 'Unknown',
        suggestion: `Create channel or update existing channel EPG ID to: ${epgId}`,
        availableChannels: await this.getUnmappedChannelsCount()
      });
      return null;
    } catch (error) {
      logger.error('Error finding channel by EPG ID', { epgId, error: error.message });
      return null;
    }
  }

  async getUnmappedChannelsCount() {
    try {
      const result = await database.get(
        'SELECT COUNT(*) as count FROM channels WHERE epg_id IS NULL OR epg_id = ""'
      );
      return result?.count || 0;
    } catch (error) {
      return 0;
    }
  }

  parseXMLTVTime(timeStr) {
    // XMLTV time format: YYYYMMDDHHMMSS +TIMEZONE
    const match = timeStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
    
    if (!match) {
      throw new Error(`Invalid XMLTV time format: ${timeStr}`);
    }

    const [, year, month, day, hour, minute, second, timezone] = match;
    
    // Create ISO string
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    
    if (timezone) {
      return new Date(isoString + timezone.replace(/(\d{2})(\d{2})/, '$1:$2')).toISOString();
    } else {
      return new Date(isoString + 'Z').toISOString();
    }
  }

  parseEpisodeNumber(episodeNum) {
    if (typeof episodeNum === 'string') {
      const match = episodeNum.match(/\.(\d+)\./);
      return match ? parseInt(match[1]) + 1 : null; // XMLTV uses 0-based indexing
    }
    return null;
  }

  parseSeasonNumber(episodeNum) {
    if (typeof episodeNum === 'string') {
      const match = episodeNum.match(/^(\d+)\./);
      return match ? parseInt(match[1]) + 1 : null; // XMLTV uses 0-based indexing
    }
    return null;
  }

  extractText(element) {
    if (!element) return null;
    
    if (typeof element === 'string') {
      return element.trim();
    }
    
    if (Array.isArray(element)) {
      return element[0]?._ || element[0] || null;
    }
    
    return element._ || element || null;
  }

  normalizeArray(item) {
    return Array.isArray(item) ? item : [item];
  }

  async storeEPGChannels(epgChannels, sourceId) {
    if (epgChannels.length === 0) {
      return;
    }

    try {
      database.transaction(() => {
        // Clear old EPG channels for this source
        database.db.prepare('DELETE FROM epg_channels WHERE source_id = ?').run(sourceId);

        // Insert new EPG channels in batches
        const batchSize = 1000;
        const insertSQL = `
          INSERT OR REPLACE INTO epg_channels 
          (epg_id, display_name, icon_url, source_id)
          VALUES (?, ?, ?, ?)
        `;

        const insertStmt = database.db.prepare(insertSQL);
        
        for (let i = 0; i < epgChannels.length; i += batchSize) {
          const batch = epgChannels.slice(i, i + batchSize);
          
          for (const channel of batch) {
            insertStmt.run(
              channel.epg_id,
              channel.display_name,
              channel.icon_url,
              channel.source_id
            );
          }
        }
      });

      logger.epg('EPG channels stored', { count: epgChannels.length, sourceId });

    } catch (error) {
      logger.error('EPG channels storage failed:', error);
      throw error;
    }
  }

  async storePrograms(programs) {
    if (programs.length === 0) {
      logger.warn('No programs to store - check channel mappings', {
        suggestion: 'Ensure channels have correct EPG IDs that match XMLTV source'
      });
      return;
    }

    try {
      database.transaction(() => {
        // Clear old programs first
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const deletedResult = database.db.prepare('DELETE FROM epg_programs WHERE end_time < ?').run(threeDaysAgo);
        
        logger.info('Cleared old EPG programs', { 
          deletedCount: deletedResult.changes,
          cutoffDate: threeDaysAgo 
        });

        // Insert new programs in batches
        const batchSize = 1000;
        const insertSQL = `
          INSERT OR REPLACE INTO epg_programs 
          (id, channel_id, title, description, start_time, end_time, category, episode_number, season_number)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        let insertedCount = 0;
        let errorCount = 0;
        const channelCounts = {};
        const insertStmt = database.db.prepare(insertSQL);
        
        for (let i = 0; i < programs.length; i += batchSize) {
          const batch = programs.slice(i, i + batchSize);
          
          for (const program of batch) {
            try {
              const result = insertStmt.run(
                program.id,
                program.channel_id,
                program.title,
                program.description,
                program.start_time,
                program.end_time,
                program.category,
                program.episode_number,
                program.season_number
              );
              insertedCount++;
              
              // Count programs per channel for reporting
              channelCounts[program.channel_id] = (channelCounts[program.channel_id] || 0) + 1;
              
              // Log first few successful inserts for debugging
              if (insertedCount <= 3) {
                logger.info('Successfully inserted program', {
                  programId: program.id,
                  channelId: program.channel_id,
                  title: program.title,
                  changes: result.changes
                });
              }
            } catch (error) {
              errorCount++;
              logger.error('Failed to insert program', { 
                programId: program.id,
                channelId: program.channel_id,
                title: program.title,
                start_time: program.start_time,
                end_time: program.end_time,
                error: error.message,
                stack: error.stack
              });
            }
          }
        }
        
        if (errorCount > 0) {
          logger.warn('Some programs failed to insert', { 
            total: programs.length,
            inserted: insertedCount,
            errors: errorCount 
          });
        }
        
        logger.info('EPG programs stored successfully', {
          totalPrograms: insertedCount,
          channelsWithPrograms: Object.keys(channelCounts).length,
          programsPerChannel: channelCounts
        });
      });

      logger.epg('EPG programs storage completed', { 
        inserted: programs.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('EPG storage failed:', error);
      throw error;
    }
  }

  async getEPGData(channelId, startTime, endTime) {
    try {
      // Check cache first
      const cacheKey = `epg:${channelId}:${startTime}:${endTime}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      // Get channel info for fallback generation
      const channel = await database.get('SELECT * FROM channels WHERE id = ? OR epg_id = ?', 
        [channelId, channelId]);

      // Query database
      let programs = await database.all(`
        SELECT p.*, ec.source_id 
        FROM epg_programs p
        LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
        WHERE p.channel_id = ? 
        AND p.start_time <= ? 
        AND p.end_time >= ?
        ORDER BY start_time
      `, [channelId, endTime, startTime]);

      // If no programs found, generate fallback data for Android TV compatibility
      if (!programs || programs.length === 0) {
        logger.debug('No EPG data found, generating fallback for Android TV', { channelId });
        const start = new Date(startTime);
        const end = new Date(endTime);
        const duration = (end - start) / (1000 * 60 * 60); // hours
        
        programs = [];
        let currentTime = start;
        while (currentTime < end) {
          const program = generateFallbackProgram(channel || { id: channelId, name: 'Channel' }, currentTime, 1);
          programs.push(ensureAndroidTVCompatibility(program, channel));
          currentTime = new Date(currentTime.getTime() + (60 * 60 * 1000)); // Add 1 hour
        }
      } else {
        // Ensure all programs have Android TV compatible metadata
        programs = programs.map(p => ensureAndroidTVCompatibility(p, channel));
      }

      // Cache for 1 hour
      await cacheService.set(cacheKey, programs, 3600);

      return programs;

    } catch (error) {
      logger.error('EPG data retrieval failed:', { channelId, error: error.message });
      return [];
    }
  }

  async getAllEPGData(startTime, endTime) {
    try {
      const cacheKey = `epg:all:${startTime}:${endTime}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      let programs = await database.all(`
        SELECT p.*, 
               COALESCE(c.name, ec.display_name, 'EPG Channel ' || p.channel_id) as channel_name, 
               COALESCE(c.number, 9999) as channel_number, 
               ec.source_id,
               CASE WHEN c.epg_id IS NULL THEN 1 ELSE 0 END as is_orphaned
        FROM epg_programs p
        LEFT JOIN channels c ON c.epg_id = p.channel_id
        LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
        WHERE p.start_time <= ? 
        AND p.end_time >= ?
        ORDER BY channel_number, p.start_time
      `, [endTime, startTime]);

      // Log EPG program statistics including orphaned programs
      if (programs && programs.length > 0) {
        const orphanedPrograms = programs.filter(p => p.is_orphaned === 1);
        const mappedPrograms = programs.filter(p => p.is_orphaned === 0);
        
        logger.info('EPG data retrieved with orphaned program inclusion', {
          totalPrograms: programs.length,
          mappedPrograms: mappedPrograms.length,
          orphanedPrograms: orphanedPrograms.length,
          orphanedPercentage: Math.round((orphanedPrograms.length / programs.length) * 100)
        });
      }

      // If no programs found, generate fallback data for all channels
      if (!programs || programs.length === 0) {
        logger.info('No EPG data found, generating fallback for all channels for Android TV');
        const channels = await database.all('SELECT * FROM channels WHERE enabled = 1');
        programs = [];
        
        for (const channel of channels) {
          const start = new Date(startTime);
          const end = new Date(endTime);
          let currentTime = start;
          
          while (currentTime < end) {
            const program = generateFallbackProgram(channel, currentTime, 1);
            const enhanced = ensureAndroidTVCompatibility(program, channel);
            enhanced.channel_name = channel.name;
            enhanced.channel_number = channel.number;
            programs.push(enhanced);
            currentTime = new Date(currentTime.getTime() + (60 * 60 * 1000));
          }
        }
      } else {
        // Ensure all programs have Android TV compatible metadata
        const channelMap = new Map();
        const channels = await database.all('SELECT * FROM channels');
        channels.forEach(ch => {
          channelMap.set(ch.epg_id, ch);
          channelMap.set(ch.id, ch);
        });
        
        programs = programs.map(p => {
          const channel = channelMap.get(p.channel_id);
          return ensureAndroidTVCompatibility(p, channel);
        });
      }

      // Cache for 30 minutes
      await cacheService.set(cacheKey, programs, 1800);

      return programs;

    } catch (error) {
      logger.error('All EPG data retrieval failed:', error);
      return [];
    }
  }

  async clearEPGCache() {
    try {
      const keys = await cacheService.keys('epg:*');
      for (const key of keys) {
        await cacheService.del(key);
      }
      logger.epg('EPG cache cleared');
    } catch (error) {
      logger.error('EPG cache clear failed:', error);
    }
  }

  async forceRefresh(sourceId) {
    logger.epg('Force refresh requested', { sourceId });
    await this.refreshSource(sourceId);
  }

  async addSource(sourceData) {
    try {
      const { id, name, url, refresh_interval = '4h', category = null, secondary_genres = null } = sourceData;
      
      // Convert secondary_genres array to JSON string for storage
      const secondaryGenresJson = secondary_genres && secondary_genres.length > 0 ? JSON.stringify(secondary_genres) : null;
      
      await database.run(`
        INSERT INTO epg_sources (id, name, url, refresh_interval, enabled, category, secondary_genres)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `, [id, name, url, refresh_interval, category, secondaryGenresJson]);

      // Only schedule refresh if service is initialized
      if (this.isInitialized) {
        const source = await database.get('SELECT * FROM epg_sources WHERE id = ?', [id]);
        await this.scheduleRefresh(source);
        logger.epg('EPG source added and scheduled', { id, url });
      } else {
        logger.epg('EPG source added (refresh scheduling deferred until service initialization)', { id, url });
      }

      return true;

    } catch (error) {
      logger.error('EPG source add failed:', error);
      throw error;
    }
  }

  async removeSource(sourceId) {
    try {
      // Cancel refresh job
      if (this.refreshJobs.has(sourceId)) {
        this.refreshJobs.get(sourceId).stop();
        this.refreshJobs.delete(sourceId);
      }

      // Remove associated EPG channels and programs first (foreign key dependencies)
      await database.run('DELETE FROM epg_channels WHERE source_id = ?', [sourceId]);
      
      await database.run(`
        DELETE FROM epg_programs 
        WHERE channel_id IN (
          SELECT id FROM channels WHERE epg_id LIKE ?
        )
      `, [`%${sourceId}%`]);

      // Remove from database (parent table last)
      await database.run('DELETE FROM epg_sources WHERE id = ?', [sourceId]);

      logger.epg('EPG source removed', { sourceId });
      return true;

    } catch (error) {
      logger.error('EPG source removal failed:', error);
      throw error;
    }
  }

  async cleanup() {
    try {
      // Remove old programs (older than 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = await database.run(
        'DELETE FROM epg_programs WHERE end_time < ?',
        [sevenDaysAgo]
      );

      logger.epg('EPG cleanup completed', { deletedPrograms: result.changes });

    } catch (error) {
      logger.error('EPG cleanup failed:', error);
    }
  }

  async getStatus() {
    try {
      // Check if database is available
      if (!database || !database.isInitialized) {
        return {
          status: 'database_unavailable',
          sources: [],
          programs: { total: 0, upcoming24h: 0 },
          isInitialized: false,
          message: 'Database not initialized'
        };
      }

      const sources = await database.all('SELECT * FROM epg_sources') || [];
      const totalPrograms = await database.get('SELECT COUNT(*) as count FROM epg_programs') || { count: 0 };
      
      const now = new Date().toISOString();
      const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      const upcomingPrograms = await database.get(`
        SELECT COUNT(*) as count FROM epg_programs 
        WHERE start_time BETWEEN ? AND ?
      `, [now, nextDay]) || { count: 0 };

      // Get channel mapping statistics
      const channelStats = await database.get(`
        SELECT 
          COUNT(*) as total_channels,
          SUM(CASE WHEN epg_id IS NOT NULL AND epg_id != '' THEN 1 ELSE 0 END) as mapped_channels
        FROM channels
      `) || { total_channels: 0, mapped_channels: 0 };

      // Get EPG channels count
      const epgChannelsCount = await database.get(
        'SELECT COUNT(*) as count FROM epg_channels'
      ) || { count: 0 };

      // Determine if initialization should be forced
      const shouldInitialize = !this.isInitialized && sources.length > 0;
      
      if (shouldInitialize) {
        logger.info('EPG service not initialized but sources exist, initializing now');
        // Initialize in background without blocking status response
        setImmediate(() => this.initialize().catch(err => 
          logger.error('Background EPG initialization failed:', err)
        ));
      }

      return {
        status: 'available',
        sources: Array.isArray(sources) ? sources.map(source => ({
          id: source.id,
          name: source.name,
          enabled: source.enabled,
          lastRefresh: source.last_refresh,
          lastSuccess: source.last_success,
          nextRefresh: this.getNextRefreshTime(source)
        })) : [],
        programs: {
          total: totalPrograms?.count || 0,
          upcoming24h: upcomingPrograms?.count || 0
        },
        channels: {
          total: channelStats.total_channels || 0,
          mapped: channelStats.mapped_channels || 0,
          epgAvailable: epgChannelsCount.count || 0
        },
        mapping: {
          efficiency: channelStats.total_channels > 0 
            ? Math.round((channelStats.mapped_channels / channelStats.total_channels) * 100)
            : 0,
          needsMapping: Math.max(0, channelStats.total_channels - channelStats.mapped_channels)
        },
        isInitialized: this.isInitialized,
        lastCheck: new Date().toISOString()
      };

    } catch (error) {
      logger.error('EPG status retrieval failed:', error);
      return { 
        status: 'error',
        error: error.message,
        sources: [],
        programs: { total: 0, upcoming24h: 0 },
        channels: { total: 0, mapped: 0, epgAvailable: 0 },
        mapping: { efficiency: 0, needsMapping: 0 },
        isInitialized: false,
        lastCheck: new Date().toISOString()
      };
    }
  }

  getNextRefreshTime(source) {
    // This is a simplified calculation - in practice, you'd want to 
    // calculate based on the cron schedule
    const interval = this.parseInterval(source.refresh_interval);
    const lastRefresh = new Date(source.last_refresh || Date.now());
    
    switch (interval.unit) {
      case 'hours':
        return new Date(lastRefresh.getTime() + interval.value * 60 * 60 * 1000);
      case 'days':
        return new Date(lastRefresh.getTime() + interval.value * 24 * 60 * 60 * 1000);
      case 'minutes':
        return new Date(lastRefresh.getTime() + interval.value * 60 * 1000);
      default:
        return new Date(lastRefresh.getTime() + 4 * 60 * 60 * 1000); // 4 hours default
    }
  }

  // Update localization settings for EPG output
  updateLocalizationSettings(settings) {
    try {
      if (settings) {
        this.localizationSettings = { ...this.localizationSettings, ...settings };
        logger.info('EPG service localization settings updated', this.localizationSettings);
        
        // Clear XML cache to regenerate with new settings
        cacheService.del('epg:xml:combined').catch(err => 
          logger.warn('Failed to clear EPG XML cache:', err)
        );
      }
    } catch (error) {
      logger.error('Failed to update EPG localization settings:', error);
    }
  }

  // Format timestamp according to localization settings for XML output
  formatXMLTimestamp(timestamp) {
    try {
      if (!timestamp) return timestamp;
      
      const moment = require('moment-timezone');
      const date = moment(timestamp).tz(this.localizationSettings.timezone);
      
      // XMLTV format expects: YYYYMMDDHHMMSS +ZZZZ
      return date.format('YYYYMMDDHHmmss ZZ');
    } catch (error) {
      logger.warn('Failed to format XML timestamp:', error);
      return timestamp;
    }
  }

  getActiveJobs() {
    const jobs = [];
    for (const [sourceId, job] of this.refreshJobs) {
      jobs.push({
        sourceId,
        isRunning: job.getStatus() === 'scheduled',
        jobExists: !!job
      });
    }
    return {
      totalJobs: this.refreshJobs.size,
      jobs,
      serviceInitialized: this.isInitialized
    };
  }

  async shutdown() {
    logger.info('Shutting down EPG service', { 
      activeJobs: this.refreshJobs.size,
      category: 'epg' 
    });
    
    // Cancel all scheduled jobs
    for (const [sourceId, job] of this.refreshJobs) {
      try {
        job.destroy();
        logger.info('EPG job destroyed', { sourceId, category: 'epg' });
      } catch (error) {
        logger.error('Error destroying EPG job', { sourceId, error: error.message });
      }
    }
    
    this.refreshJobs.clear();
    this.isInitialized = false;
  }
}

// Create singleton instance
const epgService = new EPGService();

module.exports = epgService;
