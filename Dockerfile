# Use Node.js 20 Alpine as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk update && apk add --no-cache \
    curl \
    bash \
    tini \
    sqlite \
    make \
    gcc \
    g++ \
    python3 \
    ffmpeg \
    redis \
    supervisor

# Create non-root user
RUN addgroup -g 1001 -S plextv && \
    adduser -S plextv -u 1001 -G plextv

# Create data directories
RUN mkdir -p /data/database /data/cache /data/logs /data/logos /var/lib/redis && \
    chown -R plextv:plextv /data && \
    chown -R plextv:plextv /var/lib/redis

# Copy package files
COPY package*.json ./

# Install dependencies with npm configuration
RUN npm config set registry https://registry.npmjs.org/ && \
    npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy application code
COPY server/ ./server/
COPY config/ ./config/

# Copy and build client
COPY client/ ./client/
RUN cd client && \
    npm install --ignore-scripts && \
    npm run build && \
    rm -rf node_modules src public

# Copy configuration files
COPY supervisord.conf /etc/supervisord.conf
COPY start.sh /app/start.sh
COPY run-server.sh /app/run-server.sh
COPY verify-database.sh /app/verify-database.sh
COPY fix-permissions.sh /app/fix-permissions.sh

# Set permissions
RUN chmod +x /app/start.sh /app/run-server.sh /app/verify-database.sh /app/fix-permissions.sh && \
    chown -R plextv:plextv /app

# Environment variables
ENV NODE_ENV=production \
    HOST_IP=0.0.0.0 \
    HTTP_PORT=8080 \
    STREAM_PORT=8080 \
    DISCOVERY_PORT=1900 \
    PORT=8080 \
    DB_PATH=/data/database/plextv.db \
    LOG_PATH=/data/logs \
    CACHE_PATH=/data/cache \
    LOGOS_PATH=/data/logos

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${HTTP_PORT:-8080}/health || exit 1

# Expose ports
EXPOSE 8080 1900/udp

# Volume for persistent data
VOLUME ["/data"]

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start supervisord
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
