const logger = require('../utils/logger');
const database = require('./database');
const cacheService = require('./cacheService');
const config = require('../config');

class SettingsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache
    this.lastCacheUpdate = 0;
    this.loadPromise = null;
  }

  /**
   * Get all settings, merging database values with config defaults
   */
  async getSettings() {
    try {
      // Force reload from database - disable cache for debugging
      logger.info('Settings getSettings called - forcing database reload');
      this.clearCache();

      // Prevent multiple concurrent loads
      if (this.loadPromise) {
        return await this.loadPromise;
      }

      this.loadPromise = this.loadSettingsFromDatabase();
      const settings = await this.loadPromise;
      this.loadPromise = null;

      return settings;
    } catch (error) {
      logger.error('Failed to get settings:', error);
      this.loadPromise = null;
      // Return config defaults as fallback
      return config.plexlive || this.getDefaultSettings();
    }
  }

  /**
   * Load settings from database and merge with config defaults
   */
  async loadSettingsFromDatabase() {
    try {
      // Check if database is available
      if (!database || !database.isInitialized) {
        logger.info('Database not available, using config defaults');
        const defaultSettings = { plexlive: config.plexlive || this.getDefaultSettings() };
        this.updateCache(defaultSettings);
        return defaultSettings;
      }

      // Get all settings from database
      const dbSettings = await database.all('SELECT * FROM settings ORDER BY key');
      logger.info('Raw database settings loaded', { 
        count: dbSettings?.length || 0,
        maxConcurrentSetting: dbSettings?.find(s => s.key === 'plexlive.streaming.maxConcurrentStreams')
      });
      
      // Convert flat database rows to nested object
      const settingsObj = {};
      if (Array.isArray(dbSettings)) {
        dbSettings.forEach(setting => {
          let value = setting.value;
          
          try {
            if (setting.type === 'number') {
              value = parseFloat(value);
            } else if (setting.type === 'boolean') {
              value = value === 'true';
            } else if (setting.type === 'json') {
              value = JSON.parse(value);
            }
          } catch (parseError) {
            logger.warn(`Failed to parse setting ${setting.key}:`, parseError);
            value = setting.value; // Keep original value if parsing fails
          }
          
          // Build nested object from dot notation
          this.setNestedValue(settingsObj, setting.key, value);
        });
      }

      // Start with config defaults as base
      const configDefaults = config.plexlive || this.getDefaultSettings();
      
      // Create the final nested settings structure starting with defaults
      const finalNestedSettings = JSON.parse(JSON.stringify(configDefaults));
      
      // Apply database settings to override defaults - prioritize plexlive. prefixed keys
      if (Array.isArray(dbSettings)) {
        // First pass: collect all plexlive.* keys
        const plexliveKeys = new Set();
        dbSettings.forEach(setting => {
          if (setting.key.startsWith('plexlive.')) {
            const nestedKey = setting.key.replace('plexlive.', '');
            plexliveKeys.add(nestedKey);
          }
        });
        
        // Second pass: apply settings, prioritizing plexlive.* prefixed versions
        dbSettings.forEach(setting => {
          let value = setting.value;
          
          try {
            if (setting.type === 'number') {
              value = parseFloat(value);
            } else if (setting.type === 'boolean') {
              value = value === 'true';
            } else if (setting.type === 'json') {
              value = JSON.parse(value);
            }
          } catch (parseError) {
            logger.warn(`Failed to parse setting ${setting.key}:`, parseError);
            value = setting.value;
          }
          
          // Apply database setting to nested structure
          if (setting.key.startsWith('plexlive.')) {
            const nestedKey = setting.key.replace('plexlive.', '');
            this.setNestedValue(finalNestedSettings, nestedKey, value);
          } else if (!plexliveKeys.has(setting.key)) {
            // Only apply non-prefixed keys if there's no plexlive.* version
            this.setNestedValue(finalNestedSettings, setting.key, value);
          }
        });
      }
      
      // Return properly structured settings with plexlive wrapper
      const finalSettings = { plexlive: finalNestedSettings };

      // Update cache with properly structured settings
      this.updateCache(finalSettings);
      
      // Debug which setting keys were prioritized
      const plexliveStreamingSettings = dbSettings.filter(s => s.key.startsWith('plexlive.streaming.'));
      const nonPrefixedStreamingSettings = dbSettings.filter(s => s.key.startsWith('streaming.') && !s.key.startsWith('plexlive.'));
      
      logger.info('Settings loaded successfully from database', { 
        dbSettingsCount: dbSettings.length,
        maxConcurrentStreams: finalSettings.plexlive?.streaming?.maxConcurrentStreams,
        locale: finalSettings.plexlive?.localization?.locale,
        timezone: finalSettings.plexlive?.localization?.timezone,
        configDefault: configDefaults.streaming?.maxConcurrentStreams,
        plexliveStreamingCount: plexliveStreamingSettings.length,
        nonPrefixedStreamingCount: nonPrefixedStreamingSettings.length,
        actualMaxConcurrentFromDB: dbSettings.find(s => s.key === 'plexlive.streaming.maxConcurrentStreams')?.value
      });

      return finalSettings;
    } catch (error) {
      logger.error('Failed to load settings from database:', error);
      
      // Fallback to config defaults
      const defaultSettings = { plexlive: config.plexlive || this.getDefaultSettings() };
      this.updateCache(defaultSettings);
      return defaultSettings;
    }
  }

  /**
   * Update settings in database
   */
  async updateSettings(settings) {
    try {
      if (!database || !database.isInitialized) {
        throw new Error('Database not available');
      }

      // Flatten nested settings to dot notation for database storage
      const flatSettings = this.flattenSettings(settings.plexlive || settings, 'plexlive');

      database.transaction(() => {
        const insertStmt = database.db.prepare(`
          INSERT OR REPLACE INTO settings (key, value, type, created_at, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        
        for (const [key, value] of Object.entries(flatSettings)) {
          let stringValue = value;
          let type = 'string';
          
          if (typeof value === 'number') {
            type = 'number';
            stringValue = value.toString();
          } else if (typeof value === 'boolean') {
            type = 'boolean';
            stringValue = value.toString();
          } else if (typeof value === 'object') {
            type = 'json';
            stringValue = JSON.stringify(value);
          }

          insertStmt.run(key, stringValue, type);
        }
      });

      // Clear cache to force reload
      this.clearCache();

      // Log the update
      logger.info('Settings updated successfully', { 
        keys: Object.keys(flatSettings),
        maxConcurrentStreams: settings.plexlive?.streaming?.maxConcurrentStreams
      });

      // Reload settings to return updated values
      const updatedSettings = await this.loadSettingsFromDatabase();
      
      // Clear any external caches
      try {
        await cacheService.del('settings:config');
        await cacheService.del('metrics:cache');
      } catch (cacheError) {
        logger.warn('Failed to clear external caches:', cacheError);
      }

      // Apply settings to runtime services
      await this.applySettingsToServices(updatedSettings);

      // Emit socket event for real-time updates
      this.emitSettingsUpdate(updatedSettings);

      return updatedSettings;
    } catch (error) {
      logger.error('Failed to update settings:', error);
      throw error;
    }
  }

  /**
   * Get settings for a specific category
   */
  async getCategory(category) {
    try {
      const allSettings = await this.getSettings();
      return allSettings[category] || {};
    } catch (error) {
      logger.error(`Failed to get settings category ${category}:`, error);
      return {};
    }
  }

  /**
   * Get a specific setting value
   */
  async getSetting(path, defaultValue = null) {
    try {
      const settings = await this.getSettings();
      return this.getNestedValue(settings, path, defaultValue);
    } catch (error) {
      logger.error(`Failed to get setting ${path}:`, error);
      return defaultValue;
    }
  }

  /**
   * Reset settings to defaults
   */
  async resetSettings(category = null) {
    try {
      if (!database || !database.isInitialized) {
        throw new Error('Database not available');
      }

      if (category) {
        // Reset specific category
        await database.run('DELETE FROM settings WHERE key LIKE ?', [`${category}.%`]);
        logger.info('Settings category reset', { category });
      } else {
        // Reset all settings
        await database.run('DELETE FROM settings');
        logger.info('All settings reset to defaults');
      }

      // Re-initialize defaults
      await database.initializeDefaultSettings();

      // Clear cache
      this.clearCache();

      // Clear external caches
      try {
        await cacheService.del('settings:config');
        await cacheService.del('metrics:cache');
      } catch (cacheError) {
        logger.warn('Failed to clear external caches:', cacheError);
      }

      // Return updated settings
      const updatedSettings = await this.loadSettingsFromDatabase();
      
      // Emit socket event for real-time updates
      this.emitSettingsUpdate(updatedSettings);
      
      return updatedSettings;
    } catch (error) {
      logger.error('Failed to reset settings:', error);
      throw error;
    }
  }

  /**
   * Get default settings structure
   */
  getDefaultSettings() {
    return {
      ssdp: {
        enabled: true,
        discoverableInterval: 30000,
        announceInterval: 1800000,
        multicastAddress: '239.255.255.250',
        deviceDescription: 'IPTV to Plex Bridge Interface'
      },
      streaming: {
        maxConcurrentStreams: 10,
        streamTimeout: 30000,
        reconnectAttempts: 3,
        bufferSize: 65536,
        adaptiveBitrate: true,
        preferredProtocol: 'hls'
      },
      transcoding: {
        enabled: true,
        hardwareAcceleration: false,
        preset: 'medium',
        videoCodec: 'h264',
        audioCodec: 'aac',
        qualityProfiles: {
          low: { resolution: '720x480', bitrate: '1000k' },
          medium: { resolution: '1280x720', bitrate: '2500k' },
          high: { resolution: '1920x1080', bitrate: '5000k' }
        },
        defaultProfile: 'medium'
      },
      caching: {
        enabled: true,
        duration: 3600,
        maxSize: 1073741824,
        cleanup: {
          enabled: true,
          interval: 3600000,
          maxAge: 86400000
        }
      },
      device: {
        name: 'PlexTV',
        id: 'PLEXTV001',
        tunerCount: 4,
        firmware: '1.0.0',
        baseUrl: 'http://localhost:8080'
      },
      network: {
        bindAddress: '0.0.0.0',
        advertisedHost: null,
        streamingPort: 8080,
        discoveryPort: 1900,
        ipv6Enabled: false
      },
      compatibility: {
        hdHomeRunMode: true,
        plexPassRequired: false,
        gracePeriod: 10000,
        channelLogoFallback: true
      },
      localization: {
        timezone: 'UTC',
        locale: 'en-US',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h',
        firstDayOfWeek: 1 // 1 = Monday, 0 = Sunday
      }
    };
  }

  /**
   * Check if cache is valid
   */
  hasValidCache() {
    return this.cache.has('settings') && 
           (Date.now() - this.lastCacheUpdate) < this.cacheTimeout;
  }

  /**
   * Update internal cache
   */
  updateCache(settings) {
    this.cache.set('settings', settings);
    this.lastCacheUpdate = Date.now();
  }

  /**
   * Clear internal cache
   */
  clearCache() {
    this.cache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * Convert flat dot notation to nested object
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path, defaultValue = null) {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }
    
    return current;
  }

  /**
   * Flatten nested object to dot notation
   */
  flattenSettings(obj, prefix = '') {
    const result = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenSettings(value, fullKey));
      } else {
        result[fullKey] = value;
      }
    }
    
    return result;
  }

  /**
   * Deep merge two objects
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Validate settings structure
   */
  validateSettings(settings) {
    const errors = [];
    
    if (!settings || typeof settings !== 'object') {
      errors.push('Settings must be an object');
      return { isValid: false, errors };
    }

    if (settings.plexlive) {
      const { plexlive } = settings;
      
      // Validate streaming settings
      if (plexlive.streaming) {
        const { streaming } = plexlive;
        if (streaming.maxConcurrentStreams && (streaming.maxConcurrentStreams < 1 || streaming.maxConcurrentStreams > 100)) {
          errors.push('Max concurrent streams must be between 1 and 100');
        }
        if (streaming.streamTimeout && (streaming.streamTimeout < 5000 || streaming.streamTimeout > 300000)) {
          errors.push('Stream timeout must be between 5000ms and 300000ms');
        }
      }
      
      // Validate device settings
      if (plexlive.device) {
        const { device } = plexlive;
        if (device.tunerCount && (device.tunerCount < 1 || device.tunerCount > 32)) {
          errors.push('Tuner count must be between 1 and 32');
        }
      }
      
      // Validate localization settings
      if (plexlive.localization) {
        const { localization } = plexlive;
        
        // Validate timezone (basic check for IANA timezone format)
        if (localization.timezone && typeof localization.timezone !== 'string') {
          errors.push('Timezone must be a valid IANA timezone string (e.g., "America/New_York", "UTC")');
        }
        
        // Validate locale (basic check for BCP 47 format)
        if (localization.locale && !/^[a-z]{2}(-[A-Z]{2})?$/.test(localization.locale)) {
          errors.push('Locale must be in BCP 47 format (e.g., "en-US", "fr-FR", "de")');
        }
        
        // Validate date format
        if (localization.dateFormat && !['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'DD.MM.YYYY'].includes(localization.dateFormat)) {
          errors.push('Date format must be one of: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, DD.MM.YYYY');
        }
        
        // Validate time format
        if (localization.timeFormat && !['12h', '24h'].includes(localization.timeFormat)) {
          errors.push('Time format must be either "12h" or "24h"');
        }
        
        // Validate first day of week
        if (localization.firstDayOfWeek !== undefined && (localization.firstDayOfWeek < 0 || localization.firstDayOfWeek > 6)) {
          errors.push('First day of week must be between 0 (Sunday) and 6 (Saturday)');
        }
      }
      
      // Validate network settings
      if (plexlive.network) {
        const { network } = plexlive;
        if (network.streamingPort && (network.streamingPort < 1024 || network.streamingPort > 65535)) {
          errors.push('Streaming port must be between 1024 and 65535');
        }
        if (network.discoveryPort && (network.discoveryPort < 1024 || network.discoveryPort > 65535)) {
          errors.push('Discovery port must be between 1024 and 65535');
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Emit socket event for settings updates
   */
  emitSettingsUpdate(settings) {
    try {
      if (global.io) {
        global.io.to('settings').emit('settings:updated', {
          settings,
          timestamp: new Date().toISOString(),
          maxConcurrentStreams: settings.plexlive?.streaming?.maxConcurrentStreams
        });
        
        // Also emit metrics update since settings affect metrics
        global.io.to('metrics').emit('settings:changed', {
          maxConcurrentStreams: settings.plexlive?.streaming?.maxConcurrentStreams,
          timestamp: new Date().toISOString()
        });
        
        logger.info('Settings update event emitted via Socket.IO', {
          maxConcurrentStreams: settings.plexlive?.streaming?.maxConcurrentStreams
        });
      }
    } catch (error) {
      logger.warn('Failed to emit settings update via Socket.IO:', error);
    }
  }

  /**
   * Load settings (alias for getSettings for compatibility)
   */
  async loadSettings() {
    return await this.getSettings();
  }

  /**
   * Apply settings to runtime services
   */
  async applySettingsToServices(settings) {
    try {
      const plexliveSettings = settings.plexlive || settings;
      
      // Apply network settings to config (including advertisedHost)
      if (plexliveSettings.network) {
        const config = require('../config');
        
        // Update runtime config with network settings
        if (plexliveSettings.network.advertisedHost !== undefined) {
          config.plexlive.network.advertisedHost = plexliveSettings.network.advertisedHost;
          
          // Also update the device baseUrl to reflect the new advertised host
          const port = config.plexlive.network.streamingPort || config.server.port;
          config.plexlive.device.baseUrl = `http://${plexliveSettings.network.advertisedHost || 'localhost'}:${port}`;
        }
        
        // Update SSDP service if it's running
        try {
          const ssdpService = require('./ssdpService');
          if (ssdpService && typeof ssdpService.updateAdvertisedHost === 'function') {
            ssdpService.updateAdvertisedHost(plexliveSettings.network.advertisedHost);
            logger.info('Updated SSDP service with new advertised host', {
              advertisedHost: plexliveSettings.network.advertisedHost
            });
          }
        } catch (ssdpError) {
          logger.warn('Failed to update SSDP service:', ssdpError);
        }
        
        logger.info('Applied network settings to config', {
          advertisedHost: plexliveSettings.network.advertisedHost,
          baseUrl: config.plexlive.device.baseUrl
        });
      }
      
      // Apply localization settings to logger
      if (plexliveSettings.localization) {
        logger.updateLocalizationSettings(plexliveSettings.localization);
        logger.info('Applied localization settings to logger', {
          timezone: plexliveSettings.localization.timezone,
          locale: plexliveSettings.localization.locale,
          dateFormat: plexliveSettings.localization.dateFormat,
          timeFormat: plexliveSettings.localization.timeFormat
        });
      }
      
      // Apply streaming settings to stream manager
      if (plexliveSettings.streaming) {
        const streamManager = require('./streamManager');
        if (typeof streamManager.updateSettings === 'function') {
          streamManager.updateSettings(plexliveSettings.streaming);
          logger.info('Applied streaming settings to stream manager', {
            maxConcurrentStreams: plexliveSettings.streaming.maxConcurrentStreams,
            streamTimeout: plexliveSettings.streaming.streamTimeout
          });
        }
      }

      // Apply device settings to SSDP service (refresh device announcements)
      if (plexliveSettings.device) {
        try {
          const ssdpService = require('./ssdpService');
          if (typeof ssdpService.refreshDevice === 'function') {
            await ssdpService.refreshDevice();
            logger.info('Applied device settings to SSDP service', {
              deviceName: plexliveSettings.device.name
            });
          }
        } catch (ssdpError) {
          logger.warn('SSDP service not available for settings update:', ssdpError.message);
        }
      }

      // Apply EPG localization settings
      if (plexliveSettings.localization) {
        try {
          const epgService = require('./epgService');
          if (typeof epgService.updateLocalizationSettings === 'function') {
            epgService.updateLocalizationSettings(plexliveSettings.localization);
            logger.info('Applied localization settings to EPG service');
          }
        } catch (epgError) {
          logger.warn('EPG service not available for settings update:', epgError.message);
        }
      }
      
    } catch (error) {
      logger.error('Failed to apply settings to services:', error);
    }
  }

  /**
   * Apply settings to config object
   */
  applyToConfig(configObj) {
    try {
      const settings = this.cache.get('settings');
      if (!settings) {
        logger.warn('No settings in cache to apply to config');
        return configObj;
      }

      // Create a deep copy of the config to avoid mutations
      const updatedConfig = JSON.parse(JSON.stringify(configObj));

      // Apply flat settings to nested config structure
      for (const [key, value] of Object.entries(settings)) {
        if (key.startsWith('plexlive.')) {
          this.setNestedValue(updatedConfig, key.replace('plexlive.', ''), value);
        }
      }

      logger.info('Applied settings to config:', {
        maxConcurrentStreams: updatedConfig.streaming?.maxConcurrentStreams
      });

      return updatedConfig;
    } catch (error) {
      logger.error('Failed to apply settings to config:', error);
      return configObj;
    }
  }
}

// Create singleton instance
const settingsService = new SettingsService();

module.exports = settingsService;