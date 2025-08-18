#!/bin/bash

echo "Fixing data directory permissions..."

if [ -d "/data" ]; then
  # Create subdirectories if they do not exist
  mkdir -p /data/database /data/cache /data/logs /data/logos
  
  # Fix ownership and permissions
  chown -R plextv:plextv /data || echo "Warning: Could not change ownership of /data"
  chmod -R 755 /data || echo "Warning: Could not change permissions of /data"
  
  # Ensure database directory is writable
  chmod 755 /data/database || echo "Warning: Could not set database directory permissions"
  
  echo "Data directory permissions fixed successfully"
else
  echo "Warning: /data directory not found, creating it..."
  mkdir -p /data/database /data/cache /data/logs /data/logos
  chown -R plextv:plextv /data
  chmod -R 755 /data
fi