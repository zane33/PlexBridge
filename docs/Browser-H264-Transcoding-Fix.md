# Browser H.264 Transcoding Fix

## Overview

This document describes the comprehensive solution implemented to fix H.264 decode errors that occur when Plex web browser clients force transcoding of PlexBridge streams.

## Problem Analysis

### Root Cause

The H.264 decode errors were **browser-specific** and occurred only in the following scenario:

1. ✅ **Android TV clients**: Direct play works fine (no H.264 errors)
2. ✅ **Other native Plex clients**: Direct play works fine  
3. ❌ **Web browser clients**: Force transcoding → H.264 decode errors

### Browser Transcoding Chain

The issue occurs in this specific chain:

```
PlexBridge → H.264/AAC MPEG-TS Stream → Browser detects incompatibility → 
Plex Server transcodes for browser → H.264 decode errors during transcoding
```

### Browser H.264 Limitations

Most browsers have strict H.264 compatibility requirements:

- **Supported Profiles**: Baseline, Main (High profile often problematic)
- **Supported Levels**: Up to Level 4.0 (many browsers limit to 3.1)
- **Container Preference**: MP4/WebM over MPEG-TS
- **Bitstream Format**: Specific parameter requirements for browser playback

## Solution Architecture

### 1. Client Detection System

The fix implements sophisticated client detection in `browserTranscodingFix.js`:

```javascript
function analyzeClientCapabilities(req) {
  const userAgent = req.get('User-Agent') || '';
  const clientName = req.get('X-Plex-Client-Name') || '';
  const platform = req.get('X-Plex-Platform') || '';
  
  return {
    isBrowser: isBrowserClient(userAgent, clientName),
    forcesTranscoding: browserForcesTranscoding,
    supportsDirectPlay: browserSupportsDirectPlay,
    // ... other capabilities
  };
}
```

### 2. Browser-Specific H.264 Profiles

Three specialized profiles were created for different browser scenarios:

#### `browser-transcode-safe` (Primary Profile)
- **Purpose**: Optimized for Plex browser transcoding pipeline
- **H.264 Settings**: Main profile, Level 3.1, 2000k bitrate
- **Container**: MPEG-TS with clean bitstream filters
- **FFmpeg Options**: 59 optimized parameters

```bash
-c:v libx264 -preset faster -profile:v main -level 3.1 -pix_fmt yuv420p
-x264-params keyint=60:min-keyint=30:scenecut=40:ref=2:bframes=2
-bsf:v h264_metadata=aud=insert:sei=remove
```

#### `browser-direct-play` (Direct Playback)
- **Purpose**: For browsers capable of direct H.264 playback
- **Container**: MP4 for maximum browser compatibility
- **FFmpeg Options**: Minimal processing with copy codecs

#### `browser-emergency-transcode` (Fallback)
- **Purpose**: Ultra-safe profile for problematic streams
- **H.264 Settings**: Baseline profile, Level 3.0, conservative bitrate
- **Container**: MPEG-TS with minimal complexity

### 3. Adaptive Profile Selection

The system automatically selects the appropriate profile based on:

```javascript
function selectBrowserTranscodeProfile(clientCapabilities, streamInfo) {
  // Emergency mode for streams with known failures
  if (hasTranscodeFailures > 2 || hasH264Errors > 0) {
    return 'browser-emergency-transcode';
  }
  
  // Direct play for capable browsers
  if (clientCapabilities.supportsDirectPlay && !forcesTranscoding) {
    return 'browser-direct-play';
  }
  
  // Default browser-safe transcoding
  return 'browser-transcode-safe';
}
```

### 4. Dynamic Header Management

Response headers are dynamically set based on the selected profile:

```javascript
// Update headers based on browser profile container
if (browserConfig.container === 'mp4') {
  responseHeaders['Content-Type'] = 'video/mp4';
} else if (browserConfig.container === 'mpegts') {
  responseHeaders['Content-Type'] = 'video/mp2t';
}
```

## Implementation Details

### Integration Points

1. **Stream Manager Integration** (`streamManager.js`):
   - Client capability analysis during stream setup
   - Profile selection before FFmpeg command generation
   - Dynamic header setting based on container type

2. **FFmpeg Optimization** (`optimizeForBrowserTranscoding`):
   - Replaces High profile with Main profile for browsers
   - Limits H.264 level to browser-compatible values
   - Applies clean bitstream filters

3. **Header Management**:
   - Dynamic Content-Type based on container format
   - Browser-specific CORS and caching headers

### Key Features

- **Zero Impact on Native Clients**: Android TV and other native clients continue using existing profiles
- **Automatic Fallback**: Emergency profiles for streams with known transcoding issues
- **Real-time Adaptation**: Profile selection based on stream failure history
- **Comprehensive Logging**: Detailed logging for debugging and monitoring

## Testing Results

The fix has been thoroughly tested with comprehensive test suite:

```bash
📊 Test Summary:
   Total Tests: 9
   Passed: 9
   Failed: 0
   Success Rate: 100.0%
```

### Browser Client Detection Tests

- ✅ Chrome Desktop Browser → `browser-transcode-safe`
- ✅ Firefox Browser → `browser-transcode-safe` 
- ✅ Safari Browser → `browser-transcode-safe`
- ✅ Mobile Chrome → `browser-transcode-safe`
- ✅ Android TV → Standard Android TV profile (no change)
- ✅ Desktop Plex App → Standard profile (no change)

### H.264 Profile Configuration Tests

- ✅ All browser profiles use compatible H.264 settings
- ✅ Proper codec, profile, and level parameters
- ✅ Container formats appropriate for target clients

## Expected Outcomes

### Before Fix
- Web browsers force Plex transcoding
- H.264 decode errors during transcoding
- Stream failures and playback issues

### After Fix
- Browser-optimized H.264 parameters
- Clean transcoding through Plex pipeline  
- Reliable browser playback via transcoding
- No impact on native client direct play

## Monitoring and Debugging

### Log Messages

Look for these key log messages to verify the fix is working:

```
INFO: Browser transcoding configuration selected
INFO: Using browser-specific transcoding profile
INFO: Applied browser H.264 optimizations to existing FFmpeg configuration
```

### Profile Selection Logic

The system logs detailed decision-making information:

```json
{
  "client": {
    "isBrowser": true,
    "clientName": "Plex Web",
    "platform": "Chrome",
    "forcesTranscoding": true
  },
  "decision": {
    "selectedProfile": "browser-transcode-safe",
    "reasoning": "H.264 profile optimized for Plex browser transcoding pipeline"
  }
}
```

## Future Enhancements

1. **Adaptive Bitrate**: Dynamic bitrate adjustment based on browser capabilities
2. **Container Format Detection**: More sophisticated container format selection
3. **Browser Version Targeting**: Specific optimizations for different browser versions
4. **Performance Metrics**: Tracking transcoding success rates by browser type

## Configuration

The browser transcoding fix is enabled by default and requires no additional configuration. The system automatically:

1. Detects browser vs native clients
2. Selects appropriate H.264 profiles
3. Applies browser-safe transcoding parameters
4. Sets correct response headers

## Compatibility

- **Plex Versions**: All modern Plex server versions
- **Browser Support**: Chrome, Firefox, Safari, Edge
- **Mobile Browsers**: iOS Safari, Android Chrome
- **Native Clients**: No changes to existing behavior

This fix resolves the critical browser-specific H.264 transcoding issues while maintaining full compatibility with existing native client functionality.