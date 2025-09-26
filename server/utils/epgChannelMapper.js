/**
 * EPG Channel Mapper
 * Maps EPG source channel IDs to internal channel EPG IDs
 * Fixes the issue where channels like "Three" have epg_id="mjh-three"
 * but EPG source provides programs with channel_id="3"
 */

const logger = require('./logger');

/**
 * Map of channel names/numbers to their actual EPG source IDs
 * This fixes mismatches between what channels expect and what EPG sources provide
 */
const EPG_CHANNEL_MAPPINGS = {
  // TVNZ/Discovery channels - EPG source uses numeric IDs
  'TVNZ 1': '1',
  'TVNZ 2': '2',
  'Three': '3',
  'Bravo': '4',
  'Eden': '7',
  'Rush': '10',
  'TVNZ Duke': '6',
  'Sky Open': '11',

  // Maori TV channels
  'Māori Television': '5',
  'Te Reo': '15',
  'Whakaata Māori': '5',

  // Alternative mappings by channel number
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  '11': '11',
  '15': '15'
};

/**
 * Get the correct EPG source channel ID for a channel
 * This function provides intelligent mapping to handle mismatched EPG IDs
 * @param {Object} channel - Channel object with name, number, and epg_id
 * @param {boolean} fallbackEnabled - Whether to use fallback mapping (default: true)
 * @returns {string} The EPG source channel ID to use for lookups
 */
function getEPGSourceChannelId(channel, fallbackEnabled = true) {
  if (!channel) return null;

  // If fallback is disabled, just return the existing epg_id
  if (!fallbackEnabled) {
    return channel.epg_id;
  }

  // First check by channel name
  if (channel.name && EPG_CHANNEL_MAPPINGS[channel.name]) {
    logger.debug(`Mapped channel "${channel.name}" to EPG ID "${EPG_CHANNEL_MAPPINGS[channel.name]}"`);
    return EPG_CHANNEL_MAPPINGS[channel.name];
  }

  // Then check by channel number
  const numberStr = channel.number?.toString();
  if (numberStr && EPG_CHANNEL_MAPPINGS[numberStr]) {
    logger.debug(`Mapped channel number ${numberStr} to EPG ID "${EPG_CHANNEL_MAPPINGS[numberStr]}"`);
    return EPG_CHANNEL_MAPPINGS[numberStr];
  }

  // Check if epg_id starts with 'mjh-' and try to extract number
  if (channel.epg_id && channel.epg_id.startsWith('mjh-')) {
    // Try to map common mjh- prefixed IDs
    const mjhMappings = {
      'mjh-tvnz-1': '1',
      'mjh-tvnz-2': '2',
      'mjh-three': '3',
      'mjh-bravo': '4',
      'mjh-maori-tv': '5',
      'mjh-tvnz-duke': '6',
      'mjh-eden': '7',
      'mjh-rush-nz': '10',
      'mjh-sky-open': '11',
      'mjh-te-reo': '15'
    };

    if (mjhMappings[channel.epg_id]) {
      logger.debug(`Mapped mjh EPG ID "${channel.epg_id}" to "${mjhMappings[channel.epg_id]}"`);
      return mjhMappings[channel.epg_id];
    }
  }

  // Fallback to original epg_id
  return channel.epg_id;
}

/**
 * Check if a channel needs EPG ID remapping
 * @param {Object} channel - Channel object
 * @returns {boolean} True if channel needs remapping
 */
function needsEPGRemapping(channel) {
  if (!channel) return false;

  // Check if current epg_id starts with mjh- or other prefixes that don't match source
  if (channel.epg_id && channel.epg_id.startsWith('mjh-')) {
    return true;
  }

  // Check if channel name is in our mapping table
  if (channel.name && EPG_CHANNEL_MAPPINGS[channel.name]) {
    const mappedId = EPG_CHANNEL_MAPPINGS[channel.name];
    return channel.epg_id !== mappedId;
  }

  return false;
}

/**
 * Get suggested EPG ID for a channel
 * @param {Object} channel - Channel object
 * @returns {string|null} Suggested EPG ID or null if current is correct
 */
function getSuggestedEPGId(channel) {
  if (!needsEPGRemapping(channel)) {
    return null;
  }

  return getEPGSourceChannelId(channel);
}

module.exports = {
  getEPGSourceChannelId,
  needsEPGRemapping,
  getSuggestedEPGId,
  EPG_CHANNEL_MAPPINGS
};