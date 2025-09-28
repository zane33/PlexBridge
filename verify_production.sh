#!/bin/bash
# Quick production verification script
# Use this to check current status before and after deployment

PRODUCTION_HOST="192.168.3.148:3000"

echo "=== PlexBridge Production Status Check ==="
echo "Date: $(date)"
echo "Production: $PRODUCTION_HOST"
echo

# Function to check endpoint
check_endpoint() {
    local endpoint="$1"
    local description="$2"
    
    echo -n "$description: "
    if curl -s --max-time 10 http://$PRODUCTION_HOST$endpoint > /dev/null; then
        echo "✅ OK"
    else
        echo "❌ FAILED"
    fi
}

# Basic health check
echo "=== Health Status ==="
curl -s http://$PRODUCTION_HOST/health | grep -E "(status|timestamp|uptime)" | head -5
echo

# EPG Sources Status
echo "=== EPG Sources Status ==="
echo "Checking last refresh times..."
curl -s http://$PRODUCTION_HOST/api/epg-sources | grep -E "(name|last_refresh|last_success)" | head -10
echo

# EPG Programs Status  
echo "=== EPG Programs Status ==="
echo "Checking program dates..."
programs_data=$(curl -s "http://$PRODUCTION_HOST/api/epg/programs?limit=3")
echo "$programs_data" | grep -E "(start_time|created_at)" | head -5
echo

# Check for current vs old dates
current_date=$(date +%Y-%m-%d)
echo "Current date: $current_date"

if echo "$programs_data" | grep -q "$current_date"; then
    echo "✅ Programs contain TODAY'S date ($current_date)"
elif echo "$programs_data" | grep -q "2025-09-2[789]"; then
    echo "✅ Programs contain RECENT dates (Sept 27-29)"
elif echo "$programs_data" | grep -q "2025-09-20"; then
    echo "❌ Programs still contain OLD dates (Sept 20) - EPG fix needed"
else
    echo "⚠️  Unable to determine program date status"
fi
echo

# Critical endpoints check
echo "=== Critical Endpoints ==="
check_endpoint "/health" "Health check"
check_endpoint "/api/epg-sources" "EPG sources"
check_endpoint "/api/epg/programs?limit=1" "EPG programs"
check_endpoint "/discover.json" "Plex discovery"
check_endpoint "/lineup.json" "Plex lineup"
check_endpoint "/api/channels" "Channel API"
check_endpoint "/api/streams" "Stream API"

echo
echo "=== Summary ==="
if curl -s http://$PRODUCTION_HOST/health | grep -q '"status":"healthy"'; then
    echo "✅ Production server is healthy"
    
    # Check EPG data freshness
    if curl -s "http://$PRODUCTION_HOST/api/epg/programs?limit=1" | grep -q "$(date +%Y-%m-%d)"; then
        echo "✅ EPG data is current"
        echo "🎉 PRODUCTION STATUS: EXCELLENT"
    elif curl -s "http://$PRODUCTION_HOST/api/epg/programs?limit=1" | grep -q "2025-09-2[789]"; then
        echo "✅ EPG data is recent"
        echo "😊 PRODUCTION STATUS: GOOD"
    else
        echo "❌ EPG data is stale (needs database fix)"
        echo "🔧 PRODUCTION STATUS: NEEDS EPG FIX"
    fi
else
    echo "❌ Production server has issues"
    echo "🚨 PRODUCTION STATUS: NEEDS ATTENTION"
fi