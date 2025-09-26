#!/usr/bin/env node

/**
 * Automatic EPG Channel Mapping Fixer
 * Automatically updates channel EPG IDs to match the actual EPG source channel IDs
 * Can be run as part of deployment or via API
 */

const Database = require('better-sqlite3');
const path = require('path');

function fixEPGMappings(databasePath) {
  const dbPath = databasePath || process.env.DB_PATH || path.join(process.cwd(), 'data', 'database', 'plextv.db');

  console.log('Fixing EPG channel mappings in database:', dbPath);

  try {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Mapping of channel names to their correct EPG source IDs
    const channelMappingUpdates = [
      { name: 'TVNZ 1', epg_id: '1' },
      { name: 'TVNZ 2', epg_id: '2' },
      { name: 'Three', epg_id: '3' },
      { name: 'Bravo', epg_id: '4' },
      { name: 'Māori Television', epg_id: '5' },
      { name: 'Whakaata Māori', epg_id: '5' },
      { name: 'TVNZ Duke', epg_id: '6' },
      { name: 'Duke', epg_id: '6' },
      { name: 'Eden', epg_id: '7' },
      { name: 'Rush', epg_id: '10' },
      { name: 'Sky Open', epg_id: '11' },
      { name: 'Sky', epg_id: '11' },
      { name: 'Te Reo', epg_id: '15' },
      { name: 'Māori TV', epg_id: '5' }
    ];

    const results = {
      checked: 0,
      updated: 0,
      errors: 0,
      details: []
    };

    // Check and update each channel
    const channels = db.prepare('SELECT id, name, number, epg_id FROM channels').all();
    results.checked = channels.length;

    channels.forEach(channel => {
      // Find matching mapping
      const mapping = channelMappingUpdates.find(m =>
        m.name.toLowerCase() === channel.name.toLowerCase() ||
        channel.name.toLowerCase().includes(m.name.toLowerCase()) ||
        m.name.toLowerCase().includes(channel.name.toLowerCase())
      );

      if (mapping && channel.epg_id !== mapping.epg_id) {
        try {
          // Check if programs exist for the new EPG ID
          const programCheck = db.prepare(
            'SELECT COUNT(*) as count FROM epg_programs WHERE channel_id = ?'
          ).get(mapping.epg_id);

          // Update the channel's EPG ID
          const updateResult = db.prepare(
            'UPDATE channels SET epg_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(mapping.epg_id, channel.id);

          if (updateResult.changes > 0) {
            results.updated++;
            results.details.push({
              channel: channel.name,
              number: channel.number,
              oldEpgId: channel.epg_id,
              newEpgId: mapping.epg_id,
              programsAvailable: programCheck.count
            });
            console.log(`✅ Updated ${channel.name} (${channel.number}): ${channel.epg_id} -> ${mapping.epg_id} (${programCheck.count} programs available)`);
          }
        } catch (error) {
          results.errors++;
          console.error(`❌ Error updating ${channel.name}:`, error.message);
        }
      }
    });

    db.close();

    console.log('\n=== Summary ===');
    console.log(`Channels checked: ${results.checked}`);
    console.log(`Channels updated: ${results.updated}`);
    console.log(`Errors: ${results.errors}`);

    if (results.updated > 0) {
      console.log('\n✅ EPG channel mappings have been fixed!');
      console.log('Channels will now show proper program information instead of generic titles.');
    } else {
      console.log('\nℹ️ No channels needed updating.');
    }

    return results;
  } catch (error) {
    console.error('Failed to fix EPG mappings:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const dbPath = args[0];

  try {
    const results = fixEPGMappings(dbPath);
    process.exit(results.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

module.exports = { fixEPGMappings };