#!/bin/bash

# PlexBridge Portainer Setup Script
# This script creates the necessary directories for bind mounts

echo "Creating PlexBridge directories for Portainer deployment..."

# Create main directories
mkdir -p data/database
mkdir -p data/logs
mkdir -p data/cache
mkdir -p data/logos
mkdir -p config

# Set appropriate permissions
chmod 755 data
chmod 755 data/database
chmod 755 data/logs
chmod 755 data/cache
chmod 755 data/logos
chmod 755 config

echo "Directory structure created:"
echo "  data/"
echo "    ├── database/"
echo "    ├── logs/"
echo "    ├── cache/"
echo "    └── logos/"
echo "  config/"
echo ""
echo "You can now deploy the stack using docker-compose.portainer.yml"
echo ""
echo "Note: If deploying via Portainer web interface:"
echo "1. Upload this entire project folder to your Portainer file manager"
echo "2. Run this script from the project root directory"
echo "3. Deploy the stack using docker-compose.portainer.yml"