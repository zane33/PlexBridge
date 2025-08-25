# PlexBridge EPG Category Update - Plex Compatibility Enhancement

## Summary
Updated PlexBridge to generate Plex-compatible EPG category classifications in XMLTV output. This ensures Plex properly recognizes and categorizes recorded content instead of defaulting everything to the "Movies" collection.

## Problem Solved
- **Before**: PlexBridge used simple categories ("News", "Movie", "Series", "Sports") that Plex didn't recognize
- **After**: PlexBridge now outputs multiple category tags with Plex-compatible genre classifications

## Implementation Details

### Files Created
1. **`/server/utils/plexCategories.js`** - New utility module for Plex category mapping
   - Maps simple categories to Plex-recognized genres
   - Analyzes program titles and descriptions for better subgenre detection
   - Generates properly formatted XMLTV category elements

### Files Modified
1. **`/server/routes/epg.js`**
   - Added import for plexCategories utility
   - Modified XMLTV generation to output multiple category tags per program
   - Uses intelligent mapping based on program metadata

### Category Mapping Examples

| User Selection | XMLTV Output Categories | Plex Classification |
|----------------|------------------------|-------------------|
| **Movie** | `<category>Movie</category>`<br>`<category>Action</category>` | Movie → Action Movies |
| **Series** | `<category>Series</category>`<br>`<category>Drama</category>` | TV Show → Drama |
| **News** | `<category>News</category>`<br>`<category>News bulletin</category>` | News Program |
| **Sports** | `<category>Sports</category>`<br>`<category>Sports event</category>` | Sports Event |

### Intelligent Subgenre Detection
The system analyzes program titles and descriptions to determine appropriate subgenres:

- **Movies**: Action, Comedy, Drama, Horror, Romance, Sci-Fi, Documentary, etc.
- **Series**: Drama, Comedy, Crime, Reality, Talk show, Game show, etc.
- **Sports**: Sports event, Sports talk, Sports magazine
- **News**: News bulletin, News magazine, Weather

### Example XMLTV Output
```xml
<programme start="20250115200000 +0000" stop="20250115223000 +0000" channel="hbo-hd">
  <title lang="en">The Dark Knight</title>
  <desc lang="en">Batman faces the Joker in this explosive action thriller</desc>
  <category lang="en">Movie</category>
  <category lang="en">Action</category>
</programme>
```

## Benefits
1. **Proper Content Classification**: Plex now correctly identifies movies, TV shows, sports, and news
2. **Enhanced Recording Organization**: Recordings are automatically sorted into appropriate Plex libraries
3. **Better Search and Discovery**: Users can find content by genre within Plex
4. **Backwards Compatible**: Simple categories still work for user selection in PlexBridge UI

## Testing
The implementation has been tested with sample XMLTV generation showing proper multi-category output compatible with Plex's content classification system.

## No Breaking Changes
- User interface remains unchanged - still uses simple category selection
- Database schema unchanged - category mapping happens at XMLTV generation time
- Existing EPG sources continue to work without modification