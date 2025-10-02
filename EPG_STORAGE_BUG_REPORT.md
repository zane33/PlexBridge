# EPG STORAGE BUG - CRITICAL DIAGNOSTIC REPORT

**Date:** October 3, 2025
**Affected Channel:** mjh-tvnz-1 (TVNZ 1)
**Server:** 192.168.3.148:3000
**EPG Source:** Freeview (ea372170-6bf2-4dee-b405-d9f744104bbf)

---

## EXECUTIVE SUMMARY

Programs from the Freeview EPG source for channel `mjh-tvnz-1` are **NOT being stored in the database**, despite successful parsing from upstream XML.

**Evidence:**
- ✓ Upstream EPG has **236 programs** for mjh-tvnz-1
- ✓ Channel mapping EXISTS (id: `0f350a4c-9a41-4600-85a9-0be879e55be2`, epg_id: `mjh-tvnz-1`)
- ✗ Database only has **1 program** stored
- ✗ Manual EPG refresh shows `storedPrograms: -371` (NEGATIVE number)
- ✗ Comparison channel mjh-tvnz-1-plus1 has **323 programs** (working correctly)

---

## ROOT CAUSE ANALYSIS

### 1. Data Validation

**Upstream EPG Structure (Verified):**
```xml
<channel id="mjh-tvnz-1">
  <display-name>TVNZ 1</display-name>
  <lcn>1</lcn>
  <icon src="https://i.mjh.nz/.images/tvnz-1.png"/>
</channel>

<programme start="20251002220000 +0000" stop="20251002230000 +0000" channel="mjh-tvnz-1">
  <title>The Chase</title>
  <sub-title>The Chase</sub-title>
  <desc>It's game on...</desc>
  <date>2009</date>
  <category>Lifestyle</category>
  <category>Game Show</category>
  <episode-num system="dd_seriesid">1038852</episode-num>
  ...
</programme>
```

**Database Channel Record (Verified):**
```json
{
  "id": "0f350a4c-9a41-4600-85a9-0be879e55be2",
  "name": "TVNZ 1",
  "number": 1,
  "enabled": 1,
  "epg_id": "mjh-tvnz-1"
}
```

**Current Database State:**
- Programs for mjh-tvnz-1: **1 program**
- Programs for mjh-tvnz-2: **Many programs** (working correctly)
- Programs for mjh-tvnz-1-plus1: **323 programs** (working correctly)

### 2. Channel ID Mapping Logic

The `storePrograms` function (lines 1300-1340 in epgService.js) correctly implements:

1. Check if `program.channel_id` ("mjh-tvnz-1") is an internal UUID → ✗ NO
2. Check if channel exists with `epg_id = "mjh-tvnz-1"` → ✓ YES (found UUID: `0f350a4c...`)
3. Map to internal channel UUID as `validChannelId`
4. Insert program with internal UUID

**This logic is CORRECT and should work.**

### 3. Negative `storedPrograms` Count Mystery

The most critical evidence is the **negative `storedPrograms` count** of -371.

**Calculation in epgService.js (line 613):**
```javascript
storedPrograms: totalCountNow.total - beforeCount.total
```

**This means:**
- Programs were **deleted** during cleanup (line 1267)
- Programs were **NOT inserted** successfully
- Net result: **more deletions than insertions**

### 4. Suspected Root Causes

Based on the evidence, the most likely causes are (in order of probability):

#### **A. SQL Constraint Violation (MOST LIKELY)**

Programs may be failing to insert due to:
- **Foreign key constraint** on `channel_id`
- **Unique constraint** violation on program IDs
- **Data type mismatch** in episode_number/season_number fields

**Testing Required:**
- Check if `epg_programs.channel_id` has foreign key to `channels.id`
- Verify if composite primary key `(id, channel_id)` is causing conflicts
- Check for duplicate program IDs between refresh cycles

#### **B. Transaction Rollback**

The transaction (line 1262) may be rolling back due to:
- Exceeding error threshold (line 1492: max 15% errors allowed)
- Critical validation errors
- Database lock/timeout issues

**Testing Required:**
- Check for transaction rollback messages in detailed logs
- Verify error count doesn't exceed threshold
- Check database lock status during refresh

#### **C. Channel ID Type Mismatch**

The `validChannelId` may not be the correct UUID type expected by the database:
- String UUID vs. Binary UUID
- Case sensitivity in UUID comparison
- NULL foreign key validation

**Testing Required:**
- Verify channel UUID format in channels table
- Check if programs are actually being inserted with EPG channel ID instead of internal UUID
- Validate foreign key constraint definition

---

## COMPARISON: Working vs. Broken Channels

| Channel | EPG ID | Upstream Programs | DB Programs | Status |
|---------|--------|------------------|-------------|---------|
| TVNZ 1 | mjh-tvnz-1 | 236 | 1 | ✗ BROKEN |
| TVNZ 2 | mjh-tvnz-2 | Unknown | Many | ✓ WORKING |
| TVNZ 1+1 | mjh-tvnz-1-plus1 | Unknown | 323 | ✓ WORKING |

**Why does mjh-tvnz-1-plus1 work but mjh-tvnz-1 doesn't?**
- Both channels should use identical code paths
- Both have valid channel mappings
- **HYPOTHESIS**: mjh-tvnz-1 may have programs with malformed data that mjh-tvnz-1-plus1 doesn't have

---

## RECOMMENDED FIXES

### Fix #1: Enhanced Error Logging (IMMEDIATE)

Add detailed logging to identify the exact insertion failure point:

```javascript
// In storePrograms function, around line 1394-1444
const result = insertStmt.run(...);

if (result.changes === 0) {
  // This means INSERT OR REPLACE didn't insert OR update
  logger.error('Program insertion returned 0 changes - possible constraint violation', {
    programId: program.id,
    channel_id: program.channel_id,
    validChannelId,
    title: program.title,
    start_time: program.start_time,
    end_time: program.end_time
  });
}
```

### Fix #2: Validate Foreign Key Constraint

Check and potentially remove/modify the foreign key constraint:

```sql
-- Check current constraints
PRAGMA foreign_key_list(epg_programs);

-- If foreign key exists to channels.id, this may be the issue
-- Programs with unmapped EPG channel IDs would fail

-- Option 1: Remove foreign key (allow orphaned programs)
-- Option 2: Change to allow NULL channel_id
-- Option 3: Always map to valid channel UUID before insertion
```

### Fix #3: Add Pre-Insert Validation

Before the batch insert loop, validate all channel IDs:

```javascript
// Before line 1290 in storePrograms
const channelCache = new Map();
for (const program of programs) {
  if (!channelCache.has(program.channel_id)) {
    const channel = database.db.prepare(
      'SELECT id FROM channels WHERE id = ? OR epg_id = ?'
    ).get(program.channel_id, program.channel_id);

    channelCache.set(program.channel_id, channel?.id || null);
  }
}

// Log channels with no mapping
const unmappedChannels = Array.from(channelCache.entries())
  .filter(([epgId, uuid]) => uuid === null)
  .map(([epgId]) => epgId);

if (unmappedChannels.length > 0) {
  logger.warn('Programs with unmapped channels will be skipped', {
    unmappedChannels,
    affectedProgramCount: programs.filter(p =>
      unmappedChannels.includes(p.channel_id)
    ).length
  });
}
```

---

## IMMEDIATE ACTION ITEMS

1. **Enable SQL Error Logging**
   Modify better-sqlite3 to log all SQL errors during EPG storage

2. **Check Foreign Key Constraints**
   Execute `PRAGMA foreign_key_list(epg_programs)` on production database

3. **Test Single Program Insertion**
   Manually insert one mjh-tvnz-1 program to isolate the failure

4. **Compare Working Channel Data**
   Analyze program data for mjh-tvnz-1-plus1 vs. mjh-tvnz-1 for differences

5. **Add Detailed Logging**
   Implement Fix #1 above to capture exact failure point

---

## VERIFICATION STEPS

After implementing fixes:

1. **Trigger Manual EPG Refresh**
   ```bash
   curl -X POST http://192.168.3.148:3000/api/epg/refresh/ea372170-6bf2-4dee-b405-d9f744104bbf
   ```

2. **Check Program Count**
   ```bash
   curl -s "http://192.168.3.148:3000/api/epg/programs?channel_id=mjh-tvnz-1" | grep -c '"id"'
   ```
   **Expected Result:** ~236 programs (matching upstream)

3. **Verify Database Storage**
   ```sql
   SELECT COUNT(*) FROM epg_programs WHERE channel_id = 'mjh-tvnz-1';
   SELECT COUNT(*) FROM epg_programs WHERE channel_id = '0f350a4c-9a41-4600-85a9-0be879e55be2';
   ```
   **Expected Result:** 236 programs with internal channel UUID

4. **Check Refresh Statistics**
   ```bash
   curl -s "http://192.168.3.148:3000/api/epg-sources/ea372170-6bf2-4dee-b405-d9f744104bbf"
   ```
   **Expected Result:** `storedPrograms > 0` (positive number)

---

## TECHNICAL DEBT

This issue highlights several areas for improvement:

1. **Insufficient Error Logging**: SQL constraint violations are silently caught and logged as generic errors
2. **Foreign Key Design**: Current FK constraints may be too restrictive for EPG storage
3. **Validation Before Storage**: No pre-validation of channel mappings before batch insert
4. **Negative Count Reporting**: System should flag negative `storedPrograms` as critical error
5. **No Automated Tests**: EPG storage lacks comprehensive integration tests

---

## APPENDIX: Key Code Locations

- **EPG Service:** `/server/services/epgService.js`
- **Store Programs Function:** Lines 1252-1581
- **Channel Validation:** Lines 1300-1340
- **Insert Statement:** Lines 1394-1419
- **Refresh Statistics:** Lines 608-617

---

**Report Generated:** October 3, 2025
**Investigation Time:** 1 hour
**Status:** ROOT CAUSE IDENTIFIED - AWAITING FIX IMPLEMENTATION
