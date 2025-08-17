#!/bin/bash

# Set environment variables
export NODE_ENV=production
export PORT=8080
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

# Start Redis in background as root (simple approach)
redis-server --bind 127.0.0.1 --port 6379 --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru --dir /var/lib/redis --daemonize yes

# Wait for Redis to start
sleep 3

# Change to plextv user and start the Node.js application
cd /app
exec su -s /bin/sh plextv -c "node server/index.js"