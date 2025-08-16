# PlexBridge API Documentation

## API Overview

PlexBridge provides a comprehensive REST API for managing channels, streams, EPG data, and system configuration. The API follows RESTful conventions with full input validation and structured error responses.

**Base URL**: `http://localhost:8080`  
**Content-Type**: `application/json`  
**Rate Limiting**: 1000 requests per 15 minutes per IP address  
**Validation**: Joi schema validation on all inputs  
**Caching**: Redis-backed response caching with automatic invalidation

## Authentication & Security

- **Rate Limiting**: 1000 requests per 15-minute window per IP address
- **Input Validation**: All request bodies validated using Joi schemas
- **CORS Policy**: Configurable cross-origin resource sharing
- **Security Headers**: Helmet.js middleware for security headers
- **Error Sanitization**: Sensitive information filtered from error responses

## API Endpoints

### 1. Channel Management

#### GET /api/channels
Retrieve all channels with stream statistics and ordering by channel number.

**Query Parameters**: None

**Response**:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "CNN HD",
    "number": 101,
    "enabled": 1,
    "logo": "https://example.com/cnn-logo.png",
    "epg_id": "cnn.us",
    "stream_count": 2,
    "has_active_stream": 1,
    "created_at": "2024-01-15T12:00:00.000Z",
    "updated_at": "2024-01-15T12:00:00.000Z"
  }
]
```

**Features**:
- Results ordered by channel number
- Includes stream count and active stream status
- Automatic cache invalidation on changes

#### GET /api/channels/:id
Retrieve a specific channel with associated streams.

**Parameters**:
- `id` (path, required): Channel UUID

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "CNN HD", 
  "number": 101,
  "enabled": 1,
  "logo": "https://example.com/cnn-logo.png",
  "epg_id": "cnn.us",
  "stream_count": 2,
  "streams": [
    {
      "id": "stream-uuid-here",
      "channel_id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "CNN Primary Stream",
      "url": "https://cnn-live.example.com/playlist.m3u8",
      "type": "hls",
      "backup_urls": "[]",
      "auth_username": null,
      "auth_password": null,
      "headers": "{}",
      "protocol_options": "{}",
      "enabled": 1,
      "created_at": "2024-01-15T12:00:00.000Z",
      "updated_at": "2024-01-15T12:00:00.000Z"
    }
  ]
}
```

**Error Responses**:
- `404` - Channel not found

#### POST /api/channels
Create a new channel with full validation.

**Request Body**:
```json
{
  "name": "BBC News HD",
  "number": 102,
  "enabled": true,
  "logo": "https://example.com/bbc-logo.png",
  "epg_id": "bbc.uk"
}
```

**Validation Schema**:
```javascript
{
  "name": "string, required, max 255 characters",
  "number": "integer, required, 1-9999, unique",
  "enabled": "boolean, default true",
  "logo": "string/null, max 500 characters, valid URI",
  "epg_id": "string/null, max 255 characters"
}
```

**Response** (201 Created):
```json
{
  "id": "generated-uuid",
  "name": "BBC News HD",
  "number": 102,
  "enabled": 1,
  "logo": "https://example.com/bbc-logo.png",
  "epg_id": "bbc.uk",
  "created_at": "2024-01-15T12:30:00.000Z",
  "updated_at": "2024-01-15T12:30:00.000Z"
}
```

**Error Responses**:
- `400` - Validation error or channel number already exists

#### PUT /api/channels/:id
Update an existing channel.

**Parameters**:
- `id` (path, required): Channel UUID

**Request Body**: Same validation as POST endpoint

**Response**: Updated channel object

**Features**:
- Automatic cache invalidation (`lineup:channels`)
- Structured logging of changes
- Unique constraint validation on channel number

#### DELETE /api/channels/:id
Delete a channel and cascade delete associated streams.

**Parameters**:
- `id` (path, required): Channel UUID

**Response**:
```json
{
  "message": "Channel deleted successfully"
}
```

**Features**:
- Cascades to delete associated streams
- Cache invalidation
- Returns 404 if channel doesn't exist

### 2. Stream Management

#### GET /api/streams
Retrieve all streams with channel information.

**Response**:
```json
[
  {
    "id": "stream-uuid",
    "channel_id": "channel-uuid",
    "name": "CNN Primary Stream",
    "url": "https://cnn.example.com/playlist.m3u8",
    "type": "hls",
    "backup_urls": ["https://backup.cnn.com/stream.m3u8"],
    "auth_username": null,
    "auth_password": null,
    "headers": {},
    "protocol_options": {},
    "enabled": 1,
    "channel_name": "CNN HD",
    "channel_number": 101,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

#### GET /api/streams/:id
Retrieve a specific stream with parsed JSON fields.

**Parameters**:
- `id` (path): Stream UUID

**Response**: Single stream object with parsed arrays/objects

#### POST /api/streams
Create a new stream.

**Request Body**:
```json
{
  "channel_id": "channel-uuid",
  "name": "CNN Primary Stream",
  "url": "https://cnn.example.com/playlist.m3u8",
  "type": "hls",
  "backup_urls": ["https://backup.cnn.com/stream.m3u8"],
  "auth_username": "user",
  "auth_password": "password",
  "headers": {
    "User-Agent": "PlexTV/1.0",
    "Referer": "https://example.com"
  },
  "protocol_options": {
    "timeout": 30000,
    "retries": 3
  },
  "enabled": true
}
```

**Validation Rules**:
- `channel_id`: Required, must reference existing channel
- `name`: Required, max 255 characters
- `url`: Required, valid URI
- `type`: Required, one of: hls, dash, rtsp, rtmp, udp, http, mms, srt
- `backup_urls`: Optional array of valid URIs
- `auth_username/auth_password`: Optional, max 255 characters
- `headers`: Optional object
- `protocol_options`: Optional object
- `enabled`: Boolean, default true

#### PUT /api/streams/:id
Update an existing stream.

**Parameters**:
- `id` (path): Stream UUID

**Request Body**: Same as POST

#### DELETE /api/streams/:id
Delete a stream.

**Parameters**:
- `id` (path): Stream UUID

### 3. EPG Management

#### GET /api/epg
Retrieve EPG data for channels.

**Query Parameters**:
- `start` (optional): ISO 8601 start time, default: now
- `end` (optional): ISO 8601 end time, default: 24 hours from now
- `channel_id` (optional): Filter by specific channel UUID

**Response**:
```json
{
  "start": "2024-01-01T00:00:00.000Z",
  "end": "2024-01-02T00:00:00.000Z",
  "programs": [
    {
      "id": "program-id",
      "channel_id": "channel-uuid",
      "title": "Evening News",
      "description": "Daily news program covering current events",
      "start_time": "2024-01-01T18:00:00.000Z",
      "end_time": "2024-01-01T19:00:00.000Z",
      "category": "News",
      "episode_number": 5,
      "season_number": 2024,
      "channel_name": "CNN HD",
      "channel_number": 101
    }
  ]
}
```

#### POST /api/epg/refresh
Force refresh EPG data.

**Request Body**:
```json
{
  "source_id": "epg-source-uuid"  // Optional: refresh specific source
}
```

**Response**:
```json
{
  "message": "EPG refresh started for source {source_id}"
}
```

#### GET /api/epg/sources
Retrieve all EPG sources.

**Response**:
```json
[
  {
    "id": "source-uuid",
    "name": "Primary EPG Source",
    "url": "https://epg.example.com/xmltv.xml",
    "refresh_interval": "4h",
    "last_refresh": "2024-01-01T00:00:00.000Z",
    "last_success": "2024-01-01T00:00:00.000Z",
    "enabled": 1,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

#### POST /api/epg/sources
Create a new EPG source.

**Request Body**:
```json
{
  "name": "TV Guide Source",
  "url": "https://epg.example.com/guide.xml",
  "refresh_interval": "6h",
  "enabled": true
}
```

**Validation Rules**:
- `name`: Required, max 255 characters
- `url`: Required, valid URI
- `refresh_interval`: Pattern /^\d+[hmd]$/, default "4h"
- `enabled`: Boolean, default true

#### DELETE /api/epg/sources/:id
Delete an EPG source and associated programs.

### 4. System Metrics

#### GET /api/metrics
Retrieve comprehensive system metrics.

**Response**:
```json
{
  "system": {
    "uptime": 86400,
    "memory": {
      "rss": 134217728,
      "heapTotal": 67108864,
      "heapUsed": 33554432,
      "external": 1048576
    },
    "cpu": {
      "user": 123456,
      "system": 78901
    },
    "platform": "linux",
    "nodeVersion": "v18.19.0"
  },
  "streams": {
    "active": 3,
    "maximum": 10,
    "utilization": 30
  },
  "database": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "cache": {
    "status": "healthy",
    "type": "RedisService",
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "epg": {
    "sources": [
      {
        "id": "source-uuid",
        "name": "Primary Source",
        "enabled": true,
        "lastRefresh": "2024-01-01T00:00:00.000Z",
        "lastSuccess": "2024-01-01T00:00:00.000Z"
      }
    ],
    "programs": {
      "total": 15432,
      "upcoming24h": 1234
    },
    "isInitialized": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### GET /api/logs
Retrieve application logs (placeholder endpoint).

**Query Parameters**:
- `level` (optional): Filter by log level
- `limit` (optional): Number of entries, default 100
- `offset` (optional): Pagination offset, default 0

### 5. Settings Management

#### GET /api/settings
Retrieve all application settings.

**Response**:
```json
{
  "maxConcurrentStreams": 10,
  "epgRefreshInterval": "4h",
  "enableTranscoding": true,
  "logLevel": "info"
}
```

#### PUT /api/settings
Update application settings.

**Request Body**: Object with setting key-value pairs
```json
{
  "maxConcurrentStreams": 15,
  "logLevel": "debug"
}
```

## Stream Endpoints

### GET /stream/:channelId
Proxy live stream for Plex consumption.

**Parameters**:
- `channelId` (path): Channel UUID

**Response**: Binary stream data (video/mp2t)

**Behavior**:
1. Validates channel and stream configuration
2. Attempts primary stream URL
3. Falls back to backup URLs if configured
4. Proxies stream through FFmpeg if needed
5. Handles authentication and headers
6. Provides error recovery and reconnection

### GET /preview/:streamId
Generate short preview of stream for testing.

**Parameters**:
- `streamId` (path): Stream UUID

**Response**: Binary stream data (30-second preview)

### POST /validate
Validate stream URL and detect format.

**Request Body**:
```json
{
  "url": "https://stream.example.com/playlist.m3u8",
  "type": "hls",
  "auth": {
    "username": "user",
    "password": "pass"
  },
  "headers": {}
}
```

**Response**:
```json
{
  "valid": true,
  "type": "hls",
  "info": {
    "duration": 6,
    "segments": 3,
    "playlists": 1,
    "isLive": true
  }
}
```

### POST /validate-bulk
Validate multiple streams simultaneously.

**Request Body**:
```json
{
  "streams": [
    {
      "url": "https://stream1.example.com/playlist.m3u8",
      "type": "hls"
    },
    {
      "url": "rtsp://stream2.example.com/live",
      "type": "rtsp"
    }
  ]
}
```

**Response**:
```json
{
  "results": [
    {
      "index": 0,
      "url": "https://stream1.example.com/playlist.m3u8",
      "valid": true,
      "type": "hls"
    },
    {
      "index": 1,
      "url": "rtsp://stream2.example.com/live", 
      "valid": false,
      "error": "Connection timeout"
    }
  ]
}
```

### GET /stream/active
Get list of currently active streams.

**Response**:
```json
{
  "count": 2,
  "maximum": 10,
  "streams": [
    {
      "sessionId": "session-uuid",
      "streamId": "stream-uuid",
      "clientIP": "192.168.1.50",
      "startTime": "2024-01-01T18:00:00.000Z",
      "duration": 300000,
      "bytesTransferred": 52428800
    }
  ]
}
```

## HDHomeRun Emulation Endpoints

### GET /discover.json
HDHomeRun discovery response for Plex.

**Response**:
```json
{
  "FriendlyName": "PlexTV",
  "Manufacturer": "PlexTV",
  "ModelNumber": "1.0",
  "FirmwareName": "PlexTV Bridge",
  "TunerCount": 10,
  "DeviceID": "12345678",
  "DeviceAuth": "test1234",
  "BaseURL": "http://192.168.1.100:8080",
  "LineupURL": "http://192.168.1.100:8080/lineup.json"
}
```

### GET /lineup.json
Channel lineup for Plex tuner setup.

**Response**:
```json
[
  {
    "GuideNumber": "101",
    "GuideName": "CNN HD",
    "URL": "http://192.168.1.100:8080/stream/channel-uuid",
    "HD": 1,
    "DRM": 0,
    "Favorite": 0
  }
]
```

### GET /lineup_status.json
Tuner status information.

**Response**:
```json
{
  "ScanInProgress": 0,
  "ScanPossible": 1,
  "Source": "Cable",
  "SourceList": ["Cable"]
}
```

### GET /device.xml
UPnP device description.

**Response**: XML device description compatible with UPnP specifications

## EPG Endpoints

### GET /epg/xmltv/:channelId?
Export EPG data in XMLTV format.

**Parameters**:
- `channelId` (path, optional): Specific channel UUID
- `days` (query, optional): Number of days, default 3

**Response**: XML in XMLTV format

### GET /epg/json/:channelId?
Export EPG data in JSON format.

**Parameters**: Same as XMLTV endpoint

### GET /epg/now/:channelId
Get current program for channel.

### GET /epg/next/:channelId
Get next program for channel.

### GET /epg/search
Search EPG programs.

**Query Parameters**:
- `q`: Search query (required)
- `channel_id`: Filter by channel
- `start`: Start time filter
- `end`: End time filter
- `limit`: Result limit (default 50)

### GET /epg/grid
Get EPG grid data for time range.

**Query Parameters**:
- `start`: Start time (default: now)
- `end`: End time (default: 4 hours from now)
- `channels`: Comma-separated channel IDs

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "details": ["Detailed validation errors"],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**HTTP Status Codes**:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Rate Limiting

Rate limiting is applied per IP address:
- **API endpoints**: 1000 requests per 15 minutes
- **Stream endpoints**: No rate limiting (streaming data)
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## WebSocket API

Real-time updates via Socket.IO:

### Events
- `join-logs`: Subscribe to log updates
- `join-metrics`: Subscribe to metric updates
- `stream-started`: Stream session started
- `stream-ended`: Stream session ended
- `epg-updated`: EPG data refreshed

### Usage
```javascript
const socket = io('http://localhost:8080');

socket.emit('join-metrics');
socket.on('metrics-update', (data) => {
  console.log('Updated metrics:', data);
});
```

This API documentation provides complete coverage of all PlexTV endpoints, enabling full integration and management of the IPTV bridge functionality.
