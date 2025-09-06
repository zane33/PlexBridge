# PlexBridge Documentation

This directory contains comprehensive documentation for the PlexBridge application - an IPTV to Plex Bridge Interface.

## ⚠️ CRITICAL: Start Here First

**🚨 [Direct Play Warning](Direct-Play-Warning.md)** - **MUST READ FOR RELIABLE STREAMING**
- Why Direct Play MUST be disabled for Live TV
- Technical explanation of stability issues
- Performance impact analysis
- **This configuration is critical for Android TV and local client stability**

## Documentation Structure

### Core Documentation
- **[Architecture.md](Architecture.md)** - System architecture, components, and design patterns
- **[API.md](API.md)** - Complete API reference and endpoint documentation
- **[Configuration.md](Configuration.md)** - Configuration options and environment variables
- **[Troubleshooting.md](Troubleshooting.md)** - Common issues and solutions

### Streaming & Integration
- **[Streaming-Architecture-Guide.md](Streaming-Architecture-Guide.md)** - 🔥 **Comprehensive streaming pipeline documentation**
  - Complete Plex → PlexBridge → IPTV flow
  - FFmpeg configurations and optimizations
  - Critical implementation details and fixes
  - Performance tuning and troubleshooting
- **[Plex-Metadata-System.md](Plex-Metadata-System.md)** - 🆕 **Metadata handling to prevent crashes**
  - Complete metadata endpoint documentation
  - Session and consumer management
  - Error prevention strategies
  - Troubleshooting metadata issues
- **[Plex-Live-TV-Integration.md](Plex-Live-TV-Integration.md)** - Plex Live TV & DVR setup guide
- **[Plex-Live-TV-Streaming-Technical-Guide.md](Plex-Live-TV-Streaming-Technical-Guide.md)** - Technical streaming details

### Deployment & Setup
- **[Docker-Deployment-Guide.md](Docker-Deployment-Guide.md)** - Docker deployment instructions
- **[Quick-Deployment-Reference.md](Quick-Deployment-Reference.md)** - Quick start guide
- **[Setup.md](Setup.md)** - Initial setup and configuration

### Technical Details
- **[Networking.md](Networking.md)** - Network architecture, ports, and protocols
- **[M3U_IMPORT_API.md](M3U_IMPORT_API.md)** - M3U playlist import API
- **[M3U_Performance_Optimizations.md](M3U_Performance_Optimizations.md)** - M3U parsing optimizations
- **[GUI.md](GUI.md)** - Web interface documentation

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

1. **🚨 READ FIRST**: [Direct Play Warning](Direct-Play-Warning.md) - Critical for streaming stability
2. Read [Architecture.md](Architecture.md) for system overview
3. Check [Networking.md](Networking.md) for network requirements
4. Follow [Docker-Deployment-Guide.md](Docker-Deployment-Guide.md) for installation
5. Reference [Configuration.md](Configuration.md) for customization
6. Use [API.md](API.md) for integration details

## Support

For detailed troubleshooting, see [Troubleshooting.md](Troubleshooting.md).
For development information, see [Development.md](Development.md).
