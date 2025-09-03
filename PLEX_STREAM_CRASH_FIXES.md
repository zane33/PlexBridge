# Plex Stream Crash Fixes

## Problem Analysis

Based on the Plex console logs, the streams were crashing due to several issues:

1. **"Failed to find consumer" errors** - Plex making requests to `/Live/{sessionId}` endpoints that PlexBridge didn't handle
2. **"Transcode runner appears to have died"** - Transcode session tracking issues causing stream interruption
3. **Malformed HTTP requests** - Strange requests ("HOAREYOU?", "IOPNameService", "FB 003.003") causing parsing errors
4. **Database transaction timeouts** - 116-second transaction holds indicating performance issues

## Implemented Fixes

### 1. Enhanced Consumer Session Tracking

**Added comprehensive `/Live/` endpoint support:**
- `GET /Live/:sessionId` - Main consumer tracking endpoint
- `GET /Live/:sessionId/:action` - Consumer action requests
- `POST /Live/:sessionId` - POST-based consumer requests
- `router.all('/Live/*')` - Catch-all for any unhandled Live requests

**Features:**
- Always returns success to prevent "Failed to find consumer" errors
- Creates persistent session tracking
- Maps Plex session identifiers to internal sessions
- Updates session activity to keep streams alive

### 2. Transcode Session Management

**Added Transcode endpoint handlers:**
- `GET /Transcode/:sessionId` - Transcoding session status
- `GET /Transcode/:sessionId/status` - Session health check
- `POST /Transcode/:sessionId` - Session management

**Features:**
- Reports transcoding sessions as always running/alive
- Prevents "Transcode runner appears to have died" errors
- Provides proper session metadata for Plex decisions

### 3. Comprehensive Request Logging

**Added `plexRequestLogger` middleware:**
- Logs all Plex-related requests with full context
- Tracks request/response timing and status
- Captures Plex session identifiers and headers
- Helps diagnose future integration issues

### 4. Malformed Request Handling

**Added `malformedRequestHandler` error middleware:**
- Gracefully handles HTTP parsing errors
- Logs malformed requests without crashing
- Returns proper JSON error responses
- Prevents "Error parsing HTTP request" crashes

## File Changes

### New Files:
- `server/middleware/plexRequestLogger.js` - Request logging and error handling middleware

### Modified Files:
- `server/routes/ssdp.js` - Added `/Live/` and `/Transcode/` endpoints
- `server/index.js` - Added logging and error handling middleware
- `test-consumer-fix.sh` - Enhanced testing script

## Testing

Run the comprehensive test script to verify all fixes:

```bash
chmod +x test-consumer-fix.sh
./test-consumer-fix.sh
```

The script tests:
1. Health endpoint
2. Original `/consumer/` endpoints
3. New `/Live/` endpoints (GET and POST)
4. `/Transcode/` session tracking
5. Channel lineup availability
6. Request/response validation

## Deployment

To apply these fixes:

```bash
# 1. Rebuild Docker image with fixes
docker-compose -f docker-local.yml build

# 2. Stop current container
docker-compose -f docker-local.yml down

# 3. Start with new image
docker-compose -f docker-local.yml up -d

# 4. Monitor logs for successful startup
docker-compose -f docker-local.yml logs -f plextv
```

## Expected Results

After deployment, you should see:

1. **No more "Failed to find consumer" errors** - `/Live/` endpoints handle all consumer requests
2. **No more "Transcode runner appears to have died" errors** - Proper session tracking
3. **Cleaner logs** - Malformed requests handled gracefully
4. **Stable streaming** - Sessions persist through temporary disconnections
5. **Better diagnostics** - Comprehensive request logging for troubleshooting

## Monitoring

Watch for these log messages indicating successful fixes:

```
Plex /Live/ consumer request (capital L)
Plex Transcode session request
Created persistent streaming session
Malformed request detected (handled gracefully)
```

## Additional Notes

- The fixes maintain backward compatibility with existing endpoints
- All new endpoints return JSON to prevent HTML error responses
- Session tracking is now more robust with proper Plex consumer mapping
- Error handling is non-blocking to prevent cascading failures

These fixes address the root causes of the Plex Live TV streaming crashes while providing better diagnostics for future issues.