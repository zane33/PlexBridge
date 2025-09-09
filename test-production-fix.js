const axios = require('axios');

// Production Sky Sport SELECT NZ URL with correct credentials
const productionStream = 'http://38.64.138.128:8089/live/86544787/4964672797/820994.m3u8';
const productionUrl = 'http://192.168.4.56:3000';

async function testProductionFix() {
  console.log('=== TESTING PRODUCTION VLC-COMPATIBLE CONNECTION FIX ===\n');
  
  try {
    console.log('1. Testing production stream validation...');
    console.log('Stream URL:', productionStream);
    console.log('Production URL:', productionUrl);
    
    const validationResponse = await axios.post(`${productionUrl}/api/streams/validate`, {
      url: productionStream,
      type: 'hls'
    }, {
      timeout: 60000  // 60 second timeout
    });
    
    console.log('✅ Production validation SUCCESS!');
    console.log('Response:', JSON.stringify(validationResponse.data, null, 2));
    
  } catch (error) {
    console.log('❌ Production validation FAILED');
    console.log('Error:', error.response?.data || error.message);
    console.log('Status:', error.response?.status);
    
    if (error.response?.status === 403) {
      console.log('🚫 Still getting 403 - IP may still be blocked, checking connection manager logs...');
    }
  }
  
  console.log('\n2. Testing direct connection manager approach...');
  
  try {
    // Test the connection manager directly
    const testResponse = await axios.get(`${productionUrl}/api/streams/test`, {
      params: { url: productionStream },
      timeout: 60000
    });
    
    console.log('✅ Connection Manager test SUCCESS!');
    console.log('Response length:', testResponse.data.length);
    console.log('First 200 chars:', testResponse.data.substring(0, 200));
    
  } catch (error) {
    console.log('❌ Connection Manager test FAILED');
    console.log('Error:', error.response?.data || error.message);
    console.log('Status:', error.response?.status);
    
    if (error.response?.status === 403) {
      console.log('🔍 This confirms the IP blocking issue - VLC-compatible delays should resolve this');
    }
  }
  
  console.log('\n3. Checking container logs for connection manager activity...');
}

testProductionFix().catch(console.error);