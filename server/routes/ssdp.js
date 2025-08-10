const express = require('express');
const router = express.Router();
const ssdpService = require('../services/ssdpService');
const streamManager = require('../services/streamManager');
const database = require('../services/database');
const logger = require('../utils/logger');

// HDHomeRun discovery endpoint
router.get('/discover.json', (req, res) => {
  try {
    const discovery = ssdpService.generateDiscoveryResponse();
    logger.debug('HDHomeRun discovery request', { userAgent: req.get('User-Agent') });
    res.json(discovery);
  } catch (error) {
    logger.error('Discovery endpoint error:', error);
    res.status(500).json({ error: 'Discovery failed' });
  }
});

// Device description XML
router.get('/device.xml', (req, res) => {
  try {
    const deviceXml = ssdpService.generateDeviceDescription();
    res.set('Content-Type', 'application/xml');
    res.send(deviceXml);
  } catch (error) {
    logger.error('Device description error:', error);
    res.status(500).send('<?xml version="1.0"?><error>Device description failed</error>');
  }
});

// Lineup status endpoint
router.get('/lineup_status.json', (req, res) => {
  try {
    const activeStreams = streamManager.getActiveStreams();
    const tunerStatus = ssdpService.generateTunerStatus();
    
    // Update tuner status based on active streams
    activeStreams.forEach((stream, index) => {
      if (index < tunerStatus.length) {
        tunerStatus[index].InUse = 1;
        tunerStatus[index].VctNumber = stream.channelNumber || '';
        tunerStatus[index].VctName = stream.channelName || '';
        tunerStatus[index].TargetIP = `${stream.clientIP}:0`;
      }
    });

    const status = {
      ScanInProgress: 0,
      ScanPossible: 1,
      Source: 'Cable',
      SourceList: ['Cable']
    };

    res.json(status);
  } catch (error) {
    logger.error('Lineup status error:', error);
    res.status(500).json({ error: 'Lineup status failed' });
  }
});

// Channel lineup endpoint
router.get('/lineup.json', async (req, res) => {
  try {
    // Get all enabled channels from database
    const channels = await database.all(`
      SELECT c.*, s.url, s.type 
      FROM channels c 
      LEFT JOIN streams s ON c.id = s.channel_id 
      WHERE c.enabled = 1 AND s.enabled = 1
      ORDER BY c.number
    `);

    const lineup = channels.map(channel => ({
      GuideNumber: channel.number.toString(),
      GuideName: channel.name,
      URL: `http://${req.get('host')}/stream/${channel.id}`,
      HD: 1, // Assume HD for all channels
      DRM: 0, // No DRM
      Favorite: 0
    }));

    logger.debug('Channel lineup request', { 
      channelCount: lineup.length,
      userAgent: req.get('User-Agent')
    });

    res.json(lineup);
  } catch (error) {
    logger.error('Channel lineup error:', error);
    res.status(500).json({ error: 'Channel lineup failed' });
  }
});

// Tuner status endpoint
router.get('/tuner.json', (req, res) => {
  try {
    const tunerStatus = ssdpService.generateTunerStatus();
    res.json(tunerStatus);
  } catch (error) {
    logger.error('Tuner status error:', error);
    res.status(500).json({ error: 'Tuner status failed' });
  }
});

// Auto-discovery endpoint (alternative)
router.get('/auto/:device', (req, res) => {
  try {
    const device = req.params.device;
    
    if (device === 'hdhr') {
      const discovery = ssdpService.generateDiscoveryResponse();
      res.json(discovery);
    } else {
      res.status(404).json({ error: 'Device not found' });
    }
  } catch (error) {
    logger.error('Auto-discovery error:', error);
    res.status(500).json({ error: 'Auto-discovery failed' });
  }
});

// Content directory service descriptor
router.get('/contentdirectory.xml', (req, res) => {
  const serviceXml = `<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <actionList>
    <action>
      <name>Browse</name>
      <argumentList>
        <argument>
          <name>ObjectID</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_ObjectID</relatedStateVariable>
        </argument>
        <argument>
          <name>BrowseFlag</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_BrowseFlag</relatedStateVariable>
        </argument>
        <argument>
          <name>Filter</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_Filter</relatedStateVariable>
        </argument>
        <argument>
          <name>StartingIndex</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_Index</relatedStateVariable>
        </argument>
        <argument>
          <name>RequestedCount</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable>
        </argument>
        <argument>
          <name>SortCriteria</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_SortCriteria</relatedStateVariable>
        </argument>
        <argument>
          <name>Result</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_Result</relatedStateVariable>
        </argument>
        <argument>
          <name>NumberReturned</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable>
        </argument>
        <argument>
          <name>TotalMatches</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable>
        </argument>
        <argument>
          <name>UpdateID</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_UpdateID</relatedStateVariable>
        </argument>
      </argumentList>
    </action>
  </actionList>
  <serviceStateTable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_ObjectID</name>
      <dataType>string</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_BrowseFlag</name>
      <dataType>string</dataType>
      <allowedValueList>
        <allowedValue>BrowseMetadata</allowedValue>
        <allowedValue>BrowseDirectChildren</allowedValue>
      </allowedValueList>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_Filter</name>
      <dataType>string</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_Index</name>
      <dataType>ui4</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_Count</name>
      <dataType>ui4</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_SortCriteria</name>
      <dataType>string</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>A_ARG_TYPE_Result</name>
      <dataType>string</dataType>
    </stateVariable>
    <stateVariable sendEvents="yes">
      <name>A_ARG_TYPE_UpdateID</name>
      <dataType>ui4</dataType>
    </stateVariable>
  </serviceStateTable>
</scpd>`;

  res.set('Content-Type', 'application/xml');
  res.send(serviceXml);
});

// Handle content directory control requests
router.post('/contentdirectory/control', (req, res) => {
  // Basic SOAP response for content directory requests
  const soapResponse = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <Result>&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"&gt;&lt;/DIDL-Lite&gt;</Result>
      <NumberReturned>0</NumberReturned>
      <TotalMatches>0</TotalMatches>
      <UpdateID>0</UpdateID>
    </u:BrowseResponse>
  </s:Body>
</s:Envelope>`;

  res.set('Content-Type', 'text/xml');
  res.send(soapResponse);
});

// Status endpoint for monitoring
router.get('/status', (req, res) => {
  try {
    const ssdpStatus = ssdpService.getStatus();
    const activeStreams = streamManager.getActiveStreams();
    
    res.json({
      ssdp: ssdpStatus,
      streams: {
        active: activeStreams.length,
        maximum: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10,
        sessions: activeStreams
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Status endpoint error:', error);
    res.status(500).json({ error: 'Status request failed' });
  }
});

module.exports = router;
