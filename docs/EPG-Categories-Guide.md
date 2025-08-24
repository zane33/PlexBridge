# EPG Categories Guide for Plex Integration

## Overview

PlexBridge now supports EPG (Electronic Program Guide) categories that are fully compatible with Plex Media Server's Live TV & DVR functionality. This feature allows you to categorize your IPTV content according to Plex's supported categories, enabling better organization, filtering, and user experience in Plex's Live TV interface.

## Table of Contents

1. [Plex-Supported Categories](#plex-supported-categories)
2. [How It Works](#how-it-works)
3. [Implementation Details](#implementation-details)
4. [Configuration](#configuration)
5. [XMLTV Output](#xmltv-output)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

## Plex-Supported Categories

Plex recognizes four primary content categories for Live TV:

- **News** - News channels and current affairs programming
- **Movie** - Movie channels and film-focused content
- **Series** - TV series, shows, and episodic content
- **Sports** - Sports channels and athletic events

These categories are used by Plex to:
- Filter content in the Program Guide
- Organize recordings
- Provide appropriate metadata handling
- Apply content-specific features (e.g., sports scores)

## How It Works

### Category Assignment Flow

```
EPG Source → Category Setting → Program Data → XMLTV Export → Plex Import
     ↓             ↓                 ↓              ↓              ↓
  [URL/File]   [News/Movie/     [Inherits      [<category>]   [Filtered
               Series/Sports]     Category]      XML Tag]       Views]
```

### Category Hierarchy

1. **Source Level**: Categories are set at the EPG source level
2. **Program Level**: All programs from a source inherit its category
3. **Channel Mapping**: Categories apply to all channels using that EPG source
4. **Plex Display**: Categories appear in Plex's Live TV guide filters

## Implementation Details

### Database Schema

The EPG sources table includes a `category` column:

```sql
CREATE TABLE epg_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    refresh_interval TEXT DEFAULT '4h',
    enabled INTEGER DEFAULT 1,
    category TEXT,  -- Stores: 'News', 'Movie', 'Series', 'Sports', or NULL
    last_refresh DATETIME,
    last_success DATETIME,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Backend API

The EPG source API validates categories using Joi schema:

```javascript
const epgSourceSchema = Joi.object({
  name: Joi.string().required().max(255),
  url: Joi.string().uri().required(),
  refresh_interval: Joi.string().pattern(/^\d+[hmd]$/).default('4h'),
  enabled: Joi.boolean().default(true),
  category: Joi.string()
    .valid('News', 'Movie', 'Series', 'Sports')
    .allow(null, '')
    .optional()
});
```

### Frontend UI

The EPG Manager component provides a dropdown selector:

```jsx
<Select value={formData.category} label="Plex Category">
  <MenuItem value="">Auto-detect from content</MenuItem>
  <MenuItem value="News">News</MenuItem>
  <MenuItem value="Movie">Movie</MenuItem>
  <MenuItem value="Series">Series</MenuItem>
  <MenuItem value="Sports">Sports</MenuItem>
</Select>
```

### XMLTV Generation

Categories are included in the XMLTV output for Plex:

```javascript
// In generateXMLTV function
if (categoryToUse) {
  xml += `    <category lang="en">${escapeXML(categoryToUse)}</category>\n`;
}
```

## Configuration

### Via Web Interface

1. Navigate to **EPG Manager** in PlexBridge
2. Click **Add Source** or edit an existing source
3. Select a category from the **Plex Category** dropdown:
   - **Auto-detect**: No category override (uses original EPG data)
   - **News**: For news channels
   - **Movie**: For movie channels
   - **Series**: For TV series channels
   - **Sports**: For sports channels
4. Save the EPG source

### Via API

Create an EPG source with a category:

```bash
curl -X POST http://localhost:3000/api/epg/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sports Channels EPG",
    "url": "https://example.com/sports-epg.xml",
    "refresh_interval": "6h",
    "enabled": true,
    "category": "Sports"
  }'
```

Update an existing source's category:

```bash
curl -X PUT http://localhost:3000/api/epg/sources/{source-id} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sports Channels EPG",
    "url": "https://example.com/sports-epg.xml",
    "refresh_interval": "6h",
    "enabled": true,
    "category": "Sports"
  }'
```

## XMLTV Output

### Without Category Override

Original EPG data categories are preserved:

```xml
<programme start="20250824120000 +0000" stop="20250824130000 +0000" channel="channel-1">
  <title lang="en">Original Program Title</title>
  <category lang="en">Documentary</category>  <!-- Original category -->
</programme>
```

### With Category Override

All programs inherit the source's category:

```xml
<programme start="20250824120000 +0000" stop="20250824130000 +0000" channel="channel-1">
  <title lang="en">Program Title</title>
  <category lang="en">Sports</category>  <!-- Override from EPG source -->
</programme>
```

### Multiple Categories

When needed, multiple category tags can be included:

```xml
<programme start="20250824120000 +0000" stop="20250824130000 +0000" channel="channel-1">
  <title lang="en">Sports News</title>
  <category lang="en">Sports</category>  <!-- Primary category -->
  <category lang="en">News</category>    <!-- Secondary category -->
</programme>
```

## Best Practices

### Category Selection Guidelines

1. **News Channels**
   - 24-hour news networks
   - Local news stations
   - Business news channels
   - Weather channels

2. **Movie Channels**
   - Premium movie channels
   - Classic film channels
   - Movie-focused networks

3. **Series Channels**
   - General entertainment networks
   - Drama/comedy channels
   - Channels with episodic content

4. **Sports Channels**
   - Sports networks
   - League-specific channels
   - Sports news/highlights channels

### Mixed Content Channels

For channels with mixed content:
- Choose the **predominant** content type
- Use "Series" for general entertainment
- Leave as "Auto-detect" to preserve original categories

### Regional Considerations

- Categories apply universally regardless of language
- Use consistent categories across similar channels
- Consider local content preferences

## Troubleshooting

### Categories Not Appearing in Plex

1. **Check XMLTV Export**
   ```bash
   curl http://localhost:3000/api/epg/xmltv > test.xml
   grep "<category" test.xml
   ```

2. **Verify EPG Source Settings**
   ```bash
   curl http://localhost:3000/api/epg/sources
   ```

3. **Force EPG Refresh in Plex**
   - Go to Plex Settings → Live TV & DVR
   - Click "Refresh Guide"

### Category Override Not Working

1. **Check Database**
   ```bash
   docker exec plextv sqlite3 /data/database/plextv.db \
     "SELECT name, category FROM epg_sources;"
   ```

2. **Verify Program Data**
   ```bash
   curl http://localhost:3000/api/epg/programs | jq '.[] | {title, category}'
   ```

### Performance Considerations

- Category assignment is done at XMLTV generation time
- No performance impact on streaming
- Minimal database overhead (single column)

## Integration with Plex Features

### Live TV Guide

Categories enable Plex's filter buttons:
- "All" - Shows all programs
- "News" - Filters news programs
- "Movies" - Filters movie content
- "Sports" - Filters sports events
- "TV Shows" - Filters series content

### DVR Recording

Plex uses categories to:
- Organize recorded content
- Apply appropriate metadata agents
- Set recording priorities

### Recommendations

Categories help Plex's recommendation engine:
- Suggest similar content
- Build viewing profiles
- Improve search results

## Technical Architecture

### Data Flow

```
1. EPG Source Configuration
   └─> category field stored in database

2. EPG Data Refresh
   └─> Programs imported with source_id reference

3. XMLTV Generation Request
   ├─> Fetch EPG sources with categories
   ├─> Map source_id to category
   └─> Apply category to programs

4. XMLTV Output
   └─> <category> tags included in XML

5. Plex Import
   └─> Categories parsed and indexed
```

### Database Relationships

```sql
-- EPG Sources have categories
epg_sources.category → 'News'|'Movie'|'Series'|'Sports'|NULL

-- EPG Channels reference sources
epg_channels.source_id → epg_sources.id

-- Programs reference channels
epg_programs.channel_id → epg_channels.epg_id

-- Category inheritance at runtime
program.category = epg_sources.category || program.original_category
```

## API Reference

### GET /api/epg/sources

Returns all EPG sources with their categories:

```json
[
  {
    "id": "uuid-here",
    "name": "Sports EPG",
    "url": "https://example.com/sports.xml",
    "category": "Sports",
    "enabled": 1,
    "refresh_interval": "6h"
  }
]
```

### POST /api/epg/sources

Create a new EPG source with category:

```json
{
  "name": "News Channels",
  "url": "https://example.com/news.xml",
  "category": "News",
  "refresh_interval": "4h",
  "enabled": true
}
```

### GET /api/epg/xmltv

Returns XMLTV with categories applied:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv>
  <channel id="news-1">
    <display-name>News Channel 1</display-name>
  </channel>
  <programme channel="news-1">
    <title>Evening News</title>
    <category lang="en">News</category>
  </programme>
</tv>
```

## Future Enhancements

Potential improvements for EPG categories:

1. **Sub-categories**
   - News → Local/National/International
   - Sports → Football/Basketball/Soccer
   - Movies → Action/Drama/Comedy

2. **Channel-level overrides**
   - Allow per-channel category settings
   - Override source category for specific channels

3. **Smart Detection**
   - Analyze program titles/descriptions
   - Auto-suggest appropriate categories
   - Machine learning classification

4. **Custom Categories**
   - User-defined categories
   - Mapping to Plex categories
   - Category groups/collections

## Conclusion

EPG categories in PlexBridge provide a powerful way to organize and filter IPTV content in Plex Media Server. By properly categorizing your EPG sources, you enhance the Live TV experience with better organization, filtering, and content discovery. The implementation follows Plex's standards while remaining flexible enough to handle various EPG source formats and content types.