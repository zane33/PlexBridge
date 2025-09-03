#!/bin/bash

echo "================================"
echo "EMERGENCY DEPLOYMENT - Critical H.264 and Consumer Fixes"
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
echo "📋 EMERGENCY FIXES DEPLOYED:"
echo "1. ✅ Added /livetv/sessions/ endpoint for Plex Universal Transcode"
echo "2. ✅ Created emergency-safe H.264 profile with minimal processing"
echo "3. ✅ Forced ALL enhanced encoding to use emergency-safe mode"
echo "4. ✅ Enhanced consumer session tracking"
echo ""

echo "📊 MONITORING:"
echo "Watch logs: docker-compose -f docker-local.yml logs -f"
echo "Check errors: docker-compose -f docker-local.yml logs | grep -i error"
echo ""

echo "🎯 EXPECTED RESULTS:"
echo "- No more 'Failed to find consumer' errors"
echo "- No more H.264 PPS/decode errors"
echo "- Enhanced encoding streams work without crashes"
echo "- Plex Universal Transcode requests succeed"
echo ""

echo "Emergency deployment completed! Monitor the logs for verification."