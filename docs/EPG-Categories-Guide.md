# EPG Categories Guide for Plex Integration

## Overview

PlexBridge now supports **Enhanced EPG Categories** with full Plex Media Server compatibility. This advanced system ensures your IPTV recordings are properly classified and routed to the correct Plex libraries (TV Shows vs Movies), eliminating the issue where all content defaults to the Movies collection.

### 🎯 **Key Features**
- **Multi-Genre Classification**: Automatically adds multiple category tags for precise Plex recognition
- **Intelligent Content Detection**: Analyzes program titles and descriptions for optimal genre assignment
- **Plex Library Routing**: Ensures recordings go to correct libraries (TV Shows, Movies, News, Sports)
- **Enhanced User Interface**: Clear category descriptions with helpful tooltips

## Table of Contents

1. [Plex-Supported Categories](#plex-supported-categories)
2. [How It Works](#how-it-works)
3. [Implementation Details](#implementation-details)
4. [Configuration](#configuration)
5. [XMLTV Output](#xmltv-output)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

## Enhanced Plex-Compatible Categories

PlexBridge now supports **intelligent multi-genre classification** that maps simple category selections to comprehensive Plex-compatible tags:

### 📺 **Series/TV Shows**
- **User Selection**: "TV Series (Shows, episodic content)"
- **Generated Tags**: `<category>Series</category>` + intelligent subgenre detection
- **Subgenres**: Drama, Comedy, Crime, Reality, Documentary, Animation, Children's, etc.
- **Result**: Recordings properly route to **TV Shows** library

### 🎬 **Movies**
- **User Selection**: "Movies (Films, documentaries)"
- **Generated Tags**: `<category>Movie</category>` + intelligent genre detection
- **Subgenres**: Action, Drama, Comedy, Horror, Thriller, Documentary, etc.
- **Result**: Recordings properly route to **Movies** library

### 📰 **News**
- **User Selection**: "News (News bulletins, current affairs)"
- **Generated Tags**: `<category>News</category>` + `<category>News bulletin</category>`
- **Result**: Recordings route to **News** section

### ⚽ **Sports**
- **User Selection**: "Sports (Live events, sports talk)"
- **Generated Tags**: `<category>Sports</category>` + event type detection
- **Subgenres**: Sports event, Sports talk, Football, Basketball, etc.
- **Result**: Recordings route to **Sports** section

### 🔄 **Auto-detect**
- **User Selection**: "Auto-detect (Use original EPG categories)"
- **Behavior**: Preserves original XMLTV categories from EPG source
- **Result**: Uses source-provided categorization

## How It Works

### Enhanced Category Assignment Flow

```
EPG Source → Category Selection → Smart Analysis → Multi-Tag Generation → Plex Import
     ↓             ↓                    ↓                 ↓                  ↓
  [XMLTV]    [Movie/Series/      [Title/Desc     [<category>Movie</category>  [TV Shows
   Source]    News/Sports/        Analysis]       <category>Drama</category>    Library]
              Auto-detect]                        <category>Crime</category>]
```

### 🧠 **Intelligent Detection System**

PlexBridge analyzes program metadata to determine optimal subgenres:

1. **Title Analysis**: Recognizes patterns like "CSI:", "The Tonight Show", "NBA Finals"
2. **Description Parsing**: Extracts genre hints from program descriptions
3. **Keyword Matching**: Identifies content type from common terms
4. **Context Awareness**: Considers source category as primary classification

### 🎯 **Multi-Tag Strategy**

Each program receives multiple category tags for maximum Plex compatibility:
- **Primary Category**: Content type (Movie/Series/News/Sports)
- **Genre Tags**: Specific subgenres for better organization
- **Content Hints**: Additional classification metadata

## Implementation Details

### 🔧 **System Architecture**

The enhanced category system uses a modular approach:

1. **Plex Categories Utility** (`/server/utils/plexCategories.js`)
   - Smart genre detection algorithms
   - Plex-compatible category mapping
   - Multi-tag XML generation

2. **Enhanced XMLTV Generation** (Updated `/server/routes/epg.js`)
   - Integrates intelligent category detection
   - Outputs multiple category tags per program
   - Maintains backwards compatibility

3. **Improved User Interface** (Updated `/client/src/components/EPGManager.js`)
   - Descriptive category labels
   - Helpful tooltips explaining Plex library routing
   - Clear guidance on category selection

### Database Schema

The EPG sources table includes a `category` column for simple user selections:

```sql
CREATE TABLE epg_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    refresh_interval TEXT DEFAULT '4h',
    enabled INTEGER DEFAULT 1,
    category TEXT,  -- User selection: 'News', 'Movie', 'Series', 'Sports', or NULL
    last_refresh DATETIME,
    last_success DATETIME,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Note**: The simple category values are mapped to complex Plex genres at XMLTV generation time.

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

### Enhanced XMLTV Generation

The new system generates multiple category tags for each program using intelligent detection:

```javascript
// Enhanced generateXMLTV function with Plex Categories utility
const plexCategories = require('../utils/plexCategories');

// Generate multiple category tags for better Plex recognition
const categoryTags = plexCategories.generateCategoryTags(program, categoryToUse);
categoryTags.forEach(tag => {
  xml += `    <category lang="en">${escapeXML(tag)}</category>\n`;
});
```

**Example Output**:
```xml
<!-- For a crime drama series -->
<category lang="en">Series</category>
<category lang="en">Crime</category>
<category lang="en">Drama</category>

<!-- For an action movie -->
<category lang="en">Movie</category>
<category lang="en">Action</category>

<!-- For sports content -->
<category lang="en">Sports</category>
<category lang="en">Sports event</category>
```

## Configuration

### Via Enhanced Web Interface

1. Navigate to **EPG Manager** in PlexBridge
2. Click **Add Source** or edit an existing source
3. Select a category from the **Plex Category** dropdown (with enhanced descriptions):
   - **Auto-detect (Use original EPG categories)**: Preserves source categorization
   - **News (News bulletins, current affairs)**: Routes recordings to News section
   - **Movies (Films, documentaries)**: Routes recordings to Movies library
   - **TV Series (Shows, episodic content)**: Routes recordings to TV Shows library
   - **Sports (Live events, sports talk)**: Routes recordings to Sports section
4. Use the helpful **info tooltip** (ℹ️) for guidance on library routing
5. Review the help text: "Plex will use this to determine if recordings go to your TV Shows or Movies library"
6. Save the EPG source

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

## Enhanced XMLTV Output

### 🔄 Auto-detect Mode (No Category Override)

Original EPG data categories are preserved with potential enhancement:

```xml
<programme start="20250824120000 +0000" stop="20250824130000 +0000" channel="channel-1">
  <title lang="en">Nature Documentary</title>
  <category lang="en">Documentary</category>  <!-- Original category preserved -->
</programme>
```

### 🎬 Movie Category Selection

Programs get movie classification with intelligent subgenre detection:

```xml
<programme start="20250824120000 +0000" stop="20250824130000 +0000" channel="channel-1">
  <title lang="en">Mission: Impossible</title>
  <category lang="en">Movie</category>        <!-- Primary: Movie -->
  <category lang="en">Action</category>       <!-- Detected: Action subgenre -->
  <category lang="en">Thriller</category>     <!-- Detected: Thriller subgenre -->
</programme>
```

### 📺 Series Category Selection

TV series get proper episodic classification:

```xml
<programme start="20250824120000 +0000" stop="20250824130000 +0000" channel="channel-1">
  <title lang="en">CSI: Crime Scene Investigation</title>
  <category lang="en">Series</category>       <!-- Primary: TV Series -->
  <category lang="en">Crime</category>        <!-- Detected: Crime subgenre -->
  <category lang="en">Drama</category>        <!-- Detected: Drama subgenre -->
</programme>
```

### ⚽ Sports Category Selection

Sports content gets event-specific classification:

```xml
<programme start="20250824120000 +0000" stop="20250824130000 +0000" channel="channel-1">
  <title lang="en">NBA Finals Game 7</title>
  <category lang="en">Sports</category>       <!-- Primary: Sports -->
  <category lang="en">Sports event</category> <!-- Detected: Live event -->
  <category lang="en">Basketball</category>   <!-- Detected: Basketball -->
</programme>
```

### 📰 News Category Selection

News content gets appropriate bulletin classification:

```xml
<programme start="20250824120000 +0000" stop="20250824130000 +0000" channel="channel-1">
  <title lang="en">Evening News</title>
  <category lang="en">News</category>         <!-- Primary: News -->
  <category lang="en">News bulletin</category><!-- Standard: News bulletin -->
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

### ❌ Recordings Still Going to Movies Collection

**Symptom**: All recordings default to Movies library despite setting categories

**Solution**:
1. **Verify Enhanced Categories in XMLTV Output**:
   ```bash
   curl http://localhost:8080/epg/xmltv.xml | grep -A 5 -B 5 "<category"
   ```
   Should show multiple category tags per program.

2. **Check EPG Source Configuration**:
   ```bash
   curl http://localhost:8080/api/epg-sources
   ```
   Verify category field is set correctly.

3. **Force Plex Guide Refresh**:
   - Plex Settings → Live TV & DVR → DVR Settings
   - Click "Refresh Guide" and wait for completion
   - May take up to 30 minutes for changes to take effect

4. **Clear Plex Metadata Cache**:
   - Stop Plex Media Server
   - Delete metadata cache for Live TV content
   - Restart Plex and refresh guide data

### ❌ Categories Not Appearing in Plex Guide Filters

**Symptom**: Program guide doesn't show category filter buttons

**Solution**:
1. **Verify Multi-Tag XMLTV Output**:
   ```bash
   curl http://localhost:8080/epg/xmltv.xml | grep "<category" | head -20
   ```
   Should show entries like:
   ```
   <category lang="en">Series</category>
   <category lang="en">Drama</category>
   ```

2. **Check Plex Guide Settings**:
   - Ensure "Show categories" is enabled in Plex Live TV settings
   - Verify channel lineup is properly configured

### ❌ Auto-detect Not Working

**Symptom**: Auto-detect mode doesn't preserve original EPG categories

**Solution**:
1. **Verify Original EPG Data**:
   ```bash
   # Check what categories exist in source XMLTV
   curl "YOUR_EPG_SOURCE_URL" | grep "<category"
   ```

2. **Test Category Processing**:
   - Set EPG source to specific category (Series/Movie)
   - Verify multiple tags appear in output
   - Switch back to Auto-detect and compare

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

The **Enhanced EPG Categories** system in PlexBridge solves the critical issue of IPTV recordings defaulting to the Movies collection. This intelligent multi-genre classification system ensures proper content routing to the correct Plex libraries while maintaining user-friendly configuration.

### ✅ **What This Update Delivers**

- **🎯 Accurate Library Routing**: TV series recordings go to TV Shows library, movies to Movies library
- **🧠 Intelligent Genre Detection**: Automatic subgenre classification for better organization  
- **🔄 Backwards Compatibility**: Existing configurations continue working without changes
- **📱 Enhanced User Interface**: Clear category descriptions and helpful guidance tooltips
- **⚡ Real-time Processing**: Category mapping happens dynamically at XMLTV generation time

### 🚀 **Getting Started**

1. **Update PlexBridge** to the latest version with enhanced categories
2. **Configure EPG Sources** using the improved EPG Manager interface
3. **Select Appropriate Categories** based on your content type (Series/Movies/News/Sports)
4. **Refresh Plex Guide** to see the enhanced categorization in action
5. **Enjoy Proper Library Organization** with recordings in the correct Plex sections

The implementation follows Plex's XMLTV standards while providing intelligent content analysis that adapts to your specific IPTV sources and content types. Your recordings will now be properly organized, making it easier to find and manage your Live TV content within Plex Media Server.