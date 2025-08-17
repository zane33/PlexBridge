# PlexBridge - IPTV to Plex Media Server Bridge

A production-ready application that bridges IPTV streams with Plex Media Server by emulating an HDHomeRun network tuner. PlexBridge enables Plex to discover and use IPTV sources as live TV channels with full EPG (Electronic Program Guide) support.

## Key Features

- **HDHomeRun Emulation**: Full HDHomeRun API compatibility for seamless Plex integration
- **Universal IPTV Protocol Support**: HLS, DASH, RTSP, RTMP, UDP/Multicast, HTTP, MMS, SRT
- **Advanced Stream Management**: Automatic format detection, validation, failover, and transcoding
- **Modern Web Interface**: React-based management GUI with real-time monitoring
- **Electronic Program Guide**: XMLTV parsing with automated scheduling and caching
- **SSDP Auto-Discovery**: Automatic Plex detection via UPnP protocols
- **Enterprise Architecture**: SQLite database, Redis caching, robust error handling
- **Docker Ready**: Containerized deployment with docker-compose support
- **Real-time Monitoring**: WebSocket-based live metrics and logging

## Quick Start

### Prerequisites

- **Node.js 18+** and npm (for development) OR **Docker & Docker Compose** (for production)
- **2GB RAM minimum** (4GB recommended)
- **Network access** to IPTV sources and Plex Media Server
- **Port availability**: 8080/tcp (web interface), 1900/udp (SSDP discovery)

### Development Setup

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd PlexBridge
npm install
```

2. **Start development server**
```bash
npm run dev
# Application starts on http://localhost:8080
```

3. **Access the web interface**
- Management GUI: http://localhost:8080
- Health check: http://localhost:8080/health
- Plex discovery: http://localhost:8080/discover.json

### Docker Deployment (Recommended)

1. **Start with docker-compose**
```bash
docker-compose up -d
```

2. **Configure Plex Media Server**
- Go to Plex Settings > Live TV & DVR > Set up Plex DVR
- Plex should auto-detect "PlexBridge" as an available tuner
- Follow the Plex setup wizard to configure channels and EPG

## Configuration

PlexBridge works out-of-the-box with sensible defaults, but offers extensive customization options.

### Environment Variables

**Core Application Settings:**
```env
NODE_ENV=production                    # Environment mode
PORT=8080                             # Web interface port
LOG_LEVEL=info                        # Logging verbosity (debug,info,warn,error)
```

**Streaming Configuration:**
```env
MAX_CONCURRENT_STREAMS=10             # Maximum simultaneous streams
FFMPEG_PATH=/usr/bin/ffmpeg          # FFmpeg binary location
TRANSCODE_ENABLED=true               # Enable stream transcoding
STREAM_TIMEOUT=30000                 # Stream connection timeout (ms)
```

**Database & Caching:**
```env
DB_PATH=/data/database/plextv.db     # SQLite database location
REDIS_HOST=localhost                 # Redis server (optional)
REDIS_PORT=6379                      # Redis port
```

**SSDP Discovery (Plex Integration):**
```env
DEVICE_UUID=auto-generated           # Unique device identifier
FRIENDLY_NAME=PlexBridge             # Device name in Plex
SSDP_PORT=1900                       # UPnP discovery port
```

### Configuration Files

Create `config/local.json` for custom settings:
```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0"
  },
  "streams": {
    "maxConcurrent": 10,
    "transcodeEnabled": true
  },
  "epg": {
    "refreshInterval": "4h"
  }
}
```

## Web Interface

PlexBridge provides a comprehensive web-based management interface accessible at `http://localhost:8080`.

### Dashboard
- **Real-time Metrics**: System performance, active streams, memory usage
- **Stream Monitor**: Live view of active streaming sessions
- **System Status**: Database health, cache status, SSDP service status
- **Quick Actions**: Stream validation, EPG refresh, configuration

### Channel Manager
- **Channel Configuration**: Create, edit, and organize TV channels
- **EPG Mapping**: Link channels to Electronic Program Guide data
- **Logo Management**: Upload and manage channel logos
- **Bulk Operations**: Import M3U playlists, batch configuration

### Stream Manager
- **IPTV Stream Configuration**: Add and configure stream sources
- **Format Detection**: Automatic protocol detection (HLS, RTSP, etc.)
- **Stream Validation**: Test stream connectivity and format
- **Backup URLs**: Configure failover streams for reliability

### EPG Manager
- **XMLTV Sources**: Configure Electronic Program Guide data sources
- **Schedule Management**: Set automated refresh intervals
- **Program Data**: View and manage program information
- **Channel Mapping**: Automatic and manual EPG-to-channel linking

## API Reference

### HDHomeRun Compatible Endpoints (Plex Integration)
```
GET /discover.json          # Device discovery information
GET /lineup.json            # Channel lineup for Plex
GET /lineup_status.json     # Tuner status
GET /device.xml             # UPnP device description
GET /stream/:channelId      # Live stream proxy endpoint
```

### Management API
```
GET /api/channels           # Channel management
GET /api/streams            # Stream configuration
GET /api/epg                # EPG data and sources  
GET /api/metrics            # System metrics
GET /health                 # Application health check
```

### Stream Operations
```
POST /api/streams/validate  # Validate stream URLs
GET /api/streams/active     # Active streaming sessions
```

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Plex Server   │◄──►│   PlexBridge     │◄──►│  IPTV Sources   │
│                 │    │                  │    │  (HLS/RTSP/     │
│ • Live TV & DVR │    │ • HDHomeRun API  │    │   RTMP/UDP)     │
│ • Channel Guide │    │ • Stream Proxy   │    │ • M3U Playlists │
│ • Recording     │    │ • Format Convert │    │ • Auth Support  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                       ┌────────▼────────┐
                       │  EPG Sources    │
                       │  (XMLTV feeds)  │
                       └─────────────────┘
```

### Component Architecture

**Backend Services (Node.js)**
- **Express Server**: HTTP API and static file serving
- **SSDP Service**: UPnP device discovery for Plex
- **Stream Manager**: Universal protocol handling and transcoding
- **EPG Service**: XMLTV parsing and scheduling
- **Database Layer**: SQLite with WAL mode for persistence
- **Cache Service**: Redis or memory-based caching

**Frontend Interface (React)**
- **Dashboard**: Real-time monitoring and metrics
- **Channel Manager**: Channel configuration and organization
- **Stream Manager**: IPTV source management and validation
- **EPG Manager**: Program guide configuration
- **Settings**: Application and system configuration

**Data Flow**
1. **Discovery**: Plex discovers PlexBridge via SSDP broadcast
2. **Channel Lineup**: Plex requests available channels via HDHomeRun API
3. **Stream Request**: Plex requests live stream via `/stream/:channelId`
4. **Stream Proxy**: PlexBridge fetches IPTV source and proxies to Plex
5. **EPG Integration**: Program guide data served to Plex for scheduling

## Technology Stack

**Backend Technologies**
- **Node.js 18+** with Express.js framework
- **SQLite** database with WAL journaling
- **Redis** caching (optional, falls back to memory)
- **FFmpeg** for stream processing and transcoding
- **Socket.IO** for real-time web interface updates
- **node-ssdp** for UPnP device discovery

**Frontend Technologies**
- **React 18** with functional components and hooks
- **Material-UI (MUI)** for modern UI components
- **Chart.js** for analytics and monitoring dashboards
- **Axios** for API communication
- **Socket.IO Client** for real-time updates

**Infrastructure & DevOps**
- **Docker** containerization with multi-stage builds
- **Docker Compose** for orchestration
- **PM2** process management in production
- **Winston** structured logging with rotation
- **Health checks** and graceful shutdown handling

## Monitoring & Health Checks

### Built-in Monitoring
- **Health Endpoint**: `GET /health` - Application status and uptime
- **Real-time Dashboard**: Live system metrics, memory usage, active streams
- **Log Viewer**: Web-based log viewing with filtering and real-time updates
- **Stream Monitoring**: Active session tracking and bandwidth monitoring

### Application Logs
PlexBridge provides structured logging with automatic rotation:
```bash
# View logs in Docker
docker-compose logs -f plexbridge

# Log files (when running locally)
tail -f data/logs/app-$(date +%Y-%m-%d).log      # Application logs
tail -f data/logs/error-$(date +%Y-%m-%d).log    # Error logs  
tail -f data/logs/streams-$(date +%Y-%m-%d).log  # Stream logs
tail -f data/logs/http-$(date +%Y-%m-%d).log     # HTTP requests
```

### Performance Metrics
- **Memory Usage**: Node.js heap and RSS memory tracking
- **Stream Statistics**: Concurrent streams, bandwidth utilization
- **Database Performance**: Query times and connection health
- **Cache Efficiency**: Redis hit/miss ratios and memory usage

## Troubleshooting Guide

### Plex Integration Issues

**Plex Cannot Discover PlexBridge**
```bash
# Check SSDP service status
curl http://localhost:8080/discover.json

# Verify port 1900 is accessible
sudo netstat -tulpn | grep :1900

# Ensure same network subnet as Plex
docker exec plexbridge ip route show default
```

**Channel Lineup Empty in Plex**
```bash
# Check channel configuration
curl http://localhost:8080/lineup.json

# Verify channels are enabled and have streams
curl http://localhost:8080/api/channels
```

### Stream Playback Issues

**Streams Fail to Start**
```bash
# Validate stream URL
curl -I "your-stream-url"

# Test with ffprobe  
ffprobe -v quiet -print_format json -show_format "your-stream-url"

# Check PlexBridge stream validation
curl -X POST http://localhost:8080/api/streams/validate \
  -H "Content-Type: application/json" \
  -d '{"url":"your-stream-url","type":"hls"}'
```

**Streams Buffer or Stop Playing**
- Check network connectivity to IPTV sources
- Verify FFmpeg is available: `docker exec plexbridge which ffmpeg`
- Monitor stream logs: `docker-compose logs -f plexbridge | grep stream`
- Check concurrent stream limits in settings

### EPG (Program Guide) Issues

**EPG Data Not Loading**
```bash
# Check EPG sources
curl http://localhost:8080/api/epg/sources

# Manually trigger EPG refresh
curl -X POST http://localhost:8080/api/epg/refresh

# Verify XMLTV format
curl -I "your-epg-xmltv-url"
```

### Database and Configuration Issues

**Application Won't Start**
```bash
# Check database initialization
ls -la data/database/
sqlite3 data/database/plextv.db ".tables"

# Verify configuration
node -e "console.log(require('./server/config'))"

# Check directory permissions
ls -la data/
```

### Network and Docker Issues

**Container Networking Problems**
```bash
# Check container status
docker-compose ps

# Inspect network configuration  
docker network inspect plexbridge_default

# Test internal connectivity
docker exec plexbridge ping host.docker.internal
```

## Development

### Local Development Setup
```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Start development server
npm run dev

# Build frontend for production
npm run build
```

### Building and Deployment
```bash
# Build Docker image
docker build -t plexbridge .

# Run with docker-compose
docker-compose up -d

# Check application health
curl http://localhost:8080/health
```

## Security Features

PlexBridge implements multiple security layers:

- **Input Validation**: All stream URLs and configuration data validated
- **Rate Limiting**: API endpoints protected against abuse (1000 req/15min)
- **Container Isolation**: Docker networking with minimal exposed ports
- **Secure Headers**: Helmet.js security middleware implementation
- **Error Sanitization**: Sensitive information filtered from error responses
- **File System Security**: Read-only container with specific writable volumes

## Supported IPTV Protocols

| Protocol | Format | Authentication | Transcoding | Status |
|----------|--------|---------------|-------------|---------|
| **HLS** | M3U8 playlists | Headers/URL params | Optional | ✅ Full Support |
| **DASH** | MPD manifests | Headers/URL params | Optional | ✅ Full Support |
| **RTSP** | Real-time streaming | Username/Password | Yes | ✅ Full Support |
| **RTMP** | Flash video | Username/Password | Yes | ✅ Full Support |
| **UDP** | Multicast/Unicast | None | Yes | ✅ Full Support |
| **HTTP** | Direct streams | Headers/Auth | Optional | ✅ Full Support |
| **MMS** | Microsoft Media | None | Yes | ✅ Full Support |
| **SRT** | Secure transport | Encryption | Yes | ✅ Full Support |

## Documentation

For detailed information, see the complete documentation:

- **[Architecture Guide](docs/Architecture.md)** - System design and components
- **[API Reference](docs/API.md)** - Complete endpoint documentation  
- **[Networking Guide](docs/Networking.md)** - Network configuration and troubleshooting
- **[Development Guide](DEVELOPMENT.md)** - Development setup and contribution guidelines

## Contributing

PlexBridge is an open-source project. Contributions are welcome!

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature-name`
3. **Make your changes** with tests
4. **Submit a pull request** with detailed description

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development setup instructions.

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/your-repo/plexbridge/issues) for bug reports and feature requests
- **Documentation**: Complete guides in the `docs/` directory
- **Health Check**: Monitor application status at `/health` endpoint
- **Logs**: Built-in log viewer in web interface

## License

MIT License - See [LICENSE](LICENSE) file for details.

---

**PlexBridge** -  IPTV to Plex Media Server integration with enterprise-grade reliability and modern web management.

