/**
 * Streaming Decision Fix for PlexBridge Android TV
 * Addresses "No part decision to choose from" and "Cannot make a decision" errors
 */

const logger = require('./logger');

/**
 * Creates proper media part information for Plex streaming decisions
 * This is critical to prevent "No part decision" errors on Android TV
 */
function createMediaPartInfo(channel, baseURL) {
  const streamUrl = `${baseURL}/stream/${channel.id}`;
  
  // Essential media part information for Plex streaming decisions
  const mediaPart = {
    // Stream identifiers
    id: channel.id,
    key: streamUrl,
    file: streamUrl,
    
    // Container format (critical for Android TV)
    container: 'mpegts',
    format: 'mpegts',
    protocol: 'http',
    
    // Media properties (required for streaming decisions)
    size: 0, // Live streams don't have fixed size
    duration: 0, // Live streams are continuous
    
    // Video stream info (critical for transcoding decisions)
    videoProfile: 'main',
    videoLevel: '4.1',
    videoCodec: 'h264',
    videoResolution: '1920x1080',
    videoFrameRate: '25',
    videoBitrate: 5000,
    aspectRatio: '16:9',
    
    // Audio stream info (critical for transcoding decisions)
    audioCodec: 'aac',
    audioChannels: 2,
    audioSampleRate: 48000,
    audioBitrate: 128,
    
    // Streaming properties
    optimizedForStreaming: true,
    hasThumbnail: false,
    
    // Live TV specific properties
    live: true,
    accessible: true,
    exists: true
  };

  return mediaPart;
}

/**
 * Enhanced lineup with proper media part information
 * Prevents "No part decision" errors by providing complete stream metadata
 */
function enhanceLineupForStreamingDecisions(channels, baseURL, currentPrograms = new Map()) {
  return channels.map(channel => {
    const mediaPart = createMediaPartInfo(channel, baseURL);
    const currentProgram = currentPrograms.get(channel.epg_id || channel.id);
    
    return {
      // Basic HDHomeRun compatibility
      GuideNumber: channel.number?.toString() || '0',
      GuideName: channel.name || 'Unknown Channel',
      URL: mediaPart.key,
      
      // Streaming decision metadata (critical)
      HD: 1,
      DRM: 0,
      Favorite: 0,
      
      // Media part information (prevents "No part decision" error)
      MediaPart: mediaPart,
      Container: mediaPart.container,
      VideoCodec: mediaPart.videoCodec,
      AudioCodec: mediaPart.audioCodec,
      Protocol: mediaPart.protocol,
      
      // Live TV metadata
      Live: true,
      MediaType: 'LiveTV',
      ContentType: '5', // Live TV content type
      StreamType: 'live',
      
      // Transcoding hints for Android TV
      DirectPlaySupported: true,
      DirectStreamSupported: true,
      TranscodeSupported: true,
      
      // Stream quality information
      VideoResolution: mediaPart.videoResolution,
      VideoFrameRate: mediaPart.videoFrameRate,
      AudioChannels: mediaPart.audioChannels,
      AudioSampleRate: mediaPart.audioSampleRate,
      
      // EPG integration
      EPGAvailable: true,
      EPGSource: `${baseURL}/epg/xmltv.xml`,
      EPGURL: `${baseURL}/epg/xmltv.xml`,
      GuideURL: `${baseURL}/epg/xmltv/${channel.id}`,
      EPGChannelID: channel.epg_id || channel.id,
      
      // Current program metadata with explicit types for Android TV
      CurrentTitle: currentProgram?.title || `${channel.name} Live`,
      CurrentDescription: currentProgram?.description || `Live programming on ${channel.name}`,
      
      // Explicit metadata type for Android TV (fixes "Unknown metadata type" errors)
      type: 'episode', // Plex Android TV expects episode type for live TV
      metadata_type: 'episode', // Backup metadata type identifier
      contentType: 4, // Episode content type - NOT type 5 (trailer)
      mediaType: 'episode', // Media type for Plex decision making
      
      // Episode metadata structure for Android TV compatibility
      grandparentTitle: channel.name, // Show title (channel name)
      parentTitle: currentProgram?.title || `${channel.name} Live`, // Episode title
      title: currentProgram?.title || `${channel.name} Live`, // Display title
      originalTitle: currentProgram?.title || `${channel.name} Live`,
      summary: currentProgram?.description || `Live programming on ${channel.name}`,
      
      // Episode numbering for proper metadata structure  
      index: 1, // Episode number
      parentIndex: 1, // Season number
      year: new Date().getFullYear(),
      
      // Live TV identifiers
      guid: `plexbridge://live/${channel.id}/${Date.now()}`,
      key: `/library/metadata/live_${channel.id}`,
      live: 1, // Live content flag
      
      // Android TV compatibility flags
      AndroidTVCompatible: true,
      SupportsDirectPlay: true,
      RequiresTranscoding: false
    };
  });
}

/**
 * Generates device XML with proper media part capabilities
 * Helps Plex make better streaming decisions
 */
function generateDeviceXMLWithStreamingInfo(deviceInfo) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <presentationURL>/</presentationURL>
    <friendlyName>${deviceInfo.friendlyName}</friendlyName>
    <manufacturer>PlexBridge</manufacturer>
    <manufacturerURL>https://github.com/plexbridge/plexbridge</manufacturerURL>
    <modelDescription>PlexBridge IPTV to Plex Bridge</modelDescription>
    <modelName>PlexBridge</modelName>
    <modelNumber>1.0</modelNumber>
    <modelURL>https://github.com/plexbridge/plexbridge</modelURL>
    <serialNumber>${deviceInfo.uuid}</serialNumber>
    <UDN>uuid:${deviceInfo.uuid}</UDN>
    
    <!-- Streaming capabilities for Plex decision making -->
    <streamingCapabilities>
      <supportedContainers>mpegts,hls,m3u8</supportedContainers>
      <supportedVideoCodecs>h264,h265</supportedVideoCodecs>
      <supportedAudioCodecs>aac,mp3</supportedAudioCodecs>
      <maxStreams>${deviceInfo.tunerCount || 4}</maxStreams>
      <liveTV>true</liveTV>
      <directPlay>true</directPlay>
      <directStream>true</directStream>
      <transcoding>true</transcoding>
    </streamingCapabilities>
    
    <iconList>
      <icon>
        <mimetype>image/png</mimetype>
        <width>120</width>
        <height>120</height>
        <depth>24</depth>
        <url>/icon.png</url>
      </icon>
    </iconList>
  </device>
</root>`;
}

/**
 * Validates streaming decision metadata
 * Ensures all required fields are present to prevent decision errors
 */
function validateStreamingMetadata(lineup) {
  const requiredFields = [
    'GuideNumber', 'GuideName', 'URL', 'Container', 
    'VideoCodec', 'AudioCodec', 'MediaType', 'ContentType'
  ];
  
  return lineup.map(channel => {
    const missing = requiredFields.filter(field => !channel[field]);
    
    if (missing.length > 0) {
      logger.warn('Channel missing streaming metadata fields', {
        channel: channel.GuideName,
        missing: missing,
        channelId: channel.EPGChannelID
      });
      
      // Add missing fields with defaults
      missing.forEach(field => {
        switch (field) {
          case 'Container': channel[field] = 'mpegts'; break;
          case 'VideoCodec': channel[field] = 'h264'; break;
          case 'AudioCodec': channel[field] = 'aac'; break;
          case 'MediaType': channel[field] = 'LiveTV'; break;
          case 'ContentType': channel[field] = '5'; break;
          case 'GuideNumber': channel[field] = '0'; break;
          case 'GuideName': channel[field] = 'Unknown'; break;
          case 'URL': channel[field] = '#'; break;
        }
      });
    }
    
    return channel;
  });
}

/**
 * Creates streaming session metadata for active streams
 * Helps Plex track and manage streaming decisions
 */
function createStreamingSession(channelId, clientInfo = {}) {
  return {
    sessionId: `plex_${channelId}_${Date.now()}`,
    channelId: channelId,
    startTime: new Date().toISOString(),
    clientInfo: {
      userAgent: clientInfo.userAgent || 'Unknown',
      platform: clientInfo.platform || 'Unknown',
      product: clientInfo.product || 'Plex',
      isAndroidTV: clientInfo.userAgent?.toLowerCase().includes('android') || false
    },
    streamingDecision: {
      container: 'mpegts',
      videoCodec: 'h264',
      audioCodec: 'aac',
      protocol: 'http',
      directPlay: true
    },
    quality: {
      videoResolution: '1920x1080',
      videoFrameRate: '25',
      audioBitrate: 128,
      videoProfile: 'high'
    }
  };
}

module.exports = {
  createMediaPartInfo,
  enhanceLineupForStreamingDecisions,
  generateDeviceXMLWithStreamingInfo,
  validateStreamingMetadata,
  createStreamingSession
};