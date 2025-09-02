/**
 * Plex Library API Routes
 * Handles Plex library and metadata requests to prevent MediaContainer errors
 */

const express = require('express');
const router = express.Router();
const database = require('../services/database');
const logger = require('../utils/logger');
const { createUnifiedChannelMetadata, createMediaContainerResponse, extractTranscodingInfo } = require('../utils/plexMetadataUnificationFix');

/**
 * Get base URL for responses
 */
function getBaseURL(req) {
  const baseHost = process.env.ADVERTISED_HOST || req.get('host') || 'localhost:3000';
  return baseHost.startsWith('http') ? baseHost : `http://${baseHost}`;
}

/**
 * Library sections endpoint - Required for Plex to understand content structure
 */
router.get('/sections', async (req, res) => {
  try {
    const baseURL = getBaseURL(req);
    
    // Return Live TV as a library section
    const sections = {
      MediaContainer: {
        size: 1,
        allowSync: 0,
        identifier: "com.plexapp.plugins.library",
        mediaTagPrefix: "/system/bundle/media/flags/",
        mediaTagVersion: "1640111100",
        
        Directory: [{
          allowSync: false,
          art: "/:/resources/show-fanart.jpg",
          composite: "/library/sections/1/composite/1640111100",
          filters: true,
          refreshing: false,
          thumb: "/:/resources/show.png",
          key: "1",
          type: "show",
          title: "Live TV",
          agent: "com.plexapp.agents.none",
          scanner: "Plex TV Series Scanner",
          language: "en-US",
          uuid: "e05e77e4-1cc3-4e1e-9e79-8bf9b51f5f3f",
          updatedAt: Math.floor(Date.now() / 1000),
          createdAt: Math.floor(Date.now() / 1000),
          scannedAt: Math.floor(Date.now() / 1000),
          
          Location: [{
            id: 1,
            path: "/library/sections/1/all"
          }]
        }]
      }
    };

    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Plex-Content-Type': 'MediaContainer',
      'X-Plex-Protocol': '1.0'
    });

    logger.info('Served library sections to Plex', {
      userAgent: req.get('User-Agent'),
      path: req.path
    });

    res.json(sections);
  } catch (error) {
    logger.error('Library sections error:', error);
    res.status(500).json({
      MediaContainer: {
        size: 0,
        identifier: "com.plexapp.plugins.library"
      }
    });
  }
});

/**
 * Library section content - Returns live TV channels as episodes
 */
router.get('/sections/:sectionId/all', async (req, res) => {
  try {
    const baseURL = getBaseURL(req);
    const sectionId = req.params.sectionId;
    
    // Get all enabled channels
    const channels = await database.all(`
      SELECT c.*, s.url, s.type 
      FROM channels c 
      LEFT JOIN streams s ON c.id = s.channel_id 
      WHERE c.enabled = 1 AND s.enabled = 1
      ORDER BY c.number
    `);

    // Create unified metadata for each channel with transcoding awareness
    const videos = channels.map(channel => {
      const transcodeInfo = extractTranscodingInfo({ protocol_options: channel.protocol_options });
      const unifiedChannel = createUnifiedChannelMetadata(channel, baseURL, null, transcodeInfo);
      
      return {
        ratingKey: `live_${channel.id}`,
        key: `/library/metadata/live_${channel.id}`,
        parentRatingKey: `show_${channel.id}`,
        grandparentRatingKey: `series_${channel.id}`,
        type: "episode",
        title: unifiedChannel.title,
        grandparentTitle: unifiedChannel.grandparentTitle,
        parentTitle: unifiedChannel.parentTitle,
        originalTitle: unifiedChannel.originalTitle,
        summary: unifiedChannel.summary,
        index: unifiedChannel.index,
        parentIndex: unifiedChannel.parentIndex,
        year: unifiedChannel.year,
        thumb: `/library/metadata/live_${channel.id}/thumb`,
        art: `/library/metadata/live_${channel.id}/art`,
        grandparentThumb: `/library/metadata/series_${channel.id}/thumb`,
        grandparentArt: `/library/metadata/series_${channel.id}/art`,
        parentThumb: `/library/metadata/show_${channel.id}/thumb`,
        addedAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        live: 1,
        librarySectionID: parseInt(sectionId),
        librarySectionTitle: "Live TV",
        guid: unifiedChannel.guid,
        
        // Include media information for streaming decisions
        Media: unifiedChannel.Media
      };
    });

    const response = {
      MediaContainer: {
        size: videos.length,
        allowSync: 0,
        identifier: "com.plexapp.plugins.library",
        librarySectionID: parseInt(sectionId),
        librarySectionTitle: "Live TV",
        librarySectionUUID: "e05e77e4-1cc3-4e1e-9e79-8bf9b51f5f3f",
        mediaTagPrefix: "/system/bundle/media/flags/",
        mediaTagVersion: "1640111100",
        
        Video: videos
      }
    };

    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Plex-Content-Type': 'MediaContainer',
      'X-Plex-Protocol': '1.0'
    });

    logger.info('Served library section content to Plex', {
      sectionId,
      channelCount: videos.length,
      userAgent: req.get('User-Agent')
    });

    res.json(response);
  } catch (error) {
    logger.error('Library section content error:', error);
    res.status(500).json({
      MediaContainer: {
        size: 0,
        identifier: "com.plexapp.plugins.library"
      }
    });
  }
});

/**
 * Individual metadata endpoint for specific channels
 */
router.get('/metadata/:itemId', async (req, res) => {
  try {
    const baseURL = getBaseURL(req);
    const itemId = req.params.itemId;
    
    // Extract channel ID from itemId (format: live_123)
    const channelIdMatch = itemId.match(/live_(\d+)/);
    if (!channelIdMatch) {
      return res.status(404).json({
        MediaContainer: {
          size: 0,
          identifier: "com.plexapp.plugins.library"
        }
      });
    }
    
    const channelId = channelIdMatch[1];
    
    // Get specific channel
    const channel = await database.get(`
      SELECT c.*, s.url, s.type 
      FROM channels c 
      LEFT JOIN streams s ON c.id = s.channel_id 
      WHERE c.id = ? AND c.enabled = 1 AND s.enabled = 1
    `, [channelId]);

    if (!channel) {
      return res.status(404).json({
        MediaContainer: {
          size: 0,
          identifier: "com.plexapp.plugins.library"
        }
      });
    }

    // Create unified metadata with transcoding awareness
    const transcodeInfo = extractTranscodingInfo({ protocol_options: channel.protocol_options });
    const unifiedChannel = createUnifiedChannelMetadata(channel, baseURL, null, transcodeInfo);
    
    const video = {
      ratingKey: `live_${channel.id}`,
      key: `/library/metadata/live_${channel.id}`,
      parentRatingKey: `show_${channel.id}`,
      grandparentRatingKey: `series_${channel.id}`,
      type: "episode",
      title: unifiedChannel.title,
      grandparentTitle: unifiedChannel.grandparentTitle,
      parentTitle: unifiedChannel.parentTitle,
      originalTitle: unifiedChannel.originalTitle,
      summary: unifiedChannel.summary,
      index: unifiedChannel.index,
      parentIndex: unifiedChannel.parentIndex,
      year: unifiedChannel.year,
      thumb: `/library/metadata/live_${channel.id}/thumb`,
      art: `/library/metadata/live_${channel.id}/art`,
      addedAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      live: 1,
      librarySectionID: 1,
      librarySectionTitle: "Live TV",
      guid: unifiedChannel.guid,
      
      // Complete media information for streaming decisions
      Media: unifiedChannel.Media
    };

    const response = {
      MediaContainer: {
        size: 1,
        allowSync: 0,
        identifier: "com.plexapp.plugins.library",
        librarySectionID: 1,
        librarySectionTitle: "Live TV",
        librarySectionUUID: "e05e77e4-1cc3-4e1e-9e79-8bf9b51f5f3f",
        mediaTagPrefix: "/system/bundle/media/flags/",
        mediaTagVersion: "1640111100",
        
        Video: [video]
      }
    };

    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Plex-Content-Type': 'MediaContainer',
      'X-Plex-Protocol': '1.0'
    });

    logger.info('Served individual metadata to Plex', {
      itemId,
      channelId,
      channelName: channel.name,
      userAgent: req.get('User-Agent')
    });

    res.json(response);
  } catch (error) {
    logger.error('Individual metadata error:', error);
    res.status(500).json({
      MediaContainer: {
        size: 0,
        identifier: "com.plexapp.plugins.library"
      }
    });
  }
});

/**
 * Thumbnail/art endpoints to prevent 404s
 */
router.get('/metadata/:itemId/thumb', (req, res) => {
  // Return a 1x1 transparent pixel as fallback
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  res.set({
    'Content-Type': 'image/png',
    'Content-Length': pixel.length,
    'Cache-Control': 'public, max-age=3600'
  });
  res.send(pixel);
});

router.get('/metadata/:itemId/art', (req, res) => {
  // Return a 1x1 transparent pixel as fallback
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  res.set({
    'Content-Type': 'image/png',
    'Content-Length': pixel.length,
    'Cache-Control': 'public, max-age=3600'
  });
  res.send(pixel);
});

/**
 * Timeline endpoint for tracking playback
 */
router.get('/timeline', (req, res) => {
  // Return minimal timeline response
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'X-Plex-Content-Type': 'MediaContainer'
  });
  
  res.json({
    MediaContainer: {
      size: 0,
      identifier: "com.plexapp.plugins.library"
    }
  });
});

module.exports = router;