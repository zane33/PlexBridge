# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies including FFmpeg, Redis, and streaming tools
RUN apk add --no-cache \
    ffmpeg \
    gstreamer \
    gst-plugins-base \
    gst-plugins-good \
    gst-plugins-bad \
    gst-plugins-ugly \
    gst-libav \
    rtmpdump \
    stunnel \
    socat \
    curl \
    bash \
    tini \
    redis \
    supervisor \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S plextv && \
    adduser -S plextv -u 1001 -G plextv

# Create data directories and Redis directory with proper permissions
RUN mkdir -p /data/database /data/cache /data/logs /data/logos /var/lib/redis && \
    chown -R plextv:plextv /data && \
    chown -R plextv:plextv /var/lib/redis && \
    chmod -R 755 /data

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY server/ ./server/
COPY config/ ./config/

# Copy and build React frontend
COPY client/package*.json ./client/
RUN cd client && npm config set strict-ssl false && \
    npm install --legacy-peer-deps --force && \
    npm config set strict-ssl true

COPY client/ ./client/
RUN cd client && npm run build && \
    rm -rf node_modules src public && \
    npm cache clean --force

# Create supervisor configuration
COPY supervisord.conf /etc/supervisord.conf

# Copy startup scripts and make executable
COPY start.sh /app/start.sh
COPY run-server.sh /app/run-server.sh
RUN chmod +x /app/start.sh /app/run-server.sh

# Set ownership of application files
RUN chown -R plextv:plextv /app

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

# Expose ports (default values, can be overridden with environment variables)
EXPOSE 8080 1900/udp

# Volume for persistent data
VOLUME ["/data"]

# Run as root for supervisord
# The individual programs will run as plextv user as configured in supervisord.conf

# Use tini as init system  
ENTRYPOINT ["/sbin/tini", "--"]

# Start supervisord to manage Redis and the Node.js application
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
