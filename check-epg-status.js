#!/usr/bin/env node

/**
 * EPG System Comprehensive Check
 * This script analyzes the EPG configuration and identifies issues
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Try to find the correct database
const dbPaths = [
  'data/database/plextv.db',
  'data-dev/database/plextv.db',
  path.join(__dirname, 'data/database/plextv.db'),
  path.join(__dirname, 'data-dev/database/plextv.db')
];

let db = null;
for (const dbPath of dbPaths) {
  if (fs.existsSync(dbPath)) {
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
      console.log(`✅ Connected to database: ${dbPath}`);
      break;
    } catch (err) {
      console.log(`❌ Failed to open ${dbPath}: ${err.message}`);
    }
  }
}

if (!db) {
  console.error('❌ Could not find or open database');
  process.exit(1);
}

console.log('\n===  SPORTS CHANNELS (After Your Updates) ===');
const Channels = db.prepare(`
  SELECT id, name, number, epg_id, enabled 
  FROM channels 
  WHERE name LIKE '%%' 
  ORDER BY number
`).all();

Channels.forEach(ch => {
  const status = ch.epg_id ? '✅' : '❌';
  console.log(`${status} Channel ${ch.number}: ${ch.name}`);
  console.log(`   EPG ID: ${ch.epg_id || 'NOT SET'}`);
  console.log(`   Enabled: ${ch.enabled ? 'Yes' : 'No'}`);
});

console.log('\n===  SPORT CHANNELS ===');
const Channels = db.prepare(`
  SELECT id, name, number, epg_id, enabled 
  FROM channels 
  WHERE name LIKE '% Sport%' 
  ORDER BY number
`).all();

Channels.forEach(ch => {
  const status = ch.epg_id ? '✅' : '❌';
  console.log(`${status} Channel ${ch.number}: ${ch.name}`);
  console.log(`   EPG ID: ${ch.epg_id || 'NOT SET'}`);
  console.log(`   Enabled: ${ch.enabled ? 'Yes' : 'No'}`);
});

console.log('\n=== AVAILABLE EPG CHANNELS (What EPG Source Provides) ===');
const epgChannels = db.prepare(`
  SELECT epg_id, display_name, source_id 
  FROM epg_channels 
  WHERE display_name LIKE '%%' 
     OR display_name LIKE '%%'
     OR display_name LIKE '%%'
     OR epg_id LIKE '%%'
     OR epg_id LIKE '%%'
     OR epg_id LIKE '%%'
     OR epg_id LIKE '%%'
  ORDER BY display_name
  LIMIT 30
`).all();

if (epgChannels.length > 0) {
  epgChannels.forEach(ch => {
    console.log(`📺 EPG ID: "${ch.epg_id}" → ${ch.display_name} (Source: ${ch.source_id})`);
  });
} else {
  console.log('❌ No EPG channels found matching  or ');
}

console.log('\n=== EPG ID MATCHING ANALYSIS ===');
// Check if channel EPG IDs match any available EPG channels
const allChannels = [...Channels, ...Channels];
let matchedCount = 0;
let unmatchedChannels = [];

for (const channel of allChannels) {
  if (channel.epg_id) {
    const epgMatch = db.prepare(`
      SELECT epg_id, display_name 
      FROM epg_channels 
      WHERE epg_id = ?
    `).get(channel.epg_id);
    
    if (epgMatch) {
      console.log(`✅ MATCH: Channel "${channel.name}" (EPG ID: ${channel.epg_id}) → EPG Channel "${epgMatch.display_name}"`);
      matchedCount++;
    } else {
      console.log(`❌ NO MATCH: Channel "${channel.name}" has EPG ID "${channel.epg_id}" but no EPG channel exists with this ID`);
      unmatchedChannels.push(channel);
    }
  }
}

console.log('\n=== EPG PROGRAMS CHECK ===');
// Check if there are any programs for these channels
const channelEpgIds = allChannels.filter(ch => ch.epg_id).map(ch => ch.epg_id);
if (channelEpgIds.length > 0) {
  const placeholders = channelEpgIds.map(() => '?').join(',');
  const programCount = db.prepare(`
    SELECT channel_id, COUNT(*) as count 
    FROM epg_programs 
    WHERE channel_id IN (${placeholders})
    GROUP BY channel_id
  `).all(...channelEpgIds);
  
  if (programCount.length > 0) {
    programCount.forEach(pc => {
      const channel = allChannels.find(ch => ch.epg_id === pc.channel_id);
      console.log(`📊 ${channel?.name || pc.channel_id}: ${pc.count} programs`);
    });
  } else {
    console.log('❌ No EPG programs found for any of these channels');
  }
}

console.log('\n=== SUGGESTED EPG ID CORRECTIONS ===');
// Try to find better matches based on channel names
for (const channel of unmatchedChannels) {
  const searchName = channel.name.replace(/\s+\d+$/, '').replace(/\s+NZ$/, '').trim();
  const possibleMatches = db.prepare(`
    SELECT epg_id, display_name 
    FROM epg_channels 
    WHERE display_name LIKE ?
    LIMIT 5
  `).all(`%${searchName}%`);
  
  if (possibleMatches.length > 0) {
    console.log(`\n🔧 Channel "${channel.name}" (Current EPG ID: ${channel.epg_id || 'none'})`);
    console.log('   Possible matches:');
    possibleMatches.forEach(match => {
      console.log(`   → "${match.epg_id}" - ${match.display_name}`);
    });
  }
}

console.log('\n=== EPG SOURCES STATUS ===');
const epgSources = db.prepare(`
  SELECT id, name, url, enabled, last_refresh, last_success, last_error
  FROM epg_sources
`).all();

epgSources.forEach(source => {
  const status = source.enabled ? '✅' : '❌';
  console.log(`${status} Source: ${source.name} (${source.id})`);
  console.log(`   URL: ${source.url}`);
  console.log(`   Last Refresh: ${source.last_refresh || 'Never'}`);
  console.log(`   Last Success: ${source.last_success || 'Never'}`);
  if (source.last_error) {
    console.log(`   Last Error: ${source.last_error}`);
  }
});

console.log('\n=== SUMMARY ===');
console.log(`Total Channels Checked: ${allChannels.length}`);
console.log(`Channels with EPG IDs: ${allChannels.filter(ch => ch.epg_id).length}`);
console.log(`Channels with Matching EPG Data: ${matchedCount}`);
console.log(`Channels Needing EPG ID Fixes: ${unmatchedChannels.length}`);

// Check total EPG data availability
const totalPrograms = db.prepare('SELECT COUNT(*) as count FROM epg_programs').get();
const totalEpgChannels = db.prepare('SELECT COUNT(*) as count FROM epg_channels').get();
console.log(`\nTotal EPG Channels Available: ${totalEpgChannels.count}`);
console.log(`Total EPG Programs in Database: ${totalPrograms.count}`);

db.close();

console.log('\n✅ EPG analysis complete');