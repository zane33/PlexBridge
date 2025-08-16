# PlexBridge Configuration Reference

## Overview

PlexBridge supports multiple configuration methods with a hierarchical loading system. Configuration options can be set via environment variables, JSON files, or runtime settings through the web interface.

## Configuration Loading Order

1. **Default Values** - Built-in sensible defaults
2. **JSON Configuration Files** - `config/default.json`, `config/production.json`, `config/local.json`
3. **Environment Variables** - Override any setting via environment variables
4. **Runtime Settings** - Dynamic settings via web interface

## Configuration File Structure

### Complete Configuration Schema

```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "environment": "production"
  },
  "database": {
    "path": "/data/database/plextv.db",
    "options": {
      "busyTimeout": 30000,
      "synchronous": "NORMAL",
      "journalMode": "WAL",
      "cacheSize": -64000
    }
  },
  "cache": {
    "host": "localhost",
    "port": 6379,
    "password": null,
    "db": 0,
    "ttl": {
      "epg": 3600,
      "streams": 300,
      "api": 60
    }
  },
  "ssdp": {
    "port": 1900,
    "deviceUuid": "auto-generated",
    "friendlyName": "PlexBridge",
    "manufacturer": "PlexBridge",
    "modelName": "PlexBridge Bridge",
    "modelNumber": "1.0",
    "description": "IPTV to Plex Bridge Interface"
  },
  "streams": {
    "maxConcurrent": 10,
    "transcodeEnabled": true,
    "ffmpegPath": "/usr/bin/ffmpeg",
    "supportedFormats": ["hls", "dash", "rtsp", "rtmp", "udp", "http", "mms", "srt"],
    "autoDetectFormat": true,
    "timeout": 30000,
    "reconnectAttempts": 3,
    "bufferSize": 65536
  },
  "protocols": {
    "rtsp": {
      "transport": "tcp",
      "timeout": 10000,
      "port": 554
    },
    "udp": {
      "bufferSize": 65536,
      "timeout": 5000
    },
    "http": {
      "userAgent": "PlexBridge/1.0",
      "timeout": 30000,
      "followRedirects": true
    },
    "srt": {
      "latency": 120,
      "encryption": "none"
    }
  },
  "epg": {
    "refreshInterval": "4h",
    "cacheTtl": 3600,
    "maxFileSize": 104857600,
    "timeout": 60000
  },
  "logging": {
    "level": "info",
    "path": "/data/logs",
    "maxFiles": 30,
    "maxSize": "100m"
  },
  "security": {
    "jwtSecret": "auto-generated",
    "sessionTimeout": 86400,
    "bcryptRounds": 12,
    "rateLimitMax": 1000,
    "rateLimitWindow": 900000
  },
  "paths": {
    "data": "/data",
    "cache": "/data/cache",
    "logs": "/data/logs",
    "database": "/data/database",
    "logos": "/data/logos"
  }
}
```

## Environment Variables Reference

### Core Application Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Application environment (development/production) |
| `PORT` | `8080` | HTTP server port |
| `LOG_LEVEL` | `info` | Logging verbosity (debug/info/warn/error) |
| `DATA_PATH` | `/data` | Base data directory path |

### Database Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `/data/database/plextv.db` | SQLite database file path |
| `DB_BUSY_TIMEOUT` | `30000` | Database busy timeout in milliseconds |
| `DB_CACHE_SIZE` | `-64000` | SQLite cache size in KB (negative = KB) |

### Caching Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis server hostname |
| `REDIS_PORT` | `6379` | Redis server port |
| `REDIS_PASSWORD` | `null` | Redis authentication password |
| `REDIS_DB` | `0` | Redis database number |
| `EPG_CACHE_TTL` | `3600` | EPG cache time-to-live in seconds |
| `STREAM_CACHE_TTL` | `300` | Stream cache time-to-live in seconds |
| `API_CACHE_TTL` | `60` | API response cache time-to-live in seconds |

### Streaming Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_CONCURRENT_STREAMS` | `10` | Maximum simultaneous streams |
| `TRANSCODE_ENABLED` | `true` | Enable FFmpeg transcoding |
| `FFMPEG_PATH` | `/usr/bin/ffmpeg` | FFmpeg binary location |
| `SUPPORTED_FORMATS` | `hls,dash,rtsp,rtmp,udp,http,mms,srt` | Supported stream formats |
| `AUTO_DETECT_FORMAT` | `true` | Automatic stream format detection |
| `STREAM_TIMEOUT` | `30000` | Stream connection timeout in milliseconds |
| `RECONNECT_ATTEMPTS` | `3` | Stream reconnection attempts |
| `STREAM_BUFFER_SIZE` | `65536` | Stream buffer size in bytes |

### SSDP Discovery Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SSDP_PORT` | `1900` | SSDP discovery port |
| `DEVICE_UUID` | Auto-generated | Unique device identifier |
| `FRIENDLY_NAME` | `PlexBridge` | Device friendly name for Plex |

### Protocol-Specific Settings

**RTSP Configuration:**
| Variable | Default | Description |
|----------|---------|-------------|
| `RTSP_TRANSPORT` | `tcp` | RTSP transport protocol (tcp/udp) |
| `RTSP_TIMEOUT` | `10000` | RTSP connection timeout in milliseconds |
| `RTSP_PORT` | `554` | Default RTSP port |

**UDP Configuration:**
| Variable | Default | Description |
|----------|---------|-------------|
| `UDP_BUFFER_SIZE` | `65536` | UDP buffer size in bytes |
| `UDP_TIMEOUT` | `5000` | UDP timeout in milliseconds |

**HTTP Configuration:**
| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_USER_AGENT` | `PlexBridge/1.0` | HTTP User-Agent header |
| `HTTP_TIMEOUT` | `30000` | HTTP request timeout in milliseconds |
| `HTTP_FOLLOW_REDIRECTS` | `true` | Follow HTTP redirects |

**SRT Configuration:**
| Variable | Default | Description |
|----------|---------|-------------|
| `SRT_LATENCY` | `120` | SRT latency in milliseconds |
| `SRT_ENCRYPTION` | `none` | SRT encryption mode |

### EPG Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `EPG_REFRESH_INTERVAL` | `4h` | EPG refresh interval (format: 1h, 30m, 1d) |
| `EPG_CACHE_TTL` | `3600` | EPG cache duration in seconds |
| `EPG_MAX_FILE_SIZE` | `104857600` | Maximum EPG file size in bytes (100MB) |
| `EPG_TIMEOUT` | `60000` | EPG download timeout in milliseconds |

### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_PATH` | `/data/logs` | Log files directory |
| `LOG_MAX_FILES` | `30` | Maximum log files to retain |
| `LOG_MAX_SIZE` | `100m` | Maximum log file size |

### Security Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Auto-generated | JWT signing secret |
| `SESSION_TIMEOUT` | `86400` | Session timeout in seconds |
| `BCRYPT_ROUNDS` | `12` | BCrypt hashing rounds |
| `RATE_LIMIT_MAX` | `1000` | Rate limit maximum requests |
| `RATE_LIMIT_WINDOW` | `900000` | Rate limit window in milliseconds |

## Configuration Examples

### Development Environment

```json
{
  "server": {
    "port": 8080,
    "environment": "development"
  },
  "logging": {
    "level": "debug",
    "path": "./data/logs"
  },
  "database": {
    "path": "./data/database/plextv.db"
  },
  "cache": {
    "host": "localhost",
    "port": 6379
  }
}
```

### Production Environment

```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "environment": "production"
  },
  "streams": {
    "maxConcurrent": 20,
    "transcodeEnabled": true,
    "bufferSize": 131072
  },
  "cache": {
    "host": "redis",
    "port": 6379,
    "ttl": {
      "epg": 7200,
      "streams": 600,
      "api": 120
    }
  },
  "logging": {
    "level": "info",
    "maxFiles": 60,
    "maxSize": "200m"
  },
  "security": {
    "rateLimitMax": 2000
  }
}
```

### High-Performance Setup

```json
{
  "streams": {
    "maxConcurrent": 50,
    "transcodeEnabled": false,
    "bufferSize": 262144,
    "timeout": 15000
  },
  "database": {
    "options": {
      "cacheSize": -256000,
      "journalMode": "WAL"
    }
  },
  "cache": {
    "ttl": {
      "epg": 14400,
      "streams": 1200,
      "api": 300
    }
  },
  "protocols": {
    "http": {
      "timeout": 15000,
      "followRedirects": false
    },
    "rtsp": {
      "timeout": 5000,
      "transport": "udp"
    }
  }
}
```

### Low-Resource Setup

```json
{
  "streams": {
    "maxConcurrent": 5,
    "transcodeEnabled": false,
    "bufferSize": 32768
  },
  "database": {
    "options": {
      "cacheSize": -16000
    }
  },
  "cache": {
    "enabled": false
  },
  "logging": {
    "level": "warn",
    "maxFiles": 7,
    "maxSize": "50m"
  }
}
```

## Docker Configuration

### Docker Compose Environment

```yaml
version: '3.8'

services:
  plexbridge:
    image: plexbridge:latest
    environment:
      # Core settings
      - NODE_ENV=production
      - PORT=8080
      - LOG_LEVEL=info
      
      # Streaming
      - MAX_CONCURRENT_STREAMS=15
      - TRANSCODE_ENABLED=true
      - FFMPEG_PATH=/usr/bin/ffmpeg
      
      # Database & Cache
      - DB_PATH=/data/database/plextv.db
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      
      # SSDP Discovery
      - DEVICE_UUID=${DEVICE_UUID:-auto}
      - FRIENDLY_NAME=PlexBridge
      - SSDP_PORT=1900
      
      # Security
      - ALLOWED_ORIGINS=https://mydomain.com
      - RATE_LIMIT_MAX=2000
    volumes:
      - ./data:/data
      - ./config:/app/config:ro
    ports:
      - "8080:8080"
      - "1900:1900/udp"
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

### Environment File (.env)

```bash
# PlexBridge Configuration
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# Streaming Configuration
MAX_CONCURRENT_STREAMS=15
TRANSCODE_ENABLED=true
STREAM_TIMEOUT=30000

# Database
DB_PATH=/data/database/plextv.db

# Cache
REDIS_HOST=redis
REDIS_PORT=6379

# SSDP Discovery
DEVICE_UUID=550e8400-e29b-41d4-a716-446655440000
FRIENDLY_NAME=PlexBridge Production
SSDP_PORT=1900

# Security
ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3000
RATE_LIMIT_MAX=2000
JWT_SECRET=your-secret-key-here

# Paths
DATA_PATH=/data
LOG_PATH=/data/logs
```

## Dynamic Configuration

### Web Interface Settings

The web interface provides runtime configuration for:

- **Stream Settings**: Concurrent stream limits, transcoding options
- **EPG Settings**: Refresh intervals, source URLs
- **Cache Settings**: TTL values, cache policies
- **SSDP Settings**: Device name, discovery intervals
- **Logging Settings**: Log levels, rotation policies

### API Configuration Endpoints

```bash
# Get current settings
GET /api/settings

# Update settings
PUT /api/settings
Content-Type: application/json

{
  "streams": {
    "maxConcurrent": 20
  },
  "epg": {
    "refreshInterval": "6h"
  }
}
```

## Configuration Validation

PlexBridge validates all configuration values using Joi schemas:

### Validation Rules

```javascript
// Stream configuration validation
const streamConfig = {
  maxConcurrent: Joi.number().integer().min(1).max(100).default(10),
  timeout: Joi.number().integer().min(5000).max(300000).default(30000),
  bufferSize: Joi.number().integer().min(1024).max(1048576).default(65536)
};

// EPG configuration validation
const epgConfig = {
  refreshInterval: Joi.string().pattern(/^\d+[hmd]$/).default('4h'),
  maxFileSize: Joi.number().integer().min(1048576).max(1073741824).default(104857600)
};
```

### Configuration Health Check

```bash
# Validate configuration
curl http://localhost:8080/api/config/validate

# Get configuration status
curl http://localhost:8080/health | jq '.config'
```

## Troubleshooting Configuration

### Common Configuration Issues

**Invalid Environment Variables:**
```bash
# Check environment variable format
echo $EPG_REFRESH_INTERVAL  # Should be like "4h", "30m", "1d"

# Validate numeric values
echo $MAX_CONCURRENT_STREAMS  # Should be positive integer
```

**Path Configuration Problems:**
```bash
# Check directory permissions
ls -la /data/
chmod 755 /data/

# Verify database path
sqlite3 /data/database/plextv.db ".tables"
```

**Cache Configuration Issues:**
```bash
# Test Redis connection
redis-cli -h localhost -p 6379 ping

# Check cache fallback
curl http://localhost:8080/health | jq '.cache'
```

For additional configuration help, see the [Setup Guide](Setup.md) and [Troubleshooting Guide](Troubleshooting.md).