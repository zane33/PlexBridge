const SSDP = require('node-ssdp').Server;
const os = require('os');
const logger = require('../utils/logger');
const config = require('../config');

class SSDPService {
  constructor() {
    this.server = null;
    this.isRunning = false;
    this.socketIO = null;
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

  start(io) {
    if (this.isRunning) {
      logger.warn('SSDP service is already running');
      return;
    }

    try {
      this.socketIO = io;
      
      // Get local IP address
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

      const devicePort = config.server.port;
      const deviceUrl = `http://${localIP}:${devicePort}`;

      // Create SSDP server configuration
      this.server = new SSDP({
        location: {
          port: devicePort,
          path: '/device.xml'
        },
        udn: `uuid:${config.ssdp.deviceUuid}`,
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
        uuid: config.ssdp.deviceUuid,
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

  // Generate HDHomeRun-compatible device description
  generateDeviceDescription() {
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
    <UDN>uuid:${config.ssdp.deviceUuid}</UDN>
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

  // Generate HDHomeRun discovery response
  generateDiscoveryResponse() {
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
      // Add EPG URL for Plex - using xmltv.xml endpoint which is the standard format
      EPGURL: `http://${localIP}:${config.server.port}/epg/xmltv.xml`
    };
  }

  // Generate tuner status for HDHomeRun compatibility
  generateTunerStatus() {
    const status = [];
    
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
        TargetIP: '0.0.0.0:0'
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
}

// Create singleton instance
const ssdpService = new SSDPService();

module.exports = ssdpService;
