# Plex Tuner Rescan Functionality Fix

## Issue Description

When adding new channels in PlexBridge and clicking the "Rescan" button on the tuner settings in Plex, users were experiencing a "Request failed with status code 500" error. This prevented Plex from discovering newly added channels.

## Root Cause Analysis

The issue was caused by a missing HDHomeRun emulation endpoint that Plex specifically uses during channel rescans:

- **Missing Endpoint**: `POST /lineup.post`
- **Plex Behavior**: When users click "Rescan" in Plex's tuner settings, Plex sends a POST request to `/lineup.post` to trigger a channel lineup refresh
- **Previous State**: PlexBridge only had `GET /lineup.json` but not the POST variant
- **Result**: 404 Not Found error, which Plex interpreted as a 500 error

## HDHomeRun Protocol Requirements

According to HDHomeRun documentation, network tuners must implement both:

1. **GET /lineup.json** - Returns the current channel lineup
2. **POST /lineup.post** - Triggers a channel scan and returns the updated lineup

## Solution Implemented

Added the missing `POST /lineup.post` endpoint to `/server/routes/ssdp.js`:

```javascript
// Channel lineup scan endpoint - Used by Plex for rescan functionality
router.post('/lineup.post', async (req, res) => {
  try {
    logger.info('Plex channel rescan triggered', { userAgent: req.get('User-Agent') });
    
    // Plex uses this endpoint to trigger a channel scan
    // We return the current lineup immediately since we're always "scanned"
    const channels = await database.all(`
      SELECT c.*, s.url, s.type 
      FROM channels c 
      LEFT JOIN streams s ON c.id = s.channel_id 
      WHERE c.enabled = 1 AND s.enabled = 1
      ORDER BY c.number
    `);

    // Generate proper channel lineup with correct URLs and EPG information
    const lineup = channels.map(channel => ({
      GuideNumber: channel.number.toString(),
      GuideName: channel.name,
      URL: `${baseURL}/stream/${channel.id}`,
      HD: 1,
      DRM: 0,
      Favorite: 0,
      EPGAvailable: true,
      EPGSource: `${baseURL}/epg/xmltv.xml`,
      EPGURL: `${baseURL}/epg/xmltv.xml`,
      GuideURL: `${baseURL}/epg/xmltv/${channel.id}`,
      EPGChannelID: channel.epg_id || channel.id
    }));

    logger.info('Channel rescan completed', { 
      channelCount: lineup.length,
      userAgent: req.get('User-Agent')
    });

    res.json(lineup);
  } catch (error) {
    logger.error('Channel lineup scan error:', error);
    res.status(500).json({ error: 'Channel scan failed' });
  }
});
```

## Key Features of the Fix

### 1. **Proper Request Handling**
- Accepts POST requests to `/lineup.post`
- Logs rescan activities for debugging
- Returns JSON response expected by Plex

### 2. **Dynamic Channel Detection**
- Queries database for current enabled channels and streams
- Returns real-time channel lineup
- Includes newly added channels immediately

### 3. **HDHomeRun Compatibility**
- Returns same format as `GET /lineup.json`
- Includes all required HDHomeRun fields
- Maintains EPG integration

### 4. **Network Configuration**
- Uses advertised host from environment/settings
- Handles port configuration correctly
- Supports Docker networking

## Testing the Fix

### 1. **Manual API Test**
```bash
# Test the rescan endpoint
curl -X POST http://localhost:3000/lineup.post

# Should return JSON array of channels
```

### 2. **Add Channel and Rescan Test**
```bash
# Add a new channel
curl -X POST http://localhost:3000/api/channels \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Channel", "number": 500, "enabled": true}'

# Add a stream for the channel
curl -X POST http://localhost:3000/api/streams \
  -H "Content-Type: application/json" \
  -d '{"channel_id": "CHANNEL_ID", "name": "Test Stream", "url": "http://example.com/stream.m3u8", "type": "hls", "enabled": true}'

# Trigger rescan
curl -X POST http://localhost:3000/lineup.post

# Verify new channel appears in lineup
```

### 3. **Log Verification**
```bash
# Check logs for rescan activity
docker logs plextv | grep -i rescan

# Should show:
# "Plex channel rescan triggered"
# "Channel rescan completed"
```

## Plex Integration Workflow

### Before Fix:
1. User adds channel in PlexBridge ✅
2. User clicks "Rescan" in Plex ❌ (500 Error)
3. New channels not detected ❌

### After Fix:
1. User adds channel in PlexBridge ✅
2. User clicks "Rescan" in Plex ✅ (POST /lineup.post)
3. PlexBridge returns updated lineup ✅
4. Plex detects new channels ✅

## Related Endpoints

The fix complements these existing HDHomeRun emulation endpoints:

- **GET /discover.json** - Device discovery
- **GET /device.xml** - Device description
- **GET /lineup.json** - Current channel lineup
- **GET /lineup_status.json** - Tuner status
- **POST /lineup.post** - Channel rescan (NEW)

## Error Handling

The endpoint includes comprehensive error handling:

- **Database Errors**: Caught and logged with 500 response
- **Network Issues**: Handled by advertised host detection
- **Empty Lineups**: Returns empty array (valid response)
- **Logging**: All requests and responses logged for debugging

## Deployment

The fix is included in the Docker image and requires no additional configuration. It automatically:

- Uses existing channel/stream data
- Respects enabled/disabled status
- Applies current network settings
- Maintains EPG integration

## Validation

After deployment, verify the fix works by:

1. **Adding a channel** in PlexBridge web interface
2. **Going to Plex Settings** → Live TV & DVR
3. **Clicking the tuner device** to view settings
4. **Clicking "Rescan"** button
5. **Verifying new channel appears** in Plex's channel list

The rescan should complete without errors and new channels should be available for viewing and recording in Plex.