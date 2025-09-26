#!/usr/bin/env node

/**
 * Fix EPG Channel Mappings
 * Updates channel EPG IDs to match the actual EPG source channel IDs
 * Fixes the issue where channels have mismatched EPG IDs (e.g., "mjh-three" vs "3")
 */

const Database = require('better-sqlite3');
const path = require('path');
const { EPG_CHANNEL_MAPPINGS } = require('../utils/epgChannelMapper');

const dbPath = path.join(process.cwd(), 'data', 'database', 'plextv.db');

console.log('Opening database at:', dbPath);
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

const channelMappingUpdates = [
  { name: 'TVNZ 1', epg_id: '1' },
  { name: 'TVNZ 2', epg_id: '2' },
  { name: 'Three', epg_id: '3' },
  { name: 'Bravo', epg_id: '4' },
  { name: 'Māori Television', epg_id: '5' },
  { name: 'Whakaata Māori', epg_id: '5' },
  { name: 'TVNZ Duke', epg_id: '6' },
  { name: 'Eden', epg_id: '7' },
  { name: 'Rush', epg_id: '10' },
  { name: 'Sky Open', epg_id: '11' },
  { name: 'Te Reo', epg_id: '15' }
];

console.log('\n=== Current Channel EPG IDs ===');
const channels = db.prepare('SELECT id, name, number, epg_id FROM channels ORDER BY number').all();

channels.forEach(channel => {
  console.log(`Channel ${channel.number}: ${channel.name}`);
  console.log(`  Current EPG ID: ${channel.epg_id || '(none)'}`);

  // Check if this channel needs updating
  const mapping = channelMappingUpdates.find(m =>
    m.name.toLowerCase() === channel.name.toLowerCase() ||
    (channel.name.includes(m.name))
  );

  if (mapping && channel.epg_id !== mapping.epg_id) {
    console.log(`  -> Should update to: ${mapping.epg_id}`);

    // Check if programs exist for the new EPG ID
    const programCount = db.prepare(
      'SELECT COUNT(*) as count FROM epg_programs WHERE channel_id = ?'
    ).get(mapping.epg_id);

    console.log(`  -> Programs with new EPG ID: ${programCount.count}`);
  }
  console.log('');
});

// Ask for confirmation before updating
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n=== EPG Channel Mapping Fix ===');
console.log('This script will update channel EPG IDs to match the EPG source.');
console.log('This fixes issues where channels show generic "Live" titles instead of actual programs.\n');

rl.question('Do you want to update the channel EPG IDs? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    console.log('\nUpdating channel EPG IDs...\n');

    let updatedCount = 0;

    channelMappingUpdates.forEach(mapping => {
      try {
        const result = db.prepare(
          'UPDATE channels SET epg_id = ?, updated_at = CURRENT_TIMESTAMP WHERE LOWER(name) LIKE ?'
        ).run(mapping.epg_id, `%${mapping.name.toLowerCase()}%`);

        if (result.changes > 0) {
          console.log(`✅ Updated ${mapping.name} to EPG ID: ${mapping.epg_id}`);
          updatedCount++;
        }
      } catch (error) {
        console.error(`❌ Error updating ${mapping.name}:`, error.message);
      }
    });

    console.log(`\n✅ Updated ${updatedCount} channels`);

    // Show updated state
    console.log('\n=== Updated Channel EPG IDs ===');
    const updatedChannels = db.prepare('SELECT name, number, epg_id FROM channels ORDER BY number').all();
    updatedChannels.forEach(channel => {
      console.log(`Channel ${channel.number}: ${channel.name} -> EPG ID: ${channel.epg_id || '(none)'}`);
    });

    console.log('\n✅ EPG channel mappings have been fixed!');
    console.log('The EPG should now show proper program information instead of generic titles.');
    console.log('\nNote: You may need to restart the PlexBridge service for changes to take effect.');
  } else {
    console.log('Update cancelled.');
  }

  db.close();
  rl.close();
});