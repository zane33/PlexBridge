# PlexTV Documentation

This directory contains comprehensive documentation for the PlexTV application - an IPTV to Plex Bridge Interface.

## Documentation Structure

- **[Architecture.md](Architecture.md)** - System architecture, components, and design patterns
- **[API.md](API.md)** - Complete API reference and endpoint documentation
- **[Networking.md](Networking.md)** - Network architecture, ports, and protocols
- **[Database.md](Database.md)** - Database schema, models, and data flow
- **[Streaming.md](Streaming.md)** - Stream management, protocols, and media handling
- **[Configuration.md](Configuration.md)** - Configuration options and environment variables
- **[Deployment.md](Deployment.md)** - Deployment guides and production setup
- **[Development.md](Development.md)** - Development setup and contributing guidelines
- **[Troubleshooting.md](Troubleshooting.md)** - Common issues and solutions

## Quick Reference

### System Overview
PlexTV is a containerized Node.js application that bridges IPTV streams with Plex Media Server by emulating an HDHomeRun tuner device.

### Key Components
- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: React + Material-UI
- **Database**: SQLite + Redis caching
- **Streaming**: FFmpeg + universal protocol support
- **Discovery**: SSDP protocol for Plex integration

### Supported IPTV Protocols
- HLS (HTTP Live Streaming)
- DASH (Dynamic Adaptive Streaming)
- RTSP (Real-Time Streaming Protocol)
- RTMP (Real-Time Messaging Protocol)
- UDP/Multicast streams
- HTTP/HTTPS direct streams
- MMS (Microsoft Media Server)
- SRT (Secure Reliable Transport)

### Network Ports
- **8080/tcp** - Web interface and API
- **1900/udp** - SSDP discovery protocol
- **554/tcp** - RTSP streams (when applicable)
- **1935/tcp** - RTMP streams (when applicable)

## Getting Started

1. Read [Architecture.md](Architecture.md) for system overview
2. Check [Networking.md](Networking.md) for network requirements
3. Follow [Deployment.md](Deployment.md) for installation
4. Reference [Configuration.md](Configuration.md) for customization
5. Use [API.md](API.md) for integration details

## Support

For detailed troubleshooting, see [Troubleshooting.md](Troubleshooting.md).
For development information, see [Development.md](Development.md).
