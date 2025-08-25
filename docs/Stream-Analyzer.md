# PlexBridge Stream Analyzer

## Overview

The PlexBridge Stream Analyzer is an intelligent system that automatically detects complex M3U8 stream architectures and enables transcoding when needed for Plex compatibility. This eliminates the need for manual configuration of transcoding parameters for problematic streams.

## Problem Statement

Certain IPTV streams use complex architectures that work fine in media players like VLC but fail in Plex Media Server. These issues include:

- **Extremely long URLs** (1,400+ characters) that exceed Plex's URL buffer limits
- **Beacon/tracking endpoints** with complex redirect chains
- **Server-side ad insertion** (SSAI) with dynamic parameters
- **Authentication tokens** embedded in segment URLs
- **Complex query parameters** for content delivery networks

## How It Works

### 1. Automatic Detection

The analyzer examines M3U8 streams using multiple detection criteria:

#### URL Length Analysis
```javascript
// Triggers if segment URLs exceed certain thresholds
maxUrlLength > 500 chars → High complexity score
avgUrlLength > 200 chars → Medium complexity score
```

#### Architecture Pattern Detection
```javascript
// Detects problematic patterns
hasBeaconUrls = url.includes('/beacon/')
hasRedirectParams = url.includes('redirect_url=')
hasAdInsertion = url.includes('seen-ad=') || url.includes('media_type=')
hasLongTokens = urlPath.length > 300
```

#### CDN Complexity
```javascript
// Identifies complex CDN architectures
complexCdn = domain.includes('amagi.tv') || domain.includes('fastly') ||
             domain.includes('cloudfront') || domain.includes('akamai')
```

### 2. Scoring System

Each detection criterion adds points to a complexity score:

| Criterion | Score | Description |
|-----------|-------|-------------|
| **Extremely long URLs** | +3 | URLs over 500 characters |
| **Beacon endpoints** | +4 | Uses tracking/beacon URLs |
| **Redirect parameters** | +3 | Contains redirect_url parameters |
| **Ad insertion** | +2 | Server-side ad insertion detected |
| **Long tokens** | +2 | Authentication tokens in path |
| **Many parameters** | +2 | Average >5 query parameters |
| **Complex CDN** | +1 | Known complex CDN patterns |

**Decision Threshold**: `complexityScore >= 4` → Enable transcoding

### 3. Automatic Transcoding

When complexity is detected, the system:

1. **Sets `forceTranscode: true`** in stream protocol options
2. **Applies transcoding automatically** during Plex requests
3. **Logs the decision** for transparency
4. **Uses optimal FFmpeg settings** (codec copying, no quality loss)

## Implementation Details

### Core Components

#### `streamAnalyzer.js`
```javascript
// Main analysis functions
analyzeStreamComplexity(m3u8Content, baseUrl)
isComplexStreamUrl(streamUrl)
analyzeRemoteStream(streamUrl, options)
```

#### Integration Points

1. **Stream Creation** (`/api/streams` POST)
   - Analyzes new HLS streams automatically
   - Sets `forceTranscode` in protocol options if needed

2. **Stream Serving** (`/stream/:channelId`)
   - Checks protocol options for auto-transcoding
   - Applies transcoding for Plex requests when needed

3. **Analysis Endpoint** (`/api/streams/analyze`)
   - Manual stream analysis for debugging
   - Returns detailed complexity report

### Analysis Output Format

```javascript
{
  needsTranscoding: true,
  reasons: [
    "Extremely long URLs (max: 1400 chars)",
    "Uses beacon/tracking endpoints",
    "Server-side ad insertion detected"
  ],
  complexityScore: 9,
  details: {
    avgUrlLength: 1200,
    maxUrlLength: 1400,
    hasBeacon: true,
    hasRedirect: true,
    hasAdInsertion: true,
    hasLongTokens: true,
    avgQueryParams: 8.5,
    complexCdn: true,
    avgSegmentDuration: 6.0,
    segmentVariance: 0.1
  }
}
```

## Usage Examples

### Automatic Detection (Default Behavior)

```javascript
// When creating a new stream, analysis happens automatically
POST /api/streams
{
  "channel_id": "channel-uuid",
  "name": "Sky News HD",
  "url": "https://amg00663-skynews-skynewsau-samsungau-r7n40.amagi.tv/...",
  "type": "hls"
}

// Response includes auto-analysis results
{
  "id": "stream-uuid",
  "name": "Sky News HD",
  "url": "https://amg00663...",
  "protocol_options": {
    "forceTranscode": true  // ← Automatically set
  },
  "autoAnalysis": {
    "transcodeRecommended": true,
    "analysis": { /* detailed analysis */ },
    "appliedOptions": {
      "forceTranscode": true
    }
  }
}
```

### Manual Analysis

```javascript
// Analyze a stream URL for complexity
POST /api/streams/analyze
{
  "url": "https://problematic-stream.com/playlist.m3u8"
}

// Returns detailed analysis
{
  "needsTranscoding": true,
  "complexityScore": 6,
  "reasons": ["Long URLs", "Beacon endpoints"],
  "details": { /* detailed metrics */ }
}
```

### Stream Serving

```javascript
// When Plex requests a stream, auto-transcoding is applied
GET /stream/channel-uuid
// → Automatically applies ?transcode=true for complex streams
// → Logs: "Auto-transcoding enabled due to stream complexity analysis"
```

## Configuration

### Detection Thresholds

You can adjust detection sensitivity by modifying the scoring thresholds in `streamAnalyzer.js`:

```javascript
// Current thresholds
URL_LENGTH_HIGH = 500      // chars
URL_LENGTH_MEDIUM = 200    // chars
QUERY_PARAM_THRESHOLD = 5  // avg parameters
TOKEN_LENGTH_THRESHOLD = 300  // path chars
DECISION_THRESHOLD = 4     // complexity score
```

### Timeout Settings

```javascript
// Analysis timeouts
STREAM_ANALYSIS_TIMEOUT = 10000  // ms (stream creation)
MANUAL_ANALYSIS_TIMEOUT = 15000  // ms (manual analysis)
```

## Benefits

### For Users
- **Zero Configuration**: Complex streams work automatically
- **Better Reliability**: Reduces Plex streaming failures
- **Optimal Quality**: Uses codec copying, no quality loss
- **Transparent Operation**: Clear logging of decisions

### For Developers
- **Extensible**: Easy to add new detection criteria
- **Well Tested**: Handles various stream architectures
- **Performance Optimized**: Quick pattern detection for real-time use
- **Comprehensive Logging**: Full visibility into decisions

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Stream Input                                │
│  • Raw M3U8 URL (e.g., Sky News with long tokens)             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                Stream Analyzer                                  │
│  • URL Pattern Detection (length, domains, paths)              │
│  • M3U8 Content Analysis (segments, parameters, redirects)     │
│  • Complexity Scoring (9 different criteria)                   │
│  • Decision Logic (threshold-based recommendation)             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                ┌─────▼─────┐
                │ Score ≥ 4? │
                └─────┬─────┘
                      │
            ┌─────────▼─────────┐
            │ Enable Transcoding │
            │ Set forceTranscode │
            └─────────┬─────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                Stream Serving                                   │
│  • Plex Request Detection                                       │
│  • Auto-Transcoding Application                                │
│  • FFmpeg Processing (codec copy, MPEG-TS output)              │
│  • Clean URL Generation for Plex                               │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                 Plex Output                                     │
│  • Simple MPEG-TS stream URLs                                  │
│  • No complex parameters or redirects                          │
│  • Reliable playback in Plex Media Server                      │
└─────────────────────────────────────────────────────────────────┘
```

## Real-World Examples

### Example 1: Sky News Australia (Complex)
```
Input URL: https://amg00663-skynews-skynewsau-samsungau-r7n40.amagi.tv/ts-eu-w1-n2/playlist/amg00663-skynews-skynewsau-samsungau/cb553e1e786c648f92d43e65d0ef42a4df243dfc087a8d6933fb4b926bc10f41e2e5af97b20cac7822fb0fdf61146d5a4d009247d8780ad7967cac48240d5734c6cdd52e8be24b4daddd0c2d34b07c0e49857671ad594f32d5e0110dc51ab07a0e1ca1494d5e2082b00cb27751cc9e0a957f378bbdbe306f2c180680585ee2be5da5edf50943dc6da3b0494f882744e2865fc8d54abb9ddc539f129b73a415cbc3a28fd24582d4c2011d66884261c8f598f8fa1bbdf31fddf49f7e79a674294a1f5be2d1e1942c13a5378cd8659db1d84afc16cf872c801a58d3a50aaae542e24abf0aaced4faea9f9ab2ae7ab41a529020695cedae2da2030b66afaaced971516fda74429179b2ab0b64849d2605d0104cf3736cf65b6d1aaef80c5b10febadb380e6b68449d304dfc4ff943c4c4a59c963ec528f9577d225d179e79b5d711c0573a49451cb91ca1e1e560fd7d01084485b8ed285d58b557bd2364f13a841c94b0969fb316e57ec39b6cf6f3bc7755cc57d16d36c18ac0ebcb425fea29bc20338bed18e02dc67fdba07d7b953fa3472094ce3bc7c1f764d7bd1fc6f42652a940bb785b8941d6337e5f9c9f1d740785669653522bfa2b620d5deba6a7770e65c296778156de627de7bd00d4c40638929daa20d7b9215634ac2a22c564e6386c2d3d3d136ab822ab176a9d2ee8707f0fba2054f0b64ca23823614/26/1920x1080_7004800/index.m3u8

Analysis Result:
- Complexity Score: 9
- Transcoding: ENABLED
- Reasons: Long URLs, Beacon endpoints, Ad insertion, Complex CDN
```

### Example 2: TVNZ 2 (Simple)
```
Input URL: https://i.mjh.nz/.r/tvnz-2.m3u8

Analysis Result:
- Complexity Score: 0
- Transcoding: DISABLED  
- Reasons: Simple URL structure, direct segments
```

## Troubleshooting

### Common Issues

1. **False Positives**: Streams marked complex unnecessarily
   - **Solution**: Adjust detection thresholds
   - **Debug**: Use `/api/streams/analyze` to see scoring details

2. **False Negatives**: Complex streams not detected
   - **Solution**: Add new detection patterns
   - **Debug**: Check logs for analysis results

3. **Performance Impact**: Analysis taking too long
   - **Solution**: Reduce analysis timeout
   - **Optimization**: Use pattern detection before full analysis

### Debugging Commands

```bash
# Test stream analysis
curl -X POST http://localhost:3000/api/streams/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"https://problematic-stream.com/playlist.m3u8"}'

# Check stream protocol options
SELECT name, protocol_options FROM streams WHERE type = 'hls';

# Monitor auto-transcoding logs
docker logs container-name | grep "Auto-transcoding"
```

## Future Enhancements

### Planned Features
- **Machine Learning**: Train on user feedback to improve detection
- **Performance Metrics**: Track transcoding success rates
- **Custom Rules**: User-defined complexity patterns
- **Batch Analysis**: Analyze multiple streams simultaneously

### Advanced Detection Criteria
- **Geographic Restrictions**: Detect geo-blocked content
- **DRM Protection**: Identify protected streams
- **Bandwidth Requirements**: Analyze bitrate complexity
- **Protocol Variations**: Support for DASH, RTSP complexity

## API Reference

### POST /api/streams/analyze
Analyzes a stream URL for complexity.

**Request:**
```json
{
  "url": "https://stream-url.com/playlist.m3u8"
}
```

**Response:**
```json
{
  "needsTranscoding": true,
  "reasons": ["Extremely long URLs", "Beacon endpoints"],
  "complexityScore": 6,
  "details": {
    "avgUrlLength": 800,
    "maxUrlLength": 1200,
    "hasBeacon": true,
    "hasRedirect": false,
    "avgQueryParams": 7
  }
}
```

### POST /api/streams (Enhanced)
Creates a stream with automatic complexity analysis.

**Response includes:**
```json
{
  "autoAnalysis": {
    "transcodeRecommended": true,
    "analysis": { /* analysis results */ },
    "appliedOptions": {
      "forceTranscode": true
    }
  }
}
```

---

*This documentation reflects the Stream Analyzer implementation as of PlexBridge v1.0. For the latest updates and technical details, see the source code in `/server/utils/streamAnalyzer.js`.*