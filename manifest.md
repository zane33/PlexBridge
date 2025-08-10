# PlexTV - IPTV to Plex Bridge Interface

## Overview
PlexTV is a containerized interface that bridges IPTV streams with Plex Media Server, enabling seamless Live TV functionality. It acts as a virtual TV tuner that Plex can discover and use for live television content.

## Technology Stack

### Backend
- **Node.js 18+** - Core runtime
- **Express.js** - Web server framework
- **Socket.IO** - Real-time communication for GUI
- **node-ssdp** - SSDP protocol implementation for Plex discovery
- **xml2js** - XML EPG parsing
- **ffmpeg-static** - Stream processing and format conversion
- **fluent-ffmpeg** - FFmpeg wrapper for Node.js
- **sqlite3** - Local database for configuration storage
- **node-cron** - EPG refresh scheduling
- **axios** - HTTP client for EPG and stream fetching
- **m3u8-parser** - M3U8 playlist parsing and validation
- **node-rtsp-stream** - RTSP stream handling
- **udp-proxy** - UDP stream proxying for IPTV
- **stream-transcoder** - Multi-format stream transcoding

### Frontend
- **React** - GUI framework
- **Material-UI (MUI)** - Component library
- **Chart.js** - Analytics dashboard
- **React Router** - Navigation
- **Axios** - API communication

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Local development orchestration
- **Redis** - Caching layer (storage-backed)
- **PM2** - Process management and monitoring

## Architecture Overview

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Plex Server   │◄──►│   PlexTV     │◄──►│  IPTV Sources   │
│                 │    │   Interface  │    │   (m3u8)        │
└─────────────────┘    └──────────────┘    └─────────────────┘
                              │
                       ┌──────▼──────┐
                       │ EPG Sources │
                       │   (XML)     │
                       └─────────────┘
```

## Core Features Implementation

### 1. EPG Integration
- **XML Parser**: Automated parsing of XMLTV format EPG data
- **HTTP/HTTPS Support**: Fetch EPG data from remote sources
- **Automatic Refresh**: Configurable refresh intervals
- **Storage**: Persistent EPG data in SQLite with Redis caching

### 2. Stream Management
- **Universal IPTV Support**: Native support for all major IPTV formats
  - **HLS (HTTP Live Streaming)**: M3U8 playlists with adaptive bitrates
  - **MPEG-DASH**: Dynamic Adaptive Streaming over HTTP
  - **RTSP**: Real Time Streaming Protocol for live feeds
  - **RTMP**: Real-Time Messaging Protocol streams
  - **UDP/Multicast**: Traditional IPTV multicast streams
  - **HTTP/HTTPS Streams**: Direct HTTP media streams
  - **MMS**: Microsoft Media Server streams
  - **SRT**: Secure Reliable Transport protocol
- **Format Detection**: Automatic stream type detection and validation
- **Protocol Conversion**: Transparent format conversion for Plex compatibility
- **Multi-threading**: Worker threads for each stream instance
- **No Stream Sharing**: Isolated stream processes per client
- **Adaptive Streaming**: Dynamic quality and bitrate adjustment
- **Failover Support**: Automatic backup stream switching

### 3. Plex Integration
- **SSDP Discovery**: Automatic detection by Plex as TV tuner
- **HDHomeRun Emulation**: Compatible API endpoints
- **Channel Lineup**: Dynamic channel configuration
- **EPG Passthrough**: Proper program guide integration

### 4. Web GUI Features
- **Stream Management**: Add, edit, preview IPTV streams
- **Channel Mapping**: Visual channel-to-stream assignment
- **EPG Mapping**: EPG channel to stream correlation
- **Logo Management**: Custom channel logo uploads
- **Real-time Dashboard**: System and streaming metrics
- **Log Viewer**: Live application logs

## Directory Structure

```
plextv/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── server/
│   ├── index.js
│   ├── routes/
│   │   ├── api.js
│   │   ├── ssdp.js
│   │   ├── streams.js
│   │   └── epg.js
│   ├── services/
│   │   ├── streamManager.js
│   │   ├── epgService.js
│   │   ├── plexService.js
│   │   └── cacheService.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── logging.js
│   ├── models/
│   │   ├── channel.js
│   │   ├── stream.js
│   │   └── epg.js
│   └── utils/
│       ├── ffmpeg.js
│       ├── validator.js
│       └── metrics.js
├── client/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard/
│   │   │   ├── StreamManager/
│   │   │   ├── ChannelMapper/
│   │   │   ├── EPGManager/
│   │   │   ├── LogViewer/
│   │   │   └── Settings/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
├── data/
│   ├── cache/
│   ├── logs/
│   ├── database/
│   └── logos/
└── config/
    ├── default.json
    └── production.json
```

## Installation & Setup

### Prerequisites
- Docker & Docker Compose
- At least 2GB RAM
- 10GB storage space
- Network access to IPTV sources

### Quick Start

1. **Clone and Configure**
```bash
git clone <repository>
cd plextv
cp config/default.json config/local.json
# Edit local.json with your settings
```

2. **Build and Run**
```bash
docker-compose up --build
```

3. **Access GUI**
- Open browser to `http://localhost:8080`
- Default credentials: admin/admin

4. **Configure Plex**
- In Plex, go to Settings > Live TV & DVR
- Plex should auto-detect PlexTV as a tuner
- Follow setup wizard

## Configuration

### Environment Variables
```env
# Core Settings
PORT=8080
NODE_ENV=production
DB_PATH=/data/database/plextv.db
CACHE_PATH=/data/cache
LOG_PATH=/data/logs

# SSDP Settings
SSDP_PORT=1900
DEVICE_UUID=your-unique-uuid
FRIENDLY_NAME=PlexTV

# Stream Settings
MAX_CONCURRENT_STREAMS=10
TRANSCODE_ENABLED=true
FFMPEG_PATH=/usr/bin/ffmpeg
SUPPORTED_FORMATS=hls,dash,rtsp,rtmp,udp,http,mms,srt
AUTO_DETECT_FORMAT=true
STREAM_TIMEOUT=30000
RECONNECT_ATTEMPTS=3

# Protocol Specific Settings
RTSP_TRANSPORT=tcp
RTSP_TIMEOUT=10000
UDP_BUFFER_SIZE=65536
HTTP_USER_AGENT=PlexTV/1.0
SRT_LATENCY=120

# EPG Settings
EPG_REFRESH_INTERVAL=4h
EPG_CACHE_TTL=1h
```

### Stream Configuration Example
```json
{
  "streams": [
    {
      "id": "stream001",
      "name": "CNN HD",
      "url": "https://example.com/cnn/playlist.m3u8",
      "type": "hls",
      "channelNumber": "101",
      "epgId": "cnn.us",
      "logo": "/logos/cnn.png",
      "enabled": true,
      "backup_urls": [
        "rtsp://backup.example.com/cnn",
        "https://cdn2.example.com/cnn.m3u8"
      ]
    },
    {
      "id": "stream002", 
      "name": "Sports Channel",
      "url": "rtsp://iptv.provider.com:554/sports1",
      "type": "rtsp",
      "channelNumber": "102",
      "epgId": "sports.us",
      "logo": "/logos/sports.png",
      "enabled": true,
      "auth": {
        "username": "user",
        "password": "pass"
      }
    },
    {
      "id": "stream003",
      "name": "News UDP",
      "url": "udp://239.255.1.1:1234",
      "type": "udp",
      "channelNumber": "103",
      "epgId": "news.local",
      "logo": "/logos/news.png",
      "enabled": true,
      "multicast": {
        "interface": "eth0",
        "source": "192.168.1.100"
      }
    }
  ]
}
```

### EPG Configuration Example
```json
{
  "epgSources": [
    {
      "id": "primary",
      "url": "https://example.com/epg.xml",
      "refreshInterval": "4h",
      "enabled": true
    }
  ]
}
```

## API Endpoints

### Plex Discovery Endpoints
```
GET /discover.json          # HDHomeRun discovery
GET /lineup_status.json     # Tuner status
GET /lineup.json           # Channel lineup
GET /device.xml            # Device description
```

### Stream Endpoints
```
GET /stream/:channelId      # Live stream proxy (all formats)
GET /preview/:streamId      # Stream preview with format detection
POST /validate/:streamUrl   # Stream validation for all IPTV types
GET /stream/info/:streamId  # Stream format and codec information
POST /stream/test          # Bulk stream testing endpoint
```

### Management API
```
GET    /api/channels        # List channels
POST   /api/channels        # Create channel
PUT    /api/channels/:id    # Update channel
DELETE /api/channels/:id    # Delete channel

GET    /api/streams         # List streams
POST   /api/streams         # Add stream
PUT    /api/streams/:id     # Update stream
DELETE /api/streams/:id     # Delete stream

GET    /api/epg             # EPG data
POST   /api/epg/refresh     # Force EPG refresh
GET    /api/epg/sources     # List EPG sources

GET    /api/metrics         # System metrics
GET    /api/logs            # Application logs
```

## GUI Components

### Dashboard
- **System Metrics**: CPU, Memory, Storage usage
- **Network Stats**: Bandwidth utilization
- **Active Streams**: Real-time streaming sessions
- **Stream Health**: Upstream connectivity status

### Stream Manager
- **Universal IPTV Support**: Add streams from any supported protocol
  - URL validation for HLS, DASH, RTSP, RTMP, UDP, HTTP, MMS, SRT
  - Automatic format detection and codec analysis
  - Protocol-specific configuration options
- **Advanced Stream Testing**: 
  - Real-time stream health monitoring
  - Bandwidth and quality analysis
  - Codec compatibility checking
  - Failover stream testing
- **Bulk Import**: 
  - M3U/M3U8 playlist import with format detection
  - XSPF playlist support
  - CSV stream list import
  - Auto-detection of stream types and metadata
- **Protocol Configuration**:
  - RTSP authentication and transport settings
  - UDP multicast interface selection
  - HTTP headers and authentication
  - SRT encryption and latency settings

### Channel Mapper
- **Visual Mapping**: Drag-and-drop channel assignment
- **Channel Numbers**: Customizable channel numbering
- **Logo Management**: Upload and assign channel logos
- **EPG Linking**: Associate EPG data with channels

### EPG Manager
- **Source Configuration**: Add/edit EPG sources
- **Mapping Interface**: Link EPG channels to streams
- **Schedule Preview**: View program guide data
- **Refresh Status**: EPG update monitoring

### Log Viewer
- **Real-time Logs**: Live application logging
- **Filtering**: Log level and component filtering
- **Download**: Export logs for debugging
- **Search**: Log content search functionality

## Docker Configuration

### Dockerfile Key Features
```dockerfile
FROM node:18-alpine

# Install FFmpeg and additional codecs for all IPTV formats
RUN apk add --no-cache \
    ffmpeg \
    gstreamer \
    gst-plugins-base \
    gst-plugins-good \
    gst-plugins-bad \
    gst-plugins-ugly \
    gst-libav \
    vlc-dev \
    && rm -rf /var/cache/apk/*

# Install additional streaming tools
RUN apk add --no-cache \
    rtmpdump \
    stunnel \
    socat

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Expose HTTP and SSDP ports
EXPOSE 8080 1900/udp 

# Expose additional ports for various IPTV protocols
EXPOSE 554 1935 8000-8010

CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  plextv:
    build: .
    ports:
      - "8080:8080"
      - "1900:1900/udp"
    volumes:
      - ./data:/data
      - ./config:/app/config
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

## Performance Optimization

### Caching Strategy
- **EPG Data**: Redis-backed storage cache
- **Stream Metadata**: SQLite with Redis overlay
- **Logo Assets**: File system cache with HTTP headers
- **API Responses**: Intelligent caching based on data volatility

### Stream Handling
- **Universal Protocol Support**: Native handling for all IPTV formats
  - **HLS/M3U8**: Adaptive bitrate streaming with segment caching
  - **MPEG-DASH**: Dynamic streaming with manifest parsing
  - **RTSP**: Real-time streaming with TCP/UDP transport options
  - **RTMP**: Flash-based streaming with authentication support
  - **UDP/Multicast**: Traditional broadcast with multicast handling
  - **HTTP Streams**: Direct HTTP media with range request support
  - **MMS**: Microsoft streaming with protocol negotiation
  - **SRT**: Low-latency streaming with encryption support
- **Intelligent Format Detection**: Automatic stream type identification
- **Protocol Conversion**: Seamless format translation for Plex compatibility
- **Worker Threads**: Isolated processes per stream to prevent interference
- **Connection Pooling**: Efficient upstream connections with keep-alive
- **Adaptive Quality**: Dynamic bitrate and resolution adjustment
- **Error Recovery**: Automatic reconnection with exponential backoff
- **Stream Authentication**: Support for various auth methods (Basic, Digest, Token)

### Resource Management
- **Memory Limits**: Configurable per-stream memory caps
- **CPU Throttling**: Prevent resource starvation
- **Storage Cleanup**: Automated cache purging
- **Connection Limits**: Prevent upstream overload

## Troubleshooting

### Common Issues

**Plex Not Detecting Tuner**
- Verify SSDP port 1900/udp is accessible
- Check Docker network configuration
- Ensure UUID is unique and persistent

**Streams Not Playing**
- Validate upstream URLs in preview mode for all supported formats
- Check protocol-specific requirements (RTSP transport, UDP interface, etc.)
- Verify authentication credentials for protected streams
- Check FFmpeg transcoding logs for codec compatibility issues
- Verify network connectivity and firewall rules for specific protocols
- Test stream URLs with different transport methods (TCP vs UDP for RTSP)

**Format-Specific Issues**
- **HLS/M3U8**: Check playlist accessibility and segment availability
- **RTSP**: Verify port 554 accessibility and transport protocol settings
- **UDP/Multicast**: Ensure proper network interface and multicast routing
- **RTMP**: Confirm RTMP server accessibility and authentication
- **DASH**: Validate manifest file and segment accessibility
- **SRT**: Check SRT-specific parameters like latency and encryption

**Protocol Detection Problems**
- Enable auto-detection logs to see format identification process
- Manually specify stream type if auto-detection fails
- Check stream headers and metadata for format indicators
- Verify stream URL format and protocol specification

**EPG Not Updating**
- Check EPG source URLs accessibility
- Verify XML format compatibility
- Review refresh schedule configuration

**High Resource Usage**
- Adjust concurrent stream limits
- Enable hardware transcoding if available
- Optimize cache settings

### Log Analysis
```bash
# View real-time logs
docker-compose logs -f plextv

# Filter by component
docker-compose exec plextv tail -f /data/logs/streams.log

# Debug specific stream
docker-compose exec plextv grep "stream001" /data/logs/app.log
```

## Development

### Local Development Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build production
npm run build
```

### Adding New Features
1. Update API routes in `server/routes/`
2. Implement service logic in `server/services/`
3. Add GUI components in `client/src/components/`
4. Update configuration schema
5. Add tests and documentation

## Security Considerations

- **Input Validation**: All URLs and inputs sanitized
- **Authentication**: Basic auth for GUI access
- **Network Isolation**: Container network restrictions
- **Log Sanitization**: Sensitive data filtering
- **Update Management**: Regular dependency updates

## Monitoring & Maintenance

### Health Checks
- Stream connectivity monitoring
- EPG source availability
- System resource utilization
- Database integrity checks

### Automated Tasks
- EPG refresh scheduling
- Log rotation and cleanup
- Cache optimization
- Performance metric collection

## Support & Documentation

### Resources
- **API Documentation**: Generated from OpenAPI specs
- **Component Library**: Storybook-based component docs
- **Architecture Diagrams**: System design documentation
- **Performance Guides**: Optimization recommendations

### Community
- **Issue Tracking**: GitHub issues for bug reports
- **Feature Requests**: Community-driven feature planning
- **Wiki**: Community-maintained documentation
- **Discord**: Real-time community support

---

**PlexTV** - Bridging IPTV streams to Plex with enterprise-grade reliability and user-friendly management.