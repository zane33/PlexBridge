const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const database = require('./database');
const FFmpegValidator = require('../utils/ffmpegValidator');

class FFmpegProfileManager {
  constructor() {
    this.cache = new Map();
    this.defaultProfileId = null;
  }

  // Client types enum
  static CLIENT_TYPES = {
    WEB_BROWSER: 'web_browser',
    ANDROID_MOBILE: 'android_mobile',
    ANDROID_TV: 'android_tv',
    IOS_MOBILE: 'ios_mobile',
    APPLE_TV: 'apple_tv'
  };

  // Get all profiles (optimized to avoid N+1 queries)
  async getAllProfiles() {
    try {
      // Main profiles query with stream counts in a single query
      const profiles = await database.all(`
        SELECT
          p.*,
          COUNT(DISTINCT s.id) as stream_count
        FROM ffmpeg_profiles p
        LEFT JOIN streams s ON (
          s.ffmpeg_profile_id = p.id OR
          (s.ffmpeg_profile_id IS NULL AND p.is_default = 1)
        )
        GROUP BY p.id
        ORDER BY p.is_default DESC, p.is_system DESC, p.name ASC
      `);

      if (profiles.length === 0) {
        return [];
      }

      const profileIds = profiles.map(p => p.id);

      // Bulk load all client configurations
      const allClients = await database.all(`
        SELECT * FROM ffmpeg_profile_clients
        WHERE profile_id IN (${profileIds.map(() => '?').join(',')})
      `, profileIds);

      // Bulk load all associated streams
      const allStreams = await database.all(`
        SELECT
          s.id, s.name, s.url, s.type, s.enabled, s.ffmpeg_profile_id,
          c.name as channel_name, c.number as channel_number,
          CASE
            WHEN s.ffmpeg_profile_id IS NOT NULL THEN s.ffmpeg_profile_id
            ELSE (SELECT id FROM ffmpeg_profiles WHERE is_default = 1 LIMIT 1)
          END as effective_profile_id
        FROM streams s
        LEFT JOIN channels c ON s.channel_id = c.id
        WHERE s.ffmpeg_profile_id IN (${profileIds.map(() => '?').join(',')})
        OR (s.ffmpeg_profile_id IS NULL AND EXISTS (
          SELECT 1 FROM ffmpeg_profiles WHERE id IN (${profileIds.map(() => '?').join(',')}) AND is_default = 1
        ))
        ORDER BY c.number ASC, s.name ASC
      `, [...profileIds, ...profileIds]);

      // Group client configurations by profile ID
      const clientsByProfile = allClients.reduce((acc, client) => {
        if (!acc[client.profile_id]) {
          acc[client.profile_id] = {};
        }
        acc[client.profile_id][client.client_type] = {
          ffmpeg_args: client.ffmpeg_args,
          hls_args: client.hls_args
        };
        return acc;
      }, {});

      // Group streams by effective profile ID
      const streamsByProfile = allStreams.reduce((acc, stream) => {
        const profileId = stream.effective_profile_id;
        if (!acc[profileId]) {
          acc[profileId] = [];
        }
        acc[profileId].push({
          id: stream.id,
          name: stream.name,
          url: stream.url,
          type: stream.type,
          enabled: stream.enabled,
          channel_name: stream.channel_name,
          channel_number: stream.channel_number
        });
        return acc;
      }, {});

      // Attach data to profiles
      return profiles.map(profile => ({
        ...profile,
        clients: clientsByProfile[profile.id] || {},
        associated_streams: streamsByProfile[profile.id] || [],
        stream_count: parseInt(profile.stream_count) || 0
      }));
    } catch (error) {
      logger.error('Failed to get all FFmpeg profiles:', error);
      throw error;
    }
  }

  // Get profile by ID
  async getProfile(profileId) {
    try {
      // Check cache first
      if (this.cache.has(profileId)) {
        return this.cache.get(profileId);
      }

      const profile = await database.get(
        'SELECT * FROM ffmpeg_profiles WHERE id = ?',
        [profileId]
      );
      
      if (!profile) {
        return null;
      }
      
      // Load client configurations and associated streams
      profile.clients = await this.getProfileClients(profileId);
      profile.stream_count = await this.getProfileStreamCount(profileId);
      profile.associated_streams = await this.getProfileStreams(profileId);
      
      // Cache the profile
      this.cache.set(profileId, profile);
      
      return profile;
    } catch (error) {
      logger.error('Failed to get FFmpeg profile:', error);
      throw error;
    }
  }

  // Get profile client configurations
  async getProfileClients(profileId) {
    try {
      const clients = await database.all(
        'SELECT * FROM ffmpeg_profile_clients WHERE profile_id = ?',
        [profileId]
      );
      
      // Convert to object keyed by client_type
      const clientMap = {};
      for (const client of clients) {
        clientMap[client.client_type] = {
          ffmpeg_args: client.ffmpeg_args,
          hls_args: client.hls_args
        };
      }
      
      return clientMap;
    } catch (error) {
      logger.error('Failed to get profile clients:', error);
      throw error;
    }
  }

  // Get count of streams using a specific profile
  async getProfileStreamCount(profileId) {
    try {
      const result = await database.get(`
        SELECT COUNT(*) as count 
        FROM streams 
        WHERE ffmpeg_profile_id = ? OR (ffmpeg_profile_id IS NULL AND ? IN (
          SELECT id FROM ffmpeg_profiles WHERE is_default = 1
        ))
      `, [profileId, profileId]);
      
      return result.count || 0;
    } catch (error) {
      logger.error('Failed to get profile stream count:', error);
      return 0;
    }
  }

  // Get streams using a specific profile
  async getProfileStreams(profileId) {
    try {
      const streams = await database.all(`
        SELECT s.id, s.name, s.url, s.type, s.enabled, c.name as channel_name, c.number as channel_number
        FROM streams s
        LEFT JOIN channels c ON s.channel_id = c.id
        WHERE s.ffmpeg_profile_id = ? OR (s.ffmpeg_profile_id IS NULL AND ? IN (
          SELECT id FROM ffmpeg_profiles WHERE is_default = 1
        ))
        ORDER BY c.number ASC, s.name ASC
      `, [profileId, profileId]);
      
      return streams || [];
    } catch (error) {
      logger.error('Failed to get profile streams:', error);
      return [];
    }
  }

  // Invalidate cache for a specific profile
  invalidateCache(profileId) {
    if (profileId) {
      this.cache.delete(profileId);
    } else {
      this.cache.clear();
    }
  }

  // Get all streams with profile information
  async getAllStreams() {
    try {
      const streams = await database.all(`
        SELECT s.id, s.name, s.url, s.type, s.enabled, s.ffmpeg_profile_id,
               c.name as channel_name, c.number as channel_number,
               p.name as profile_name
        FROM streams s
        LEFT JOIN channels c ON s.channel_id = c.id
        LEFT JOIN ffmpeg_profiles p ON s.ffmpeg_profile_id = p.id
        ORDER BY c.number ASC, s.name ASC
      `);
      
      return streams || [];
    } catch (error) {
      logger.error('Failed to get all streams:', error);
      return [];
    }
  }

  // Create a new profile
  async createProfile(profileData) {
    try {
      // Validate profile data
      const validation = FFmpegValidator.validateProfileData(profileData);
      if (validation.error) {
        throw new Error(`Invalid profile data: ${validation.error.message}`);
      }

      const profileId = uuidv4();
      const now = new Date().toISOString();

      // Insert profile
      await database.run(`
        INSERT INTO ffmpeg_profiles (id, name, description, is_default, is_system, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        profileId,
        profileData.name,
        profileData.description || '',
        profileData.is_default ? 1 : 0,
        0, // User-created profiles are not system profiles
        now,
        now
      ]);

      // Insert client configurations
      if (profileData.clients) {
        await this.updateProfileClients(profileId, profileData.clients);
      }

      // If this is set as default, update other profiles
      if (profileData.is_default) {
        await this.setDefaultProfile(profileId);
      }

      // Invalidate cache after successful transaction
      this.invalidateCache(profileId);

      return await this.getProfile(profileId);
    } catch (error) {
      logger.error('Failed to create FFmpeg profile:', error);
      throw error;
    }
  }

  // Update an existing profile
  async updateProfile(profileId, profileData) {
    try {
      // Validate profile data
      const validation = FFmpegValidator.validateProfileData(profileData);
      if (validation.error) {
        throw new Error(`Invalid profile data: ${validation.error.message}`);
      }

      const existingProfile = await this.getProfile(profileId);
      if (!existingProfile) {
        throw new Error('Profile not found');
      }

      // Don't allow editing system profiles
      if (existingProfile.is_system && !profileData.force) {
        throw new Error('Cannot edit system profiles');
      }

      const now = new Date().toISOString();

      // Update profile
      await database.run(`
        UPDATE ffmpeg_profiles
        SET name = ?, description = ?, is_default = ?, updated_at = ?
        WHERE id = ?
      `, [
        profileData.name,
        profileData.description || '',
        profileData.is_default ? 1 : 0,
        now,
        profileId
      ]);

      // Update client configurations
      if (profileData.clients) {
        await this.updateProfileClients(profileId, profileData.clients);
      }

      // If this is set as default, update other profiles
      if (profileData.is_default) {
        await this.setDefaultProfile(profileId);
      }

      // Invalidate cache after successful transaction
      this.invalidateCache(profileId);

      return await this.getProfile(profileId);
    } catch (error) {
      logger.error('Failed to update FFmpeg profile:', error);
      throw error;
    }
  }

  // Update profile client configurations
  async updateProfileClients(profileId, clients) {
    try {
      // Delete existing client configurations
      await database.run(
        'DELETE FROM ffmpeg_profile_clients WHERE profile_id = ?',
        [profileId]
      );

      // Insert new client configurations
      for (const [clientType, config] of Object.entries(clients)) {
        if (config && config.ffmpeg_args) {
          const clientId = uuidv4();
          const now = new Date().toISOString();

          await database.run(`
            INSERT INTO ffmpeg_profile_clients (id, profile_id, client_type, ffmpeg_args, hls_args, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            clientId,
            profileId,
            clientType,
            config.ffmpeg_args,
            config.hls_args || '',
            now,
            now
          ]);
        }
      }
    } catch (error) {
      logger.error('Failed to update profile clients:', error);
      throw error;
    }
  }

  // Synchronous version for transactions
  updateProfileClientsSync(profileId, clients) {
    try {
      // Delete existing client configurations
      database.run(
        'DELETE FROM ffmpeg_profile_clients WHERE profile_id = ?',
        [profileId]
      );

      // Insert new client configurations
      for (const [clientType, config] of Object.entries(clients)) {
        if (config && config.ffmpeg_args) {
          const clientId = uuidv4();
          const now = new Date().toISOString();

          database.run(`
            INSERT INTO ffmpeg_profile_clients (id, profile_id, client_type, ffmpeg_args, hls_args, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            clientId,
            profileId,
            clientType,
            config.ffmpeg_args,
            config.hls_args || '',
            now,
            now
          ]);
        }
      }
    } catch (error) {
      logger.error('Failed to update profile clients (sync):', error);
      throw error;
    }
  }

  // Delete a profile
  async deleteProfile(profileId) {
    try {
      const profile = await this.getProfile(profileId);
      if (!profile) {
        throw new Error('Profile not found');
      }
      
      // Don't allow deleting system profiles
      if (profile.is_system) {
        throw new Error('Cannot delete system profiles');
      }
      
      // Don't allow deleting the default profile
      if (profile.is_default) {
        throw new Error('Cannot delete the default profile. Set another profile as default first.');
      }
      
      // Check if any streams are using this profile
      const streamsUsingProfile = await database.all(
        'SELECT id, name FROM streams WHERE ffmpeg_profile_id = ?',
        [profileId]
      );
      
      if (streamsUsingProfile.length > 0) {
        throw new Error(`Cannot delete profile. ${streamsUsingProfile.length} stream(s) are using it.`);
      }
      
      // Delete the profile (client configurations will be cascade deleted)
      await database.run('DELETE FROM ffmpeg_profiles WHERE id = ?', [profileId]);
      
      // Clear cache
      this.cache.clear();
      
      return true;
    } catch (error) {
      logger.error('Failed to delete FFmpeg profile:', error);
      throw error;
    }
  }

  // Set a profile as default
  async setDefaultProfile(profileId) {
    try {
      // First, unset all profiles as default
      await database.run('UPDATE ffmpeg_profiles SET is_default = 0');

      // Set the specified profile as default
      await database.run(
        'UPDATE ffmpeg_profiles SET is_default = 1 WHERE id = ?',
        [profileId]
      );

      this.defaultProfileId = profileId;
      this.cache.clear();

      return true;
    } catch (error) {
      logger.error('Failed to set default FFmpeg profile:', error);
      throw error;
    }
  }

  // Synchronous version for transactions
  setDefaultProfileSync(profileId) {
    try {
      // First, unset all profiles as default
      database.run('UPDATE ffmpeg_profiles SET is_default = 0');

      // Set the specified profile as default
      database.run(
        'UPDATE ffmpeg_profiles SET is_default = 1 WHERE id = ?',
        [profileId]
      );

      this.defaultProfileId = profileId;
      this.cache.clear();

      return true;
    } catch (error) {
      logger.error('Failed to set default FFmpeg profile (sync):', error);
      throw error;
    }
  }

  // Get the default profile
  async getDefaultProfile() {
    try {
      if (this.defaultProfileId) {
        return await this.getProfile(this.defaultProfileId);
      }
      
      const profile = await database.get(
        'SELECT * FROM ffmpeg_profiles WHERE is_default = 1'
      );
      
      if (!profile) {
        // If no default profile exists, create one from current settings
        return await this.createDefaultProfileFromSettings();
      }
      
      profile.clients = await this.getProfileClients(profile.id);
      this.defaultProfileId = profile.id;
      
      return profile;
    } catch (error) {
      logger.error('Failed to get default FFmpeg profile:', error);
      throw error;
    }
  }

  // Get FFmpeg arguments for a specific client type
  async getFFmpegArgs(profileId, clientType, streamUrl) {
    try {
      const profile = profileId ? 
        await this.getProfile(profileId) : 
        await this.getDefaultProfile();
      
      if (!profile) {
        logger.warn('No FFmpeg profile found, using fallback arguments');
        return this.getFallbackFFmpegArgs(clientType, streamUrl);
      }
      
      const clientConfig = profile.clients[clientType];
      if (!clientConfig) {
        // Try to find a generic config or use fallback
        const webConfig = profile.clients[FFmpegProfileManager.CLIENT_TYPES.WEB_BROWSER];
        if (webConfig) {
          return this.processFFmpegArgs(webConfig.ffmpeg_args, webConfig.hls_args, streamUrl);
        }
        return this.getFallbackFFmpegArgs(clientType, streamUrl);
      }
      
      return this.processFFmpegArgs(clientConfig.ffmpeg_args, clientConfig.hls_args, streamUrl);
    } catch (error) {
      logger.error('Failed to get FFmpeg arguments:', error);
      return this.getFallbackFFmpegArgs(clientType, streamUrl);
    }
  }

  // Process FFmpeg arguments and replace placeholders
  processFFmpegArgs(ffmpegArgs, hlsArgs, streamUrl) {
    let args = ffmpegArgs.replace(/\[URL\]/g, streamUrl);
    
    // If HLS args are provided and the stream is HLS, insert them
    if (hlsArgs && streamUrl.toLowerCase().includes('.m3u8')) {
      // Find the position of -i in the args
      const inputIndex = args.indexOf('-i ');
      if (inputIndex > -1) {
        // Insert HLS args before -i
        args = args.substring(0, inputIndex) + hlsArgs + ' ' + args.substring(inputIndex);
      }
    }
    
    return args.split(' ').filter(arg => arg.length > 0);
  }

  // Get fallback FFmpeg arguments
  getFallbackFFmpegArgs(clientType, streamUrl) {
    // Use the new default optimized arguments as fallback
    const baseArgs = [
      '-hide_banner', '-loglevel', 'error',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-i', streamUrl,
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-bsf:v', 'dump_extra',
      '-f', 'mpegts',
      '-mpegts_copyts', '1',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+igndts+discardcorrupt',
      '-copyts',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-flush_packets', '1',
      '-max_delay', '0',
      '-max_muxing_queue_size', '9999',
      'pipe:1'
    ];

    return baseArgs;
  }

  // Detect client type from user agent
  detectClientType(userAgent) {
    if (!userAgent) {
      return FFmpegProfileManager.CLIENT_TYPES.WEB_BROWSER;
    }
    
    const ua = userAgent.toLowerCase();
    
    // Android TV detection
    if (ua.includes('androidtv') || ua.includes('shield') || 
        (ua.includes('android') && (ua.includes('tv') || ua.includes('box')))) {
      return FFmpegProfileManager.CLIENT_TYPES.ANDROID_TV;
    }
    
    // Android mobile detection
    if (ua.includes('android') && ua.includes('mobile')) {
      return FFmpegProfileManager.CLIENT_TYPES.ANDROID_MOBILE;
    }
    
    // iOS detection
    if (ua.includes('iphone') || ua.includes('ipad')) {
      return FFmpegProfileManager.CLIENT_TYPES.IOS_MOBILE;
    }
    
    // Apple TV detection
    if (ua.includes('appletv') || ua.includes('apple tv')) {
      return FFmpegProfileManager.CLIENT_TYPES.APPLE_TV;
    }
    
    // Default to web browser
    return FFmpegProfileManager.CLIENT_TYPES.WEB_BROWSER;
  }

  // Create default profile from existing settings
  async createDefaultProfileFromSettings() {
    try {
      // Use the new default arguments for all client types
      const defaultFFmpegArgs = '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1';

      const hlsArgs = '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto';

      // Create the default profile
      const profileData = {
        name: 'Default Profile',
        description: 'Optimized for maximum compatibility and performance',
        is_default: true,
        clients: {
          [FFmpegProfileManager.CLIENT_TYPES.WEB_BROWSER]: {
            ffmpeg_args: defaultFFmpegArgs,
            hls_args: hlsArgs
          },
          [FFmpegProfileManager.CLIENT_TYPES.ANDROID_MOBILE]: {
            ffmpeg_args: defaultFFmpegArgs,
            hls_args: hlsArgs
          },
          [FFmpegProfileManager.CLIENT_TYPES.ANDROID_TV]: {
            ffmpeg_args: defaultFFmpegArgs,
            hls_args: hlsArgs
          },
          [FFmpegProfileManager.CLIENT_TYPES.IOS_MOBILE]: {
            ffmpeg_args: defaultFFmpegArgs,
            hls_args: hlsArgs
          },
          [FFmpegProfileManager.CLIENT_TYPES.APPLE_TV]: {
            ffmpeg_args: defaultFFmpegArgs,
            hls_args: hlsArgs
          }
        }
      };
      
      // Mark as system profile
      const profileId = uuidv4();
      const now = new Date().toISOString();
      
      await database.run(`
        INSERT INTO ffmpeg_profiles (id, name, description, is_default, is_system, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        profileId,
        profileData.name,
        profileData.description,
        1,
        1, // System profile
        now,
        now
      ]);
      
      await this.updateProfileClients(profileId, profileData.clients);
      
      return await this.getProfile(profileId);
    } catch (error) {
      logger.error('Failed to create default profile from settings:', error);
      throw error;
    }
  }

  // Initialize default profiles if none exist
  async initializeDefaultProfiles() {
    try {
      const profileCount = await database.get('SELECT COUNT(*) as count FROM ffmpeg_profiles');

      if (profileCount.count === 0) {
        logger.info('No FFmpeg profiles found, creating default profile');

        // Create only one default profile with optimized settings
        await this.createDefaultProfileFromSettings();
      } else {
        // Clean up multiple default profiles if they exist
        const defaultProfiles = await database.all('SELECT * FROM ffmpeg_profiles WHERE is_default = 1');
        if (defaultProfiles.length > 1) {
          logger.info('Multiple default profiles found, consolidating to single default');

          // Keep only the first default profile
          for (let i = 1; i < defaultProfiles.length; i++) {
            await database.run(
              'UPDATE ffmpeg_profiles SET is_default = 0 WHERE id = ?',
              [defaultProfiles[i].id]
            );
          }
        }
      }
    } catch (error) {
      logger.error('Failed to initialize default FFmpeg profiles:', error);
    }
  }


  // Bulk assign streams to a profile
  async bulkAssignStreamsToProfile(profileId, streamIds) {
    try {
      const profile = await this.getProfile(profileId);
      if (!profile) {
        throw new Error('Profile not found');
      }

      // Validate that all stream IDs exist
      const existingStreams = await database.all(`
        SELECT id FROM streams WHERE id IN (${streamIds.map(() => '?').join(',')})
      `, streamIds);

      if (existingStreams.length !== streamIds.length) {
        throw new Error('Some stream IDs do not exist');
      }

      // Update streams to use this profile
      await database.run(`
        UPDATE streams 
        SET ffmpeg_profile_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${streamIds.map(() => '?').join(',')})
      `, [profileId, ...streamIds]);

      // Clear cache
      this.cache.clear();

      return {
        profileId,
        assignedStreams: streamIds.length,
        streams: await this.getProfileStreams(profileId)
      };
    } catch (error) {
      logger.error('Failed to bulk assign streams to profile:', error);
      throw error;
    }
  }

  // Remove streams from a profile (set to default)
  async removeStreamsFromProfile(streamIds) {
    try {
      // Set streams to use default profile (null = use default)
      await database.run(`
        UPDATE streams 
        SET ffmpeg_profile_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${streamIds.map(() => '?').join(',')})
      `, streamIds);

      // Clear cache
      this.cache.clear();

      return {
        removedStreams: streamIds.length
      };
    } catch (error) {
      logger.error('Failed to remove streams from profile:', error);
      throw error;
    }
  }
}

module.exports = new FFmpegProfileManager();