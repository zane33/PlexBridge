# HLS/M3U8 Stream Handling Analysis Report

## Executive Summary

After analyzing the PlexBridge HLS/m3u8 stream handling implementation, I've identified several critical issues that are causing complex HLS streams like TVNZ 1 (https://i.mjh.nz/.r/tvnz-1.m3u8) to fail. The application has multiple HLS handling components but lacks proper coordination and resilience for complex, tokenized, and geo-locked streams.

## Current Implementation Overview

### Key Components Identified

1. **StreamManager.js** (`/server/services/streamManager.js`)
   - Main stream handling service (53,000+ lines)
   - Contains HLS detection and processing logic
   - Handles FFmpeg configuration for HLS streams
   - Implements beacon/tracking URL processing for Amagi.tv streams

2. **AdvancedM3U8Resolver.js** (`/server/services/advancedM3U8Resolver.js`)
   - VLC-compatible M3U8 resolution service
   - Progressive initialization for slow upstream connections
   - Master/variant playlist parsing
   - Segment URL resolution with base URL handling

3. **HLSSegmentResolver.js** (`/server/services/hlsSegmentResolver.js`)
   - Segment URL resolution and caching
   - Playlist fetching with redirect following
   - Android TV compatibility features

4. **HLSQualitySelector.js** (`/server/services/hlsQualitySelector.js`)
   - Quality variant selection from master playlists
   - Bandwidth-based quality selection
   - Resolution extraction and comparison

5. **Enhanced Encoding** (`/server/utils/enhancedEncoding.js`)
   - Multiple encoding profiles for unreliable streams
   - H.264 error recovery modes
   - Anti-loop protection for problematic streams
   - Emergency safe mode for PPS corruption issues

## Critical Issues Identified

### 1. **Complex Tokenized URL Handling**

**Problem:** Streams like TVNZ use complex tokenized URLs with beacon tracking that are not properly processed.

**Evidence from logs:**
```
[hls @ 0x7a56d6924600] parse_playlist error Immediate exit requested
Error opening input file https://amg00663-skynews-skynewsau-samsungau-r7n40.amagi.tv/...
```

**Current Implementation Gap:**
- The `processPlaylistWithBeacons()` method only handles Amagi.tv domains
- No generic tokenized URL processing for other providers
- Token extraction and preservation is incomplete

### 2. **Inadequate Playlist Resolution**

**Problem:** The system fails to properly resolve multi-level HLS playlists (master → variant → media segments).

**Current Implementation:**
```javascript
// From streamManager.js
if (finalUrl.includes('.m3u8')) {
    // HLS arguments with critical parameters restored for TVNZ 1, Three, etc.
    let hlsArgs = [
        '-allowed_extensions', 'ALL',
        '-protocol_whitelist', 'file,http,https,tcp,tls,pipe,crypto',
        // ...
    ];
}
```

**Issues:**
- FFmpeg arguments are applied blindly without understanding playlist structure
- No intelligent parsing of playlist hierarchy
- Missing proper base URL resolution for relative segment URLs

### 3. **Lack of Coordination Between Components**

**Problem:** Multiple HLS handling services operate independently without proper coordination.

**Example:**
- `AdvancedM3U8Resolver` implements comprehensive playlist parsing
- `StreamManager` doesn't utilize `AdvancedM3U8Resolver` for complex streams
- `HLSSegmentResolver` duplicates functionality already in `AdvancedM3U8Resolver`

### 4. **FFmpeg Configuration Issues**

**Problem:** FFmpeg is being given raw m3u8 URLs without proper preprocessing.

**Current Approach:**
```javascript
// Direct FFmpeg invocation with raw URL
ffmpegCommand = ffmpegCommand.replace('[URL]', finalStreamUrl);
```

**Issues:**
- FFmpeg struggles with tokenized/dynamic URLs
- No pre-resolution of playlists before passing to FFmpeg
- Missing critical headers for authenticated streams

### 5. **Enhanced Encoding Misconfiguration**

**Problem:** The enhanced encoding system has an "EMERGENCY OVERRIDE" forcing all streams to emergency-safe mode:

```javascript
// From enhancedEncoding.js
// EMERGENCY OVERRIDE: Force ALL enhanced encoding to use emergency-safe mode
logger.error('EMERGENCY OVERRIDE: Enhanced encoding forced to emergency-safe mode', {
    requestedProfile,
    forcedProfile: 'emergency-safe'
});
return 'emergency-safe'; // FORCE emergency mode for ALL enhanced encoding
```

This override may be causing issues with HLS streams that need different handling.

### 6. **Geo-blocking and Authentication**

**Problem:** No proper handling of geo-restricted or authenticated HLS streams.

**Missing Features:**
- IP-based geo-location headers
- Cookie/token preservation across playlist requests
- Session management for authenticated streams

## Specific Issues with TVNZ Streams

### URL Structure Analysis
TVNZ streams (e.g., https://i.mjh.nz/.r/tvnz-1.m3u8) likely have:
1. **Short redirect URL** that resolves to actual CDN
2. **Dynamic token generation** on each request
3. **Geo-restriction** requiring NZ IP or specific headers
4. **Multi-level playlist structure** requiring proper resolution

### Current Failure Points
1. Initial m3u8 fetch may succeed but returns a master playlist
2. Variant playlist URLs contain tokens that expire quickly
3. Segment URLs are relative and not properly resolved
4. FFmpeg receives malformed or expired URLs

## Recommendations for Fix

### 1. **Implement Proper HLS Preprocessing Pipeline**

```javascript
async function preprocessHLSStream(url, options) {
    // Step 1: Resolve redirects and get actual playlist URL
    const resolvedUrl = await resolveRedirects(url);
    
    // Step 2: Fetch and parse master playlist
    const masterPlaylist = await fetchPlaylist(resolvedUrl);
    
    // Step 3: Select best variant
    const variant = await selectVariant(masterPlaylist);
    
    // Step 4: Fetch variant playlist
    const mediaPlaylist = await fetchPlaylist(variant.url);
    
    // Step 5: Create local proxy for segments
    const proxyUrl = await createSegmentProxy(mediaPlaylist);
    
    return proxyUrl;
}
```

### 2. **Integrate AdvancedM3U8Resolver Properly**

The `AdvancedM3U8Resolver` should be the primary handler for ALL m3u8 streams:

```javascript
// In streamManager.js
if (streamUrl.includes('.m3u8')) {
    const resolver = require('./advancedM3U8Resolver');
    const resolution = await resolver.resolveM3U8Stream(streamUrl, {
        connectionLimits: stream?.connection_limits,
        userAgent: req.headers['user-agent'],
        channelId: channel.id
    });
    
    if (resolution.success) {
        finalStreamUrl = resolution.finalUrl;
    }
}
```

### 3. **Implement HLS Segment Proxy**

Create a local proxy that serves segments with proper URL resolution:

```javascript
// New endpoint in streaming.js
app.get('/hls/segment/:sessionId/:segmentName', async (req, res) => {
    const { sessionId, segmentName } = req.params;
    const session = getHLSSession(sessionId);
    
    if (!session) {
        return res.status(404).send('Session not found');
    }
    
    const segmentUrl = resolveSegmentUrl(session.baseUrl, segmentName);
    const segmentData = await fetchSegment(segmentUrl, session.headers);
    
    res.set('Content-Type', 'video/mp2t');
    res.send(segmentData);
});
```

### 4. **Remove Emergency Override**

The emergency override in enhanced encoding should be removed or made conditional:

```javascript
// Instead of forcing emergency-safe for all
if (stream.requires_emergency_mode) {
    return 'emergency-safe';
}
return requestedProfile;
```

### 5. **Add Geo-restriction Support**

Implement proper headers for geo-restricted content:

```javascript
const geoHeaders = {
    'X-Forwarded-For': settings.geo_proxy_ip || '',
    'CF-IPCountry': settings.geo_country_code || '',
    'X-Real-IP': settings.geo_real_ip || ''
};
```

## Testing Requirements

1. **Test with various HLS stream types:**
   - Simple single-playlist streams
   - Multi-level master/variant streams
   - Tokenized/authenticated streams
   - Geo-restricted streams
   - Streams with beacon tracking

2. **Specific test cases for TVNZ:**
   - TVNZ 1: https://i.mjh.nz/.r/tvnz-1.m3u8
   - TVNZ 2: https://i.mjh.nz/.r/tvnz-2.m3u8
   - Three: https://i.mjh.nz/.r/three.m3u8

3. **Performance testing:**
   - Playlist refresh rates
   - Segment caching efficiency
   - Token expiration handling

## Conclusion

The PlexBridge HLS implementation has solid foundational components but lacks proper integration and coordination. The main issues are:

1. **No unified HLS processing pipeline** - components work in isolation
2. **Inadequate playlist resolution** - complex playlists aren't properly parsed
3. **Missing segment proxy** - FFmpeg receives raw URLs instead of proxied ones
4. **Emergency override** forcing suboptimal encoding mode
5. **No geo-restriction support** for regional content

Implementing the recommended fixes should resolve the issues with complex HLS streams like TVNZ while maintaining compatibility with simpler streams.

## Priority Actions

1. **HIGH**: Remove or fix the emergency encoding override
2. **HIGH**: Integrate AdvancedM3U8Resolver into main stream flow
3. **MEDIUM**: Implement HLS segment proxy
4. **MEDIUM**: Add proper playlist preprocessing
5. **LOW**: Add geo-restriction header support

---

*Report generated: August 2025*
*Analyzed by: Claude (Anthropic)*