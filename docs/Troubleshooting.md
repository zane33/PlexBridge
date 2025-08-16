# PlexBridge Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting information for common PlexBridge issues, organized by category with step-by-step diagnostic procedures and solutions.

## General Diagnostic Steps

### 1. Check Application Health

```bash
# Check overall application health
curl http://localhost:8080/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "uptime": 86400,
  "services": {
    "database": { "status": "healthy" },
    "cache": { "status": "healthy" },
    "ssdp": { "status": "running" }
  }
}
```

### 2. Review Application Logs

```bash
# Docker deployment
docker-compose logs -f plexbridge

# Native deployment
tail -f data/logs/app-$(date +%Y-%m-%d).log

# Check specific log types
tail -f data/logs/error-$(date +%Y-%m-%d).log    # Errors only
tail -f data/logs/streams-$(date +%Y-%m-%d).log  # Stream-related
tail -f data/logs/http-$(date +%Y-%m-%d).log     # HTTP requests
```

### 3. Verify Network Connectivity

```bash
# Test web interface
curl http://localhost:8080/

# Test API endpoints
curl http://localhost:8080/api/channels
curl http://localhost:8080/discover.json

# Check listening ports
sudo netstat -tulpn | grep :8080
sudo netstat -tulpn | grep :1900
```

## Installation & Startup Issues

### Application Won't Start

**Symptoms:**
- Container/process exits immediately
- "Address already in use" errors
- Database connection failures
- Permission denied errors

**Diagnostic Steps:**
```bash
# Check if port is already in use
sudo netstat -tulpn | grep :8080
sudo lsof -i :8080

# Check Docker container status
docker-compose ps
docker-compose logs plexbridge

# Check file permissions (native installation)
ls -la data/
ls -la data/database/
```

**Common Solutions:**

**Port Conflicts:**
```bash
# Kill process using port 8080
sudo kill $(sudo lsof -t -i:8080)

# Or change PlexBridge port
export PORT=8081
# Then restart application
```

**Permission Issues:**
```bash
# Fix data directory permissions
sudo chown -R $USER:$USER data/
chmod -R 755 data/

# For Docker
sudo chown -R 1000:1000 data/
```

**Database Issues:**
```bash
# Check database file
ls -la data/database/plextv.db

# Test database connectivity
sqlite3 data/database/plextv.db ".tables"

# Reset database (WARNING: Deletes all data)
rm data/database/plextv.db
# Restart application to recreate
```

### Docker-Specific Issues

**Container Won't Start:**
```bash
# Check Docker daemon
sudo systemctl status docker

# Check available resources
docker system df
docker system prune  # Clean up if needed

# Rebuild container
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Volume Mount Issues:**
```bash
# Check volume mounts
docker inspect plexbridge | grep -A 10 Mounts

# Fix SELinux context (Red Hat/CentOS)
sudo setsebool -P container_manage_cgroup on
sudo chcon -Rt svirt_sandbox_file_t data/
```

**Network Issues:**
```bash
# Check Docker networks
docker network ls
docker network inspect plexbridge_default

# Test container networking
docker exec plexbridge ping host.docker.internal
docker exec plexbridge curl http://localhost:8080/health
```

## Plex Integration Issues

### Plex Cannot Discover PlexBridge

**Symptoms:**
- PlexBridge not visible in Plex DVR setup
- Manual device addition fails
- "No tuners found" message

**Diagnostic Steps:**
```bash
# Test SSDP functionality
curl http://localhost:8080/discover.json

# Check SSDP port accessibility
sudo netstat -ulpn | grep :1900

# Test multicast capability
ping 239.255.255.250

# Check if SSDP service is running
curl http://localhost:8080/health | jq '.services.ssdp'
```

**Solutions:**

**SSDP Service Issues:**
```bash
# Check PlexBridge logs for SSDP errors
docker-compose logs plexbridge | grep -i ssdp

# Restart PlexBridge to restart SSDP
docker-compose restart plexbridge

# Verify SSDP response format
curl -s http://localhost:8080/discover.json | jq .
```

**Network Configuration:**
```bash
# Ensure same network subnet
ip route show default  # PlexBridge network
# Compare with Plex server network

# Check firewall rules
sudo ufw status
sudo iptables -L | grep 1900

# Allow SSDP traffic
sudo ufw allow 1900/udp
sudo iptables -A INPUT -p udp --dport 1900 -j ACCEPT
```

**Manual Plex Configuration:**
If auto-discovery fails, configure manually in Plex:
1. Go to Settings > Live TV & DVR > Set up Plex DVR
2. Select "Manual Setup"
3. Choose "HDHomeRun"
4. Enter: `http://[plexbridge-ip]:8080/discover.json`

### Channel Lineup Issues

**Symptoms:**
- Empty channel list in Plex
- Channels missing from lineup
- Channel numbers incorrect

**Diagnostic Steps:**
```bash
# Test channel lineup endpoint
curl http://localhost:8080/lineup.json

# Check channel configuration
curl http://localhost:8080/api/channels

# Verify channels have streams
curl http://localhost:8080/api/streams
```

**Solutions:**

**Empty Lineup:**
```bash
# Check if channels are enabled
curl http://localhost:8080/api/channels | jq '.[] | select(.enabled == 1)'

# Verify channels have active streams
curl http://localhost:8080/api/channels | jq '.[] | select(.stream_count > 0)'

# Check lineup cache
curl http://localhost:8080/lineup.json | jq .
```

**Missing Channels:**
1. Ensure channels are enabled in PlexBridge web interface
2. Verify each channel has at least one enabled stream
3. Check channel numbers are unique and valid (1-9999)
4. Restart Plex Media Server after changes

## Streaming Issues

### Streams Won't Play

**Symptoms:**
- Channels appear in Plex but won't play
- Playback starts then stops
- Buffering issues
- "Source not available" errors

**Diagnostic Steps:**
```bash
# Test stream endpoint directly
curl -I http://localhost:8080/stream/[channel-id]

# Check stream validation
curl -X POST http://localhost:8080/api/streams/validate \
  -H "Content-Type: application/json" \
  -d '{"url":"your-stream-url","type":"hls"}'

# Monitor stream logs
docker-compose logs -f plexbridge | grep -i stream

# Test source stream directly
curl -I "your-iptv-stream-url"
ffprobe -v quiet "your-iptv-stream-url"
```

**Common Solutions:**

**Stream URL Issues:**
```bash
# Validate stream URLs in web interface
# Go to Streams section, click "Validate" for each stream

# Test with different protocols
# Try backup URLs if configured
```

**Network Connectivity:**
```bash
# Test connectivity to IPTV source
telnet iptv-host 80   # For HTTP streams
telnet iptv-host 554  # For RTSP streams

# Check DNS resolution
nslookup iptv-hostname
dig iptv-hostname

# Test with curl
curl -v --max-time 10 "your-stream-url"
```

**FFmpeg Issues:**
```bash
# Check FFmpeg availability
docker exec plexbridge which ffmpeg
ffmpeg -version

# Test transcoding manually
ffmpeg -i "your-stream-url" -t 10 -f mpegts test.ts

# Check FFmpeg logs in application logs
docker-compose logs plexbridge | grep -i ffmpeg
```

### Stream Performance Issues

**Symptoms:**
- Buffering during playback
- Poor video quality
- Audio/video sync issues
- High CPU usage

**Diagnostic Steps:**
```bash
# Check system resources
docker stats plexbridge

# Monitor active streams
curl http://localhost:8080/api/streams/active

# Check network bandwidth
iftop -i eth0  # Monitor interface traffic
```

**Solutions:**

**Resource Optimization:**
```json
// Reduce concurrent streams
{
  "streams": {
    "maxConcurrent": 5,
    "transcodeEnabled": false,
    "bufferSize": 32768
  }
}
```

**Network Optimization:**
```json
// Optimize for bandwidth
{
  "protocols": {
    "http": {
      "timeout": 15000
    },
    "rtsp": {
      "transport": "udp",
      "timeout": 5000
    }
  }
}
```

## EPG (Program Guide) Issues

### EPG Data Not Loading

**Symptoms:**
- No program information in Plex
- EPG refresh failures
- Missing program data

**Diagnostic Steps:**
```bash
# Check EPG sources
curl http://localhost:8080/api/epg/sources

# Test EPG source manually
curl -I "your-epg-xmltv-url"
curl "your-epg-xmltv-url" | head -n 20

# Check EPG logs
docker-compose logs plexbridge | grep -i epg

# Check EPG data in database
sqlite3 data/database/plextv.db "SELECT COUNT(*) FROM epg_programs;"
```

**Solutions:**

**EPG Source Issues:**
```bash
# Validate XMLTV format
xmllint --format "your-epg-file.xml" | head -n 50

# Check source accessibility
curl -v --max-time 30 "your-epg-url"

# Manual EPG refresh
curl -X POST http://localhost:8080/api/epg/refresh
```

**Channel Mapping Issues:**
1. Verify EPG channel IDs match configured channel EPG IDs
2. Check channel mapping in web interface
3. Use auto-mapping feature for common channels
4. Manually map channels if auto-mapping fails

### EPG Refresh Failures

**Common Causes and Solutions:**

**URL Issues:**
- Verify EPG source URL is accessible
- Check if authentication is required
- Test with different EPG sources

**Format Issues:**
- Ensure XMLTV format compliance
- Check character encoding (UTF-8)
- Validate XML structure

**Size Issues:**
```json
// Increase size limits
{
  "epg": {
    "maxFileSize": 209715200,  // 200MB
    "timeout": 120000          // 2 minutes
  }
}
```

## Database Issues

### Database Corruption

**Symptoms:**
- "Database is locked" errors
- Inconsistent data
- Application crashes on database operations

**Diagnostic Steps:**
```bash
# Check database integrity
sqlite3 data/database/plextv.db "PRAGMA integrity_check;"

# Check database file
ls -la data/database/
file data/database/plextv.db

# Check database schema
sqlite3 data/database/plextv.db ".schema"
```

**Solutions:**

**Database Recovery:**
```bash
# Stop application
docker-compose stop plexbridge

# Backup current database
cp data/database/plextv.db data/database/plextv.db.backup

# Try database repair
sqlite3 data/database/plextv.db "REINDEX;"
sqlite3 data/database/plextv.db "VACUUM;"

# If repair fails, restore from backup or recreate
rm data/database/plextv.db
docker-compose start plexbridge
```

**Prevent Future Issues:**
```json
// Optimize database settings
{
  "database": {
    "options": {
      "busyTimeout": 60000,
      "journalMode": "WAL",
      "synchronous": "NORMAL"
    }
  }
}
```

### Database Performance Issues

**Symptoms:**
- Slow application response
- High database CPU usage
- Timeout errors

**Solutions:**
```bash
# Optimize database
sqlite3 data/database/plextv.db "ANALYZE;"
sqlite3 data/database/plextv.db "VACUUM;"

# Check database size
du -sh data/database/plextv.db

# Monitor database performance
sqlite3 data/database/plextv.db ".timer on" ".stats on"
```

## Cache Issues

### Redis Connection Problems

**Symptoms:**
- Cache service shows as unhealthy
- Slow application performance
- "Redis connection failed" errors

**Diagnostic Steps:**
```bash
# Test Redis connectivity
redis-cli -h localhost -p 6379 ping

# Check Redis status
docker-compose logs redis

# Test from PlexBridge container
docker exec plexbridge redis-cli -h redis -p 6379 ping
```

**Solutions:**

**Redis Service Issues:**
```bash
# Restart Redis
docker-compose restart redis

# Check Redis logs
docker-compose logs redis

# Clear Redis data if corrupted
docker-compose stop redis
docker volume rm plexbridge_redis-data
docker-compose start redis
```

**Memory Cache Fallback:**
PlexBridge automatically falls back to memory cache when Redis is unavailable:
```bash
# Check cache status
curl http://localhost:8080/health | jq '.cache'

# Should show "MemoryService" if Redis unavailable
```

## Web Interface Issues

### Interface Won't Load

**Symptoms:**
- Blank page in browser
- JavaScript errors
- "Cannot connect to server" messages

**Diagnostic Steps:**
```bash
# Check if web server is running
curl http://localhost:8080/

# Check static file serving
curl http://localhost:8080/static/js/main.js

# Check browser console for errors
# Open browser developer tools (F12)
```

**Solutions:**

**Frontend Build Issues:**
```bash
# Rebuild frontend (native installation)
cd client
npm install
npm run build
cd ..

# Restart application
npm start
```

**Server Configuration:**
```bash
# Check if static files are served correctly
ls -la client/build/

# Verify Express static middleware
curl -I http://localhost:8080/static/css/main.css
```

### Real-time Updates Not Working

**Symptoms:**
- Dashboard doesn't update
- Log viewer static
- Changes not reflected immediately

**Diagnostic Steps:**
```bash
# Check WebSocket connection in browser console
# Should see successful WebSocket connection

# Test Socket.IO endpoint
curl http://localhost:8080/socket.io/

# Check application logs for socket errors
docker-compose logs plexbridge | grep -i socket
```

**Solutions:**

**WebSocket Configuration:**
- Check firewall allows WebSocket connections
- Verify reverse proxy WebSocket support (if applicable)
- Test with different browsers

**CORS Issues:**
```json
// Update CORS configuration
{
  "server": {
    "allowedOrigins": [
      "http://localhost:3000",
      "https://yourdomain.com"
    ]
  }
}
```

## Performance Issues

### High CPU Usage

**Diagnostic Steps:**
```bash
# Monitor CPU usage
top -p $(pgrep node)
docker stats plexbridge

# Check for CPU-intensive operations
docker-compose logs plexbridge | grep -i "high cpu\|performance"
```

**Solutions:**
```json
// Optimize for CPU usage
{
  "streams": {
    "maxConcurrent": 5,
    "transcodeEnabled": false
  },
  "logging": {
    "level": "warn"
  }
}
```

### High Memory Usage

**Diagnostic Steps:**
```bash
# Check memory usage
free -h
docker stats plexbridge

# Check for memory leaks
curl http://localhost:8080/health | jq '.memory'
```

**Solutions:**
```json
// Optimize memory usage
{
  "cache": {
    "ttl": {
      "epg": 1800,
      "streams": 300
    }
  },
  "database": {
    "options": {
      "cacheSize": -32000
    }
  }
}
```

## Network Issues

### Firewall Configuration

**Required Ports:**
```bash
# Allow PlexBridge ports
sudo ufw allow 8080/tcp   # Web interface
sudo ufw allow 1900/udp   # SSDP discovery

# For iptables
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 1900 -j ACCEPT
```

### Router Configuration

**Port Forwarding (if needed):**
- Forward port 8080 to PlexBridge server
- Ensure UPnP is enabled for SSDP discovery
- Configure static IP for PlexBridge server

**Network Troubleshooting:**
```bash
# Test connectivity between Plex and PlexBridge
ping [plexbridge-ip]
telnet [plexbridge-ip] 8080

# Check routing
traceroute [plexbridge-ip]
ip route show
```

## Getting Additional Help

### Enable Debug Logging

```bash
# Enable debug mode
export LOG_LEVEL=debug
docker-compose restart plexbridge

# Or via configuration
{
  "logging": {
    "level": "debug"
  }
}
```

### Collect Diagnostic Information

```bash
# System information
uname -a
docker --version
docker-compose --version

# Application health
curl http://localhost:8080/health | jq .

# Configuration
curl http://localhost:8080/api/settings | jq .

# Recent logs
docker-compose logs --tail=100 plexbridge
```

### Submit Issue Reports

When seeking help, include:
1. PlexBridge version
2. Operating system and Docker version
3. Complete error messages
4. Application health check output
5. Relevant log entries
6. Configuration (remove sensitive data)

For more information, see:
- [Setup Guide](Setup.md) for installation help
- [Configuration Reference](Configuration.md) for detailed configuration options
- [Development Guide](../DEVELOPMENT.md) for development-related issues