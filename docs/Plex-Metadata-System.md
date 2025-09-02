# Plex Metadata System Documentation

## Table of Contents
1. [Overview](#overview)
2. [The Metadata Problem](#the-metadata-problem)
3. [Solution Architecture](#solution-architecture)
4. [Endpoint Details](#endpoint-details)
5. [Implementation Details](#implementation-details)
6. [Error Prevention](#error-prevention)
7. [Testing and Validation](#testing-and-validation)

## Overview

PlexBridge implements a comprehensive metadata handling system to ensure compatibility with Plex Media Server's Live TV functionality. This system prevents stream crashes by providing complete metadata responses for all Plex requests, even when the underlying data doesn't exist.

### Key Principles
- **Always Respond**: Never return 404 or error for metadata requests
- **Complete Structures**: Provide full metadata hierarchy (Video→Media→Part→Stream)
- **Fallback Safety**: Use intelligent defaults when real data unavailable
- **Session Persistence**: Maintain consumer sessions across multiple requests

## The Metadata Problem

### Common Plex Errors (Before Fix)
```
Sep 02, 2025 16:50:56.266 [139710792518456] Error — downloadContainer: expected MediaContainer element, found html
Sep 02, 2025 16:50:56.452 [139710784916280] Error — Unable to find title for item of type 5
Sep 02, 2025 17:03:08.237 [139710790409016] Warning — Failed to find consumer
Sep 02, 2025 17:12:53.813 [139710833457976] Warning — Timeline: Unknown metadata item 18961
```

### Root Causes
1. **HTML Instead of JSON**: Endpoints returning error pages instead of JSON
2. **Wrong Metadata Types**: Using type 5 instead of expected type 1 (episode)
3. **Missing Consumers**: Session management not persisting across requests
4. **Unknown Metadata Items**: Plex requesting metadata for non-existent IDs

## Solution Architecture

### Metadata Response Hierarchy
```
PlexBridge Metadata System
    │
    ├── Discovery Layer
    │   ├── /discover.json (Device capabilities)
    │   ├── /device.xml (UPnP description)
    │   └── /lineup.json (Channel listing)
    │
    ├── Metadata Layer
    │   ├── /library/metadata/{id} (Full metadata)
    │   ├── /timeline/{id} (Playback timeline)
    │   └── /library/metadata/{id}/{type} (Thumbnails)
    │
    └── Session Layer
        ├── /consumer/{sessionId}/{action} (Consumer tracking)
        ├── /live/{sessionId}/status (Live TV status)
        └── Session persistence across requests
```

## Endpoint Details

### 1. Channel Lineup (`/lineup.json`)
Provides HDHomeRun-compatible channel listing.

**Response Structure:**
```json
[
  {
    "GuideNumber": "101",
    "GuideName": "CNN HD",
    "VideoCodec": "MPEG2",
    "AudioCodec": "AC3",
    "URL": "http://192.168.4.5:3000/stream/123"
  }
]
```

**Key Points:**
- Simple HDHomeRun format (not complex Plex metadata)
- Uses MPEG2/AC3 codecs for maximum compatibility
- Direct stream URLs without additional metadata

### 2. Metadata Endpoint (`/library/metadata/:metadataId`)
Provides complete metadata for any requested ID.

**Response Structure:**
```json
{
  "MediaContainer": {
    "size": 1,
    "identifier": "com.plexapp.plugins.library",
    "Video": [{
      "ratingKey": "18961",
      "key": "/library/metadata/18961",
      "type": "episode",  // CRITICAL: Must be "episode" not type 5
      "title": "Channel Name",
      "duration": 86400000,  // 24 hours for live TV
      "live": 1,
      "Media": [{
        "container": "mpegts",
        "Part": [{
          "key": "/stream/channelId",
          "Stream": [
            {
              "streamType": 1,  // Video
              "codec": "h264",
              "width": 1920,
              "height": 1080
            },
            {
              "streamType": 2,  // Audio
              "codec": "aac",
              "channels": 2
            }
          ]
        }]
      }]
    }]
  }
}
```

**Critical Fields:**
- `type: "episode"` - MUST be "episode" for Live TV
- `live: 1` - Indicates live content
- `duration: 86400000` - 24-hour duration prevents completion errors
- Complete `Media→Part→Stream` hierarchy for playback decisions

### 3. Timeline Endpoint (`/timeline/:itemId`)
Provides playback timeline information.

**Response Structure:**
```json
{
  "MediaContainer": {
    "Timeline": [{
      "state": "playing",
      "type": "video",
      "itemType": "episode",
      "ratingKey": "18961",
      "duration": 86400000,
      "seekRange": "0-86400000",
      "playMethod": "directplay",
      "hasMDE": 1,
      "protocol": "http"
    }]
  }
}
```

**Key Fields:**
- `duration` - Prevents "using default completion duration multiplier"
- `seekRange` - Defines seekable range for live content
- `playMethod: "directplay"` - Indicates no transcoding needed
- `hasMDE: 1` - Media Decision Engine flag

### 4. Consumer Tracking (`/consumer/:sessionId/:action`)
Maintains streaming session persistence.

**Response Structure:**
```json
{
  "success": true,
  "sessionId": "555f3447-93fc-4134-8331-a12cbda9c2cf",
  "status": "active",
  "consumer": {
    "state": "active",
    "available": true
  }
}
```

**Purpose:**
- Prevents "Failed to find consumer" errors
- Always returns success to maintain session
- Tracks session across multiple Plex requests

### 5. Live Status (`/live/:sessionId/status`)
Reports live TV streaming status.

**Response Structure:**
```json
{
  "sessionId": "sessionId",
  "status": "streaming",
  "consumer": {
    "id": "sessionId",
    "state": "active",
    "available": true
  },
  "instance": {
    "available": true,
    "ready": true
  }
}
```

## Implementation Details

### Error Handling Strategy
```javascript
// Always return valid JSON, never HTML
res.set({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-cache'
});

// On error, return minimal valid structure
res.status(200).json({
  MediaContainer: { size: 0 }
});
```

### Metadata Type Mapping
```javascript
// Plex metadata types
const METADATA_TYPES = {
  MOVIE: 1,
  SHOW: 2,
  SEASON: 3,
  EPISODE: 4,
  TRAILER: 5,  // NOT for Live TV!
  COMIC: 6,
  PERSON: 7,
  ARTIST: 8,
  ALBUM: 9,
  TRACK: 10,
  PHOTO: 11
};

// Live TV MUST use EPISODE type
const liveMetadata = {
  type: "episode",  // String representation
  metadata_type: METADATA_TYPES.EPISODE  // Numeric: 4
};
```

### Session Persistence
```javascript
// Consumer requests can come from multiple Plex components
// Always maintain session regardless of request pattern
const sessionRequests = [
  '/consumer/sessionId/start',
  '/consumer/sessionId/status',
  '/consumer/sessionId/stop',
  '/live/sessionId/status',
  '/timeline/metadataId'
];

// All must return success to prevent cascade failures
```

## Error Prevention

### Common Pitfalls and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "expected MediaContainer, found html" | Error page returned | Always set JSON content-type |
| "Unable to find title for item of type 5" | Wrong metadata type | Use type "episode" (4) for Live TV |
| "Failed to find consumer" | Session not found | Always return active consumer |
| "Unknown metadata item" | Missing metadata | Return valid defaults for any ID |
| "No part decision" | Missing Media structure | Include complete Media→Part→Stream |

### Defensive Programming
```javascript
// Always provide fallbacks
const channel = await database.get(...) || {
  name: `Channel ${channelId}`,
  description: "Live television programming"
};

// Never throw on metadata requests
try {
  // ... fetch real data
} catch (error) {
  // Return valid fallback
  return validDefaultMetadata;
}
```

## Testing and Validation

### Test with Plex Clients
1. **Web Browser**: http://plex.server:32400/web
2. **Android TV**: Plex app on Android TV device
3. **iOS/Android**: Mobile Plex apps
4. **Smart TV**: Native TV apps

### Validation Checklist
- [ ] Channels appear in Live TV & DVR section
- [ ] Channel selection doesn't cause errors
- [ ] Streams play without crashing
- [ ] No "Unknown metadata" warnings in Plex logs
- [ ] Consumer sessions persist across requests
- [ ] Timeline updates properly during playback

### Debug Logging
```javascript
// Enable debug logging for metadata requests
logger.debug('Plex metadata request', {
  metadataId,
  userAgent: req.get('User-Agent'),
  query: req.query
});
```

### Common User Agents
```
Plex Media Server: "PlexMediaServer/1.32.5.7349"
Android TV: "Plex for Android TV/10.0.0.123"
Web Player: "Mozilla/5.0 ... Plex Web"
Transcoder: "Lavf/58.29.100" (FFmpeg from Plex)
```

## Troubleshooting

### If Streams Still Crash
1. Check Plex Media Server logs: `/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Logs/`
2. Look for specific error codes and metadata IDs
3. Verify all endpoints return JSON (never HTML)
4. Ensure metadata type is "episode" not 5
5. Confirm Media→Part→Stream hierarchy complete

### Testing Endpoints
```bash
# Test lineup
curl http://plexbridge:3000/lineup.json

# Test metadata
curl http://plexbridge:3000/library/metadata/18961

# Test timeline
curl http://plexbridge:3000/timeline/18961

# Test consumer
curl http://plexbridge:3000/consumer/test-session/status
```

## Conclusion

The PlexBridge metadata system ensures reliable Live TV streaming by:
1. Always responding with valid JSON structures
2. Using correct metadata types for Live TV (episode, not trailer)
3. Maintaining consumer sessions across requests
4. Providing complete metadata hierarchy for playback decisions
5. Falling back gracefully when real data unavailable

This defensive approach prevents the cascade of errors that previously caused stream crashes, ensuring a stable viewing experience across all Plex clients.