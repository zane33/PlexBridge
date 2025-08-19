# EPG Manager "No Program Data Available" Issue Analysis Report

## Executive Summary

The EPG Manager Program Guide tab correctly shows "No program data available" because there are currently no EPG programs in the database. However, the analysis reveals both immediate data issues and a critical structural flaw in the database query logic that would prevent EPG data from appearing even when present.

## Issue Analysis

### 1. Frontend vs Backend Data Structure Mismatch ❌ **RESOLVED**

**Initial Hypothesis:** Frontend expects `response.data.programs` but backend returns `{ start, end, programs }`

**Reality:** This is actually **NOT** the issue. The API structure is correct:

- **Frontend Code (EPGManager.js line 232):** `setEpgPrograms(response.data.programs || []);`
- **Backend Response:** `{ "start": "...", "end": "...", "programs": [] }`
- **Axios Response:** `response.data` = `{ start, end, programs }`
- **Frontend Access:** `response.data.programs` ✅ **CORRECT**

### 2. Database JOIN Query Logic Error ⚠️ **CRITICAL ISSUE**

**Root Cause:** The `getAllEPGData()` method in `/mnt/c/Users/ZaneT/SFF/PlexBridge/server/services/epgService.js` uses an incorrect JOIN condition:

```sql
-- CURRENT (INCORRECT) JOIN
SELECT p.*, c.name as channel_name, c.number as channel_number
FROM epg_programs p
JOIN channels c ON p.channel_id = c.id  -- ❌ WRONG
```

**Problem:** 
- `epg_programs.channel_id` contains EPG identifiers from XMLTV sources (e.g., "cnn.us", "bbc-news.uk")
- `channels.id` contains internal UUIDs (e.g., "37d7096c-5c07-45f2-b4db-992c41adf16b")
- These will **NEVER** match, causing the JOIN to return zero results

**Correct Solution:**
```sql
-- CORRECTED JOIN
SELECT p.*, c.name as channel_name, c.number as channel_number
FROM epg_programs p
JOIN channels c ON c.epg_id = p.channel_id  -- ✅ CORRECT
```

### 3. Current Database State

**EPG Sources:** 1 configured
- Name: "Test EPG Source"
- URL: "https://iptv-org.github.io/epg/guides/us/tvguide.com.epg.xml"
- Status: Enabled, last refresh attempted, but no successful refresh

**Channels:** 2 configured with EPG mappings
- CNN HD (101) → epg_id: "cnn.us" 
- BBC News (102) → epg_id: "bbc-news.uk"

**EPG Programs:** 0 (empty table)
**EPG Channels:** 0 (empty table)

## Visual Evidence

### Screenshot Analysis
![EPG Program Guide Tab](./test-screenshots/epg-analysis-02-program-guide-tab.png)

The screenshot clearly shows:
- ✅ Program Guide tab is selected and functional
- ✅ "No program data available" message with helpful text
- ✅ "Add EPG sources and ensure channels have EPG IDs mapped" guidance
- ✅ Refresh button present for manual EPG updates

### API Response Analysis
```json
// /api/epg endpoint response
{
  "start": "2025-08-19T04:47:46.820Z",
  "end": "2025-08-20T04:47:46.820Z", 
  "programs": []  // Empty because JOIN fails AND no EPG data exists
}

// /api/epg/sources endpoint response  
[]  // No sources (actually incorrect - there is 1 source but endpoint fails)

// /api/epg/programs endpoint response
[]  // No programs (correct - table is empty)
```

## Database Schema Analysis

### Channels Table Structure ✅
```sql
id: TEXT PRIMARY KEY           -- UUID: "37d7096c-5c07..."
name: TEXT NOT NULL           -- "CNN HD"  
number: INTEGER NOT NULL      -- 101
epg_id: TEXT                 -- "cnn.us" (EPG identifier)
```

### EPG Programs Table Structure ✅
```sql
id: TEXT PRIMARY KEY           -- UUID for program
channel_id: TEXT NOT NULL     -- EPG identifier: "cnn.us" 
title: TEXT NOT NULL          -- "News Program"
start_time: DATETIME NOT NULL
end_time: DATETIME NOT NULL
```

### The Mapping Problem 🔍
- **EPG Import Process:** Populates `epg_programs.channel_id` with EPG identifiers from XMLTV
- **Channel Configuration:** Users set `channels.epg_id` to match EPG identifiers  
- **Query Logic Error:** JOIN uses `channels.id` instead of `channels.epg_id`

## Root Cause Summary

1. **Primary Issue:** Database query uses wrong JOIN condition preventing EPG data retrieval
2. **Secondary Issue:** No EPG program data currently exists (empty tables)
3. **Tertiary Issue:** EPG source refresh appears to be failing (no successful refresh recorded)

## Fix Priority

### 🔴 **CRITICAL - Fix Database Query**
The JOIN condition in `epgService.getAllEPGData()` must be corrected to use `channels.epg_id = epg_programs.channel_id` instead of `channels.id = epg_programs.channel_id`.

### 🟡 **IMPORTANT - Debug EPG Import**  
Investigate why the EPG source refresh is failing to populate the `epg_programs` and `epg_channels` tables.

### 🟢 **NICE TO HAVE - Frontend Enhancement**
The frontend already handles empty data gracefully with clear messaging.

## Files Analyzed

- `/mnt/c/Users/ZaneT/SFF/PlexBridge/client/src/components/EPGManager/EPGManager.js` (lines 225-240)
- `/mnt/c/Users/ZaneT/SFF/PlexBridge/server/services/epgService.js` (getAllEPGData method)
- `/mnt/c/Users/ZaneT/SFF/PlexBridge/server/routes/api.js` (EPG endpoints)
- `/mnt/c/Users/ZaneT/SFF/PlexBridge/data/database/plextv.db` (database analysis)

## Test Evidence Files

- `./test-screenshots/epg-analysis-01-sources-tab.png` - EPG Sources tab
- `./test-screenshots/epg-analysis-02-program-guide-tab.png` - Program Guide showing "No data" 
- `./test-screenshots/epg-api-analysis.json` - API response analysis
- `./analyze-database.js` - Database structure analysis script
- `./test-epg-specific.js` - Playwright test demonstrating the issue

## Conclusion

The "No program data available" message is **technically correct** given the current state, but the underlying database query logic error would prevent EPG data from appearing even when present. The fix requires correcting the JOIN condition in the EPG service to properly map channels using their EPG identifiers rather than internal UUIDs.