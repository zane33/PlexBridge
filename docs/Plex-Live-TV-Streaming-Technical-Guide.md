# Plex Live TV Streaming - Technical Implementation Guide

## Overview

PlexBridge implements HDHomeRun tuner emulation to provide Plex Media Server with live TV streaming capabilities. This document explains the technical implementation details, MPEG-TS format requirements, and troubleshooting procedures for Plex Live TV integration.

## Architecture

### HDHomeRun Emulation Protocol

PlexBridge emulates an HDHomeRun network tuner by implementing three key components:

1. **SSDP Discovery Service** - Announces the tuner on the network
2. **HTTP API Endpoints** - Provides channel lineup and device information
3. **MPEG-TS Stream Proxy** - Converts IPTV streams to HDHomeRun-compatible format

### Flow Diagram

```
Plex Media Server
       ↓
   SSDP Discovery (UDP 1900)
       ↓
   Device Discovery (/discover.json)
       ↓
   Channel Lineup (/lineup.json)
       ↓
   Stream Request (/stream/{channelId})
       ↓
   MPEG-TS Stream (FFmpeg Transcoding)
```

## SSDP Discovery Implementation

### Device Advertisement

PlexBridge advertises itself as an HDHomeRun device using SSDP (Simple Service Discovery Protocol):

- **Service Type**: `urn:silicondust-com:device:HDHomeRun:1`
- **Device UUID**: Generated unique identifier
- **Location**: HTTP endpoint for device description
- **Friendly Name**: Configurable device name

### Key Configuration Parameters

```javascript
{
  "FriendlyName": "PlexBridge TEST",
  "Manufacturer": "PlexTV", 
  "DeviceID": "495043A3339A470488850303B2EC993A",
  "BaseURL": "http://192.168.4.56:8080",
  "LineupURL": "http://192.168.4.56:8080/lineup.json",
  "TunerCount": 6
}
```

## HTTP API Endpoints

### Device Discovery (`/discover.json`)

Returns HDHomeRun-compatible device information that Plex uses for tuner identification.

**Response Format:**
```json
{
  "FriendlyName": "PlexBridge TEST",
  "Manufacturer": "PlexTV",
  "ModelNumber": "1.0",
  "FirmwareVersion": "1.0.0",
  "DeviceID": "495043A3339A470488850303B2EC993A",
  "BaseURL": "http://192.168.4.56:8080",
  "LineupURL": "http://192.168.4.56:8080/lineup.json",
  "TunerCount": 6,
  "EPGURL": "http://192.168.4.56:8080/epg/xmltv.xml"
}
```

### Channel Lineup (`/lineup.json`)

Provides the list of available channels with their stream URLs.

**Response Format:**
```json
[
  {
    "GuideNumber": "1",
    "GuideName": "HGTV", 
    "URL": "http://192.168.4.56:8080/stream/8261d5ae-3683-434a-8d5a-e62307c318f7",
    "HD": 1,
    "DRM": 0,
    "EPGChannelID": "mjh-discovery-hgtv"
  }
]
```

### Device Description (`/device.xml`)

UPnP device description XML that provides detailed device capabilities.

## MPEG-TS Stream Conversion

### The Critical Component

The most complex part of HDHomeRun emulation is converting IPTV streams (typically HLS) into MPEG-TS format that Plex expects from broadcast tuners.

### Plex User-Agent Detection

PlexBridge detects Plex requests using multiple user-agent patterns:

```javascript
const isPlexRequest = userAgent.toLowerCase().includes('plex') || 
                     userAgent.toLowerCase().includes('pms') ||
                     userAgent.toLowerCase().includes('lavf') ||      // FFmpeg/libav from Plex
                     userAgent.toLowerCase().includes('ffmpeg');
```

### MPEG-TS Transcoding Parameters

When Plex requests a stream, PlexBridge uses FFmpeg with HDHomeRun-compatible parameters:

```bash
ffmpeg \
  -i https://mediapackage-hgtv-source.fullscreen.nz/index.m3u8 \
  -c:v copy \
  -c:a copy \
  -f mpegts \
  -mpegts_m2ts_mode 0 \
  -mpegts_start_pid 0x100 \
  -mpegts_copyts 1 \
  -muxrate 0 \
  -avoid_negative_ts make_zero \
  -fflags +genpts+igndts \
  -async 1 \
  -mpegts_pmt_start_pid 0x1000 \
  -mpegts_service_id 1 \
  -max_muxing_queue_size 1024 \
  pipe:1
```

### Parameter Explanations

#### Container Format
- `-f mpegts` - Output MPEG Transport Stream format
- `-mpegts_m2ts_mode 0` - Use standard MPEG-TS (not M2TS/Blu-ray format)

#### Program Tables
- `-mpegts_start_pid 0x100` - Start PID allocation at 256 (standard broadcast practice)
- `-mpegts_pmt_start_pid 0x1000` - Program Map Table PID
- `-mpegts_service_id 1` - Service ID for program identification

#### Timing and Synchronization
- `-mpegts_copyts 1` - Preserve original timestamps from source
- `-avoid_negative_ts make_zero` - Handle negative timestamp issues
- `-fflags +genpts+igndts` - Generate presentation timestamps, ignore decode timestamps
- `-async 1` - Audio synchronization method

#### Streaming Optimization
- `-muxrate 0` - Variable bitrate (like real broadcasts)
- `-max_muxing_queue_size 1024` - Prevent buffer overflow in live streams

## Stream URL Resolution

### Handling Redirects

Many IPTV sources use URL redirects. PlexBridge resolves these before passing to FFmpeg:

```javascript
// Example: https://i.mjh.nz/.r/discovery-hgtv.m3u8
// Redirects to: https://mediapackage-hgtv-source.fullscreen.nz/index.m3u8

const response = await axios.head(streamUrl, {
  maxRedirects: 5,
  timeout: 10000,
  headers: { 'User-Agent': 'PlexBridge/1.0' }
});
const finalStreamUrl = response.request.responseURL || streamUrl;
```

### HLS Protocol Support

For HLS streams (.m3u8), additional FFmpeg parameters ensure compatibility:

```bash
-allowed_extensions ALL \
-protocol_whitelist file,http,https,tcp,tls,pipe
```

**CRITICAL**: The `pipe` protocol must be included in the whitelist to allow FFmpeg to output to stdout (`pipe:1`). Without this, FFmpeg will fail with the error:
```
[pipe @ 0x...] Protocol 'pipe' not on whitelist 'file,http,https,tcp,tls'!
Error opening output file pipe:1: Invalid argument
```

## Network Configuration

### HTTP Headers for HDHomeRun Emulation (Critical - August 2025)

PlexBridge must send specific HTTP headers to emulate real HDHomeRun devices correctly:

```javascript
// Correct headers for Plex streaming (matches real HDHomeRun behavior)
res.set({
  'Content-Type': 'video/mp2t',         // MPEG-TS MIME type
  'Access-Control-Allow-Origin': '*',   // Allow cross-origin requests
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Accept-Ranges': 'none',              // Live streams don't support range requests
  'Connection': 'keep-alive'            // REQUIRED for continuous streaming
  // NO Transfer-Encoding header - causes Plex rebuffering issues
  // NO Content-Length header - live streams have unknown length
});
```

**Critical Header Requirements:**
- ✅ **Connection: keep-alive** - MUST be used for continuous streaming
- ❌ **Transfer-Encoding: chunked** - Do NOT use (causes Plex buffering/rebuffering)
- ❌ **Content-Length** - Do NOT set (live streams have indeterminate length)
- ❌ **Connection: close** - Do NOT use (terminates stream prematurely)

This configuration matches real HDHomeRun devices which stream continuously without chunked encoding or predetermined content length.

### IP Address Advertisement

Critical for Plex discovery - PlexBridge must advertise the correct IP address:

**Priority Order:**
1. `ADVERTISED_HOST` environment variable (Docker)
2. Settings UI configuration
3. Config file setting
4. Auto-detected network interface

### Port Configuration

- **HTTP Server**: 8080 (configurable)
- **SSDP Discovery**: 1900/UDP
- **Stream Delivery**: Same as HTTP port

## Troubleshooting

### Common Issues and Solutions

#### 1. "Could not tune channel" Error
**Symptoms:** Plex shows tuner/antenna error
**Cause:** MPEG-TS stream format incompatibility
**Solution:** Verify FFmpeg MPEG-TS parameters are HDHomeRun-compatible

#### 2. "Invalid data found when processing input"
**Symptoms:** Plex connects but can't process stream
**Causes:** 
- FFmpeg protocol whitelist missing 'pipe' protocol
- Malformed MPEG-TS packets or missing program tables
- HLS protocol arguments in wrong order
**Solutions:** 
- Ensure protocol whitelist includes: `file,http,https,tcp,tls,pipe`
- Place HLS arguments BEFORE input URL: `[hls-args] -i [url]`
- Check FFmpeg PID allocation and program table generation

#### 3. Discovery Issues
**Symptoms:** Plex doesn't find the tuner
**Cause:** Wrong IP address advertisement or SSDP problems
**Solution:** Verify `ADVERTISED_HOST` setting and network connectivity

#### 4. Stream URL Resolution
**Symptoms:** FFmpeg fails to access stream
**Cause:** Redirect resolution failure
**Solution:** Check redirect handling and source stream availability

### Diagnostic Commands

#### Test MPEG-TS Output
```bash
curl -A "Lavf/LIBAVFORMAT_VERSION" \
     "http://localhost:8080/stream/CHANNEL_ID" | \
     head -c 500 | od -x
```
*Should show MPEG-TS sync bytes (47) and proper packet structure*

#### Check FFmpeg Process
```bash
docker exec plextv ps aux | grep ffmpeg
```

#### Verify Discovery Response
```bash
curl -s http://localhost:8080/discover.json | jq .
```

#### Test Stream Redirect Resolution
```bash
curl -v "https://i.mjh.nz/.r/discovery-hgtv.m3u8" 2>&1 | grep -i location
```

## Performance Considerations

### CPU Usage
- Stream copying (`-c:v copy -c:a copy`) minimizes CPU usage
- No video/audio re-encoding required for most sources
- Multiple concurrent streams supported

### Memory Usage
- FFmpeg buffer management prevents memory leaks
- Streaming output (pipe:1) avoids disk I/O
- Connection cleanup on client disconnect

### Network Bandwidth
- Direct stream copying preserves original quality and bitrate
- No additional bandwidth overhead from transcoding
- Efficient MPEG-TS packetization

## Configuration Examples

### Docker Compose
```yaml
environment:
  - ADVERTISED_HOST=192.168.4.56
  - BASE_URL=http://192.168.4.56:8080
  - MAX_CONCURRENT_STREAMS=6
```

### HDHomeRun Device Settings
```json
{
  "plexlive": {
    "device": {
      "name": "PlexBridge TEST",
      "tunerCount": 6
    },
    "network": {
      "advertisedHost": "192.168.4.56"
    }
  }
}
```

## MPEG-TS Format Specifications

### Packet Structure
- **Packet Size**: 188 bytes
- **Sync Byte**: 0x47
- **PID Allocation**: 0x100+ for elementary streams
- **Program Tables**: PAT (PID 0x0) and PMT (PID 0x1000)

### Essential Tables
- **PAT (Program Association Table)**: Maps program numbers to PMT PIDs
- **PMT (Program Map Table)**: Maps elementary stream PIDs to codec types
- **PCR (Program Clock Reference)**: Timing synchronization

### HDHomeRun Compatibility
Real HDHomeRun devices output standard broadcast MPEG-TS with:
- Proper continuity counters
- Valid program tables
- Consistent timing references
- Standard PID allocation

PlexBridge replicates this format to ensure Plex compatibility.

## Advanced Configuration

### Custom FFmpeg Parameters
FFmpeg parameters can be customized through the Settings UI or configuration files:

**Settings UI Path:** Settings → Transcoding → MPEG-TS Configuration

**Database Storage:** Parameters are persisted with priority order:
1. Environment variables
2. Settings UI values (database)
3. Configuration file defaults
4. Built-in fallbacks

**Default Optimized Command (August 2025):**
```bash
-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 pipe:1
```

**Key Improvements:**
- Auto-reconnection on stream failure
- Timestamp correction and synchronization
- Corrupted packet handling
- Zero-delay muxing for low latency

**Configuration Structure:**
```json
{
  "plexlive": {
    "transcoding": {
      "mpegts": {
        "enabled": true,
        "ffmpegArgs": "-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 pipe:1",
        "hlsProtocolArgs": "-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe"
      }
    }
  }
}
```

**Advanced Options:**
```javascript
// Video transcoding (if needed)
'-c:v', 'libx264', '-preset', 'ultrafast'

// Audio transcoding (if needed)  
'-c:a', 'aac', '-b:a', '128k'

// Custom MPEG-TS options
'-mpegts_service_type', '0x01'  // Digital TV service
```

**URL Placeholder:** Use `[URL]` in FFmpeg command - it will be replaced with the resolved stream URL.

### EPG Integration
Electronic Program Guide data enhances Plex Live TV:

```json
{
  "EPGURL": "http://192.168.4.56:8080/epg/xmltv.xml",
  "GuideURL": "http://192.168.4.56:8080/epg/xmltv.xml",
  "EPGDays": 7,
  "SupportsEPG": true
}
```

## Security Considerations

### Network Access
- PlexBridge should be on trusted network segments
- SSDP broadcasts can reveal device presence
- Stream URLs may contain authentication tokens

### Stream Security
- HTTPS source streams recommended
- Authentication headers properly forwarded
- No stream content caching (privacy)

## Monitoring and Logging

### Key Metrics
- Active stream count
- FFmpeg process health
- SSDP announcement frequency
- Client connection patterns

### Log Analysis
```bash
# Stream requests
grep "Stream request received" /data/logs/plextv.log

# FFmpeg processes
grep "FFmpeg.*started" /data/logs/plextv.log

# Plex detection
grep "isPlexRequest: true" /data/logs/plextv.log

# FFmpeg errors (protocol issues)
grep "Protocol.*not on whitelist" /data/logs/plextv.log

# MPEG-TS output verification
grep "FFmpeg MPEG-TS stdout data received" /data/logs/plextv.log
```

## Detailed Debugging Guide

### FFmpeg Protocol Whitelist Issue (RESOLVED)

**Problem:** Stream endpoint returns 0 bytes to Plex with error:
```
[pipe @ 0x...] Protocol 'pipe' not on whitelist 'file,http,https,tcp,tls'!
[out#0/mpegts @ 0x...] Error opening output pipe:1: Invalid argument
Error opening output file pipe:1.
```

**Root Cause Analysis:**
1. HLS protocol arguments were missing `pipe` protocol in whitelist
2. Protocol arguments were placed AFTER input URL instead of BEFORE
3. FFmpeg couldn't output to stdout (`pipe:1`) due to security restrictions

**Correct FFmpeg Command Structure:**
```bash
# CORRECT ORDER:
ffmpeg -hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1

# INCORRECT ORDER (causes failure):
ffmpeg -i [URL] -allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls [other-args] pipe:1
```

**Implementation Fix:**
1. **Configuration Update:**
```json
{
  "hlsProtocolArgs": "-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe"
}
```

2. **Code Logic Fix:**
```javascript
// BEFORE (broken):
ffmpegCommand.replace('-i ' + finalStreamUrl, '-i ' + finalStreamUrl + ' ' + hlsArgs);

// AFTER (working):
ffmpegCommand.replace('-i ' + finalStreamUrl, hlsArgs + ' -i ' + finalStreamUrl);
```

**Verification Steps:**
1. Check logs for "FFmpeg MPEG-TS stdout data received" with byte counts
2. Test stream endpoint: `curl -A "Plex/1.0" http://localhost:8080/stream/CHANNEL_ID`
3. Verify binary MPEG-TS data flows (not 0 bytes)

### Stream Request Flow Debugging

**Complete Request Trace:**
```
1. Plex sends request: GET /stream/CHANNEL_ID
   User-Agent: Contains 'plex', 'pms', 'lavf', or 'ffmpeg'

2. PlexBridge detects Plex request:
   isPlexRequest = true → proxyPlexCompatibleStream()

3. URL resolution (for redirects):
   Original: https://i.mjh.nz/.r/discovery-hgtv.m3u8
   Resolved: https://mediapackage-hgtv-source.fullscreen.nz/index.m3u8

4. FFmpeg command assembly:
   Base: -hide_banner -loglevel error -i [URL] -c:v copy -c:a copy -f mpegts pipe:1
   HLS: -allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe
   Final: [HLS-args] -i [resolved-URL] [base-args] pipe:1

5. FFmpeg execution:
   Process starts → PID logged
   stdout pipe → MPEG-TS data to Plex
   stderr → Error logging (if any)

6. Data flow verification:
   "FFmpeg MPEG-TS stdout data received" with dataSize: 65536 bytes
```

**Debug Commands for Each Step:**
```bash
# 1. Test Plex request detection
curl -A "Plex/1.0" -v http://localhost:8080/stream/CHANNEL_ID

# 2. Verify redirect resolution  
curl -v https://i.mjh.nz/.r/discovery-hgtv.m3u8 2>&1 | grep -i location

# 3. Check FFmpeg command construction
grep "Executing FFmpeg command" /data/logs/plextv.log | tail -1

# 4. Monitor real-time FFmpeg output
grep "FFmpeg MPEG-TS stdout" /data/logs/plextv.log | tail -5

# 5. Verify MPEG-TS packet structure
curl -A "Plex/1.0" http://localhost:8080/stream/CHANNEL_ID | hexdump -C | head -10
```

**Expected MPEG-TS Output Pattern:**
```
47 xx xx xx  [sync byte 0x47 + packet header]
...188 bytes total per packet...
47 xx xx xx  [next packet starts with sync byte]
```

## Future Enhancements

### Potential Improvements
1. **Hardware Transcoding**: GPU-accelerated encoding for H.264 conversion
2. **Adaptive Bitrate**: Dynamic quality adjustment based on network conditions
3. **Stream Caching**: Temporary caching for multiple clients
4. **Enhanced EPG**: Real-time guide data synchronization
5. **Multi-Protocol**: Support for additional streaming protocols (RTSP, UDP, etc.)

### Protocol Extensions
- **HDHR Protocol v2**: Enhanced features and capabilities
- **Native Plex API**: Direct integration without HDHomeRun emulation
- **DLNA/UPnP**: Additional media server compatibility

---

This technical guide provides comprehensive coverage of PlexBridge's Plex Live TV streaming implementation. The MPEG-TS transcoding with proper HDHomeRun-compatible parameters is the key to successful Plex integration.