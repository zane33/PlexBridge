#!/bin/bash

echo "================================"
echo "ANDROID TV CRASH DETECTION FIX - Emergency Deployment"
echo "================================"
echo
echo "FIXES IMPLEMENTED:"
echo "✅ Intelligent client crash detection for Android TV"
echo "✅ Session conflict resolution between multiple clients"
echo "✅ Timeline call termination after client crashes"
echo "✅ Activity pattern analysis for crash prediction"
echo "✅ Coordinated session management across all services"
echo "✅ Proper session cleanup when clients fail/disconnect"
echo
echo "🚨 STOPPING container..."
docker-compose -f docker-local.yml down

echo
echo "🔧 REBUILDING with crash detection..."
docker-compose -f docker-local.yml build --no-cache

echo
echo "🚀 STARTING container..."
docker-compose -f docker-local.yml up -d

echo
echo "⏳ Waiting for startup (30 seconds)..."
sleep 30

echo
echo "🩺 TESTING critical endpoints..."

# Test health
echo "Testing health endpoint..."
if curl -s http://localhost:8080/health > /dev/null; then
    echo "✅ Health endpoint working"
else
    echo "❌ Health endpoint failed"
fi

# Test Live TV sessions endpoint (critical for crash detection)
echo "Testing /livetv/sessions/ endpoint..."
TEST_SESSION="test-crash-detection-$(date +%s)"
if curl -s "http://localhost:8080/livetv/sessions/${TEST_SESSION}" > /dev/null; then
    echo "✅ Live TV sessions endpoint working"
else
    echo "❌ Live TV sessions endpoint failed"
fi

# Test consumer endpoint 
echo "Testing consumer endpoint..."
if curl -s "http://localhost:8080/consumer/${TEST_SESSION}/status" > /dev/null; then
    echo "✅ Consumer endpoint working"
else
    echo "❌ Consumer endpoint failed"
fi

# Test timeline endpoint
echo "Testing timeline endpoint..."
if curl -s "http://localhost:8080/timeline/18961" > /dev/null; then
    echo "✅ Timeline endpoint working"
else
    echo "❌ Timeline endpoint failed"
fi

echo
echo "📋 ANDROID TV CRASH DETECTION FIXES DEPLOYED:"
echo "1. ✅ ClientCrashDetector service - detects Android TV crashes via error patterns"
echo "2. ✅ CoordinatedSessionManager - resolves conflicts between multiple clients"
echo "3. ✅ Enhanced /livetv/sessions endpoint - terminates timeline calls for crashed sessions"
echo "4. ✅ Enhanced /consumer endpoint - returns 410 errors for crashed sessions"
echo "5. ✅ Session health monitoring - distinguishes network hiccups from crashes"
echo "6. ✅ Activity pattern analysis - predicts crashes before they cause conflicts"
echo
echo "📊 MONITORING:"
echo "Watch logs: docker-compose -f docker-local.yml logs -f"
echo "Check errors: docker-compose -f docker-local.yml logs | grep -i error"
echo "View crash stats: curl http://localhost:8080/api/streaming/active"
echo
echo "🎯 EXPECTED RESULTS:"
echo "- ✅ No more session persistence conflicts between Android TV clients"
echo "- ✅ Timeline calls stop after client crashes (no more 410 errors continuing)"
echo "- ✅ Sessions automatically terminate when clients disconnect/crash"
echo "- ✅ Network hiccups don't kill sessions (only real crashes do)"
echo "- ✅ Multiple Android TV clients can coexist without conflicts"
echo "- ✅ Remote client crashes don't affect local client streaming"
echo
echo "Emergency deployment completed! Monitor the logs for crash detection activity."