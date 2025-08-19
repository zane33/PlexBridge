# 🐳 PlexBridge Docker Testing Guide

## ✅ Container Successfully Built & Running

Your PlexBridge container has been built with **all critical fixes applied** and is now running with the latest improvements.

### 🚀 Quick Access

- **Web Interface**: http://localhost:8081
- **Health Check**: http://localhost:8081/health
- **Container Name**: `plexbridge-test`
- **Status**: ✅ Healthy & Running

---

## 🧪 Testing the Race Condition Fix

### **Critical Issue Fixed**: Stream Preview Black Screen

**Before the fix:**
- ❌ Video preview showed black screen
- ❌ Infinite loop with 100+ console log entries  
- ❌ "Stream Playback Error" with timeout failures
- ❌ Race condition prevented proper initialization

**After the fix:**
- ✅ Video preview dialog opens successfully
- ✅ No infinite loops or repeated log entries
- ✅ Proper cleanup sequence with wait mechanism
- ✅ Graceful fallback when FFmpeg unavailable

### 🔍 **How to Test:**

1. **Navigate to Streams Section**
   ```
   http://localhost:8081 → Click "Streams" in sidebar
   ```

2. **Test Stream Preview**
   - Find any stream in the table
   - Click the "Preview" button (👁️ icon)
   - **Expected Result**: Dialog opens within 2-3 seconds without errors

3. **Verify No Infinite Loops**
   - Open browser Developer Tools (F12)
   - Go to Console tab
   - Click stream preview
   - **Expected Result**: Clean console output, no repeated messages

4. **Test Multiple Opens/Closes**
   - Open stream preview → Close dialog
   - Repeat 3-4 times quickly
   - **Expected Result**: Consistent behavior, no race conditions

---

## 🔧 Technical Fixes Applied

### **1. Race Condition Resolution**
```javascript
// Enhanced cleanup sequence
✅ Added isCleaningUp flag
✅ Cleanup wait mechanism with retry logic  
✅ Proper component lifecycle management
✅ Zero "early return" messages in console
```

### **2. Stream Service Improvements**
```javascript
// FFmpeg fallback system
✅ Automatic FFmpeg availability detection
✅ Graceful fallback to direct streaming
✅ 302 redirect instead of 500 errors
✅ Enhanced error handling and logging
```

### **3. Video Player Enhancements**
```javascript
// Robust player initialization
✅ Fixed infinite rendering loops
✅ Proper useEffect dependency management
✅ Enhanced error boundaries
✅ Improved player cleanup on unmount
```

---

## 🐳 Container Management Commands

### **Using Docker Commands:**
```bash
# View container status
docker ps | grep plexbridge-test

# View real-time logs
docker logs -f plexbridge-test

# Stop container
docker stop plexbridge-test

# Restart container
docker restart plexbridge-test

# Remove container (keeps image)
docker rm plexbridge-test

# Rebuild image with latest changes
docker build -t plexbridge:latest .
```

### **Using Docker Compose:**
```bash
# Start with compose (includes Redis)
docker-compose -f docker-compose.test.yml up -d

# Start with Redis caching
docker-compose -f docker-compose.test.yml --profile with-redis up -d

# View logs
docker-compose -f docker-compose.test.yml logs -f

# Stop all services
docker-compose -f docker-compose.test.yml down
```

---

## 📊 Validation Checklist

### ✅ **Race Condition Fix Verification**
- [ ] Stream preview dialog opens without timeout
- [ ] Console shows clean output (no infinite loops)  
- [ ] Multiple open/close cycles work smoothly
- [ ] No "early return - missing requirements" messages

### ✅ **Stream Service Verification**
- [ ] Preview endpoints return 200/302 (not 500)
- [ ] FFmpeg fallback works when transcoding unavailable
- [ ] Direct streaming fallback functions properly
- [ ] Error messages are user-friendly

### ✅ **UI/UX Verification**
- [ ] All navigation links work correctly
- [ ] Stream management interface loads
- [ ] Channel management functions properly
- [ ] Settings page accessible and functional

---

## 🔍 Troubleshooting

### **If Container Won't Start:**
```bash
# Check for port conflicts
netstat -tulpn | grep :8081

# View container logs
docker logs plexbridge-test

# Try different ports
docker run -p 8082:8080 -p 1902:1900/udp ...
```

### **If Stream Preview Still Fails:**
```bash
# Check FFmpeg availability in container
docker exec -it plexbridge-test which ffmpeg

# Test stream endpoint directly
curl -I http://localhost:8081/streams/preview/test-stream-123?transcode=true

# View detailed logs
docker logs -f plexbridge-test | grep -E "(stream|preview|transcode)"
```

### **Browser Console Debugging:**
1. Open Developer Tools (F12)
2. Go to Console tab
3. Clear console before testing
4. Watch for error patterns during stream preview

---

## 🎯 **Success Indicators**

### **✅ Healthy System:**
- Health endpoint returns 200 OK
- Web interface loads without errors
- Stream preview opens in under 3 seconds
- Console output is clean and minimal
- No JavaScript errors in browser console

### **✅ Fixed Race Condition:**
- No infinite "Using ALWAYS-TRANSCODED proxy URL" messages
- Cleanup sequence completes properly
- Video dialog opens consistently
- Multiple preview attempts work reliably

---

## 📝 **Quick Test Script**

Save this as `test-fixes.sh` for automated testing:

```bash
#!/bin/bash
echo "🧪 Testing PlexBridge Fixes..."

# Test health endpoint
echo "1. Health Check:"
curl -s http://localhost:8081/health | jq .status

# Test stream preview endpoint  
echo "2. Stream Preview:"
curl -s -I http://localhost:8081/streams/preview/test-stream-123?transcode=true | head -1

# Test main interface
echo "3. Main Interface:"
curl -s -I http://localhost:8081/ | head -1

echo "✅ Basic tests complete"
```

---

## 🚀 **Next Steps**

1. **Test the web interface** at http://localhost:8081
2. **Verify stream preview functionality** with the race condition fix
3. **Check console output** for clean operation
4. **Test with real IPTV streams** if available
5. **Verify Plex integration** using the container's endpoints

The container is ready for comprehensive testing with all critical fixes applied!