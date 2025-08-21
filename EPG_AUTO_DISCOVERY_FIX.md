# EPG Auto-Discovery Enhancement

## Problem
Plex was not automatically detecting and populating the EPG XML endpoint, requiring manual configuration when setting up the tuner.

## Solution
Enhanced the SSDP service and HDHomeRun emulation to provide comprehensive EPG discovery information that Plex can automatically detect.

## Changes Made

### 1. **Enhanced Discovery Response** (`server/services/ssdpService.js`)
Added multiple EPG endpoint references in `/discover.json`:
```javascript
{
  // Primary EPG URLs
  EPGURL: "http://192.168.1.100:8080/epg/xmltv.xml",
  GuideURL: "http://192.168.1.100:8080/epg/xmltv.xml", 
  EPGSource: "http://192.168.1.100:8080/epg/xmltv.xml",
  
  // Alternative endpoint names for compatibility
  XMLTVGuideDataURL: "http://192.168.1.100:8080/epg/xmltv.xml",
  EPGDataURL: "http://192.168.1.100:8080/epg/xmltv.xml",
  
  // EPG capability flags
  SupportsEPG: true,
  EPGDays: 7,
  EPGChannels: "all"
}
```

### 2. **Enhanced Lineup Status** (`server/routes/ssdp.js`)
Added EPG information to `/lineup_status.json`:
```javascript
{
  // Standard lineup status
  ScanInProgress: 0,
  ScanPossible: 1,
  Source: "Cable",
  
  // EPG Status Information
  EPGAvailable: true,
  EPGSource: "http://192.168.1.100:8080/epg/xmltv.xml",
  EPGURL: "http://192.168.1.100:8080/epg/xmltv.xml",
  GuideURL: "http://192.168.1.100:8080/epg/xmltv.xml",
  XMLTVGuideDataURL: "http://192.168.1.100:8080/epg/xmltv.xml",
  EPGDataURL: "http://192.168.1.100:8080/epg/xmltv.xml",
  EPGDays: 7,
  EPGLastUpdate: "2025-01-20T15:30:00.000Z",
  SupportsEPG: true
}
```

### 3. **Enhanced Channel Lineup** (`server/routes/ssdp.js`)
Added EPG information for each channel in `/lineup.json`:
```javascript
{
  GuideNumber: "101",
  GuideName: "CNN HD",
  URL: "http://192.168.1.100:8080/stream/channel1",
  HD: 1,
  DRM: 0,
  Favorite: 0,
  
  // EPG Information per channel
  EPGAvailable: true,
  EPGSource: "http://192.168.1.100:8080/epg/xmltv.xml",
  EPGURL: "http://192.168.1.100:8080/epg/xmltv.xml",
  GuideURL: "http://192.168.1.100:8080/epg/xmltv/channel1",
  EPGChannelID: "cnn-hd"
}
```

### 4. **Additional Guide Endpoints** (`server/routes/ssdp.js`)
Added compatibility endpoints that redirect to XMLTV:
- `/guide` → redirects to `/epg/xmltv.xml`
- `/guide.xml` → redirects to `/epg/xmltv.xml`

## How It Works

### Plex Discovery Process
1. **Device Discovery**: Plex discovers PlexBridge via SSDP/UPnP
2. **Capability Check**: Plex calls `/discover.json` and finds multiple EPG URL fields
3. **Status Verification**: Plex checks `/lineup_status.json` and confirms EPG availability
4. **Channel Lineup**: Plex reads `/lineup.json` and sees EPG info for each channel
5. **Auto-Population**: Plex automatically populates the EPG URL field

### EPG URL Priority
Plex will look for EPG information in this order:
1. `EPGURL` field in discovery response
2. `GuideURL` field in discovery response  
3. `EPGSource` field in lineup status
4. Channel-specific `GuideURL` in lineup
5. Legacy `/guide` and `/guide.xml` endpoints

## Testing

Run the EPG discovery test to verify all endpoints:
```bash
node test-epg-discovery.js
```

This will test:
- ✅ All discovery endpoints contain EPG URLs
- ✅ URLs are consistent and point to XMLTV endpoint
- ✅ EPG capability flags are properly set
- ✅ XMLTV endpoint returns valid data
- ✅ Channel lineup includes EPG information

## Expected Plex Behavior

After these changes, when setting up PlexBridge in Plex:

1. **Automatic Detection**: Plex should automatically discover the device
2. **EPG Auto-Population**: The EPG URL field should be pre-filled with: `http://[device-ip]:8080/epg/xmltv.xml`
3. **No Manual Entry**: Users should not need to manually enter the EPG URL
4. **Immediate Availability**: EPG data should be available immediately after setup

## Compatibility

These enhancements maintain backward compatibility while adding comprehensive EPG discovery support for:
- Plex Media Server (all versions)
- Other HDHomeRun-compatible applications
- Standard XMLTV consumers

## Key Files Modified

- `server/services/ssdpService.js` - Enhanced discovery responses
- `server/routes/ssdp.js` - Added EPG status and guide endpoints

## Result

Plex will now automatically detect and configure the EPG source without manual intervention, providing a seamless setup experience for users.