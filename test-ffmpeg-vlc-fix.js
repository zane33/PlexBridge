const axios = require('axios');

const localUrl = 'http://192.168.4.56:3000';
const problematicStreamUrl = 'http://38.64.138.128:8089/live/86544787/4964672797/820994.m3u8';

async function testFFmpegVLCFix() {
  console.log('=== TESTING FFMPEG VLC COMPATIBILITY FIX ===\n');
  console.log('Testing Sky Sport SELECT NZ problematic stream');
  console.log('Stream URL:', problematicStreamUrl);
  
  try {
    console.log('\n1. Getting Sky Sport SELECT channel from lineup...');
    
    const lineupResponse = await axios.get(`${localUrl}/lineup.json`);
    const skySelectChannel = lineupResponse.data.find(ch => ch.GuideName.includes('Sky Sport SELECT'));
    
    if (!skySelectChannel) {
      console.log('❌ Sky Sport SELECT channel not found in lineup');
      console.log('Available channels:', lineupResponse.data.map(ch => ch.GuideName).slice(0, 5));
      return;
    }
    
    console.log('✅ Found channel:', skySelectChannel.GuideName);
    console.log('🔗 Stream URL:', skySelectChannel.URL);
    
    console.log('\n2. Testing FFmpeg stream start (this should trigger connection pre-warming)...');
    const streamStartTime = Date.now();
    
    try {
      // Test the actual Plex stream URL that triggers FFmpeg
      const streamResponse = await axios.get(skySelectChannel.URL, {
        headers: {
          'User-Agent': 'Plex Media Player/2.58.2 (Windows 10)',
          'Accept': 'video/mp2t, */*'
        },
        timeout: 30000,  // Give FFmpeg time to start
        maxContentLength: 50 * 1024, // Get first 50KB
        responseType: 'stream'
      });
      
      const streamTime = Date.now() - streamStartTime;
      
      console.log('✅ FFMPEG STREAM SUCCESS!');
      console.log(`⏱️  Time to start: ${streamTime}ms (${(streamTime/1000).toFixed(2)} seconds)`);
      console.log('📊 Status:', streamResponse.status);
      console.log('📄 Content-Type:', streamResponse.headers['content-type']);
      console.log('🎬 FFmpeg process started successfully');
      
      // Check for MPEG-TS headers
      if (streamResponse.headers['content-type'] === 'video/mp2t') {
        console.log('✅ Correct MPEG-TS format for Plex');
      }
      
      // Monitor the first few bytes
      let dataReceived = 0;
      const startDataTime = Date.now();
      
      streamResponse.data.on('data', (chunk) => {
        dataReceived += chunk.length;
        if (dataReceived >= 10240) { // Stop after 10KB
          const dataTime = Date.now() - startDataTime;
          console.log(`📡 Data flowing: ${dataReceived} bytes in ${dataTime}ms`);
          streamResponse.data.destroy(); // Stop the stream
        }
      });
      
      streamResponse.data.on('end', () => {
        console.log('🏁 Stream ended naturally');
      });
      
      streamResponse.data.on('error', (error) => {
        console.log('⚠️  Stream error:', error.message);
      });
      
      // Wait a bit for data flow
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      const streamErrorTime = Date.now() - streamStartTime;
      console.log('❌ FFMPEG STREAM FAILED');
      console.log(`⏱️  Time to failure: ${streamErrorTime}ms (${(streamErrorTime/1000).toFixed(2)} seconds)`);
      console.log('🚫 Error:', error.message);
      console.log('📊 Status:', error.response?.status);
      
      if (error.response?.status === 500) {
        console.log('💡 500 error suggests FFmpeg process failed to start or crashed');
        console.log('   This could indicate the VLC compatibility fix is still needed');
      }
    }
    
    console.log('\n3. Checking container logs for connection pre-warming...');
    
    try {
      const logsResponse = await axios.get(`${localUrl}/api/logs?limit=10&level=debug`);
      const relevantLogs = logsResponse.data.filter(log => 
        log.message.includes('Pre-warming') || 
        log.message.includes('VLC-compatible') ||
        log.message.includes('38.64.138.128')
      );
      
      if (relevantLogs.length > 0) {
        console.log('✅ Found connection pre-warming logs:');
        relevantLogs.forEach(log => {
          console.log(`   ${log.timestamp}: ${log.message}`);
        });
      } else {
        console.log('⚠️  No pre-warming logs found - may need to check implementation');
      }
      
    } catch (error) {
      console.log('❌ Could not check logs:', error.message);
    }
    
  } catch (error) {
    console.log('❌ Test setup failed:', error.message);
  }
  
  console.log('\n=== FFMPEG VLC COMPATIBILITY TEST COMPLETE ===');
  console.log('\n🔧 Key Fixes Applied:');
  console.log('- FFmpeg uses VLC User-Agent for problematic servers');
  console.log('- Connection: close header prevents connection pooling');
  console.log('- Connection pre-warming triggers VLC connection manager');
  console.log('- 45-second timeouts handle slow upstream connections');
  console.log('\n💡 Expected Result:');
  console.log('- No more 4XX Client Error from FFmpeg');
  console.log('- Successful stream startup within 10 seconds');
  console.log('- MPEG-TS data flowing to Plex clients');
}

testFFmpegVLCFix().catch(console.error);