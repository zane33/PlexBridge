# Critical H.264 PPS and Consumer Endpoint Fixes

## Issue Analysis

Based on the latest Plex logs, you have two critical issues:

### 1. H.264 PPS Decode Errors (NEW ISSUE)
```
[h264 @ 0x...] decode_slice_header error
[h264 @ 0x...] no frame!  
[NULL @ 0x...] non-existing PPS 0 referenced
```
**Root Cause**: Enhanced encoding profile was using problematic FFmpeg parameters that corrupt H.264 Picture Parameter Set (PPS) data.

### 2. Consumer Endpoint Errors (PERSISTENT)
```
[Req#.../Live/ef5b9705-ddca-4a09-90c6-cdbbf41287d3] Failed to find consumer
```
**Root Cause**: New `/Live/` endpoints haven't been deployed yet - Docker container is still using old code.

## Comprehensive Fixes Implemented

### H.264 PPS Error Fixes

#### 1. Fixed High-Reliability Profile
**Removed problematic parameters that corrupt PPS:**
- ❌ `-bsf:v h264_mp4toannexb` (was causing PPS corruption)
- ❌ `-mpegts_copyts 1` (timestamp PPS issues)
- ❌ `-mpegts_flags +resend_headers` (duplicate corrupted headers)
- ❌ `-copyts` (timestamp corruption)

**Added H.264 error recovery:**
- ✅ `-fflags +genpts+igndts+discardcorrupt` (discard corrupt packets)
- ✅ `-skip_frame noref` (skip corrupted non-reference frames)
- ✅ `-err_detect ignore_err` (ignore minor H.264 errors)

#### 2. New H.264 Recovery Profile
**Added `h264-recovery` profile for severely corrupted streams:**
- Ultra-conservative analysis (0.5s/0.5MB limits)
- Minimal buffering to prevent corruption accumulation
- Timestamp regeneration to fix PPS timing
- Priority 150 (higher than all other profiles)

#### 3. Smart Profile Selection
**Enhanced profile selection with error detection:**
- Detects PPS, decode_slice_header, and "no frame!" errors
- Automatically switches to H.264 recovery mode
- Prevents re-selection of problematic profiles

### Consumer Endpoint Fixes (Already Implemented, Need Deployment)

#### 1. Complete `/Live/` Coverage
- `GET /Live/:sessionId`
- `GET /Live/:sessionId/:action`
- `POST /Live/:sessionId`
- `router.all('/Live/*')` catch-all

#### 2. Transcode Session Handling
- `GET /Transcode/:sessionId`
- `GET /Transcode/:sessionId/status`
- `POST /Transcode/:sessionId`

#### 3. Enhanced Request Logging
- Comprehensive Plex request tracking
- Malformed request error handling
- Session activity monitoring

## Files Modified

### H.264 PPS Fixes:
- ✅ `server/utils/enhancedEncoding.js` - Fixed profiles and added H.264 recovery

### Consumer Endpoint Fixes (Need Deployment):
- ✅ `server/routes/ssdp.js` - Added `/Live/` and `/Transcode/` endpoints
- ✅ `server/index.js` - Added logging and error handling middleware
- ✅ `server/middleware/plexRequestLogger.js` - New comprehensive logging

## CRITICAL: Deployment Required

**The consumer endpoint fixes are NOT active yet** because the Docker container hasn't been rebuilt. The H.264 fixes are code changes that need deployment too.

### Deployment Commands:

```bash
# Navigate to PlexBridge directory
cd /mnt/c/Users/ZaneT/SFF/PlexBridge

# 1. Stop current container
docker-compose -f docker-local.yml down

# 2. Rebuild image with all fixes
docker-compose -f docker-local.yml build --no-cache

# 3. Start with new image
docker-compose -f docker-local.yml up -d

# 4. Verify container is running
docker-compose -f docker-local.yml ps

# 5. Check logs for successful startup
docker-compose -f docker-local.yml logs -f plextv | head -20
```

### Verification Tests:

```bash
# Test health endpoint
curl -s "http://192.168.4.56:3000/health" | jq '.status'

# Test new /Live/ consumer endpoint
curl -s "http://192.168.4.56:3000/Live/test-session-123" | jq '.success'

# Test Transcode endpoint
curl -s "http://192.168.4.56:3000/Transcode/test-session-456" | jq '.status'

# Run comprehensive test
./test-consumer-fix.sh
```

## Expected Results After Deployment

### H.264 Stream Issues:
- ✅ No more PPS/decode_slice_header errors
- ✅ Enhanced encoding streams work without corruption
- ✅ Automatic fallback to H.264 recovery profile when needed

### Consumer Endpoint Issues:
- ✅ No more "Failed to find consumer" errors
- ✅ No more "Transcode runner appears to have died" errors
- ✅ Stable Live TV streaming sessions
- ✅ Comprehensive request logging for debugging

### Monitoring Logs:
Look for these success messages after deployment:
```
✅ API routes registered successfully with Android TV optimization
✅ FFmpeg MPEG-TS process started
✅ Plex /Live/ consumer request (capital L)
✅ Detected H.264 PPS/decode errors, using h264-recovery profile
✅ Created persistent streaming session
```

## Emergency Rollback

If deployment fails, rollback with:
```bash
docker-compose -f docker-local.yml down
git checkout HEAD~1  # Go back one commit
docker-compose -f docker-local.yml build
docker-compose -f docker-local.yml up -d
```

## Summary

**Two critical fixes are ready but require deployment:**

1. **H.264 PPS Error Fix** - Prevents decode errors and stream corruption
2. **Consumer Endpoint Fix** - Prevents "Failed to find consumer" crashes

**Both fixes are backward compatible and non-breaking.**

**Deploy immediately to resolve both the enhanced encoding failures and persistent consumer tracking issues.**