# Session Cleanup Fix - Testing Guide

## Issue Summary
Streaming sessions were remaining active in the GUI after clients (like VLC) disconnected, caused by overly aggressive session persistence settings that prevented proper cleanup of intentional disconnects.

## Fix Applied
Modified `server/services/streamManager.js` to:
1. **Distinguish between intentional disconnects and errors** - Intentional disconnects (`disconnect`, `client_disconnect`, `manual`, etc.) now ALWAYS terminate sessions regardless of `SESSION_KEEP_ALIVE` environment variable
2. **Added enhanced orphan detection** - Sessions without activity for 1 minute are automatically cleaned up
3. **Improved periodic cleanup** - Runs every 30 seconds instead of 5 minutes
4. **Activity tracking** - Tracks last data transfer to detect orphaned sessions

## Testing Instructions

### Local Testing with VLC

1. **Start the application locally**:
   ```bash
   # Using Docker Desktop with docker-local.yml
   docker-compose -f docker-local.yml up --build
   ```

2. **Open the GUI**:
   - Navigate to `http://192.168.4.56:3000` (or your local IP)
   - Go to Dashboard to monitor active streams

3. **Test VLC streaming**:
   - Go to Streams page, find a stream and copy its preview URL
   - Open VLC: Media > Open Network Stream
   - Enter: `http://192.168.4.56:3000/streams/preview/{id}?transcode=true`
   - Start playing the stream
   - Verify stream appears in Dashboard as active

4. **Test disconnect cleanup**:
   - Stop playback in VLC (press Stop button or close VLC)
   - **Expected**: Within 5 seconds, the stream should disappear from Dashboard
   - Check logs for: `"Session cleanup decision"` with `isIntentionalDisconnect: true`

5. **Test orphan cleanup**:
   - Start a stream in VLC
   - Force-kill VLC process (Task Manager/Activity Monitor)
   - **Expected**: Within 60 seconds, orphan cleanup should remove the session
   - Check logs for: `"Cleaning up orphaned session with no activity"`

### Production Deployment & Testing

1. **Build and deploy to Portainer**:
   ```bash
   # Commit changes
   git add -A
   git commit -m "Fix: Session cleanup for client disconnects"
   git push

   # In Portainer at 192.168.3.148:9000
   # Redeploy stack with docker-compose.portainer.yml
   ```

2. **Production testing**:
   - Access production GUI at `http://192.168.3.148:3000`
   - Repeat VLC tests above using production URL
   - Monitor logs via Portainer for cleanup messages

### Verification Checklist

- [ ] VLC disconnect cleans up session within 5 seconds
- [ ] Force-killed clients cleaned up within 60 seconds
- [ ] Dashboard updates immediately when sessions end
- [ ] No sessions persist beyond 1 minute after disconnect
- [ ] Logs show `isIntentionalDisconnect: true` for client disconnects
- [ ] WebSocket events properly notify GUI (`stream:stopped` event)
- [ ] Multiple concurrent streams cleanup independently
- [ ] Error recovery still works (network errors maintain session briefly)

### Log Messages to Monitor

**Successful cleanup on disconnect**:
```
Session cleanup decision {
  sessionId: "xxx",
  reason: "disconnect" or "client_disconnect",
  isIntentionalDisconnect: true,
  shouldMaintainSession: false
}
```

**Orphan detection**:
```
Cleaning up orphaned session with no activity {
  sessionId: "xxx",
  inactiveTime: 60000+,
  channelName: "xxx"
}
```

**Force cleanup of old sessions**:
```
Force cleaning very old session {
  sessionId: "xxx",
  age: 3600000+,
  channelName: "xxx"
}
```

### Rollback Instructions

If issues occur, revert the changes:
```bash
git revert HEAD
git push
# Redeploy in Portainer
```

### Known Limitations

1. **Resilient streams** may take slightly longer to cleanup (up to 60 seconds)
2. **Active data transfer** resets the orphan timer, so actively streaming sessions won't be cleaned
3. **Browser-based streaming** uses different disconnect detection (handled separately)

## Environment Variables to Review

In production (`docker-compose.portainer.yml`), consider changing:
- `SESSION_KEEP_ALIVE=true` → `SESSION_KEEP_ALIVE=false` (optional, fix handles both)
- `AUTO_UPGRADE_TO_RESILIENT=true` → Keep as-is (still useful for error recovery)

## Success Metrics

- **Session cleanup time**: < 5 seconds for normal disconnects
- **Orphan cleanup time**: < 60 seconds for abnormal disconnects
- **False positive cleanup**: 0 (active streams should never be terminated)
- **GUI accuracy**: 100% (dashboard should always reflect actual state)