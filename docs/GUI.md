# PlexBridge Web Interface Guide

## Overview

PlexBridge provides a modern, responsive web interface built with React 18 and Material-UI. The interface offers complete management capabilities for channels, streams, EPG sources, and system monitoring, with real-time updates via WebSocket connections.

## Interface Architecture

### Technology Stack
- **React 18** with functional components and hooks
- **Material-UI (MUI) 5.15** for consistent design and components
- **React Router 6.20** for client-side routing
- **Chart.js 4.4** for real-time data visualization
- **Socket.IO Client** for live updates
- **Axios** for HTTP API communication

### Responsive Design
- Mobile-first responsive layout
- Collapsible sidebar navigation
- Adaptive grid systems
- Touch-friendly interfaces
- Optimized for tablets and desktop

## Main Interface Components

### 1. Layout & Navigation

**File**: `client/src/components/Layout/Layout.js`

The main layout component provides the application shell with responsive navigation.

**Features:**
- **Responsive Sidebar**: Collapsible navigation drawer
- **Active Route Highlighting**: Visual indication of current page
- **Theme Management**: Light/dark mode toggle
- **User Context**: Session and preference management
- **Mobile Support**: Touch-friendly hamburger menu

**Navigation Menu Items:**
```
📊 Dashboard       - System overview and real-time metrics
📺 Channels        - TV channel configuration
🎬 Streams         - IPTV source management  
📋 EPG             - Electronic Program Guide
📄 Logs            - Real-time application logs
⚙️  Settings       - Application configuration
```

**Usage:**
- Click menu items to navigate between sections
- Use hamburger menu (☰) on mobile devices
- Responsive breakpoints: Mobile (<768px), Tablet (768-1024px), Desktop (>1024px)

### 2. Dashboard

**File**: `client/src/components/Dashboard/Dashboard.js`

The dashboard provides real-time system monitoring and quick access to key information.

**Real-time Metrics Display:**
- **System Health**: CPU usage, memory consumption, uptime
- **Service Status**: Database, cache, SSDP service health
- **Active Streams**: Live streaming sessions with client details
- **Performance Charts**: Historical data with Chart.js visualization
- **Quick Actions**: Common tasks and shortcuts

**Dashboard Cards:**

**System Overview Card:**
```
┌─ System Health ─────────────────┐
│ ✅ Status: Healthy              │
│ ⏱️  Uptime: 2d 14h 32m          │
│ 💾 Memory: 245MB / 2GB          │
│ 🔄 CPU: 12%                     │
└─────────────────────────────────┘
```

**Services Status Card:**
```
┌─ Services ──────────────────────┐
│ 🗄️  Database: ✅ Healthy        │
│ 📦 Cache: ✅ Redis Connected    │
│ 📡 SSDP: ✅ Broadcasting       │
│ 🎬 Streams: 3/10 Active        │
└─────────────────────────────────┘
```

**Active Streams Card:**
```
┌─ Live Streams ──────────────────┐
│ CNN HD        192.168.1.50     │
│ BBC News      192.168.1.51     │
│ ESPN          192.168.1.52     │
│                                 │
│ [View All Sessions]             │
└─────────────────────────────────┘
```

**Quick Actions:**
- 🔄 Refresh EPG data
- ✅ Validate all streams
- 📊 Export metrics
- 🔧 System diagnostics

### 3. Channel Manager

**File**: `client/src/components/ChannelManager/ChannelManager.js`

Comprehensive channel configuration and management interface.

**Main Features:**
- **Data Grid**: Sortable, filterable channel list with pagination
- **CRUD Operations**: Create, read, update, delete channels
- **Bulk Operations**: Multi-select for batch actions
- **Logo Management**: Upload and preview channel logos
- **EPG Integration**: Link channels to program guide data

**Channel List View:**
```
┌─ Channels ─────────────────────────────────────────────┐
│ [+ Add Channel]  [Import M3U]  [Export]  [🔍 Search]  │
├────┬─────────────┬────────┬─────────┬──────┬─────────────┤
│ #  │ Name        │ Number │ Streams │ EPG  │ Actions     │
├────┼─────────────┼────────┼─────────┼──────┼─────────────┤
│ ✅ │ CNN HD      │ 101    │ 2       │ ✅   │ [✏️] [🗑️]  │
│ ✅ │ BBC News    │ 102    │ 1       │ ❌   │ [✏️] [🗑️]  │
│ ❌ │ ESPN        │ 103    │ 0       │ ✅   │ [✏️] [🗑️]  │
└────┴─────────────┴────────┴─────────┴──────┴─────────────┘
```

**Add/Edit Channel Dialog:**
```
┌─ Add Channel ───────────────────┐
│ Channel Name: [CNN HD         ] │
│ Channel Number: [101          ] │
│ ☑️ Enabled                     │
│                                 │
│ Logo URL: [https://...        ] │
│ EPG ID: [cnn.us              ] │
│                                 │
│ [Cancel]              [Save]    │
└─────────────────────────────────┘
```

**Validation Features:**
- Real-time form validation
- Unique channel number enforcement
- URL validation for logos
- Required field indicators

### 4. Stream Manager

**File**: `client/src/components/StreamManager/StreamManager.js`

Advanced IPTV stream configuration with validation and testing capabilities.

**Core Features:**
- **Protocol Detection**: Automatic format detection (HLS, RTSP, RTMP, etc.)
- **Stream Validation**: Test connectivity and format compatibility
- **Backup URLs**: Configure failover streams for reliability
- **Authentication**: Username/password and custom headers support
- **Real-time Testing**: Live stream validation with detailed feedback

**Stream Configuration Interface:**
```
┌─ Stream Configuration ──────────────────────────────────┐
│ Channel: [CNN HD ▼]                                    │
│ Stream Name: [CNN Primary Stream                     ] │
│ Stream URL: [https://cnn-live.example.com/playlist.m3u8] │
│ Type: [HLS ▼] (Auto-detected)                          │
│                                                         │
│ ┌─ Authentication ─────────────────┐                   │
│ │ Username: [                    ] │                   │
│ │ Password: [                    ] │                   │
│ │ Custom Headers: [+ Add Header  ] │                   │
│ └─────────────────────────────────┘                   │
│                                                         │
│ ┌─ Backup URLs ───────────────────┐                   │
│ │ [https://backup1.example.com  ] │                   │
│ │ [+ Add Backup URL              ] │                   │
│ └─────────────────────────────────┘                   │
│                                                         │
│ [Test Stream] [Cancel]              [Save]             │
└─────────────────────────────────────────────────────────┘
```

**Stream Validation Results:**
```
┌─ Validation Results ────────────────┐
│ ✅ URL accessible                   │
│ ✅ Format: HLS (M3U8)               │
│ ✅ Video codec: H.264               │
│ ✅ Audio codec: AAC                 │
│ ⏱️  Response time: 245ms            │
│ 📊 Bitrate: ~2.5 Mbps              │
│                                     │
│ [Test Again]           [Close]      │
└─────────────────────────────────────┘
```

**Supported Stream Types:**
- **HLS**: HTTP Live Streaming (M3U8 playlists)
- **DASH**: Dynamic Adaptive Streaming (MPD manifests)
- **RTSP**: Real-Time Streaming Protocol
- **RTMP**: Real-Time Messaging Protocol
- **UDP**: Direct UDP streams (multicast/unicast)
- **HTTP**: Direct HTTP streams
- **MMS**: Microsoft Media Server streams
- **SRT**: Secure Reliable Transport

### 5. EPG Manager

**File**: `client/src/components/EPGManager/EPGManager.js`

Electronic Program Guide management with XMLTV support and automated scheduling.

**Key Features:**
- **XMLTV Sources**: Configure multiple EPG data sources
- **Automated Refresh**: Cron-based scheduling with configurable intervals
- **Channel Mapping**: Link EPG data to channels (automatic and manual)
- **Program Preview**: View program information and scheduling
- **Data Validation**: XMLTV format validation and error reporting

**EPG Sources Management:**
```
┌─ EPG Sources ───────────────────────────────────────────┐
│ [+ Add Source] [Refresh All] [Export XMLTV]            │
├─────────────────┬──────────────┬──────────┬─────────────┤
│ Name            │ Last Refresh │ Programs │ Actions     │
├─────────────────┼──────────────┼──────────┼─────────────┤
│ TV Guide Master │ 2h ago       │ 15,432   │ [🔄] [✏️]  │
│ Sports EPG      │ 6h ago       │ 2,156    │ [🔄] [✏️]  │
│ News Channels   │ Failed       │ 0        │ [🔄] [✏️]  │
└─────────────────┴──────────────┴──────────┴─────────────┘
```

**EPG Source Configuration:**
```
┌─ EPG Source ────────────────────────┐
│ Source Name: [TV Guide Master    ] │
│ XMLTV URL: [https://epg.example...] │
│ Refresh Interval: [4 hours ▼     ] │
│ ☑️ Enabled                         │
│ ☑️ Auto-map channels               │
│                                     │
│ Last Refresh: 2024-01-15 14:30     │
│ Status: ✅ 15,432 programs loaded  │
│                                     │
│ [Test Source] [Cancel]    [Save]    │
└─────────────────────────────────────┘
```

**Program Guide View:**
```
┌─ Program Guide ─────────────────────────────────────────┐
│ Channel: [CNN HD ▼] Date: [Today ▼]                    │
├─────────┬───────────────────────────────────────────────┤
│ 14:00   │ CNN Newsroom - Breaking news coverage        │
│ 15:00   │ The Situation Room - Political analysis      │
│ 16:00   │ Anderson Cooper 360 - News and interviews    │
│ 17:00   │ Erin Burnett OutFront - Evening news         │
└─────────┴───────────────────────────────────────────────┘
```

### 6. Log Viewer

**File**: `client/src/components/LogViewer/LogViewer.js`

Real-time log monitoring with filtering and export capabilities.

**Features:**
- **Live Streaming**: Real-time log updates via WebSocket
- **Multi-level Filtering**: Filter by log level (DEBUG, INFO, WARN, ERROR)
- **Search Functionality**: Text search within log entries
- **Auto-scroll**: Automatic scrolling for new entries
- **Export**: Download logs for external analysis
- **Syntax Highlighting**: Color-coded log entries

**Log Viewer Interface:**
```
┌─ Application Logs ──────────────────────────────────────┐
│ 🔍 [Search logs...] [DEBUG ▼] [📥 Export] [🔄 Auto]   │
├─────────────────────────────────────────────────────────┤
│ 14:32:15.123 INFO  Server started on port 8080         │
│ 14:32:15.245 INFO  Database connected successfully      │
│ 14:32:16.100 DEBUG SSDP announcement sent               │
│ 14:32:20.567 INFO  Stream request: CNN HD               │
│ 14:32:20.789 WARN  Redis connection timeout             │
│ 14:32:21.001 ERROR Failed to validate stream URL        │
│                                                         │
│ [▼ Scroll to bottom]                                    │
└─────────────────────────────────────────────────────────┘
```

**Log Filtering Options:**
- **Level Filter**: ALL, DEBUG, INFO, WARN, ERROR
- **Component Filter**: Server, Database, Streams, EPG, SSDP
- **Time Range**: Last hour, 24 hours, 7 days, custom range
- **Search Terms**: Text-based filtering with regex support

### 7. Settings

**File**: `client/src/components/Settings/Settings.js`

Comprehensive application configuration with live validation and testing.

**Settings Categories:**

**General Settings:**
```
┌─ General ───────────────────────────┐
│ Application Name: [PlexBridge     ] │
│ Server Port: [8080               ] │
│ Log Level: [Info ▼              ] │
│ ☑️ Enable debug mode               │
│ ☑️ Auto-start services             │
└─────────────────────────────────────┘
```

**Streaming Settings:**
```
┌─ Streaming ─────────────────────────┐
│ Max Concurrent: [10              ] │
│ Stream Timeout: [30000 ms        ] │
│ Buffer Size: [65536 bytes       ] │
│ ☑️ Enable transcoding              │
│ ☑️ Auto-detect formats             │
│ FFmpeg Path: [/usr/bin/ffmpeg   ] │
└─────────────────────────────────────┘
```

**SSDP Discovery:**
```
┌─ SSDP Discovery ────────────────────┐
│ Device Name: [PlexBridge         ] │
│ Device UUID: [auto-generated     ] │
│ Port: [1900                     ] │
│ ☑️ Enable announcements            │
│ Interval: [30 minutes ▼         ] │
└─────────────────────────────────────┘
```

**Cache Settings:**
```
┌─ Caching ───────────────────────────┐
│ Redis Host: [localhost           ] │
│ Redis Port: [6379               ] │
│ EPG TTL: [3600 seconds          ] │
│ Stream TTL: [300 seconds        ] │
│ ☑️ Enable cache                    │
│ [Test Connection]                   │
└─────────────────────────────────────┘
```

**Settings Validation:**
- Real-time input validation
- Connection testing for external services
- Configuration preview before applying
- Rollback capability for failed changes

### 8. Error Boundary

**File**: `client/src/components/ErrorBoundary/ErrorBoundary.js`

React error boundary for graceful error handling and recovery.

**Features:**
- **Component Error Catching**: Prevents application crashes
- **User-friendly Error Display**: Clear error messages
- **Error Reporting**: Automatic error logging to backend
- **Recovery Options**: Component reset and navigation alternatives
- **Development vs Production**: Different error detail levels

**Error Display:**
```
┌─ Application Error ─────────────────┐
│ ⚠️  Something went wrong            │
│                                     │
│ The component encountered an error  │
│ and couldn't render properly.       │
│                                     │
│ Error: Network request failed       │
│ Component: StreamManager            │
│ Time: 2024-01-15 14:32:15          │
│                                     │
│ [🔄 Try Again] [🏠 Go Home]        │
└─────────────────────────────────────┘
```

## Real-time Features

### WebSocket Integration

**Connection Management:**
- Automatic connection establishment
- Reconnection with exponential backoff
- Connection status indicators
- Room-based message routing

**Real-time Data Types:**
```javascript
// System metrics updates
socket.on('metrics-update', (data) => {
  // Update dashboard charts and statistics
});

// Log entries streaming
socket.on('log-entry', (entry) => {
  // Append to log viewer
});

// Stream status changes
socket.on('stream-status', (status) => {
  // Update stream indicators
});

// EPG refresh progress
socket.on('epg-progress', (progress) => {
  // Update progress bars
});
```

### Live Data Synchronization

**Dashboard Updates:**
- System metrics every 5 seconds
- Active stream count real-time
- Service health status
- Memory and CPU usage

**Log Streaming:**
- New log entries appear instantly
- Filtering applied to live streams
- Auto-scroll with user control
- Buffer management for performance

**Configuration Changes:**
- Settings applied immediately
- Validation feedback in real-time
- Service restart notifications
- Configuration conflict warnings

## User Experience Features

### Responsive Design Breakpoints

**Mobile (< 768px):**
- Collapsed sidebar navigation
- Single-column layouts
- Touch-optimized controls
- Simplified data tables

**Tablet (768px - 1024px):**
- Adaptive sidebar
- Two-column layouts where appropriate
- Touch and mouse support
- Condensed information display

**Desktop (> 1024px):**
- Full sidebar navigation
- Multi-column layouts
- Detailed data tables
- Advanced filtering options

### Accessibility Features

- **Keyboard Navigation**: Full interface keyboard accessible
- **Screen Reader Support**: ARIA labels and descriptions
- **High Contrast**: Support for high contrast modes
- **Focus Management**: Clear focus indicators
- **Semantic HTML**: Proper heading hierarchy

### Performance Optimizations

- **Code Splitting**: Lazy loading of route components
- **Virtual Scrolling**: Efficient large list rendering
- **Memoization**: Prevent unnecessary re-renders
- **Image Optimization**: Lazy loading and compression
- **Bundle Optimization**: Tree shaking and minification

## Customization

### Theming

The interface supports customizable themes:

```javascript
// Theme configuration
const theme = createTheme({
  palette: {
    mode: 'dark', // 'light' or 'dark'
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    fontFamily: 'Roboto, Arial, sans-serif',
  },
});
```

### Component Customization

Individual components can be customized through props and configuration:

```javascript
// Dashboard configuration
const dashboardConfig = {
  refreshInterval: 5000,
  chartOptions: {
    responsive: true,
    scales: {
      y: {
        beginAtZero: true
      }
    }
  }
};
```

For development information and component API details, see the [Development Guide](../DEVELOPMENT.md).