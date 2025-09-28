#!/usr/bin/env node

/**
 * EPG Service Test Script
 * 
 * This script directly tests the EPG service to identify why the Freeview EPG source
 * is not downloading or parsing data properly.
 */

const path = require('path');

async function testEPGService() {
  console.log('🔍 Testing EPG Service...\n');
  
  try {
    // Initialize database first
    console.log('1. Initializing database...');
    const database = require('./server/services/database');
    await database.initialize();
    console.log('✅ Database initialized');
    
    // Initialize EPG service
    console.log('\n2. Initializing EPG service...');
    const epgService = require('./server/services/epgService');
    await epgService.initialize();
    console.log('✅ EPG service initialized');
    
    // Check EPG sources
    console.log('\n3. Checking EPG sources...');
    const sources = await database.all('SELECT * FROM epg_sources');
    if (sources.length === 0) {
      console.log('❌ No EPG sources found in database');
      
      // Create a test Freeview source
      console.log('\n4. Creating test Freeview EPG source...');
      const testSource = {
        id: 'freeview-nz-test',
        name: 'Freeview NZ Test',
        url: 'https://i.mjh.nz/nzau/epg.xml.gz',
        refresh_interval: '4h'
      };
      
      await epgService.addSource(testSource);
      console.log('✅ Test Freeview source created');
    } else {
      console.log(`✅ Found ${sources.length} EPG sources:`);
      sources.forEach(source => {
        console.log(`   - ${source.name} (${source.id})`);
        console.log(`     URL: ${source.url}`);
        console.log(`     Enabled: ${source.enabled ? 'YES' : 'NO'}`);
        console.log(`     Last Success: ${source.last_success || 'NEVER'}`);
        console.log(`     Last Error: ${source.last_error || 'NONE'}`);
        console.log('');
      });
    }
    
    // Test downloading from the first enabled source
    const enabledSources = await database.all('SELECT * FROM epg_sources WHERE enabled = 1');
    if (enabledSources.length > 0) {
      const testSource = enabledSources[0];
      console.log(`\n5. Testing EPG download from: ${testSource.name}`);
      console.log(`   URL: ${testSource.url}`);
      
      try {
        await epgService.refreshSource(testSource.id);
        console.log('✅ EPG refresh completed successfully');
        
        // Check results
        console.log('\n6. Checking download results...');
        
        const epgChannels = await database.all('SELECT COUNT(*) as count FROM epg_channels WHERE source_id = ?', [testSource.id]);
        const epgPrograms = await database.all('SELECT COUNT(*) as count FROM epg_programs');
        
        console.log(`   EPG Channels: ${epgChannels[0]?.count || 0}`);
        console.log(`   EPG Programs: ${epgPrograms[0]?.count || 0}`);
        
        if (epgChannels[0]?.count > 0) {
          const sampleChannels = await database.all('SELECT * FROM epg_channels WHERE source_id = ? LIMIT 5', [testSource.id]);
          console.log('\n   Sample EPG Channels:');
          sampleChannels.forEach(channel => {
            console.log(`     - ${channel.epg_id}: ${channel.display_name}`);
          });
        }
        
        if (epgPrograms[0]?.count > 0) {
          const samplePrograms = await database.all('SELECT * FROM epg_programs ORDER BY created_at DESC LIMIT 5');
          console.log('\n   Recent EPG Programs:');
          samplePrograms.forEach(program => {
            console.log(`     - ${program.channel_id}: ${program.title} (${program.start_time})`);
          });
        }
        
      } catch (error) {
        console.error('❌ EPG refresh failed:', error.message);
        console.error('Error details:', error);
      }
    }
    
    // Check channel mappings
    console.log('\n7. Checking channel mappings...');
    const channels = await database.all('SELECT * FROM channels');
    const mappedChannels = channels.filter(ch => ch.epg_id);
    const unmappedChannels = channels.filter(ch => !ch.epg_id);
    
    console.log(`   Total channels: ${channels.length}`);
    console.log(`   Mapped channels: ${mappedChannels.length}`);
    console.log(`   Unmapped channels: ${unmappedChannels.length}`);
    
    if (unmappedChannels.length > 0) {
      console.log('\n   Unmapped channels (need EPG IDs):');
      unmappedChannels.slice(0, 5).forEach(channel => {
        console.log(`     ${channel.number}: ${channel.name}`);
      });
    }
    
    // Get EPG status
    console.log('\n8. Getting EPG service status...');
    const status = await epgService.getStatus();
    console.log(`   Status: ${status.status}`);
    console.log(`   Initialized: ${status.isInitialized}`);
    console.log(`   Total Programs: ${status.programs.total}`);
    console.log(`   Upcoming (24h): ${status.programs.upcoming24h}`);
    console.log(`   Mapping Efficiency: ${status.mapping.efficiency}%`);
    
  } catch (error) {
    console.error('❌ EPG service test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    console.log('\n✅ EPG service test completed');
    process.exit(0);
  }
}

testEPGService().catch(console.error);