#!/usr/bin/env node

const database = require('./server/services/database');
const epgService = require('./server/services/epgService');
const logger = require('./server/utils/logger');

async function debugXMLTVIssue() {
  console.log('🔧 Debugging XMLTV Issue Step by Step');
  console.log('=====================================\n');

  try {
    // Initialize database
    await database.initialize();
    console.log('✅ Database initialized\n');

    const channelUUID = '760f90ed-f539-4421-a308-d343bb097154';
    
    console.log('1️⃣ Testing Channel Lookup:');
    console.log('---------------------------');
    const channel = await database.get('SELECT * FROM channels WHERE id = ? OR epg_id = ?', 
      [channelUUID, channelUUID]);
    
    if (channel) {
      console.log(`✅ Channel found:`);
      console.log(`   UUID: ${channel.id}`);
      console.log(`   EPG ID: ${channel.epg_id}`);
      console.log(`   Name: ${channel.name}`);
    } else {
      console.log(`❌ Channel not found with UUID: ${channelUUID}`);
      return;
    }

    console.log('\n2️⃣ Testing Current Time Range (what XMLTV uses):');
    console.log('-------------------------------------------------');
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    console.log(`Start: ${startTime}`);
    console.log(`End: ${endTime}`);
    
    console.log('\n3️⃣ Testing Direct Database Query (what should work):');
    console.log('----------------------------------------------------');
    const directPrograms = await database.all(`
      SELECT p.*, ec.source_id 
      FROM epg_programs p
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE p.channel_id = ? 
      AND p.start_time <= ? 
      AND p.end_time >= ?
      ORDER BY start_time
      LIMIT 5
    `, [channel.epg_id, endTime, startTime]);
    
    console.log(`Direct query found: ${directPrograms.length} programs`);
    if (directPrograms.length > 0) {
      directPrograms.forEach(p => {
        console.log(`   ${p.start_time}: ${p.title}`);
      });
    }

    console.log('\n4️⃣ Testing getEPGData Method (our fix):');
    console.log('----------------------------------------');
    const methodPrograms = await epgService.getEPGData(channelUUID, startTime, endTime);
    console.log(`getEPGData method found: ${methodPrograms.length} programs`);
    if (methodPrograms.length > 0) {
      methodPrograms.slice(0, 5).forEach(p => {
        console.log(`   ${p.start_time}: ${p.title}`);
      });
    }

    console.log('\n5️⃣ Analysis:');
    console.log('------------');
    if (directPrograms.length > 0 && methodPrograms.length > 0) {
      console.log('✅ Both direct query and method work - fix is correct');
      console.log('🤔 XMLTV handler should be working but might have other issues');
    } else if (directPrograms.length > 0 && methodPrograms.length === 0) {
      console.log('❌ Direct query works but method fails - fix not working');
    } else if (directPrograms.length === 0) {
      console.log('⚠️ No EPG data in current time range - this explains fallback');
      console.log('EPG feeds need refreshing to get current data');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    if (database && database.db) {
      database.db.close();
    }
  }
}

// Run the debug
debugXMLTVIssue().then(() => {
  console.log('\n🏁 Debug completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Debug crashed:', error);
  process.exit(1);
});