# PlexBridge Architecture Documentation

## System Overview

PlexBridge is a Node.js application that acts as a bridge between IPTV streams and Plex Media Server by emulating an HDHomeRun network tuner. The application provides a complete solution for integrating IPTV sources into Plex with full Electronic Program Guide (EPG) support, real-time monitoring, and a modern web management interface.

### Core Design Principles

- **HDHomeRun Compatibility**: Full API compliance with HDHomeRun tuner protocols
- **Universal Protocol Support**: Handles all major IPTV streaming protocols
- **Fault Tolerance**: Graceful fallbacks for failed services and network issues  
- **Real-time Operations**: Live monitoring, streaming, and web interface updates
- **Scalable Architecture**: Modular design supporting horizontal scaling
- **Security First**: Input validation, rate limiting, and secure defaults

## High-Level Architecture

```
                        PlexBridge Application Architecture
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                Frontend Layer                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                           React Web Interface                             │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │ Dashboard   │ │Channel Mgr  │ │ Stream Mgr  │ │ EPG Manager         │ │   │
│  │  │• Metrics    │ │• CRUD Ops   │ │• Validation │ │• XMLTV Sources      │ │   │
│  │  │• Live Stats │ │• Logo Mgmt  │ │• Format Det │ │• Schedule Mgmt      │ │   │
│  │  │• Health     │ │• EPG Link   │ │• Backup URLs│ │• Program Data       │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘ │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │ Log Viewer  │ │ Settings    │ │ErrorBoundary│ │ Layout/Navigation   │ │   │
│  │  │• Real-time  │ │• Config     │ │• Exception  │ │• Routing            │ │   │
│  │  │• Filtering  │ │• Validation │ │• Recovery   │ │• Responsive Design  │ │   │
│  │  │• Export     │ │• Live Apply │ │• Logging    │ │• Theme Management   │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                               Backend Layer                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                        Express.js Application                             │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │ API Routes  │ │Stream Routes│ │ SSDP Routes │ │ EPG Routes          │ │   │
│  │  │• REST CRUD  │ │• Validation │ │• Discovery  │ │• XMLTV Export       │ │   │
│  │  │• Validation │ │• Proxy      │ │• Device XML │ │• JSON Export        │ │   │
│  │  │• Rate Limit │ │• Transcode  │ │• Lineup     │ │• Schedule Refresh   │ │   │
│  │  │• Error Hand │ │• Auth       │ │• Status     │ │• Source Management  │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                           Service Layer                                   │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │Stream Mgr   │ │ SSDP Service│ │ EPG Service │ │ Cache Service       │ │   │
│  │  │• Protocol   │ │• UPnP Broad │ │• XML Parse  │ │• Redis/Memory       │ │   │
│  │  │• Detection  │ │• Device Emu │ │• Scheduling │ │• TTL Management     │ │   │
│  │  │• Validation │ │• Auto Disc  │ │• Cron Jobs  │ │• Fallback Handling  │ │   │
│  │  │• FFmpeg     │ │• Network IF │ │• Channel Map│ │• Performance Optim  │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘ │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │ Database    │ │ Logger      │ │Config Mgmt  │ │ Socket.IO           │ │   │
│  │  │• SQLite WAL │ │• Winston    │ │• Env Vars   │ │• Real-time Updates  │ │   │
│  │  │• Connection │ │• Rotation   │ │• JSON Files │ │• Room Management    │ │   │
│  │  │• Migration  │ │• Structured │ │• Validation │ │• Event Broadcasting │ │   │
│  │  │• Health     │ │• Multi Out  │ │• Defaults   │ │• Client Connection  │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                Data Layer                                        │
│  ┌─────────────────────────────────┐    ┌───────────────────────────────────┐   │
│  │            SQLite Database      │    │         Redis Cache               │   │
│  │  ┌─────────────────────────────┐ │    │  ┌─────────────────────────────┐ │   │
│  │  │ Tables:                     │ │    │  │ Cache Keys:                 │ │   │
│  │  │ • channels                  │ │    │  │ • epg:{channelId}           │ │   │
│  │  │ • streams                   │ │    │  │ • stream:{streamId}         │ │   │
│  │  │ • epg_programs              │ │    │  │ • session:{sessionId}       │ │   │
│  │  │ • epg_sources               │ │    │  │ • lineup:channels           │ │   │
│  │  │ • stream_sessions           │ │    │  │ • metrics:system            │ │   │
│  │  │ • settings                  │ │    │  │ • api:response:{hash}       │ │   │
│  │  │ • logs                      │ │    │  └─────────────────────────────┘ │   │
│  │  └─────────────────────────────┘ │    └───────────────────────────────────┘   │
│  └─────────────────────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐         ┌────────▼────────┐         ┌───────▼────────┐
│  Plex Server   │         │  IPTV Sources   │         │  EPG Sources   │
│                │         │                 │         │                │
│ • Discovery    │         │ • HLS/M3U8      │         │ • XMLTV Files  │
│ • Channel      │         │ • DASH/MPD      │         │ • Schedule API │
│ • Lineup       │         │ • RTSP Streams  │         │ • HTTP/HTTPS   │
│ • EPG Data     │         │ • RTMP Flash    │         │ • Gzip Support │
│ • Live Stream  │         │ • UDP Multicast │         │ • Auto Refresh │
│ • Recording    │         │ • HTTP Direct   │         │ • Format Valid │
└────────────────┘         │ • MMS/SRT       │         └────────────────┘
                          │ • Auth Support  │
                          └─────────────────┘
```

## Component Architecture

### 1. Frontend Layer (React)

The PlexBridge frontend is a single-page application built with React 18 and Material-UI, providing a modern, responsive interface for managing all aspects of the IPTV bridge.

#### Core Components

**Layout & Navigation (`Layout.js`)**
- Responsive sidebar navigation with active route highlighting  
- Material-UI drawer component with mobile support
- Global theme management and consistent styling
- Error boundary integration for component-level fault tolerance

**Dashboard (`Dashboard.js`)**
- Real-time system metrics (CPU, memory, uptime) via Socket.IO
- Active streaming session monitoring with client details
- System health indicators (database, cache, SSDP service status)
- Interactive charts using Chart.js for performance visualization
- Quick action buttons for common operations

**Channel Manager (`ChannelManager.js`)**
- Full CRUD operations for TV channel configuration
- Data grid with sorting, filtering, and pagination
- Channel logo upload and management
- EPG ID mapping for program guide integration
- Bulk operations for M3U playlist imports
- Form validation with real-time feedback

**Stream Manager (`StreamManager.js`)**
- IPTV stream source configuration and management
- Universal protocol support (HLS, RTSP, RTMP, UDP, etc.)
- Stream validation with format detection
- Backup URL configuration for failover
- Authentication settings (username/password, headers)
- Real-time stream testing and status monitoring

**EPG Manager (`EPGManager.js`)**
- XMLTV data source configuration
- Automated refresh scheduling with cron expressions
- Program data viewing and channel mapping
- Manual EPG refresh with progress tracking
- Data validation and error reporting
- Program guide preview and export

**Log Viewer (`LogViewer.js`)**
- Real-time log streaming via WebSocket connection
- Multi-level filtering (DEBUG, INFO, WARN, ERROR)
- Log export functionality with date range selection
- Syntax highlighting for structured log entries
- Auto-scroll and search capabilities

**Settings (`Settings.js`)**
- Application configuration with live validation
- Environment variable override interface
- Service-specific settings (streaming, caching, SSDP)
- Configuration export/import functionality
- Real-time configuration testing

**Error Boundary (`ErrorBoundary.js`)**
- React error boundary implementation
- Graceful error handling with user-friendly messages
- Error logging to backend for debugging
- Component tree recovery mechanisms
- Development vs production error display modes

#### Technology Stack & Dependencies

```javascript
// Core React Dependencies
"react": "^18.2.0"              // UI Framework with concurrent features
"react-dom": "^18.2.0"          // DOM rendering
"react-router-dom": "^6.20.0"   // Client-side routing with data loaders

// UI Framework
"@mui/material": "^5.15.0"      // Material Design components
"@mui/icons-material": "^5.15.0" // Material Design icons
"@mui/x-data-grid": "^6.18.0"   // Advanced data grid component
"@emotion/react": "^11.11.1"    // CSS-in-JS styling
"@emotion/styled": "^11.11.0"   // Styled components

// Data Visualization
"chart.js": "^4.4.0"            // Chart rendering engine
"react-chartjs-2": "^5.2.0"     // React wrapper for Chart.js

// Communication & State
"axios": "^1.6.2"               // HTTP client with interceptors
"socket.io-client": "^4.7.5"    // Real-time WebSocket communication

// User Experience
"notistack": "^3.0.1"           // Toast notifications
"date-fns": "^2.30.0"           // Date manipulation and formatting
"react-dropzone": "^14.2.3"     // File upload drag-and-drop
"hls.js": "^1.4.12"             // HLS video streaming support
```

#### State Management Architecture

**Component-Level State**
- React hooks (useState, useEffect, useReducer) for local component state
- Custom hooks for shared logic (useApi, useSocket, useLocalStorage)
- Optimistic updates with error rollback for better UX

**Context Providers**
- Theme context for dark/light mode with system preference detection
- Notification context for global toast message management
- Socket context for WebSocket connection sharing

**Real-time Data Flow**
- Socket.IO rooms for targeted data updates (logs, metrics, streams)
- Automatic reconnection with exponential backoff
- Data synchronization between browser tabs

**API Integration Patterns**
- Axios interceptors for authentication and error handling
- Request cancellation for component unmounting
- Optimistic updates with server-side validation
- Cache-first strategies with background updates

### 2. Backend Layer (Node.js)

The PlexBridge backend is a robust Express.js application implementing enterprise-grade patterns for scalability, security, and maintainability.

#### Express Application Structure (`server/index.js`)

**Middleware Stack (Applied in Order)**
```javascript
// Security & Performance Middleware
app.use(helmet())              // Security headers
app.use(cors())                // Cross-origin resource sharing
app.use(compression())         // Response compression
app.use(rateLimit())          // API rate limiting (1000 req/15min)

// Logging & Parsing Middleware  
app.use(morgan())             // HTTP request logging via Winston
app.use(express.json())       // JSON body parsing with size limits
app.use(express.urlencoded()) // Form data parsing

// Static File Serving
app.use('/logos', express.static()) // Channel logo assets
app.use(express.static())          // React build files
```

**Route Structure & Responsibilities**
```javascript
// Route Organization
app.use('/api', apiRoutes)     // REST API endpoints with validation
app.use('/', streamRoutes)     // Stream proxy and validation
app.use('/epg', epgRoutes)     // EPG data export and management  
app.use('/', ssdpRoutes)       // HDHomeRun emulation endpoints

// Special Endpoints
app.get('/health', healthCheck)    // Application health status
app.get('*', reactApp)            // SPA fallback for React Router
```

**Error Handling & Resilience**
- Global error handler with sanitized error responses
- Graceful shutdown handling (SIGTERM, SIGINT)
- Uncaught exception and unhandled rejection logging
- Service initialization with retry logic and timeouts
- Database connection pooling with health checks

#### Service Layer Architecture

**Service Dependency Graph**
```javascript
// Initialization Order and Dependencies
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Logger        │────│  Configuration  │────│   Database      │
│   (Winston)     │    │   (Config)      │    │   (SQLite)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
┌─────────────────┐    ┌─────────▼─────────┐    ┌─────────────────┐
│  Cache Service  │────│  Service Layer    │────│  SSDP Service   │
│  (Redis/Memory) │    │  (Stream/EPG)     │    │  (UPnP/Device)  │
└─────────────────┘    └───────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Express Server       │
                    │    (HTTP/WebSocket)     │
                    └─────────────────────────┘
```

#### Core Service Implementations

**Database Service (`database.js`)**
- SQLite with WAL (Write-Ahead Logging) journaling mode
- Connection pooling and busy timeout handling
- Database schema migrations and versioning
- Health check endpoint with connection validation
- Prepared statements for SQL injection prevention
- Transaction support for data consistency

**Cache Service (`cacheService.js`)**
- Redis primary with in-memory fallback
- TTL-based expiration with configurable policies
- Cache key namespacing and structured hierarchies
- Performance metrics tracking (hit/miss ratios)
- Automatic failover to memory cache on Redis failure
- Cache warming strategies for critical data

**Stream Manager (`streamManager.js`)**
- Universal IPTV protocol detection and handling
- FFmpeg integration for transcoding and format conversion
- Active session tracking with client IP and bandwidth monitoring
- Stream validation with timeout and retry logic
- Protocol-specific handlers (HLS, RTSP, RTMP, UDP, etc.)
- Backup URL failover with automatic switching

**SSDP Service (`ssdpService.js`)**
- UPnP device announcement via multicast
- HDHomeRun device emulation with full API compatibility
- Network interface detection and IP address resolution
- Periodic device announcements (configurable intervals)
- Device description XML generation
- Plex discovery response formatting

**EPG Service (`epgService.js`)**
- XMLTV format parsing with validation
- Cron-based scheduling with configurable intervals
- Channel mapping and program data processing
- HTTP/HTTPS source download with gzip support
- Error handling and retry logic for failed downloads
- Database batch operations for performance

#### Technology Stack & Dependencies

**Core Backend Dependencies**
```javascript
// Core Framework
"express": "^4.18.2"              // Web application framework
"socket.io": "^4.7.5"             // Real-time bidirectional communication

// Security & Middleware
"helmet": "^7.1.0"                // Security header middleware
"cors": "^2.8.5"                  // Cross-origin resource sharing
"express-rate-limit": "^7.1.5"    // Rate limiting middleware
"compression": "^1.7.4"           // Response compression
"morgan": "^1.10.0"               // HTTP request logger

// Validation & Parsing
"joi": "^17.11.0"                 // Schema validation
"uuid": "^9.0.1"                  // UUID generation
"dotenv": "^16.3.1"               // Environment variable loading

// Database & Caching
"sqlite3": "^5.1.6"               // SQLite database driver
"redis": "^4.6.10"                // Redis client (optional)

// Streaming & Media Processing
"ffmpeg-static": "^5.2.0"         // Static FFmpeg binary
"fluent-ffmpeg": "^2.1.2"         // FFmpeg Node.js wrapper
"m3u8-parser": "^7.1.0"           // HLS playlist parsing
"node-rtsp-stream": "^0.0.9"      // RTSP stream handling

// Network & Protocol Support
"node-ssdp": "^4.0.1"             // SSDP/UPnP implementation
"axios": "^1.6.2"                 // HTTP client for external requests

// Scheduling & Background Tasks
"node-cron": "^3.0.3"             // Cron job scheduling

// Process Management
"pm2": "^5.3.0"                   // Production process manager

// Logging & Monitoring
"winston": "^3.11.0"              // Structured logging
"winston-daily-rotate-file": "^4.7.1" // Log rotation
```

#### Service Initialization & Health Monitoring

**Application Startup Sequence**
1. **Configuration Loading**: Environment variables and JSON config files
2. **Directory Creation**: Ensure data, logs, cache directories exist
3. **Database Initialization**: SQLite connection with schema validation
4. **Cache Service Setup**: Redis connection with memory fallback
5. **Service Registration**: Register all services with dependency injection
6. **SSDP Service Start**: Begin UPnP device announcements
7. **HTTP Server Start**: Bind to configured port with timeout handling
8. **Health Check Validation**: Verify all services are operational

**Health Monitoring Implementation**
```javascript
// Health Check Endpoint Response
GET /health
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 86400,
  "memory": {
    "rss": 134217728,
    "heapTotal": 67108864, 
    "heapUsed": 33554432
  },
  "services": {
    "database": { "status": "healthy", "responseTime": 2 },
    "cache": { "status": "healthy", "type": "Redis" },
    "ssdp": { "status": "running", "announcements": 142 }
  },
  "version": "1.0.0"
}
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
