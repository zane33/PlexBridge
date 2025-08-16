# PlexBridge Setup & Installation Guide

## Overview

This guide provides step-by-step instructions for setting up PlexBridge to integrate IPTV streams with Plex Media Server. PlexBridge supports both development and production deployments with Docker being the recommended approach for production use.

## Prerequisites

### System Requirements

**Minimum Requirements:**
- **CPU**: 2 cores (Intel/AMD 64-bit)
- **RAM**: 2GB (4GB recommended)
- **Storage**: 10GB available space
- **Network**: Stable internet connection with access to IPTV sources

**Software Requirements:**
- **Docker & Docker Compose** (recommended) OR **Node.js 18+**
- **Network Ports**: 8080/tcp (web interface), 1900/udp (SSDP discovery)
- **Operating Systems**: Linux, macOS, Windows (with WSL2 for Docker)

### Network Configuration

**Firewall Requirements:**
```bash
# Inbound ports
8080/tcp  # PlexBridge web interface and API
1900/udp  # SSDP discovery for Plex integration

# Outbound ports (for IPTV sources)
80/tcp    # HTTP streams
443/tcp   # HTTPS streams  
554/tcp   # RTSP streams
1935/tcp  # RTMP streams
```

**Network Topology:**
- PlexBridge and Plex Media Server should be on the same network subnet
- Ensure multicast support for SSDP discovery (most home networks support this)
- Static IP assignment recommended for server deployments

## Installation Methods

### Method 1: Docker Deployment (Recommended)

Docker provides the easiest and most reliable deployment method with all dependencies included.

#### 1. Install Docker

**Linux (Ubuntu/Debian):**
```bash
# Update package index
sudo apt update

# Install Docker
sudo apt install docker.io docker-compose

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group (optional, allows non-root usage)
sudo usermod -aG docker $USER
```

**macOS:**
```bash
# Install Docker Desktop
brew install --cask docker

# Or download from: https://www.docker.com/products/docker-desktop
```

**Windows:**
```powershell
# Install Docker Desktop with WSL2 backend
# Download from: https://www.docker.com/products/docker-desktop

# Enable WSL2 feature
wsl --install
```

#### 2. Download PlexBridge

```bash
# Clone the repository
git clone https://github.com/your-repo/plexbridge.git
cd plexbridge

# Or download and extract ZIP file
wget https://github.com/your-repo/plexbridge/archive/main.zip
unzip main.zip && cd plexbridge-main
```

#### 3. Configure Environment

**Create docker-compose.yml:**
```yaml
version: '3.8'

services:
  plexbridge:
    build: .
    container_name: plexbridge
    restart: unless-stopped
    ports:
      - "8080:8080"      # Web interface
      - "1900:1900/udp"  # SSDP discovery
    volumes:
      - ./data:/data     # Persistent data
      - ./config:/app/config:ro  # Configuration files
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - MAX_CONCURRENT_STREAMS=10
    networks:
      - plexbridge-network

  redis:
    image: redis:7-alpine
    container_name: plexbridge-redis
    restart: unless-stopped
    volumes:
      - redis-data:/data
    networks:
      - plexbridge-network

networks:
  plexbridge-network:
    driver: bridge

volumes:
  redis-data:
```

**Create configuration directory:**
```bash
# Create required directories
mkdir -p {data,config,data/database,data/logs,data/cache,data/logos}

# Create basic configuration (optional)
cat > config/local.json << EOF
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0"
  },
  "streams": {
    "maxConcurrent": 10,
    "transcodeEnabled": true
  },
  "ssdp": {
    "friendlyName": "PlexBridge",
    "deviceUuid": "$(uuidgen)"
  },
  "cache": {
    "host": "redis",
    "port": 6379
  }
}
EOF
```

#### 4. Start Services

```bash
# Build and start containers
docker-compose up -d

# Verify containers are running
docker-compose ps

# View logs
docker-compose logs -f plexbridge
```

#### 5. Verify Installation

```bash
# Check application health
curl http://localhost:8080/health

# Test Plex discovery endpoint
curl http://localhost:8080/discover.json

# Access web interface
open http://localhost:8080  # macOS
# or visit http://localhost:8080 in browser
```

### Method 2: Native Node.js Installation

For development or when Docker is not available.

#### 1. Install Node.js

**Linux (Ubuntu/Debian):**
```bash
# Install Node.js 18.x LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be 18.x
npm --version   # Should be 8.x or higher
```

**macOS:**
```bash
# Using Homebrew
brew install node@18

# Or using Node Version Manager
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Windows:**
```powershell
# Download and install from nodejs.org
# Or using Chocolatey
choco install nodejs --version=18.19.0
```

#### 2. Install System Dependencies

**Linux:**
```bash
# Install FFmpeg for stream processing
sudo apt update
sudo apt install ffmpeg

# Install SQLite tools (optional, for debugging)
sudo apt install sqlite3

# Install Redis (optional, improves performance)
sudo apt install redis-server
sudo systemctl start redis-server
```

**macOS:**
```bash
# Install FFmpeg
brew install ffmpeg

# Install Redis (optional)
brew install redis
brew services start redis
```

#### 3. Install PlexBridge

```bash
# Clone and setup
git clone https://github.com/your-repo/plexbridge.git
cd plexbridge

# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..

# Build frontend for production
npm run build
```

#### 4. Configure Application

```bash
# Create data directories
mkdir -p data/{database,logs,cache,logos}

# Create configuration file
cat > config/local.json << EOF
{
  "server": {
    "port": 8080
  },
  "database": {
    "path": "./data/database/plextv.db"
  },
  "logging": {
    "level": "info",
    "path": "./data/logs"
  },
  "cache": {
    "host": "localhost",
    "port": 6379
  }
}
EOF
```

#### 5. Start Application

```bash
# Development mode (with hot reload)
npm run dev

# Production mode (with PM2)
npm start

# Manual production start
NODE_ENV=production node server/index.js
```

## Initial Configuration

### 1. Access Web Interface

Navigate to `http://localhost:8080` to access the PlexBridge management interface.

**Default Interface Sections:**
- **Dashboard**: System overview and real-time metrics
- **Channels**: TV channel configuration and management
- **Streams**: IPTV source configuration
- **EPG**: Electronic Program Guide setup
- **Settings**: Application configuration
- **Logs**: Real-time application logs

### 2. Configure Your First Channel

**Step 1: Create a Channel**
1. Go to "Channels" section
2. Click "Add Channel"
3. Fill in channel details:
   ```
   Name: CNN HD
   Number: 101
   EPG ID: cnn.us (optional)
   Logo URL: https://example.com/cnn-logo.png (optional)
   ```
4. Save the channel

**Step 2: Add Stream Source**
1. Go to "Streams" section
2. Click "Add Stream"
3. Configure stream details:
   ```
   Channel: CNN HD (select from dropdown)
   Stream Name: CNN Primary
   URL: https://cnn-live.example.com/playlist.m3u8
   Type: HLS (auto-detected)
   ```
4. Test the stream using "Validate" button
5. Save the stream

**Step 3: Verify Configuration**
1. Check Dashboard for active services
2. Test stream endpoint: `http://localhost:8080/stream/{channel-id}`
3. Verify channel lineup: `http://localhost:8080/lineup.json`

### 3. Configure EPG (Optional but Recommended)

**Add EPG Source:**
1. Go to "EPG Manager"
2. Click "Add EPG Source"
3. Configure EPG details:
   ```
   Name: TV Guide Source
   URL: https://epg.example.com/xmltv.xml
   Refresh Interval: 4h
   ```
4. Save and trigger initial refresh
5. Map channels to EPG programs in the interface

## Plex Media Server Integration

### 1. Enable Plex DVR

1. Open Plex Web Interface
2. Navigate to Settings > Live TV & DVR
3. Click "Set up Plex DVR"
4. Plex should auto-discover "PlexBridge" as an available tuner

### 2. Configure Tuner in Plex

**If Auto-Discovery Works:**
1. Select "PlexBridge" from detected devices
2. Follow Plex setup wizard
3. Select channels to enable
4. Configure EPG source (if configured in PlexBridge)

**If Manual Configuration Required:**
1. Select "Manual Configuration"
2. Enter PlexBridge details:
   ```
   Device Type: HDHomeRun
   Device URL: http://[plexbridge-ip]:8080/discover.json
   ```
3. Complete setup wizard

### 3. Verify Integration

1. Check Plex Live TV section for available channels
2. Test playback of a live channel
3. Verify EPG data appears (if configured)
4. Monitor PlexBridge logs for stream requests

## Advanced Configuration

### Environment Variables

**Production Deployment Variables:**
```bash
# Core settings
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# Database & caching
DB_PATH=/data/database/plextv.db
REDIS_HOST=redis
REDIS_PORT=6379

# Streaming configuration
MAX_CONCURRENT_STREAMS=10
FFMPEG_PATH=/usr/bin/ffmpeg
TRANSCODE_ENABLED=true
STREAM_TIMEOUT=30000

# SSDP discovery
DEVICE_UUID=your-unique-uuid
FRIENDLY_NAME=PlexBridge
SSDP_PORT=1900

# Security
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### Performance Tuning

**For High Stream Counts:**
```json
{
  "streams": {
    "maxConcurrent": 20,
    "bufferSize": 131072,
    "transcodeEnabled": false
  },
  "cache": {
    "ttl": {
      "streams": 600,
      "epg": 7200
    }
  },
  "database": {
    "options": {
      "cacheSize": -128000
    }
  }
}
```

**For Low-Resource Systems:**
```json
{
  "streams": {
    "maxConcurrent": 5,
    "transcodeEnabled": false
  },
  "logging": {
    "level": "warn"
  },
  "cache": {
    "enabled": false
  }
}
```

## Troubleshooting Setup Issues

### Common Installation Problems

**Docker Issues:**
```bash
# Permission denied
sudo usermod -aG docker $USER
# Then logout/login

# Port conflicts
sudo netstat -tulpn | grep :8080
# Kill conflicting processes or change port

# Container won't start
docker-compose logs plexbridge
# Check logs for specific error messages
```

**Node.js Issues:**
```bash
# Node version too old
node --version
# Install Node 18+ if version is lower

# Permission errors
sudo chown -R $USER:$USER data/
chmod 755 data/

# FFmpeg not found
which ffmpeg
# Install ffmpeg if not present
```

### Network Connectivity Issues

**SSDP Discovery Not Working:**
```bash
# Test multicast capability
ping 239.255.255.250

# Check firewall
sudo ufw allow 1900/udp

# Test SSDP response
curl http://localhost:8080/discover.json
```

**Stream Playback Issues:**
```bash
# Test stream directly
curl -I "your-iptv-stream-url"

# Test with FFmpeg
ffprobe -v quiet "your-iptv-stream-url"

# Check PlexBridge logs
docker-compose logs -f plexbridge | grep stream
```

### Verification Checklist

- [ ] PlexBridge web interface accessible at http://localhost:8080
- [ ] Health check returns "healthy" status
- [ ] At least one channel and stream configured
- [ ] Stream validation passes in web interface
- [ ] Plex discovers PlexBridge as tuner device
- [ ] Live TV playback works in Plex
- [ ] EPG data appears if configured
- [ ] Logs show no critical errors

## Next Steps

After successful installation:

1. **Add More Channels**: Import M3U playlists or add channels manually
2. **Configure EPG**: Set up Electronic Program Guide for better Plex integration
3. **Optimize Performance**: Tune settings based on your hardware and stream count
4. **Set Up Monitoring**: Configure log monitoring and health checks
5. **Backup Configuration**: Regular backups of data directory and configuration

For additional help, see the [Troubleshooting Guide](Troubleshooting.md) and [Configuration Reference](Configuration.md).