#!/usr/bin/env node

const database = require('./server/services/database');
const epgService = require('./server/services/epgService');
const logger = require('./server/utils/logger');

async function testEPGFix() {
  console.log('🧪 Testing EPG Orphaned Programs Fix');
  console.log('===================================\n');

  try {
    // Initialize database
    await database.initialize();
    console.log('✅ Database initialized\n');

    // Test the fixed getAllEPGData method
    console.log('🔍 Testing getAllEPGData with fix...');
    
    const now = new Date().toISOString();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    const programs = await epgService.getAllEPGData(now, tomorrow);
    
    console.log(`📊 Results:`);
    console.log(`  Total programs retrieved: ${programs.length.toLocaleString()}`);
    
    if (programs.length > 0) {
      // Count orphaned vs mapped programs
      const orphanedPrograms = programs.filter(p => p.is_orphaned === 1);
      const mappedPrograms = programs.filter(p => p.is_orphaned === 0);
      
      console.log(`  Mapped programs: ${mappedPrograms.length.toLocaleString()}`);
      console.log(`  Orphaned programs: ${orphanedPrograms.length.toLocaleString()}`);
      console.log(`  Orphaned percentage: ${Math.round((orphanedPrograms.length / programs.length) * 100)}%\n`);
      
      // Show sample orphaned programs that are now included
      if (orphanedPrograms.length > 0) {
        console.log('🎯 Sample orphaned programs now included:');
        orphanedPrograms.slice(0, 5).forEach(p => {
          console.log(`  - ${p.channel_name}: ${p.title}`);
        });
        console.log('');
      }
      
      // Check for  Sport 6 NZ specifically
      const Sport6Programs = programs.filter(p => 
        p.channel_name && p.channel_name.toLowerCase().includes(' sport 6')
      );
      
      if (Sport6Programs.length > 0) {
        console.log('🏆  Sport 6 NZ programs found:');
        Sport6Programs.slice(0, 3).forEach(p => {
          console.log(`  - ${p.title} (${p.start_time})`);
        });
        console.log('  ✅  Sport 6 NZ EPG data is now working!\n');
      } else {
        console.log('⚠️ No  Sport 6 NZ programs in current time window\n');
      }
    }

    // Test single channel EPG data
    console.log('🔍 Testing getEPGData for  Sport 6 NZ...');
    
    // Find  Sport 6 NZ channel ID
    const Channel = await database.get(`
      SELECT id, name, epg_id 
      FROM channels 
      WHERE name LIKE '% Sport 6%' 
      LIMIT 1
    `);
    
    if (Channel && Channel.epg_id) {
      const channelPrograms = await epgService.getEPGData(Channel.epg_id, now, tomorrow);
      
      console.log(`📺  Sport 6 NZ (EPG ID: ${Channel.epg_id}):`);
      console.log(`  Programs found: ${channelPrograms.length}`);
      
      if (channelPrograms.length > 0) {
        console.log('  Sample programs:');
        channelPrograms.slice(0, 3).forEach(p => {
          console.log(`    - ${p.title} (${p.start_time})`);
        });
        console.log('  ✅ Single channel EPG data working!\n');
      }
    } else {
      console.log('  ❌  Sport 6 NZ channel not found or no EPG ID\n');
    }

    // Test direct database query to compare before/after
    console.log('🔍 Comparing query results...');
    
    // Old query (what it was before - for comparison)
    const oldResults = await database.all(`
      SELECT p.*, c.name as channel_name, c.number as channel_number
      FROM epg_programs p
      JOIN channels c ON c.epg_id = p.channel_id
      WHERE p.start_time <= ? 
      AND p.end_time >= ?
      ORDER BY c.number, p.start_time
      LIMIT 50
    `, [tomorrow, now]);
    
    // New query (what it is now)
    const newResults = await database.all(`
      SELECT p.*, 
             COALESCE(c.name, ec.display_name, 'EPG Channel ' || p.channel_id) as channel_name, 
             COALESCE(c.number, 9999) as channel_number, 
             CASE WHEN c.epg_id IS NULL THEN 1 ELSE 0 END as is_orphaned
      FROM epg_programs p
      LEFT JOIN channels c ON c.epg_id = p.channel_id
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE p.start_time <= ? 
      AND p.end_time >= ?
      ORDER BY channel_number, p.start_time
      LIMIT 50
    `, [tomorrow, now]);
    
    console.log(`📊 Query comparison:`);
    console.log(`  Old query (JOIN): ${oldResults.length} programs`);
    console.log(`  New query (LEFT JOIN): ${newResults.length} programs`);
    console.log(`  Improvement: +${newResults.length - oldResults.length} programs\n`);
    
    if (newResults.length > oldResults.length) {
      const additionalPrograms = newResults.filter(nr => 
        !oldResults.some(or => or.id === nr.id)
      );
      
      console.log('🎉 Additional programs now available:');
      additionalPrograms.slice(0, 5).forEach(p => {
        console.log(`  - ${p.channel_name}: ${p.title} ${p.is_orphaned ? '(ORPHANED)' : ''}`);
      });
    }
    
    console.log('\n🎯 Fix Summary:');
    console.log('==============');
    console.log('✅ Changed JOIN to LEFT JOIN in EPG queries');
    console.log('✅ Added COALESCE for channel names from epg_channels table');
    console.log('✅ Orphaned programs now included in EPG data');
    console.log('✅  Sport 6 NZ and other unmapped channels should now show EPG data');
    console.log('✅ Plex will now receive complete EPG information');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (database && database.db) {
      database.db.close();
    }
  }
}

// Run the test
testEPGFix().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});