# Persistent Consumer Tracking System

## Overview

PlexBridge now includes a comprehensive persistent consumer tracking system that emulates HDHomeRun device behavior to prevent "Failed to find consumer" errors in Plex. This system maintains consumer session data across application restarts and provides detailed lifecycle management.

## Architecture

### Consumer Manager Service (`/server/services/consumerManager.js`)

The `ConsumerManager` class provides:
- **SQLite-backed persistence** for consumer session data
- **In-memory caching** for fast access
- **Automatic cleanup** of stale consumer sessions
- **HDHomeRun-compatible API responses**

### Database Schema

```sql
CREATE TABLE consumers (
  id TEXT PRIMARY KEY,              -- Unique consumer ID (UUID)
  session_id TEXT NOT NULL,        -- Plex session identifier 
  channel_id TEXT,                 -- Associated channel (optional)
  stream_url TEXT,                 -- Source stream URL (optional)
  state TEXT DEFAULT 'idle',       -- Consumer state (streaming, paused, stopped)
  created_at INTEGER,              -- Creation timestamp
  updated_at INTEGER,              -- Last update timestamp  
  last_activity INTEGER,           -- Last activity timestamp
  user_agent TEXT,                 -- Client user agent
  client_ip TEXT,                  -- Client IP address
  metadata TEXT,                   -- Additional metadata (JSON)
  UNIQUE(session_id)
);
```

## Consumer States

| State | Description | Behavior |
|-------|-------------|----------|
| `streaming` | Actively streaming content | Normal operation |
| `buffering` | Buffering content | Temporary state |
| `paused` | Stream paused | Maintained but inactive |
| `stopped` | Consumer terminated | Marked for cleanup |
| `error` | Error condition | Marked for cleanup |

## API Integration

### Live TV Endpoints

#### GET `/Live/:sessionId`
Creates or updates a persistent consumer for the session:

```json
{
  "success": true,
  "sessionId": "abc123",
  "consumer": {
    "id": "uuid-here",
    "available": true,
    "active": true,
    "state": "streaming",
    "lastActivity": 1756954607638,
    "persistent": true,
    "createdAt": 1756954607638,
    "updatedAt": 1756954607638
  },
  "persistent": true
}
```

#### POST `/Live/:sessionId`
Same functionality as GET, handles POST requests from different Plex versions.

#### GET `/Live/:sessionId/:action`
Handles consumer actions and state changes:

- `stop`/`close` → Sets state to `stopped`
- `pause` → Sets state to `paused`  
- `play`/`resume` → Sets state to `streaming`
- Default → Sets state to `streaming`

### Consumer Statistics

#### GET `/consumers`
Returns detailed consumer statistics and active sessions:

```json
{
  "success": true,
  "statistics": {
    "total": 5,
    "active": 3,
    "streaming": 2,
    "buffering": 1,
    "paused": 0
  },
  "activeConsumers": [
    {
      "id": "uuid-here",
      "sessionId": "session-123",
      "state": "streaming",
      "lastActivity": 1756954607638,
      "uptime": 45231,
      "userAgent": "Plex/..."
    }
  ]
}
```

## Consumer Lifecycle

### Creation
1. Plex requests `/Live/:sessionId`
2. ConsumerManager checks for existing consumer
3. If not found, creates new persistent consumer with UUID
4. Stores in both memory cache and SQLite database
5. Returns consumer data to Plex

### Activity Updates
1. Each request updates `last_activity` timestamp
2. Memory cache updated immediately
3. Database updated asynchronously
4. State transitions tracked (streaming → paused → stopped)

### Cleanup Process
Automatic cleanup runs every 30 seconds:

1. **Stale Detection**: Consumers inactive for 10+ minutes
2. **State-based Cleanup**: Removes `stopped` and `error` consumers
3. **Memory Cleanup**: Syncs memory cache with database
4. **Database Cleanup**: Removes old entries

### Persistence Across Restarts
1. On startup, ConsumerManager loads active consumers from database
2. Only consumers active within last hour are restored
3. Stale consumers are automatically cleaned up
4. New requests create fresh consumer sessions

## Benefits

### For Plex Integration
- **Eliminates "Failed to find consumer" warnings**
- **Consistent HDHomeRun emulation**
- **Proper session lifecycle management**
- **Cross-restart session continuity**

### For Monitoring
- **Real-time consumer statistics**
- **Active session tracking**
- **Performance metrics collection**
- **Debug information for troubleshooting**

## Implementation Details

### Memory Management
- In-memory Map for fast lookups
- Database queries only for persistence operations
- Async database writes to prevent blocking
- Automatic memory cache invalidation

### Error Handling
- Graceful fallback on database errors
- Minimal consumer objects returned on failures
- Non-blocking operation for main application
- Comprehensive error logging

### Performance Optimizations
- Database indexes on session_id, state, and last_activity
- Prepared statements for common operations
- Background cleanup to prevent blocking
- Memory-first architecture with database persistence

## Configuration

### Cleanup Intervals
```javascript
// Cleanup runs every 30 seconds
this.cleanupInterval = setInterval(() => this.cleanupStaleConsumers(), 30000);

// Stale threshold: 10 minutes for database, 5 minutes for memory
const staleThreshold = 10 * 60; // seconds
const activeThreshold = 5 * 60 * 1000; // milliseconds
```

### Database Options
```javascript
// SQLite options for optimal performance
{
  pragma: {
    journal_mode: 'WAL',
    synchronous: 'NORMAL',
    cache_size: 1000,
    temp_store: 'MEMORY'
  }
}
```

## Testing

### Consumer Creation Test
```bash
curl "http://localhost:3000/Live/test-session-123"
# Should return consumer object with persistent: true
```

### Statistics Test
```bash
curl "http://localhost:3000/consumers"  
# Should show active consumer count and details
```

### Persistence Test
1. Create consumer session
2. Restart PlexBridge container
3. Check consumer statistics
4. Recently active consumers should be restored

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check SQLite file permissions
   - Verify disk space availability
   - Check database file corruption

2. **Memory Leaks**
   - Monitor consumer count growth
   - Check cleanup interval operation
   - Verify stale consumer removal

3. **Performance Issues**
   - Monitor database query times
   - Check memory cache hit rates
   - Verify index usage

### Debug Endpoints

```bash
# Check consumer statistics
GET /consumers

# Check specific consumer
GET /Live/:sessionId

# Monitor cleanup logs
docker logs -f container_name | grep "cleanup"
```

## Future Enhancements

### Planned Features
- Consumer bandwidth tracking
- Channel association improvements  
- Advanced metrics collection
- Consumer session replay
- Real-time WebSocket updates

### Monitoring Integration
- Prometheus metrics export
- Grafana dashboard templates
- Alert configuration examples
- Health check endpoints

## Migration Notes

### From Previous Versions
The consumer tracking system is backward compatible. Existing session managers continue to work alongside the new persistent consumer system.

### Database Migration
Consumer tables are created automatically on first startup. No manual migration required.

## Security Considerations

### Data Privacy
- Consumer data includes IP addresses and user agents
- Automatic cleanup prevents long-term data retention
- No sensitive authentication data stored

### Access Control
- Consumer statistics endpoint available to all clients
- No authentication required for consumer management
- Data limited to session metadata only

---

**Status**: ✅ **IMPLEMENTED** - Persistent consumer tracking is now active and resolving "Failed to find consumer" errors in Plex Live TV playback.