const axios = require('axios');

const problematicStream = 'http://38.64.138.128:8089/live/4862347298/4964672797/820994.m3u8';
const baseUrl = 'http://localhost:8080';

async function testVLCFix() {
  console.log('=== TESTING VLC-COMPATIBLE CONNECTION FIX ===\n');
  
  try {
    console.log('1. Testing PlexBridge stream validation...');
    const validationResponse = await axios.post(`${baseUrl}/api/streams/validate`, {
      url: problematicStream,
      type: 'hls'
    }, {
      timeout: 60000  // 60 second timeout
    });
    
    console.log('✅ PlexBridge validation SUCCESS!');
    console.log('Response:', JSON.stringify(validationResponse.data, null, 2));
    
  } catch (error) {
    console.log('❌ PlexBridge validation FAILED');
    console.log('Error:', error.response?.data || error.message);
    console.log('Status:', error.response?.status);
    
    if (error.response?.status === 403) {
      console.log('🚫 Still getting 403 Forbidden - connection fix may need adjustment');
    }
  }
  
  console.log('\n2. Testing direct stream test endpoint...');
  
  try {
    const testResponse = await axios.get(`${baseUrl}/api/streams/test`, {
      params: { url: problematicStream },
      timeout: 60000
    });
    
    console.log('✅ Stream test SUCCESS!');
    console.log('Response length:', testResponse.data.length);
    console.log('First 200 chars:', testResponse.data.substring(0, 200));
    
  } catch (error) {
    console.log('❌ Stream test FAILED');
    console.log('Error:', error.response?.data || error.message);
    console.log('Status:', error.response?.status);
  }
  
  console.log('\n3. Testing connection manager directly...');
  
  try {
    // Import connection manager and test it directly
    const ConnectionManager = require('./server/utils/connectionManager');
    
    console.log('Making direct connection manager request...');
    const response = await ConnectionManager.makeVLCCompatibleRequest(axios, problematicStream, {
      maxContentLength: 1024 * 1024 // 1MB limit
    });
    
    console.log('✅ Connection Manager SUCCESS!');
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers['content-type']);
    console.log('Content length:', response.data.length);
    console.log('First 200 chars:', response.data.substring(0, 200));
    
  } catch (error) {
    console.log('❌ Connection Manager FAILED');
    console.log('Error:', error.message);
    console.log('Status:', error.response?.status);
    
    if (error.response) {
      console.log('Response headers:', JSON.stringify(error.response.headers, null, 2));
      console.log('Response body:', error.response.data);
    }
  }
  
  console.log('\n=== TEST COMPLETE ===');
}

testVLCFix().catch(console.error);