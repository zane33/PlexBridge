const axios = require('axios');

async function testDirect() {
  // Test the exact redirected URL that PlexBridge should be using
  const redirectedUrl = 'http://85.92.112.107:80/live/play/ZHl0ME1rZG5NR1Y0VDBrd1kwOVVlVkZqWWtsNlpuYzlVWGxrYzFnMWJtMTBPRWQwWmxVMWNETkJNRDA9/1520176';
  
  console.log('🦊 Testing  Cricket Redirected URL Direct');
  console.log('===========================================');
  console.log(`URL: ${redirectedUrl}`);
  
  // Test 1: HEAD request
  console.log('\n1. HEAD Request Test:');
  try {
    const headResponse = await axios.head(redirectedUrl, {
      timeout: 5000,
      headers: { 'User-Agent': 'IPTVSmarters/1.0' }
    });
    console.log(`   ✅ Status: ${headResponse.status}`);
    console.log(`   ✅ Content-Type: ${headResponse.headers['content-type']}`);
    console.log(`   ✅ Content-Length: ${headResponse.headers['content-length'] || 'not set'}`);
  } catch (error) {
    console.log(`   ❌ HEAD failed: ${error.message}`);
  }
  
  // Test 2: GET request to see if we get actual data
  console.log('\n2. GET Request Test (first 5 seconds):');
  try {
    const response = await axios.get(redirectedUrl, {
      timeout: 10000,
      responseType: 'stream',
      headers: { 'User-Agent': 'IPTVSmarters/1.0' }
    });
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers['content-type']}`);
    
    let bytesReceived = 0;
    let isValidMpegTS = false;
    
    // Monitor the stream for 5 seconds
    const streamPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        response.data.destroy();
        resolve();
      }, 5000);
      
      response.data.on('data', (chunk) => {
        bytesReceived += chunk.length;
        
        // Check if first byte is MPEG-TS sync byte (0x47)
        if (!isValidMpegTS && chunk[0] === 0x47) {
          isValidMpegTS = true;
          console.log(`   ✅ Valid MPEG-TS stream detected (sync byte: 0x47)`);
        }
        
        // Log first data chunk
        if (bytesReceived <= chunk.length) {
          console.log(`   📊 First chunk: ${chunk.length} bytes`);
          console.log(`   📊 First 8 bytes: ${chunk.slice(0, 8).toString('hex')}`);
        }
      });
      
      response.data.on('end', () => {
        clearTimeout(timeout);
        console.log(`   ✅ Stream ended gracefully`);
        resolve();
      });
      
      response.data.on('error', (error) => {
        clearTimeout(timeout);
        console.log(`   ❌ Stream error: ${error.message}`);
        resolve();
      });
    });
    
    await streamPromise;
    
    console.log(`   📊 Total bytes received: ${bytesReceived}`);
    if (bytesReceived > 0) {
      console.log(`   📊 Average bitrate: ${Math.round((bytesReceived * 8) / 5)} bps`);
      console.log(`   ✅  Cricket redirected URL is streaming successfully!`);
    } else {
      console.log(`   ❌ No data received from redirected URL`);
    }
    
  } catch (error) {
    console.log(`   ❌ GET failed: ${error.message}`);
  }
}

testDirect().catch(console.error);