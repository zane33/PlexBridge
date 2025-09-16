const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const ffmpegProfileManager = require('../services/ffmpegProfileManager');
const FFmpegValidator = require('../utils/ffmpegValidator');
const logger = require('../utils/logger');

// Rate limiting for profile operations
const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many profile operations from this IP',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting to all routes
router.use(profileLimiter);

// Get all FFmpeg profiles
router.get('/', async (req, res) => {
  try {
    const profiles = await ffmpegProfileManager.getAllProfiles();
    res.json(profiles);
  } catch (error) {
    logger.error('Failed to get FFmpeg profiles:', error);
    res.status(500).json({ error: 'Failed to get FFmpeg profiles', message: error.message });
  }
});

// Get a specific profile
router.get('/:id', async (req, res) => {
  try {
    const profile = await ffmpegProfileManager.getProfile(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    logger.error('Failed to get FFmpeg profile:', error);
    res.status(500).json({ error: 'Failed to get FFmpeg profile', message: error.message });
  }
});

// Create a new profile
router.post('/', async (req, res) => {
  try {
    const profileData = req.body;

    // Validate profile data using comprehensive validator
    const validation = FFmpegValidator.validateProfileData(profileData);
    if (validation.error) {
      return res.status(400).json({
        error: 'Invalid profile data',
        details: validation.error.details
      });
    }
    
    const profile = await ffmpegProfileManager.createProfile(profileData);
    res.status(201).json(profile);
  } catch (error) {
    logger.error('Failed to create FFmpeg profile:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Profile with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create FFmpeg profile', message: error.message });
  }
});

// Update a profile
router.put('/:id', async (req, res) => {
  try {
    const profileData = req.body;
    const profileId = req.params.id;

    logger.info(`Profile update request for ${profileId}`, {
      profileId,
      name: profileData.name,
      clientTypes: profileData.clients ? Object.keys(profileData.clients) : [],
      isDefault: profileData.is_default
    });

    // Validate required fields
    if (!profileData.name) {
      return res.status(400).json({ error: 'Profile name is required' });
    }

    // Enhanced validation for client configurations
    if (profileData.clients) {
      for (const [clientType, config] of Object.entries(profileData.clients)) {
        if (config && !config.ffmpeg_args) {
          logger.warn(`Invalid client configuration for ${clientType}:`, config);
          return res.status(400).json({
            error: `FFmpeg arguments are required for client type: ${clientType}`
          });
        }
      }
      logger.info(`Validated ${Object.keys(profileData.clients).length} client configurations`);
    }

    const profile = await ffmpegProfileManager.updateProfile(profileId, profileData);
    logger.info(`Profile ${profileId} updated successfully`);
    res.json(profile);
  } catch (error) {
    logger.error('Failed to update FFmpeg profile:', {
      profileId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    if (error.message === 'Profile not found') {
      return res.status(404).json({ error: 'Profile not found' });
    }
    if (error.message === 'Cannot edit system profiles') {
      return res.status(403).json({ error: 'Cannot edit system profiles' });
    }
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Profile with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to update FFmpeg profile', message: error.message });
  }
});

// Delete a profile
router.delete('/:id', async (req, res) => {
  try {
    await ffmpegProfileManager.deleteProfile(req.params.id);
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete FFmpeg profile:', error);
    if (error.message === 'Profile not found') {
      return res.status(404).json({ error: 'Profile not found' });
    }
    if (error.message === 'Cannot delete system profiles') {
      return res.status(403).json({ error: 'Cannot delete system profiles' });
    }
    if (error.message.includes('Cannot delete the default profile')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message.includes('stream(s) are using it')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete FFmpeg profile', message: error.message });
  }
});

// Set a profile as default
router.post('/:id/set-default', async (req, res) => {
  try {
    await ffmpegProfileManager.setDefaultProfile(req.params.id);
    res.json({ success: true, message: 'Profile set as default' });
  } catch (error) {
    logger.error('Failed to set default FFmpeg profile:', error);
    res.status(500).json({ error: 'Failed to set default profile', message: error.message });
  }
});

// Get default profile
router.get('/default/profile', async (req, res) => {
  try {
    const profile = await ffmpegProfileManager.getDefaultProfile();
    res.json(profile);
  } catch (error) {
    logger.error('Failed to get default FFmpeg profile:', error);
    res.status(500).json({ error: 'Failed to get default profile', message: error.message });
  }
});

// Initialize default profiles (if needed)
router.post('/initialize', async (req, res) => {
  try {
    await ffmpegProfileManager.initializeDefaultProfiles();
    res.json({ success: true, message: 'Default profiles initialized' });
  } catch (error) {
    logger.error('Failed to initialize default FFmpeg profiles:', error);
    res.status(500).json({ error: 'Failed to initialize default profiles', message: error.message });
  }
});

// Test FFmpeg arguments generation
router.post('/test-args', async (req, res) => {
  try {
    const { profileId, clientType, streamUrl } = req.body;
    
    if (!streamUrl) {
      return res.status(400).json({ error: 'Stream URL is required' });
    }
    
    const detectedClientType = clientType || ffmpegProfileManager.detectClientType(req.headers['user-agent']);
    const args = await ffmpegProfileManager.getFFmpegArgs(profileId, detectedClientType, streamUrl);
    
    res.json({
      profileId: profileId || 'default',
      clientType: detectedClientType,
      streamUrl,
      ffmpegArgs: args,
      command: `ffmpeg ${args.join(' ')}`
    });
  } catch (error) {
    logger.error('Failed to test FFmpeg arguments:', error);
    res.status(500).json({ error: 'Failed to test FFmpeg arguments', message: error.message });
  }
});

// Get available client types
router.get('/client-types/list', async (req, res) => {
  res.json({
    clientTypes: ffmpegProfileManager.constructor.CLIENT_TYPES,
    descriptions: {
      web_browser: 'Plex Web Browser Client',
      android_mobile: 'Plex Android Mobile App',
      android_tv: 'Plex Android TV App',
      ios_mobile: 'Plex iOS Mobile App',
      apple_tv: 'Plex Apple TV App'
    }
  });
});

// Bulk assign streams to a profile
router.post('/:id/assign-streams', async (req, res) => {
  try {
    const profileId = req.params.id;
    const { streamIds } = req.body;
    
    if (!Array.isArray(streamIds) || streamIds.length === 0) {
      return res.status(400).json({ error: 'streamIds array is required and must not be empty' });
    }
    
    const result = await ffmpegProfileManager.bulkAssignStreamsToProfile(profileId, streamIds);
    res.json(result);
  } catch (error) {
    logger.error('Failed to bulk assign streams to profile:', error);
    if (error.message === 'Profile not found') {
      return res.status(404).json({ error: 'Profile not found' });
    }
    if (error.message.includes('do not exist')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to assign streams to profile', message: error.message });
  }
});

// Remove streams from profile (set to default)
router.post('/remove-streams', async (req, res) => {
  try {
    const { streamIds } = req.body;
    
    if (!Array.isArray(streamIds) || streamIds.length === 0) {
      return res.status(400).json({ error: 'streamIds array is required and must not be empty' });
    }
    
    const result = await ffmpegProfileManager.removeStreamsFromProfile(streamIds);
    res.json(result);
  } catch (error) {
    logger.error('Failed to remove streams from profile:', error);
    res.status(500).json({ error: 'Failed to remove streams from profile', message: error.message });
  }
});

// Get all available streams for assignment
router.get('/available-streams/:id?', async (req, res) => {
  try {
    const currentProfileId = req.params.id;
    const streams = await ffmpegProfileManager.getAllStreams();
    
    // Add profile information to each stream
    const streamsWithProfiles = streams.map(stream => ({
      ...stream,
      current_profile: stream.ffmpeg_profile_id,
      is_using_current_profile: stream.ffmpeg_profile_id === currentProfileId
    }));
    
    res.json(streamsWithProfiles);
  } catch (error) {
    logger.error('Failed to get available streams:', error);
    res.status(500).json({ error: 'Failed to get available streams', message: error.message });
  }
});

// Administrative cleanup endpoint for system profiles
router.post('/admin/cleanup-system-profiles', async (req, res) => {
  try {
    const database = require('../services/database');

    // Get all system profiles that are NOT default
    const systemProfiles = await database.all(
      'SELECT * FROM ffmpeg_profiles WHERE is_system = 1 AND is_default = 0'
    );

    if (systemProfiles.length === 0) {
      return res.json({
        success: true,
        message: 'No extra system profiles found to remove',
        removed: []
      });
    }

    const removed = [];

    // Begin transaction
    await database.run('BEGIN TRANSACTION');

    try {
      for (const profile of systemProfiles) {
        // Check if any streams are assigned to this profile
        const streamCount = await database.get(
          'SELECT COUNT(*) as count FROM streams WHERE ffmpeg_profile_id = ?',
          [profile.id]
        );

        if (streamCount.count > 0) {
          logger.warn(`Skipping profile ${profile.name} - has ${streamCount.count} streams assigned`);
          continue;
        }

        // Delete client configurations first
        await database.run(
          'DELETE FROM ffmpeg_profile_clients WHERE profile_id = ?',
          [profile.id]
        );

        // Delete the profile
        await database.run(
          'DELETE FROM ffmpeg_profiles WHERE id = ?',
          [profile.id]
        );

        removed.push({
          id: profile.id,
          name: profile.name,
          description: profile.description
        });

        logger.info(`Removed system profile: ${profile.name} (${profile.id})`);
      }

      // Commit transaction
      await database.run('COMMIT');

      // Clear FFmpeg profile manager cache
      ffmpegProfileManager.invalidateCache();

      res.json({
        success: true,
        message: `Successfully removed ${removed.length} extra system profile(s)`,
        removed: removed
      });

    } catch (error) {
      // Rollback on error
      await database.run('ROLLBACK');
      throw error;
    }

  } catch (error) {
    logger.error('Failed to cleanup system profiles:', error);
    res.status(500).json({
      error: 'Failed to cleanup system profiles',
      message: error.message
    });
  }
});

module.exports = router;