# PlexBridge Portainer Deployment Guide

## Quick Start with Portainer

This guide provides instructions for deploying PlexBridge using Portainer.

## Method 1: Docker Compose Stack (Recommended)

1. **Create Required Directories First**:
   - In Portainer, navigate to your stack directory
   - Create the following directory structure:
     ```
     data/
     ├── database/
     ├── logs/
     ├── cache/
     └── logos/
     config/
     ```
   - Alternatively, upload and run the `portainer-setup.sh` script

2. **In Portainer, go to Stacks → Add Stack**

3. **Name your stack**: `plexbridge`

4. **Copy the contents of `docker-compose.portainer.yml` into the Web Editor**

5. **Add Environment Variables** (optional):
   ```
   DOCKER_HOST_IP=192.168.1.100  # Your Docker host IP
   ```

6. **Click "Deploy the stack"**

## Method 2: Using Pre-built Image

If you have a pre-built image in a registry:

1. **Go to Containers → Add Container**

2. **Container Configuration**:
   - Name: `plexbridge`
   - Image: `ghcr.io/yourusername/plexbridge:latest` (or your image location)

3. **Port Mapping**:
   - Host: `8080` → Container: `8080`
   - Host: `1900` → Container: `1900/udp`

4. **Volumes**:
   - Create named volumes:
     - `plexbridge_data` → `/data`
     - `plexbridge_config` → `/app/config`

5. **Environment Variables**:
   ```
   NODE_ENV=production
   HOST_IP=0.0.0.0
   HTTP_PORT=8080
   ADVERTISED_HOST=YOUR_DOCKER_HOST_IP
   BASE_URL=http://YOUR_DOCKER_HOST_IP:8080
   ```

6. **Restart Policy**: Unless stopped

7. **Deploy the container**

## Method 3: Build from Source in Portainer

1. **Prepare the build context**:
   - Create a Git repository with your PlexBridge code
   - Include `Dockerfile.portainer` as `Dockerfile`

2. **In Portainer, go to Images → Build a new image**:
   - Name: `plexbridge:latest`
   - Build method: URL
   - URL: Your Git repository URL
   - Dockerfile: `Dockerfile`

3. **Build the image**

4. **Deploy using Method 2 with your built image**

## Troubleshooting

### Volume Mount Errors ("no such file or directory")

If you encounter this error:
```
failed to populate volume: error while mounting volume: failed to mount local volume: mount /data/compose/88/data: no such file or directory
```

**Solution:**

1. **Create directories manually** in your Portainer stack location:
   - Use Portainer's file manager to create `data/` and `config/` folders
   - Or upload and run the `portainer-setup.sh` script

2. **Alternative: Use named volumes** by editing the compose file:
   ```yaml
   volumes:
     - plextv_data:/data    # Instead of ./data:/data
     - plextv_config:/app/config
   ```

3. **For Synology NAS users**: Ensure Docker has access to the volume location

### Dockerfile Case Sensitivity

If build fails with "Dockerfile not found":
- Ensure the dockerfile is named exactly `dockerfile.portainer` (lowercase)
- Check the compose file references the correct filename

### Network Issues

If PlexBridge can't be discovered by Plex:

1. **Set ADVERTISED_HOST** to your Docker host's IP address
2. **Ensure port 1900/udp** is properly mapped
3. **Check firewall rules** allow UDP traffic on port 1900

### Container Won't Start

1. **Check logs** in Portainer (Container → Logs)
2. **Verify environment variables** are set correctly
3. **Ensure the image** built successfully
4. **Check health status** after 1 minute

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | production | Application environment |
| `HOST_IP` | 0.0.0.0 | Bind address for the server |
| `HTTP_PORT` | 8080 | Main HTTP server port |
| `STREAM_PORT` | 8080 | Streaming server port |
| `DISCOVERY_PORT` | 1900 | SSDP discovery port |
| `ADVERTISED_HOST` | localhost | Hostname/IP for client connections |
| `BASE_URL` | http://localhost:8080 | Complete base URL |
| `DB_PATH` | /data/database/plextv.db | Database file location |
| `LOG_PATH` | /data/logs | Log files directory |
| `CACHE_PATH` | /data/cache | Cache directory |
| `LOGOS_PATH` | /data/logos | Channel logos directory |

## Volume Structure

The container uses two main volumes:

### `/data` - Application Data
```
/data/
├── database/     # SQLite database
│   └── plextv.db
├── logs/         # Application logs
├── cache/        # Temporary cache files
└── logos/        # Channel logo images
```

### `/app/config` - Configuration
```
/app/config/
├── default.json  # Default configuration
└── production.json # Production overrides (optional)
```

## Accessing PlexBridge

After deployment:

1. **Web Interface**: `http://YOUR_HOST_IP:8080`
2. **Health Check**: `http://YOUR_HOST_IP:8080/health`
3. **Plex Discovery**: PlexBridge should appear in Plex as an HDHomeRun device

## Updating PlexBridge

To update PlexBridge in Portainer:

1. **Pull the latest image** (if using pre-built)
2. **Recreate the container** with the same settings
3. **Or update the stack** with a new image tag

Your data in named volumes will be preserved during updates.

## Security Considerations

1. **Run as non-root**: The container runs as user `plextv` (UID 1001)
2. **Limit exposed ports**: Only expose necessary ports
3. **Use environment variables**: Don't hardcode sensitive data
4. **Regular updates**: Keep the image updated for security patches

## Support

For issues specific to Portainer deployment:
1. Check container logs in Portainer
2. Verify environment variables
3. Ensure volumes are properly mounted
4. Check network connectivity between containers