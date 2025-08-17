#!/bin/bash

# Set environment variables
export NODE_ENV=production
export PORT=8080
export HOST_IP=0.0.0.0
export HTTP_PORT=8080
export DB_PATH=/data/database/plextv.db
export LOG_PATH=/data/logs
export CACHE_PATH=/data/cache
export LOGOS_PATH=/data/logos
export REDIS_HOST=localhost
export REDIS_PORT=6379

echo "Starting PlexBridge debug mode..."
echo "Environment variables set"
echo "Starting Redis..."

# Start Redis in background
redis-server --bind 127.0.0.1 --port 6379 --daemonize yes

# Wait for Redis
sleep 2

echo "Redis started"
echo "Starting Node.js application..."

# Start Node.js app in foreground with full output
cd /app
exec node server/index.js