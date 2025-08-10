#!/bin/bash

# PlexTV Local Build Script
# This script builds and runs PlexTV in a single container for testing

set -e

echo "🚀 PlexTV Local Build Script"
echo "=============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

print_status "Docker is running ✓"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    print_error "docker-compose is not installed. Please install it and try again."
    exit 1
fi

print_status "docker-compose is available ✓"

# Create data directories if they don't exist
print_status "Creating data directories..."
mkdir -p data/database
mkdir -p data/cache
mkdir -p data/logs
mkdir -p data/logos

print_success "Data directories created"

# Generate UUID for SSDP if not exists
if [ ! -f data/.device-uuid ]; then
    print_status "Generating device UUID..."
    # Generate UUID (works on both Linux and macOS)
    if command -v uuidgen &> /dev/null; then
        uuidgen > data/.device-uuid
    else
        # Fallback for systems without uuidgen
        python3 -c "import uuid; print(uuid.uuid4())" > data/.device-uuid
    fi
    print_success "Device UUID generated: $(cat data/.device-uuid)"
else
    print_status "Using existing device UUID: $(cat data/.device-uuid)"
fi

# Stop any existing containers
print_status "Stopping any existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true

# Build the application
print_status "Building PlexTV container (this may take a few minutes)..."
docker-compose build --no-cache

if [ $? -eq 0 ]; then
    print_success "Container built successfully!"
else
    print_error "Container build failed!"
    exit 1
fi

# Start the application
print_status "Starting PlexTV application..."
DEVICE_UUID=$(cat data/.device-uuid) docker-compose up -d

if [ $? -eq 0 ]; then
    print_success "PlexTV started successfully!"
else
    print_error "Failed to start PlexTV!"
    exit 1
fi

# Wait for application to be ready
print_status "Waiting for application to be ready..."
timeout=60
counter=0

while [ $counter -lt $timeout ]; do
    if curl -s -f http://localhost:8080/health > /dev/null 2>&1; then
        break
    fi
    sleep 2
    counter=$((counter + 2))
    echo -n "."
done

echo ""

if [ $counter -ge $timeout ]; then
    print_warning "Application didn't respond within $timeout seconds"
    print_status "You can check the logs with: docker-compose logs -f"
else
    print_success "Application is ready!"
fi

# Display connection information
echo ""
echo "🎉 PlexTV is now running!"
echo "=========================="
echo ""
echo "📱 Web Interface:     http://localhost:8080"
echo "🔍 Health Check:      http://localhost:8080/health"
echo "📊 Metrics:          http://localhost:8080/api/metrics"
echo "📺 Discovery:        http://localhost:8080/discover.json"
echo ""
echo "🔧 Management Commands:"
echo "  View logs:          docker-compose logs -f"
echo "  Stop application:   docker-compose down"
echo "  Restart:           docker-compose restart"
echo "  Update & rebuild:   ./build-local.sh"
echo ""

# Check if application is responding
print_status "Testing application endpoints..."

# Test health endpoint
if curl -s -f http://localhost:8080/health > /dev/null; then
    print_success "Health endpoint ✓"
else
    print_warning "Health endpoint not responding"
fi

# Test discovery endpoint
if curl -s -f http://localhost:8080/discover.json > /dev/null; then
    print_success "Discovery endpoint ✓"
else
    print_warning "Discovery endpoint not responding"
fi

# Test web interface
if curl -s -f http://localhost:8080 > /dev/null; then
    print_success "Web interface ✓"
else
    print_warning "Web interface not responding"
fi

echo ""
print_success "Setup complete! 🎉"
echo ""
print_status "Next steps:"
echo "1. Open http://localhost:8080 in your browser"
echo "2. Add some channels and streams"
echo "3. Configure your Plex server to use PlexTV as a tuner"
echo "4. Enjoy live TV in Plex!"
echo ""
print_status "For troubleshooting, check: docker-compose logs -f"
