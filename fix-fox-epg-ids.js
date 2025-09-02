#!/usr/bin/env node

/**
 * Fix FOX Sports EPG IDs - Revert to CORRECT values
 * The original EPG IDs were correct - we need to revert the incorrect ".au" changes
 */

const Database = require('better-sqlite3');
const path = require('path');

console.log('=== FIXING FOX SPORTS EPG IDs ===\n');

// Database paths to fix
const dbPaths = [
  'data/database/plextv.db',        // Production
  'data-dev/database/plextv.db'     // Development
];

// Correct EPG ID mappings (reverting the incorrect changes)
const corrections = [
  { name: 'FOX Cricket 501 AU', correct_epg_id: 'FS1', wrong_epg_id: 'FoxCricket.au' },
  { name: 'FOX League 502 AU', correct_epg_id: 'SP2', wrong_epg_id: 'FoxLeague.au' },
  { name: 'FOX Sports 503 AU', correct_epg_id: 'FS3', wrong_epg_id: 'FoxSports503.au' },
  { name: 'FOX Footy 504 AU', correct_epg_id: 'FAF', wrong_epg_id: 'FoxFooty.au' },
  { name: 'FOX Sports 505 AU', correct_epg_id: 'FSP', wrong_epg_id: 'FoxSports505.au' },
  { name: 'FOX Sports 506 AU', correct_epg_id: 'SPS', wrong_epg_id: 'FoxSports506.au' }
];

for (const dbPath of dbPaths) {
  try {
    console.log(`\nProcessing database: ${dbPath}`);
    
    // Check if database exists
    const fs = require('fs');
    if (!fs.existsSync(dbPath)) {
      console.log(`  ⚠️  Database not found, skipping`);
      continue;
    }
    
    // Open database for writing
    const db = new Database(dbPath, { fileMustExist: true });
    
    // Start transaction for safety
    const updateStmt = db.prepare(`
      UPDATE channels 
      SET epg_id = ?, updated_at = datetime('now')
      WHERE name = ? AND (epg_id = ? OR epg_id = ?)
    `);
    
    const transaction = db.transaction(() => {
      let fixedCount = 0;
      
      for (const fix of corrections) {
        // Check current state
        const channel = db.prepare(`
          SELECT id, name, epg_id 
          FROM channels 
          WHERE name = ?
        `).get(fix.name);
        
        if (channel) {
          console.log(`\n  Channel: ${channel.name}`);
          console.log(`    Current EPG ID: "${channel.epg_id}"`);
          
          // Only update if it has the wrong value
          if (channel.epg_id === fix.wrong_epg_id || channel.epg_id !== fix.correct_epg_id) {
            const result = updateStmt.run(
              fix.correct_epg_id,
              fix.name,
              fix.wrong_epg_id,
              channel.epg_id
            );
            
            if (result.changes > 0) {
              console.log(`    ✅ FIXED: Changed to "${fix.correct_epg_id}"`);
              fixedCount++;
            } else {
              console.log(`    ⚠️  No changes made`);
            }
          } else {
            console.log(`    ✅ Already correct: "${fix.correct_epg_id}"`);
          }
        } else {
          console.log(`  ❌ Channel not found: ${fix.name}`);
        }
      }
      
      console.log(`\n  Summary: Fixed ${fixedCount} channels in ${dbPath}`);
    });
    
    // Execute transaction
    transaction();
    
    // Verify the fixes
    console.log('\n  Verification:');
    const verifyStmt = db.prepare(`
      SELECT name, epg_id 
      FROM channels 
      WHERE name LIKE '%FOX%' AND name LIKE '%AU%'
      ORDER BY number
    `);
    
    const foxChannels = verifyStmt.all();
    foxChannels.forEach(ch => {
      const status = corrections.find(c => c.name === ch.name && c.correct_epg_id === ch.epg_id) ? '✅' : '⚠️';
      console.log(`    ${status} ${ch.name}: "${ch.epg_id}"`);
    });
    
    db.close();
    console.log(`  ✅ Database ${dbPath} processed successfully`);
    
  } catch (error) {
    console.error(`  ❌ Error processing ${dbPath}: ${error.message}`);
  }
}

console.log('\n=== FIX COMPLETE ===');
console.log('The FOX Sports channels now have the CORRECT EPG IDs that match the Foxtel EPG source.');
console.log('These channels should now show proper EPG data in Plex.');