# Stream Preview Architecture Optimizations

## Executive Summary

This document outlines comprehensive optimizations made to the PlexBridge stream preview functionality to address critical production issues including database inconsistency, resource management, security vulnerabilities, and performance bottlenecks.

## Issues Identified and Resolved

### 1. **Database Architecture Inconsistency** 
**Issue**: The `complete-server.js` was using in-memory storage (`streams` array) while proper SQLite database services existed but weren't integrated.

**Resolution**: 
- Created `StreamPreviewService` class that integrates with the existing database service
- Implemented database-first approach with in-memory fallback for backwards compatibility
- Enhanced data persistence and consistency across server restarts

### 2. **Resource Management and Memory Leaks**
**Issue**: FFmpeg transcoding processes weren't properly managed, leading to potential memory leaks and resource exhaustion.

**Resolution**:
- Implemented comprehensive process lifecycle management
- Added proper cleanup for FFmpeg processes with graceful (SIGTERM) and forced (SIGKILL) termination
- Added periodic cleanup of stale transcoding sessions
- Implemented memory usage monitoring with threshold-based warnings

### 3. **Concurrency Control**
**Issue**: No limits on simultaneous transcoding processes could exhaust system resources.

**Resolution**:
- Added configurable concurrency limits (default: 3 concurrent transcoding sessions)
- Implemented queuing mechanism for overflow requests
- Added per-client session tracking to prevent resource hogging
- Real-time monitoring of active transcoding sessions

### 4. **Error Handling and Logging**
**Issue**: Limited error recovery and insufficient logging for production troubleshooting.

**Resolution**:
- Enhanced error handling with specific error types and recovery strategies
- Structured logging with contextual information for debugging
- Proper HTTP status codes and user-friendly error messages
- Comprehensive error boundaries and graceful degradation

### 5. **Stream Format Detection**
**Issue**: Simplistic format detection that could fail with complex IPTV sources.

**Resolution**:
- Integration with existing `StreamManager` class for comprehensive format detection
- Support for all major IPTV protocols (HLS, DASH, RTSP, RTMP, UDP, HTTP, MMS, SRT)
- Enhanced content-type detection and protocol-specific handling
- Fallback mechanisms for unknown formats

## New Features Implemented

### Enhanced Stream Preview Service (`services/streamPreviewService.js`)

**Key Features**:
- **Database Integration**: Seamless integration with SQLite database
- **Advanced Transcoding**: Optimized FFmpeg parameters for web compatibility
- **Resource Management**: Automatic cleanup and memory monitoring
- **Concurrency Control**: Configurable limits and queue management
- **Format Detection**: Universal IPTV protocol support
- **Session Tracking**: Per-client and per-stream session management

**Configuration Options**:
```javascript
{
  maxConcurrentTranscodes: 3,
  transcodingTimeout: 30000,
  qualityProfiles: {
    low: { resolution: '720x480', bitrate: '1000k' },
    medium: { resolution: '1280x720', bitrate: '2500k' },
    high: { resolution: '1920x1080', bitrate: '5000k' }
  }
}
```

### Production Health Monitoring

**Enhanced Health Checks**:
- `/health` - Comprehensive system health with service-level status
- `/ready` - Kubernetes readiness probe
- `/live` - Kubernetes liveness probe
- `/api/streams/transcoding/status` - Real-time transcoding metrics

**Health Check Response Example**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "version": "2.0.0",
  "responseTime": 15,
  "environment": "production",
  "services": {
    "database": {
      "status": "healthy",
      "connected": true,
      "responseTime": 5
    },
    "transcoding": {
      "status": "healthy",
      "activeSessions": 2,
      "maxConcurrent": 3
    },
    "memory": {
      "status": "healthy",
      "usage": {
        "rss": 128,
        "heapUsed": 89,
        "heapTotal": 150,
        "external": 12
      }
    }
  }
}
```

### Enhanced Stream Validation

**Features**:
- Comprehensive stream connectivity testing
- Protocol-specific validation (HLS, DASH, RTSP, etc.)
- Authentication support
- Timeout handling
- Detailed validation feedback

## Security Improvements

### 1. **Input Validation**
- URL format validation
- SQL injection prevention with parameterized queries
- Request timeout enforcement
- Resource limit enforcement

### 2. **Process Security**
- FFmpeg process isolation
- Limited process permissions
- Automatic process termination
- Resource usage monitoring

### 3. **Error Information Disclosure**
- Safe error messages for client responses
- Detailed logging for server-side debugging
- No sensitive information in client responses

## Performance Optimizations

### 1. **FFmpeg Configuration**
**Optimized Parameters**:
```bash
-preset veryfast           # Real-time encoding priority
-profile:v baseline        # Maximum compatibility
-level 3.1                 # Broad device support
-threads 2                 # CPU usage control
-rtbufsize 100M           # Real-time buffer optimization
-max_muxing_queue_size 1024 # Prevent buffer overflow
```

### 2. **Database Operations**
- Connection pooling through service singleton
- Optimized queries with proper indexing
- Transaction support for data consistency
- WAL mode for concurrent access

### 3. **Memory Management**
- Process cleanup automation
- Memory usage thresholds
- Garbage collection optimization
- Resource monitoring

## Production Deployment Considerations

### 1. **Docker Integration**
- Health check endpoints for container orchestration
- Graceful shutdown handling
- Resource limit compliance
- Multi-stage build optimization

### 2. **Monitoring and Alerting**
- Real-time metrics endpoints
- Structured logging for log aggregation
- Performance metrics collection
- Error rate monitoring

### 3. **Scalability**
- Horizontal scaling support
- Load balancing compatibility
- Session affinity considerations
- Resource pooling

## Configuration Management

### Environment Variables
```bash
# Transcoding Configuration
MAX_CONCURRENT_TRANSCODES=3
TRANSCODE_TIMEOUT=30000
TRANSCODE_QUALITY_PROFILE=medium

# Database Configuration  
DB_PATH=/data/database/plextv.db
DB_POOL_SIZE=10

# FFmpeg Configuration
FFMPEG_PATH=/usr/bin/ffmpeg
FFMPEG_PRESET=veryfast
FFMPEG_THREADS=2

# Memory Management
MEMORY_WARNING_THRESHOLD=512MB
MEMORY_CRITICAL_THRESHOLD=1GB
```

### Quality Profiles
```json
{
  "low": {
    "resolution": "720x480",
    "bitrate": "1000k",
    "preset": "ultrafast"
  },
  "medium": {
    "resolution": "1280x720", 
    "bitrate": "2500k",
    "preset": "veryfast"
  },
  "high": {
    "resolution": "1920x1080",
    "bitrate": "5000k", 
    "preset": "fast"
  }
}
```

## API Documentation

### Stream Preview Endpoint
```
GET /streams/preview/:streamId?transcode=true&quality=medium&timeout=30000
```

**Parameters**:
- `streamId`: Stream identifier (required)
- `transcode`: Force transcoding (optional, boolean)
- `quality`: Transcoding quality profile (optional, default: medium)
- `timeout`: Request timeout in milliseconds (optional, default: 30000)

**Response Headers**:
- `Content-Type`: Video mime type based on stream format
- `Access-Control-Allow-Origin`: CORS support
- `Cache-Control`: Caching directives

### Transcoding Status Endpoint
```
GET /api/streams/transcoding/status
```

**Response**:
```json
{
  "activeSessions": 2,
  "maxConcurrent": 3,
  "utilizationPercentage": 67,
  "sessions": [
    {
      "sessionId": "transcode_123_1640995200000_abc123",
      "streamId": "stream_123",
      "startTime": 1640995200000,
      "duration": 30000,
      "clientIP": "192.168.1.100",
      "quality": "medium",
      "pid": 12345
    }
  ]
}
```

## Testing and Validation

### Unit Tests
- Stream format detection
- Database integration
- Error handling scenarios
- Concurrency control

### Integration Tests  
- End-to-end stream preview workflow
- Database persistence verification
- FFmpeg process management
- Health check functionality

### Performance Tests
- Concurrent transcoding load
- Memory usage under stress
- Database query performance
- Error recovery scenarios

## Migration Guide

### From Legacy Implementation
1. **Database Migration**: Existing in-memory streams will be automatically migrated to database on first startup
2. **API Compatibility**: All existing endpoints remain functional with enhanced features
3. **Configuration**: New configuration options are optional with sensible defaults
4. **Monitoring**: New health endpoints can be added to monitoring systems

### Rollback Strategy
- In-memory fallback mode for database failures
- Legacy transcoding function preserved for compatibility
- Graceful degradation of enhanced features
- Configuration-driven feature toggles

## Best Practices

### 1. **Resource Management**
- Monitor memory usage regularly
- Set appropriate concurrency limits based on hardware
- Implement log rotation for long-running instances
- Use health checks for container orchestration

### 2. **Security**
- Validate all stream URLs before processing
- Implement rate limiting for API endpoints  
- Monitor FFmpeg process resource usage
- Use secure container configurations

### 3. **Performance**
- Choose appropriate quality profiles for use case
- Monitor transcoding session duration
- Optimize FFmpeg parameters for hardware
- Use caching for frequently accessed streams

### 4. **Monitoring**
- Set up alerts for service health degradation
- Monitor transcoding success/failure rates
- Track memory and CPU usage trends
- Log stream access patterns for optimization

## Conclusion

The implemented optimizations provide a production-ready, scalable, and maintainable stream preview system that addresses all identified architectural issues. The enhancements ensure:

- **Reliability**: Robust error handling and recovery mechanisms
- **Performance**: Optimized resource usage and concurrency control
- **Maintainability**: Clean architecture with proper separation of concerns
- **Observability**: Comprehensive monitoring and logging capabilities
- **Scalability**: Horizontal scaling support and resource management

The system is now ready for production deployment with enterprise-grade reliability and performance characteristics.