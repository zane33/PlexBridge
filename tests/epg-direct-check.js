#!/usr/bin/env node

/**
 * Direct EPG Database Check
 * Analyzes EPG IDs and mappings directly from database
 */

const Database = require('better-sqlite3');
const path = require('path');

console.log('=== COMPREHENSIVE EPG SYSTEM ANALYSIS ===\n');

// Use the dev database we copied
const dbPath = path.join(__dirname, 'data-dev/database/plextv.db');
console.log(`Using database: ${dbPath}\n`);

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

// Check  Sports channels (after user's updates)
console.log('===  SPORTS CHANNELS (User Updated These) ===');
const Channels = db.prepare(`
  SELECT id, name, number, epg_id, enabled 
  FROM channels 
  WHERE name LIKE '%%' 
  ORDER BY number
`).all();

const ChannelStatus = [];
Channels.forEach(ch => {
  const hasEpg = ch.epg_id ? '✅' : '❌';
  console.log(`${hasEpg} Channel ${ch.number}: ${ch.name}`);
  console.log(`   EPG ID: "${ch.epg_id || 'NOT SET'}"`);
  
  // Check if EPG programs exist for this channel
  if (ch.epg_id) {
    const programCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM epg_programs 
      WHERE channel_id = ?
    `).get(ch.epg_id);
    
    const epgChannel = db.prepare(`
      SELECT display_name 
      FROM epg_channels 
      WHERE epg_id = ?
    `).get(ch.epg_id);
    
    if (epgChannel) {
      console.log(`   ✅ EPG Channel Found: "${epgChannel.display_name}"`);
    } else {
      console.log(`   ❌ NO EPG Channel with this ID!`);
    }
    
    if (programCount.count > 0) {
      console.log(`   ✅ ${programCount.count} programs in EPG`);
    } else {
      console.log(`   ❌ NO programs found!`);
    }
    
    ChannelStatus.push({
      name: ch.name,
      epg_id: ch.epg_id,
      has_epg_channel: !!epgChannel,
      program_count: programCount.count
    });
  }
  console.log('');
});

// Check  Sport channels
console.log('===  SPORT CHANNELS (Numeric EPG IDs) ===');
const Channels = db.prepare(`
  SELECT id, name, number, epg_id, enabled 
  FROM channels 
  WHERE name LIKE '% Sport%' 
  ORDER BY number
`).all();

const ChannelStatus = [];
Channels.forEach(ch => {
  const hasEpg = ch.epg_id ? '✅' : '❌';
  console.log(`${hasEpg} Channel ${ch.number}: ${ch.name}`);
  console.log(`   EPG ID: "${ch.epg_id || 'NOT SET'}"`);
  
  if (ch.epg_id) {
    const programCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM epg_programs 
      WHERE channel_id = ?
    `).get(ch.epg_id);
    
    const epgChannel = db.prepare(`
      SELECT display_name 
      FROM epg_channels 
      WHERE epg_id = ?
    `).get(ch.epg_id);
    
    if (epgChannel) {
      console.log(`   ✅ EPG Channel Found: "${epgChannel.display_name}"`);
    } else {
      console.log(`   ❌ NO EPG Channel with this ID!`);
    }
    
    if (programCount.count > 0) {
      console.log(`   ✅ ${programCount.count} programs in EPG`);
    } else {
      console.log(`   ❌ NO programs found!`);
    }
    
    ChannelStatus.push({
      name: ch.name,
      epg_id: ch.epg_id,
      has_epg_channel: !!epgChannel,
      program_count: programCount.count
    });
  }
  console.log('');
});

// Find correct EPG IDs for  channels
console.log('=== AVAILABLE  EPG CHANNELS (What\'s Actually in EPG Data) ===');
const EpgChannels = db.prepare(`
  SELECT epg_id, display_name, source_id 
  FROM epg_channels 
  WHERE display_name LIKE '%%' 
     OR display_name LIKE '%%'
     OR epg_id LIKE '%%'
     OR epg_id LIKE '%%'
  ORDER BY display_name
  LIMIT 20
`).all();

if (EpgChannels.length > 0) {
  EpgChannels.forEach(ch => {
    console.log(`   "${ch.epg_id}" → ${ch.display_name} (Source: ${ch.source_id})`);
  });
} else {
  console.log('   ❌ No  EPG channels found in EPG data!');
}

// Find correct EPG IDs for  channels
console.log('\n=== AVAILABLE  EPG CHANNELS ===');
const EpgChannels = db.prepare(`
  SELECT epg_id, display_name, source_id 
  FROM epg_channels 
  WHERE display_name LIKE '%%Sport%'
     OR epg_id LIKE '%%sport%'
     OR epg_id IN ('56', '57', '59')
  ORDER BY display_name
  LIMIT 20
`).all();

if (EpgChannels.length > 0) {
  EpgChannels.forEach(ch => {
    console.log(`   "${ch.epg_id}" → ${ch.display_name} (Source: ${ch.source_id})`);
  });
} else {
  console.log('   ❌ No  Sport EPG channels found!');
}

// Suggest corrections
console.log('\n=== SUGGESTED EPG ID CORRECTIONS ===');

// For  channels without working EPG
const brokenChannels = ChannelStatus.filter(ch => !ch.has_epg_channel || ch.program_count === 0);
if (brokenChannels.length > 0) {
  console.log('\n Channels needing fixes:');
  brokenChannels.forEach(ch => {
    console.log(`\n❌ ${ch.name} (Current: "${ch.epg_id}")`);
    
    // Try to find a better match
    const searchName = ch.name.replace(/\s+\d+$/, '').trim();
    const possibleMatches = db.prepare(`
      SELECT epg_id, display_name 
      FROM epg_channels 
      WHERE display_name LIKE ?
      LIMIT 3
    `).all(`%${searchName}%`);
    
    if (possibleMatches.length > 0) {
      console.log('   Suggested EPG IDs:');
      possibleMatches.forEach(match => {
        console.log(`   → "${match.epg_id}" (${match.display_name})`);
      });
    }
  });
}

// For  channels without working EPG
const brokenChannels = ChannelStatus.filter(ch => !ch.has_epg_channel || ch.program_count === 0);
if (brokenChannels.length > 0) {
  console.log('\n\n Sport channels needing fixes:');
  brokenChannels.forEach(ch => {
    console.log(`\n❌ ${ch.name} (Current: "${ch.epg_id}")`);
    
    // Look for numeric matches in  TV NZ source
    const TvSource = db.prepare(`
      SELECT id FROM epg_sources WHERE name LIKE '%%'
    `).get();
    
    if (TvSource) {
      const possibleMatches = db.prepare(`
        SELECT epg_id, display_name 
        FROM epg_channels 
        WHERE source_id = ? 
          AND (display_name LIKE ? OR display_name LIKE ?)
        LIMIT 3
      `).all(TvSource.id, `%${ch.name}%`, `%Sport%${ch.epg_id}%`);
      
      if (possibleMatches.length > 0) {
        console.log('   Suggested EPG IDs:');
        possibleMatches.forEach(match => {
          console.log(`   → "${match.epg_id}" (${match.display_name})`);
        });
      }
    }
  });
}

// Summary statistics
console.log('\n\n=== SUMMARY ===');
const totalWithEpg = ChannelStatus.filter(ch => ch.has_epg_channel && ch.program_count > 0).length;
const totalWithEpg = ChannelStatus.filter(ch => ch.has_epg_channel && ch.program_count > 0).length;

console.log(` Channels: ${Channels.length} total`);
console.log(`  ✅ Working EPG: ${totalWithEpg}`);
console.log(`  ❌ Broken EPG: ${Channels.length - totalWithEpg}`);

console.log(`\n Sport Channels: ${Channels.length} total`);
console.log(`  ✅ Working EPG: ${totalWithEpg}`);
console.log(`  ❌ Broken EPG: ${Channels.length - totalWithEpg}`);

// Check EPG sources
console.log('\n=== EPG SOURCES STATUS ===');
const epgSources = db.prepare(`
  SELECT id, name, enabled, last_success, last_error 
  FROM epg_sources
`).all();

epgSources.forEach(source => {
  const status = source.enabled ? '✅' : '❌';
  console.log(`${status} ${source.name}`);
  if (source.last_success) {
    console.log(`   Last Success: ${source.last_success}`);
  }
  if (source.last_error) {
    console.log(`   ⚠️  Error: ${source.last_error}`);
  }
});

// Total EPG data stats
const totalPrograms = db.prepare('SELECT COUNT(*) as count FROM epg_programs').get();
const totalEpgChannels = db.prepare('SELECT COUNT(*) as count FROM epg_channels').get();

console.log(`\n=== EPG DATABASE STATS ===`);
console.log(`Total EPG Channels: ${totalEpgChannels.count}`);
console.log(`Total EPG Programs: ${totalPrograms.count}`);

db.close();

console.log('\n✅ EPG analysis complete');
console.log('\n⚠️  ACTION REQUIRED: Update the EPG IDs for broken channels using the API or database!');