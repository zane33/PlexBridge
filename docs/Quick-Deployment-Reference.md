# PlexBridge Quick Deployment Reference

## 🚀 Fast Track Deployment

### Local Development (Docker Desktop)
```bash
# 1. Build client
cd client && npm run build && cd ..

# 2. Deploy with docker-local.yml
docker-compose -f docker-local.yml up -d --build

# 3. Access application
open http://localhost:3000
```

### Portainer Deployment
```bash
# No preparation needed! Dockerfile builds client automatically.

# In Portainer:
# - Stacks → Add Stack → Repository
# - Use docker-compose.yml
# - Set environment variables:
#   ADVERTISED_HOST=your-server-ip
#   BASE_URL=http://your-server-ip:3000
# Build time: ~3-5 minutes (includes client build)
```

## ⚡ Quick Commands

```bash
# Stop
docker-compose -f docker-local.yml down

# Logs
docker logs plextv -f

# Health
curl http://localhost:3000/health

# Rebuild
docker-compose -f docker-local.yml build --no-cache

# Shell access
docker exec -it plextv /bin/bash
```

## 🔧 Common Fixes

| Problem | Solution |
|---------|----------|
| "client/build not found" | `cd client && npm run build` |
| Slow build (5+ min) | Use pre-built client method |
| UI not accessible | Check ports, firewall, ADVERTISED_HOST |
| Permission errors | Rebuild with `--no-cache` |

## 📍 Default URLs
- **Web UI:** http://localhost:3000
- **Health:** http://localhost:3000/health
- **API:** http://localhost:3000/api

## 🎯 Build Times
- **With pre-built client:** ~45 seconds
- **Building client in Docker:** ~5 minutes
- **Recommended:** Always pre-build client locally

---
*For detailed instructions, see [Docker-Deployment-Guide.md](./Docker-Deployment-Guide.md)*
