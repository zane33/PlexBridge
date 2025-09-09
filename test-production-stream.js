const axios = require('axios');

// Production Sky Sport SELECT NZ stream details
const productionUrl = 'http://192.168.3.148:3000';
const streamUrl = 'http://38.64.138.128:8089/live/86544787/4964672797/820994.m3u8';
const streamId = '3da41d95-1088-4115-b86f-4f4ab5b81184';

async function testProductionStream() {
  console.log('=== TESTING PRODUCTION SKY SPORT SELECT NZ STREAM ===\n');
  console.log('Production PlexBridge:', productionUrl);
  console.log('Stream URL:', streamUrl);
  console.log('Stream ID:', streamId);
  
  try {
    console.log('\n1. Testing direct stream URL access...');
    
    // Test direct stream URL with VLC-compatible request (mimicking our connection manager)
    const directResponse = await axios.get(streamUrl, {
      headers: {
        'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
        'Accept': '*/*',
        'Connection': 'close'
      },
      timeout: 30000,
      maxRedirects: 10,
      maxContentLength: 1024 * 1024
    });
    
    console.log('✅ Direct stream URL SUCCESS!');
    console.log('Status:', directResponse.status);
    console.log('Content-Type:', directResponse.headers['content-type']);
    console.log('Content length:', directResponse.data.length);
    console.log('First 200 chars:', directResponse.data.substring(0, 200));
    
  } catch (error) {
    console.log('❌ Direct stream URL FAILED');
    console.log('Error:', error.message);
    console.log('Status:', error.response?.status);
    console.log('Response:', error.response?.data);
    
    if (error.response?.status === 403) {
      console.log('🔍 IP still blocked - VLC connection management should handle this');
    }
  }
  
  console.log('\n2. Testing PlexBridge stream proxy...');
  
  try {
    // Test stream through PlexBridge proxy
    const proxyResponse = await axios.get(`${productionUrl}/streams/preview/${streamId}`, {
      timeout: 30000,
      maxContentLength: 1024 * 1024
    });
    
    console.log('✅ PlexBridge stream proxy SUCCESS!');
    console.log('Status:', proxyResponse.status);
    console.log('Content-Type:', proxyResponse.headers['content-type']);
    console.log('Content length:', proxyResponse.data?.length || 'stream');
    
  } catch (error) {
    console.log('❌ PlexBridge stream proxy FAILED');
    console.log('Error:', error.message);
    console.log('Status:', error.response?.status);
    
    if (error.response?.status === 403) {
      console.log('🔍 This indicates the VLC connection fixes are needed');
    }
  }
  
  console.log('\n3. Testing Plex lineup (what Plex will see)...');
  
  try {
    // Test what Plex will see
    const lineupResponse = await axios.get(`${productionUrl}/lineup.json`);
    
    console.log('✅ Plex lineup SUCCESS!');
    
    // Find our Sky Sport SELECT channel
    const skySelectChannel = lineupResponse.data.find(ch => ch.GuideName === 'Sky Sport SELECT NZ');
    if (skySelectChannel) {
      console.log('Found Sky Sport SELECT NZ channel:', {
        GuideNumber: skySelectChannel.GuideNumber,
        GuideName: skySelectChannel.GuideName,
        URL: skySelectChannel.URL
      });
      
      console.log('\n4. Testing Plex stream URL...');
      try {
        const plexStreamResponse = await axios.get(skySelectChannel.URL, {
          timeout: 10000,
          maxContentLength: 1024
        });
        console.log('✅ Plex stream URL accessible!');
        console.log('Response type:', typeof plexStreamResponse.data);
      } catch (plexError) {
        console.log('❌ Plex stream URL failed:', plexError.message);
      }
    } else {
      console.log('❌ Sky Sport SELECT NZ channel not found in lineup');
    }
    
  } catch (error) {
    console.log('❌ Plex lineup FAILED');
    console.log('Error:', error.message);
  }
  
  console.log('\n=== TEST COMPLETE ===');
}

testProductionStream().catch(console.error);