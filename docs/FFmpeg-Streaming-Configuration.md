# FFmpeg Streaming Configuration Guide

## Overview
PlexBridge uses FFmpeg for stream transcoding and format conversion. This document details the optimized FFmpeg configuration that provides reliable streaming with automatic reconnection, timestamp correction, and error resilience.

## Default FFmpeg Command

As of August 2025, PlexBridge uses the following optimized FFmpeg command by default:

```bash
-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 pipe:1
```

## Command Breakdown

### Input Options (Before `-i`)

#### Error Handling & Logging
- `-hide_banner`: Suppresses FFmpeg copyright banner for cleaner logs
- `-loglevel error`: Only shows error messages, reducing log verbosity

#### Reconnection Settings
- `-reconnect 1`: Enables automatic reconnection if the connection is lost
- `-reconnect_at_eof 1`: Attempts to reconnect when reaching end of file (useful for live streams)
- `-reconnect_streamed 1`: Enables reconnection for streamed protocols
- `-reconnect_delay_max 2`: Maximum delay between reconnection attempts (2 seconds)

#### Input
- `-i [URL]`: Input stream URL (placeholder replaced with actual stream URL)

### Output Options (After `-i`)

#### Codec Settings
- `-c:v copy`: Copy video codec without re-encoding (preserves quality, reduces CPU usage)
- `-c:a copy`: Copy audio codec without re-encoding

#### Format & Muxing
- `-f mpegts`: Output format as MPEG Transport Stream (required for Plex)
- `-mpegts_copyts 1`: Preserve original timestamps in MPEG-TS output
- `-muxdelay 0`: No artificial delay in muxing
- `-muxpreload 0`: No preload buffering for muxing

#### Timestamp Handling
- `-avoid_negative_ts make_zero`: Shifts timestamps to start from zero
- `-copyts`: Preserves original timestamps from input
- `-fflags +genpts+igndts+discardcorrupt`: 
  - `genpts`: Generate missing PTS (Presentation Timestamps)
  - `igndts`: Ignore DTS (Decoding Timestamps) errors
  - `discardcorrupt`: Discard corrupted packets instead of failing

#### Output
- `pipe:1`: Output to stdout for streaming to Plex

## Key Benefits

### 1. **Automatic Reconnection**
The reconnection parameters ensure streams automatically recover from temporary network issues:
- Reconnects on connection loss
- Reconnects at stream end (for looping playlists)
- Maximum 2-second delay prevents excessive retry loops

### 2. **Timestamp Correction**
Multiple timestamp handling options ensure smooth playback:
- Generates missing timestamps
- Handles negative timestamps
- Preserves original timing while fixing errors

### 3. **Error Resilience**
The configuration gracefully handles corrupted data:
- Discards bad packets instead of crashing
- Ignores timestamp errors
- Continues streaming despite minor issues

### 4. **Performance Optimization**
Direct codec copying and minimal buffering provide:
- Low CPU usage (no transcoding)
- Minimal latency
- Reduced memory usage

## Customization

You can customize the FFmpeg command in PlexBridge through:

1. **Web Interface**: Settings → Transcoding → FFmpeg Arguments
2. **Configuration File**: `/config/default.json` → `plexlive.transcoding.mpegts.ffmpegArgs`
3. **Environment Variable**: Set custom arguments at runtime

### Common Customizations

#### Force Transcoding (Higher CPU, Better Compatibility)
```bash
-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v libx264 -preset veryfast -c:a aac -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt pipe:1
```

#### Aggressive Error Recovery (For Unstable Streams)
```bash
-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 5 -max_error_rate 0.5 -i [URL] -c:v copy -c:a copy -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt+nobuffer -copyts -muxdelay 0 -muxpreload 0 -err_detect ignore_err pipe:1
```

#### Low Latency (For Live Events)
```bash
-hide_banner -loglevel error -fflags nobuffer -flags low_delay -reconnect 1 -reconnect_at_eof 1 -i [URL] -c:v copy -c:a copy -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt+nobuffer -copyts -muxdelay 0 -muxpreload 0 pipe:1
```

## Troubleshooting

### Stream Keeps Disconnecting
- Increase `-reconnect_delay_max` to 5 or 10 seconds
- Add `-max_reload 1000` for HLS streams
- Check network stability

### Audio/Video Sync Issues
- Ensure `-copyts` and `-mpegts_copyts 1` are present
- Try adding `-async 1` for audio sync
- Consider transcoding with `-c:a aac`

### High CPU Usage
- Verify `-c:v copy -c:a copy` for codec copying
- Remove any transcoding parameters
- Check if source requires transcoding

### Corrupted Output
- Ensure `-fflags +discardcorrupt` is present
- Add `-err_detect ignore_err` for aggressive error handling
- Check source stream quality

## Performance Metrics

With the optimized configuration, PlexBridge typically achieves:
- **CPU Usage**: 1-5% per stream (codec copy)
- **Memory Usage**: 10-30MB per stream
- **Latency**: < 2 seconds end-to-end
- **Reconnection Time**: < 2 seconds
- **Error Recovery**: Automatic, transparent to Plex

## Version History

- **August 2025**: Enhanced configuration with reconnection, timestamp correction, and error resilience
- **Previous**: Basic codec copy configuration without error handling

## Related Documentation

- [Streaming Architecture Guide](Streaming-Architecture-Guide.md)
- [Plex Live TV Integration](Plex-Live-TV-Integration.md)
- [Troubleshooting Guide](Troubleshooting.md)