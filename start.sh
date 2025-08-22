#!/bin/bash

# Set environment variables
export NODE_ENV=production
export PORT=3000
export HOST_IP=0.0.0.0
export HTTP_PORT=3000
export DB_PATH=/data/database/plextv.db
export LOG_PATH=/data/logs
export CACHE_PATH=/data/cache
export LOGOS_PATH=/data/logos

# Ensure data directories exist with proper permissions
mkdir -p /data/database /data/cache /data/logs /data/logos /var/lib/redis

# Remove any directory that might exist at the database file path and keep removing it
cleanup_db_path() {
    while [ -d "/data/database/plextv.db" ]; do
        echo "Removing directory at database file path..."
        rm -rf /data/database/plextv.db
        sleep 1
    done
}

# Run cleanup in background
cleanup_db_path &

chown -R plextv:plextv /data /var/lib/redis

# Start supervisord with proper configuration
echo "Starting PlexBridge with supervisord..."
exec /usr/bin/supervisord -c /etc/supervisord.conf