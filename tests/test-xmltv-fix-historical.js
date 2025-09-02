#!/usr/bin/env node

const database = require('./server/services/database');
const epgService = require('./server/services/epgService');
const logger = require('./server/utils/logger');

async function testXMLTVFixHistorical() {
  console.log('🧪 Testing XMLTV EPG Fix with Historical Data');
  console.log('==============================================\n');

  try {
    // Initialize database
    await database.initialize();
    console.log('✅ Database initialized\n');

    const channelUUID = '760f90ed-f539-4421-a308-d343bb097154';
    const startTime = '2025-08-30T10:00:00.000Z';  // Historical date with data
    const endTime = '2025-08-30T20:00:00.000Z';

    console.log('🔍 Testing getEPGData method with historical dates...');
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
      console.log('\n✅ Fix is working! Real historical EPG data is being returned.');
      
      console.log('\n🔍 Now testing current dates...');
      const currentStart = new Date().toISOString();
      const currentEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      console.log(`Current range: ${currentStart} to ${currentEnd}`);
      
      const currentPrograms = await epgService.getEPGData(channelUUID, currentStart, currentEnd);
      console.log(`Current programs found: ${currentPrograms.length}`);
      
      if (currentPrograms.length === 0) {
        console.log('⚠️ No current programs found - this explains XMLTV fallback behavior');
        console.log('The EPG data is only available for historical dates (Aug 30, 2025)');
        console.log('EPG feeds may need to be refreshed to get current data');
      }
      
    } else {
      console.log('\n❌ Fix is not working even with historical dates.');
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
testXMLTVFixHistorical().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});