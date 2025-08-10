# PlexTV - IPTV to Plex Bridge Interface

A containerized interface that bridges IPTV streams with Plex Media Server, enabling seamless Live TV functionality. Acts as a virtual TV tuner that Plex can discover and use for live television content.

## Features

- **Universal IPTV Support**: Native support for all major IPTV formats (HLS, DASH, RTSP, RTMP, UDP, HTTP, MMS, SRT)
- **HDHomeRun Emulation**: Compatible API endpoints for seamless Plex integration
- **EPG Integration**: Automated parsing and management of Electronic Program Guide data
- **Web Management Interface**: Modern React-based GUI for stream and channel management
- **Real-time Monitoring**: Live dashboard with streaming metrics and system health
- **Automatic Discovery**: SSDP protocol implementation for Plex auto-detection
- **Stream Validation**: Comprehensive testing and validation of IPTV sources
- **Performance Optimized**: Redis caching, SQLite storage, and efficient stream handling

## Quick Start

### Prerequisites

- Docker & Docker Compose
- At least 2GB RAM
- 10GB storage space
- Network access to IPTV sources

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd plextv
```

2. **Create configuration**
```bash
cp config/default.json config/local.json
# Edit local.json with your specific settings
```

3. **Start the application**
```bash
docker-compose up -d
```

4. **Access the interface**
- Web GUI: http://localhost:8080
- The application will auto-configure for Plex discovery

5. **Configure Plex**
- In Plex: Settings > Live TV & DVR
- Plex should auto-detect PlexTV as a tuner
- Follow the setup wizard to complete configuration

## Configuration

### Environment Variables

Key environment variables for production deployment:

```env
# Core Settings
NODE_ENV=production
PORT=8080
MAX_CONCURRENT_STREAMS=10

# Database & Caching
DB_PATH=/data/database/plextv.db
REDIS_HOST=redis

# SSDP Discovery
DEVICE_UUID=your-unique-uuid
FRIENDLY_NAME=PlexTV

# Stream Settings
FFMPEG_PATH=/usr/bin/ffmpeg
SUPPORTED_FORMATS=hls,dash,rtsp,rtmp,udp,http,mms,srt
```

### Stream Configuration

Add streams through the web interface or via API:

```json
{
  "name": "CNN HD",
  "url": "https://example.com/cnn/playlist.m3u8",
  "type": "hls",
  "channelNumber": "101",
  "epgId": "cnn.us",
  "backup_urls": ["rtsp://backup.example.com/cnn"]
}
```

## API Endpoints

### Plex Discovery Endpoints
- `GET /discover.json` - HDHomeRun discovery
- `GET /lineup.json` - Channel lineup
- `GET /device.xml` - Device description

### Stream Endpoints
- `GET /stream/:channelId` - Live stream proxy
- `POST /validate` - Stream validation
- `GET /preview/:streamId` - Stream preview

### Management API
- `GET /api/channels` - Channel management
- `GET /api/streams` - Stream management
- `GET /api/epg` - EPG data access
- `GET /api/metrics` - System metrics

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Plex Server   │◄──►│   PlexTV     │◄──►│  IPTV Sources   │
│                 │    │   Interface  │    │   (Various)     │
└─────────────────┘    └──────────────┘    └─────────────────┘
                              │
                       ┌──────▼──────┐
                       │ EPG Sources │
                       │    (XML)    │
                       └─────────────┘
```

## Technology Stack

### Backend
- Node.js 18+ with Express.js
- SQLite with Redis caching
- FFmpeg for stream processing
- Socket.IO for real-time updates
- SSDP for Plex discovery

### Frontend
- React 18 with Material-UI
- Chart.js for analytics
- Real-time WebSocket updates

### Infrastructure
- Docker containerization
- PM2 process management
- Comprehensive logging
- Health monitoring

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

## Troubleshooting

### Common Issues

**Plex Not Detecting Tuner**
- Verify SSDP port 1900/udp is accessible
- Check Docker network configuration
- Ensure UUID is unique and persistent

**Streams Not Playing**
- Validate stream URLs in the web interface
- Check FFmpeg logs for transcoding issues
- Verify network connectivity to IPTV sources
- Test different transport protocols (TCP vs UDP for RTSP)

**EPG Not Updating**
- Check EPG source URLs in the EPG Manager
- Verify XML format compatibility
- Review refresh schedule configuration

### Logs

View logs through the web interface or directly:
```bash
# View real-time logs
docker-compose logs -f plextv

# View specific log files
docker-compose exec plextv tail -f /data/logs/app.log
```

## Development

### Local Development
```bash
npm install
npm run dev
```

### Building
```bash
# Build frontend
cd client && npm run build

# Build Docker image
docker build -t plextv .
```

## Security

- Input validation for all stream URLs
- Rate limiting on API endpoints
- Container network isolation
- Secure handling of authentication credentials

## Support

- **Documentation**: Complete API documentation available
- **Issues**: GitHub issues for bug reports
- **Community**: Community-driven support and feature requests

## License

MIT License - see LICENSE file for details.

---

**PlexTV** - Bridging IPTV streams to Plex with enterprise-grade reliability and user-friendly management.

