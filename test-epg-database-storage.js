#!/usr/bin/env node

/**
 * CRITICAL EPG DATABASE STORAGE TEST
 * 
 * This script tests the database storage portion of the EPG service
 * to identify why programs are not being stored despite successful parsing.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class EPGDatabaseTester {
  constructor() {
    this.dbPath = path.join(__dirname, 'data', 'database', 'plextv.db');
    this.db = null;
  }

  async testDatabaseStorage() {
    console.log('🔍 CRITICAL EPG DATABASE STORAGE TEST');
    console.log('=====================================');
    
    try {
      // Check if database exists
      console.log('\n📂 Step 1: Checking database...');
      console.log(`Database path: ${this.dbPath}`);
      
      if (!fs.existsSync(this.dbPath)) {
        console.log('❌ Database file does not exist!');
        return { success: false, error: 'Database file not found' };
      }
      
      console.log('✅ Database file exists');
      
      // Connect to database
      console.log('\n🔌 Step 2: Connecting to database...');
      this.db = new Database(this.dbPath);
      console.log('✅ Connected to database');
      
      // Check tables exist
      console.log('\n📋 Step 3: Checking database schema...');
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map(t => t.name);
      
      console.log(`Found tables: ${tableNames.join(', ')}`);
      
      const requiredTables = ['epg_sources', 'epg_channels', 'epg_programs', 'channels'];
      const missingTables = requiredTables.filter(table => !tableNames.includes(table));
      
      if (missingTables.length > 0) {
        console.log(`❌ Missing required tables: ${missingTables.join(', ')}`);
        return { success: false, error: `Missing tables: ${missingTables.join(', ')}` };
      }
      
      console.log('✅ All required tables exist');
      
      // Check EPG sources
      console.log('\n📺 Step 4: Checking EPG sources...');
      const sources = this.db.prepare('SELECT * FROM epg_sources').all();
      console.log(`Found ${sources.length} EPG sources`);
      
      if (sources.length === 0) {
        console.log('❌ No EPG sources found - this is the problem!');
        return { success: false, error: 'No EPG sources configured' };
      }
      
      sources.forEach(source => {
        console.log(`  - ${source.name} (${source.id}): ${source.enabled ? 'ENABLED' : 'DISABLED'}`);
        console.log(`    Last success: ${source.last_success || 'NEVER'}`);
        console.log(`    Last error: ${source.last_error || 'NONE'}`);
      });
      
      // Check EPG channels
      console.log('\n📡 Step 5: Checking EPG channels...');
      const epgChannels = this.db.prepare('SELECT COUNT(*) as count FROM epg_channels').get();
      console.log(`Found ${epgChannels.count} EPG channels in database`);
      
      if (epgChannels.count === 0) {
        console.log('❌ No EPG channels found - channels may not be downloading correctly');
      }
      
      // Check current EPG programs
      console.log('\n📅 Step 6: Checking EPG programs...');
      const totalPrograms = this.db.prepare('SELECT COUNT(*) as count FROM epg_programs').get();
      console.log(`Total programs in database: ${totalPrograms.count}`);
      
      // Check programs by date
      const today = new Date().toISOString().substring(0, 10);
      const todayPrograms = this.db.prepare(`
        SELECT COUNT(*) as count FROM epg_programs 
        WHERE DATE(start_time) = ?
      `).get(today);
      
      console.log(`Programs for today (${today}): ${todayPrograms.count}`);
      
      // Check recent programs
      const recentPrograms = this.db.prepare(`
        SELECT * FROM epg_programs 
        ORDER BY start_time DESC 
        LIMIT 5
      `).all();
      
      if (recentPrograms.length > 0) {
        console.log('\nMost recent programs:');
        recentPrograms.forEach(prog => {
          console.log(`  - ${prog.channel_id}: ${prog.title} (${prog.start_time})`);
        });
      } else {
        console.log('❌ No programs found in database');
      }
      
      // Test program insertion
      console.log('\n💾 Step 7: Testing program insertion...');
      
      const testProgram = {
        id: `test_${Date.now()}`,
        channel_id: 'test-channel',
        title: 'Test Program',
        subtitle: null,
        description: 'Test program for database insertion',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 3600000).toISOString(),
        category: 'Test',
        secondary_category: null,
        year: null,
        country: null,
        icon_url: null,
        episode_number: null,
        season_number: null,
        series_id: null,
        keywords: null,
        rating: null,
        audio_description: false,
        subtitles: false,
        hd_quality: false,
        premiere: false,
        finale: false,
        live: false,
        new_episode: false
      };
      
      try {
        const insertSQL = `
          INSERT OR REPLACE INTO epg_programs
          (id, channel_id, title, subtitle, description, start_time, end_time, category, secondary_category,
           year, country, icon_url, episode_number, season_number, series_id, keywords, rating,
           audio_description, subtitles, hd_quality, premiere, finale, live, new_episode)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const result = this.db.prepare(insertSQL).run(
          testProgram.id,
          testProgram.channel_id,
          testProgram.title,
          testProgram.subtitle,
          testProgram.description,
          testProgram.start_time,
          testProgram.end_time,
          testProgram.category,
          testProgram.secondary_category,
          testProgram.year,
          testProgram.country,
          testProgram.icon_url,
          testProgram.episode_number,
          testProgram.season_number,
          testProgram.series_id,
          testProgram.keywords,
          testProgram.rating,
          testProgram.audio_description,
          testProgram.subtitles,
          testProgram.hd_quality,
          testProgram.premiere,
          testProgram.finale,
          testProgram.live,
          testProgram.new_episode
        );
        
        console.log(`✅ Test program inserted successfully (changes: ${result.changes})`);
        
        // Clean up test program
        this.db.prepare('DELETE FROM epg_programs WHERE id = ?').run(testProgram.id);
        console.log('✅ Test program cleaned up');
        
      } catch (insertError) {
        console.log(`❌ Test program insertion failed: ${insertError.message}`);
        return { 
          success: false, 
          error: `Database insertion failed: ${insertError.message}`,
          insertError: insertError.stack
        };
      }
      
      // Check channel mappings
      console.log('\n🔗 Step 8: Checking channel mappings...');
      const channels = this.db.prepare('SELECT COUNT(*) as count FROM channels').get();
      const mappedChannels = this.db.prepare('SELECT COUNT(*) as count FROM channels WHERE epg_id IS NOT NULL AND epg_id != ""').get();
      
      console.log(`Total channels: ${channels.count}`);
      console.log(`Mapped channels: ${mappedChannels.count}`);
      console.log(`Unmapped channels: ${channels.count - mappedChannels.count}`);
      
      if (mappedChannels.count === 0) {
        console.log('❌ CRITICAL: No channels have EPG IDs mapped!');
        console.log('   This means programs will be parsed but have no matching channels to link to');
        return { 
          success: false, 
          error: 'No channels have EPG IDs mapped - programs cannot be linked to channels'
        };
      }
      
      // Database analysis summary
      console.log('\n💥 CRITICAL ISSUE ANALYSIS:');
      console.log('===========================');
      
      if (sources.length === 0) {
        console.log('❌ ISSUE: No EPG sources configured');
      } else if (sources.every(s => !s.enabled)) {
        console.log('❌ ISSUE: All EPG sources are disabled');
      } else if (epgChannels.count === 0) {
        console.log('❌ ISSUE: EPG channels not being stored from XMLTV source');
      } else if (mappedChannels.count === 0) {
        console.log('❌ ISSUE: No channels have EPG IDs mapped - programs cannot be linked');
      } else if (totalPrograms.count === 0) {
        console.log('❌ ISSUE: Database insertion is failing for unknown reasons');
      } else if (todayPrograms.count === 0) {
        console.log('❌ ISSUE: Old data in database, refresh is not updating current programs');
      } else {
        console.log('✅ Database appears to be working correctly');
      }
      
      return {
        success: true,
        epgSources: sources.length,
        epgChannels: epgChannels.count,
        totalPrograms: totalPrograms.count,
        todayPrograms: todayPrograms.count,
        totalChannels: channels.count,
        mappedChannels: mappedChannels.count
      };
      
    } catch (error) {
      console.error('💥 Database test failed:', error);
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    } finally {
      if (this.db) {
        this.db.close();
      }
    }
  }
}

// Run the test
async function main() {
  const tester = new EPGDatabaseTester();
  const result = await tester.testDatabaseStorage();
  
  console.log('\n📋 TEST SUMMARY:');
  console.log('================');
  console.log(JSON.stringify(result, null, 2));
  
  process.exit(result.success ? 0 : 1);
}

main().catch(console.error);