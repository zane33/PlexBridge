#!/usr/bin/env node

const database = require('./server/services/database');
const epgService = require('./server/services/epgService');
const logger = require('./server/utils/logger');

async function testXMLTVFix() {
  console.log('🧪 Testing XMLTV EPG Fix for Sky Sport 6 NZ');
  console.log('===============================================\n');

  try {
    // Initialize database
    await database.initialize();
    console.log('✅ Database initialized\n');

    const channelUUID = '760f90ed-f539-4421-a308-d343bb097154';
    const startTime = '2025-09-02T01:00:00.000Z';
    const endTime = '2025-09-05T01:00:00.000Z';

    console.log('🔍 Testing getEPGData method fix...');
    console.log(`Channel UUID: ${channelUUID}`);
    console.log(`Time range: ${startTime} to ${endTime}\n`);

    // Test the fixed getEPGData method
    const programs = await epgService.getEPGData(channelUUID, startTime, endTime);
    
    console.log(`📊 Results:`);
    console.log(`  Programs found: ${programs.length}`);
    
    if (programs.length > 0) {
      console.log('  Sample programs:');
      programs.slice(0, 5).forEach(p => {
        console.log(`    ${p.start_time}: ${p.title}`);
      });
      console.log('\n✅ Fix is working! Real EPG data is being returned.');
    } else {
      console.log('\n❌ Fix is not working. Still getting no programs.');
    }

    // Compare with API endpoint
    console.log('\n🔍 Comparing with API endpoint...');
    const apiPrograms = await database.all(`
      SELECT p.*, ec.source_id 
      FROM epg_programs p
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE p.channel_id = ? 
      AND p.start_time <= ? 
      AND p.end_time >= ?
      ORDER BY start_time
      LIMIT 5
    `, ['56', endTime, startTime]);

    console.log(`API direct query found: ${apiPrograms.length} programs`);
    if (apiPrograms.length > 0) {
      console.log('  Sample from direct query:');
      apiPrograms.forEach(p => {
        console.log(`    ${p.start_time}: ${p.title}`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (database && database.db) {
      database.db.close();
    }
  }
}

// Run the test
testXMLTVFix().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});