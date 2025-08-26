# Enhanced Channel and Stream Deletion API

## Overview

The PlexBridge application has been enhanced with sophisticated deletion endpoints that provide detailed relationship management between channels and streams. These endpoints allow frontend applications to present users with comprehensive information about what will be affected by deletion operations and offer multiple deletion strategies.

## Enhanced Endpoints

### Channel Deletion: `DELETE /api/channels/:id`

Enhanced to support relationship-aware deletion with multiple strategies for handling associated streams.

#### Query Parameters

- `checkOnly=true`: Returns detailed information about what would be affected without performing any deletion
- `deleteStreams=true`: Deletes the channel and all associated streams
- `deleteStreams=false`: Deletes the channel but deallocates streams (sets channel_id to NULL)

#### Response Formats

**Check-Only Response** (`?checkOnly=true`):
```json
{
  "channel": {
    "id": "channel-uuid",
    "name": "Channel Name",
    "number": 999,
    "enabled": 1,
    "logo": "logo-url",
    "epg_id": "epg-id",
    "created_at": "timestamp",
    "updated_at": "timestamp"
  },
  "associatedStreams": [
    {
      "id": "stream-uuid",
      "channel_id": "channel-uuid", 
      "name": "Stream Name",
      "url": "stream-url",
      "type": "hls",
      "enabled": 1,
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "impact": {
    "channelWillBeDeleted": true,
    "streamsCount": 1,
    "streamsWillBeDeleted": false,
    "streamsWillBeDeallocated": true
  },
  "options": {
    "deleteStreams": "Delete channel and all associated streams",
    "deallocateStreams": "Delete channel but keep streams (unassign from channel)"
  }
}
```

**Actual Deletion Response**:
```json
{
  "message": "Channel deleted successfully",
  "channelId": "channel-uuid",
  "channelName": "Channel Name",
  "channelDeleted": true,
  "streamsDeleted": 0,
  "streamsDeallocated": 1,
  "associatedStreams": [
    {
      "id": "stream-uuid",
      "name": "Stream Name"
    }
  ]
}
```

### Stream Deletion: `DELETE /api/streams/:id`

Enhanced to support channel relationship management and cascade deletion options.

#### Query Parameters

- `checkOnly=true`: Returns detailed information about what would be affected without performing any deletion
- `deleteChannel=true`: Deletes the stream and its associated channel (plus any other streams on that channel)
- `deleteChannel=false`: Deletes only the stream, keeping the channel

#### Response Formats

**Check-Only Response** (`?checkOnly=true`):
```json
{
  "stream": {
    "id": "stream-uuid",
    "name": "Stream Name",
    "url": "stream-url", 
    "channel_id": "channel-uuid",
    "channel_name": "Channel Name",
    "channel_number": 999
  },
  "associatedChannel": {
    "id": "channel-uuid",
    "name": "Channel Name",
    "number": 999,
    "enabled": 1,
    "logo": "logo-url",
    "epg_id": "epg-id",
    "created_at": "timestamp",
    "updated_at": "timestamp"
  },
  "otherStreamsOnChannel": [
    {
      "id": "other-stream-uuid",
      "channel_id": "channel-uuid",
      "name": "Other Stream Name",
      "url": "other-stream-url",
      "type": "hls",
      "enabled": 1,
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "impact": {
    "streamWillBeDeleted": true,
    "hasAssociatedChannel": true,
    "otherStreamsOnChannelCount": 1,
    "channelWillBeDeleted": false
  },
  "options": {
    "keepChannel": "Delete stream but keep channel \"Channel Name\" (1 other streams)",
    "deleteChannel": "Delete stream and channel \"Channel Name\" (will also delete 1 other streams)"
  }
}
```

**Actual Deletion Response**:
```json
{
  "message": "Stream deleted successfully",
  "streamId": "stream-uuid",
  "streamName": "Stream Name", 
  "streamDeleted": true,
  "channelDeleted": false,
  "otherStreamsDeleted": 0,
  "associatedChannel": {
    "id": "channel-uuid",
    "name": "Channel Name",
    "number": 999
  },
  "otherStreamsAffected": []
}
```

## Database Schema Enhancements

The database schema has been enhanced to support proper foreign key constraints with cascading actions:

```sql
CREATE TABLE streams (
  id TEXT PRIMARY KEY,
  channel_id TEXT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'hls',
  -- ... other columns ...
  FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE SET NULL
);
```

**Key improvements:**
- Foreign key constraints are now enabled (`PRAGMA foreign_keys = ON`)
- `ON DELETE SET NULL` action automatically deallocates streams when channels are deleted
- Proper relationship validation prevents orphaned references

## Frontend Integration Patterns

### Channel Deletion Flow

```javascript
// 1. Check what would be affected
const checkResponse = await fetch(`/api/channels/${channelId}?checkOnly=true`, {
  method: 'DELETE'
});
const { channel, associatedStreams, impact, options } = await checkResponse.json();

// 2. Present confirmation dialog to user
if (associatedStreams.length > 0) {
  const userChoice = await showConfirmDialog({
    title: `Delete channel "${channel.name}"?`,
    message: `This channel has ${impact.streamsCount} associated streams.`,
    options: [
      { value: 'cancel', label: 'Cancel' },
      { value: 'deallocate', label: options.deallocateStreams },
      { value: 'delete', label: options.deleteStreams }
    ]
  });
  
  if (userChoice === 'cancel') return;
  
  // 3. Perform actual deletion
  const deleteResponse = await fetch(`/api/channels/${channelId}?deleteStreams=${userChoice === 'delete'}`, {
    method: 'DELETE'
  });
  
  const result = await deleteResponse.json();
  showNotification(`Channel deleted. ${result.streamsDeleted} streams deleted, ${result.streamsDeallocated} streams deallocated.`);
}
```

### Stream Deletion Flow

```javascript
// 1. Check what would be affected
const checkResponse = await fetch(`/api/streams/${streamId}?checkOnly=true`, {
  method: 'DELETE'
});
const { stream, associatedChannel, otherStreamsOnChannel, impact, options } = await checkResponse.json();

// 2. Present confirmation dialog
if (associatedChannel && otherStreamsOnChannel.length > 0) {
  const userChoice = await showConfirmDialog({
    title: `Delete stream "${stream.name}"?`,
    message: `This stream is associated with channel "${associatedChannel.name}" which has ${impact.otherStreamsOnChannelCount} other streams.`,
    options: [
      { value: 'cancel', label: 'Cancel' },
      { value: 'stream-only', label: options.keepChannel },
      { value: 'with-channel', label: options.deleteChannel }
    ]
  });
  
  if (userChoice === 'cancel') return;
  
  // 3. Perform actual deletion
  const deleteResponse = await fetch(`/api/streams/${streamId}?deleteChannel=${userChoice === 'with-channel'}`, {
    method: 'DELETE'
  });
  
  const result = await deleteResponse.json();
  showNotification(`Stream deleted. Channel deleted: ${result.channelDeleted}. Other streams affected: ${result.otherStreamsDeleted}.`);
}
```

## Error Handling

The enhanced endpoints provide comprehensive error handling:

### HTTP Status Codes

- `200`: Successful operation
- `404`: Channel or stream not found
- `409`: Conflict (foreign key constraints, relationship issues)
- `500`: Internal server error

### Error Response Format

```json
{
  "error": "Error message",
  "details": "Detailed error description",
  "suggestion": "Suggested resolution (when applicable)"
}
```

### Common Error Scenarios

1. **Channel Not Found**: Returns 404 with clear error message
2. **Stream Not Found**: Returns 404 with clear error message  
3. **Foreign Key Constraint**: Returns 409 with guidance on resolution
4. **Database Connection**: Returns 500 with appropriate error details

## Cache Management

Both endpoints automatically handle cache invalidation:

- **Channel deletion**: Clears `lineup:channels` cache
- **Stream deletion**: Clears individual stream caches (`stream:{id}`)
- **Relationship changes**: Updates relevant cached data

## Logging and Monitoring

Enhanced deletion operations are comprehensively logged:

```javascript
logger.info('Channel deleted successfully', { 
  channelId, 
  deleteStreams: deleteStreams === 'true',
  streamsAffected: associatedStreams.length,
  channelDeleted: true,
  streamsDeleted: 2,
  streamsDeallocated: 0
});
```

## Testing Scenarios

The enhanced API has been thoroughly tested with the following scenarios:

1. ✅ **Channel with no streams**: Direct deletion
2. ✅ **Channel with streams (deallocate)**: Channel deleted, streams unassigned
3. ✅ **Channel with streams (cascade delete)**: Channel and streams deleted
4. ✅ **Stream with no channel**: Direct deletion
5. ✅ **Stream with channel (keep channel)**: Stream deleted, channel preserved
6. ✅ **Stream with channel (delete channel)**: Stream and channel deleted
7. ✅ **Stream with sibling streams**: Proper handling of related streams
8. ✅ **Multiple streams cascade deletion**: All related streams deleted

## Security Considerations

- **Input validation**: All parameters are validated and sanitized
- **Authorization**: Endpoints respect existing authentication/authorization
- **Rate limiting**: Existing rate limiting applies to enhanced endpoints
- **SQL injection**: Uses parameterized queries for all database operations
- **Error disclosure**: Development vs production error message handling

## Performance Impact

The enhancements are designed for minimal performance impact:

- **Single database queries**: Efficient relationship detection
- **Batch operations**: Bulk deletions use batch operations when possible
- **Cache efficiency**: Strategic cache invalidation minimizes overhead
- **Connection reuse**: Uses existing database connection pooling

## Migration Notes

For existing deployments:

1. **Database schema**: Foreign key constraints require fresh database or migration
2. **Backward compatibility**: Enhanced endpoints maintain backward compatibility for basic deletion
3. **Client updates**: Frontend applications can gradually adopt enhanced features
4. **Testing**: Comprehensive testing recommended before production deployment

## Future Enhancements

Potential future improvements:

1. **Bulk operations**: Support for deleting multiple channels/streams
2. **Soft deletion**: Temporary deletion with restore capability  
3. **Audit logging**: Detailed audit trails for deletion operations
4. **Async operations**: Background processing for large deletion operations
5. **Rollback capability**: Transaction-based rollback for complex operations

## Conclusion

The enhanced deletion API provides a robust foundation for relationship-aware deletion operations in the PlexBridge application. It offers users clear visibility into the impact of their actions while providing flexible deletion strategies to meet different use cases.

The implementation prioritizes data integrity, user experience, and system reliability while maintaining performance and security standards.