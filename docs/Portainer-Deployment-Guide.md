# PlexBridge Portainer Deployment Guide

## Overview

This guide explains how to deploy PlexBridge using Portainer with different deployment methods. The key difference from local Docker deployments is that Portainer uses Docker named volumes instead of bind mounts to avoid file system access issues.

## Fixed Volume Mount Issues

The original error you encountered:
```
failed to populate volume: error while mounting volume '/var/lib/docker/volumes/plexbridge_plextv_data/_data': failed to mount local volume: mount /data/compose/1/data:/var/lib/docker/volumes/plexbridge_plextv_data/_data, flags: 0x1000: no such file or directory
```

This was caused by trying to use bind mounts (`./data`, `./config`) which don't work in Portainer's deployment environment. The fix is to use Docker named volumes instead.

## Deployment Methods

### Method 1: Git Repository (Recommended for GitHub/GitLab users)

**File**: `docker-compose.portainer.yml` or `docker-compose.portainer-git.yml`

**Prerequisites**:
- PlexBridge source code in a Git repository
- Repository accessible to Portainer (public or with credentials)

**Steps**:
1. In Portainer, go to **Stacks** → **Add stack**
2. Choose **Repository** method
3. Enter your Git repository URL
4. Set **Compose path** to `docker-compose.portainer.yml`
5. Configure environment variables (especially `ADVERTISED_HOST`)
6. Deploy the stack

**Advantages**:
- Builds directly from source code
- Easy updates by redeploying from repository
- No need for Docker Hub or pre-built images

### Method 2: Upload Archive (Best for private deployments)

**File**: `docker-compose.portainer-git.yml`

**Prerequisites**:
- Complete PlexBridge source code
- All files in a single archive

**Steps**:
1. Create a tar/zip archive of the entire PlexBridge directory
2. In Portainer, go to **Stacks** → **Add stack**
3. Choose **Upload** method
4. Upload the archive containing source code and `docker-compose.portainer-git.yml`
5. Deploy the stack

## Key Configuration Changes for Portainer

### Volume Configuration

**❌ Original (doesn't work in Portainer)**:
```yaml
volumes:
  plextv_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data
```

**✅ Fixed (Portainer compatible)**:
```yaml
volumes:
  plextv_data:
    driver: local
    # No driver_opts - let Docker manage the volume location
  plextv_config:
    driver: local
    # Configuration volume for Portainer deployments
```

### Container Volume Mounts

**❌ Original (bind mounts don't work)**:
```yaml
volumes:
  - plextv_data:/data
  - ./config:/app/config:ro
  - ./data:/host-data
```

**✅ Fixed (named volumes only)**:
```yaml
volumes:
  - plextv_data:/data
  - plextv_config:/app/config:ro
  # No bind mounts for Portainer compatibility
```

## Environment Variables

All environment variables can be customized during Portainer deployment. Key variables to configure:

```yaml
# Network configuration - IMPORTANT: Update these for your environment
- HOST_IP=192.168.3.148                # Your server's IP address
- ADVERTISED_HOST=192.168.3.148        # IP that Plex should connect to
- BASE_URL=http://192.168.3.148:3000   # Complete URL for the service

# Device identification (make unique per deployment)
- DEVICE_UUID=plextv-portainer-stable-uuid-001
- DEVICE_NAME=PlexBridge Portainer
- DEVICE_ID=PLEXTV002
```

## Network Configuration

The configuration uses `network_mode: "host"` for optimal Plex discovery. If your Docker host doesn't support host networking, you can modify to:

```yaml
# Alternative: Port mapping instead of host networking
# network_mode: "host"  # Comment out this line
ports:
  - "3000:3000"       # HTTP port
  - "1900:1900/udp"   # SSDP discovery port
```

## Data Persistence

With named volumes, your data persists between container restarts and updates:

- **plextv_data**: Contains database, logs, cache, and channel logos
- **plextv_config**: Contains application configuration files

To backup data:
```bash
# Create backup of data volume
docker run --rm -v plexbridge_plextv_data:/data -v $(pwd):/backup alpine tar czf /backup/plextv-data-backup.tar.gz -C /data .

# Restore from backup
docker run --rm -v plexbridge_plextv_data:/data -v $(pwd):/backup alpine tar xzf /backup/plextv-data-backup.tar.gz -C /data
```

## Troubleshooting

### Common Issues

1. **Volume Mount Errors**
   - Ensure you're using the updated compose files without bind mounts
   - Check that you're not referencing local directories (`./`)

2. **Image Not Found**
   - If using pre-built image method, ensure `plexbridge:latest` exists on the Docker host
   - Consider using git repository method instead

3. **Network Issues**
   - Verify `ADVERTISED_HOST` matches your server's actual IP address
   - Ensure ports 3000 and 1900 are available on the Docker host

4. **Permission Issues**
   - Named volumes should handle permissions automatically
   - If issues persist, check Docker daemon logs

### Verification Steps

After deployment, verify the stack is working:

```bash
# Check container status
curl http://YOUR_HOST_IP:3000/health

# Test Plex discovery endpoint
curl http://YOUR_HOST_IP:3000/discover.json

# Verify channel lineup
curl http://YOUR_HOST_IP:3000/lineup.json
```

## Migration from Bind Mounts

If you have an existing deployment with bind mounts, migrate your data:

1. **Backup existing data**:
   ```bash
   tar czf plextv-backup.tar.gz ./data/
   ```

2. **Deploy new stack** with named volumes

3. **Copy data to new volume**:
   ```bash
   docker run --rm -v plexbridge_plextv_data:/target -v $(pwd):/source alpine cp -r /source/data/* /target/
   ```

4. **Verify data migration** by checking the health endpoint

## Updates and Maintenance

### Updating the Application

**Method 1 (Pre-built image)**:
1. Build new image: `docker build -t plexbridge:latest .`
2. In Portainer, redeploy the stack
3. Data persists automatically in named volumes

**Method 2 (Git repository)**:
1. Push changes to your Git repository
2. In Portainer, pull and redeploy the stack
3. Application rebuilds with latest code

### Monitoring

The stack includes health checks that Portainer can monitor:
- Health check interval: 30 seconds
- Startup grace period: 40 seconds
- Automatic restart on failure

## Conclusion

The updated Portainer configuration resolves volume mounting issues by:
- Using Docker named volumes instead of bind mounts
- Providing multiple deployment methods for different scenarios
- Maintaining data persistence and easy updates
- Ensuring compatibility with Portainer's deployment environment

Choose the deployment method that best fits your workflow and infrastructure setup.