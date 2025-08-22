#!/bin/bash

echo "=== PlexBridge Debug Startup ==="
echo "Working directory: $(pwd)"
echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "User: $(whoami)"
echo "Environment: $NODE_ENV"
echo "Data directory: /data"
echo "Current time: $(date)"

# Check critical directories
echo "=== Directory Check ==="
for dir in /data /data/database /data/logs /data/cache /data/logos; do
    if [ -d "$dir" ]; then
        echo "✅ $dir exists (writable: $(test -w "$dir" && echo "yes" || echo "no"))"
    else
        echo "❌ $dir missing"
    fi
done

# Check critical files
echo "=== File Check ==="
for file in server/index.js package.json; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
    fi
done

# Check client build
echo "=== Client Build Check ==="
if [ -d "client/build" ]; then
    echo "✅ client/build exists"
    echo "Build files: $(ls -la client/build | wc -l) items"
else
    echo "❌ client/build missing"
fi

# Environment variables
echo "=== Environment Variables ==="
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"
echo "HTTP_PORT=$HTTP_PORT"
echo "HOST_IP=$HOST_IP"
echo "DB_PATH=$DB_PATH"

# Network check
echo "=== Network Check ==="
echo "Hostname: $(hostname)"
echo "IP addresses:"
ip addr show | grep -E "inet " | grep -v "127.0.0.1" || echo "No network interfaces found"

echo "=== Starting Node.js Application ==="
echo "Command: node server/index.js"
echo "====================================="

# Start the application with error capture
exec node server/index.js 2>&1