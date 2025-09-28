#!/usr/bin/env node

/**
 * CRITICAL EPG FULL WORKFLOW TEST
 * 
 * This script tests the complete EPG workflow by simulating the actual
 * EPG service refresh process to identify where the failure occurs.
 */

const epgService = require('./server/services/epgService');
const database = require('./server/services/database');

async function testEPGWorkflow() {
  console.log('🔍 CRITICAL EPG FULL WORKFLOW TEST');
  console.log('==================================');
  
  try {
    // Initialize database
    console.log('\n📂 Step 1: Initializing database...');
    await database.initialize();
    console.log('✅ Database initialized');
    
    // Check EPG sources
    console.log('\n📺 Step 2: Checking EPG sources...');
    const sources = await database.all('SELECT * FROM epg_sources WHERE enabled = 1');
    console.log(`Found ${sources.length} enabled EPG sources`);
    
    if (sources.length === 0) {
      console.log('❌ CRITICAL: No enabled EPG sources found!');
      console.log('Creating test EPG source...');
      
      // Create a test EPG source
      await database.run(`
        INSERT OR REPLACE INTO epg_sources (id, name, url, refresh_interval, enabled)
        VALUES (?, ?, ?, ?, ?)
      `, ['freeview-nz', 'Freeview NZ', 'https://i.mjh.nz/nz/epg.xml', '4h', 1]);
      
      console.log('✅ Test EPG source created');
      
      // Refetch sources
      const newSources = await database.all('SELECT * FROM epg_sources WHERE enabled = 1');
      console.log(`Now found ${newSources.length} enabled EPG sources`);
      sources.push(...newSources);
    }
    
    if (sources.length === 0) {
      throw new Error('Still no EPG sources available');
    }
    
    // Initialize EPG service
    console.log('\n🚀 Step 3: Initializing EPG service...');
    await epgService.initialize();
    console.log('✅ EPG service initialized');
    
    // Test manual refresh
    console.log('\n🔄 Step 4: Testing manual EPG refresh...');
    const sourceId = sources[0].id;
    console.log(`Refreshing source: ${sourceId} (${sources[0].name})`);
    
    const refreshResult = await epgService.forceRefresh(sourceId);
    console.log('✅ EPG refresh completed');
    console.log('Refresh result:', refreshResult);
    
    // Check database after refresh
    console.log('\n📊 Step 5: Checking database after refresh...');
    
    const epgChannels = await database.get('SELECT COUNT(*) as count FROM epg_channels');
    console.log(`EPG channels in database: ${epgChannels.count}`);
    
    const epgPrograms = await database.get('SELECT COUNT(*) as count FROM epg_programs');
    console.log(`EPG programs in database: ${epgPrograms.count}`);
    
    const todayPrograms = await database.get(`
      SELECT COUNT(*) as count FROM epg_programs 
      WHERE DATE(start_time) = DATE('now')
    `);
    console.log(`Today's programs: ${todayPrograms.count}`);
    
    // Sample recent programs
    const recentPrograms = await database.all(`
      SELECT * FROM epg_programs 
      ORDER BY start_time DESC 
      LIMIT 5
    `);
    
    if (recentPrograms.length > 0) {
      console.log('\nMost recent programs:');
      recentPrograms.forEach(prog => {
        console.log(`  - ${prog.channel_id}: ${prog.title} (${prog.start_time})`);
      });
    } else {
      console.log('❌ No programs found in database after refresh');
    }
    
    // Check channel mappings
    console.log('\n🔗 Step 6: Checking channel mappings...');
    const channels = await database.all('SELECT id, name, number, epg_id FROM channels');
    const mappedChannels = channels.filter(ch => ch.epg_id);
    
    console.log(`Total channels: ${channels.length}`);
    console.log(`Mapped channels: ${mappedChannels.length}`);
    
    if (mappedChannels.length === 0) {
      console.log('❌ CRITICAL: No channels have EPG IDs mapped!');
      console.log('Sample channels:');
      channels.slice(0, 5).forEach(ch => {
        console.log(`  - ${ch.number}: ${ch.name} (EPG ID: ${ch.epg_id || 'NOT MAPPED'})`);
      });
    } else {
      console.log('Sample mapped channels:');
      mappedChannels.slice(0, 5).forEach(ch => {
        console.log(`  - ${ch.number}: ${ch.name} -> ${ch.epg_id}`);
      });
    }
    
    // CRITICAL ISSUE ANALYSIS
    console.log('\n💥 CRITICAL ISSUE ANALYSIS:');
    console.log('===========================');
    
    if (epgChannels.count === 0) {
      console.log('❌ ISSUE: EPG channels not being stored from XMLTV');
    } else if (epgPrograms.count === 0) {
      console.log('❌ ISSUE: EPG programs not being stored despite channels being present');
    } else if (todayPrograms.count === 0) {
      console.log('❌ ISSUE: Only old programs in database, current data not being stored');
    } else if (mappedChannels.length === 0) {
      console.log('❌ ISSUE: Programs stored but no channels mapped to EPG IDs');
    } else {
      console.log('✅ EPG system appears to be working correctly');
    }
    
    return {
      success: true,
      epgChannels: epgChannels.count,
      epgPrograms: epgPrograms.count,
      todayPrograms: todayPrograms.count,
      totalChannels: channels.length,
      mappedChannels: mappedChannels.length,
      refreshResult
    };
    
  } catch (error) {
    console.error('💥 EPG workflow test failed:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// Run the test
async function main() {
  const result = await testEPGWorkflow();
  
  console.log('\n📋 TEST SUMMARY:');
  console.log('================');
  console.log(JSON.stringify(result, null, 2));
  
  process.exit(result.success ? 0 : 1);
}

main().catch(console.error);