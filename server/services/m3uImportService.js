const M3UParser = require('./m3uParser');
const database = require('./database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');

class M3UImportService {
  constructor() {
    this.parser = new M3UParser({
      timeout: 30000,
      maxContentLength: 100 * 1024 * 1024, // 100MB
      blockedDomains: ['localhost', '127.0.0.1', '0.0.0.0', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']
    });
  }

  /**
   * Validation schema for M3U import request
   */
  getImportSchema() {
    return Joi.object({
      url: Joi.string().uri({ scheme: ['http', 'https'] }).required()
        .messages({
          'string.uri': 'URL must be a valid HTTP or HTTPS URL',
          'any.required': 'URL is required'
        }),
      
      auth_username: Joi.string().max(255).optional(),
      auth_password: Joi.string().max(255).optional(),
      
      auto_create_channels: Joi.boolean().default(false),
      
      validation_options: Joi.object({
        validate_urls: Joi.boolean().default(false),
        validation_timeout: Joi.number().integer().min(1000).max(30000).default(10000),
        validation_batch_size: Joi.number().integer().min(1).max(20).default(5),
        skip_invalid_channels: Joi.boolean().default(true)
      }).default(),
      
      import_options: Joi.object({
        channel_number_start: Joi.number().integer().min(1).max(9999).optional(),
        overwrite_existing_numbers: Joi.boolean().default(false),
        group_prefix: Joi.string().max(50).optional(),
        default_group: Joi.string().max(100).default('Imported'),
        preserve_channel_numbers: Joi.boolean().default(true),
        enable_imported_channels: Joi.boolean().default(true)
      }).default(),
      
      headers: Joi.object().pattern(
        Joi.string().max(100), 
        Joi.string().max(500)
      ).optional(),
      
      user_agent: Joi.string().max(500).optional()
    });
  }

  /**
   * Import M3U playlist with comprehensive error handling
   * @param {Object} importRequest - Import request object
   * @returns {Promise<Object>} Import result
   */
  async importPlaylist(importRequest) {
    const startTime = Date.now();
    
    try {
      // Validate input
      const { error, value: validatedRequest } = this.getImportSchema().validate(importRequest);
      if (error) {
        throw new Error(`Validation failed: ${error.details.map(d => d.message).join(', ')}`);
      }

      logger.info('Starting M3U playlist import', {
        url: validatedRequest.url,
        autoCreate: validatedRequest.auto_create_channels,
        hasAuth: !!validatedRequest.auth_username
      });

      // Parse M3U playlist
      const parseResult = await this.parser.parseFromUrl(validatedRequest.url, {
        username: validatedRequest.auth_username,
        password: validatedRequest.auth_password,
        headers: validatedRequest.headers,
        userAgent: validatedRequest.user_agent,
        validateUrls: validatedRequest.validation_options.validate_urls,
        validationTimeout: validatedRequest.validation_options.validation_timeout,
        validationBatchSize: validatedRequest.validation_options.validation_batch_size
      });

      if (!parseResult.success) {
        throw new Error('Failed to parse M3U playlist');
      }

      // Filter channels if requested
      let channelsToImport = parseResult.channels;
      if (validatedRequest.validation_options.skip_invalid_channels) {
        channelsToImport = channelsToImport.filter(ch => ch.isValid !== false);
      }

      if (channelsToImport.length === 0) {
        throw new Error('No valid channels found to import');
      }

      // Prepare import data
      const importData = await this.prepareImportData(channelsToImport, validatedRequest);

      let result;
      if (validatedRequest.auto_create_channels) {
        // Create channels and streams automatically
        result = await this.createChannelsAndStreams(importData, validatedRequest);
      } else {
        // Return preview data
        result = this.generatePreviewData(importData, parseResult);
      }

      const duration = Date.now() - startTime;
      logger.info('M3U import completed', {
        url: validatedRequest.url,
        duration,
        channelsProcessed: channelsToImport.length,
        autoCreate: validatedRequest.auto_create_channels
      });

      return {
        success: true,
        duration,
        source: validatedRequest.url,
        statistics: this.parser.generateStatistics(parseResult.channels),
        ...result
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('M3U import failed', {
        url: importRequest.url,
        duration,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        duration,
        source: importRequest.url
      };
    }
  }

  /**
   * Prepare import data with proper channel numbering
   * @param {Array} channels - Parsed channels
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Prepared import data
   */
  async prepareImportData(channels, options) {
    const { import_options } = options;
    
    // Get existing channel numbers to avoid conflicts
    const existingChannels = await database.all('SELECT number FROM channels ORDER BY number');
    const existingNumbers = new Set(existingChannels.map(ch => ch.number));

    // Get next available channel number
    let nextChannelNumber = import_options.channel_number_start || 1;
    if (!import_options.channel_number_start) {
      const maxChannelResult = await database.get('SELECT MAX(number) as max_number FROM channels');
      nextChannelNumber = (maxChannelResult?.max_number || 0) + 1;
    }

    const processedChannels = [];
    const conflicts = [];
    const numberMapping = new Map();

    for (const channel of channels) {
      const processedChannel = {
        ...channel,
        importId: uuidv4(),
        channelId: uuidv4(),
        streamId: uuidv4()
      };

      // Determine channel number
      let assignedNumber = null;

      if (import_options.preserve_channel_numbers && channel.number && channel.number > 0) {
        if (!existingNumbers.has(channel.number) || import_options.overwrite_existing_numbers) {
          assignedNumber = channel.number;
        } else {
          conflicts.push({
            channel: channel.name,
            originalNumber: channel.number,
            reason: 'Number already exists'
          });
        }
      }

      if (!assignedNumber) {
        // Find next available number
        while (existingNumbers.has(nextChannelNumber)) {
          nextChannelNumber++;
        }
        assignedNumber = nextChannelNumber;
        nextChannelNumber++;
      }

      processedChannel.assignedNumber = assignedNumber;
      existingNumbers.add(assignedNumber);
      numberMapping.set(channel.number, assignedNumber);

      // Process channel name and group
      processedChannel.processedName = this.sanitizeChannelName(channel.name);
      processedChannel.processedGroup = this.processChannelGroup(channel.group, import_options);

      processedChannels.push(processedChannel);
    }

    return {
      channels: processedChannels,
      conflicts,
      numberMapping,
      statistics: {
        total: channels.length,
        withOriginalNumbers: channels.filter(ch => ch.number && ch.number > 0).length,
        conflicts: conflicts.length,
        startingNumber: Math.min(...processedChannels.map(ch => ch.assignedNumber)),
        endingNumber: Math.max(...processedChannels.map(ch => ch.assignedNumber))
      }
    };
  }

  /**
   * Create channels and streams in database
   * @param {Object} importData - Prepared import data
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Creation result
   */
  async createChannelsAndStreams(importData, options) {
    const { channels } = importData;
    const { import_options, auth_username, auth_password } = options;

    const createdChannels = [];
    const createdStreams = [];
    const errors = [];

    try {
      database.transaction(() => {
        const insertChannelStmt = database.db.prepare(`
          INSERT INTO channels (id, name, number, enabled, logo, epg_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        
        const insertStreamStmt = database.db.prepare(`
          INSERT INTO streams (id, channel_id, name, url, type, backup_urls, auth_username, auth_password, headers, protocol_options, enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        
        for (const channelData of channels) {
          try {
            // Create channel
            insertChannelStmt.run(
              channelData.channelId,
              channelData.processedName,
              channelData.assignedNumber,
              import_options.enable_imported_channels,
              channelData.logo || null,
              channelData.epgId || null
            );

            const createdChannel = {
              id: channelData.channelId,
              name: channelData.processedName,
              number: channelData.assignedNumber,
              originalNumber: channelData.number,
              group: channelData.processedGroup,
              logo: channelData.logo,
              epgId: channelData.epgId
            };
            createdChannels.push(createdChannel);

            // Create stream
            const streamName = `${channelData.processedName} Stream`;
            const streamHeaders = this.buildStreamHeaders(channelData);
            const protocolOptions = this.buildProtocolOptions(channelData);

            insertStreamStmt.run(
              channelData.streamId,
              channelData.channelId,
              streamName,
              channelData.url,
              channelData.type,
              JSON.stringify([]), // No backup URLs from M3U
              auth_username || null,
              auth_password || null,
              JSON.stringify(streamHeaders),
              JSON.stringify(protocolOptions),
              import_options.enable_imported_channels
            );

            const createdStream = {
              id: channelData.streamId,
              channel_id: channelData.channelId,
              name: streamName,
              url: channelData.url,
              type: channelData.type,
              originalUrl: channelData.originalUrl
            };
            createdStreams.push(createdStream);

          } catch (channelError) {
            logger.error('Failed to create channel/stream', {
              channelName: channelData.processedName,
              error: channelError.message
            });
            
            errors.push({
              channel: channelData.processedName,
              error: channelError.message,
              type: 'creation_error'
            });
          }
        }
      });

      // Clear channel lineup cache
      const cacheService = require('./cacheService');
      await cacheService.del('lineup:channels');

      logger.info('M3U import database operations completed', {
        channelsCreated: createdChannels.length,
        streamsCreated: createdStreams.length,
        errors: errors.length
      });

      return {
        type: 'import',
        channelsCreated: createdChannels.length,
        streamsCreated: createdStreams.length,
        channels: createdChannels,
        streams: createdStreams,
        errors,
        conflicts: importData.conflicts,
        statistics: importData.statistics
      };

    } catch (transactionError) {
      logger.error('M3U import transaction failed', { error: transactionError.message });
      throw new Error(`Database transaction failed: ${transactionError.message}`);
    }
  }

  /**
   * Generate preview data without creating database entries
   * @param {Object} importData - Prepared import data
   * @param {Object} parseResult - Parse result
   * @returns {Object} Preview data
   */
  generatePreviewData(importData, parseResult) {
    const { channels, conflicts, statistics } = importData;

    const preview = channels.map(ch => ({
      name: ch.processedName,
      originalName: ch.name,
      number: ch.assignedNumber,
      originalNumber: ch.number,
      url: ch.url,
      type: ch.type,
      group: ch.processedGroup,
      logo: ch.logo,
      epgId: ch.epgId,
      isValid: ch.isValid,
      validationError: ch.validationError
    }));

    return {
      type: 'preview',
      channelsFound: parseResult.totalChannels,
      channelsToImport: channels.length,
      channels: preview,
      conflicts,
      statistics,
      recommendations: this.generateRecommendations(importData, parseResult)
    };
  }

  /**
   * Generate import recommendations
   * @param {Object} importData - Import data
   * @param {Object} parseResult - Parse result
   * @returns {Array} Recommendations
   */
  generateRecommendations(importData, parseResult) {
    const recommendations = [];

    if (importData.conflicts.length > 0) {
      recommendations.push({
        type: 'warning',
        message: `${importData.conflicts.length} channel number conflicts detected`,
        suggestion: 'Consider enabling "overwrite_existing_numbers" or use "channel_number_start" option'
      });
    }

    if (parseResult.invalidChannels > 0) {
      recommendations.push({
        type: 'warning',
        message: `${parseResult.invalidChannels} channels failed validation`,
        suggestion: 'Invalid channels will be skipped during import'
      });
    }

    const channelsWithoutEpg = importData.channels.filter(ch => !ch.epgId).length;
    if (channelsWithoutEpg > 0) {
      recommendations.push({
        type: 'info',
        message: `${channelsWithoutEpg} channels don't have EPG IDs`,
        suggestion: 'Consider adding EPG sources to get program information'
      });
    }

    const channelsWithoutLogos = importData.channels.filter(ch => !ch.logo).length;
    if (channelsWithoutLogos > 0) {
      recommendations.push({
        type: 'info',
        message: `${channelsWithoutLogos} channels don't have logos`,
        suggestion: 'Channel logos will use fallback images'
      });
    }

    return recommendations;
  }

  /**
   * Sanitize channel name
   * @param {string} name - Original name
   * @returns {string} Sanitized name
   */
  sanitizeChannelName(name) {
    if (!name || typeof name !== 'string') {
      return 'Unknown Channel';
    }

    return name
      .trim()
      .replace(/[<>:"\/\\|?*]/g, '') // Remove invalid filename characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, 255); // Limit length
  }

  /**
   * Process channel group
   * @param {string} group - Original group
   * @param {Object} options - Import options
   * @returns {string} Processed group
   */
  processChannelGroup(group, options) {
    let processedGroup = group || options.default_group || 'Imported';
    
    if (options.group_prefix) {
      processedGroup = `${options.group_prefix} ${processedGroup}`;
    }

    return processedGroup.trim().substring(0, 100);
  }

  /**
   * Build stream headers from channel data
   * @param {Object} channelData - Channel data
   * @returns {Object} Stream headers
   */
  buildStreamHeaders(channelData) {
    const headers = {
      'User-Agent': 'PlexBridge/1.0'
    };

    // Add any VLC options that are headers
    if (channelData.vlcOptions) {
      channelData.vlcOptions.forEach(option => {
        if (option.startsWith('http-user-agent=')) {
          headers['User-Agent'] = option.substring(16);
        } else if (option.startsWith('http-referrer=')) {
          headers['Referer'] = option.substring(14);
        }
      });
    }

    return headers;
  }

  /**
   * Build protocol options from channel data
   * @param {Object} channelData - Channel data
   * @returns {Object} Protocol options
   */
  buildProtocolOptions(channelData) {
    const options = {};

    // Add Kodi properties as protocol options
    if (channelData.kodiProps) {
      Object.assign(options, channelData.kodiProps);
    }

    // Add VLC options
    if (channelData.vlcOptions) {
      options.vlcOptions = channelData.vlcOptions;
    }

    return options;
  }

  /**
   * Validate M3U URL before processing
   * @param {string} url - URL to validate
   * @returns {Object} Validation result
   */
  async validateM3UUrl(url) {
    try {
      const validatedUrl = this.parser.validateUrl(url);
      
      // Try to fetch just the headers to check if URL is accessible
      const axios = require('axios');
      const response = await axios.head(validatedUrl, {
        timeout: 10000,
        maxRedirects: 5
      });

      return {
        valid: true,
        url: validatedUrl,
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length'],
        lastModified: response.headers['last-modified']
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Get import statistics for a URL without importing
   * @param {string} url - M3U URL
   * @param {Object} options - Options
   * @returns {Promise<Object>} Statistics
   */
  async getImportStatistics(url, options = {}) {
    try {
      const parseResult = await this.parser.parseFromUrl(url, {
        username: options.auth_username,
        password: options.auth_password,
        headers: options.headers,
        validateUrls: false // Skip validation for statistics
      });

      if (!parseResult.success) {
        throw new Error('Failed to parse M3U playlist');
      }

      return {
        success: true,
        statistics: this.parser.generateStatistics(parseResult.channels),
        sampleChannels: parseResult.channels.slice(0, 10).map(ch => ({
          name: ch.name,
          number: ch.number,
          group: ch.group,
          type: ch.type,
          hasLogo: !!ch.logo,
          hasEpgId: !!ch.epgId
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = M3UImportService;