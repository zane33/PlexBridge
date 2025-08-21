#!/bin/bash
set -e

echo "PlexBridge Container Starting..."

# Function to safely create directory with proper permissions
create_data_dir() {
    local dir="$1"
    if [ ! -d "$dir" ]; then
        echo "Creating directory: $dir"
        mkdir -p "$dir"
    fi
    chown plextv:plextv "$dir"
    chmod 755 "$dir"
}

# Ensure all required directories exist in mounted volumes
echo "Ensuring data directory structure..."
create_data_dir "/data"
create_data_dir "/data/database"
create_data_dir "/data/logs"
create_data_dir "/data/cache"
create_data_dir "/data/logos"

echo "Ensuring config directory exists..."
create_data_dir "/app/config"

# Copy default config if it doesn't exist
if [ ! -f "/app/config/default.json" ] && [ -f "/app/server/config/default.json" ]; then
    echo "Copying default configuration..."
    cp "/app/server/config/default.json" "/app/config/default.json"
    chown plextv:plextv "/app/config/default.json"
fi

# Verify permissions are correct
echo "Setting final permissions..."
chown -R plextv:plextv /data /app/config 2>/dev/null || true
chmod -R 755 /data /app/config 2>/dev/null || true

echo "Directory structure verified:"
ls -la /data/
echo ""

# Start the application
echo "Starting PlexBridge application..."

# If we have supervisord, use it; otherwise start directly
if [ -f /etc/supervisord.conf ] || [ -f /app/supervisord.conf ]; then
    exec /usr/bin/supervisord -c ${SUPERVISORD_CONF:-/etc/supervisord.conf}
else
    # Switch to plextv user and start application
    exec su-exec plextv node /app/server/index.js
fi