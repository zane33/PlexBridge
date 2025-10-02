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

      // Log detailed initialization summary
      const jobsSummary = Array.from(this.refreshJobs.entries()).map(([sourceId, job]) => {
        const source = sources.find(s => s.id === sourceId);
        const interval = this.parseInterval(source?.refresh_interval || '4h');
        const cronExpression = this.intervalToCron(interval, sourceId);
        const nextRun = this.getNextCronExecution(cronExpression);

        return {
          sourceId,
          sourceName: source?.name || 'Unknown',
          interval: source?.refresh_interval || '4h',
          cronExpression,
          nextRun: nextRun ? nextRun.toISOString() : 'unknown',
          minutesUntilNext: nextRun ? Math.round((nextRun - new Date()) / 60000) : null
        };
      });

      logger.info('✅ EPG service initialized successfully', {
        sourceCount: sources.length,
        scheduledJobs: this.refreshJobs.size,
        jobs: jobsSummary
      });

      // Log individual job schedules for clarity
      jobsSummary.forEach(job => {
        logger.info(`📅 EPG job scheduled: ${job.sourceName}`, {
          sourceId: job.sourceId,
          interval: job.interval,
          cronExpression: job.cronExpression,
          nextRun: job.nextRun,
          minutesUntilNext: job.minutesUntilNext
        });
      });

      // Trigger immediate refresh for sources that have never been refreshed
      const unrefreshedSources = sources.filter(s => !s.last_success);
      if (unrefreshedSources.length > 0) {
        logger.info('Triggering immediate refresh for unrefreshed sources', {
          sourceCount: unrefreshedSources.length
        });
        
        // Trigger refreshes in background without blocking initialization
        for (const source of unrefreshedSources) {
          setImmediate(() => {
            this.refreshSource(source.id).catch(err => {
              logger.error('Background refresh failed:', {
                sourceId: source.id,
                sourceName: source.name,
                error: err.message,
                details: 'Will retry on next scheduled interval'
              });
            });
          });
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

      // Schedule new job with enhanced logging and error handling
      const job = cron.schedule(cronExpression, async () => {
        logger.info('EPG cron job triggered', {
          sourceId: source.id,
          sourceName: source.name,
          cronExpression,
          timestamp: new Date().toISOString()
        });

        // Wrap in try-catch to prevent crashes
        try {
          await this.refreshSource(source.id).catch(error => {
            // Double-catch to ensure no unhandled rejections
            logger.error('EPG refresh error caught in cron job', {
              sourceId: source.id,
              sourceName: source.name,
              error: error.message
            });
          });
        } catch (error) {
          logger.error('EPG cron job failed', {
            sourceId: source.id,
            sourceName: source.name,
            error: error.message,
            details: 'This error was caught and will not crash the application'
          });
        }
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      this.refreshJobs.set(source.id, job);

      // Calculate next execution time for verification
      const nextExecution = this.getNextCronExecution(cronExpression);

      logger.info('✅ EPG refresh job scheduled successfully', {
        sourceId: source.id,
        sourceName: source.name,
        interval: source.refresh_interval,
        cronExpression,
        nextExecution: nextExecution ? nextExecution.toISOString() : 'unknown',
        minutesUntilNext: nextExecution ? Math.round((nextExecution - new Date()) / 60000) : null,
        category: 'epg'
      });

      // Perform initial refresh if never refreshed (with error handling)
      if (!source.last_success) {
        setImmediate(() => {
          this.refreshSource(source.id).catch(error => {
            logger.error('Initial EPG refresh failed', {
              sourceId: source.id,
              sourceName: source.name,
              error: error.message,
              details: 'Will retry on next scheduled interval'
            });
          });
        });
      }

    } catch (error) {
      logger.error('EPG schedule error:', { sourceId: source.id, error: error.message });
    }
  }

  parseInterval(intervalStr) {
    // Handle legacy format (seconds like "3600.0")
    if (intervalStr && typeof intervalStr === 'string' && intervalStr.match(/^\d+(\.\d+)?$/)) {
      const seconds = parseFloat(intervalStr);
      const hours = Math.round(seconds / 3600);
      const validHours = hours > 0 ? hours : 1; // Default to 1h if calculation results in 0
      logger.warn('EPG parseInterval: Converting legacy seconds format', {
        original: intervalStr,
        converted: `${validHours}h`
      });
      return { value: validHours, unit: 'hours' };
    }

    const match = intervalStr.match(/^(\d+)([hmd])$/);
    if (!match) {
      logger.warn('EPG parseInterval: Invalid format, using default', {
        intervalStr,
        defaulting: '4h'
      });
      return { value: 4, unit: 'hours' }; // Default fallback
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'h': return { value, unit: 'hours' };
      case 'd': return { value, unit: 'days' };
      case 'm': return { value, unit: 'minutes' };
      default: {
        logger.warn('EPG parseInterval: Invalid unit, using default', {
          unit,
          defaulting: '4h'
        });
        return { value: 4, unit: 'hours' }; // Default fallback
      }
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
        return a; // FIX: Return the hash value directly
      }, 0);
      minute = Math.abs(hash) % 60; // 0-59 minutes
    }

    // CRITICAL FIX: Generate proper cron expressions that actually trigger
    switch (unit) {
      case 'minutes':
        // Every N minutes: "*/N * * * *"
        return `*/${value} * * * *`;
      case 'hours':
        // Every N hours at a specific minute: "M 0-23/N * * *"
        // This means "at minute M, every Nth hour starting from 0"
        // For example, "15 0-23/4 * * *" runs at 00:15, 04:15, 08:15, 12:15, 16:15, 20:15
        return `${minute} 0-23/${value} * * *`;
      case 'days':
        // Every N days at a specific time: "M H */N * *"
        // This means "at minute M, hour H, every Nth day"
        return `${minute} 0 */${value} * *`;
      default:
        // Default: every 4 hours with staggered minutes
        return `${minute} 0-23/4 * * *`;
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

      logger.epg('🚀 Starting EPG refresh', {
        sourceId,
        sourceName: source.name,
        url: source.url,
        timestamp: new Date().toISOString()
      });

      // Update last refresh time
      await database.run(
        'UPDATE epg_sources SET last_refresh = CURRENT_TIMESTAMP WHERE id = ?',
        [sourceId]
      );

      // Download EPG data with retry logic
      let epgData;
      let downloadAttempts = 0;
      const maxDownloadAttempts = 3;
      let lastDownloadError;

      while (downloadAttempts < maxDownloadAttempts && !epgData) {
        try {
          downloadAttempts++;
          logger.info('📥 Starting EPG download', {
            sourceId,
            sourceName: source.name,
            url: source.url,
            attempt: downloadAttempts,
            maxAttempts: maxDownloadAttempts
          });
          epgData = await this.downloadEPG(source);
          logger.info('✅ EPG download completed successfully', {
            sourceId,
            sourceName: source.name,
            dataSize: epgData.length,
            dataPreview: epgData.substring(0, 200) + '...',
            attempt: downloadAttempts
          });
          break; // Success, exit retry loop
        } catch (downloadError) {
          lastDownloadError = downloadError;
          logger.error(`❌ EPG download attempt ${downloadAttempts}/${maxDownloadAttempts} failed`, {
            sourceId,
            sourceName: source.name,
            url: source.url,
            attempt: downloadAttempts,
            error: downloadError.message,
            willRetry: downloadAttempts < maxDownloadAttempts
          });

          if (downloadAttempts < maxDownloadAttempts) {
            // Wait before retrying (exponential backoff)
            const retryDelay = Math.min(5000 * Math.pow(2, downloadAttempts - 1), 30000);
            logger.info(`Waiting ${retryDelay}ms before retry...`, {
              sourceId,
              sourceName: source.name,
              nextAttempt: downloadAttempts + 1
            });
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }

      if (!epgData) {
        // All download attempts failed
        logger.error('❌ All EPG download attempts failed', {
          sourceId,
          sourceName: source.name,
          url: source.url,
          totalAttempts: downloadAttempts,
          lastError: lastDownloadError?.message
        });

        // Update database with error status
        await database.run(
          'UPDATE epg_sources SET last_error = ? WHERE id = ?',
          [`Download failed after ${downloadAttempts} attempts: ${lastDownloadError?.message}`, sourceId]
        );

        // **CRITICAL FIX**: Always throw errors for manual refresh to show user the issue
        const isManualRefresh = this.isManualRefresh === true;
        if (isManualRefresh) {
          throw lastDownloadError;
        }

        // For background refresh, log and return
        logger.warn('EPG refresh failed for source after all retries, will retry on next cycle', {
          sourceId,
          sourceName: source.name,
          error: lastDownloadError?.message
        });
        return;
      }
      
      // Parse EPG XML with enhanced logging
      let programs;
      try {
        logger.info('📊 Starting EPG parsing', { sourceId, dataSize: epgData.length });
        programs = await this.parseEPG(epgData, sourceId);
        logger.info('✅ EPG parsing completed successfully', { 
          sourceId, 
          programCount: programs.length,
          samplePrograms: programs.slice(0, 3).map(p => ({
            id: p.id,
            channel_id: p.channel_id,
            title: p.title
          }))
        });
      } catch (parseError) {
        logger.error('❌ EPG parsing failed for source', {
          sourceId,
          sourceName: source.name,
          error: parseError.message,
          stack: parseError.stack,
          dataPreview: epgData.substring(0, 1000)
        });
        
        // Update database with error status
        await database.run(
          'UPDATE epg_sources SET last_error = ? WHERE id = ?',
          [`Parse failed: ${parseError.message}`, sourceId]
        );
        
        // **CRITICAL FIX**: Always throw errors for manual refresh
        const isManualRefresh = this.isManualRefresh === true;
        if (isManualRefresh) {
          throw parseError;
        }
        
        // For background refresh, log and return
        logger.warn('EPG parsing failed for source, will retry on next cycle', {
          sourceId,
          sourceName: source.name,
          error: parseError.message
        });
        return;
      }
      
      if (programs.length === 0) {
        const warningMessage = 'No programs parsed from EPG source - check XML format and channel mappings';
        logger.warn('⚠️ ' + warningMessage, { 
          sourceId, 
          sourceName: source.name,
          url: source.url,
          dataLength: epgData.length,
          dataPreview: epgData.substring(0, 500)
        });
        
        // Update database with warning
        await database.run(
          'UPDATE epg_sources SET last_error = ? WHERE id = ?',
          [warningMessage, sourceId]
        );
        
        // Continue processing even with 0 programs - channels might have been stored
      }
      
      // Store programs in database with enhanced logging
      logger.info('💾 Storing EPG programs in database', {
        sourceId,
        programCount: programs.length
      });

      // Get database count before storage for verification
      const beforeCount = await database.get('SELECT COUNT(*) as total FROM epg_programs');

      try {
        await this.storePrograms(programs);
        logger.info('✅ EPG programs stored successfully', {
          sourceId,
          programCount: programs.length
        });
      } catch (storeError) {
        logger.error('❌ Failed to store EPG programs', {
          sourceId,
          error: storeError.message,
          stack: storeError.stack,
          programCount: programs.length
        });

        // Update database with storage error
        await database.run(
          'UPDATE epg_sources SET last_error = ? WHERE id = ?',
          [`Storage failed: ${storeError.message}`, sourceId]
        );

        throw storeError;
      }
      
      // **CRITICAL FIX**: Verify data storage with proper error handling
      // Check programs created in the last hour to account for time differences
      const verification = await database.get(`
        SELECT COUNT(*) as current_programs,
               MAX(start_time) as latest_program,
               COUNT(DISTINCT channel_id) as channels_with_programs
        FROM epg_programs
        WHERE created_at > datetime(CURRENT_TIMESTAMP, '-1 hour')
      `);

      // Also get total count for this refresh operation
      const totalCountNow = await database.get('SELECT COUNT(*) as total FROM epg_programs');
      
      logger.info('EPG verification results', {
        sourceId,
        currentPrograms: verification.current_programs,
        latestProgram: verification.latest_program,
        channelsWithPrograms: verification.channels_with_programs,
        originalProgramCount: programs.length,
        totalProgramsInDatabase: totalCountNow.total
      });

      // **UPDATED**: More lenient verification for duplicate handling
      if (programs.length > 0) {
        // Check if we have ANY programs in the database (not just recent ones)
        if (totalCountNow.total === 0) {
          // This is a real problem - no programs at all
          logger.error(`CRITICAL: No programs in database after storage attempt`, {
            sourceId,
            programsParsed: programs.length
          });
          throw new Error(`Storage failed: Parsed ${programs.length} programs but database is empty`);
        }

        // Calculate database growth to verify storage worked
        const databaseGrowth = totalCountNow.total - beforeCount.total;

        logger.info('Database growth verification', {
          sourceId,
          programsParsed: programs.length,
          beforeStorage: beforeCount.total,
          afterStorage: totalCountNow.total,
          databaseGrowth,
          recentProgramsFound: verification.current_programs,
          assessment: databaseGrowth > 0 ? 'New programs added' : 'Programs updated (duplicates replaced)'
        });

        // If database didn't grow, it might be because we're updating existing programs
        // This is OK - we use INSERT OR REPLACE which updates duplicates
        if (databaseGrowth <= 0) {
          // Check if we at least have a reasonable number of programs
          if (totalCountNow.total < 100) {
            // This might be a problem
            logger.warn(`Database has very few programs after refresh`, {
              sourceId,
              totalPrograms: totalCountNow.total,
              programsParsed: programs.length
            });
          } else {
            // Database has programs, just no growth - likely duplicates were updated
            logger.info(`EPG refresh updated existing programs (no growth due to duplicates)`, {
              sourceId,
              totalPrograms: totalCountNow.total,
              programsParsed: programs.length
            });
          }
        }

        // Check for recent programs as a quality indicator
        if (verification.current_programs === 0 && databaseGrowth === 0) {
          logger.warn(`No recent programs found and no database growth - EPG data may be stale`, {
            sourceId,
            programsParsed: programs.length,
            totalInDatabase: totalCountNow.total
          });
        }
      }
      
      if (verification.latest_program) {
        const latestDate = new Date(verification.latest_program);
        const today = new Date();
        const daysDiff = (today - latestDate) / (1000 * 60 * 60 * 24);
        
        // Only warn about old data, don't fail the refresh
        if (daysDiff > 7) {
          logger.warn(`EPG data is ${daysDiff.toFixed(1)} days old - may need source update`, {
            sourceId,
            latestProgram: verification.latest_program
          });
        }
      }
      
      // Success criteria: Database has programs after the operation
      // We don't require growth because INSERT OR REPLACE may update existing programs
      const isSuccess = programs.length === 0 || totalCountNow.total > 0;

      if (!isSuccess) {
        logger.error(`EPG storage verification failed`, {
          sourceId,
          programsParsed: programs.length,
          databasePrograms: totalCountNow.total,
          databaseGrowth: totalCountNow.total - beforeCount.total
        });
        throw new Error(`Storage verification failed: Database has no programs after storing ${programs.length} programs`);
      }
      
      // Only mark success if verification passes
      await database.run(
        'UPDATE epg_sources SET last_success = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?',
        [sourceId]
      );

      // Clear EPG cache
      await this.clearEPGCache();

      logger.epg('🎉 EPG refresh verified and completed', {
        sourceId,
        sourceName: source.name,
        programCount: programs.length,
        databaseGrowth: totalCountNow.total - beforeCount.total,
        totalInDatabase: totalCountNow.total,
        recentPrograms: verification.current_programs,
        latestProgram: verification.latest_program,
        url: source.url,
        timestamp: new Date().toISOString()
      });

      // Return success statistics with corrected counts
      return {
        success: true,
        sourceId,
        sourceName: source.name,
        programCount: programs.length,
        storedPrograms: totalCountNow.total - beforeCount.total, // Actual programs added
        totalPrograms: totalCountNow.total,
        latestProgram: verification.latest_program,
        channelsProcessed: await database.get('SELECT COUNT(*) as count FROM epg_channels WHERE source_id = ?', [sourceId])?.count || 0
      };

    } catch (error) {
      logger.error('💥 EPG refresh failed with critical error', { 
        sourceId, 
        sourceName: source?.name,
        url: source?.url,
        error: error.message,
        stack: error.stack
      });
      
      // Update database with critical error
      if (source) {
        await database.run(
          'UPDATE epg_sources SET last_error = ? WHERE id = ?',
          [`Critical error: ${error.message}`, sourceId]
        );
      }
      
      // Always re-throw to maintain existing behavior
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

      // Increase timeout and content length for large EPG files
      const response = await axios.get(source.url, {
        timeout: config.epg.timeout || 120000, // Increased to 120 seconds
        maxContentLength: config.epg.maxFileSize || 100 * 1024 * 1024, // Increased to 100MB
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'PlexBridge/1.0 (compatible; EPG Fetcher)',
          'Accept': 'application/xml, text/xml, */*',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        // Follow redirects
        maxRedirects: 10, // Increased for GitHub redirects
        validateStatus: function (status) {
          return status >= 200 && status < 300; // Accept only 2xx status codes
        },
        // Add decompress option to handle compressed responses
        decompress: true
      });

      logger.info('EPG download response received', {
        status: response.status,
        contentType: response.headers['content-type'],
        contentEncoding: response.headers['content-encoding'],
        contentLength: response.headers['content-length'],
        dataSize: response.data.length,
        finalUrl: response.request?.res?.responseUrl || response.config?.url || source.url, // Better redirect detection
        sourceName: source.name,
        sourceId: source.id
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
      if (data && data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
        logger.debug('Detected gzip magic number, decompressing', {
          sourceId: source.id,
          sourceName: source.name
        });
        try {
          data = await gunzipAsync(data);
          logger.debug('Gzip decompression successful', {
            sourceId: source.id,
            decompressedSize: data.length
          });
        } catch (decompressError) {
          logger.error('Gzip decompression failed', {
            sourceId: source.id,
            error: decompressError.message
          });
          throw new Error(`Failed to decompress EPG data: ${decompressError.message}`);
        }
      }

      // Convert to string with error handling
      let xmlData;
      try {
        xmlData = data.toString('utf8');
      } catch (conversionError) {
        logger.error('Failed to convert EPG data to string', {
          sourceId: source.id,
          sourceName: source.name,
          dataType: typeof data,
          dataLength: data?.length,
          error: conversionError.message
        });
        throw new Error(`Failed to convert EPG data to UTF-8: ${conversionError.message}`);
      }

      logger.debug('EPG data converted to string', {
        sourceId: source.id,
        sourceName: source.name,
        dataLength: xmlData.length,
        firstChars: xmlData.substring(0, 100),
        lastChars: xmlData.substring(xmlData.length - 100)
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
        sourceName: source.name,
        dataSize: xmlData.length,
        hasChannels: xmlData.includes('<channel '),
        hasProgrammes: xmlData.includes('<programme ')
      });

      return xmlData;

    } catch (error) {
      // Enhanced error logging for production debugging
      logger.error('EPG download failed', {
        sourceId: source.id,
        sourceName: source.name,
        url: source.url,
        error: error.message,
        code: error.code,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data ? String(error.response.data).substring(0, 500) : null
        } : null,
        config: error.config ? {
          timeout: error.config.timeout,
          maxContentLength: error.config.maxContentLength,
          maxRedirects: error.config.maxRedirects
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

      logger.debug('Processing EPG channels from XML', {
        sourceId,
        totalChannelsInXML: channels.length,
        sampleChannels: channels.slice(0, 5).map(ch => ({
          id: ch.id,
          displayName: this.extractText(ch['display-name']),
          hasId: !!ch.id
        }))
      });

      for (const channel of channels) {
        if (channel.id) {
          const displayName = this.extractText(channel['display-name']);
          const iconUrl = channel.icon?.src || null;

          // Debug logging for TVNZ channels specifically
          if (channel.id && (channel.id.includes('tvnz') || channel.id.includes('mjh-tvnz'))) {
            logger.info('Found TVNZ channel in XML', {
              sourceId,
              channelId: channel.id,
              displayName: displayName,
              iconUrl: iconUrl
            });
          }

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

      logger.info('EPG channels prepared for storage', {
        sourceId,
        totalChannelsProcessed: epgChannels.length,
        tvnzChannels: epgChannels.filter(ch => ch.epg_id.includes('tvnz') || ch.epg_id.includes('mjh-tvnz')).length
      });

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
      // **ENHANCED**: Extract comprehensive metadata for rich Plex integration
      const program = {
        id: `${programme.channel}_${programme.start}`,
        channel_id: programme.channel, // Use EPG channel ID directly
        title: this.extractText(programme.title) || 'Unknown',
        subtitle: this.extractText(programme['sub-title']) || null,
        description: this.extractText(programme.desc) || null,
        start_time: this.parseXMLTVTime(programme.start),
        end_time: this.parseXMLTVTime(programme.stop),
        category: this.extractPrimaryCategory(programme.category),
        secondary_category: this.extractSecondaryCategory(programme.category),
        year: this.extractYear(programme.date),
        country: this.extractText(programme.country) || null,
        icon_url: this.extractIconUrl(programme.icon),
        episode_number: programme['episode-num'] ? this.parseEpisodeNumber(programme['episode-num']) : null,
        season_number: programme['episode-num'] ? this.parseSeasonNumber(programme['episode-num']) : null,
        series_id: this.extractSeriesId(programme['episode-num']),
        keywords: this.extractKeywords(programme.keyword),
        rating: this.extractRating(programme.rating),
        audio_description: this.checkAudioDescription(programme),
        subtitles: this.checkSubtitles(programme),
        hd_quality: this.checkHDQuality(programme),
        premiere: this.checkPremiere(programme),
        finale: this.checkFinale(programme),
        live: this.checkLive(programme),
        new_episode: this.checkNewEpisode(programme)
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
    if (!episodeNum) return null;

    // Handle array of episode-num elements (from xml2js parsing)
    const episodeArray = Array.isArray(episodeNum) ? episodeNum : [episodeNum];

    for (const episode of episodeArray) {
      try {
        // Handle different episode-num system types
        if (typeof episode === 'object' && episode.system === 'xmltv_ns') {
          const xmltvText = episode._ || episode;
          if (typeof xmltvText === 'string') {
            const match = xmltvText.match(/\.(\d+)\./);
            if (match) return parseInt(match[1]) + 1; // XMLTV uses 0-based indexing
          }
        }

        // Handle direct string values
        if (typeof episode === 'string') {
          const match = episode.match(/\.(\d+)\./);
          if (match) return parseInt(match[1]) + 1;
        }

        // Handle onscreen episode numbers like "S01E34"
        if (typeof episode === 'object' && episode.system === 'onscreen') {
          const onscreenText = episode._ || episode;
          if (typeof onscreenText === 'string') {
            const match = onscreenText.match(/E(\d+)/i);
            if (match) return parseInt(match[1]);
          }
        }
      } catch (error) {
        logger.debug('Error parsing episode number', { episode, error: error.message });
        continue;
      }
    }

    return null;
  }

  parseSeasonNumber(episodeNum) {
    if (!episodeNum) return null;

    // Handle array of episode-num elements (from xml2js parsing)
    const episodeArray = Array.isArray(episodeNum) ? episodeNum : [episodeNum];

    for (const episode of episodeArray) {
      try {
        // Handle different episode-num system types
        if (typeof episode === 'object' && episode.system === 'xmltv_ns') {
          const xmltvText = episode._ || episode;
          if (typeof xmltvText === 'string') {
            const match = xmltvText.match(/^(\d+)\./);
            if (match) return parseInt(match[1]) + 1; // XMLTV uses 0-based indexing
          }
        }

        // Handle direct string values
        if (typeof episode === 'string') {
          const match = episode.match(/^(\d+)\./);
          if (match) return parseInt(match[1]) + 1;
        }

        // Handle onscreen season numbers like "S01E34"
        if (typeof episode === 'object' && episode.system === 'onscreen') {
          const onscreenText = episode._ || episode;
          if (typeof onscreenText === 'string') {
            const match = onscreenText.match(/S(\d+)/i);
            if (match) return parseInt(match[1]);
          }
        }
      } catch (error) {
        logger.debug('Error parsing season number', { episode, error: error.message });
        continue;
      }
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
      // Execute transaction to store EPG channels
      const transactionResult = database.transaction(() => {
        // Clear old EPG channels for this source
        const deleteResult = database.db.prepare('DELETE FROM epg_channels WHERE source_id = ?').run(sourceId);
        logger.debug('Cleared existing EPG channels', {
          sourceId,
          deletedCount: deleteResult.changes
        });

        // Insert new EPG channels in batches
        const batchSize = 1000;
        const insertSQL = `
          INSERT OR REPLACE INTO epg_channels
          (epg_id, display_name, icon_url, source_id)
          VALUES (?, ?, ?, ?)
        `;

        const insertStmt = database.db.prepare(insertSQL);
        let totalInserted = 0;

        for (let i = 0; i < epgChannels.length; i += batchSize) {
          const batch = epgChannels.slice(i, i + batchSize);

          for (const channel of batch) {
            try {
              const result = insertStmt.run(
                channel.epg_id,
                channel.display_name,
                channel.icon_url,
                channel.source_id
              );

              totalInserted += result.changes;

              // Debug logging for TVNZ channels specifically
              if (channel.epg_id && (channel.epg_id.includes('tvnz') || channel.epg_id.includes('mjh-tvnz'))) {
                logger.info('Inserted TVNZ channel to database', {
                  sourceId,
                  epgId: channel.epg_id,
                  displayName: channel.display_name,
                  insertResult: result.changes
                });
              }
            } catch (insertError) {
              logger.error('Failed to insert EPG channel', {
                sourceId,
                channel: channel,
                error: insertError.message
              });
            }
          }
        }

        logger.info('EPG channels stored in database', {
          sourceId,
          totalInserted,
          totalProvided: epgChannels.length
        });

        return { totalInserted, totalProvided: epgChannels.length };
      });

      // Execute the transaction
      const results = transactionResult();

      logger.epg('EPG channels stored', {
        count: results.totalInserted,
        sourceId,
        originalCount: epgChannels.length,
        success: results.totalInserted > 0
      });

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
      // **CRITICAL FIX**: Enhanced transaction with proper error handling
      const transactionResult = database.transaction(() => {
        logger.info('Starting EPG programs transaction', { programCount: programs.length });
        
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
          (id, channel_id, title, subtitle, description, start_time, end_time, category, secondary_category,
           year, country, icon_url, episode_number, season_number, series_id, keywords, rating,
           audio_description, subtitles, hd_quality, premiere, finale, live, new_episode)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        let insertedCount = 0;
        let errorCount = 0;
        const channelCounts = {};
        const insertStmt = database.db.prepare(insertSQL);
        const insertErrors = [];
        
        for (let i = 0; i < programs.length; i += batchSize) {
          const batch = programs.slice(i, i + batchSize);
          
          for (const program of batch) {
            // Move variable declarations outside try block for proper error handling scope
            let safeYear = null;
            let safeEpisodeNumber = null;
            let safeSeasonNumber = null;

            try {
              // **CRITICAL FIX**: Validate and handle channel ID properly
              // Accept both internal channel UUIDs and EPG channel IDs for maximum compatibility
              let validChannelId = program.channel_id;

              // Check if this is already an internal channel UUID (from our channels table)
              const directChannelMatch = database.db.prepare(
                'SELECT id FROM channels WHERE id = ? LIMIT 1'
              ).get(program.channel_id);

              if (!directChannelMatch) {
                // If not a direct UUID match, try to find by EPG ID
                const epgChannelMatch = database.db.prepare(
                  'SELECT id FROM channels WHERE epg_id = ? LIMIT 1'
                ).get(program.channel_id);

                if (epgChannelMatch) {
                  // Use the internal channel UUID instead of EPG ID
                  validChannelId = epgChannelMatch.id;
                } else {
                  // Store with original EPG channel ID for data completeness
                  // This allows EPG data to be available even for unmapped channels
                  logger.debug('Program stored with unmapped channel ID', {
                    programId: program.id,
                    epgChannelId: program.channel_id,
                    title: program.title
                  });
                }
              }

              // **REMOVED**: Old channel existence check - handled above with validChannelId

              // Continue with validation and data processing
              if (validChannelId !== program.channel_id) {
                logger.debug('Using mapped channel ID for program storage', {
                  channelId: program.channel_id,
                  programTitle: program.title,
                  suggestion: `Map channel ${program.channel_id} to channel table for full integration`
                });
                // Continue with storage - don't skip
              }

              // **COMPREHENSIVE VALIDATION**: Sanitize and validate all fields

              // 1. Required fields validation
              if (!program.title || typeof program.title !== 'string' || program.title.trim() === '') {
                program.title = 'Unknown Program';
              }

              if (!program.start_time || !program.end_time) {
                throw new Error(`Program missing required time fields: ${program.id}`);
              }

              // 2. Text field length limits and sanitization
              program.title = program.title.substring(0, 255); // Prevent overly long titles
              if (program.subtitle) program.subtitle = program.subtitle.substring(0, 255);
              if (program.description) program.description = program.description.substring(0, 2000);
              if (program.category) program.category = program.category.substring(0, 100);
              if (program.secondary_category) program.secondary_category = program.secondary_category.substring(0, 100);
              if (program.country) program.country = program.country.substring(0, 100);
              if (program.keywords) program.keywords = program.keywords.substring(0, 500);
              if (program.rating) program.rating = program.rating.substring(0, 50);

              // 3. Numeric and boolean field validation
              safeYear = (program.year && !isNaN(Number(program.year))) ? parseInt(program.year) : null;

              // **CRITICAL**: Proper episode/season number conversion to strings or null
              // Handle various input types: numbers, strings, null, undefined, empty strings
              safeEpisodeNumber = null;
              if (program.episode_number !== null && program.episode_number !== undefined && program.episode_number !== '') {
                const episodeNum = String(program.episode_number).trim();
                if (episodeNum && !isNaN(Number(episodeNum)) && Number(episodeNum) > 0) {
                  safeEpisodeNumber = episodeNum;
                }
              }

              safeSeasonNumber = null;
              if (program.season_number !== null && program.season_number !== undefined && program.season_number !== '') {
                const seasonNum = String(program.season_number).trim();
                if (seasonNum && !isNaN(Number(seasonNum)) && Number(seasonNum) > 0) {
                  safeSeasonNumber = seasonNum;
                }
              }

              // 4. Boolean field validation with proper defaults (SQLite expects 0/1 integers)
              const safeBooleans = {
                audio_description: program.audio_description ? 1 : 0,
                subtitles: program.subtitles ? 1 : 0,
                hd_quality: program.hd_quality ? 1 : 0,
                premiere: program.premiere ? 1 : 0,
                finale: program.finale ? 1 : 0,
                live: program.live ? 1 : 0,
                new_episode: program.new_episode ? 1 : 0
              };
              
              const result = insertStmt.run(
                program.id,
                validChannelId,
                program.title,
                program.subtitle,
                program.description,
                program.start_time,
                program.end_time,
                program.category,
                program.secondary_category,
                safeYear,
                program.country,
                program.icon_url,
                safeEpisodeNumber,
                safeSeasonNumber,
                program.series_id,
                program.keywords,
                program.rating,
                safeBooleans.audio_description,
                safeBooleans.subtitles,
                safeBooleans.hd_quality,
                safeBooleans.premiere,
                safeBooleans.finale,
                safeBooleans.live,
                safeBooleans.new_episode
              );
              
              if (result.changes > 0) {
                insertedCount++;
                
                // Count programs per channel for reporting
                channelCounts[validChannelId] = (channelCounts[validChannelId] || 0) + 1;
                
                // Log first few successful inserts for debugging
                if (insertedCount <= 3) {
                  logger.info('Successfully inserted program', {
                    programId: program.id,
                    originalChannelId: program.channel_id,
                    storedChannelId: validChannelId,
                    title: program.title,
                    changes: result.changes
                  });
                }
              } else {
                logger.warn('Program insert returned 0 changes - may be duplicate', {
                  programId: program.id,
                  originalChannelId: program.channel_id,
                  storedChannelId: validChannelId,
                  title: program.title
                });
              }
            } catch (error) {
              errorCount++;
              const errorDetails = {
                programId: program.id,
                originalChannelId: program.channel_id,
                storedChannelId: validChannelId,
                title: program.title,
                start_time: program.start_time,
                end_time: program.end_time,
                episode_number: safeEpisodeNumber,
                season_number: safeSeasonNumber,
                year: safeYear,
                error: error.message,
                errorCode: error.code,
                sqliteErrno: error.errno
              };
              insertErrors.push(errorDetails);

              // **ENHANCED**: Log first 10 errors in detail for debugging with full context
              if (errorCount <= 10) {
                logger.error('Failed to insert program (detailed)', {
                  ...errorDetails,
                  fullProgram: program,
                  // Additional debugging info for constraint violations
                  titleLength: program.title ? program.title.length : 0,
                  descriptionLength: program.description ? program.description.length : 0,
                  categoryLength: program.category ? program.category.length : 0,
                  rawEpisodeNumber: program.episode_number,
                  rawSeasonNumber: program.season_number,
                  processedEpisodeNumber: safeEpisodeNumber,
                  processedSeasonNumber: safeSeasonNumber,
                  // Data type validation info
                  episodeType: typeof program.episode_number,
                  seasonType: typeof program.season_number,
                  yearType: typeof program.year,
                  // Boolean validation info
                  audioDescOriginal: program.audio_description,
                  subtitlesOriginal: program.subtitles,
                  processedBooleans: safeBooleans
                });
              } else {
                logger.error('Failed to insert program', errorDetails);
              }
              
              // **ENHANCED**: Stop transaction if too many consecutive errors (prevent data corruption)
              // More permissive threshold but still protective
              const maxErrors = Math.max(200, programs.length * 0.15); // Allow up to 15% errors or 200 errors minimum
              if (errorCount > maxErrors) {
                throw new Error(`CRITICAL: Too many insert errors (${errorCount}/${programs.length}) - stopping transaction to prevent corruption. Threshold: ${maxErrors}`);
              }
            }
          }
        }
        
        // **CRITICAL**: Return transaction results for validation
        return {
          insertedCount,
          errorCount,
          channelCounts,
          insertErrors,
          totalPrograms: programs.length
        };
      });
      
      // Execute transaction and handle results
      const results = transactionResult();
      
      // **ENHANCED ERROR HANDLING**: Adaptive error tolerance for sources with data quality issues
      if (results.errorCount > 0) {
        const errorRate = (results.errorCount / results.totalPrograms) * 100;
        const successRate = ((results.totalPrograms - results.errorCount) / results.totalPrograms) * 100;

        // **ENHANCED**: More permissive thresholds for large EPG sources with data quality issues
        const errorThreshold = results.totalPrograms > 10000 ? 40 : (results.totalPrograms > 5000 ? 30 : 15);
        const minSuccessRequired = Math.max(50, results.totalPrograms * 0.05); // At least 5% or 50 programs must succeed

        if (errorRate > errorThreshold && results.insertedCount < minSuccessRequired) {
          throw new Error(`CRITICAL: EPG storage failed - ${results.errorCount}/${results.totalPrograms} programs failed to store (${errorRate.toFixed(1)}% error rate, only ${results.insertedCount} succeeded)`);
        } else if (errorRate > errorThreshold) {
          logger.warn(`EPG storage completed with high error rate but sufficient success`, {
            errorRate: `${errorRate.toFixed(1)}%`,
            successRate: `${successRate.toFixed(1)}%`,
            inserted: results.insertedCount,
            failed: results.errorCount,
            total: results.totalPrograms,
            assessment: 'Partial success - allowing completion'
          });
        }
        
        logger.warn(`EPG storage completed with ${results.errorCount} errors`, {
          total: results.totalPrograms,
          inserted: results.insertedCount,
          errorRate: `${errorRate.toFixed(1)}%`,
          sampleErrors: results.insertErrors.slice(0, 5)
        });
      }
      
      // **VALIDATION**: Verify data was actually stored and accessible
      // Check total programs and recent programs (more reliable than created_at timing)
      const totalCount = database.db.prepare('SELECT COUNT(*) as count FROM epg_programs').get();
      const recentCount = database.db.prepare('SELECT COUNT(*) as count FROM epg_programs WHERE start_time > datetime(CURRENT_TIMESTAMP, \'-1 day\')').get();
      
      logger.info('EPG validation check', {
        totalPrograms: totalCount.count,
        recentPrograms: recentCount.count,
        insertedThisRun: results.insertedCount
      });
      
      if (results.insertedCount > 0) {
        if (totalCount.count === 0) {
          throw new Error('CRITICAL: Programs inserted but no programs found in database - transaction rolled back');
        }
        
        if (recentCount.count === 0) {
          throw new Error('CRITICAL: Programs inserted but no recent programs found - data may be stale or invalid');
        }
      }
      
      logger.info('✅ EPG programs stored and validated successfully', {
        totalPrograms: results.insertedCount,
        totalInDatabase: totalCount.count,
        recentPrograms: recentCount.count,
        channelsWithPrograms: Object.keys(results.channelCounts).length,
        errorRate: results.errorCount > 0 ? `${((results.errorCount / results.totalPrograms) * 100).toFixed(1)}%` : '0%',
        programsPerChannel: results.channelCounts
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

  // CRITICAL: EPG Health Monitoring - Detects Issues Early
  async getEPGHealth() {
    const health = {
      status: 'healthy',
      issues: [],
      lastRefresh: null,
      programCount: 0,
      oldestProgram: null,
      newestProgram: null
    };

    try {
      // Check program data freshness
      const stats = await database.get(`
        SELECT 
          COUNT(*) as total_programs,
          MIN(start_time) as oldest_program,
          MAX(start_time) as newest_program,
          COUNT(DISTINCT channel_id) as channels_with_programs
        FROM epg_programs
      `);

      health.programCount = stats.total_programs;
      health.oldestProgram = stats.oldest_program;
      health.newestProgram = stats.newest_program;

      // VALIDATION: Check for stale data
      if (stats.newest_program) {
        const newestDate = new Date(stats.newest_program);
        const daysSinceNewest = (Date.now() - newestDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceNewest > 2) {
          health.status = 'degraded';
          health.issues.push(`EPG data is ${daysSinceNewest.toFixed(1)} days old - refresh failing`);
        }
      }

      if (stats.total_programs === 0) {
        health.status = 'critical';
        health.issues.push('No EPG programs in database - complete system failure');
      }

      // Check source health
      const sources = await database.get(`
        SELECT 
          COUNT(*) as total_sources,
          COUNT(CASE WHEN last_error IS NOT NULL THEN 1 END) as failed_sources,
          MAX(last_success) as last_successful_refresh
        FROM epg_sources 
        WHERE enabled = 1
      `);

      if (sources.failed_sources > 0) {
        health.status = health.status === 'critical' ? 'critical' : 'degraded';
        health.issues.push(`${sources.failed_sources} EPG sources failing`);
      }

      health.lastRefresh = sources.last_successful_refresh;

    } catch (error) {
      health.status = 'critical';
      health.issues.push(`Database error: ${error.message}`);
    }

    return health;
  }

  async getEPGData(channelId, startTime, endTime) {
    try {
      // Get channel info first to resolve EPG ID for proper caching
      const channel = await database.get('SELECT * FROM channels WHERE id = ? OR epg_id = ?',
        [channelId, channelId]);

      // Determine the EPG channel ID to use for the query
      // If channelId is a UUID, use the channel's epg_id; otherwise use channelId directly
      const epgChannelId = channel?.epg_id || channelId;

      // Check cache using EPG channel ID for consistent caching
      const cacheKey = `epg:${epgChannelId}:${startTime}:${endTime}`;
      const cached = await cacheService.get(cacheKey);

      if (cached) {
        return cached;
      }

      // Query database using the correct EPG channel ID
      let programs = await database.all(`
        SELECT p.*, ec.source_id
        FROM epg_programs p
        LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
        WHERE p.channel_id = ?
        AND p.start_time <= ?
        AND p.end_time >= ?
        ORDER BY start_time
      `, [epgChannelId, endTime, startTime]);

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
    logger.epg('🔧 Force refresh requested', { sourceId });

    // Set manual refresh flag to ensure errors are thrown instead of silently logged
    this.isManualRefresh = true;

    try {
      const result = await this.refreshSource(sourceId);
      logger.epg('✅ Force refresh completed successfully', { sourceId, result });
      return result;
    } catch (error) {
      logger.error('❌ Force refresh failed', { sourceId, error: error.message });
      // Don't throw verification errors for manual refresh - just return error info
      if (error.message && error.message.includes('VERIFICATION')) {
        return {
          success: false,
          error: 'EPG refresh completed but verification failed - programs may have been updated',
          details: error.message
        };
      }
      throw error;
    } finally {
      // Reset manual refresh flag
      this.isManualRefresh = false;
    }
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

  getNextCronExecution(cronExpression) {
    try {
      // Parse cron expression to calculate next execution
      // Cron format: minute hour day month weekday
      const [minute, hour, day, month, weekday] = cronExpression.split(' ');
      const now = new Date();
      const next = new Date(now);

      // Handle hour patterns like "0-23/4" (every 4 hours)
      if (hour && hour.includes('/')) {
        const [range, step] = hour.split('/');
        const stepNum = parseInt(step);
        const currentHour = now.getHours();

        // Find next hour that matches the pattern
        let nextHour = Math.ceil(currentHour / stepNum) * stepNum;
        if (nextHour === currentHour && now.getMinutes() >= parseInt(minute || 0)) {
          nextHour += stepNum;
        }
        if (nextHour >= 24) {
          nextHour = nextHour % 24;
          next.setDate(next.getDate() + 1);
        }

        next.setHours(nextHour);
        next.setMinutes(parseInt(minute || 0));
        next.setSeconds(0);
        next.setMilliseconds(0);

        return next;
      }

      // Handle minute patterns like "*/5" (every 5 minutes)
      if (minute && minute.includes('/')) {
        const stepNum = parseInt(minute.split('/')[1]);
        const currentMinute = now.getMinutes();
        let nextMinute = Math.ceil(currentMinute / stepNum) * stepNum;

        if (nextMinute >= 60) {
          nextMinute = 0;
          next.setHours(next.getHours() + 1);
        }

        next.setMinutes(nextMinute);
        next.setSeconds(0);
        next.setMilliseconds(0);

        return next;
      }

      // Simple case: specific minute and hour
      if (minute && !minute.includes('*') && hour && !hour.includes('*')) {
        next.setHours(parseInt(hour));
        next.setMinutes(parseInt(minute));
        next.setSeconds(0);
        next.setMilliseconds(0);

        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }

        return next;
      }

      // Fallback: approximate next execution (4 hours from now)
      next.setHours(next.getHours() + 4);
      return next;
    } catch (error) {
      logger.warn('Failed to calculate next cron execution', { cronExpression, error: error.message });
      return null;
    }
  }

  getNextRefreshTime(source) {
    // Calculate based on the cron schedule
    const interval = this.parseInterval(source.refresh_interval);
    const cronExpression = this.intervalToCron(interval, source.id);
    const nextExecution = this.getNextCronExecution(cronExpression);

    if (nextExecution) {
      return nextExecution;
    }

    // Fallback to simple calculation if cron parsing fails
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

  // **ENHANCED METADATA EXTRACTION FUNCTIONS FOR RICH PLEX INTEGRATION**

  extractPrimaryCategory(categories) {
    if (!categories) return null;

    // Ensure categories is an array
    const catArray = Array.isArray(categories) ? categories : [categories];
    return this.extractText(catArray[0]) || null;
  }

  extractSecondaryCategory(categories) {
    if (!categories) return null;

    const catArray = Array.isArray(categories) ? categories : [categories];
    return catArray.length > 1 ? this.extractText(catArray[1]) : null;
  }

  extractYear(dateElement) {
    if (!dateElement) return null;

    const dateText = this.extractText(dateElement);
    if (!dateText) return null;

    // Extract 4-digit year
    const yearMatch = dateText.match(/(\d{4})/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
  }

  extractIconUrl(iconElement) {
    if (!iconElement) return null;

    // Handle both <icon src="url"/> and nested structures
    if (typeof iconElement === 'string') return iconElement;
    if (iconElement.src) return iconElement.src;
    if (iconElement._) return iconElement._;

    return null;
  }

  extractSeriesId(episodeNum) {
    if (!episodeNum) return null;

    const episodeText = Array.isArray(episodeNum) ? episodeNum[0] : episodeNum;
    if (!episodeText || typeof episodeText !== 'object') return null;

    // Look for dd_seriesid system or similar
    if (episodeText.system === 'dd_seriesid' || episodeText.system === 'thetvdb') {
      return this.extractText(episodeText) || null;
    }

    return null;
  }

  extractKeywords(keywordElement) {
    if (!keywordElement) return null;

    const keywords = Array.isArray(keywordElement) ? keywordElement : [keywordElement];
    return keywords.map(k => this.extractText(k)).filter(Boolean).join(',') || null;
  }

  extractRating(ratingElement) {
    if (!ratingElement) return null;

    // Handle various rating formats
    if (typeof ratingElement === 'string') return ratingElement;
    if (ratingElement.value) return ratingElement.value;
    if (ratingElement._) return ratingElement._;

    return null;
  }

  checkAudioDescription(programme) {
    // Check for audio description markers
    const title = this.extractText(programme.title) || '';
    const desc = this.extractText(programme.desc) || '';
    const keywords = this.extractText(programme.keyword) || '';

    return title.includes('[AD]') ||
           desc.includes('audio description') ||
           keywords.includes('audio-description') ||
           !!programme['audio-description'];
  }

  checkSubtitles(programme) {
    // Check for subtitle markers
    const title = this.extractText(programme.title) || '';
    const desc = this.extractText(programme.desc) || '';
    const keywords = this.extractText(programme.keyword) || '';

    return title.includes('[CC]') ||
           title.includes('[S]') ||
           desc.includes('subtitles') ||
           keywords.includes('subtitles') ||
           !!programme.subtitles;
  }

  checkHDQuality(programme) {
    // Check for HD quality markers
    const title = this.extractText(programme.title) || '';
    const desc = this.extractText(programme.desc) || '';
    const keywords = this.extractText(programme.keyword) || '';

    return title.includes('HD') ||
           title.includes('[HD]') ||
           desc.includes('high definition') ||
           keywords.includes('hd') ||
           !!programme.quality;
  }

  checkPremiere(programme) {
    // Check for premiere markers
    const title = this.extractText(programme.title) || '';
    const desc = this.extractText(programme.desc) || '';
    const keywords = this.extractText(programme.keyword) || '';

    return title.includes('Premiere') ||
           title.includes('[Premiere]') ||
           desc.includes('premiere') ||
           keywords.includes('premiere') ||
           !!programme.premiere;
  }

  checkFinale(programme) {
    // Check for finale markers
    const title = this.extractText(programme.title) || '';
    const desc = this.extractText(programme.desc) || '';
    const keywords = this.extractText(programme.keyword) || '';

    return title.includes('Finale') ||
           title.includes('Season Finale') ||
           title.includes('Series Finale') ||
           desc.includes('finale') ||
           keywords.includes('finale');
  }

  checkLive(programme) {
    // Check for live broadcast markers
    const title = this.extractText(programme.title) || '';
    const desc = this.extractText(programme.desc) || '';
    const keywords = this.extractText(programme.keyword) || '';

    return title.includes('LIVE') ||
           title.includes('[Live]') ||
           desc.includes('live broadcast') ||
           keywords.includes('live') ||
           !!programme.live;
  }

  checkNewEpisode(programme) {
    // Check for new episode markers
    const title = this.extractText(programme.title) || '';
    const desc = this.extractText(programme.desc) || '';
    const keywords = this.extractText(programme.keyword) || '';

    return title.includes('[New]') ||
           title.includes('New Episode') ||
           desc.includes('new episode') ||
           keywords.includes('new') ||
           !!programme.new;
  }

  // Note: parseEpisodeNumber and parseSeasonNumber methods are defined above in the main functions section

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
