#!/bin/bash

# Set up proper environment for persistence
echo "Starting PlexBridge server with persistent data..."

# Fix permissions on data directory if running as root in supervisord
if [ "$(id -u)" = "0" ]; then
    echo "Running as root, fixing data permissions..."
    /app/fix-permissions.sh
fi

# Ensure database directory exists and is writable
echo "Ensuring database directory structure..."
mkdir -p /data/database /data/cache /data/logs /data/logos

# Check if database file exists and is accessible
if [ -f "/data/database/plextv.db" ]; then
    echo "Existing database found at /data/database/plextv.db"
    # Check if database is accessible
    if ! sqlite3 /data/database/plextv.db ".tables" >/dev/null 2>&1; then
        echo "Warning: Database file exists but is not accessible. Attempting to repair..."
        # Create backup if possible
        if [ -w "/data/database/" ]; then
            cp /data/database/plextv.db /data/database/plextv.db.backup.$(date +%s) 2>/dev/null || true
        fi
    fi
else
    echo "No existing database found. New database will be created at /data/database/plextv.db"
fi

# Set working directory
cd /app

# Start the server
echo "Starting PlexBridge server..."
exec node server/production-start.js