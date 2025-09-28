#!/bin/bash

# PlexBridge Restart Script for EPG Fix Implementation
# Run this script to restart PlexBridge with the new EPG configuration

echo "🔄 PlexBridge EPG Fix - Container Restart"
echo "========================================="

# Check if docker-compose exists
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found. Are you in the PlexBridge directory?"
    exit 1
fi

echo "📍 Current directory: $(pwd)"
echo "📋 Stopping PlexBridge container..."

# Stop the container
docker-compose down
if [ $? -ne 0 ]; then
    echo "❌ Failed to stop container. Trying alternative compose file..."
    if [ -f "docker-local.yml" ]; then
        echo "📋 Using docker-local.yml..."
        docker-compose -f docker-local.yml down
    else
        echo "❌ Could not find docker-local.yml either. Please stop container manually."
        exit 1
    fi
fi

echo "⏳ Waiting 5 seconds for clean shutdown..."
sleep 5

echo "🚀 Starting PlexBridge container with EPG configuration..."

# Start the container
docker-compose up -d
if [ $? -ne 0 ]; then
    echo "❌ Failed to start container. Trying alternative compose file..."
    if [ -f "docker-local.yml" ]; then
        echo "🚀 Using docker-local.yml..."
        docker-compose -f docker-local.yml up -d
    else
        echo "❌ Could not start container. Please check configuration."
        exit 1
    fi
fi

echo "✅ PlexBridge container restarted successfully!"
echo ""
echo "📊 Monitoring EPG service initialization..."
echo "⏳ Waiting 10 seconds for service startup..."
sleep 10

echo ""
echo "🔍 Checking EPG service logs..."
docker logs plextv | grep -i epg | tail -10

echo ""
echo "🌐 Access Points:"
echo "• Web Interface: http://192.168.4.5:3000"
echo "• EPG Manager: http://192.168.4.5:3000/#/epg"
echo "• Channels: http://192.168.4.5:3000/#/channels"
echo ""
echo "📋 Next Steps:"
echo "1. Check EPG Manager for source status"
echo "2. Monitor EPG data download progress"
echo "3. Verify channels show program data"
echo "4. Configure real stream URLs"
echo ""
echo "✅ EPG fix implementation complete!"