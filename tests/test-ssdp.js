#!/usr/bin/env node

/**
 * Test script to verify SSDP device name updates
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

async function testSSDPEndpoints() {
  console.log('🔧 Testing SSDP Device Name Updates');
  console.log('===================================');
  console.log(`Testing server at: ${BASE_URL}`);
  console.log('');

  try {
    // Test discover.json endpoint
    console.log('📍 Testing /discover.json...');
    const discoverResponse = await axios.get(`${BASE_URL}/discover.json`);
    console.log('   FriendlyName:', discoverResponse.data.FriendlyName);
    console.log('   TunerCount:', discoverResponse.data.TunerCount);
    console.log('');

    // Test device.xml endpoint
    console.log('📍 Testing /device.xml...');
    const deviceResponse = await axios.get(`${BASE_URL}/device.xml`);
    const friendlyNameMatch = deviceResponse.data.match(/<friendlyName>(.*?)<\/friendlyName>/);
    if (friendlyNameMatch) {
      console.log('   FriendlyName from XML:', friendlyNameMatch[1]);
    }
    console.log('');

    // Test current settings
    console.log('📍 Testing current settings...');
    const settingsResponse = await axios.get(`${BASE_URL}/api/settings`);
    const deviceName = settingsResponse.data?.plexlive?.device?.name;
    console.log('   Device name in settings:', deviceName);
    console.log('');

    // Update device name
    console.log('📍 Updating device name...');
    const newDeviceName = `PlexBridge-Test-${Date.now()}`;
    const updateResponse = await axios.put(`${BASE_URL}/api/settings`, {
      plexlive: {
        device: {
          name: newDeviceName
        }
      }
    });
    console.log('   Update response status:', updateResponse.status);
    console.log('   New device name set to:', newDeviceName);
    console.log('');

    // Wait a moment for the change to propagate
    console.log('⏱️  Waiting 3 seconds for changes to propagate...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test endpoints again to see if name updated
    console.log('📍 Testing /discover.json after update...');
    const discoverResponse2 = await axios.get(`${BASE_URL}/discover.json`);
    console.log('   FriendlyName after update:', discoverResponse2.data.FriendlyName);
    
    console.log('📍 Testing /device.xml after update...');
    const deviceResponse2 = await axios.get(`${BASE_URL}/device.xml`);
    const friendlyNameMatch2 = deviceResponse2.data.match(/<friendlyName>(.*?)<\/friendlyName>/);
    if (friendlyNameMatch2) {
      console.log('   FriendlyName from XML after update:', friendlyNameMatch2[1]);
    }
    console.log('');

    // Verify the change was applied
    if (discoverResponse2.data.FriendlyName === newDeviceName) {
      console.log('✅ SUCCESS: Device name updated correctly in discover.json');
    } else {
      console.log('❌ FAILED: Device name not updated in discover.json');
      console.log('   Expected:', newDeviceName);
      console.log('   Got:', discoverResponse2.data.FriendlyName);
    }

    if (friendlyNameMatch2 && friendlyNameMatch2[1] === newDeviceName) {
      console.log('✅ SUCCESS: Device name updated correctly in device.xml');
    } else {
      console.log('❌ FAILED: Device name not updated in device.xml');
      console.log('   Expected:', newDeviceName);
      console.log('   Got:', friendlyNameMatch2 ? friendlyNameMatch2[1] : 'Not found');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
  }
}

// Run the test
testSSDPEndpoints();