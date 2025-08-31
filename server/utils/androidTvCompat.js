/**
 * Android TV Compatibility Module
 * Ensures proper metadata formatting for Android TV Plex app
 */

const logger = require('./logger');

/**
 * Ensures EPG program has all required fields for Android TV
 * @param {Object} program - EPG program object
 * @param {Object} channel - Channel object
 * @returns {Object} Enhanced program object
 */
function ensureAndroidTVCompatibility(program, channel) {
  // Ensure title is always present and valid
  if (!program.title || program.title.trim() === '') {
    program.title = channel ? `${channel.name} Programming` : 'Live Programming';
    logger.debug('Added fallback title for Android TV', { 
      channelName: channel?.name,
      originalTitle: program.title 
    });
  }

  // Ensure description is present
  if (!program.description || program.description.trim() === '') {
    program.description = channel 
      ? `Currently broadcasting on ${channel.name}`
      : 'Live television programming';
  }

  // Ensure category is present
  if (!program.category) {
    program.category = 'Entertainment';
  }

  // Ensure proper time fields
  if (!program.start_time) {
    program.start_time = new Date().toISOString();
  }
  if (!program.end_time) {
    const endTime = new Date(program.start_time);
    endTime.setHours(endTime.getHours() + 1);
    program.end_time = endTime.toISOString();
  }

  // Add metadata type for Android TV
  program.metadata_type = 'live_tv';
  program.content_type = 5; // Type 5 is Live TV in Plex

  return program;
}

/**
 * Generates fallback EPG data for a channel when no real data exists
 * @param {Object} channel - Channel object
 * @param {Date} startTime - Start time for program
 * @param {Number} durationHours - Duration in hours
 * @returns {Object} Generated program object
 */
function generateFallbackProgram(channel, startTime = new Date(), durationHours = 1) {
  const endTime = new Date(startTime.getTime() + (durationHours * 60 * 60 * 1000));
  
  return {
    id: `fallback_${channel.id}_${startTime.getTime()}`,
    channel_id: channel.epg_id || channel.id,
    title: `${channel.name} Live`,
    description: `Live programming on ${channel.name}. Program information is currently unavailable.`,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    category: 'Live TV',
    metadata_type: 'live_tv',
    content_type: 5,
    is_fallback: true
  };
}

/**
 * Validates and enhances lineup data for Android TV
 * @param {Array} lineup - Channel lineup array
 * @returns {Array} Enhanced lineup
 */
function enhanceLineupForAndroidTV(lineup) {
  return lineup.map(channel => {
    // Ensure all required fields are present
    const enhanced = {
      ...channel,
      // Required HDHomeRun fields
      GuideNumber: channel.GuideNumber || channel.number?.toString() || '0',
      GuideName: channel.GuideName || channel.name || 'Unknown Channel',
      
      // Android TV specific enhancements
      MediaType: 'LiveTV',
      ContentType: 5,
      HasTitle: true,
      HasDescription: true,
      
      // Fallback metadata
      DefaultTitle: `${channel.GuideName || channel.name} Live`,
      DefaultDescription: `Live stream on ${channel.GuideName || channel.name}`
    };

    // Ensure EPG fields are properly formatted
    if (enhanced.EPGChannelID === enhanced.id) {
      // If EPG ID is same as internal ID, it might not be properly mapped
      logger.debug('EPG Channel ID matches internal ID, may need remapping', {
        channelId: enhanced.id,
        channelName: enhanced.GuideName
      });
    }

    return enhanced;
  });
}

/**
 * Checks if the request is from Android TV app
 * @param {String} userAgent - User agent string
 * @returns {Boolean} True if Android TV
 */
function isAndroidTVRequest(userAgent) {
  if (!userAgent) return false;
  
  const androidTVIndicators = [
    'android',
    'androidtv', 
    'shield',
    'bravia',
    'aftt', // Amazon Fire TV
    'aftm', // Amazon Fire TV Stick
    'philips',
    'sony'
  ];
  
  const lowerUA = userAgent.toLowerCase();
  return androidTVIndicators.some(indicator => lowerUA.includes(indicator));
}

/**
 * Formats XMLTV time for Android TV compatibility
 * @param {String} isoString - ISO format time string
 * @returns {String} XMLTV formatted time
 */
function formatXMLTVTimeForAndroidTV(isoString) {
  const date = new Date(isoString);
  
  // Android TV prefers local timezone
  const timezoneOffset = -date.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
  const offsetMinutes = Math.abs(timezoneOffset) % 60;
  const offsetSign = timezoneOffset >= 0 ? '+' : '-';
  const offsetString = `${offsetSign}${String(offsetHours).padStart(2, '0')}${String(offsetMinutes).padStart(2, '0')}`;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}${hour}${minute}${second} ${offsetString}`;
}

module.exports = {
  ensureAndroidTVCompatibility,
  generateFallbackProgram,
  enhanceLineupForAndroidTV,
  isAndroidTVRequest,
  formatXMLTVTimeForAndroidTV
};