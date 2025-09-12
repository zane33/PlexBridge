const axios = require('axios');

async function testStream() {
  const ChannelId = 'c83e4187-f358-45b0-81ce-05bc2567cf08';
  const streamUrl = `http://192.168.3.148:3000/stream/${ChannelId}`;
  
  console.log('🦊 Testing  Cricket Stream in Detail');
  console.log('=====================================');
  
  // Test 1: HEAD request (working)
  console.log('\n1. HEAD Request Test:');
  try {
    const headResponse = await axios.head(streamUrl, {
      timeout: 5000,
      headers: { 'User-Agent': 'Lavf/LIBAVFORMAT_VERSION' }
    });
    console.log(`   ✅ Status: ${headResponse.status}`);
    console.log(`   ✅ Content-Type: ${headResponse.headers['content-type']}`);
  } catch (error) {
    console.log(`   ❌ HEAD failed: ${error.message}`);
  }
  
  // Test 2: GET request with minimal timeout (failing)
  console.log('\n2. GET Request Test (2 second timeout):');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    const getResponse = await axios.get(streamUrl, {
      timeout: 10000,
      responseType: 'stream',
      signal: controller.signal,
      headers: { 'User-Agent': 'Lavf/LIBAVFORMAT_VERSION' }
    });
    
    clearTimeout(timeout);
    
    console.log(`   Status: ${getResponse.status}`);
    console.log(`   Content-Type: ${getResponse.headers['content-type']}`);
    
    // Try to read some data
    let dataReceived = false;
    getResponse.data.on('data', (chunk) => {
      if (!dataReceived) {
        dataReceived = true;
        console.log(`   ✅ Data received: ${chunk.length} bytes`);
        console.log(`   First 4 bytes: ${chunk.slice(0, 4).toString('hex')}`);
        getResponse.data.destroy();
      }
    });
    
    getResponse.data.on('error', (error) => {
      console.log(`   ❌ Stream error: ${error.message}`);
    });
    
    // Wait a bit for data
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    if (!dataReceived) {
      console.log(`   ⚠️ No data received in 1.5 seconds`);
    }
    
  } catch (error) {
    console.log(`   ❌ GET failed: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Content-Type: ${error.response.headers['content-type']}`);
    }
  }
  
  // Test 3: Check what the redirect should resolve to
  console.log('\n3. Direct Stream URL Test:');
  const directUrl = 'http://line.premiumpowers.net:80/fc98427248/ab83b073d8/1520176';
  
  try {
    // Test the redirect
    const redirectResponse = await axios.get(directUrl, {
      maxRedirects: 0,
      timeout: 5000,
      validateStatus: () => true,
      headers: { 'User-Agent': 'IPTVSmarters/1.0' }
    });
    
    console.log(`   Redirect status: ${redirectResponse.status}`);
    if (redirectResponse.headers.location) {
      console.log(`   Redirect to: ${redirectResponse.headers.location}`);
      
      // Test the redirected URL
      const finalUrl = redirectResponse.headers.location;
      console.log('\n4. Testing Final Redirected URL:');
      try {
        const finalResponse = await axios.head(finalUrl, {
          timeout: 5000,
          headers: { 'User-Agent': 'IPTVSmarters/1.0' }
        });
        console.log(`   ✅ Final URL accessible: ${finalResponse.status}`);
        console.log(`   Content-Type: ${finalResponse.headers['content-type']}`);
      } catch (finalError) {
        console.log(`   ❌ Final URL failed: ${finalError.message}`);
      }
    }
    
  } catch (error) {
    console.log(`   ❌ Redirect test failed: ${error.message}`);
  }
}

testStream().catch(console.error);