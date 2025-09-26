/**
 * EPG Resolver Service
 * Intelligently resolves EPG channel IDs with fallback mechanism
 * Tries multiple strategies to find EPG programs for a channel
 */

const logger = require('../utils/logger');
const database = require('./database');
const { getEPGSourceChannelId } = require('../utils/epgChannelMapper');

/**
 * Try to find EPG programs for a channel using multiple strategies
 * @param {Object} channel - Channel object
 * @param {Date} startTime - Start time for EPG query
 * @param {Date} endTime - End time for EPG query
 * @returns {Object} Result with programs and the EPG ID that was used
 */
async function resolveEPGPrograms(channel, startTime, endTime) {
  if (!channel) {
    return { programs: [], epgId: null, source: 'none' };
  }

  const startISO = startTime.toISOString();
  const endISO = endTime.toISOString();

  // Strategy 1: Try the channel's existing epg_id
  if (channel.epg_id) {
    try {
      const programs = await database.all(`
        SELECT p.*, ec.source_id
        FROM epg_programs p
        LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
        WHERE p.channel_id = ?
        AND p.start_time <= ?
        AND p.end_time >= ?
        ORDER BY p.start_time
        LIMIT 100
      `, [channel.epg_id, endISO, startISO]);

      if (programs && programs.length > 0) {
        logger.debug('EPG programs found with original epg_id', {
          channelName: channel.name,
          epgId: channel.epg_id,
          programCount: programs.length
        });
        return { programs, epgId: channel.epg_id, source: 'original' };
      }
    } catch (error) {
      logger.error('Error querying EPG with original ID:', error);
    }
  }

  // Strategy 2: Try the mapped EPG ID from our mapper
  const mappedId = getEPGSourceChannelId(channel, true);
  if (mappedId && mappedId !== channel.epg_id) {
    try {
      const programs = await database.all(`
        SELECT p.*, ec.source_id
        FROM epg_programs p
        LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
        WHERE p.channel_id = ?
        AND p.start_time <= ?
        AND p.end_time >= ?
        ORDER BY p.start_time
        LIMIT 100
      `, [mappedId, endISO, startISO]);

      if (programs && programs.length > 0) {
        logger.info('EPG programs found with mapped ID', {
          channelName: channel.name,
          originalEpgId: channel.epg_id,
          mappedEpgId: mappedId,
          programCount: programs.length
        });
        return { programs, epgId: mappedId, source: 'mapped' };
      }
    } catch (error) {
      logger.error('Error querying EPG with mapped ID:', error);
    }
  }

  // Strategy 3: Try using the channel number as EPG ID
  const numberAsId = channel.number?.toString();
  if (numberAsId && numberAsId !== channel.epg_id && numberAsId !== mappedId) {
    try {
      const programs = await database.all(`
        SELECT p.*, ec.source_id
        FROM epg_programs p
        LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
        WHERE p.channel_id = ?
        AND p.start_time <= ?
        AND p.end_time >= ?
        ORDER BY p.start_time
        LIMIT 100
      `, [numberAsId, endISO, startISO]);

      if (programs && programs.length > 0) {
        logger.info('EPG programs found with channel number as ID', {
          channelName: channel.name,
          channelNumber: channel.number,
          programCount: programs.length
        });
        return { programs, epgId: numberAsId, source: 'number' };
      }
    } catch (error) {
      logger.error('Error querying EPG with channel number:', error);
    }
  }

  // Strategy 4: Try fuzzy matching by channel name
  if (channel.name) {
    try {
      // Look for EPG channels with similar names
      const epgChannel = await database.get(`
        SELECT epg_id
        FROM epg_channels
        WHERE LOWER(display_name) LIKE ?
        OR LOWER(display_name) LIKE ?
        LIMIT 1
      `, [`%${channel.name.toLowerCase()}%`, `%${channel.name.toLowerCase().replace(/\s+/g, '%')}%`]);

      if (epgChannel) {
        const programs = await database.all(`
          SELECT p.*, ec.source_id
          FROM epg_programs p
          LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
          WHERE p.channel_id = ?
          AND p.start_time <= ?
          AND p.end_time >= ?
          ORDER BY p.start_time
          LIMIT 100
        `, [epgChannel.epg_id, endISO, startISO]);

        if (programs && programs.length > 0) {
          logger.info('EPG programs found with fuzzy name match', {
            channelName: channel.name,
            matchedEpgId: epgChannel.epg_id,
            programCount: programs.length
          });
          return { programs, epgId: epgChannel.epg_id, source: 'fuzzy' };
        }
      }
    } catch (error) {
      logger.error('Error with fuzzy EPG matching:', error);
    }
  }

  // No programs found with any strategy
  logger.debug('No EPG programs found for channel', {
    channelName: channel.name,
    channelNumber: channel.number,
    triedEpgId: channel.epg_id,
    triedMappedId: mappedId,
    triedNumber: numberAsId
  });

  return { programs: [], epgId: channel.epg_id, source: 'none' };
}

/**
 * Get the best EPG ID for a channel based on available programs
 * @param {Object} channel - Channel object
 * @returns {string|null} The best EPG ID to use, or null if no programs found
 */
async function getBestEPGId(channel) {
  if (!channel) return null;

  // Check next 7 days of programs
  const startTime = new Date();
  const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const result = await resolveEPGPrograms(channel, startTime, endTime);

  if (result.programs.length > 0) {
    return result.epgId;
  }

  return null;
}

module.exports = {
  resolveEPGPrograms,
  getBestEPGId
};