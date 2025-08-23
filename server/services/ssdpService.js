const SSDP = require('node-ssdp').Server;
const os = require('os');
const logger = require('../utils/logger');
const config = require('../config');
const settingsService = require('./settingsService');

class SSDPService {
  constructor() {
    this.server = null;
    this.isRunning = false;
    this.socketIO = null;
    this.currentUuid = null;
    this.lastAnnouncedSettings = null;
  }

  // Get device UUID from settings first, then fallback to config
  async getDeviceUuid() {
    try {
      const settings = await settingsService.getSettings();
      const settingsUuid = settings?.plexlive?.device?.uuid;
      
      if (settingsUuid && settingsUuid !== 'plextv-default-uuid-001') {
        return settingsUuid;
      }
      
      // Ensure we ALWAYS use the environment variable if set, never generate random
      if (process.env.DEVICE_UUID) {
        return process.env.DEVICE_UUID;
      }
      
      // Fallback to config, but warn about potential random UUID
      const configUuid = config.ssdp.deviceUuid;
      if (configUuid.includes('plextv-local-stable-uuid') || configUuid.includes('plextv-default-uuid')) {
        return configUuid;
      }
      
      // If we get here, config might have a random UUID - use a fixed fallback instead
      logger.warn('Config has random UUID, using fixed fallback to prevent multiple device registrations');
      return 'plextv-emergency-stable-uuid-001';
      
    } catch (error) {
      logger.warn('Failed to get UUID from settings, using environment or fallback:', error.message);
      return process.env.DEVICE_UUID || 'plextv-emergency-stable-uuid-001';
    }
  }

  // Check if SSDP-relevant settings have changed
  async hasSettingsChanged() {
    try {
      const settings = await settingsService.getSettings();
      const currentSettings = {
        uuid: await this.getDeviceUuid(),
        name: settings?.plexlive?.device?.name || config.ssdp.friendlyName,
        enabled: settings?.plexlive?.ssdp?.enabled !== false,
        advertisedHost: settings?.plexlive?.network?.advertisedHost || process.env.ADVERTISED_HOST
      };

      // First time check - no previous settings
      if (!this.lastAnnouncedSettings) {
        this.lastAnnouncedSettings = currentSettings;
        return true;
      }

      // Compare with last announced settings
      const changed = JSON.stringify(currentSettings) !== JSON.stringify(this.lastAnnouncedSettings);
      
      if (changed) {
        logger.info('SSDP settings changed, reload required:', {
          old: this.lastAnnouncedSettings,
          new: currentSettings
        });
        this.lastAnnouncedSettings = currentSettings;
      } else {
        logger.info('SSDP settings unchanged, skipping announcement to prevent duplicate device registrations');
      }

      return changed;
    } catch (error) {
      logger.warn('Failed to check SSDP settings changes:', error.message);
      return true; // Default to allowing restart on error
    }
  }

  async initialize() {
    try {
      logger.info('Initializing SSDP service...');
      
      // SSDP service doesn't need to start immediately
      // It will be started when the HTTP server is ready
      logger.info('SSDP service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize SSDP service:', error);
      throw error;
    }
  }

  async start(io) {
    // Check if settings actually changed before starting/restarting
    const settingsChanged = await this.hasSettingsChanged();
    if (!settingsChanged && this.isRunning) {
      logger.info('SSDP service skipped - no relevant settings changed and already running');
      return;
    }

    // If already running but settings changed, stop first
    if (this.isRunning && settingsChanged) {
      logger.info('SSDP settings changed, restarting service...');
      await this.stop();
    }

    try {
      // Add a small delay to ensure environment is fully loaded and prevent rapid restart announcements
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.socketIO = io;
      
      // Get device UUID from settings or config
      const deviceUuid = await this.getDeviceUuid();
      
      // Log UUID for debugging - this helps track if multiple UUIDs are being generated
      logger.info('SSDP starting with UUID:', { 
        uuid: deviceUuid,
        source: deviceUuid.includes('plextv-local-stable-uuid') ? 'environment' : 'settings'
      });
      
      // Get advertised host from settings or environment
      const settings = await settingsService.getSettings();
      const advertisedHost = settings?.plexlive?.network?.advertisedHost || 
                            process.env.ADVERTISED_HOST || 
                            config.plexlive?.network?.advertisedHost;
      
      // If no advertised host is configured, fall back to detecting local IP
      let localIP = advertisedHost;
      if (!localIP || localIP === 'auto-detect') {
        const networkInterfaces = os.networkInterfaces();
        localIP = '127.0.0.1';
        
        for (const interfaceName in networkInterfaces) {
          const addresses = networkInterfaces[interfaceName];
          for (const address of addresses) {
            if (address.family === 'IPv4' && !address.internal) {
              localIP = address.address;
              break;
            }
          }
          if (localIP !== '127.0.0.1') break;
        }
      }

      const devicePort = process.env.HTTP_PORT || config.server.port;
      const deviceUrl = `http://${localIP}:${devicePort}`;
      
      logger.info('SSDP using advertised host for device URL', {
        advertisedHost: localIP,
        deviceUrl: deviceUrl
      });

      // Create SSDP server configuration
      this.server = new SSDP({
        location: `${deviceUrl}/device.xml`,  // Use full URL with advertised host
        udn: `uuid:${deviceUuid}`,
        description: '/device.xml',
        ttl: 86400 // 24 hours
      });

      // Add HDHomeRun device type
      this.server.addUSN('upnp:rootdevice');
      this.server.addUSN('urn:schemas-upnp-org:device:MediaServer:1');
      this.server.addUSN('urn:schemas-upnp-org:service:ContentDirectory:1');
      this.server.addUSN('urn:silicondust-com:device:HDHomeRun:1');

      // Start the SSDP server
      this.server.start();
      this.isRunning = true;

      logger.info('SSDP service started', {
        uuid: deviceUuid,
        location: deviceUrl,
        friendlyName: config.ssdp.friendlyName
      });

      // Send periodic announcements
      this.startPeriodicAnnouncements();

    } catch (error) {
      logger.error('Failed to start SSDP service:', error);
      this.isRunning = false;
    }
  }

  startPeriodicAnnouncements() {
    // Send SSDP announcements every 30 minutes
    this.announcementInterval = setInterval(() => {
      if (this.server && this.isRunning) {
        try {
          this.server.advertise();
          logger.debug('SSDP periodic announcement sent');
        } catch (error) {
          logger.error('SSDP announcement error:', error);
        }
      }
    }, 30 * 60 * 1000); // 30 minutes
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      if (this.announcementInterval) {
        clearInterval(this.announcementInterval);
        this.announcementInterval = null;
      }

      if (this.server) {
        this.server.stop();
        this.server = null;
      }

      this.isRunning = false;
      logger.info('SSDP service stopped');
    } catch (error) {
      logger.error('Error stopping SSDP service:', error);
    }
  }

  async shutdown() {
    logger.info('Shutting down SSDP service...');
    this.stop();
    logger.info('SSDP service shutdown completed');
  }

  /**
   * Update the advertised host at runtime
   */
  updateAdvertisedHost(newHost) {
    try {
      // Store the new advertised host
      this.advertisedHost = newHost;
      
      // If SSDP is running, restart it with the new host
      if (this.isRunning) {
        logger.info('Restarting SSDP service with new advertised host:', newHost);
        this.stop();
        setTimeout(() => {
          this.start(this.io);
        }, 1000); // Small delay to ensure clean restart
      }
      
      logger.info('Advertised host updated for SSDP service:', newHost);
    } catch (error) {
      logger.error('Failed to update advertised host:', error);
    }
  }

  // Generate HDHomeRun-compatible device description
  async generateDeviceDescription() {
    try {
      // Get current settings to get the device name and UUID
      const settings = await settingsService.getSettings();
      const deviceName = settings?.plexlive?.device?.name || config.ssdp.friendlyName;
      const deviceUuid = await this.getDeviceUuid();
      
      // Priority order: Runtime update > Settings > Environment > Config > Auto-detect
      let localIP = this.advertisedHost ||                                      // Runtime update
                   settings?.plexlive?.network?.advertisedHost ||              // Settings UI
                   process.env.ADVERTISED_HOST ||                              // Docker environment
                   config.plexlive?.network?.advertisedHost ||                 // Config file  
                   config.network?.advertisedHost;                             // Legacy config
      
      if (!localIP) {
        // Auto-detect IP if no advertised host is configured
        const networkInterfaces = os.networkInterfaces();
        localIP = '127.0.0.1';
        
        for (const interfaceName in networkInterfaces) {
          const addresses = networkInterfaces[interfaceName];
          for (const address of addresses) {
            if (address.family === 'IPv4' && !address.internal) {
              localIP = address.address;
              break;
            }
          }
          if (localIP !== '127.0.0.1') break;
        }
      }

      // Ensure we have port if not included
      let deviceUrl;
      if (localIP.includes(':')) {
        deviceUrl = localIP.startsWith('http') ? localIP : `http://${localIP}`;
      } else {
        deviceUrl = `http://${localIP}:${config.server.port}`;
      }

      return `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <presentationURL>${deviceUrl}</presentationURL>
    <friendlyName>${deviceName}</friendlyName>
    <manufacturer>${config.ssdp.manufacturer}</manufacturer>
    <manufacturerURL>https://github.com/plextv</manufacturerURL>
    <modelDescription>${config.ssdp.description}</modelDescription>
    <modelName>${config.ssdp.modelName}</modelName>
    <modelNumber>${config.ssdp.modelNumber}</modelNumber>
    <modelURL>https://github.com/plextv</modelURL>
    <serialNumber>12345678</serialNumber>
    <UDN>uuid:${deviceUuid}</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
        <SCPDURL>/contentdirectory.xml</SCPDURL>
        <controlURL>/contentdirectory/control</controlURL>
        <eventSubURL>/contentdirectory/event</eventSubURL>
      </service>
    </serviceList>
  </device>
</root>`;
    } catch (error) {
      logger.error('Error generating device description:', error);
      // Fallback to static config if settings fail
      return this.generateStaticDeviceDescription();
    }
  }

  // Generate HDHomeRun discovery response with improved error handling
  async generateDiscoveryResponse() {
    const startTime = Date.now();
    
    try {
      // Set timeout for settings retrieval to prevent hanging
      const settingsPromise = Promise.race([
        settingsService.getSettings(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Settings timeout')), 2000))
      ]);
      
      let settings;
      try {
        settings = await settingsPromise;
      } catch (settingsError) {
        logger.warn('Settings service timeout in discovery, using defaults', { error: settingsError.message });
        settings = {};
      }
      
      const deviceName = settings?.plexlive?.device?.name || config.ssdp.friendlyName;
      const tunerCount = settings?.plexlive?.streaming?.maxConcurrentStreams || config.streams.maxConcurrent;
      
      // Simplified IP resolution with fallback
      let localIP = this.advertisedHost ||
                   settings?.plexlive?.network?.advertisedHost ||
                   process.env.ADVERTISED_HOST ||
                   config.plexlive?.network?.advertisedHost ||
                   config.network?.advertisedHost;
      
      if (!localIP) {
        // Fast auto-detect with timeout
        try {
          const networkInterfaces = os.networkInterfaces();
          localIP = '127.0.0.1';
          
          for (const interfaceName in networkInterfaces) {
            const addresses = networkInterfaces[interfaceName];
            for (const address of addresses) {
              if (address.family === 'IPv4' && !address.internal) {
                localIP = address.address;
                break;
              }
            }
            if (localIP !== '127.0.0.1') break;
          }
        } catch (networkError) {
          logger.warn('Network interface detection failed, using localhost', { error: networkError.message });
          localIP = '127.0.0.1';
        }
      }

      const discoveryResponse = {
        FriendlyName: deviceName,
        Manufacturer: config.ssdp.manufacturer,
        ManufacturerURL: 'https://github.com/plextv',
        ModelNumber: config.ssdp.modelNumber,
        FirmwareName: config.ssdp.modelName,
        FirmwareVersion: '1.0.0',
        DeviceID: config.ssdp.deviceUuid.replace(/-/g, '').toUpperCase(),
        DeviceAuth: 'test1234',
        BaseURL: `http://${localIP}:${config.server.port}`,
        LineupURL: `http://${localIP}:${config.server.port}/lineup.json`,
        TunerCount: tunerCount,
        
        // EPG Configuration - Multiple formats for maximum Plex compatibility
        EPGURL: `http://${localIP}:${config.server.port}/epg/xmltv.xml`,
        GuideURL: `http://${localIP}:${config.server.port}/epg/xmltv.xml`,
        EPGSource: `http://${localIP}:${config.server.port}/epg/xmltv.xml`,
        
        // Additional EPG endpoints for different access patterns
        XMLTVGuideDataURL: `http://${localIP}:${config.server.port}/epg/xmltv.xml`,
        EPGDataURL: `http://${localIP}:${config.server.port}/epg/xmltv.xml`,
        
        // EPG Information
        SupportsEPG: true,
        EPGDays: 7,
        EPGChannels: 'all'
      };
      
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        logger.warn('Discovery response generation took too long', { duration, localIP });
      }
      
      return discoveryResponse;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error generating discovery response, using fallback', { error: error.message, duration });
      // Fallback to static config if settings fail
      return this.generateStaticDiscoveryResponse();
    }
  }

  // Generate tuner status for HDHomeRun compatibility
  generateTunerStatus() {
    const status = [];
    
    // Use the same IP resolution logic as discovery response
    let localIP = this.advertisedHost ||
                 process.env.ADVERTISED_HOST ||
                 config.plexlive?.network?.advertisedHost ||
                 config.network?.advertisedHost;
    
    if (!localIP) {
      try {
        const networkInterfaces = os.networkInterfaces();
        localIP = '127.0.0.1';
        
        for (const interfaceName in networkInterfaces) {
          const addresses = networkInterfaces[interfaceName];
          for (const address of addresses) {
            if (address.family === 'IPv4' && !address.internal) {
              localIP = address.address;
              break;
            }
          }
          if (localIP !== '127.0.0.1') break;
        }
      } catch (networkError) {
        logger.warn('Network interface detection failed, using localhost', { error: networkError.message });
        localIP = '127.0.0.1';
      }
    }
    
    for (let i = 0; i < config.streams.maxConcurrent; i++) {
      status.push({
        Resource: `tuner${i}`,
        InUse: 0, // This should be updated based on actual stream usage
        VctNumber: '',
        VctName: '',
        Frequency: 0,
        ProgramNumber: 0,
        LockSupported: 1,
        SignalPresent: 1,
        SignalStrength: 100,
        SignalQuality: 100,
        SymbolQuality: 100,
        NetworkRate: 19392636,
        TargetIP: `${localIP}:5004`
      });
    }

    return status;
  }

  getStatus() {
    return {
      running: this.isRunning,
      uuid: config.ssdp.deviceUuid,
      friendlyName: config.ssdp.friendlyName,
      startTime: this.startTime || null,
      announcements: this.announcementCount || 0
    };
  }

  // Fallback method for static device description
  generateStaticDeviceDescription() {
    const networkInterfaces = os.networkInterfaces();
    let localIP = '127.0.0.1';
    
    for (const interfaceName in networkInterfaces) {
      const addresses = networkInterfaces[interfaceName];
      for (const address of addresses) {
        if (address.family === 'IPv4' && !address.internal) {
          localIP = address.address;
          break;
        }
      }
      if (localIP !== '127.0.0.1') break;
    }

    const deviceUrl = `http://${localIP}:${config.server.port}`;

    return `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <presentationURL>${deviceUrl}</presentationURL>
    <friendlyName>${config.ssdp.friendlyName}</friendlyName>
    <manufacturer>${config.ssdp.manufacturer}</manufacturer>
    <manufacturerURL>https://github.com/plextv</manufacturerURL>
    <modelDescription>${config.ssdp.description}</modelDescription>
    <modelName>${config.ssdp.modelName}</modelName>
    <modelNumber>${config.ssdp.modelNumber}</modelNumber>
    <modelURL>https://github.com/plextv</modelURL>
    <serialNumber>12345678</serialNumber>
    <UDN>uuid:${deviceUuid}</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
        <SCPDURL>/contentdirectory.xml</SCPDURL>
        <controlURL>/contentdirectory/control</controlURL>
        <eventSubURL>/contentdirectory/event</eventSubURL>
      </service>
    </serviceList>
  </device>
</root>`;
  }

  // Fallback method for static discovery response
  generateStaticDiscoveryResponse() {
    const networkInterfaces = os.networkInterfaces();
    let localIP = '127.0.0.1';
    
    for (const interfaceName in networkInterfaces) {
      const addresses = networkInterfaces[interfaceName];
      for (const address of addresses) {
        if (address.family === 'IPv4' && !address.internal) {
          localIP = address.address;
          break;
        }
      }
      if (localIP !== '127.0.0.1') break;
    }

    return {
      FriendlyName: config.ssdp.friendlyName,
      Manufacturer: config.ssdp.manufacturer,
      ManufacturerURL: 'https://github.com/plextv',
      ModelNumber: config.ssdp.modelNumber,
      FirmwareName: config.ssdp.modelName,
      FirmwareVersion: '1.0.0',
      DeviceID: config.ssdp.deviceUuid.replace(/-/g, '').toUpperCase(),
      DeviceAuth: 'test1234',
      BaseURL: `http://${localIP}:${config.server.port}`,
      LineupURL: `http://${localIP}:${config.server.port}/lineup.json`,
      TunerCount: config.streams.maxConcurrent,
      
      // EPG Configuration - Multiple formats for maximum Plex compatibility
      EPGURL: `http://${localIP}:${config.server.port}/epg/xmltv.xml`,
      GuideURL: `http://${localIP}:${config.server.port}/epg/xmltv.xml`,
      EPGSource: `http://${localIP}:${config.server.port}/epg/xmltv.xml`,
      
      // Additional EPG endpoints for different access patterns
      XMLTVGuideDataURL: `http://${localIP}:${config.server.port}/epg/xmltv.xml`,
      EPGDataURL: `http://${localIP}:${config.server.port}/epg/xmltv.xml`,
      
      // EPG Information
      SupportsEPG: true,
      EPGDays: 7,
      EPGChannels: 'all'
    };
  }

  // Force SSDP to re-announce with updated settings
  async refreshDevice() {
    if (this.server && this.isRunning) {
      try {
        logger.info('Refreshing SSDP device announcement with updated settings');
        
        // Stop current service
        this.stop();
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Restart with updated settings
        this.start(this.socketIO);
        
        logger.info('SSDP service refreshed with updated device settings');
      } catch (error) {
        logger.error('Error refreshing SSDP device:', error);
      }
    }
  }
}

// Create singleton instance
const ssdpService = new SSDPService();

module.exports = ssdpService;
