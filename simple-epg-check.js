#!/usr/bin/env node

/**
 * Simple EPG Status Check
 * Uses sqlite3 command line tool
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Find database
const dbPath = path.join(__dirname, 'data/database/plextv.db');

if (!fs.existsSync(dbPath)) {
  console.error('❌ Database not found at:', dbPath);
  process.exit(1);
}

console.log('✅ Found database at:', dbPath);

function runQuery(sql, description) {
  try {
    console.log(`\n=== ${description} ===`);
    const command = `echo "${sql}" | sqlite3 "${dbPath}"`;
    const result = execSync(command, { encoding: 'utf8' });
    if (result.trim()) {
      console.log(result);
    } else {
      console.log('No results found.');
    }
  } catch (error) {
    console.error(`Error running query: ${error.message}`);
  }
}

// Check EPG sources
runQuery(
  'SELECT id, name, url, enabled, last_refresh, last_success, last_error FROM epg_sources;',
  'EPG SOURCES'
);

// Check total counts
runQuery(
  'SELECT "EPG Sources" as table_name, COUNT(*) as count FROM epg_sources UNION ALL SELECT "EPG Channels", COUNT(*) FROM epg_channels UNION ALL SELECT "EPG Programs", COUNT(*) FROM epg_programs UNION ALL SELECT "Channels", COUNT(*) FROM channels;',
  'RECORD COUNTS'
);

// Check channels with EPG IDs
runQuery(
  'SELECT COUNT(*) as channels_with_epg_ids FROM channels WHERE epg_id IS NOT NULL AND epg_id != "";',
  'CHANNELS WITH EPG IDS'
);

// Check recent programs
runQuery(
  'SELECT channel_id, COUNT(*) as program_count FROM epg_programs WHERE start_time > datetime("now", "-7 days") GROUP BY channel_id ORDER BY program_count DESC LIMIT 10;',
  'CHANNELS WITH RECENT PROGRAMS (Last 7 days)'
);

// Check EPG service errors
runQuery(
  'SELECT name, last_error FROM epg_sources WHERE last_error IS NOT NULL;',
  'EPG SOURCE ERRORS'
);

console.log('\n✅ EPG analysis complete');