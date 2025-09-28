# Channel Mapper EPG Program Count Fix

## Issue Summary

The channel mapper interface at `192.168.3.148:3000` was showing **0 programs** for many channels despite EPG data being successfully stored in the database. This was preventing users from seeing program counts and mapping channels properly.

## Root Cause Analysis

### Problem Identified
The `/api/epg/channels` endpoint in `server/production-server.js` was returning a simple array of EPG channels:

```javascript
// BEFORE (Incorrect)
app.get('/api/epg/channels', async (req, res) => {
  const channels = await database.all('SELECT * FROM epg_channels ORDER BY display_name');
  res.json(channels || []);
});
```

### Frontend Expectations
The Channel Manager component (`client/src/components/ChannelManager/ChannelManager.js`) expected:

1. **Response Structure**: `{ available_channels: [...] }` object, not a simple array
2. **Program Count Field**: Each channel should have a `program_count` field
3. **Proper Field Mapping**: Channels should have both `epg_id` and `channel_name` fields

## Solution Implemented

### Updated API Endpoint
Modified `/api/epg/channels` endpoint to include:

1. **JOIN Query**: Links `epg_channels` with `epg_programs` to count programs per channel
2. **Proper Response Structure**: Returns object with `available_channels` array
3. **Field Mapping**: Maps database fields to frontend expected format

```javascript
// AFTER (Fixed)
app.get('/api/epg/channels', async (req, res) => {
  try {
    // Get EPG channels with program counts
    const channelsWithCounts = await database.all(`
      SELECT
        ec.*,
        COUNT(ep.id) as program_count,
        es.name as source_name,
        es.id as source_id
      FROM epg_channels ec
      LEFT JOIN epg_programs ep ON ec.id = ep.channel_id
      LEFT JOIN epg_sources es ON ec.source_id = es.id
      GROUP BY ec.id
      ORDER BY ec.display_name
    `);

    // Format the response to match what the frontend expects
    const formattedChannels = channelsWithCounts.map(ch => ({
      epg_id: ch.id,
      channel_name: ch.display_name || ch.id,
      program_count: parseInt(ch.program_count) || 0,
      source_name: ch.source_name || 'Unknown Source',
      source_id: ch.source_id,
      icon_url: ch.icon_url,
      // Include original fields for compatibility
      id: ch.id,
      display_name: ch.display_name,
      created_at: ch.created_at,
      updated_at: ch.updated_at
    }));

    // Return in the format expected by the frontend
    res.json({
      available_channels: formattedChannels,
      total_channels: formattedChannels.length,
      total_programs: formattedChannels.reduce((sum, ch) => sum + ch.program_count, 0)
    });
  } catch (error) {
    console.error('Error fetching EPG channels:', error);
    res.json({
      available_channels: [],
      total_channels: 0,
      total_programs: 0
    });
  }
});
```

## API Response Format

### Before (Incorrect)
```json
[
  {
    "id": "cnn-hd",
    "display_name": "CNN HD",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### After (Correct)
```json
{
  "available_channels": [
    {
      "epg_id": "cnn-hd",
      "channel_name": "CNN HD",
      "program_count": 247,
      "source_name": "Main EPG Source",
      "source_id": "xmltv-source-1",
      "icon_url": "https://example.com/cnn.png",
      "id": "cnn-hd",
      "display_name": "CNN HD",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total_channels": 1,
  "total_programs": 247
}
```

## Testing Performed

### 1. API Structure Test
- ✅ Created mock test server (`test-api-structure.js`)
- ✅ Verified correct response structure
- ✅ Confirmed `program_count` field is included
- ✅ Validated frontend compatibility

### 2. Test Results
```
✅ API Test Results:
   - Response structure: CORRECT
   - Total channels: 3
   - Total programs: 445
   - Sample channel with program_count: YES
   - Correct structure for Channel Manager: ✅ YES
```

## Deployment Instructions

### For Production Environment (192.168.3.148:3000)

1. **Update Production Server**:
   ```bash
   # Copy the updated production-server.js to production
   scp server/production-server.js user@192.168.3.148:/path/to/plexbridge/server/
   ```

2. **Restart Production Server**:
   ```bash
   # On production server
   sudo systemctl restart plexbridge
   # OR if using PM2
   pm2 restart plexbridge
   # OR if running manually
   pkill -f production-server.js
   node server/production-server.js
   ```

3. **Verify Fix**:
   ```bash
   # Test the API endpoint
   curl http://192.168.3.148:3000/api/epg/channels

   # Should return JSON with available_channels array
   # and program_count for each channel
   ```

## Expected Results After Fix

1. **Channel Mapper Interface**: Will show actual program counts instead of 0
2. **EPG Channel Dropdown**: Will display channels with their program counts
3. **Mapping Interface**: Users can see which channels have EPG data available
4. **Status Indicators**: Channels will show proper status based on program availability

## Files Modified

- `/server/production-server.js` - Updated `/api/epg/channels` endpoint
- `/test-api-structure.js` - Created for testing (can be removed after verification)

## Verification Steps for Production

After deploying to production, verify:

1. **API Endpoint**: `GET http://192.168.3.148:3000/api/epg/channels`
2. **Channel Mapper**: Access web interface and check EPG mapping section
3. **Program Counts**: Verify channels show actual program counts, not 0
4. **Console Logs**: Check for any database errors in server logs

## Rollback Plan

If issues occur, rollback by reverting the `/api/epg/channels` endpoint to:

```javascript
app.get('/api/epg/channels', async (req, res) => {
  try {
    const channels = await database.all('SELECT * FROM epg_channels ORDER BY display_name');
    res.json(channels || []);
  } catch (error) {
    console.error('Error fetching EPG channels:', error);
    res.json([]);
  }
});
```

---

**Fix Status**: ✅ Ready for Production Deployment
**Tested**: ✅ API structure verified with mock data
**Risk Level**: 🟢 Low (only affects channel mapper display, no data changes)