/**
 * Plex Metadata Unification Fix
 * 
 * Addresses critical Plex streaming errors:
 * - "Unable to find title for item of type 5"
 * - "Unknown metadata type"
 * - "Failed to find consumer"
 * 
 * This fix ensures consistent metadata types across all PlexBridge components
 * and provides proper session management for Plex consumers.
 */

const logger = require('./logger');

/**
 * CRITICAL: Unified metadata type configuration
 * 
 * The key insight is that Plex needs CONSISTENT metadata types throughout
 * the entire request/response cycle. Mixing numeric (5) and string ('episode')
 * types causes Plex to fail metadata resolution.
 */
const PLEX_METADATA_CONFIG = {
  // Primary type identifier - MUST be consistent everywhere
  contentType: 'episode',        // String type for Plex Android TV compatibility
  numericType: 1,               // Numeric type (1 = episode, NOT 5 = live TV which causes errors)
  mediaType: 'episode',         // Media type identifier
  metadataType: 'episode',      // Metadata type for decisions
  
  // Container and streaming properties
  container: 'mpegts',          // MPEG-TS for HDHomeRun compatibility
  protocol: 'http',             // HTTP streaming protocol
  
  // Live TV specific properties
  isLive: true,
  streamType: 'live',
  
  // Codec information for transcoding decisions
  videoCodec: 'h264',
  audioCodec: 'aac'
};

/**
 * Creates consistent channel metadata for lineup responses
 * Fixes "Unable to find title", "Unknown metadata type", "No part decision", and MediaContainer errors
 * UPDATED: Now handles transcoding metadata requirements
 */
function createUnifiedChannelMetadata(channel, baseURL, currentProgram = null, transcodeInfo = null) {
  const streamUrl = `${baseURL}/stream/${channel.id}`;
  
  // Determine if this channel uses transcoding and adjust metadata accordingly
  const isTranscoding = transcodeInfo?.forceTranscode || false;
  const transcodingProfile = isTranscoding ? transcodeInfo : {};
  
  // Transcoding-aware codec and quality settings
  const effectiveVideoCodec = isTranscoding ? (transcodingProfile.videoCodec || 'h264') : PLEX_METADATA_CONFIG.videoCodec;
  const effectiveAudioCodec = isTranscoding ? (transcodingProfile.audioCodec || 'aac') : PLEX_METADATA_CONFIG.audioCodec;
  const effectiveVideoBitrate = isTranscoding ? (transcodingProfile.videoBitrate || 2500) : 4000;
  const effectiveAudioBitrate = isTranscoding ? (transcodingProfile.audioBitrate || 128) : 128;
  const effectiveVideoProfile = isTranscoding ? (transcodingProfile.videoProfile || 'high') : 'main';
  const effectiveContainer = isTranscoding ? 'mpegts' : PLEX_METADATA_CONFIG.container;
  
  return {
    // HDHomeRun compatibility (basic requirements)
    GuideNumber: channel.number?.toString() || '0',
    GuideName: channel.name || 'Unknown Channel',
    URL: streamUrl,
    HD: 1,
    DRM: 0,
    Favorite: 0,
    
    // UNIFIED TYPE SYSTEM - Critical for Plex metadata resolution
    type: PLEX_METADATA_CONFIG.contentType,           // Primary type field
    contentType: PLEX_METADATA_CONFIG.numericType,    // Numeric type (1 = episode)
    metadata_type: PLEX_METADATA_CONFIG.metadataType, // Metadata type
    mediaType: PLEX_METADATA_CONFIG.mediaType,        // Media type
    
    // Container and codec information for streaming decisions (transcoding-aware)
    Container: effectiveContainer,
    VideoCodec: effectiveVideoCodec,
    AudioCodec: effectiveAudioCodec,
    Protocol: PLEX_METADATA_CONFIG.protocol,
    
    // Transcoding indicators for Plex decision making
    IsTranscoding: isTranscoding,
    TranscodingRequired: isTranscoding,
    OriginalFormat: isTranscoding ? 'varies' : effectiveContainer,
    
    // Live TV properties
    Live: PLEX_METADATA_CONFIG.isLive,
    StreamType: PLEX_METADATA_CONFIG.streamType,
    
    // Episode structure for Android TV (treats live TV as episodes)
    title: currentProgram?.title || `${channel.name} Live`,
    summary: currentProgram?.description || `Live programming on ${channel.name}`,
    grandparentTitle: channel.name,           // Show title (channel name)
    parentTitle: 'Live Programming',          // Season title
    originalTitle: channel.name,              // Original show title
    
    // Episode numbering for proper structure
    index: 1,                                 // Episode number
    parentIndex: 1,                           // Season number
    year: new Date().getFullYear(),
    
    // Unique identifiers
    guid: `plexbridge://live/${channel.id}/${Date.now()}`,
    key: `/library/metadata/live_${channel.id}`,
    ratingKey: `live_${channel.id}`,
    
    // EPG integration
    EPGAvailable: true,
    EPGSource: `${baseURL}/epg/xmltv.xml`,
    EPGURL: `${baseURL}/epg/xmltv.xml`,
    GuideURL: `${baseURL}/epg/xmltv/${channel.id}`,
    EPGChannelID: channel.epg_id || channel.id,
    
    // Streaming capabilities for Plex decision making
    DirectPlaySupported: true,
    DirectStreamSupported: true,
    TranscodeSupported: true,
    
    // CRITICAL: Complete Media structure to fix "No part decision" and MediaContainer errors
    // UPDATED: Now uses transcoding-aware parameters for accurate Plex decisions
    Media: [{
      id: `media_${channel.id}`,
      duration: 0,        // Live content
      bitrate: effectiveVideoBitrate + effectiveAudioBitrate, // Total bitrate for transcoded streams
      width: 1920,
      height: 1080,
      aspectRatio: 1.78,  // 16:9 aspect ratio
      audioChannels: 2,
      audioCodec: effectiveAudioCodec,
      videoCodec: effectiveVideoCodec,
      container: effectiveContainer,
      videoFrameRate: 'PAL',
      audioSampleRate: 48000,
      videoProfile: effectiveVideoProfile,
      videoLevel: 41,
      protocol: PLEX_METADATA_CONFIG.protocol,
      
      // Transcoding-specific metadata for Plex decision engine
      isTranscoding: isTranscoding,
      transcodingProfile: isTranscoding ? 'live_tv_transcode' : 'live_tv_direct',
      optimizedForStreaming: true,
      
      // ESSENTIAL: Part object that Plex uses for streaming decisions
      Part: [{
        id: `part_${channel.id}`,
        key: streamUrl,
        file: streamUrl,
        size: 0,
        duration: 0,
        container: effectiveContainer,
        videoProfile: effectiveVideoProfile,
        
        // Decision-making properties for Plex (transcoding-aware)
        decision: isTranscoding ? 'transcode' : 'directplay',
        selected: true,
        accessible: true,
        exists: true,
        
        // Transcoding decision metadata
        hasThumbnail: false,
        isTranscoded: isTranscoding,
        canDirectPlay: !isTranscoding,
        canDirectStream: !isTranscoding,
        
        // Streaming optimization flags
        optimizedForStreaming: true,
        has64bitOffsets: false,
        hasThumbnail: false,
        
        // CRITICAL: Stream objects for transcoding decisions (transcoding-aware)
        Stream: [
          {
            id: `${channel.id}_video`,
            streamType: 1,
            default: true,
            codec: effectiveVideoCodec,
            index: 0,
            bitrate: effectiveVideoBitrate,
            bitDepth: 8,
            chromaLocation: 'left',
            chromaSubsampling: '4:2:0',
            codedHeight: 1080,
            codedWidth: 1920,
            colorPrimaries: 'bt709',
            colorRange: 'tv',
            colorSpace: 'bt709',
            colorTrc: 'bt709',
            frameRate: 25,
            height: 1080,
            width: 1920,
            hasScalingMatrix: false,
            level: 41,
            pixelFormat: 'yuv420p',
            profile: effectiveVideoProfile,
            refFrames: isTranscoding ? 1 : 4, // Lower ref frames for transcoded streams
            scanType: 'progressive',
            displayTitle: `${effectiveVideoCodec.toUpperCase()} (${isTranscoding ? 'Transcoded' : 'Main'})`,
            extendedDisplayTitle: `${effectiveVideoCodec.toUpperCase()} (${isTranscoding ? 'Transcoded' : 'Main'})`,
            
            // Transcoding-specific stream properties
            isTranscoded: isTranscoding,
            transcodingDecision: isTranscoding ? 'transcode' : 'copy'
          },
          {
            id: `${channel.id}_audio`,
            streamType: 2,
            selected: true,
            default: true,
            codec: effectiveAudioCodec,
            index: 1,
            channels: 2,
            bitrate: effectiveAudioBitrate,
            bitDepth: 16,
            profile: isTranscoding ? 'lc' : 'lc', // AAC LC profile for both cases
            samplingRate: 48000,
            displayTitle: `${effectiveAudioCodec.toUpperCase()} (${isTranscoding ? 'Transcoded' : 'Main'})`,
            extendedDisplayTitle: `${effectiveAudioCodec.toUpperCase()} (${isTranscoding ? 'Transcoded' : 'Main'})`,
            languageCode: 'eng',
            languageTag: 'en',
            
            // Transcoding-specific stream properties
            isTranscoded: isTranscoding,
            transcodingDecision: isTranscoding ? 'transcode' : 'copy'
          }
        ]
      }]
    }],
    
    // Additional properties for Android TV and web client compatibility
    allowSync: false,
    librarySectionID: 1,
    librarySectionTitle: 'Live TV',
    librarySectionUUID: 'com.plexapp.plugins.library',
    personal: true,
    sourceTitle: 'PlexBridge',
    
    // Prevent metadata resolution errors
    ratingCount: 0,
    viewCount: 0,
    skipCount: 0,
    lastViewedAt: 0,
    viewOffset: 0,
    
    // Live TV specific flags for proper client handling
    onDeck: false,
    primaryExtraKey: null,
    ratingImage: null,
    
    // Ensure proper JSON structure for MediaContainer responses
    _type: 'episode',
    _mediaType: 'episode',
    _contentType: 1
  };
}

/**
 * Extracts transcoding information from stream data
 * Used to create transcoding-aware metadata
 */
function extractTranscodingInfo(stream) {
  if (!stream || !stream.protocol_options) {
    return { forceTranscode: false };
  }

  try {
    const protocolOptions = typeof stream.protocol_options === 'string' 
      ? JSON.parse(stream.protocol_options) 
      : stream.protocol_options;
    
    const forceTranscode = protocolOptions.forceTranscode === true;
    
    // Extract transcoding parameters if available
    const transcodeInfo = {
      forceTranscode,
      videoCodec: forceTranscode ? 'h264' : 'h264', // Force H.264 for transcoding
      audioCodec: forceTranscode ? 'aac' : 'aac',   // Force AAC for transcoding
      videoBitrate: forceTranscode ? 2500 : 4000,   // Lower bitrate for transcoding
      audioBitrate: forceTranscode ? 128 : 128,     // Standard audio bitrate
      videoProfile: forceTranscode ? 'high' : 'main' // High profile for transcoding
    };

    return transcodeInfo;
  } catch (error) {
    // If parsing fails, assume no transcoding
    return { forceTranscode: false };
  }
}

/**
 * Creates consistent session metadata for consumer tracking
 * Fixes "Failed to find consumer" errors
 */
function createUnifiedSessionMetadata(channelId, sessionId, clientInfo = {}) {
  return {
    // Session identifiers
    sessionId: sessionId || `plex_${channelId}_${Date.now()}`,
    channelId: channelId,
    
    // Consumer tracking information (critical for Plex)
    consumerId: `consumer_${channelId}_${Date.now()}`,
    consumerType: 'plex_media_server',
    consumerState: 'active',
    
    // Client information
    clientInfo: {
      userAgent: clientInfo.userAgent || 'Unknown',
      platform: clientInfo.platform || 'Unknown',
      product: clientInfo.product || 'Plex Media Server',
      version: clientInfo.version || '1.0',
      isAndroidTV: clientInfo.userAgent?.toLowerCase().includes('android') || false,
      remoteAddress: clientInfo.remoteAddress || 'unknown'
    },
    
    // Streaming decision metadata (unified with channel metadata)
    streamingDecision: {
      type: PLEX_METADATA_CONFIG.contentType,
      contentType: PLEX_METADATA_CONFIG.numericType,
      container: PLEX_METADATA_CONFIG.container,
      videoCodec: PLEX_METADATA_CONFIG.videoCodec,
      audioCodec: PLEX_METADATA_CONFIG.audioCodec,
      protocol: PLEX_METADATA_CONFIG.protocol,
      directPlay: true,
      transcoding: false
    },
    
    // Session state
    startTime: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    status: 'active',
    isLive: PLEX_METADATA_CONFIG.isLive
  };
}

/**
 * Validates and fixes existing channel lineup data
 * Ensures all channels have consistent unified metadata
 */
function validateAndFixLineupMetadata(lineup) {
  return lineup.map(channel => {
    const issues = [];
    
    // Check for critical metadata inconsistencies
    if (channel.contentType === '5' || channel.ContentType === '5') {
      issues.push('Using legacy live TV type (5) instead of episode type (1)');
    }
    
    if (channel.type !== 'episode') {
      issues.push('Inconsistent primary type - should be "episode"');
    }
    
    if (channel.metadata_type !== 'episode') {
      issues.push('Inconsistent metadata_type - should be "episode"');
    }
    
    if (issues.length > 0) {
      logger.warn('Fixed channel metadata inconsistencies', {
        channel: channel.GuideName || channel.name,
        channelId: channel.id || channel.EPGChannelID,
        issues
      });
    }
    
    // Apply unified metadata fixes
    const fixedChannel = {
      ...channel,
      
      // Fix type inconsistencies
      type: PLEX_METADATA_CONFIG.contentType,
      contentType: PLEX_METADATA_CONFIG.numericType,
      ContentType: PLEX_METADATA_CONFIG.numericType,
      metadata_type: PLEX_METADATA_CONFIG.metadataType,
      mediaType: PLEX_METADATA_CONFIG.mediaType,
      
      // Ensure container consistency
      Container: PLEX_METADATA_CONFIG.container,
      container: PLEX_METADATA_CONFIG.container,
      
      // Fix codec information
      VideoCodec: PLEX_METADATA_CONFIG.videoCodec,
      AudioCodec: PLEX_METADATA_CONFIG.audioCodec,
      
      // Live TV properties
      Live: PLEX_METADATA_CONFIG.isLive,
      live: PLEX_METADATA_CONFIG.isLive,
      StreamType: PLEX_METADATA_CONFIG.streamType
    };
    
    return fixedChannel;
  });
}

/**
 * Creates response headers for unified metadata handling
 * Ensures Plex receives consistent type information
 */
function createUnifiedResponseHeaders(sessionId, channelId) {
  return {
    'Content-Type': 'video/mp2t',
    'X-Plex-Content-Type': PLEX_METADATA_CONFIG.contentType,
    'X-Plex-Media-Type': PLEX_METADATA_CONFIG.mediaType,
    'X-Plex-Container': PLEX_METADATA_CONFIG.container,
    'X-Plex-Protocol': PLEX_METADATA_CONFIG.protocol,
    'X-Plex-Live': PLEX_METADATA_CONFIG.isLive.toString(),
    'X-Session-ID': sessionId,
    'X-Channel-ID': channelId,
    'X-Consumer-Type': 'plex_media_server',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive'
  };
}

/**
 * Creates proper MediaContainer XML response for Plex metadata requests
 * Fixes "expected MediaContainer element, found html" errors
 */
function createMediaContainerResponse(channels, baseURL) {
  const xmlItems = channels.map(channel => {
    const unifiedChannel = createUnifiedChannelMetadata(channel, baseURL);
    return `
    <Video
      ratingKey="${unifiedChannel.ratingKey}"
      key="${unifiedChannel.key}"
      guid="${unifiedChannel.guid}"
      type="${unifiedChannel.type}"
      title="${escapeXML(unifiedChannel.title)}"
      grandparentTitle="${escapeXML(unifiedChannel.grandparentTitle)}"
      parentTitle="${escapeXML(unifiedChannel.parentTitle)}"
      originalTitle="${escapeXML(unifiedChannel.originalTitle)}"
      summary="${escapeXML(unifiedChannel.summary)}"
      index="${unifiedChannel.index}"
      parentIndex="${unifiedChannel.parentIndex}"
      year="${unifiedChannel.year}"
      live="${unifiedChannel.Live ? 1 : 0}"
      librarySectionID="${unifiedChannel.librarySectionID}"
      librarySectionTitle="${escapeXML(unifiedChannel.librarySectionTitle)}"
    >
      ${unifiedChannel.Media.map(media => `
      <Media
        id="${media.id}"
        duration="${media.duration}"
        bitrate="${media.bitrate}"
        width="${media.width}"
        height="${media.height}"
        aspectRatio="${media.aspectRatio}"
        audioChannels="${media.audioChannels}"
        audioCodec="${media.audioCodec}"
        videoCodec="${media.videoCodec}"
        container="${media.container}"
        videoFrameRate="${media.videoFrameRate}"
        audioSampleRate="${media.audioSampleRate}"
        videoProfile="${media.videoProfile}"
        protocol="${media.protocol}"
      >
        ${media.Part.map(part => `
        <Part
          id="${part.id}"
          key="${escapeXML(part.key)}"
          file="${escapeXML(part.file)}"
          size="${part.size}"
          duration="${part.duration}"
          container="${part.container}"
          decision="${part.decision}"
          selected="${part.selected ? 'true' : 'false'}"
          accessible="${part.accessible ? 'true' : 'false'}"
        >
          ${part.Stream.map(stream => `
          <Stream
            id="${stream.id}"
            streamType="${stream.streamType}"
            codec="${stream.codec}"
            index="${stream.index}"
            ${stream.streamType === 1 ? `
            bitrate="${stream.bitrate}"
            width="${stream.width}"
            height="${stream.height}"
            frameRate="${stream.frameRate}"
            profile="${stream.profile}"
            level="${stream.level}"
            ` : `
            channels="${stream.channels}"
            bitrate="${stream.bitrate}"
            samplingRate="${stream.samplingRate}"
            profile="${stream.profile}"
            `}
            displayTitle="${escapeXML(stream.displayTitle)}"
          />
          `).join('')}
        </Part>
        `).join('')}
      </Media>
      `).join('')}
    </Video>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="${channels.length}" allowSync="0" identifier="com.plexapp.plugins.library" mediaTagPrefix="/system/bundle/media/flags/" mediaTagVersion="1640111100" mixedParents="0">
  ${xmlItems}
</MediaContainer>`;
}

/**
 * Utility function to escape XML characters
 */
function escapeXML(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Global configuration for all PlexBridge components
 * Use this to ensure consistent metadata across the system
 */
function getUnifiedPlexConfig() {
  return {
    ...PLEX_METADATA_CONFIG,
    
    // Response configuration
    responseHeaders: {
      contentType: 'video/mp2t',
      cacheControl: 'no-cache, no-store, must-revalidate',
      connection: 'keep-alive'
    },
    
    // Session configuration
    sessionConfig: {
      timeout: 300000,      // 5 minutes
      keepAliveInterval: 30000,  // 30 seconds
      maxConcurrentSessions: 10
    },
    
    // Consumer tracking configuration
    consumerConfig: {
      trackingEnabled: true,
      cleanupInterval: 60000,   // 1 minute
      orphanedTimeout: 120000   // 2 minutes
    }
  };
}

module.exports = {
  createUnifiedChannelMetadata,
  createUnifiedSessionMetadata,
  validateAndFixLineupMetadata,
  createUnifiedResponseHeaders,
  createMediaContainerResponse,
  extractTranscodingInfo,
  getUnifiedPlexConfig,
  escapeXML,
  PLEX_METADATA_CONFIG
};