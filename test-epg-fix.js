#!/usr/bin/env node

/**
 * Test script to verify EPG channel mapping fix
 * Tests that Channel Three now shows proper program information
 */

const axios = require('axios');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function testEPGFix() {
  console.log('🔍 Testing EPG channel mapping fix...\n');

  try {
    // 1. Get Channel Three information
    console.log('1. Fetching Channel Three information...');
    const channelsResponse = await axios.get(`${BASE_URL}/api/channels`);
    const channelsData = Array.isArray(channelsResponse.data) ? channelsResponse.data : channelsResponse.data.channels || [];
    const channelThree = channelsData.find(c =>
      c.name && c.name.toLowerCase().includes('three')
    );

    if (!channelThree) {
      console.log('❌ Channel Three not found!');
      return;
    }

    console.log('✅ Found Channel Three:');
    console.log(`   Name: ${channelThree.name}`);
    console.log(`   Number: ${channelThree.number}`);
    console.log(`   EPG ID: ${channelThree.epg_id || 'None'}`);
    console.log(`   ID: ${channelThree.id}`);
    console.log('');

    // 2. Test current EPG program
    console.log('2. Testing current EPG program...');
    try {
      const currentResponse = await axios.get(`${BASE_URL}/api/epg/now/${channelThree.id}`);
      const currentProgram = currentResponse.data;

      console.log('✅ Current program retrieved:');
      console.log(`   Title: ${currentProgram.title}`);
      console.log(`   Description: ${currentProgram.description ? currentProgram.description.substring(0, 100) + '...' : 'None'}`);
      console.log(`   Start: ${currentProgram.start_time}`);
      console.log(`   End: ${currentProgram.end_time}`);
      console.log(`   Is Fallback: ${currentProgram.is_fallback || false}`);
      console.log('');

      // Check if this is generic "Live" content
      const isGeneric = currentProgram.title.toLowerCase().includes('live') ||
                       currentProgram.title.toLowerCase().includes('three live');

      if (isGeneric) {
        console.log('⚠️  WARNING: Program still shows generic "Live" title');
        console.log('   This may indicate the EPG mapping fix needs further adjustment');
      } else {
        console.log('🎉 SUCCESS: Program shows specific program information!');
      }

    } catch (error) {
      console.log('❌ Failed to get current program:', error.response?.status, error.response?.statusText);
    }

    // 3. Test EPG JSON endpoint
    console.log('3. Testing EPG JSON endpoint...');
    try {
      const epgResponse = await axios.get(`${BASE_URL}/api/epg/json/${channelThree.id}?days=1`);
      const epgData = epgResponse.data;

      console.log('✅ EPG JSON retrieved:');
      console.log(`   Channel ID: ${epgData.channelId}`);
      console.log(`   Program count: ${epgData.programs ? epgData.programs.length : 0}`);

      if (epgData.programs && epgData.programs.length > 0) {
        console.log('   Sample programs:');
        epgData.programs.slice(0, 3).forEach((p, i) => {
          console.log(`   ${i+1}. ${p.title} (${p.start_time})`);
        });
      } else {
        console.log('   ⚠️  No programs found in EPG data');
      }
      console.log('');

    } catch (error) {
      console.log('❌ Failed to get EPG JSON:', error.response?.status, error.response?.statusText);
    }

    // 4. Test EPG admin mapping status
    console.log('4. Testing EPG admin mapping status...');
    try {
      const mappingResponse = await axios.get(`${BASE_URL}/api/epg-admin/mapping-status`);
      const mappingData = mappingResponse.data;

      console.log('✅ EPG mapping status retrieved:');
      console.log(`   Total channels: ${mappingData.summary.total}`);
      console.log(`   Channels OK: ${mappingData.summary.ok}`);
      console.log(`   Channels needing fix: ${mappingData.summary.needsFix}`);
      console.log(`   Channels with no programs: ${mappingData.summary.noPrograms}`);

      // Find Channel Three in the mapping data
      const threeMapping = mappingData.channels.find(c =>
        c.name.toLowerCase().includes('three')
      );

      if (threeMapping) {
        console.log('');
        console.log('   Channel Three mapping status:');
        console.log(`   Current EPG ID: ${threeMapping.currentEpgId}`);
        console.log(`   Suggested EPG ID: ${threeMapping.suggestedEpgId || 'None'}`);
        console.log(`   Current programs: ${threeMapping.currentProgramCount}`);
        console.log(`   Suggested programs: ${threeMapping.suggestedProgramCount}`);
        console.log(`   Status: ${threeMapping.status}`);
      }

    } catch (error) {
      console.log('❌ Failed to get mapping status:', error.response?.status, error.response?.statusText);
      if (error.response?.status === 404) {
        console.log('   (EPG admin routes may not be available yet)');
      }
    }

    console.log('\n🏁 EPG fix test completed!');

  } catch (error) {
    console.log('❌ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('   Make sure PlexBridge is running on http://localhost:3000');
    }
  }
}

// Run the test
if (require.main === module) {
  testEPGFix().catch(console.error);
}

module.exports = { testEPGFix };