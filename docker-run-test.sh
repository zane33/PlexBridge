#!/bin/bash

# PlexBridge Docker Test Script
# Run this script to test the latest build with all race condition fixes

echo "🐳 Starting PlexBridge Container with Latest Fixes..."
echo "📋 This container includes:"
echo "   ✅ Race condition fix for video player"
echo "   ✅ FFmpeg fallback for stream preview"
echo "   ✅ Enhanced error handling"
echo ""

# Stop any existing container
docker stop plexbridge-test 2>/dev/null
docker rm plexbridge-test 2>/dev/null

# Create data directory for persistence
mkdir -p ./data-test/{database,logs,cache}

# Run the container
docker run -d \
  --name plexbridge-test \
  -p 8080:8080 \
  -p 1900:1900/udp \
  -v "$(pwd)/data-test:/data" \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  -e FFMPEG_PATH=/usr/bin/ffmpeg \
  plexbridge:latest

echo "⏳ Waiting for container to start..."
sleep 5

# Check container status
if docker ps | grep -q plexbridge-test; then
    echo "✅ Container started successfully!"
    echo ""
    echo "🌐 Access Points:"
    echo "   Web Interface: http://localhost:8080"
    echo "   Health Check:  http://localhost:8080/health"
    echo "   API Docs:      http://localhost:8080/api"
    echo ""
    echo "🔧 Test the fixes:"
    echo "   1. Navigate to Streams section"
    echo "   2. Click 'Preview' on any stream"
    echo "   3. Video dialog should open without infinite loops"
    echo "   4. Stream should load (or fallback gracefully)"
    echo ""
    echo "📊 Container Info:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep plexbridge-test
    echo ""
    echo "📋 To view logs: docker logs -f plexbridge-test"
    echo "🛑 To stop: docker stop plexbridge-test"
    echo ""
    
    # Test health endpoint
    echo "🏥 Health Check:"
    curl -s http://localhost:8080/health | jq . 2>/dev/null || curl -s http://localhost:8080/health
    
else
    echo "❌ Container failed to start. Checking logs..."
    docker logs plexbridge-test
fi