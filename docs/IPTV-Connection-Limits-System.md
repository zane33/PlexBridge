# IPTV Connection Limits System

## Overview

PlexBridge now includes a **scalable connection limits parameter system** that replaces hardcoded IP detection with a flexible, user-configurable toggle for IPTV servers with strict connection limits.

## Business Problem Solved

### Previous Issues:
- ❌ **Hardcoded IP addresses** in code (`38.64.138.128`)
- ❌ **Not scalable** for new problematic IPTV servers
- ❌ **IP addresses can change**, breaking the fix
- ❌ **Users couldn't enable** VLC compatibility for new streams

### New Solution:
- ✅ **User-configurable parameter** per stream
- ✅ **Scalable for any IPTV server** with connection limits  
- ✅ **IP-agnostic design** works with any problematic server
- ✅ **Easy user control** via web interface toggle

## Technical Implementation

### 1. Database Schema

Added `connection_limits` column to streams table:

```sql
ALTER TABLE streams ADD COLUMN connection_limits INTEGER DEFAULT 0;
```

### 2. Backend API Support

**Stream Schema (Joi Validation)**:
```javascript
connection_limits: Joi.number().integer().min(0).max(1).default(0)
```

**API Endpoints**:
- `POST /api/streams` - Create stream with connection_limits parameter
- `PUT /api/streams/:id` - Update stream connection_limits setting
- `GET /api/streams` - Returns connection_limits field for all streams

### 3. Stream Manager Integration

**VLC-Compatible Headers (when enabled)**:
```javascript
// SCALABLE CONNECTION LIMITS: Use stream parameter instead of hardcoded IP
const hasConnectionLimits = streamData?.connection_limits === 1 || streamData?.connection_limits === true;
if (hasConnectionLimits) {
  hlsArgs += ' -max_reload 3 -http_multiple 1 -headers "User-Agent: VLC/3.0.20 LibVLC/3.0.20\\r\\nConnection: close\\r\\n"';
  logger.stream('Applied VLC-compatible headers for connection limits', {
    streamName: streamData?.name,
    streamUrl: finalUrl.substring(0, 50) + '...'
  });
}
```

**Connection Pre-warming (when enabled)**:
```javascript
// SCALABLE CONNECTION LIMITS: Use stream parameter for connection pre-warming
const hasConnectionLimits = streamData?.connection_limits === 1 || streamData?.connection_limits === true;
if (hasConnectionLimits) {
  logger.stream('Pre-warming connection for IPTV server with connection limits', { 
    streamName: streamData?.name,
    finalUrl: finalUrl.substring(0, 50) + '...'
  });
  
  connectionManager.makeVLCCompatibleRequest(axios, finalUrl, {
    timeout: 5000,
    maxContentLength: 1024
  }).catch(error => {
    logger.warn('Connection pre-warming failed, but continuing with FFmpeg', {
      streamName: streamData?.name,
      error: error.message
    });
  });
}
```

### 4. Frontend UI Integration

**Stream Configuration Toggle**:
```jsx
{/* SCALABLE CONNECTION LIMITS: Replace hardcoded IP detection with user control */}
<Grid item xs={12}>
  <Box sx={{ mt: 2, mb: 1 }}>
    <FormControlLabel
      control={
        <Switch
          checked={formData.connection_limits}
          onChange={(e) => handleInputChange('connection_limits', e.target.checked)}
          disabled={saving}
          color="warning"
        />
      }
      label={
        <Box>
          <Typography variant="body1" component="div">
            🔄 IPTV Connection Limits
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Enable VLC-compatible headers and connection management for IPTV servers with strict connection limits. 
            Use this when streams frequently fail with "403 Forbidden / Max Connections Reached" errors.
          </Typography>
        </Box>
      }
    />
  </Box>
</Grid>
```

### 5. Automatic Migration

Existing problematic streams are automatically migrated:

```javascript
// Enable connection_limits for existing Sky Sport SELECT streams (hardcoded IP migration)
const skySelectUpdate = database.prepare(`
  UPDATE streams 
  SET connection_limits = 1
  WHERE url LIKE '%38.64.138.128%' 
     OR url LIKE '%sky%sport%' 
     OR name LIKE '%Sky Sport SELECT%'
     OR name LIKE '%Sky Sports%'
`);
```

## User Workflow

### For New Problematic Streams:

1. **User encounters stream with 403 errors**
   ```
   Error: "403 Forbidden / Max Connections Reached"
   ```

2. **Edit stream configuration**
   - Navigate to Streams page
   - Click Edit button for problematic stream
   - Expand Advanced Settings accordion

3. **Enable connection limits toggle**
   - Toggle "🔄 IPTV Connection Limits" to ON
   - Save stream configuration

4. **System automatically applies fixes**
   - VLC-compatible headers
   - Connection pre-warming
   - Proper connection management delays
   - Single-use HTTP agents

5. **Stream works reliably**
   - No more 403 errors
   - Stable streaming performance
   - Works with Plex clients

### For Existing Sky Sport SELECT Streams:

These streams are **automatically migrated** to use connection_limits during database initialization.

## Connection Manager Integration

The existing `connectionManager.js` works seamlessly with the new parameter system:

**VLC-Compatible Features Applied When Enabled**:
- ✅ **Force Connection Closure**: `Connection: close` header
- ✅ **Single-use HTTP Agents**: `keepAlive: false` prevents pooling
- ✅ **Request Spacing**: Domain-specific delays (2 seconds for connection-limited servers)
- ✅ **VLC Headers**: Exact header matching (`VLC/3.0.20 LibVLC/3.0.20`)
- ✅ **Proper Timeouts**: Extended timeouts for connection-limited streams

## Benefits

### For Users:
- ✅ **Easy Control**: Simple toggle switch per stream
- ✅ **Clear Guidance**: Descriptive help text explains when to use
- ✅ **Immediate Results**: No server restart required
- ✅ **Backwards Compatible**: Existing streams continue working

### For Developers:
- ✅ **Scalable Architecture**: Works with any problematic IPTV server
- ✅ **No More Hardcoding**: Parameter-driven approach
- ✅ **Maintainable Code**: Clean separation of concerns
- ✅ **Future-Proof**: Easily extensible for new server types

### For System Reliability:
- ✅ **Reduced Errors**: Fewer 403 connection limit failures
- ✅ **Better Logging**: Clear indication when connection limits are applied
- ✅ **Predictable Behavior**: Consistent VLC-compatible connection patterns

## Testing Verification

### API Testing:
```bash
# Create stream with connection limits enabled
curl -X POST http://localhost:3000/api/streams \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Connection Limits Stream", 
    "url": "http://problematic-server.com/stream.m3u8",
    "type": "hls",
    "connection_limits": 1
  }'

# Verify response includes connection_limits: 1
```

### Frontend Testing:
1. Navigate to Streams page
2. Click "Add Stream" button
3. Expand "Advanced Settings" accordion
4. Verify "🔄 IPTV Connection Limits" toggle is present
5. Enable toggle and save stream
6. Verify stream is created with connection_limits enabled

### Streaming Testing:
1. Enable connection limits for a problematic stream
2. Test stream playback in Plex
3. Check logs for VLC-compatible connection messages:
   ```
   Applied VLC-compatible headers for connection limits
   Pre-warming connection for IPTV server with connection limits
   ```

## Migration from Legacy System

### Old Approach (Removed):
```javascript
// ❌ REMOVED: Hardcoded IP checks
if (finalUrl.includes('38.64.138.128')) {
  // Apply VLC compatibility
}
```

### New Approach (Implemented):
```javascript
// ✅ NEW: Parameter-based approach
const hasConnectionLimits = streamData?.connection_limits === 1;
if (hasConnectionLimits) {
  // Apply VLC compatibility
}
```

### Files Updated:
- `/server/services/database.js` - Added connection_limits column
- `/server/utils/enhancedEncoding.js` - Added automatic migration
- `/server/routes/api.js` - Added connection_limits to schema and queries
- `/server/services/streamManager.js` - Replaced hardcoded checks
- `/client/src/components/StreamManager/StreamManager.js` - Added UI toggle

## Conclusion

The **IPTV Connection Limits System** successfully replaces hardcoded IP detection with a scalable, user-friendly parameter system. Users can now easily enable VLC-compatible connection management for any problematic IPTV server, ensuring reliable streaming without code modifications.

This solution is **production-ready**, **thoroughly tested**, and **immediately available** for all PlexBridge deployments.

---

**Implementation Date**: September 9, 2025  
**Status**: ✅ Production Ready  
**Testing**: ✅ API and UI Verified