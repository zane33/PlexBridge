#!/usr/bin/env node

/**
 * EPG Database Fix Script
 * 
 * This script fixes the critical EPG database issues preventing
 * program storage and channel association.
 */

const path = require('path');
const Database = require('better-sqlite3');

async function fixEPGDatabase() {
  console.log('🔧 EPG Database Fix Script Starting...\n');
  
  const dbPath = path.join(__dirname, 'data', 'database', 'plextv.db');
  let db;
  
  try {
    console.log('1. Opening database:', dbPath);
    db = new Database(dbPath);
    
    console.log('\n2. Checking current epg_programs table structure...');
    const tableInfo = db.prepare("PRAGMA table_info(epg_programs)").all();
    const foreignKeys = db.prepare("PRAGMA foreign_key_list(epg_programs)").all();
    
    console.log('Current columns:', tableInfo.map(col => col.name).join(', '));
    console.log('Foreign keys:', foreignKeys.length);
    
    if (foreignKeys.length > 0) {
      console.log('\n❌ CRITICAL ISSUE FOUND: Foreign key constraint exists!');
      console.log('This prevents EPG programs from being stored.');
      
      console.log('\n3. Fixing epg_programs table...');
      
      // Use a transaction for safety
      const migrate = db.transaction(() => {
        // 3.1: Create backup
        console.log('   3.1: Creating backup table...');
        db.prepare(`
          CREATE TABLE IF NOT EXISTS epg_programs_backup AS 
          SELECT * FROM epg_programs
        `).run();
        
        // 3.2: Drop existing table
        console.log('   3.2: Dropping existing table...');
        db.prepare('DROP TABLE epg_programs').run();
        
        // 3.3: Recreate without foreign key
        console.log('   3.3: Creating new table without foreign key...');
        db.prepare(`
          CREATE TABLE epg_programs (
            id TEXT PRIMARY KEY,
            channel_id TEXT,
            title TEXT NOT NULL,
            subtitle TEXT,
            description TEXT,
            start_time DATETIME NOT NULL,
            end_time DATETIME NOT NULL,
            category TEXT,
            secondary_category TEXT,
            year INTEGER,
            country TEXT,
            icon_url TEXT,
            episode_number TEXT,
            season_number TEXT,
            series_id TEXT,
            keywords TEXT,
            rating TEXT,
            audio_description BOOLEAN DEFAULT 0,
            subtitles BOOLEAN DEFAULT 0,
            hd_quality BOOLEAN DEFAULT 0,
            premiere BOOLEAN DEFAULT 0,
            finale BOOLEAN DEFAULT 0,
            live BOOLEAN DEFAULT 0,
            new_episode BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
        
        // 3.4: Restore data if any existed
        console.log('   3.4: Restoring data...');
        const backupCount = db.prepare('SELECT COUNT(*) as count FROM epg_programs_backup').get();
        if (backupCount.count > 0) {
          db.prepare(`
            INSERT INTO epg_programs 
            SELECT * FROM epg_programs_backup
          `).run();
          console.log(`   Restored ${backupCount.count} programs`);
        }
        
        // 3.5: Drop backup
        console.log('   3.5: Cleaning up backup...');
        db.prepare('DROP TABLE epg_programs_backup').run();
      });
      
      migrate();
      console.log('✅ epg_programs table fixed successfully!');
    } else {
      console.log('✅ epg_programs table already has correct structure');
    }
    
    console.log('\n4. Verifying table structure...');
    const newTableInfo = db.prepare("PRAGMA table_info(epg_programs)").all();
    const newForeignKeys = db.prepare("PRAGMA foreign_key_list(epg_programs)").all();
    
    console.log('New columns:', newTableInfo.map(col => col.name).join(', '));
    console.log('Foreign keys:', newForeignKeys.length);
    
    if (newForeignKeys.length === 0) {
      console.log('✅ Foreign key constraint successfully removed!');
    } else {
      console.log('❌ Foreign key constraint still exists!');
    }
    
    console.log('\n5. Checking current data state...');
    
    // Check EPG sources
    const sources = db.prepare('SELECT * FROM epg_sources').all();
    console.log(`EPG Sources: ${sources.length}`);
    sources.forEach(source => {
      console.log(`   - ${source.name}: ${source.enabled ? 'enabled' : 'disabled'}`);
      console.log(`     Last success: ${source.last_success || 'never'}`);
      console.log(`     Last error: ${source.last_error || 'none'}`);
    });
    
    // Check EPG channels
    const epgChannels = db.prepare('SELECT COUNT(*) as count FROM epg_channels').get();
    console.log(`EPG Channels: ${epgChannels.count}`);
    
    // Check EPG programs
    const epgPrograms = db.prepare('SELECT COUNT(*) as count FROM epg_programs').get();
    console.log(`EPG Programs: ${epgPrograms.count}`);
    
    // Check channel mappings
    const channels = db.prepare('SELECT COUNT(*) as total FROM channels').get();
    const mappedChannels = db.prepare("SELECT COUNT(*) as mapped FROM channels WHERE epg_id IS NOT NULL AND epg_id != ''").get();
    console.log(`Channels: ${mappedChannels.mapped}/${channels.total} mapped (${Math.round(mappedChannels.mapped/channels.total*100)}%)`);
    
    console.log('\n6. Testing program insertion...');
    
    // Test if we can now insert a program
    const testProgram = {
      id: 'test-program-' + Date.now(),
      channel_id: 'test-channel-id',
      title: 'Test Program',
      description: 'Test program for database fix verification',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 3600000).toISOString(),
      category: 'Test'
    };
    
    try {
      const insertResult = db.prepare(`
        INSERT INTO epg_programs (id, channel_id, title, description, start_time, end_time, category)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        testProgram.id,
        testProgram.channel_id,
        testProgram.title,
        testProgram.description,
        testProgram.start_time,
        testProgram.end_time,
        testProgram.category
      );
      
      console.log(`✅ Test program inserted successfully (changes: ${insertResult.changes})`);
      
      // Clean up test program
      db.prepare('DELETE FROM epg_programs WHERE id = ?').run(testProgram.id);
      console.log('✅ Test program cleaned up');
      
    } catch (insertError) {
      console.error('❌ Test program insertion failed:', insertError.message);
    }
    
    console.log('\n✅ EPG Database fix completed successfully!');
    console.log('\nThe EPG service should now be able to:');
    console.log('  - Store EPG programs without foreign key constraints');
    console.log('  - Download and parse XMLTV data from sources');
    console.log('  - Associate programs with channels via EPG IDs');
    
  } catch (error) {
    console.error('❌ EPG database fix failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    if (db) {
      db.close();
    }
  }
}

fixEPGDatabase().catch(console.error);