/**
 * Plex Metadata Fix for Android TV Streaming
 * Ensures proper metadata structure for Plex streaming decisions
 */

const logger = require('./logger');

/**
 * Fixes EPG program metadata for Plex compatibility
 */
function fixProgramMetadata(program, channel) {
  // Ensure program has all required fields for Plex streaming decisions
  const fixed = {
    ...program,
    
    // Essential fields for Plex metadata recognition
    title: program.title || `${channel?.name || 'Channel'} Live`,
    description: program.description || `Live programming on ${channel?.name || 'this channel'}`,
    
    // Ensure proper time format
    start_time: program.start_time || new Date().toISOString(),
    end_time: program.end_time || new Date(Date.now() + 3600000).toISOString(),
    
    // Category for Plex content classification
    category: program.category || 'Live TV',
    
    // Technical metadata for Plex streaming decisions
    video_present: true,
    audio_present: true,
    aspect_ratio: program.aspect_ratio || '16:9',
    resolution: program.resolution || 'HDTV',
    audio_type: program.audio_type || 'stereo',
    
    // Metadata type identification (critical for Android TV)
    content_type: 'live_tv',
    metadata_type: 5, // Live TV type in Plex
    is_live: true,
    has_video: true,
    has_audio: true,
    
    // Channel association
    channel_id: program.channel_id || channel?.epg_id || channel?.id
  };

  return fixed;
}

/**
 * Enhances channel lineup for proper Plex streaming
 */
function enhanceChannelForStreaming(channel, baseURL) {
  return {
    GuideNumber: channel.number?.toString() || '0',
    GuideName: channel.name || 'Unknown Channel',
    URL: `${baseURL}/stream/${channel.id}`,
    
    // Essential streaming metadata
    HD: 1,
    DRM: 0, 
    Favorite: 0,
    
    // EPG metadata (critical for Android TV)
    EPGAvailable: true,
    EPGSource: `${baseURL}/epg/xmltv.xml`,
    EPGURL: `${baseURL}/epg/xmltv.xml`,
    GuideURL: `${baseURL}/epg/xmltv/${channel.id}`,
    EPGChannelID: channel.epg_id || channel.id,
    
    // Streaming resource metadata (fixes "No part decision" error)
    MediaType: 'LiveTV',
    ContentType: 5, // Live TV content type
    StreamType: 'live',
    HasVideo: true,
    HasAudio: true,
    VideoCodec: 'h264',
    AudioCodec: 'aac',
    Container: 'mpegts',
    
    // Android TV compatibility
    SupportedClients: ['android', 'androidtv', 'plex'],
    StreamingType: 'live_tv',
    LiveTV: true
  };
}

/**
 * Generates XMLTV programme element with proper metadata
 */
function generateXMLTVProgramme(program, channelId) {
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
  };

  const startTime = formatXMLTVTime(program.start_time);
  const endTime = formatXMLTVTime(program.end_time);
  
  let xml = `  <programme start="${startTime}" stop="${endTime}" channel="${escapeXML(channelId)}">\n`;
  xml += `    <title lang="en">${escapeXML(program.title)}</title>\n`;
  xml += `    <desc lang="en">${escapeXML(program.description)}</desc>\n`;
  
  // Category with proper system attribute
  xml += `    <category lang="en" system="plex">${escapeXML(program.category)}</category>\n`;
  
  // Video metadata (critical for streaming decisions)
  xml += `    <video>\n`;
  xml += `      <present>yes</present>\n`;
  xml += `      <colour>yes</colour>\n`;
  xml += `      <aspect>${escapeXML(program.aspect_ratio)}</aspect>\n`;
  xml += `      <quality>${escapeXML(program.resolution)}</quality>\n`;
  xml += `    </video>\n`;
  
  // Audio metadata (critical for streaming decisions)
  xml += `    <audio>\n`;
  xml += `      <present>yes</present>\n`;
  xml += `      <stereo>${escapeXML(program.audio_type)}</stereo>\n`;
  xml += `    </audio>\n`;
  
  // Live TV metadata (fixes Android TV recognition)
  xml += `    <live>1</live>\n`;
  xml += `    <metadata-type>5</metadata-type>\n`;
  xml += `    <content-type>live-tv</content-type>\n`;
  
  xml += `  </programme>\n`;
  
  return xml;
}

/**
 * Validates lineup data for streaming compatibility
 */
function validateLineupForStreaming(lineup) {
  return lineup.map(channel => {
    // Check for required fields
    const issues = [];
    
    if (!channel.GuideNumber) issues.push('Missing GuideNumber');
    if (!channel.GuideName) issues.push('Missing GuideName');
    if (!channel.URL) issues.push('Missing URL');
    if (!channel.EPGChannelID) issues.push('Missing EPGChannelID');
    
    if (issues.length > 0) {
      logger.warn('Channel validation issues', {
        channel: channel.GuideName,
        issues
      });
    }
    
    // Ensure all required fields are present
    return {
      ...channel,
      GuideNumber: channel.GuideNumber || '0',
      GuideName: channel.GuideName || 'Unknown Channel',
      EPGChannelID: channel.EPGChannelID || channel.id || 'unknown',
      ContentType: 5, // Force Live TV type
      StreamType: 'live'
    };
  });
}

module.exports = {
  fixProgramMetadata,
  enhanceChannelForStreaming,
  generateXMLTVProgramme,
  validateLineupForStreaming
};