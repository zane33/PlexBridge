-- fix_database.sql
-- Database corruption fix for PlexBridge EPG system
-- Resolves foreign key constraints and storage issues

PRAGMA foreign_keys=OFF;

-- Create new clean EPG programs table without problematic constraints
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

-- Copy any existing valid data (only recent programs to avoid old corrupted data)
INSERT OR IGNORE INTO epg_programs_new 
SELECT id, channel_id, title, description, start_time, end_time, 
       category, episode_number, season_number, created_at,
       metadata_type, subtitle, secondary_category, year
FROM epg_programs 
WHERE start_time >= datetime('now', '-2 days')
AND id IS NOT NULL 
AND channel_id IS NOT NULL
AND title IS NOT NULL;

-- Drop the corrupted table
DROP TABLE IF EXISTS epg_programs;

-- Rename the new table
ALTER TABLE epg_programs_new RENAME TO epg_programs;

-- Create proper indexes for performance
CREATE INDEX IF NOT EXISTS idx_epg_programs_channel_time ON epg_programs(channel_id, start_time);
CREATE INDEX IF NOT EXISTS idx_epg_programs_start_time ON epg_programs(start_time);
CREATE INDEX IF NOT EXISTS idx_epg_programs_end_time ON epg_programs(end_time);
CREATE INDEX IF NOT EXISTS idx_epg_programs_created_at ON epg_programs(created_at);

-- Clean up any orphaned data in other EPG-related tables
DELETE FROM epg_programs WHERE start_time < datetime('now', '-7 days');

-- Verify database integrity
PRAGMA integrity_check;

-- Re-enable foreign keys
PRAGMA foreign_keys=ON;

-- Show final table structure
.schema epg_programs