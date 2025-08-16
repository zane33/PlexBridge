import axios from 'axios';

// Create axios instance with default config
const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8080',
  timeout: 30000,
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
  downloadBackup: async (includePasswords = false) => {
    try {
      const response = await api.get('/api/backup/export', {
        params: { includePasswords, format: 'download' },
        responseType: 'blob'
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
  validateBackup: (backupData) =>
    api.post('/api/backup/validate', { backupData }),
  
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

export default api;
