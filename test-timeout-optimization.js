const axios = require('axios');

const localUrl = 'http://192.168.4.56:3000';
const streamUrl = 'http://38.64.138.128:8089/live/86544787/4964672797/820994.m3u8';

async function testTimeoutOptimizations() {
  console.log('=== TESTING TIMEOUT OPTIMIZATIONS FOR 15-SECOND UPSTREAM ===\n');
  
  const startTime = Date.now();
  
  try {
    console.log('1. Testing VLC-compatible request with extended timeout...');
    
    // Test with VLC User-Agent (should get standard delays)
    const vlcResponse = await axios.get(streamUrl, {
      headers: {
        'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
        'Accept': '*/*',
        'Connection': 'close'
      },
      timeout: 45000, // Test with new 45-second timeout
      maxRedirects: 10
    });
    
    const vlcTime = Date.now() - startTime;
    
    console.log('✅ VLC request SUCCESS!');
    console.log(`Time taken: ${vlcTime}ms`);
    console.log('Status:', vlcResponse.status);
    console.log('Content-Type:', vlcResponse.headers['content-type']);
    console.log('Content length:', vlcResponse.data.length);
    console.log('First 200 chars:', vlcResponse.data.substring(0, 200));
    
  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.log('❌ VLC request FAILED');
    console.log(`Time taken: ${errorTime}ms`);
    console.log('Error:', error.message);
    console.log('Status:', error.response?.status);
    
    if (error.code === 'ECONNABORTED') {
      console.log('🔍 TIMEOUT ERROR - This indicates upstream is taking longer than expected');
    }
  }
  
  console.log('\n2. Testing Plex client request (should get reduced delays)...');
  
  try {
    const plexStartTime = Date.now();
    
    // Test with Plex User-Agent (should get reduced delays)
    const plexResponse = await axios.get(streamUrl, {
      headers: {
        'User-Agent': 'Plex Media Player/2.58.2',
        'Accept': '*/*',
        'Connection': 'close'
      },
      timeout: 45000,
      maxRedirects: 10
    });
    
    const plexTime = Date.now() - plexStartTime;
    
    console.log('✅ Plex request SUCCESS!');
    console.log(`Time taken: ${plexTime}ms`);
    console.log('Status:', plexResponse.status);
    
  } catch (error) {
    const plexErrorTime = Date.now() - startTime;
    console.log('❌ Plex request FAILED');
    console.log(`Time taken: ${plexErrorTime}ms`);
    console.log('Error:', error.message);
  }
  
  console.log('\n3. Testing PlexBridge stream proxy with new timeouts...');
  
  try {
    const proxyStartTime = Date.now();
    
    // Test through PlexBridge (should handle long upstream connections)
    const proxyResponse = await axios.get(`${localUrl}/streams/preview/test-stream`, {
      params: { url: streamUrl },
      timeout: 60000, // Even longer timeout for testing
      maxContentLength: 1024 * 1024
    });
    
    const proxyTime = Date.now() - proxyStartTime;
    
    console.log('✅ PlexBridge proxy SUCCESS!');
    console.log(`Time taken: ${proxyTime}ms`);
    console.log('Status:', proxyResponse.status);
    
  } catch (error) {
    const proxyErrorTime = Date.now() - proxyStartTime;
    console.log('❌ PlexBridge proxy FAILED');
    console.log(`Time taken: ${proxyErrorTime}ms`);
    console.log('Error:', error.message);
    console.log('Status:', error.response?.status);
    
    if (error.response?.status === 404) {
      console.log('🔍 404 Expected - testing stream validation instead');
    }
  }
  
  console.log('\n4. Testing stream validation endpoint...');
  
  try {
    const validationStartTime = Date.now();
    
    const validationResponse = await axios.post(`${localUrl}/api/streams/validate`, {
      url: streamUrl,
      type: 'hls'
    }, {
      timeout: 60000
    });
    
    const validationTime = Date.now() - validationStartTime;
    
    console.log('✅ Stream validation SUCCESS!');
    console.log(`Time taken: ${validationTime}ms`);
    console.log('Response:', JSON.stringify(validationResponse.data, null, 2));
    
  } catch (error) {
    const validationErrorTime = Date.now() - validationStartTime;
    console.log('❌ Stream validation FAILED');
    console.log(`Time taken: ${validationErrorTime}ms`);
    console.log('Error:', error.response?.data || error.message);
  }
  
  console.log('\n=== TIMEOUT OPTIMIZATION TEST COMPLETE ===');
  console.log('\nKey Improvements:');
  console.log('- Connection Manager timeout: 30s → 45s');
  console.log('- Stream Manager timeout: 30s → 45s'); 
  console.log('- FFmpeg timeout: 30s → 45s');
  console.log('- Problematic server timeout: 30s → 45s');
  console.log('\nThis should handle 15-second upstream connections gracefully.');
}

testTimeoutOptimizations().catch(console.error);