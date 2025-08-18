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

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

class EPGService {
  constructor() {
    this.isInitialized = false;
    this.refreshJobs = new Map();
    this.parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true
    });
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Get all EPG sources from database
      const sources = await database.all('SELECT * FROM epg_sources WHERE enabled = 1');
      
      // Schedule refresh jobs for each source
      for (const source of sources) {
        await this.scheduleRefresh(source);
      }

      // Schedule cleanup job (daily at 2 AM)
      cron.schedule('0 2 * * *', async () => {
        await this.cleanup();
      });

      this.isInitialized = true;
      logger.epg('EPG service initialized', { sourceCount: sources.length });

    } catch (error) {
      logger.error('EPG service initialization failed:', error);
      throw error;
    }
  }

  async scheduleRefresh(source) {
    try {
      // Parse refresh interval
      const interval = this.parseInterval(source.refresh_interval);
      const cronExpression = this.intervalToCron(interval);

      // Cancel existing job if any
      if (this.refreshJobs.has(source.id)) {
        this.refreshJobs.get(source.id).destroy();
      }

      // Schedule new job
      const job = cron.schedule(cronExpression, async () => {
        await this.refreshSource(source.id);
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      this.refreshJobs.set(source.id, job);
      
      logger.epg('EPG refresh scheduled', { 
        sourceId: source.id, 
        interval: source.refresh_interval,
        cronExpression 
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

  intervalToCron(interval) {
    const { value, unit } = interval;

    switch (unit) {
      case 'minutes':
        return `*/${value} * * * *`;
      case 'hours':
        return `0 */${value} * * *`;
      case 'days':
        return `0 0 */${value} * *`;
      default:
        return '0 */4 * * *'; // Default: every 4 hours
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

      logger.epg('Starting EPG refresh', { sourceId, url: source.url });

      // Update last refresh time
      await database.run(
        'UPDATE epg_sources SET last_refresh = CURRENT_TIMESTAMP WHERE id = ?',
        [sourceId]
      );

      // Download EPG data
      const epgData = await this.downloadEPG(source);
      
      // Parse EPG XML (now includes storing channel information)
      const programs = await this.parseEPG(epgData, sourceId);
      
      if (programs.length === 0) {
        logger.warn('No programs parsed from EPG source', { 
          sourceId, 
          url: source.url,
          dataLength: epgData.length 
        });
      }
      
      // Store programs in database
      await this.storePrograms(programs);
      
      // Update success timestamp
      await database.run(
        'UPDATE epg_sources SET last_success = CURRENT_TIMESTAMP WHERE id = ?',
        [sourceId]
      );

      // Clear EPG cache
      await this.clearEPGCache();

      logger.epg('EPG refresh completed', { 
        sourceId, 
        programCount: programs.length,
        url: source.url 
      });

    } catch (error) {
      logger.error('EPG refresh failed', { 
        sourceId, 
        url: source?.url,
        error: error.message 
      });
    }
  }

  async downloadEPG(source) {
    try {
      const response = await axios.get(source.url, {
        timeout: config.epg.timeout,
        maxContentLength: config.epg.maxFileSize,
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'PlexTV EPG Fetcher/1.0',
          'Accept-Encoding': 'gzip, deflate'
        }
      });

      let data = response.data;

      // Handle gzipped content
      if (response.headers['content-encoding'] === 'gzip') {
        data = await gunzipAsync(data);
      }

      // Convert to string
      const xmlData = data.toString('utf8');
      
      // Basic validation
      if (!xmlData.includes('<tv') && !xmlData.includes('<programme')) {
        throw new Error('Invalid EPG XML format');
      }

      return xmlData;

    } catch (error) {
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Download timeout');
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

      logger.epg('EPG parsing completed', { 
        channelCount: channels.length,
        programmeCount: programmes.length 
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
      for (const programme of programmes) {
        try {
          const program = await this.parseProgram(programme, channelMap);
          if (program) {
            programs.push(program);
          }
        } catch (error) {
          logger.debug('Failed to parse program', { error: error.message });
        }
      }

      return programs;

    } catch (error) {
      logger.error('EPG XML parsing failed:', error);
      throw error;
    }
  }

  async parseProgram(programme, channelMap) {
    if (!programme.channel || !programme.start || !programme.stop) {
      return null;
    }

    // Find matching channel in our database by EPG ID
    const channelId = await this.findChannelByEpgId(programme.channel);
    if (!channelId) {
      // Log this for debugging - many programs might be skipped due to unmapped channels
      logger.debug('Skipping program for unmapped EPG channel', { 
        epgChannelId: programme.channel,
        title: this.extractText(programme.title)
      });
      return null; // Skip programs for unmapped channels
    }

    const program = {
      id: `${programme.channel}_${programme.start}`,
      channel_id: channelId,
      title: this.extractText(programme.title) || 'Unknown',
      description: this.extractText(programme.desc) || null,
      start_time: this.parseXMLTVTime(programme.start),
      end_time: this.parseXMLTVTime(programme.stop),
      category: this.extractText(programme.category) || null,
      episode_number: programme['episode-num'] ? this.parseEpisodeNumber(programme['episode-num']) : null,
      season_number: programme['episode-num'] ? this.parseSeasonNumber(programme['episode-num']) : null
    };

    return program;
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

      // Log unmapped EPG ID for debugging
      logger.debug('No channel found for EPG ID', { epgId });
      return null;
    } catch (error) {
      logger.error('Error finding channel by EPG ID', { epgId, error: error.message });
      return null;
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
      await database.transaction(async (db) => {
        // Clear old EPG channels for this source
        await db.run('DELETE FROM epg_channels WHERE source_id = ?', [sourceId]);

        // Insert new EPG channels in batches
        const batchSize = 1000;
        const insertSQL = `
          INSERT OR REPLACE INTO epg_channels 
          (epg_id, display_name, icon_url, source_id)
          VALUES (?, ?, ?, ?)
        `;

        for (let i = 0; i < epgChannels.length; i += batchSize) {
          const batch = epgChannels.slice(i, i + batchSize);
          
          for (const channel of batch) {
            await db.run(insertSQL, [
              channel.epg_id,
              channel.display_name,
              channel.icon_url,
              channel.source_id
            ]);
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
      return;
    }

    try {
      await database.transaction(async (db) => {
        // Clear old programs first
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        await db.run('DELETE FROM epg_programs WHERE end_time < ?', [threeDaysAgo]);

        // Insert new programs in batches
        const batchSize = 1000;
        const insertSQL = `
          INSERT OR REPLACE INTO epg_programs 
          (id, channel_id, title, description, start_time, end_time, category, episode_number, season_number)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        let insertedCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < programs.length; i += batchSize) {
          const batch = programs.slice(i, i + batchSize);
          
          for (const program of batch) {
            try {
              await db.run(insertSQL, [
                program.id,
                program.channel_id,
                program.title,
                program.description,
                program.start_time,
                program.end_time,
                program.category,
                program.episode_number,
                program.season_number
              ]);
              insertedCount++;
            } catch (error) {
              errorCount++;
              logger.debug('Failed to insert program', { 
                programId: program.id,
                channelId: program.channel_id,
                title: program.title,
                error: error.message 
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
      });

      logger.epg('EPG programs stored', { count: programs.length });

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

      // Query database
      const programs = await database.all(`
        SELECT * FROM epg_programs 
        WHERE channel_id = ? 
        AND start_time <= ? 
        AND end_time >= ?
        ORDER BY start_time
      `, [channelId, endTime, startTime]);

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

      const programs = await database.all(`
        SELECT p.*, c.name as channel_name, c.number as channel_number
        FROM epg_programs p
        JOIN channels c ON p.channel_id = c.id
        WHERE p.start_time <= ? 
        AND p.end_time >= ?
        ORDER BY c.number, p.start_time
      `, [endTime, startTime]);

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
      const { id, name, url, refresh_interval = '4h' } = sourceData;
      
      await database.run(`
        INSERT INTO epg_sources (id, name, url, refresh_interval, enabled)
        VALUES (?, ?, ?, ?, 1)
      `, [id, name, url, refresh_interval]);

      // Schedule refresh for new source
      const source = await database.get('SELECT * FROM epg_sources WHERE id = ?', [id]);
      await this.scheduleRefresh(source);

      logger.epg('EPG source added', { id, url });
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
        this.refreshJobs.get(sourceId).destroy();
        this.refreshJobs.delete(sourceId);
      }

      // Remove from database
      await database.run('DELETE FROM epg_sources WHERE id = ?', [sourceId]);

      // Remove associated EPG channels and programs
      await database.run('DELETE FROM epg_channels WHERE source_id = ?', [sourceId]);
      
      await database.run(`
        DELETE FROM epg_programs 
        WHERE channel_id IN (
          SELECT id FROM channels WHERE epg_id LIKE ?
        )
      `, [`%${sourceId}%`]);

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
          isInitialized: false
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
        isInitialized: this.isInitialized
      };

    } catch (error) {
      logger.error('EPG status retrieval failed:', error);
      return { 
        status: 'error',
        error: error.message,
        sources: [],
        programs: { total: 0, upcoming24h: 0 },
        isInitialized: false
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

  async shutdown() {
    logger.epg('Shutting down EPG service');
    
    // Cancel all scheduled jobs
    for (const [sourceId, job] of this.refreshJobs) {
      job.destroy();
    }
    
    this.refreshJobs.clear();
    this.isInitialized = false;
  }
}

// Create singleton instance
const epgService = new EPGService();

module.exports = epgService;
