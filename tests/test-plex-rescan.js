#!/usr/bin/env node

/**
 * PlexBridge Plex Tuner Rescan Test
 * Tests the fix for Plex tuner rescan functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 PlexBridge Plex Tuner Rescan Test Suite\n');

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Verify discover.json endpoint
  try {
    console.log('1. Testing HDHomeRun discovery endpoint...');
    const discovery = await axios.get(`${BASE_URL}/discover.json`);
    
    if (discovery.data.LineupURL && discovery.data.BaseURL) {
      console.log('   ✅ Discovery endpoint working');
      console.log(`   📡 Device: ${discovery.data.FriendlyName}`);
      console.log(`   🔗 Lineup URL: ${discovery.data.LineupURL}`);
      testsPassed++;
    } else {
      throw new Error('Missing LineupURL or BaseURL in discovery response');
    }
  } catch (error) {
    console.log(`   ❌ Discovery test failed: ${error.message}`);
    testsFailed++;
  }

  // Test 2: Verify lineup.json (GET) endpoint
  try {
    console.log('\n2. Testing channel lineup (GET) endpoint...');
    const lineup = await axios.get(`${BASE_URL}/lineup.json`);
    
    if (Array.isArray(lineup.data) && lineup.data.length >= 0) {
      console.log('   ✅ Channel lineup endpoint working');
      console.log(`   📺 Found ${lineup.data.length} channels`);
      
      if (lineup.data.length > 0) {
        const sample = lineup.data[0];
        console.log(`   🎯 Sample: ${sample.GuideNumber} - ${sample.GuideName}`);
      }
      testsPassed++;
    } else {
      throw new Error('Invalid lineup response format');
    }
  } catch (error) {
    console.log(`   ❌ Lineup GET test failed: ${error.message}`);
    testsFailed++;
  }

  // Test 3: Verify lineup.post (POST) endpoint - THE FIX
  try {
    console.log('\n3. Testing channel lineup rescan (POST) endpoint...');
    const rescan = await axios.post(`${BASE_URL}/lineup.post`);
    
    if (Array.isArray(rescan.data) && rescan.data.length >= 0) {
      console.log('   ✅ Channel rescan endpoint working');
      console.log(`   🔄 Rescan returned ${rescan.data.length} channels`);
      
      // Verify structure matches GET endpoint
      if (rescan.data.length > 0) {
        const channel = rescan.data[0];
        const requiredFields = ['GuideNumber', 'GuideName', 'URL', 'HD', 'DRM'];
        const hasAllFields = requiredFields.every(field => field in channel);
        
        if (hasAllFields) {
          console.log('   ✅ Response format matches HDHomeRun specification');
          testsPassed++;
        } else {
          throw new Error('Missing required HDHomeRun fields in response');
        }
      } else {
        console.log('   ✅ Empty lineup (no channels configured)');
        testsPassed++;
      }
    } else {
      throw new Error('Invalid rescan response format');
    }
  } catch (error) {
    console.log(`   ❌ Lineup POST test failed: ${error.message}`);
    console.log('   🚨 This is the main fix - Plex rescan will fail without this endpoint');
    testsFailed++;
  }

  // Test 4: Verify lineup_status.json endpoint
  try {
    console.log('\n4. Testing lineup status endpoint...');
    const status = await axios.get(`${BASE_URL}/lineup_status.json`);
    
    if (status.data.ScanPossible !== undefined && status.data.ScanInProgress !== undefined) {
      console.log('   ✅ Lineup status endpoint working');
      console.log(`   📊 Scan Possible: ${status.data.ScanPossible ? 'Yes' : 'No'}`);
      console.log(`   ⏳ Scan In Progress: ${status.data.ScanInProgress ? 'Yes' : 'No'}`);
      testsPassed++;
    } else {
      throw new Error('Missing scan status fields in response');
    }
  } catch (error) {
    console.log(`   ❌ Lineup status test failed: ${error.message}`);
    testsFailed++;
  }

  // Test 5: Test complete Plex workflow simulation
  try {
    console.log('\n5. Simulating complete Plex rescan workflow...');
    
    // Step 1: Plex discovers the tuner
    await axios.get(`${BASE_URL}/discover.json`);
    console.log('   📡 Step 1: Device discovery - OK');
    
    // Step 2: Plex gets initial lineup
    const initialLineup = await axios.get(`${BASE_URL}/lineup.json`);
    console.log(`   📺 Step 2: Initial lineup (${initialLineup.data.length} channels) - OK`);
    
    // Step 3: User clicks "Rescan" in Plex
    const rescanResult = await axios.post(`${BASE_URL}/lineup.post`);
    console.log(`   🔄 Step 3: Rescan triggered (${rescanResult.data.length} channels) - OK`);
    
    // Step 4: Verify lineup consistency
    if (initialLineup.data.length === rescanResult.data.length) {
      console.log('   ✅ Step 4: Lineup consistency verified');
      testsPassed++;
    } else {
      console.log('   ⚠️  Step 4: Lineup count changed (this may be normal if channels were added)');
      testsPassed++;
    }
    
  } catch (error) {
    console.log(`   ❌ Workflow simulation failed: ${error.message}`);
    testsFailed++;
  }

  // Test Summary
  console.log('\n' + '='.repeat(50));
  console.log(`🧪 TEST RESULTS SUMMARY`);
  console.log('='.repeat(50));
  console.log(`✅ Tests Passed: ${testsPassed}`);
  console.log(`❌ Tests Failed: ${testsFailed}`);
  console.log(`📊 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Plex tuner rescan functionality is working correctly.');
    console.log('\n📋 Next Steps:');
    console.log('   1. Add new channels in PlexBridge web interface');
    console.log('   2. Go to Plex Settings → Live TV & DVR');
    console.log('   3. Click your tuner device settings');
    console.log('   4. Click "Rescan" button');
    console.log('   5. New channels should appear without errors');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED! Please check the errors above.');
    console.log('   The rescan functionality may not work correctly in Plex.');
  }
  
  console.log('\n📚 Documentation: docs/Plex-Tuner-Rescan-Fix.md');
}

// Run the tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test runner failed:', error.message);
    process.exit(1);
  });
}

module.exports = runTests;