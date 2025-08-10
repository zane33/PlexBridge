# PlexTV Architecture Documentation

## System Overview

PlexTV is a microservices-based application that acts as a bridge between IPTV streams and Plex Media Server. It emulates an HDHomeRun network tuner, allowing Plex to discover and use IPTV sources as live TV channels.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          PlexTV Application                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐ │
│  │   React GUI     │    │   Express API    │    │ Stream Mgmt │ │
│  │                 │    │                  │    │             │ │
│  │ • Dashboard     │◄──►│ • REST Endpoints │◄──►│ • FFmpeg    │ │
│  │ • Channel Mgr   │    │ • WebSocket      │    │ • Protocols │ │
│  │ • Stream Mgr    │    │ • Authentication │    │ • Validation│ │
│  │ • EPG Manager   │    │ • Rate Limiting  │    │ • Proxying  │ │
│  └─────────────────┘    └──────────────────┘    └─────────────┘ │
│           │                       │                      │      │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐ │
│  │ Socket.IO       │    │  SSDP Service    │    │ EPG Service │ │
│  │                 │    │                  │    │             │ │
│  │ • Real-time     │    │ • Device Disc.   │    │ • XML Parse │ │
│  │ • Metrics       │    │ • HDHomeRun API  │    │ • Scheduling│ │
│  │ • Logs          │    │ • UPnP Protocol  │    │ • Caching   │ │
│  └─────────────────┘    └──────────────────┘    └─────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        Data Layer                               │
│  ┌─────────────────┐                    ┌─────────────────────┐ │
│  │    SQLite       │                    │       Redis         │ │
│  │                 │                    │                     │ │
│  │ • Channels      │                    │ • Stream Cache      │ │
│  │ • Streams       │                    │ • EPG Cache         │ │
│  │ • EPG Programs  │                    │ • API Cache         │ │
│  │ • Settings      │                    │ • Session Cache     │ │
│  │ • Logs          │                    │ • Metrics Cache     │ │
│  └─────────────────┘                    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
           │                                            │
    ┌──────▼──────┐                              ┌──────▼──────┐
    │ Plex Server │                              │IPTV Sources │
    │             │                              │             │
    │ • Discovery │                              │ • HLS/DASH  │
    │ • Channel   │                              │ • RTSP/RTMP │
    │ • EPG Data  │                              │ • UDP/HTTP  │
    │ • Streaming │                              │ • MMS/SRT   │
    └─────────────┘                              └─────────────┘
```

## Component Architecture

### 1. Frontend Layer (React)

#### Core Components
- **Layout**: Navigation, sidebar, responsive design
- **Dashboard**: Real-time metrics, active streams, system health
- **Channel Manager**: CRUD operations for TV channels
- **Stream Manager**: IPTV stream configuration and testing
- **EPG Manager**: Electronic Program Guide management
- **Log Viewer**: Real-time application logs
- **Settings**: Application configuration

#### Technology Stack
```javascript
// Primary Dependencies
React 18.2.0           // UI Framework
Material-UI 5.15.0     // Component Library
React Router 6.20.0    // Client-side routing
Chart.js 4.4.0         // Data visualization
Socket.IO Client 4.7.5 // Real-time communication
Axios 1.6.2            // HTTP client
```

#### State Management
- **Local State**: Component-level state with React hooks
- **Context**: Theme, user preferences, global settings
- **Real-time Updates**: Socket.IO for live data synchronization

### 2. Backend Layer (Node.js)

#### Express Application Structure
```javascript
// server/index.js - Main application entry point
├── Middleware Stack
│   ├── Security (Helmet, CORS)
│   ├── Rate Limiting
│   ├── Compression
│   ├── Logging (Morgan + Winston)
│   └── Body Parsing
├── Route Handlers
│   ├── /api/*     - REST API endpoints
│   ├── /stream/*  - Stream proxy endpoints
│   ├── /epg/*     - EPG data endpoints
│   └── /          - SSDP/HDHomeRun endpoints
└── Error Handling & Graceful Shutdown
```

#### Service Layer Architecture
```javascript
// Service Dependencies and Relationships
StreamManager ──┐
                ├── Database Service
EPGService ─────┤
                ├── Cache Service (Redis)
SSDPService ────┤
                └── Logger Service
CacheService ───┘
```

### 3. Database Layer

#### SQLite Schema
```sql
-- Core Tables
channels          -- TV channel definitions
streams           -- IPTV stream configurations  
epg_programs      -- Electronic program guide data
epg_sources       -- EPG data source URLs
stream_sessions   -- Active streaming sessions
settings          -- Application configuration
logs              -- Application event logs
```

#### Redis Cache Structure
```javascript
// Cache Key Patterns
epg:{channelId}           // EPG data by channel
stream:{streamId}         // Stream metadata
session:{sessionId}       // Active streaming sessions
lineup:channels           // Channel lineup cache
metrics:system           // System metrics cache
```

## Service Architecture Details

### Stream Manager Service

#### Responsibilities
- Universal IPTV protocol detection and validation
- Stream format conversion and transcoding
- Proxy stream data between IPTV sources and Plex
- Session management and resource cleanup
- Error handling and failover

#### Protocol Support Matrix
```javascript
const protocolHandlers = {
  'hls': {
    validation: 'M3U8 manifest parsing',
    proxy: 'HTTP streaming with segment caching',
    features: ['adaptive bitrate', 'segment validation']
  },
  'dash': {
    validation: 'MPD manifest parsing', 
    proxy: 'HTTP streaming with manifest processing',
    features: ['dynamic adaptation', 'multiple representations']
  },
  'rtsp': {
    validation: 'RTSP DESCRIBE request',
    proxy: 'FFmpeg transcoding to MPEG-TS',
    features: ['TCP/UDP transport', 'authentication']
  },
  'rtmp': {
    validation: 'RTMP connection test',
    proxy: 'FFmpeg transcoding pipeline',
    features: ['live streaming', 'authentication']
  },
  'udp': {
    validation: 'Socket connectivity test',
    proxy: 'Direct UDP packet forwarding',
    features: ['multicast support', 'interface binding']
  }
  // ... additional protocols
};
```

### EPG Service

#### XML Processing Pipeline
```javascript
// EPG Processing Flow
XML Download ──► Format Validation ──► Channel Mapping ──► Program Parsing ──► Database Storage
     │                    │                   │                    │                │
     ├─ HTTP client       ├─ XMLTV schema    ├─ Channel lookup    ├─ Time parsing  ├─ Batch insert
     ├─ Gzip support      ├─ Error handling  ├─ EPG ID matching   ├─ Metadata      ├─ Cache invalidation
     └─ Size limits       └─ Format detect   └─ Auto mapping      └─ Categories    └─ Cleanup
```

#### Scheduling System
```javascript
// Cron-based scheduling with interval parsing
const refreshSchedule = {
  '4h': '0 */4 * * *',    // Every 4 hours
  '1d': '0 0 * * *',      // Daily at midnight  
  '6h': '0 */6 * * *',    // Every 6 hours
  '30m': '*/30 * * * *'   // Every 30 minutes
};
```

### SSDP Service

#### HDHomeRun Emulation
```javascript
// Device Emulation Structure
const hdhrDevice = {
  deviceType: 'urn:schemas-upnp-org:device:MediaServer:1',
  friendlyName: 'PlexTV',
  manufacturer: 'PlexTV',
  modelName: 'PlexTV Bridge',
  udn: 'uuid:device-unique-identifier',
  services: [
    'urn:schemas-upnp-org:service:ContentDirectory:1'
  ]
};
```

#### Discovery Protocol Flow
```
1. SSDP Multicast Announcement (every 30 minutes)
2. Plex Discovery Request
3. Device Description Response (/device.xml)
4. Capability Negotiation
5. Channel Lineup Exchange (/lineup.json)
6. Stream Request Handling (/stream/{channelId})
```

## Data Flow Architecture

### Stream Request Flow
```
Plex ──► SSDP Discovery ──► Channel Lineup ──► Stream Request ──► Stream Proxy ──► IPTV Source
  │           │                    │                │               │                │
  │           ├─ Device UUID       ├─ Channel List  ├─ Auth Check   ├─ Format Conv   ├─ Protocol Handle
  │           ├─ Capabilities      ├─ EPG Data      ├─ Rate Limit   ├─ Transcoding   ├─ Error Recovery
  └───────────┴─ Service URLs      └─ Metadata      └─ Session Mgmt └─ Buffering     └─ Failover
```

### EPG Data Flow
```
EPG Source ──► Download ──► Parse ──► Validate ──► Store ──► Cache ──► Serve to Plex
     │            │         │         │          │        │         │
     ├─ XMLTV     ├─ HTTP   ├─ XML    ├─ Schema  ├─ SQLite├─ Redis  ├─ JSON/XML
     ├─ Gzip      ├─ Auth   ├─ Parse  ├─ Check   ├─ Batch ├─ TTL    ├─ Format
     └─ Schedule  └─ Retry  └─ Map    └─ Clean   └─ Trans └─ Keys   └─ Filter
```

### Configuration Flow
```
Environment ──► Config Merger ──► Validation ──► Service Init ──► Runtime Updates
Variables             │               │              │               │
     │                ├─ JSON Files   ├─ Schema     ├─ Dependencies ├─ Live Reload
     ├─ Defaults      ├─ Deep Merge   ├─ Required   ├─ Health Check ├─ Cache Clear
     └─ Overrides     └─ File Watch   └─ Types      └─ Error Handle └─ Restart
```

## Security Architecture

### Authentication & Authorization
```javascript
// Multi-layer security approach
const securityLayers = {
  network: ['Docker isolation', 'Port restrictions', 'CORS policy'],
  application: ['Rate limiting', 'Input validation', 'Error sanitization'],
  data: ['SQL injection prevention', 'XSS protection', 'CSRF tokens'],
  transport: ['HTTPS enforcement', 'Secure headers', 'TLS encryption']
};
```

### Input Validation Pipeline
```javascript
// Request validation using Joi schemas
Request ──► Route Handler ──► Validation Middleware ──► Business Logic
   │             │                     │                      │
   ├─ Body       ├─ Method Check       ├─ Schema Validate     ├─ Sanitized Data
   ├─ Headers    ├─ Auth Check         ├─ Type Coercion       ├─ Error Handling
   └─ Params     └─ Rate Limit         └─ Required Fields     └─ Response Format
```

## Performance Architecture

### Caching Strategy
```javascript
// Multi-tier caching system
const cachingLayers = {
  L1: 'Memory (Node.js process)',          // Hot data, immediate access
  L2: 'Redis (shared cache)',             // Session data, computed results  
  L3: 'SQLite (persistent storage)',      // Master data, long-term storage
  L4: 'File System (static assets)',      // Images, logs, configurations
};
```

### Resource Management
```javascript
// Resource allocation and limits
const resourceLimits = {
  streams: {
    concurrent: 10,              // Max simultaneous streams
    memory: '100MB per stream',  // Memory allocation
    timeout: '30 seconds',       // Connection timeout
    retries: 3                   // Reconnection attempts
  },
  database: {
    connections: 'Single WAL',   // SQLite WAL mode
    cache: '64MB',              // SQLite cache size
    timeout: '30 seconds',       // Busy timeout
    cleanup: 'Daily at 2 AM'    // Maintenance schedule
  },
  cache: {
    memory: '256MB',            // Redis memory limit
    policy: 'allkeys-lru',     // Eviction policy
    persistence: 'AOF',        // Append-only file
    ttl: 'Variable by type'    // Time-to-live settings
  }
};
```

## Deployment Architecture

### Container Structure
```dockerfile
# Multi-stage build optimization
FROM node:18-alpine as builder  # Build stage
├── Install build dependencies
├── Build React frontend
└── Optimize bundle size

FROM node:18-alpine as runtime  # Runtime stage  
├── Install system dependencies (FFmpeg, streaming tools)
├── Copy application code
├── Create non-root user
├── Set security policies
└── Configure health checks
```

### Service Dependencies
```yaml
# Docker Compose service graph
PlexTV Container ──┐
                   ├── Redis Container
                   ├── Volume Mounts (data, logs, config)
                   ├── Network Bridge
                   └── Health Checks
```

### Monitoring & Observability
```javascript
// Built-in monitoring capabilities
const monitoring = {
  healthChecks: {
    application: '/health endpoint',
    database: 'SQLite connectivity',
    cache: 'Redis ping',
    streams: 'Active session count'
  },
  metrics: {
    system: 'CPU, Memory, Uptime',
    streams: 'Bandwidth, Sessions, Errors', 
    epg: 'Refresh status, Program count',
    api: 'Response times, Error rates'
  },
  logging: {
    levels: 'DEBUG, INFO, WARN, ERROR',
    rotation: 'Daily with retention',
    formats: 'JSON for parsing',
    outputs: 'File + Console + Database'
  }
};
```

This architecture provides a robust, scalable, and maintainable foundation for bridging IPTV streams with Plex Media Server while supporting enterprise-grade reliability and monitoring capabilities.
