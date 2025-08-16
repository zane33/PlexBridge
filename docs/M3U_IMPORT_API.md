# M3U Import API Documentation

## Overview

The PlexBridge M3U Import API provides comprehensive functionality for importing M3U/M3U8 playlists with proper parsing, validation, and security measures. This replaces the previous basic implementation with production-ready functionality.

## Key Features

- **Comprehensive M3U Parsing**: Supports EXTINF, EXTGRP, EXTVLCOPT, KODIPROP tags
- **Security**: URL validation, private IP blocking, content-type validation
- **Authentication**: HTTP Basic Auth support for protected playlists
- **Validation**: Optional stream URL validation with configurable batching
- **Error Handling**: Detailed error reporting and logging
- **Database Transactions**: Atomic operations for data integrity
- **Channel Management**: Smart channel numbering with conflict resolution

## API Endpoints

### 1. Import M3U Playlist
**POST** `/api/streams/import`

Imports an M3U playlist with options for preview or automatic creation.

#### Request Body
```json
{
  "url": "https://example.com/playlist.m3u",
  "auth_username": "username",
  "auth_password": "password",
  "auto_create_channels": false,
  "validation_options": {
    "validate_urls": false,
    "validation_timeout": 10000,
    "validation_batch_size": 5,
    "skip_invalid_channels": true
  },
  "import_options": {
    "channel_number_start": 1000,
    "overwrite_existing_numbers": false,
    "group_prefix": "IPTV",
    "default_group": "Imported",
    "preserve_channel_numbers": true,
    "enable_imported_channels": true
  },
  "headers": {
    "Referer": "https://example.com"
  },
  "user_agent": "Custom User Agent"
}
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | HTTP/HTTPS URL to M3U playlist |
| `auth_username` | string | No | Username for HTTP Basic Auth |
| `auth_password` | string | No | Password for HTTP Basic Auth |
| `auto_create_channels` | boolean | No | Create channels automatically (default: false) |
| `headers` | object | No | Additional HTTP headers |
| `user_agent` | string | No | Custom User-Agent header |

##### Validation Options
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `validate_urls` | boolean | false | Validate each stream URL |
| `validation_timeout` | number | 10000 | Timeout per URL validation (ms) |
| `validation_batch_size` | number | 5 | Concurrent validations |
| `skip_invalid_channels` | boolean | true | Skip channels with invalid URLs |

##### Import Options
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `channel_number_start` | number | auto | Starting channel number |
| `overwrite_existing_numbers` | boolean | false | Overwrite existing channel numbers |
| `group_prefix` | string | null | Prefix for channel groups |
| `default_group` | string | "Imported" | Default group for channels without groups |
| `preserve_channel_numbers` | boolean | true | Use original channel numbers when possible |
| `enable_imported_channels` | boolean | true | Enable channels after import |

#### Response (Preview Mode)
```json
{
  "success": true,
  "duration": 1234,
  "source": "https://example.com/playlist.m3u",
  "type": "preview",
  "channelsFound": 150,
  "channelsToImport": 145,
  "channels": [
    {
      "name": "Channel 1",
      "originalName": "Channel 1",
      "number": 1001,
      "originalNumber": 1,
      "url": "https://stream.example.com/channel1.m3u8",
      "type": "hls",
      "group": "Entertainment",
      "logo": "https://example.com/logo1.png",
      "epgId": "channel1.example.com",
      "isValid": true
    }
  ],
  "conflicts": [
    {
      "channel": "Channel 5",
      "originalNumber": 5,
      "reason": "Number already exists"
    }
  ],
  "statistics": {
    "total": 150,
    "startingNumber": 1001,
    "endingNumber": 1150,
    "conflicts": 1
  },
  "recommendations": [
    {
      "type": "warning",
      "message": "5 channels failed validation",
      "suggestion": "Invalid channels will be skipped during import"
    }
  ]
}
```

#### Response (Auto-Create Mode)
```json
{
  "success": true,
  "duration": 5678,
  "source": "https://example.com/playlist.m3u",
  "type": "import",
  "channelsCreated": 145,
  "streamsCreated": 145,
  "channels": [
    {
      "id": "uuid-1",
      "name": "Channel 1",
      "number": 1001,
      "originalNumber": 1,
      "group": "Entertainment",
      "logo": "https://example.com/logo1.png",
      "epgId": "channel1.example.com"
    }
  ],
  "streams": [
    {
      "id": "uuid-stream-1",
      "channel_id": "uuid-1",
      "name": "Channel 1 Stream",
      "url": "https://stream.example.com/channel1.m3u8",
      "type": "hls"
    }
  ],
  "errors": [],
  "conflicts": [],
  "statistics": {
    "byType": {
      "hls": 120,
      "rtsp": 25
    },
    "byGroup": {
      "Entertainment": 50,
      "News": 30,
      "Sports": 65
    },
    "withLogo": 140,
    "withEpgId": 145
  }
}
```

### 2. Validate M3U URL
**POST** `/api/streams/validate-m3u`

Validates an M3U URL without parsing the content.

#### Request Body
```json
{
  "url": "https://example.com/playlist.m3u",
  "auth_username": "username",
  "auth_password": "password"
}
```

#### Response
```json
{
  "valid": true,
  "url": "https://example.com/playlist.m3u",
  "contentType": "application/vnd.apple.mpegurl",
  "contentLength": "1048576",
  "lastModified": "Wed, 15 Aug 2024 12:00:00 GMT"
}
```

### 3. Get M3U Statistics
**POST** `/api/streams/m3u-stats`

Gets playlist statistics without importing.

#### Request Body
```json
{
  "url": "https://example.com/playlist.m3u",
  "auth_username": "username",
  "auth_password": "password"
}
```

#### Response
```json
{
  "success": true,
  "statistics": {
    "total": 150,
    "byType": {
      "hls": 120,
      "rtsp": 20,
      "rtmp": 10
    },
    "byGroup": {
      "Entertainment": 50,
      "News": 30,
      "Sports": 70
    },
    "withLogo": 140,
    "withEpgId": 145,
    "isRadio": 5
  },
  "sampleChannels": [
    {
      "name": "Sample Channel 1",
      "number": 1,
      "group": "Entertainment",
      "type": "hls",
      "hasLogo": true,
      "hasEpgId": true
    }
  ]
}
```

## Supported M3U Tags

### Channel Information
- `#EXTINF:duration,title` - Channel duration and name
- `tvg-id="id"` - EPG channel ID
- `tvg-name="name"` - Channel name override
- `tvg-logo="url"` - Channel logo URL
- `tvg-chno="number"` - Channel number
- `group-title="group"` - Channel group
- `tvg-language="lang"` - Channel language
- `tvg-country="country"` - Channel country
- `radio="true"` - Mark as radio channel

### Stream Options
- `#EXTGRP:group` - Alternative group specification
- `#EXTVLCOPT:option` - VLC player options
- `#KODIPROP:property=value` - Kodi properties

## Security Features

### URL Validation
- Only HTTP/HTTPS protocols allowed
- Private IP address blocking (10.x.x.x, 172.16.x.x, 192.168.x.x, 127.x.x.x)
- Domain allowlist/blocklist support
- URL format validation

### Content Security
- Content-type validation
- Maximum content length limits (100MB default)
- Request timeout protection
- Redirect limit enforcement

### Input Sanitization
- Channel name sanitization
- SQL injection prevention
- XSS protection for stored data
- Path traversal prevention

## Error Handling

### Common Error Codes
- `400` - Bad Request (validation errors)
- `404` - URL not found
- `408` - Request timeout
- `413` - Content too large
- `429` - Rate limited
- `500` - Internal server error

### Error Response Format
```json
{
  "error": "Validation failed",
  "details": [
    "URL must be a valid HTTP or HTTPS URL"
  ],
  "source": "https://example.com/playlist.m3u",
  "duration": 1234
}
```

## Usage Examples

### Basic Import (Preview)
```bash
curl -X POST http://localhost:8080/api/streams/import \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/playlist.m3u",
    "auto_create_channels": false
  }'
```

### Import with Authentication
```bash
curl -X POST http://localhost:8080/api/streams/import \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://secure.example.com/playlist.m3u",
    "auth_username": "user",
    "auth_password": "pass",
    "auto_create_channels": true,
    "import_options": {
      "channel_number_start": 2000,
      "group_prefix": "Premium"
    }
  }'
```

### Import with Stream Validation
```bash
curl -X POST http://localhost:8080/api/streams/import \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/playlist.m3u",
    "auto_create_channels": true,
    "validation_options": {
      "validate_urls": true,
      "validation_batch_size": 10,
      "validation_timeout": 15000
    }
  }'
```

## Database Schema Requirements

The import functionality requires the following database tables:

### Channels Table
```sql
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  number INTEGER UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT 1,
  logo TEXT,
  epg_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Streams Table
```sql
CREATE TABLE streams (
  id TEXT PRIMARY KEY,
  channel_id TEXT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  backup_urls TEXT, -- JSON array
  auth_username TEXT,
  auth_password TEXT,
  headers TEXT, -- JSON object
  protocol_options TEXT, -- JSON object
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
```

## Performance Considerations

### Recommendations
- Use stream validation sparingly (impacts import time)
- Batch imports during low-traffic periods
- Monitor memory usage for large playlists
- Consider caching frequently accessed playlists
- Set appropriate timeouts for slow networks

### Limits
- Maximum playlist size: 100MB
- Maximum concurrent validations: 20
- Request timeout: 30 seconds
- Validation timeout: 30 seconds per URL

## Logging

The import process logs detailed information for monitoring and debugging:

```
INFO: M3U import request received { url: "...", hasAuth: true }
INFO: M3U playlist parsed successfully { channelCount: 150, validChannels: 145 }
INFO: M3U import completed successfully { duration: 5678, channelsCreated: 145 }
WARN: Stream URL validation failed { url: "...", error: "Connection timeout" }
ERROR: M3U import failed { error: "Invalid URL format" }
```

## Migration from Legacy API

If you're using the old import endpoint, update your code:

### Old Format
```json
{
  "url": "https://example.com/playlist.m3u",
  "type": "hls",
  "auth_username": "user",
  "auth_password": "pass",
  "auto_create_channels": true
}
```

### New Format
```json
{
  "url": "https://example.com/playlist.m3u",
  "auth_username": "user",
  "auth_password": "pass",
  "auto_create_channels": true,
  "import_options": {
    "enable_imported_channels": true
  }
}
```

The `type` parameter is no longer needed as it's auto-detected from stream URLs.