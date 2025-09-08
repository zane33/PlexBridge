# PlexBridge Streaming Architecture Guide

## Table of Contents
1. [Overview](#overview)
2. [Streaming Flow Architecture](#streaming-flow-architecture)
3. [Protocol Detection and Handling](#protocol-detection-and-handling)
4. [Plex Integration Details](#plex-integration-details)
5. [FFmpeg Configuration](#ffmpeg-configuration)
6. [Stream Resilience System](#stream-resilience-system)
7. [Critical Implementation Details](#critical-implementation-details)
8. [Metadata Handling](#metadata-handling-critical-for-stability)
9. [Performance Optimizations](#performance-optimizations)
10. [Troubleshooting Guide](#troubleshooting-guide)

## Overview

PlexBridge acts as a bridge between IPTV streams and Plex Media Server by emulating an HDHomeRun network tuner. This document details the complete streaming architecture, from Plex's request through to the final stream delivery.

### Key Components
- **Plex Media Server**: Discovers PlexBridge as an HDHomeRun device
- **PlexBridge**: Translates between IPTV formats and Plex-compatible streams
- **FFmpeg**: Handles transcoding and format conversion
- **Stream Manager**: Orchestrates the entire streaming pipeline

## Streaming Flow Architecture

### Complete Request Flow

```
Plex Media Server
    │
    ├── 1. Discovery Phase
    │   ├── SSDP Discovery (UDP 1900)
    │   ├── GET /discover.json (Device capabilities)
    │   └── GET /lineup.json (Channel list)
    │
    ├── 2. Channel Selection
    │   ├── User selects channel in Plex
    │   └── GET /lineup_status.json (Tuner status)
    │
    └── 3. Streaming Phase
        ├── GET /stream/{channelId}
        ├── User-Agent: Lavf/LIBAVFORMAT_VERSION
        └── Expects: MPEG-TS stream

PlexBridge Processing
    │
    ├── 1. Request Detection
    │   ├── Identify Plex request (User-Agent check)
    │   └── Route to appropriate handler
    │
    ├── 2. Stream Resolution
    │   ├── Fetch channel from database
    │   ├── Get stream URL
    │   └── Resolve redirects (mjh.nz → actual CDN)
    │
    ├── 3. Format Detection
    │   ├── HLS (.m3u8)
    │   ├── DASH (.mpd)
    │   ├── Direct streams (RTSP, RTMP, HTTP)
    │   └── UDP multicast
    │
    └── 4. Stream Delivery
        ├── Plex requests → FFmpeg MPEG-TS transcoding
        └── Web requests → Direct proxy or HLS rewriting

FFmpeg Transcoding Pipeline
    │
    ├── Input Processing
    │   ├── Protocol handling (HLS, DASH, etc.)
    │   ├── Redirect resolution
    │   └── Authentication if needed
    │
    ├── Transcoding
    │   ├── Copy codecs (no re-encoding)
    │   ├── Container format: MPEG-TS
    │   └── Output to stdout (pipe:1)
    │
    └── Output Delivery
        ├── Direct pipe to HTTP response
        ├── No buffering (critical for Plex)
        └── Real-time streaming
```

## Protocol Detection and Handling

### Stream Type Detection (`streamManager.js`)

```javascript
async detectStreamFormat(streamUrl) {
  // Extension-based detection
  if (streamUrl.includes('.m3u8')) return { type: 'hls', confidence: 'high' };
  if (streamUrl.includes('.mpd')) return { type: 'dash', confidence: 'high' };
  if (streamUrl.includes('rtsp://')) return { type: 'rtsp', confidence: 'high' };
  if (streamUrl.includes('rtmp://')) return { type: 'rtmp', confidence: 'high' };
  if (streamUrl.includes('udp://')) return { type: 'udp', confidence: 'high' };
  
  // Content-based detection via HEAD request
  const response = await axios.head(streamUrl);
  const contentType = response.headers['content-type'];
  
  if (contentType?.includes('mpegurl')) return { type: 'hls' };
  if (contentType?.includes('dash+xml')) return { type: 'dash' };
  // ... additional detection logic
}
```

### Protocol-Specific Handling

#### HLS Streams (.m3u8)
- **Web Playback**: Proxy and rewrite URLs to point back to PlexBridge
- **Plex Playback**: Transcode to MPEG-TS via FFmpeg

#### Direct Streams (HTTP/HTTPS)
- **Web Playback**: Direct proxy with CORS headers
- **Plex Playback**: Transcode to MPEG-TS if needed

#### RTSP/RTMP Streams
- Always require FFmpeg transcoding for both web and Plex

## Plex Integration Details

### Critical Plex Requirements

1. **User-Agent Detection**
   ```javascript
   const isPlexRequest = userAgent.includes('Lavf/LIBAVFORMAT_VERSION') ||
                        userAgent.includes('Plex') ||
                        userAgent.includes('PMS');
   ```

2. **MPEG-TS Output Format**
   - Plex expects raw MPEG-TS stream, not HLS playlists
   - Must use `video/mp2t` content type
   - Cannot use chunked transfer encoding (causes Plex buffering issues)
   - Streams continuously without Content-Length header (like real HDHomeRun)

3. **Response Headers for Plex (Critical - August 2025 Update)**
   ```javascript
   res.set({
     'Content-Type': 'video/mp2t',
     'Access-Control-Allow-Origin': '*',
     'Cache-Control': 'no-cache, no-store, must-revalidate',
     'Accept-Ranges': 'none',      // Disable range requests for live
     'Connection': 'keep-alive'     // MUST be keep-alive for continuous streaming
     // NO Transfer-Encoding header - HDHomeRun doesn't use chunked encoding
     // NO Content-Length header - unknown length for live streams
   });
   ```
   
   **Important Header Notes:**
   - **Connection: keep-alive** is REQUIRED for continuous streaming
   - **Transfer-Encoding: chunked** should NOT be used (causes Plex rebuffering)
   - **Content-Length** should NOT be set (live streams have unknown length)
   - This matches real HDHomeRun device behavior

### HDHomeRun Emulation Endpoints

| Endpoint | Purpose | Response Type |
|----------|---------|---------------|
| `/discover.json` | Device discovery | JSON with device info |
| `/lineup.json` | Channel lineup | JSON array of channels |
| `/lineup_status.json` | Tuner status | JSON with scan status |
| `/lineup.post` | Channel scan trigger | JSON status |
| `/device.xml` | UPnP device description | XML device info |
| `/stream/{channelId}` | Live stream | MPEG-TS stream |

## FFmpeg Configuration

### Optimal Configuration (Recommended)

```bash
ffmpeg -hide_banner -loglevel error -i [URL] -c:v copy -c:a copy -f mpegts pipe:1
```

This minimal configuration provides optimal performance by:
- **Minimal overhead**: Only essential parameters
- **No buffering delays**: Direct input to output processing  
- **Copy codecs**: Zero transcoding latency
- **Clean output**: Errors only, no unnecessary logging

### Extended Configuration (Advanced)

For streams requiring additional protocol handling:

```bash
ffmpeg -hide_banner -loglevel error \
  -allowed_extensions ALL \
  -protocol_whitelist file,http,https,tcp,tls,pipe,crypto \
  -user_agent PlexBridge/1.0 \
  -live_start_index 0 \
  -http_persistent 1 \
  -http_seekable 0 \
  -multiple_requests 1 \
  -i {stream_url} \
  -c:v copy \
  -c:a copy \
  -f mpegts \
  pipe:1
```

### Configuration Parameters Explained

| Parameter | Purpose | Impact |
|-----------|---------|--------|
| `-hide_banner` | Suppress FFmpeg banner | Cleaner logs |
| `-loglevel error` | Only log errors | Reduces stderr output |
| `-allowed_extensions ALL` | Allow all file extensions | HLS compatibility |
| `-protocol_whitelist` | Allowed protocols | Security and compatibility |
| `-user_agent` | Custom user agent | Some streams require this |
| `-live_start_index 0` | Start from beginning | Live stream handling |
| `-http_persistent 1` | Keep HTTP connections alive | Performance |
| `-http_seekable 0` | Disable seeking | Live stream optimization |
| `-c:v copy` | Copy video codec | No re-encoding (fast) |
| `-c:a copy` | Copy audio codec | No re-encoding (fast) |
| `-f mpegts` | Output format | Plex requirement |
| `pipe:1` | Output to stdout | Direct piping to response |

### Environment Variables

```yaml
# Docker environment configuration
environment:
  - ADVERTISED_HOST=192.168.4.56    # Critical: Must match your network
  - HTTP_PORT=3000                  # Port PlexBridge listens on
  - STREAM_PORT=3000                 # Usually same as HTTP_PORT
  - MAX_CONCURRENT_STREAMS=10       # FFmpeg process limit
  - TRANSCODE_ENABLED=true          # Enable transcoding
  - FFMPEG_PATH=/usr/bin/ffmpeg     # FFmpeg binary location
```

## Stream Resilience System

**Added:** September 2025 - **Status:** ✅ Production Ready

PlexBridge now includes a comprehensive Stream Resilience System that prevents Plex client crashes when upstream IPTV feeds experience quality degradation or H.264 corruption.

### Problem Solved
Prior to this implementation, Plex clients would crash after 7 seconds when encountering H.264 corruption errors such as:
- "non-existing PPS 0 referenced" 
- "decode_slice_header error"
- H.264 parameter set corruption
- Bitstream integrity issues

### Multi-Layer Recovery Architecture

The resilience system provides four layers of recovery:

1. **FFmpeg-Level Recovery (1-8 seconds)**: Built-in reconnection with H.264 error tolerance
2. **Process-Level Recovery (2-8 seconds)**: FFmpeg process restart with enhanced buffers
3. **Session-Level Recovery (5-15 seconds)**: Session recreation with profile switching
4. **Smart Buffering (Continuous)**: Maintains client connection during all recovery layers

### Resilience Profiles

#### H.264 Corruption Resilient Profile
Used automatically when corruption is detected:

```bash
# Maximum error tolerance flags
-err_detect ignore_err              # Ignore all decoder errors
-fflags discardcorrupt             # Discard corrupt packets
-skip_frame noref                  # Skip non-reference frames if corrupted
-reconnect_delay_max 15            # Extended reconnect tolerance
-bsf:v h264_mp4toannexb,extract_extradata  # Enhanced parameter set handling
```

#### Stream Continuity Profile  
Prioritizes uptime over quality:

```bash
# Maximum reconnection tolerance
-reconnect_delay_max 30            # Up to 30 second delays
-skip_frame nonkey                 # Skip all but keyframes if needed
-ec 3                              # Maximum error concealment
-rtbufsize 5M                      # Large input buffers
```

### Configuration

Enable and configure resilience via environment variables:

```bash
# Core resilience settings
STREAM_RESILIENCE_ENABLED=true
STREAM_RESILIENCE_LEVEL=maximum     # standard|enhanced|maximum|corruption_tolerant|continuity_priority
H264_CORRUPTION_TOLERANCE=maximum   # ignore|basic|maximum
ERROR_RECOVERY_MODE=smart          # smart|aggressive|conservative
CONTINUOUS_BUFFERING=true
```

### Integration with Streaming Flow

The resilience system seamlessly integrates into the existing streaming architecture:

```
Plex Request → StreamManager → StreamResilienceService → FFmpeg Profiles
                     ↓                    ↓                      ↓
              Active Monitoring → Corruption Detection → Automatic Recovery
                     ↓                    ↓                      ↓
              Event Logging → Profile Switching → Continuous Output
```

### Benefits

- **Zero Client Crashes**: Streams continue despite upstream corruption
- **Automatic Recovery**: No manual intervention required
- **Quality Adaptation**: Graceful degradation when needed
- **Monitoring**: Detailed logging of resilience events
- **Configurable**: Adjustable resilience levels per deployment

### Monitoring

Monitor resilience events in real-time:

```bash
# View resilience-related log entries
tail -f /data/logs/streams-$(date +%Y-%m-%d).log | grep -i "resilience\|corruption\|recovery"

# Example log output:
[INFO] Stream resilience: H.264 corruption detected, switching to resilient profile
[WARN] Stream recovery: Layer 1 failed, escalating to process restart
[INFO] Stream recovery: Successfully recovered after 3.2 seconds
```

For complete details, see: [Stream Resilience Guide](Stream-Resilience-Guide.md)

## Critical Implementation Details

### 1. URL Rewriting for HLS Streams

When proxying HLS streams for web playback, PlexBridge must rewrite relative URLs in the playlist:

```javascript
// BEFORE: Uses request host (often localhost)
const baseUrl = `http://${req.get('host')}/stream/${channel.id}/`;

// AFTER: Uses advertised host from settings
const advertisedHost = settings?.plexlive?.network?.advertisedHost || 
                      process.env.ADVERTISED_HOST || 
                      req.get('host').split(':')[0];
const httpPort = process.env.HTTP_PORT || 3000;
const baseUrl = `http://${advertisedHost}:${httpPort}/stream/${channel.id}/`;
```

### 2. Direct Piping (No Buffering)

**Critical Discovery**: Buffering MPEG-TS packets causes Plex to timeout.

```javascript
// ❌ WRONG - Causes 25-second timeout
let packetBuffer = Buffer.alloc(0);
while (packetBuffer.length >= BUFFER_SIZE) {
  const packetGroup = packetBuffer.slice(0, BUFFER_SIZE);
  res.write(packetGroup);
}

// ✅ CORRECT - Direct pipe, no buffering
ffmpegProcess.stdout.pipe(res);
```

### 3. Redirect Resolution

Many IPTV streams use redirects. PlexBridge must resolve these before passing to FFmpeg:

```javascript
// Special handling for known redirect services
if (streamUrl.includes('mjh.nz') || streamUrl.includes('')) {
  const response = await axios.head(streamUrl, {
    maxRedirects: 0,  // Get redirect location
    validateStatus: (status) => status === 302
  });
  finalStreamUrl = response.headers.location || streamUrl;
}
```

### 4. Session Management

Each stream creates a session for tracking:

```javascript
const sessionId = `plex_${channel.id}_${clientIdentifier}_${Date.now()}`;
const streamInfo = {
  streamId: channel.id,
  sessionId,
  process: ffmpegProcess,
  startTime: Date.now(),
  clientIP: req.ip,
  userAgent: req.get('User-Agent'),
  channelName: channel.name,
  isPlexStream: true
};
```

### 5. Metadata Handling (Critical for Stability)

**See full documentation: [Plex-Metadata-System.md](./Plex-Metadata-System.md)**

Plex requires comprehensive metadata for Live TV to function without crashes. Key endpoints:

```javascript
// Channel lineup - HDHomeRun format
GET /lineup.json
Response: [{ GuideNumber, GuideName, VideoCodec, AudioCodec, URL }]

// Full metadata - Complete Video→Media→Part→Stream hierarchy  
GET /library/metadata/:metadataId
Response: { MediaContainer: { Video: [{ type: "episode", Media: [...] }] } }

// Timeline - Playback tracking
GET /timeline/:itemId
Response: { MediaContainer: { Timeline: [{ duration: 86400000, state: "playing" }] } }

// Consumer tracking - Session persistence
GET /consumer/:sessionId/:action
Response: { success: true, status: "active", consumer: { available: true } }
```

**Critical Metadata Rules:**
1. **Always return JSON** - Never HTML error pages
2. **Use type "episode"** - Not type 5 (trailer) for Live TV
3. **Include duration** - 86400000ms (24 hours) for live content
4. **Complete hierarchy** - Video→Media→Part→Stream structure
5. **Never fail** - Always return valid fallback data

## Performance Optimizations

### 1. Connection Pooling
- Database uses SQLite with WAL mode
- Connection pool size: 5 connections
- Busy timeout: 5000ms

### 2. Caching Strategy
- Settings cached in memory
- Channel lineup cached
- EPG data cached with TTL

### 3. Process Management
- FFmpeg processes limited to MAX_CONCURRENT_STREAMS
- Automatic cleanup on disconnect
- Process timeout handling (30 seconds default)

### 4. Network Optimizations
- HTTP keep-alive for persistent connections
- No chunked encoding for Plex streams
- Direct piping eliminates memory buffering

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Plex Shows "Recording Failed" Error
**Symptoms**: Stream starts but stops after 25 seconds
**Cause**: Buffering in the stream pipeline
**Solution**: Ensure direct piping from FFmpeg to response

#### 2. Localhost URLs in Playlist
**Symptoms**: Streams work locally but not from remote Plex
**Cause**: URL rewriting using wrong host
**Solution**: Set ADVERTISED_HOST environment variable

#### 3. Stream Won't Start
**Symptoms**: Immediate failure, no data transfer
**Cause**: FFmpeg can't access stream URL
**Solution**: Check stream URL accessibility, resolve redirects

#### 4. "Unable to find title" Error in Plex
**Symptoms**: Plex can't identify the stream
**Cause**: Missing or incorrect EPG data
**Solution**: Ensure EPG sources are configured and updated

### Debug Commands

```bash
# Check if FFmpeg can access a stream
docker exec plextv ffmpeg -i https://stream.url -f null -

# Monitor real-time logs
docker logs plextv -f | grep -i stream

# Test stream endpoint directly
curl -H "User-Agent: Lavf/LIBAVFORMAT_VERSION" \
  http://192.168.4.56:3000/stream/{channelId} \
  | head -c 1000 | od -c

# Check active FFmpeg processes
docker exec plextv ps aux | grep ffmpeg
```

### Log Analysis Points

1. **Stream Detection**
   ```
   "Plex request detected - forcing MPEG-TS transcoding"
   ```

2. **FFmpeg Start**
   ```
   "FFmpeg MPEG-TS process started" with pid
   ```

3. **Data Transfer**
   ```
   "bytesTransferred": 19121668, "avgBitrate": 378119
   ```

4. **Session End**
   ```
   "Stream session ended" with endReason
   ```

## Configuration Files

### Docker Compose Settings (`docker-local.yml`)
```yaml
environment:
  - NODE_ENV=production
  - HOST_IP=192.168.4.56          # Your server IP
  - HTTP_PORT=3000                # PlexBridge port
  - ADVERTISED_HOST=192.168.4.56  # Critical for remote access
  - BASE_URL=http://192.168.4.56:3000
  - DEVICE_UUID=plextv-local-stable-uuid-001
  - TUNER_COUNT=5                 # Number of concurrent streams
```

### Database Settings
- Max concurrent streams: 4 (configurable in UI)
- Stream timeout: 30000ms
- Reconnect attempts: 3
- Buffer size: 65536 bytes

### Cache Configuration
- Type: Memory cache (Redis optional)
- Session TTL: 3600 seconds
- Channel cache: 300 seconds
- EPG cache: 3600 seconds

## Summary

The PlexBridge streaming architecture successfully bridges IPTV streams to Plex by:

1. **Emulating HDHomeRun**: Complete API compatibility
2. **Protocol Translation**: Converting various formats to MPEG-TS
3. **Direct Streaming**: No buffering for real-time delivery
4. **Smart URL Handling**: Proper host resolution and rewriting
5. **Robust Error Handling**: Graceful fallbacks and cleanup

The critical insight is that Plex requires immediate, unbuffered MPEG-TS data delivery. Any buffering or delays cause timeouts and playback failures.