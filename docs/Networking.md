# PlexTV Networking Documentation

## Network Architecture Overview

PlexTV operates as a network bridge between Plex Media Server and IPTV sources, utilizing multiple protocols and ports for different communication channels.

```
Internet ──► IPTV Sources ──► PlexTV ──► Plex Media Server ──► Client Devices
    │             │             │            │                    │
    │             │             │            │                    │
Multiple      Various IPTV   Docker      Local Network        Streaming
Protocols     Protocols      Container   Discovery            Clients
```

## Port Configuration

### Primary Application Ports

| Port | Protocol | Service | Description | Required |
|------|----------|---------|-------------|----------|
| **8080** | TCP | HTTP/WebSocket | Web GUI, REST API, Stream Proxy | **Yes** |
| **1900** | UDP | SSDP | UPnP device discovery for Plex | **Yes** |

### IPTV Protocol Ports (Outbound)

| Port Range | Protocol | Service | Description | Usage |
|------------|----------|---------|-------------|-------|
| **80, 443** | TCP | HTTP/HTTPS | HLS, DASH, HTTP streams | Common |
| **554** | TCP | RTSP | Real-Time Streaming Protocol | Common |
| **1935** | TCP | RTMP | Real-Time Messaging Protocol | Less Common |
| **8000-8010** | TCP | Various | Alternative HTTP streaming ports | Variable |
| **Any** | UDP | Multicast | UDP/Multicast IPTV streams | Variable |

### Internal Container Ports

| Port | Service | Description |
|------|---------|-------------|
| 6379 | Redis | Cache service (internal only) |
| 8080 | PlexTV | Application server |

## Network Protocols

### 1. SSDP (Simple Service Discovery Protocol)

#### Purpose
Enables Plex Media Server to automatically discover PlexTV as a network tuner device.

#### Implementation Details
```javascript
// SSDP Configuration
const ssdpConfig = {
  port: 1900,                    // Standard SSDP port
  multicastAddress: '239.255.255.250',
  interval: 1800000,             // 30-minute announcements
  deviceType: 'urn:schemas-upnp-org:device:MediaServer:1',
  location: 'http://{host}:8080/device.xml'
};
```

#### Message Flow
```
1. SSDP NOTIFY (Multicast) ──► All Network Devices
2. Plex M-SEARCH Request ──► PlexTV Response
3. Device Description ──► XML Metadata
4. Service Discovery ──► Capability Exchange
```

#### Network Requirements
- **Multicast Support**: Network must support UDP multicast
- **Port 1900 Open**: For SSDP discovery messages
- **Same Subnet**: Plex and PlexTV should be on same network segment

### 2. HDHomeRun Emulation Protocol

#### Endpoint Structure
```javascript
// HDHomeRun Compatible Endpoints
const hdhrEndpoints = {
  discovery: 'GET /discover.json',        // Device information
  lineup: 'GET /lineup.json',             // Channel lineup
  status: 'GET /lineup_status.json',      // Tuner status
  device: 'GET /device.xml',              // UPnP device description
  stream: 'GET /stream/{channelId}'       // Live stream proxy
};
```

#### Response Formats
```json
// /discover.json
{
  "FriendlyName": "PlexTV",
  "ModelNumber": "1.0",
  "FirmwareName": "PlexTV Bridge", 
  "TunerCount": 10,
  "DeviceID": "12345678",
  "DeviceAuth": "test1234",
  "BaseURL": "http://192.168.1.100:8080",
  "LineupURL": "http://192.168.1.100:8080/lineup.json"
}

// /lineup.json
[
  {
    "GuideNumber": "101",
    "GuideName": "CNN HD",
    "URL": "http://192.168.1.100:8080/stream/channel-uuid"
  }
]
```

### 3. IPTV Streaming Protocols

#### HLS (HTTP Live Streaming)
```javascript
// HLS Implementation
const hlsConfig = {
  protocol: 'HTTPS/HTTP',
  port: '80, 443',
  format: 'M3U8 playlists + TS segments',
  features: [
    'Adaptive bitrate streaming',
    'Segment-based delivery', 
    'Playlist validation',
    'Segment caching'
  ]
};
```

#### RTSP (Real-Time Streaming Protocol)
```javascript
// RTSP Implementation  
const rtspConfig = {
  protocol: 'TCP/UDP',
  port: '554 (default)',
  transport: 'RTP/RTCP',
  features: [
    'Real-time streaming',
    'Authentication support',
    'Transport negotiation',
    'Session management'
  ]
};
```

#### RTMP (Real-Time Messaging Protocol)
```javascript
// RTMP Implementation
const rtmpConfig = {
  protocol: 'TCP',
  port: '1935 (default)',
  format: 'FLV containers',
  features: [
    'Live streaming',
    'Low latency',
    'Authentication',
    'Encrypted variants (RTMPS)'
  ]
};
```

#### UDP/Multicast Streaming
```javascript
// UDP Configuration
const udpConfig = {
  protocol: 'UDP',
  addressing: 'Unicast/Multicast',
  features: [
    'Low latency',
    'Broadcast distribution',
    'Interface binding',
    'Source-specific multicast'
  ]
};
```

## Docker Networking

### Container Network Configuration
```yaml
# docker-compose.yml networking
networks:
  plextv-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Port Mapping Strategy
```yaml
# Production port mapping
services:
  plextv:
    ports:
      - "8080:8080"      # HTTP/API access
      - "1900:1900/udp"  # SSDP discovery
    networks:
      - plextv-network
```

### Network Security
```yaml
# Security configurations
services:
  plextv:
    networks:
      plextv-network:
        aliases:
          - plextv-app
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE  # For port 1900
```

## Firewall Configuration

### Required Firewall Rules

#### Inbound Rules
```bash
# Allow web interface access
iptables -A INPUT -p tcp --dport 8080 -j ACCEPT

# Allow SSDP discovery
iptables -A INPUT -p udp --dport 1900 -j ACCEPT

# Allow established connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
```

#### Outbound Rules
```bash
# Allow HTTP/HTTPS for HLS/DASH streams
iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

# Allow RTSP streams
iptables -A OUTPUT -p tcp --dport 554 -j ACCEPT

# Allow RTMP streams  
iptables -A OUTPUT -p tcp --dport 1935 -j ACCEPT

# Allow DNS resolution
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Allow NTP synchronization
iptables -A OUTPUT -p udp --dport 123 -j ACCEPT
```

### UFW Configuration (Ubuntu)
```bash
# Enable UFW
sudo ufw enable

# Allow PlexTV ports
sudo ufw allow 8080/tcp comment "PlexTV Web Interface"
sudo ufw allow 1900/udp comment "PlexTV SSDP Discovery"

# Allow outbound streaming protocols
sudo ufw allow out 80/tcp comment "HTTP Streams"
sudo ufw allow out 443/tcp comment "HTTPS Streams" 
sudo ufw allow out 554/tcp comment "RTSP Streams"
sudo ufw allow out 1935/tcp comment "RTMP Streams"
```

## Load Balancing and Scalability

### Horizontal Scaling Considerations
```javascript
// Scaling limitations and solutions
const scalingFactors = {
  ssdp: {
    limitation: 'Single UUID per instance',
    solution: 'Use different UUIDs per instance'
  },
  streams: {
    limitation: 'FFmpeg process limits',
    solution: 'Distribute streams across instances'
  },
  database: {
    limitation: 'SQLite single-writer',
    solution: 'Read replicas or shared PostgreSQL'
  }
};
```

### Load Balancer Configuration
```nginx
# NGINX configuration for PlexTV cluster
upstream plextv_backend {
    # Use IP hash for session affinity
    ip_hash;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}

server {
    listen 80;
    server_name plextv.local;
    
    location / {
        proxy_pass http://plextv_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # SSDP discovery bypass (direct to instance)
    location /discover.json {
        proxy_pass http://192.168.1.10:8080;
    }
}
```

## Network Monitoring

### Bandwidth Monitoring
```javascript
// Built-in network metrics
const networkMetrics = {
  inbound: {
    webTraffic: 'HTTP API requests',
    streamData: 'IPTV source consumption',
    discovery: 'SSDP multicast traffic'
  },
  outbound: {
    streamProxy: 'Data to Plex clients',
    epgSync: 'EPG data downloads',
    monitoring: 'Health check requests'
  }
};
```

### Connection Monitoring
```bash
# Monitor active connections
netstat -tulpn | grep :8080
ss -tulpn | grep :1900

# Monitor Docker network
docker network ls
docker network inspect plextv_plextv-network

# Monitor container networking
docker exec plextv netstat -i
docker exec plextv ss -s
```

## Troubleshooting Network Issues

### Common Network Problems

#### 1. SSDP Discovery Issues
```bash
# Test SSDP functionality
# Send test SSDP search
echo -e "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nST: upnp:rootdevice\r\nMX: 3\r\n\r\n" | nc -u 239.255.255.250 1900

# Check if PlexTV responds
curl http://{plextv-ip}:8080/discover.json
```

#### 2. Stream Connectivity Issues
```bash
# Test stream URLs
ffprobe -v quiet -print_format json -show_format "{stream-url}"

# Test network connectivity to IPTV source
telnet {iptv-host} {iptv-port}
curl -I "{hls-stream-url}"
```

#### 3. Docker Network Issues
```bash
# Inspect Docker networking
docker inspect plextv | grep -A 20 NetworkSettings

# Test container connectivity
docker exec plextv ping 8.8.8.8
docker exec plextv nslookup google.com

# Check port bindings
docker port plextv
```

### Network Diagnostics Tools
```bash
# Install network diagnostic tools in container
docker exec plextv apk add --no-cache \
    tcpdump \
    netcat-openbsd \
    curl \
    bind-tools \
    iperf3

# Capture network traffic
docker exec plextv tcpdump -i eth0 -w /tmp/capture.pcap

# Test bandwidth
docker exec plextv iperf3 -c {test-server}
```

## Security Best Practices

### Network Security Checklist
- [ ] Firewall configured for minimal required ports
- [ ] SSDP limited to local network only
- [ ] Container network isolation enabled
- [ ] No unnecessary port exposures
- [ ] Regular security updates applied
- [ ] TLS/SSL for external communications
- [ ] VPN for remote administration
- [ ] Network monitoring enabled

### Secure Network Configuration
```yaml
# docker-compose.yml security settings
services:
  plextv:
    networks:
      plextv-network:
        aliases:
          - plextv-app
    sysctls:
      - net.ipv4.ip_unprivileged_port_start=0
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=100m
```

This networking documentation provides comprehensive coverage of all network aspects of the PlexTV application, enabling proper deployment, monitoring, and troubleshooting in production environments.
