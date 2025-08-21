# PlexBridge Docker Deployment Guide

This guide covers how to deploy PlexBridge using either Docker Desktop (local deployment) or Portainer (remote deployment).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Deployment with Docker Desktop](#local-deployment-with-docker-desktop)
- [Remote Deployment with Portainer](#remote-deployment-with-portainer)
- [Configuration Options](#configuration-options)
- [Troubleshooting](#troubleshooting)
- [Performance Optimization](#performance-optimization)

## Prerequisites

### System Requirements
- Docker Engine 20.10+ or Docker Desktop
- 4GB+ RAM available for container
- 2GB+ disk space for images and data
- Network access for npm package downloads (during build)

### Required Files
- `Dockerfile` - Container build instructions
- `docker-compose.yml` or `docker-local.yml` - Service configuration
- `client/build/` directory - Pre-built React application
- Server source code in `server/` directory

## Local Deployment with Docker Desktop

### Method 1: Using docker-local.yml (Recommended for Development)

1. **Build the client application:**
   ```bash
   cd client
   npm install
   npm run build
   cd ..
   ```

2. **Build the Docker image:**
   ```bash
   docker-compose -f docker-local.yml build --no-cache
   ```

3. **Deploy the container:**
   ```bash
   docker-compose -f docker-local.yml up -d
   ```

4. **Verify deployment:**
   ```bash
   docker ps
   curl http://localhost:3000/health
   ```

### Method 2: Using docker-compose.yml (Production Configuration)

1. **Build the client (if not already done):**
   ```bash
   cd client && npm run build && cd ..
   ```

2. **Configure environment variables in docker-compose.yml:**
   ```yaml
   environment:
     - ADVERTISED_HOST=your-ip-address
     - BASE_URL=http://your-ip-address:3000
   ```

3. **Deploy:**
   ```bash
   docker-compose build --no-cache
   docker-compose up -d
   ```

### Quick Commands

```bash
# Stop services
docker-compose -f docker-local.yml down

# View logs
docker logs plextv

# Restart services
docker-compose -f docker-local.yml restart

# Update and redeploy
docker-compose -f docker-local.yml down
docker-compose -f docker-local.yml build --no-cache
docker-compose -f docker-local.yml up -d
```

## Remote Deployment with Portainer

### Universal Deployment Method (Works from Any Repository)

The Dockerfile now automatically builds the client during container build, making it compatible with any repository state.

**Portainer Deployment:**
1. Open Portainer web interface
2. Navigate to **Stacks** → **Add Stack**
3. Choose **Repository** deployment method
4. Enter your repository URL and branch
5. Set **Compose file path** to `docker-compose.yml`
6. Configure environment variables:
   ```
   ADVERTISED_HOST=your-server-ip
   BASE_URL=http://your-server-ip:3000
   ```
7. Click **Deploy the stack**

**Build Time:** Approximately 3-5 minutes (includes client build)

### Alternative: Local Pre-build for Faster Deployment

If you want faster builds and have already built the client locally:

1. **Temporarily modify Dockerfile** for pre-built client:
   ```dockerfile
   # Replace the client build section with:
   COPY client/build/ ./client/build/
   ```

2. **Build and commit client:**
   ```bash
   cd client && npm run build && cd ..
   git add client/build/
   git commit -m "Add pre-built client"
   git push
   ```

3. **Deploy via Portainer** (same steps as above)
   - **Build time:** ~1 minute

### Option 3: Manual Stack Creation

1. In Portainer, go to **Stacks** → **Add Stack**
2. Choose **Web editor**
3. Paste your docker-compose.yml content
4. Configure environment variables
5. Deploy

## Configuration Options

### Network Configuration

#### Basic Configuration (docker-local.yml)
```yaml
environment:
  - HOST_IP=0.0.0.0                    # Bind to all interfaces
  - HTTP_PORT=3000                     # Main HTTP port
  - ADVERTISED_HOST=192.168.4.56       # Your server IP
  - BASE_URL=http://192.168.4.56:3000  # Complete URL
```

#### Advanced Configuration
```yaml
environment:
  # Network
  - HOST_IP=0.0.0.0
  - HTTP_PORT=3000
  - STREAM_PORT=3000
  - DISCOVERY_PORT=1900
  - ADVERTISED_HOST=your-domain.com
  - BASE_URL=http://your-domain.com:3000
  
  # Database
  - DB_POOL_SIZE=5
  - DB_BUSY_TIMEOUT=5000
  - DB_WAL_MODE=true
  
  # Performance
  - WS_PING_INTERVAL=25000
  - WS_PING_TIMEOUT=20000
```

### Port Mapping Examples

#### Default (Port 3000)
```yaml
ports:
  - "3000:3000"      # HTTP
  - "1900:1900/udp"  # SSDP Discovery
```

#### Custom Port (Port 8080)
```yaml
ports:
  - "8080:3000"      # HTTP mapped to 8080
  - "1900:1900/udp"  # SSDP Discovery
environment:
  - HTTP_PORT=3000   # Internal port (keep as 3000)
  - BASE_URL=http://your-ip:8080  # External URL
```

### Volume Configuration

#### Basic Data Persistence
```yaml
volumes:
  - plextv_data:/data                    # Application data
  - ./config:/app/config:ro              # Configuration files
```

#### Development Setup
```yaml
volumes:
  - plextv_data:/data
  - ./config:/app/config:ro
  - ./data:/host-data                    # Access to data from host
  - ./server:/app/server                 # Live server code updates
```

## Troubleshooting

### Common Issues

#### 1. Build Fails - "client/build not found"
**Problem:** Pre-built client directory missing
**Solution:**
```bash
cd client
npm install
npm run build
cd ..
# Then rebuild container
```

#### 2. Build Takes Too Long (5+ minutes)
**Problem:** Building client during Docker build
**Solution:** Use pre-built client approach (see Method 1)

#### 3. Container Starts but UI Not Accessible
**Problem:** Port mapping or firewall issues
**Checks:**
```bash
docker ps  # Verify port mapping
curl http://localhost:3000/health  # Test locally
```
**Solutions:**
- Check firewall settings
- Verify ADVERTISED_HOST matches your IP
- Ensure ports aren't already in use

#### 4. Permission Errors in Logs
**Problem:** File permission issues in container
**Solution:** Rebuild with `--no-cache`:
```bash
docker-compose -f docker-local.yml build --no-cache
```

#### 5. SSL Errors During Build
**Problem:** npm SSL issues in Alpine Linux
**Solution:** Already handled in Dockerfile with:
```dockerfile
npm config set strict-ssl false
```

### Performance Issues

#### Slow Build Times
- Use pre-built client approach
- Enable Docker BuildKit: `export DOCKER_BUILDKIT=1`
- Use multi-stage builds for larger deployments

#### Runtime Performance
- Allocate sufficient memory (4GB+ recommended)
- Use SSD storage for data volume
- Monitor container resources: `docker stats plextv`

## Performance Optimization

### Build Performance
1. **Pre-build client locally** - Reduces build time from 5+ minutes to ~45 seconds
2. **Use .dockerignore** - Excludes unnecessary files from build context
3. **Layer optimization** - Dockerfile layers are ordered for optimal caching

### Runtime Performance
1. **Database optimization:**
   ```yaml
   environment:
     - DB_WAL_MODE=true              # Better concurrent access
     - DB_CHECKPOINT_INTERVAL=1000   # Regular checkpoints
   ```

2. **Memory settings:**
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G
       reservations:
         memory: 1G
   ```

### Monitoring

#### Health Checks
```bash
# Check application health
curl http://localhost:3000/health

# View detailed logs
docker logs plextv --tail 50 -f

# Monitor resource usage
docker stats plextv
```

#### Log Management
```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

## Security Considerations

### Production Deployment
1. **Change default passwords** in configuration
2. **Use reverse proxy** (nginx, traefik) for SSL termination
3. **Limit network exposure** - only expose necessary ports
4. **Regular updates** - keep base image and dependencies updated

### Network Security
```yaml
# Example with network restrictions
networks:
  plextv-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

## Example Configurations

### Minimal Local Development
```yaml
services:
  plextv:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - NODE_ENV=development
```

### Production with Custom Domain
```yaml
services:
  plextv:
    build: .
    ports:
      - "80:3000"
    volumes:
      - plextv_data:/data
      - ./config:/app/config:ro
    environment:
      - NODE_ENV=production
      - ADVERTISED_HOST=plextv.yourdomain.com
      - BASE_URL=http://plextv.yourdomain.com
    restart: unless-stopped
```

---

## Quick Reference

### Essential Commands
```bash
# Build and deploy locally
docker-compose -f docker-local.yml up -d --build

# Stop services
docker-compose -f docker-local.yml down

# View logs
docker logs plextv -f

# Health check
curl http://localhost:3000/health

# Container shell access
docker exec -it plextv /bin/bash
```

### Default URLs
- **Web Interface:** http://localhost:3000
- **Health Check:** http://localhost:3000/health
- **API Base:** http://localhost:3000/api

### Support
For issues and questions:
1. Check the logs: `docker logs plextv`
2. Verify health status: `curl http://localhost:3000/health`
3. Review this documentation
4. Check the main project README.md
