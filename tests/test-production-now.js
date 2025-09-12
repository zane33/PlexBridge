const axios = require('axios');

const PRODUCTION_URL = 'http://192.168.3.148:3000';

async function testChannels() {
  console.log('🔍 Testing PlexBridge Production Instance');
  console.log('==========================================');
  console.log(`URL: ${PRODUCTION_URL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // First, get all channels
  try {
    console.log('📡 Fetching channels list...');
    const channelsResponse = await axios.get(`${PRODUCTION_URL}/api/channels`);
    const channels = channelsResponse.data;
    console.log(`Found ${channels.length} channels\n`);

    // Test specific channels
    const testChannels = [
      ' 1',
      ' 2', 
      ' Cricket',
      ' Sports',
      ' Sport'
    ];

    for (const searchName of testChannels) {
      const channel = channels.find(c => 
        c.name?.toLowerCase().includes(searchName.toLowerCase())
      );

      if (channel) {
        console.log(`\n📺 Testing: ${channel.name} (ID: ${channel.id})`);
        console.log('─'.repeat(50));
        
        // Test the stream endpoint as Plex would
        await testStreamEndpoint(channel);
        
        // Get the actual stream URL
        await getStreamUrl(channel.id);
      } else {
        console.log(`\n⚠️  Channel not found: ${searchName}`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to fetch channels:', error.message);
  }
}

async function testStreamEndpoint(channel) {
  const streamUrl = `${PRODUCTION_URL}/stream/${channel.id}`;
  
  // Test 1: HEAD request (as Plex does first)
  try {
    console.log('  1️⃣ HEAD request test...');
    const headResponse = await axios.head(streamUrl, {
      timeout: 10000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Lavf/LIBAVFORMAT_VERSION'
      }
    });
    
    console.log(`     Status: ${headResponse.status} ${headResponse.statusText}`);
    console.log(`     Content-Type: ${headResponse.headers['content-type'] || 'not set'}`);
    
    if (headResponse.status !== 200) {
      console.log(`     ⚠️ Non-200 status code!`);
    }
  } catch (error) {
    console.log(`     ❌ HEAD failed: ${error.message}`);
  }

  // Test 2: GET request with small range
  try {
    console.log('  2️⃣ GET request test (first 10KB)...');
    const getResponse = await axios.get(streamUrl, {
      timeout: 10000,
      responseType: 'arraybuffer',
      maxContentLength: 10240,
      maxBodyLength: 10240,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Lavf/LIBAVFORMAT_VERSION',
        'Range': 'bytes=0-10239'
      }
    });
    
    console.log(`     Status: ${getResponse.status} ${getResponse.statusText}`);
    console.log(`     Content-Type: ${getResponse.headers['content-type'] || 'not set'}`);
    console.log(`     Data received: ${getResponse.data.length} bytes`);
    
    // Check if it's HTML (error page) or MPEG-TS
    const isHtml = getResponse.headers['content-type']?.includes('html');
    const isMpegTs = getResponse.headers['content-type']?.includes('mp2t');
    
    if (isHtml) {
      console.log(`     ❌ ERROR: Received HTML instead of video stream!`);
      const htmlSnippet = Buffer.from(getResponse.data).toString('utf-8').substring(0, 200);
      console.log(`     HTML snippet: ${htmlSnippet}`);
    } else if (isMpegTs) {
      console.log(`     ✅ Correct: MPEG-TS stream`);
      // Check for MPEG-TS sync byte
      const data = Buffer.from(getResponse.data);
      if (data.length > 0 && data[0] === 0x47) {
        console.log(`     ✅ Valid MPEG-TS data (sync byte: 0x47)`);
      } else if (data.length === 0) {
        console.log(`     ⚠️ WARNING: Empty response (0 bytes)`);
      } else {
        console.log(`     ⚠️ First byte: 0x${data[0]?.toString(16)} (expected 0x47)`);
      }
    } else {
      console.log(`     ❓ Unknown content type: ${getResponse.headers['content-type']}`);
    }
    
  } catch (error) {
    console.log(`     ❌ GET failed: ${error.message}`);
  }

  // Test 3: Try without Range header (full stream)
  try {
    console.log('  3️⃣ GET request test (no range, 1 second timeout)...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    
    const getResponse = await axios.get(streamUrl, {
      timeout: 5000,
      responseType: 'stream',
      validateStatus: () => true,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Lavf/LIBAVFORMAT_VERSION'
      }
    });
    
    clearTimeout(timeout);
    
    console.log(`     Status: ${getResponse.status} ${getResponse.statusText}`);
    console.log(`     Content-Type: ${getResponse.headers['content-type'] || 'not set'}`);
    
    // Try to read first chunk
    let firstChunk = null;
    getResponse.data.on('data', (chunk) => {
      if (!firstChunk) {
        firstChunk = chunk;
        console.log(`     First chunk size: ${chunk.length} bytes`);
        if (chunk[0] === 0x47) {
          console.log(`     ✅ Valid MPEG-TS stream`);
        }
        getResponse.data.destroy(); // Stop reading
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (!firstChunk) {
      console.log(`     ⚠️ No data received in 500ms`);
    }
    
  } catch (error) {
    if (error.code === 'ERR_CANCELED') {
      console.log(`     ✅ Stream is flowing (aborted after 1 second)`);
    } else {
      console.log(`     ❌ Stream test failed: ${error.message}`);
    }
  }
}

async function getStreamUrl(channelId) {
  try {
    console.log('  4️⃣ Getting actual stream URL from database...');
    const streamsResponse = await axios.get(`${PRODUCTION_URL}/api/streams`);
    const streams = streamsResponse.data;
    const stream = streams.find(s => s.channel_id === channelId);
    
    if (stream) {
      console.log(`     Stream URL: ${stream.url}`);
      console.log(`     Stream type: ${stream.type || 'not set'}`);
      
      // Test the direct stream URL
      await testDirectUrl(stream.url);
    } else {
      console.log(`     ❌ No stream found for channel`);
    }
  } catch (error) {
    console.log(`     ❌ Failed to get stream: ${error.message}`);
  }
}

async function testDirectUrl(url) {
  console.log('  5️⃣ Testing direct stream URL...');
  
  try {
    // First try with standard headers
    const response1 = await axios.head(url, {
      timeout: 5000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'PlexBridge/1.0'
      }
    });
    
    console.log(`     Standard headers: ${response1.status} ${response1.statusText}`);
    console.log(`     Content-Type: ${response1.headers['content-type']}`);
    console.log(`     Content-Length: ${response1.headers['content-length'] || 'not set'}`);
    
    if (response1.headers['content-length'] === '0') {
      console.log(`     ⚠️ Stream returns 0 bytes with standard headers`);
      
      // Try with IPTV headers
      console.log('     Trying with IPTV headers...');
      const response2 = await axios.head(url, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'IPTVSmarters/1.0'
        }
      });
      
      console.log(`     IPTV headers: ${response2.status} ${response2.statusText}`);
      console.log(`     Content-Type: ${response2.headers['content-type']}`);
      console.log(`     Content-Length: ${response2.headers['content-length'] || 'not set'}`);
      
      if (response2.request.responseURL !== url) {
        console.log(`     ✅ Redirected to: ${response2.request.responseURL}`);
      }
    }
    
  } catch (error) {
    console.log(`     ❌ Direct test failed: ${error.message}`);
  }
}

// Run the tests
testChannels().catch(console.error);