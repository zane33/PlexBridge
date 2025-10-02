#!/usr/bin/env node
/**
 * EPG Storage Debug Script
 * Investigates why programs for mjh-tvnz-1 are not being stored
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database', 'plextv.db');
const db = new Database(dbPath, { readonly: false, fileMustExist: true });

console.log('\n=== EPG STORAGE INVESTIGATION FOR mjh-tvnz-1 ===\n');

// 1. Check channel records for TVNZ channels
console.log('1. CHECKING CHANNEL RECORDS FOR TVNZ CHANNELS:');
const tvnzChannels = db.prepare(`
  SELECT id, name, channel_id, epg_id, enabled
  FROM channels
  WHERE channel_id LIKE '%mjh-tvnz-1%'
     OR name LIKE '%TVNZ 1%'
     OR epg_id LIKE '%mjh-tvnz-1%'
`).all();

console.table(tvnzChannels);

// 2. Check EPG channel records
console.log('\n2. CHECKING EPG CHANNEL RECORDS FOR TVNZ:');
const epgChannels = db.prepare(`
  SELECT epg_id, display_name, source_id
  FROM epg_channels
  WHERE epg_id LIKE '%mjh-tvnz-1%'
`).all();

console.table(epgChannels);

// 3. Check program counts per channel
console.log('\n3. PROGRAM COUNTS FOR TVNZ CHANNELS:');
const programCounts = db.prepare(`
  SELECT channel_id, COUNT(*) as program_count
  FROM epg_programs
  WHERE channel_id LIKE '%mjh-tvnz-1%'
  GROUP BY channel_id
`).all();

console.table(programCounts);

// 4. Check sample programs for mjh-tvnz-1
console.log('\n4. SAMPLE PROGRAMS FOR mjh-tvnz-1:');
const samplePrograms = db.prepare(`
  SELECT id, channel_id, title, start_time, end_time, created_at
  FROM epg_programs
  WHERE channel_id = 'mjh-tvnz-1'
  ORDER BY created_at DESC
  LIMIT 10
`).all();

console.table(samplePrograms);

// 5. Check if there are any programs with internal channel UUID
console.log('\n5. CHECKING IF PROGRAMS USE INTERNAL CHANNEL UUID:');
const internalUuidPrograms = db.prepare(`
  SELECT p.id, p.channel_id, p.title, c.name as channel_name
  FROM epg_programs p
  LEFT JOIN channels c ON c.id = p.channel_id
  WHERE c.epg_id = 'mjh-tvnz-1'
  LIMIT 10
`).all();

console.table(internalUuidPrograms);

// 6. Check database constraints
console.log('\n6. EPG_PROGRAMS TABLE SCHEMA:');
const tableInfo = db.prepare('PRAGMA table_info(epg_programs)').all();
console.table(tableInfo);

// 7. Check for foreign key constraints
console.log('\n7. FOREIGN KEY CONSTRAINTS ON EPG_PROGRAMS:');
const foreignKeys = db.prepare('PRAGMA foreign_key_list(epg_programs)').all();
console.table(foreignKeys);

// 8. Verify channels table has mjh-tvnz-1 with epg_id
console.log('\n8. CHANNELS WITH EPG_ID SET TO mjh-tvnz-1:');
const channelWithEpgId = db.prepare(`
  SELECT id, name, channel_id, epg_id
  FROM channels
  WHERE epg_id = 'mjh-tvnz-1'
`).all();

console.table(channelWithEpgId);

// 9. Check recent EPG refresh activity
console.log('\n9. RECENT EPG SOURCE REFRESH STATUS:');
const epgSources = db.prepare(`
  SELECT id, name, last_refresh, last_success, last_error
  FROM epg_sources
  WHERE name LIKE '%Freeview%'
`).all();

console.table(epgSources);

// 10. Check for orphaned programs (programs without matching channel)
console.log('\n10. ORPHANED PROGRAMS COUNT (programs with no matching channel):');
const orphanedCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM epg_programs p
  LEFT JOIN channels c ON (c.id = p.channel_id OR c.epg_id = p.channel_id)
  WHERE c.id IS NULL
`).get();

console.log('Orphaned programs:', orphanedCount.count);

// 11. Check all TVNZ programs (any variation)
console.log('\n11. ALL TVNZ PROGRAM COUNTS (any variation):');
const allTvnzPrograms = db.prepare(`
  SELECT channel_id, COUNT(*) as count
  FROM epg_programs
  WHERE channel_id LIKE '%tvnz%'
  GROUP BY channel_id
`).all();

console.table(allTvnzPrograms);

db.close();

console.log('\n=== INVESTIGATION COMPLETE ===\n');
