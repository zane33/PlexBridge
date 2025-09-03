#!/bin/bash

# Test script to verify consumer endpoint fixes for PlexBridge
# This tests the new /Live/ endpoints that should prevent "Failed to find consumer" errors

echo "================================"
echo "PlexBridge Consumer Fix Test"
echo "================================"
echo ""

# Configuration
BASE_URL="http://192.168.4.56:3000"
TEST_SESSION_ID="0511796b-a1f2-46e6-ae2f-ce44650683f4"

echo "Testing PlexBridge consumer endpoints at: $BASE_URL"
echo "Using test session ID: $TEST_SESSION_ID"
echo ""

# Test 1: Check health endpoint
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/health" | jq '.status' 2>/dev/null || echo "Health check failed"
echo ""

# Test 2: Test /consumer/ endpoint (existing)
echo "2. Testing /consumer/ endpoint..."
curl -s "$BASE_URL/consumer/$TEST_SESSION_ID" | jq '.consumer.available' 2>/dev/null || echo "Consumer endpoint not available"
echo ""

# Test 3: Test new /Live/ endpoint (capital L)
echo "3. Testing /Live/ endpoint (capital L - NEW)..."
RESPONSE=$(curl -s "$BASE_URL/Live/$TEST_SESSION_ID")
if echo "$RESPONSE" | jq '.consumer.available' 2>/dev/null; then
    echo "✓ /Live/ endpoint is working!"
else
    echo "✗ /Live/ endpoint failed or not found"
    echo "Response: $RESPONSE"
fi
echo ""

# Test 4: Test /Live/ with action parameter
echo "4. Testing /Live/ with action parameter..."
curl -s "$BASE_URL/Live/$TEST_SESSION_ID/status" | jq '.consumer.available' 2>/dev/null || echo "/Live/sessionId/action endpoint not available"
echo ""

# Test 5: Test existing /live/ endpoint (lowercase)
echo "5. Testing /live/ endpoint (lowercase)..."
curl -s "$BASE_URL/live/$TEST_SESSION_ID/status" | jq '.consumer.state' 2>/dev/null || echo "/live/ endpoint not available"
echo ""

# Test 6: Test lineup to ensure channels are available
echo "6. Testing channel lineup..."
CHANNELS=$(curl -s "$BASE_URL/lineup.json" | jq 'length' 2>/dev/null)
if [ -n "$CHANNELS" ] && [ "$CHANNELS" -gt 0 ]; then
    echo "✓ Found $CHANNELS channels in lineup"
else
    echo "✗ No channels found or lineup endpoint failed"
fi
echo ""

echo "================================"
echo "Test Summary:"
echo "================================"
echo "The /Live/ endpoints should now handle Plex consumer requests properly."
echo "This should prevent 'Failed to find consumer' errors during streaming."
echo ""
echo "To apply the fix to your Docker deployment:"
echo "1. Rebuild the Docker image: docker-compose -f docker-local.yml build"
echo "2. Restart the container: docker-compose -f docker-local.yml up -d"
echo "3. Monitor logs: docker-compose -f docker-local.yml logs -f"
echo ""
echo "If streams still crash, check the PlexBridge logs for any remaining errors."