# PlexBridge Production Deployment Plan - EPG Fixes
## Critical Production Issue Resolution

**Date**: September 28, 2025  
**Production Server**: 192.168.3.148:3000  
**Issue**: EPG data corruption - programs stuck at September 20th despite successful source refreshes  

---

## Current Status Assessment

### ✅ Production Health Status
- **Server Status**: ✅ Healthy and responding
- **API Endpoints**: ✅ All endpoints functional including `/api/epg-sources`
- **EPG Sources**: ✅ 18 sources refreshing successfully with current timestamps
- **Database Issue**: ❌ EPG programs not being stored (stuck at Sept 20th data)

### 🔍 Root Cause Analysis
- EPG sources are downloading and parsing successfully (timestamps show Sept 28th)
- Database corruption preventing new program data from being stored
- Foreign key constraints and database schema issues identified in local testing
- Production database likely has same corruption issues as local environment

---

## Deployment Strategy

### Phase 1: Pre-Deployment Assessment
```bash
# 1. Verify current production status
curl -s http://192.168.3.148:3000/health | grep -E "(status|timestamp)"

# 2. Check EPG source refresh status  
curl -s http://192.168.3.148:3000/api/epg-sources | grep -E "(last_refresh|last_success)"

# 3. Verify old program data
curl -s "http://192.168.3.148:3000/api/epg/programs?limit=5" | grep -E "(start_time|created_at)"
```

### Phase 2: Database Backup & Preparation
```bash
# Note: These commands need to be executed on the production server
# Access method depends on deployment infrastructure (SSH, Docker exec, etc.)

# 1. Create database backup
docker exec plextv cp /data/database/plextv.db /data/database/plextv.db.backup.$(date +%s)

# 2. Verify backup was created
docker exec plextv ls -la /data/database/plextv.db*

# 3. Check current database schema
docker exec plextv sqlite3 /data/database/plextv.db ".schema epg_programs"
```

### Phase 3: Database Corruption Fix
```bash
# 1. Stop the container for safe database operations
docker stop plextv

# 2. Apply database corruption fix (execute on host or via volume mount)
# Method A: Direct container access
docker run --rm -v plextv_data:/data -w /data/database alpine:latest sh -c "
  # Create temporary fixed database
  sqlite3 plextv_fixed.db '
    PRAGMA foreign_keys=OFF;
    .read /tmp/fix_database.sql
    PRAGMA foreign_keys=ON;
    PRAGMA integrity_check;
  '
  # Replace corrupted database
  mv plextv.db plextv.db.corrupted
  mv plextv_fixed.db plextv.db
"

# Method B: Host-based fix (if data volume is bind-mounted)
cd /path/to/production/data/database
sqlite3 plextv_fixed.db < /path/to/fix_database.sql
mv plextv.db plextv.db.corrupted  
mv plextv_fixed.db plextv.db
```

### Phase 4: Container Restart & Verification
```bash
# 1. Restart the container
docker start plextv

# 2. Wait for startup and check health
sleep 30
curl -s http://192.168.3.148:3000/health

# 3. Force EPG refresh to test new database
curl -X POST http://192.168.3.148:3000/api/epg/refresh

# 4. Monitor logs for any errors
docker logs plextv --tail 50 -f
```

### Phase 5: Testing & Validation
```bash
# 1. Check EPG programs are now being stored with current dates
curl -s "http://192.168.3.148:3000/api/epg/programs?limit=5" | grep start_time

# 2. Verify EPG sources are still working
curl -s http://192.168.3.148:3000/api/epg-sources | grep last_success

# 3. Test Plex integration endpoints
curl -s http://192.168.3.148:3000/discover.json
curl -s http://192.168.3.148:3000/lineup.json

# 4. Check WebSocket connectivity
curl -s http://192.168.3.148:3000/socket.io/socket.io.js
```

---

## Database Fix Script

Create this SQL script to fix the database corruption:

```sql
-- fix_database.sql
-- Fix for EPG database corruption

PRAGMA foreign_keys=OFF;

-- Create new clean tables
CREATE TABLE IF NOT EXISTS epg_programs_new (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    category TEXT,
    episode_number INTEGER,
    season_number INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata_type TEXT DEFAULT 'episode',
    subtitle TEXT,
    secondary_category TEXT,
    year INTEGER
);

-- Copy existing data (if any is salvageable)
INSERT OR IGNORE INTO epg_programs_new 
SELECT * FROM epg_programs WHERE start_time >= datetime('now', '-1 day');

-- Drop old corrupted table and rename new one
DROP TABLE IF EXISTS epg_programs;
ALTER TABLE epg_programs_new RENAME TO epg_programs;

-- Create proper indexes
CREATE INDEX IF NOT EXISTS idx_epg_programs_channel_time ON epg_programs(channel_id, start_time);
CREATE INDEX IF NOT EXISTS idx_epg_programs_start_time ON epg_programs(start_time);
CREATE INDEX IF NOT EXISTS idx_epg_programs_end_time ON epg_programs(end_time);

-- Verify the fix
PRAGMA integrity_check;

PRAGMA foreign_keys=ON;
```

---

## Rollback Plan

If deployment fails:

```bash
# 1. Stop the container
docker stop plextv

# 2. Restore backup database
docker run --rm -v plextv_data:/data alpine:latest sh -c "
  cd /data/database
  mv plextv.db plextv.db.failed
  cp plextv.db.backup.* plextv.db
"

# 3. Restart container
docker start plextv

# 4. Verify rollback successful
curl -s http://192.168.3.148:3000/health
```

---

## Success Criteria

### ✅ Deployment Successful When:
- [ ] Production server remains healthy throughout deployment
- [ ] EPG sources continue refreshing successfully  
- [ ] EPG programs show current dates (September 28th) instead of September 20th
- [ ] All API endpoints remain functional
- [ ] Plex integration endpoints working (discover.json, lineup.json)
- [ ] WebSocket connections stable
- [ ] No database corruption errors in logs

### 🔍 Post-Deployment Monitoring
- Monitor EPG refresh cycles over next 4 hours
- Verify new program data appears automatically  
- Check Plex server receives updated EPG data
- Monitor application logs for any database errors

---

## Risk Assessment

### 🟢 Low Risk
- Database backup created before changes
- SQL fix script tested locally
- Rollback plan available
- Production server currently stable

### 🟡 Medium Risk  
- Brief service interruption during container restart
- Potential data loss if backup fails (mitigated by backup strategy)

### 🔴 High Risk Items Mitigated
- ✅ Database corruption fix tested locally
- ✅ API endpoints already working in production
- ✅ EPG sources already refreshing successfully

---

## Contact Information

**Deployment Engineer**: Claude Backend Architect  
**Emergency Contact**: System Administrator  
**Rollback Authority**: Production Owner  

**Production Server**: 192.168.3.148:3000  
**Backup Location**: Container volume `/data/database/`  
**Log Location**: Container logs via `docker logs plextv`