#!/bin/bash

# EPG API Test Script
# Tests EPG functionality via HTTP API endpoints instead of direct Node.js calls

echo "🔍 Testing EPG API Endpoints..."

BASE_URL="http://localhost:8080"

# Function to test an endpoint
test_endpoint() {
    local endpoint=$1
    local description=$2
    echo ""
    echo "📡 Testing: $description"
    echo "   URL: $BASE_URL$endpoint"
    
    response=$(curl -s -w "HTTP_STATUS:%{http_code}" "$BASE_URL$endpoint" 2>/dev/null)
    http_status=$(echo "$response" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
    response_body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" = "200" ]; then
        echo "   ✅ Status: $http_status"
        echo "   📄 Response: $(echo "$response_body" | head -c 200)..."
    else
        echo "   ❌ Status: $http_status"
        echo "   📄 Response: $response_body"
    fi
}

# Wait for server to be ready
echo "⏳ Checking if server is running..."
for i in {1..10}; do
    if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
        echo "✅ Server is running"
        break
    else
        echo "   Attempt $i/10: Server not ready, waiting..."
        sleep 2
    fi
done

# Test health endpoint
test_endpoint "/health" "Application Health"

# Test EPG endpoints
test_endpoint "/api/epg-sources" "EPG Sources List"
test_endpoint "/api/channels" "Channels List"
test_endpoint "/epg/test-route" "EPG Test Route"

# Check if EPG sources exist, if not create one
echo ""
echo "🔧 Checking EPG sources..."
sources_response=$(curl -s "$BASE_URL/api/epg-sources" 2>/dev/null)
if echo "$sources_response" | grep -q '"total".*:.*0'; then
    echo "❌ No EPG sources found, creating Freeview NZ test source..."
    
    create_response=$(curl -s -X POST "$BASE_URL/api/epg-sources" \
        -H "Content-Type: application/json" \
        -d '{
            "id": "freeview-nz-test",
            "name": "Freeview NZ Test",
            "url": "https://i.mjh.nz/nzau/epg.xml.gz",
            "refresh_interval": "4h",
            "enabled": true
        }' 2>/dev/null)
    
    echo "📄 Create response: $create_response"
    
    # Test refresh
    echo ""
    echo "🔄 Testing EPG refresh..."
    refresh_response=$(curl -s -X POST "$BASE_URL/api/epg-sources/freeview-nz-test/refresh" 2>/dev/null)
    echo "📄 Refresh response: $refresh_response"
    
else
    echo "✅ EPG sources exist"
    
    # Get first source ID and test refresh
    source_id=$(echo "$sources_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ ! -z "$source_id" ]; then
        echo "🔄 Testing EPG refresh for source: $source_id"
        refresh_response=$(curl -s -X POST "$BASE_URL/api/epg-sources/$source_id/refresh" 2>/dev/null)
        echo "📄 Refresh response: $(echo "$refresh_response" | head -c 300)..."
    fi
fi

# Test EPG data endpoints
test_endpoint "/api/epg/channels" "EPG Channels"
test_endpoint "/api/epg/programs" "EPG Programs"
test_endpoint "/epg/debug/jobs" "EPG Job Status"

# Test XMLTV output
test_endpoint "/epg/xmltv" "XMLTV Export"

echo ""
echo "✅ EPG API testing completed"