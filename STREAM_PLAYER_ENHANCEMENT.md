# PlexBridge Stream Player Enhancement

## Overview

This enhancement completely overhauls the stream preview functionality in PlexBridge with a robust, multi-format media player that provides reliable in-browser streaming capabilities while maintaining external player fallbacks.

## Key Improvements

### 1. **Enhanced Video Player Component** (`EnhancedVideoPlayer.js`)
- **Dual Player Architecture**: Automatically switches between Video.js and native HTML5 video based on stream format
- **Multi-Format Support**: 
  - HLS (.m3u8) streams with advanced configuration
  - DASH (.mpd) streams using Video.js
  - Direct video files (MP4, WebM)
  - RTSP/RTMP streams via backend proxy
- **Advanced Error Recovery**: Automatic retry mechanisms and detailed error reporting
- **CORS Solution**: Built-in proxy mode to bypass CORS restrictions
- **User Controls**: Manual player type and proxy mode toggles

### 2. **Simple Video Player Component** (`SimpleVideoPlayer.js`)
- **Fallback Option**: Lightweight HLS.js implementation for compatibility
- **Basic Functionality**: Essential streaming with minimal dependencies
- **Error Handling**: Clear error messages and external player alternatives

### 3. **Backend Integration**
- **Stream Proxy**: Utilizes existing `/preview/:streamId` endpoint to bypass CORS
- **Format Detection**: Leverages backend stream validation and format detection
- **Multiple Protocols**: Full support for all backend-supported stream types

## Features

### Core Functionality
- ✅ **HLS Live Streams**: Full HLS.js integration with advanced configuration
- ✅ **DASH Streams**: Video.js with DASH support
- ✅ **Direct Video**: Native HTML5 playback for MP4/WebM
- ✅ **Proxy Mode**: Backend streaming proxy to avoid CORS issues
- ✅ **Auto-Detection**: Intelligent format detection and player selection
- ✅ **Error Recovery**: Automatic retry with detailed error reporting

### User Experience
- ✅ **Responsive Design**: Mobile-optimized with fullscreen support
- ✅ **Loading States**: Professional loading indicators and status messages
- ✅ **Player Controls**: Play/pause, mute/unmute, fullscreen toggles
- ✅ **Stream Information**: Real-time stream URL and format display
- ✅ **External Players**: One-click VLC/MPC-HC integration
- ✅ **Copy Functions**: Easy URL copying for external players

### Technical Features
- ✅ **Video.js Integration**: Professional media player with extensive format support
- ✅ **HLS.js Advanced Config**: Optimized for live streaming with low latency
- ✅ **Adaptive Streaming**: Quality selection and bandwidth optimization
- ✅ **Memory Management**: Proper cleanup and resource management
- ✅ **Cross-Browser**: Safari native HLS support + Video.js for others

## Installation & Dependencies

### New Dependencies Added
```json
{
  "video.js": "^8.23.4",
  "@videojs/http-streaming": "^3.17.2", 
  "dash.js": "^4.0.0"
}
```

### Existing Dependencies Utilized
- `hls.js`: Already present for HLS streaming
- `@mui/material`: UI components
- `notistack`: Notifications

## Usage

### In StreamManager Component
```javascript
import EnhancedVideoPlayer from '../VideoPlayer/EnhancedVideoPlayer';

// Usage
<EnhancedVideoPlayer
  open={enhancedPlayerOpen}
  onClose={handleCloseEnhancedPlayer}
  streamUrl={currentStream?.url}
  streamName={currentStream?.name}
  streamType={currentStream?.type}
  channelId={currentStream?.channelId}
  useProxy={true}
  onError={handlePlayerError}
/>
```

### Props Configuration
- `open`: Boolean to control dialog visibility
- `onClose`: Callback for dialog close
- `streamUrl`: Direct stream URL
- `streamName`: Display name for the stream
- `streamType`: Stream type hint (hls, dash, mp4, etc.)
- `channelId`: Channel ID for proxy mode
- `useProxy`: Enable PlexBridge proxy (recommended)
- `onError`: Error callback for parent component

## Stream Format Support

### Fully Supported
- **HLS (.m3u8)**: Live streams, VOD, adaptive bitrate
- **MP4**: Direct video files with native playback
- **WebM**: Web-optimized video format

### Video.js Enhanced
- **DASH (.mpd)**: MPEG-DASH adaptive streaming
- **RTSP/RTMP**: Via backend proxy transcoding
- **Unknown Formats**: Automatic Video.js fallback

### External Player Integration
- **VLC Media Player**: Direct protocol handler
- **MPC-HC**: Media Player Classic integration
- **Manual Copy**: URL copying for any external player

## Error Handling & Recovery

### CORS Issues
- **Detection**: Automatic CORS error detection
- **Solution**: One-click proxy mode activation
- **Fallback**: External player recommendations

### Network Errors
- **Retry Logic**: Automatic reconnection attempts
- **User Control**: Manual retry buttons
- **Detailed Messages**: Specific error descriptions with solutions

### Format Incompatibility
- **Player Switching**: Automatic fallback between Video.js and native
- **User Override**: Manual player type selection
- **External Options**: Direct external player integration

## Performance Optimizations

### Video.js Configuration
```javascript
{
  html5: {
    vhs: {
      enableLowInitialPlaylist: true,
      smoothQualityChange: true,
      overrideNative: true
    }
  },
  liveui: true, // For live streams
  playbackRates: [0.5, 1, 1.25, 1.5, 2]
}
```

### HLS.js Configuration
```javascript
{
  enableWorker: true,
  lowLatencyMode: true,
  backBufferLength: 90,
  maxBufferLength: 30,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 10
}
```

### Memory Management
- Proper player disposal on component unmount
- HLS instance cleanup
- Event listener management
- Automatic garbage collection

## Troubleshooting

### Common Issues

1. **"Stream not loading"**
   - Enable proxy mode
   - Check stream URL validity
   - Try external player

2. **"CORS Error"**
   - Toggle proxy mode ON
   - Verify backend is running
   - Use external player as fallback

3. **"Format not supported"**
   - Switch to Video.js player
   - Enable proxy mode for transcoding
   - Use external player (VLC recommended)

4. **"Video.js not working"**
   - Switch to simple player mode
   - Check browser compatibility
   - Clear browser cache

### Debug Information
- Console logging for all player events
- Stream format detection details
- Error codes and descriptions
- Performance metrics

## Backend Integration Points

### Stream Proxy Endpoint
```
GET /preview/:streamId
```
- Provides CORS-free stream access
- Transcodes incompatible formats
- Handles authentication

### Stream Validation
```
POST /streams/validate
```
- Format detection
- Connectivity testing
- Error diagnosis

## Browser Compatibility

### Full Support
- **Chrome/Chromium**: Video.js + HLS.js + native
- **Firefox**: Video.js + HLS.js
- **Safari**: Native HLS + Video.js fallback
- **Edge**: Video.js + HLS.js

### Limited Support
- **Older browsers**: External player fallback only
- **Mobile browsers**: Responsive design with touch controls

## Future Enhancements

### Planned Features
- [ ] Picture-in-Picture support
- [ ] Audio track selection
- [ ] Subtitle support
- [ ] Quality selection UI
- [ ] Chromecast integration
- [ ] Recording functionality

### Potential Improvements
- [ ] WebRTC streaming support
- [ ] Advanced analytics
- [ ] Custom player themes
- [ ] Keyboard shortcuts
- [ ] Stream health monitoring

## Conclusion

This enhancement transforms PlexBridge's stream preview from a basic functionality into a professional-grade media player solution. The dual-player architecture ensures maximum compatibility while the proxy integration solves common CORS and format issues. Users can now reliably preview streams in-browser while maintaining access to external players as needed.

The implementation is production-ready with comprehensive error handling, performance optimizations, and responsive design that works across all devices and browsers.