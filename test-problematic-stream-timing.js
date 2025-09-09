const axios = require('axios');

// The problematic Sky Sport SELECT NZ stream
const problematicStreamUrl = 'http://38.64.138.128:8089/live/86544787/4964672797/820994.m3u8';
const localPlexBridge = 'http://192.168.4.56:3000';

async function testProblematicStreamTiming() {
  console.log('=== TESTING PROBLEMATIC STREAM START TIME ===\n');
  console.log('Stream URL:', problematicStreamUrl);
  console.log('Testing with VLC connection manager optimizations\n');
  
  // Test 1: Direct stream access (VLC client simulation)
  console.log('1. Testing DIRECT stream access (VLC simulation)...');
  const directStartTime = Date.now();
  
  try {
    const directResponse = await axios.get(problematicStreamUrl, {
      headers: {
        'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
        'Accept': '*/*',
        'Connection': 'close'
      },
      timeout: 45000,
      maxRedirects: 10,
      maxContentLength: 1024 * 1024
    });
    
    const directTime = Date.now() - directStartTime;
    
    console.log('✅ DIRECT STREAM SUCCESS!');
    console.log(`⏱️  Time to start: ${directTime}ms (${(directTime/1000).toFixed(2)} seconds)`);
    console.log('📊 Status:', directResponse.status);
    console.log('📄 Content-Type:', directResponse.headers['content-type']);
    console.log('📏 M3U8 size:', directResponse.data.length, 'characters');
    console.log('🔍 First line:', directResponse.data.split('\n')[0]);
    
    // Analyze M3U8 content
    const segmentCount = (directResponse.data.match(/#EXTINF/g) || []).length;
    console.log('🎬 Segments found:', segmentCount);
    
  } catch (error) {
    const directErrorTime = Date.now() - directStartTime;
    console.log('❌ DIRECT STREAM FAILED');
    console.log(`⏱️  Time to failure: ${directErrorTime}ms (${(directErrorTime/1000).toFixed(2)} seconds)`);
    console.log('🚫 Error:', error.message);
    console.log('📊 Status:', error.response?.status);
    if (error.response?.status === 403) {
      console.log('🔒 IP still blocked - connection manager delays needed');
    }
  }
  
  // Test 2: Plex client simulation (should be faster)
  console.log('\n2. Testing PLEX CLIENT simulation (should be faster)...');
  const plexStartTime = Date.now();
  
  try {
    const plexResponse = await axios.get(problematicStreamUrl, {
      headers: {
        'User-Agent': 'Plex Media Player/2.58.2 (Windows 10)',
        'Accept': '*/*',
        'Connection': 'close'
      },
      timeout: 45000,
      maxRedirects: 10,
      maxContentLength: 1024 * 1024
    });
    
    const plexTime = Date.now() - plexStartTime;
    
    console.log('✅ PLEX CLIENT SUCCESS!');
    console.log(`⏱️  Time to start: ${plexTime}ms (${(plexTime/1000).toFixed(2)} seconds)`);
    console.log('📊 Status:', plexResponse.status);
    console.log('🚀 Speed improvement vs direct:', directTime ? `${((directTime - plexTime)/directTime * 100).toFixed(1)}%` : 'N/A');
    
  } catch (error) {
    const plexErrorTime = Date.now() - plexStartTime;
    console.log('❌ PLEX CLIENT FAILED');
    console.log(`⏱️  Time to failure: ${plexErrorTime}ms (${(plexErrorTime/1000).toFixed(2)} seconds)`);
    console.log('🚫 Error:', error.message);
  }
  
  // Test 3: Through PlexBridge stream proxy
  console.log('\n3. Testing THROUGH PLEXBRIDGE (actual Plex usage)...');
  
  // First get the Sky Sport SELECT channel ID from lineup
  try {
    const lineupResponse = await axios.get(`${localPlexBridge}/lineup.json`);
    const skySelectChannel = lineupResponse.data.find(ch => ch.GuideName.includes('Sky Sport SELECT'));
    
    if (skySelectChannel) {
      console.log('🎯 Found Sky Sport SELECT channel:', skySelectChannel.GuideName);
      console.log('🔗 Stream URL:', skySelectChannel.URL);
      
      const proxyStartTime = Date.now();
      
      try {
        // Test the actual Plex stream URL
        const proxyResponse = await axios.get(skySelectChannel.URL, {
          headers: {
            'User-Agent': 'Plex Media Player/2.58.2 (Windows 10)'
          },
          timeout: 60000,
          maxContentLength: 10 * 1024 // Just get first 10KB
        });
        
        const proxyTime = Date.now() - proxyStartTime;
        
        console.log('✅ PLEXBRIDGE PROXY SUCCESS!');
        console.log(`⏱️  Time to start streaming: ${proxyTime}ms (${(proxyTime/1000).toFixed(2)} seconds)`);
        console.log('📊 Status:', proxyResponse.status);
        console.log('📄 Content-Type:', proxyResponse.headers['content-type']);
        console.log('🎬 Stream started successfully');
        
      } catch (error) {
        const proxyErrorTime = Date.now() - proxyStartTime;
        console.log('❌ PLEXBRIDGE PROXY FAILED');
        console.log(`⏱️  Time to failure: ${proxyErrorTime}ms (${(proxyErrorTime/1000).toFixed(2)} seconds)`);
        console.log('🚫 Error:', error.message);
        console.log('📊 Status:', error.response?.status);
      }
      
    } else {
      console.log('⚠️  Sky Sport SELECT channel not found in lineup');
      console.log('📋 Available channels:', lineupResponse.data.map(ch => ch.GuideName).join(', '));
    }
    
  } catch (error) {
    console.log('❌ Could not get lineup:', error.message);
  }
  
  console.log('\n=== PROBLEMATIC STREAM TIMING TEST COMPLETE ===');
  console.log('\n📈 Summary:');
  console.log('- Tests measure actual connection time to problematic IPTV server');
  console.log('- VLC connection manager should prevent 403 errors');
  console.log('- Plex clients should get faster response due to adaptive delays');
  console.log('- PlexBridge proxy represents real-world Plex usage');
}

testProblematicStreamTiming().catch(console.error);