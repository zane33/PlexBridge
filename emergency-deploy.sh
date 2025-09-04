#!/bin/bash

echo "================================"
echo "H.264 PPS CORRUPTION FIX - Emergency Deployment v2"
echo "================================"
echo ""

echo "🚨 STOPPING container..."
docker-compose -f docker-local.yml down

echo ""
echo "🔧 REBUILDING with emergency fixes..."
docker-compose -f docker-local.yml build --no-cache

echo ""
echo "🚀 STARTING container..."
docker-compose -f docker-local.yml up -d

echo ""
echo "⏳ Waiting for startup..."
sleep 15

echo ""
echo "🩺 TESTING critical endpoints..."

# Test health
echo "Testing health endpoint..."
HEALTH=$(curl -s "http://192.168.4.56:3000/health" | grep -o '"status"' | wc -l)
if [ "$HEALTH" -gt 0 ]; then
    echo "✅ Health endpoint working"
else
    echo "❌ Health endpoint failed"
fi

# Test Live endpoint
echo "Testing /Live/ endpoint..."
LIVE=$(curl -s "http://192.168.4.56:3000/Live/emergency-test-123" | grep -o '"success":true' | wc -l)
if [ "$LIVE" -gt 0 ]; then
    echo "✅ /Live/ endpoint working"
else
    echo "❌ /Live/ endpoint failed"
fi

# Test new livetv/sessions endpoint
echo "Testing /livetv/sessions/ endpoint..."
LIVETV=$(curl -s "http://192.168.4.56:3000/livetv/sessions/emergency-test-456" | grep -o 'MediaContainer' | wc -l)
if [ "$LIVETV" -gt 0 ]; then
    echo "✅ /livetv/sessions/ endpoint working"
else
    echo "❌ /livetv/sessions/ endpoint failed"
fi

echo ""
echo "📋 H.264 PPS CORRUPTION FIXES DEPLOYED:"
echo "1. ✅ Fixed emergency-safe profile with correct minimal FFmpeg parameters"
echo "2. ✅ Added ultra-minimal fallback profile for severe corruption"
echo "3. ✅ Enhanced error detection with escalation logic"
echo "4. ✅ All enhanced encoding streams forced to use safe profiles"
echo "5. ✅ Added /livetv/sessions/ endpoint for Plex Universal Transcode"
echo ""

echo "📊 MONITORING:"
echo "Watch logs: docker-compose -f docker-local.yml logs -f"
echo "Check errors: docker-compose -f docker-local.yml logs | grep -i error"
echo ""

echo "🎯 EXPECTED RESULTS:"
echo "- ✅ No more H.264 PPS/decode_slice_header errors"
echo "- ✅ Enhanced encoding streams start successfully"
echo "- ✅ No more 'non-existing PPS 0 referenced' errors"
echo "- ✅ Streams use minimal FFmpeg processing to prevent corruption"
echo "- ✅ Automatic escalation to ultra-minimal if problems persist"
echo ""

echo "Emergency deployment completed! Monitor the logs for verification."