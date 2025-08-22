import axios from 'axios';

// Create axios instance with default config
const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000',
  timeout: 30000, // Default timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Create special instance for long-running operations like M3U parsing
const longRunningApi = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000',
  timeout: 300000, // 5 minutes for M3U parsing
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add any auth headers here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle common errors
    if (error.response?.status === 401) {
      // Handle unauthorized
      console.error('Unauthorized access');
    } else if (error.response?.status >= 500) {
      // Handle server errors
      console.error('Server error:', error.response.data?.error || error.message);
    } else if (error.code === 'ECONNABORTED') {
      // Handle timeout
      console.error('Request timeout');
    } else if (!error.response) {
      // Handle network errors
      console.error('Network error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

// Apply same interceptors to longRunningApi
longRunningApi.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

longRunningApi.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle common errors with more specific timeout messaging for long operations
    if (error.response?.status === 401) {
      console.error('Unauthorized access');
    } else if (error.response?.status >= 500) {
      console.error('Server error:', error.response.data?.error || error.message);
    } else if (error.code === 'ECONNABORTED') {
      console.error('M3U parsing timeout - playlist may be too large');
    } else if (!error.response) {
      console.error('Network error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

// Settings API functions
export const settingsApi = {
  // Get all settings
  getSettings: () => api.get('/api/settings'),
  
  // Get settings for a specific category
  getCategory: (category) => api.get(`/api/settings/${category}`),
  
  // Update settings
  updateSettings: (settings) => api.put('/api/settings', settings),
  
  // Reset settings to defaults
  resetSettings: (category = null) => api.post('/api/settings/reset', { category }),
  
  // Get settings metadata
  getMetadata: () => api.get('/api/settings/metadata'),
  
  // Validate settings (client-side helper)
  validateSettings: (settings) => {
    const errors = [];
    
    if (settings.plexlive) {
      const { plexlive } = settings;
      
      // SSDP validation
      if (plexlive.ssdp) {
        if (plexlive.ssdp.discoverableInterval < 5000 || plexlive.ssdp.discoverableInterval > 300000) {
          errors.push('SSDP discoverable interval must be between 5000ms and 300000ms');
        }
        if (plexlive.ssdp.announceInterval < 300000 || plexlive.ssdp.announceInterval > 7200000) {
          errors.push('SSDP announce interval must be between 300000ms and 7200000ms');
        }
      }
      
      // Streaming validation
      if (plexlive.streaming) {
        if (plexlive.streaming.maxConcurrentStreams < 1 || plexlive.streaming.maxConcurrentStreams > 100) {
          errors.push('Maximum concurrent streams must be between 1 and 100');
        }
        if (plexlive.streaming.streamTimeout < 5000 || plexlive.streaming.streamTimeout > 300000) {
          errors.push('Stream timeout must be between 5000ms and 300000ms');
        }
        if (plexlive.streaming.bufferSize < 1024 || plexlive.streaming.bufferSize > 1048576) {
          errors.push('Buffer size must be between 1024 and 1048576 bytes');
        }
      }
      
      // Transcoding validation
      if (plexlive.transcoding && plexlive.transcoding.qualityProfiles) {
        const { qualityProfiles } = plexlive.transcoding;
        const resolutionPattern = /^\d+x\d+$/;
        const bitratePattern = /^\d+k$/;
        
        ['low', 'medium', 'high'].forEach(profile => {
          if (qualityProfiles[profile]) {
            if (!resolutionPattern.test(qualityProfiles[profile].resolution)) {
              errors.push(`${profile} profile resolution must be in format "widthxheight" (e.g., "1920x1080")`);
            }
            if (!bitratePattern.test(qualityProfiles[profile].bitrate)) {
              errors.push(`${profile} profile bitrate must be in format "numberk" (e.g., "5000k")`);
            }
          }
        });
      }
      
      // Caching validation
      if (plexlive.caching) {
        if (plexlive.caching.duration < 300 || plexlive.caching.duration > 86400) {
          errors.push('Cache duration must be between 300 and 86400 seconds');
        }
        if (plexlive.caching.maxSize < 104857600 || plexlive.caching.maxSize > 107374182400) {
          errors.push('Cache max size must be between 100MB and 100GB');
        }
      }
      
      // Device validation
      if (plexlive.device) {
        if (plexlive.device.tunerCount < 1 || plexlive.device.tunerCount > 32) {
          errors.push('Tuner count must be between 1 and 32');
        }
        if (plexlive.device.firmware && !/^\d+\.\d+\.\d+$/.test(plexlive.device.firmware)) {
          errors.push('Firmware version must be in format "x.y.z" (e.g., "1.0.0")');
        }
      }
      
      // Network validation
      if (plexlive.network) {
        if (plexlive.network.streamingPort < 1024 || plexlive.network.streamingPort > 65535) {
          errors.push('Streaming port must be between 1024 and 65535');
        }
        if (plexlive.network.discoveryPort < 1024 || plexlive.network.discoveryPort > 65535) {
          errors.push('Discovery port must be between 1024 and 65535');
        }
      }
      
      // Compatibility validation
      if (plexlive.compatibility) {
        if (plexlive.compatibility.gracePeriod < 1000 || plexlive.compatibility.gracePeriod > 60000) {
          errors.push('Grace period must be between 1000ms and 60000ms');
        }
      }
      
      // Localization validation
      if (plexlive.localization) {
        if (plexlive.localization.locale && !/^[a-z]{2}(-[A-Z]{2})?$/.test(plexlive.localization.locale)) {
          errors.push('Locale must be in BCP 47 format (e.g., "en-US", "fr-FR")');
        }
        if (plexlive.localization.dateFormat && !['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'DD.MM.YYYY'].includes(plexlive.localization.dateFormat)) {
          errors.push('Date format must be one of: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, DD.MM.YYYY');
        }
        if (plexlive.localization.timeFormat && !['12h', '24h'].includes(plexlive.localization.timeFormat)) {
          errors.push('Time format must be either "12h" or "24h"');
        }
        if (plexlive.localization.firstDayOfWeek !== undefined && (plexlive.localization.firstDayOfWeek < 0 || plexlive.localization.firstDayOfWeek > 6)) {
          errors.push('First day of week must be between 0 (Sunday) and 6 (Saturday)');
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },
  
  // Get default settings structure
  getDefaults: () => ({
    plexlive: {
      ssdp: {
        enabled: true,
        discoverableInterval: 30000,
        announceInterval: 1800000,
        multicastAddress: '239.255.255.250',
        deviceDescription: 'IPTV to Plex Bridge Interface'
      },
      streaming: {
        maxConcurrentStreams: 5,
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
        firstDayOfWeek: 1
      }
    }
  })
};

// Helper functions for settings
export const settingsHelpers = {
  // Deep merge two settings objects
  mergeSettings: (defaults, custom) => {
    const result = { ...defaults };
    
    for (const key in custom) {
      if (custom[key] && typeof custom[key] === 'object' && !Array.isArray(custom[key])) {
        if (result[key] && typeof result[key] === 'object') {
          result[key] = settingsHelpers.mergeSettings(result[key], custom[key]);
        } else {
          result[key] = custom[key];
        }
      } else {
        result[key] = custom[key];
      }
    }
    
    return result;
  },
  
  // Get setting value by dot notation path
  getSettingByPath: (settings, path, defaultValue = null) => {
    const pathArray = path.split('.');
    let current = settings;
    
    for (const key of pathArray) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }
    
    return current;
  },
  
  // Set setting value by dot notation path
  setSettingByPath: (settings, path, value) => {
    const pathArray = path.split('.');
    const newSettings = JSON.parse(JSON.stringify(settings)); // Deep clone
    let current = newSettings;
    
    for (let i = 0; i < pathArray.length - 1; i++) {
      if (!current[pathArray[i]] || typeof current[pathArray[i]] !== 'object') {
        current[pathArray[i]] = {};
      }
      current = current[pathArray[i]];
    }
    
    current[pathArray[pathArray.length - 1]] = value;
    return newSettings;
  },
  
  // Format bytes to human readable string
  formatBytes: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  // Format milliseconds to human readable duration
  formatDuration: (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  },
  
  // Check if settings have been modified from defaults
  hasChanges: (current, defaults) => {
    return JSON.stringify(current) !== JSON.stringify(defaults);
  }
};

// Backup/Restore API functions
export const backupApi = {
  // Export configuration backup
  exportBackup: (includePasswords = false, format = 'json') => 
    api.get('/api/backup/export', {
      params: { includePasswords, format }
    }),
  
  // Download backup file
  downloadBackup: async (includePasswords = false, includeEpgData = false, includeLogs = false) => {
    try {
      const response = await api.get('/api/backup/export', {
        params: { 
          includePasswords, 
          includeEpgData, 
          includeLogs, 
          format: 'download' 
        },
        responseType: 'json'
      });
      
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json'
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `plexbridge-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || error.message };
    }
  },
  
  // Import configuration backup
  importBackup: (backupData, options = {}) =>
    api.post('/api/backup/import', { backupData, options }),
  
  // Validate backup before import
  validateBackup: async (backupData) => {
    try {
      const response = await api.post('/api/backup/validate', { backupData });
      return response.data;
    } catch (error) {
      // Return a validation structure with error information
      return {
        isValid: false,
        errors: [error.response?.data?.error || error.message || 'Validation failed'],
        warnings: [],
        summary: null
      };
    }
  },
  
  // Parse backup file from file input
  parseBackupFile: (file) => {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }
      
      if (!file.name.endsWith('.json')) {
        reject(new Error('File must be a JSON file'));
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const backupData = JSON.parse(event.target.result);
          resolve(backupData);
        } catch (error) {
          reject(new Error('Invalid JSON file format'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  },
  
  // Validate backup data structure
  validateBackupStructure: (backupData) => {
    const errors = [];
    
    if (!backupData) {
      errors.push('Backup data is missing');
      return { valid: false, errors };
    }
    
    if (!backupData.version) {
      errors.push('Backup version is missing');
    }
    
    if (!backupData.data) {
      errors.push('Backup data section is missing');
      return { valid: false, errors };
    }
    
    const { data } = backupData;
    
    if (!Array.isArray(data.channels)) {
      errors.push('Channels data must be an array');
    }
    
    if (!Array.isArray(data.streams)) {
      errors.push('Streams data must be an array');
    }
    
    if (!Array.isArray(data.epgSources)) {
      errors.push('EPG sources data must be an array');
    }
    
    if (typeof data.settings !== 'object') {
      errors.push('Settings data must be an object');
    }
    
    return { valid: errors.length === 0, errors };
  },
  
  // Get backup summary
  getBackupSummary: (backupData) => {
    if (!backupData || !backupData.data) {
      return null;
    }
    
    const { data, metadata, timestamp, version, includesPasswords } = backupData;
    
    return {
      version,
      timestamp,
      includesPasswords,
      summary: {
        channels: data.channels?.length || 0,
        streams: data.streams?.length || 0,
        epgSources: data.epgSources?.length || 0,
        settings: Object.keys(data.settings || {}).length,
        ...metadata
      }
    };
  }
};

// Log management API functions
export const logApi = {
  // Get logs with filtering
  getLogs: (filters = {}) => api.get('/api/logs', { params: filters }),
  
  // Get available log files
  getLogFiles: () => api.get('/api/logs/files'),
  
  // Download log file
  downloadLog: async (filename, format = 'txt') => {
    try {
      const [type, date] = filename.replace('.log', '').split('-');
      const response = await api.get('/api/logs/download', {
        params: { type, date, format },
        responseType: format === 'json' ? 'json' : 'blob'
      });
      
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: 'application/json'
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${type}-${date || 'latest'}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
      } else {
        const url = window.URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || error.message };
    }
  },
  
  // Cleanup old logs
  cleanupLogs: (days = 30) => api.delete('/api/logs/cleanup', { data: { days } })
};

// Stream management API functions
export const streamApi = {
  // Get active streams
  getActiveStreams: () => api.get('/api/streams/active'),
  
  // Terminate specific stream
  terminateStream: (sessionId, reason = 'manual') =>
    api.delete(`/api/streams/active/${sessionId}`, { data: { reason } }),
  
  // Terminate client sessions
  terminateClientSessions: (clientId, reason = 'admin') =>
    api.delete(`/api/streams/active/client/${clientId}`, { data: { reason } }),
  
  // Terminate channel streams
  terminateChannelStreams: (streamId, reason = 'admin') =>
    api.delete(`/api/streams/active/channel/${streamId}`, { data: { reason } })
};

// M3U parsing API functions (using long timeout)
export const m3uApi = {
  // Parse M3U playlist (long-running operation) - Legacy method
  parsePlaylist: (url) => longRunningApi.post('/api/streams/parse/m3u', { url }),
  
  // Optimized streaming M3U parser for large playlists
  parsePlaylistStream: (url, chunkSize = 100, onProgress, onChannels, onComplete, onError) => {
    return new Promise((resolve, reject) => {
      const encodedUrl = encodeURIComponent(url);
      const streamUrl = `/api/streams/parse/m3u/stream?url=${encodedUrl}&chunkSize=${chunkSize}`;
      
      const eventSource = new EventSource(streamUrl);
      let channelBuffer = [];

      eventSource.addEventListener('progress', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (onProgress) onProgress(data);
        } catch (e) {
          console.warn('Failed to parse progress event:', e);
        }
      });

      eventSource.addEventListener('channels', (event) => {
        try {
          const data = JSON.parse(event.data);
          channelBuffer = channelBuffer.concat(data.channels);
          if (onChannels) onChannels({
            ...data,
            allChannels: [...channelBuffer] // Include all channels received so far
          });
        } catch (e) {
          console.warn('Failed to parse channels event:', e);
        }
      });

      eventSource.addEventListener('complete', (event) => {
        try {
          const data = JSON.parse(event.data);
          eventSource.close();
          if (onComplete) onComplete({
            ...data,
            allChannels: channelBuffer
          });
          resolve({
            data: {
              channels: channelBuffer,
              total: data.totalChannels,
              sessionId: data.sessionId
            }
          });
        } catch (e) {
          console.warn('Failed to parse complete event:', e);
          eventSource.close();
          resolve({
            data: {
              channels: channelBuffer,
              total: channelBuffer.length
            }
          });
        }
      });

      eventSource.addEventListener('error', (event) => {
        try {
          const data = JSON.parse(event.data);
          eventSource.close();
          if (onError) onError(data);
          reject(new Error(data.error));
        } catch (e) {
          eventSource.close();
          if (onError) onError({ error: 'Streaming connection failed' });
          reject(new Error('Streaming connection failed'));
        }
      });

      eventSource.onerror = (error) => {
        eventSource.close();
        if (onError) onError({ error: 'Connection lost' });
        reject(new Error('EventSource connection failed'));
      };

      // Cleanup function
      return () => eventSource.close();
    });
  },

  // Auto-select optimal parsing method based on estimated playlist size
  parsePlaylistAuto: async (url, callbacks = {}) => {
    const { onProgress, onChannels, onComplete, onError } = callbacks;
    
    try {
      // First, try to estimate playlist size using GET (HEAD doesn't work well with query params)
      const estimateResponse = await api.get('/api/streams/parse/m3u/estimate', {
        params: { url }
      });
      
      const contentLength = parseInt(estimateResponse.data?.contentLength || estimateResponse.headers['x-content-length'] || '0');
      const estimatedChannels = parseInt(estimateResponse.data?.estimatedChannels || estimateResponse.headers['x-estimated-channels'] || '0');
      const recommendStreaming = estimateResponse.data?.recommendStreaming || estimateResponse.headers['x-recommend-streaming'] === 'true';
      const memoryImpact = estimateResponse.data?.memoryImpact || estimateResponse.headers['x-memory-impact'];
      
      console.log(`Playlist analysis: ${contentLength} bytes, ~${estimatedChannels} channels, memory impact: ${memoryImpact}, recommend streaming: ${recommendStreaming}`);
      
      // CRITICAL FIX: If analysis fails (0 bytes/channels), always use streaming for safety
      const analysisFailedOrUnknown = contentLength === 0 && estimatedChannels === 0;
      
      // Use streaming for large playlists or when explicitly recommended
      // ALWAYS use streaming when estimation fails (unknown memory impact) or analysis returns zeros
      if (recommendStreaming || memoryImpact === 'unknown' || analysisFailedOrUnknown || contentLength > 1 * 1024 * 1024 || estimatedChannels > 1000) {
        console.log(`Using ultra-optimized streaming parser (${estimatedChannels || 'unknown'} est. channels)`);
        
        // Use adaptive chunk size based on estimated size
        const chunkSize = estimatedChannels > 100000 ? 2000 : (estimatedChannels > 50000 ? 1000 : 500);
        
        return m3uApi.parsePlaylistStream(url, chunkSize || 1000, onProgress, onChannels, onComplete, onError);
      } else {
        console.log(`Using legacy parser for small playlist (${estimatedChannels || 'unknown'} est. channels)`);
        if (onProgress) onProgress({ stage: 'fetching', progress: 0, message: 'Using legacy parser for small playlist...' });
        const response = await m3uApi.parsePlaylist(url);
        
        // CRITICAL FIX: Pass channels to the callback before completing
        if (onChannels && response.data.channels) {
          console.log(`Legacy parser found ${response.data.channels.length} channels, passing to UI`);
          onChannels(response.data.channels);
        }
        
        if (onComplete) onComplete({ totalChannels: response.data.channels.length });
        return response;
      }
    } catch (error) {
      console.log('Estimation endpoint failed, trying direct HEAD:', error.message);
      
      // Fallback to direct HEAD request to the M3U URL
      try {
        const headResponse = await fetch(url, { method: 'HEAD', mode: 'cors' });
        const contentLength = parseInt(headResponse.headers.get('content-length') || '0');
        
        // Use streaming for anything > 1MB or unknown size
        if (contentLength > 1 * 1024 * 1024 || contentLength === 0) {
          console.log(`Using streaming parser (size: ${contentLength === 0 ? 'unknown' : Math.round(contentLength/1024) + 'KB'})`);
          return m3uApi.parsePlaylistStream(url, 1000, onProgress, onChannels, onComplete, onError);
        } else {
          console.log(`Using legacy parser (size: ${Math.round(contentLength/1024)}KB)`);
          const response = await m3uApi.parsePlaylist(url);
          if (onComplete) onComplete({ totalChannels: response.data.channels.length });
          return response;
        }
      } catch (fallbackError) {
        // Default to streaming parser for safety (better for large playlists)
        console.log('All estimation failed, defaulting to STREAMING parser for safety');
        if (onProgress) onProgress({ stage: 'starting', progress: 0, message: 'Starting streaming parser...' });
        return m3uApi.parsePlaylistStream(url, 1000, onProgress, onChannels, onComplete, onError);
      }
    }
  },
  
  // Import selected channels with optional starting channel number
  importChannels: (url, selectedChannels, startingChannelNumber = null) => 
    api.post('/api/streams/import/m3u', { 
      url, 
      selectedChannels, 
      ...(startingChannelNumber && { startingChannelNumber }) 
    }),
  
  // Validate M3U URL
  validateUrl: (url) => api.post('/api/streams/validate/m3u', { url }),
  
  // Cache management
  getCacheStatus: () => api.get('/api/m3u/cache/status'),
  clearCache: () => api.delete('/api/m3u/cache/clear'),
  removeCacheEntry: (urlHash) => api.delete(`/api/m3u/cache/${urlHash}`),
  
  // Performance monitoring for massive playlists
  getPerformanceMetrics: () => api.get('/api/streams/parse/performance'),
  
  // Playlist size estimation
  estimatePlaylistSize: (url) => api.head('/api/streams/parse/m3u/estimate', {
    params: { url }
  })
};

export { longRunningApi };
export default api;
