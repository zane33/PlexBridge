const axios = require('axios');
const { spawn } = require('child_process');

const PRODUCTION_URL = 'http://192.168.3.148:3000';

// Channels you mentioned
const TEST_CHANNELS = {
  working: [
    { name: ' Sports 1', pattern: ' sports 1' },
    { name: ' 1', pattern: ' 1' }
  ],
  failing: [
    { name: ' Cricket 201 AU', pattern: ' cricket' },
    { name: ' Sports', pattern: ' sport' }
  ]
};

async function getChannels() {
  try {
    console.log(`\n📡 Fetching channels from ${PRODUCTION_URL}/api/channels`);
    const response = await axios.get(`${PRODUCTION_URL}/api/channels`);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch channels:', error.message);
    return [];
  }
}

async function getStreamInfo(channelId) {
  try {
    const response = await axios.get(`${PRODUCTION_URL}/api/streams`);
    const streams = response.data;
    return streams.find(s => s.channel_id === channelId);
  } catch (error) {
    console.error('❌ Failed to fetch streams:', error.message);
    return null;
  }
}

async function testStreamEndpoint(channelId, channelName) {
  console.log(`\n🔍 Testing stream endpoint for: ${channelName}`);
  
  const results = {
    channelName,
    channelId,
    endpoints: {}
  };

  // Test 1: HEAD request to check if endpoint responds
  try {
    console.log('  → Testing HEAD request...');
    const headResponse = await axios.head(`${PRODUCTION_URL}/stream/${channelId}`, {
      timeout: 10000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Lavf/LIBAVFORMAT_VERSION' // Plex user agent
      }
    });
    
    results.endpoints.head = {
      status: headResponse.status,
      statusText: headResponse.statusText,
      headers: {
        contentType: headResponse.headers['content-type'],
        server: headResponse.headers['server']
      }
    };
    
    console.log(`    ✓ HEAD Response: ${headResponse.status} ${headResponse.statusText}`);
  } catch (error) {
    results.endpoints.head = { error: error.message };
    console.log(`    ✗ HEAD Failed: ${error.message}`);
  }

  // Test 2: GET request with range to test actual streaming
  try {
    console.log('  → Testing GET request (first 10KB)...');
    const getResponse = await axios.get(`${PRODUCTION_URL}/stream/${channelId}`, {
      timeout: 10000,
      responseType: 'arraybuffer',
      maxContentLength: 10240, // 10KB limit
      maxBodyLength: 10240,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Lavf/LIBAVFORMAT_VERSION',
        'Range': 'bytes=0-10239'
      }
    });
    
    const isHtml = getResponse.headers['content-type']?.includes('html');
    const isMpegTs = getResponse.headers['content-type']?.includes('mp2t');
    
    results.endpoints.get = {
      status: getResponse.status,
      statusText: getResponse.statusText,
      contentType: getResponse.headers['content-type'],
      dataReceived: getResponse.data.length,
      isHtml,
      isMpegTs
    };
    
    if (isHtml) {
      // Try to extract error message from HTML
      const htmlContent = Buffer.from(getResponse.data).toString('utf-8').substring(0, 500);
      if (htmlContent.includes('error') || htmlContent.includes('Error')) {
        results.endpoints.get.htmlError = htmlContent;
      }
    }
    
    console.log(`    ✓ GET Response: ${getResponse.status} ${getResponse.statusText}`);
    console.log(`      Content-Type: ${getResponse.headers['content-type']}`);
    console.log(`      Data received: ${getResponse.data.length} bytes`);
    
    if (isHtml) {
      console.log(`    ⚠️  WARNING: Received HTML instead of video stream!`);
    }
    
  } catch (error) {
    results.endpoints.get = { error: error.message };
    console.log(`    ✗ GET Failed: ${error.message}`);
  }

  return results;
}

async function testStreamWithFFmpeg(channelId, channelName, streamUrl) {
  console.log(`\n🎬 Testing stream with FFmpeg: ${channelName}`);
  console.log(`  Stream URL: ${streamUrl}`);
  
  return new Promise((resolve) => {
    const results = {
      channelName,
      streamUrl,
      ffmpeg: {}
    };

    try {
      // Test direct stream URL with FFmpeg
      const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
        '-timeout', '10000000',
        '-i', streamUrl,
        '-t', '1',  // Only process 1 second
        '-f', 'null',
        '-'
      ]);

      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('error', (error) => {
        if (error.code === 'ENOENT') {
          console.log(`    ⚠️  FFmpeg not installed locally - skipping FFmpeg test`);
          results.ffmpeg.skipped = true;
          results.ffmpeg.reason = 'FFmpeg not available';
        } else {
          results.ffmpeg.error = error.message;
        }
        resolve(results);
      });

      ffmpeg.on('close', (code) => {
        results.ffmpeg.exitCode = code;
        results.ffmpeg.success = code === 0;
        
        if (errorOutput) {
          results.ffmpeg.errors = errorOutput.trim();
          
          // Parse specific errors
          if (errorOutput.includes('403')) {
            results.ffmpeg.errorType = 'FORBIDDEN';
          } else if (errorOutput.includes('404')) {
            results.ffmpeg.errorType = 'NOT_FOUND';
          } else if (errorOutput.includes('Invalid data')) {
            results.ffmpeg.errorType = 'INVALID_DATA';
          } else if (errorOutput.includes('Connection refused')) {
            results.ffmpeg.errorType = 'CONNECTION_REFUSED';
          } else if (errorOutput.includes('timed out')) {
            results.ffmpeg.errorType = 'TIMEOUT';
          }
        }
        
        if (code === 0) {
          console.log(`    ✅ FFmpeg SUCCESS - Stream is accessible`);
        } else {
          console.log(`    ❌ FFmpeg FAILED - Exit code: ${code}`);
          if (results.ffmpeg.errorType) {
            console.log(`      Error type: ${results.ffmpeg.errorType}`);
          }
          if (errorOutput) {
            console.log(`      Error: ${errorOutput.substring(0, 200)}`);
          }
        }
        
        resolve(results);
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        if (ffmpeg && !ffmpeg.killed) {
          ffmpeg.kill();
          results.ffmpeg.timeout = true;
          console.log(`    ⏱️  FFmpeg timeout`);
          resolve(results);
        }
      }, 15000);
    } catch (error) {
      console.log(`    ⚠️  FFmpeg test error: ${error.message}`);
      results.ffmpeg.error = error.message;
      resolve(results);
    }
  });
}

async function testDirectStreamUrl(streamUrl) {
  console.log(`\n🌐 Testing direct stream URL accessibility`);
  
  try {
    const response = await axios.head(streamUrl, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'PlexBridge/1.0'
      }
    });
    
    console.log(`    Status: ${response.status} ${response.statusText}`);
    console.log(`    Content-Type: ${response.headers['content-type']}`);
    
    if (response.request.responseURL !== streamUrl) {
      console.log(`    Redirected to: ${response.request.responseURL}`);
    }
    
    return {
      accessible: response.status >= 200 && response.status < 400,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers['content-type'],
      finalUrl: response.request.responseURL
    };
  } catch (error) {
    console.log(`    ❌ Failed: ${error.message}`);
    return {
      accessible: false,
      error: error.message
    };
  }
}

async function main() {
  console.log('🔬 PlexBridge Production Stream Diagnostics');
  console.log('==========================================');
  console.log(`Production URL: ${PRODUCTION_URL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const channels = await getChannels();
  console.log(`Found ${channels.length} channels\n`);

  const results = {
    working: [],
    failing: [],
    comparison: {}
  };

  // Test working channels
  console.log('\n✅ TESTING WORKING CHANNELS');
  console.log('============================');
  for (const testChannel of TEST_CHANNELS.working) {
    const channel = channels.find(c => 
      c.name?.toLowerCase().includes(testChannel.pattern.toLowerCase())
    );
    
    if (channel) {
      const stream = await getStreamInfo(channel.id);
      const endpointTest = await testStreamEndpoint(channel.id, channel.name);
      
      let ffmpegTest = null;
      if (stream?.url) {
        const directTest = await testDirectStreamUrl(stream.url);
        ffmpegTest = await testStreamWithFFmpeg(channel.id, channel.name, stream.url);
        ffmpegTest.directAccess = directTest;
      }
      
      results.working.push({
        channel,
        stream,
        endpointTest,
        ffmpegTest
      });
    } else {
      console.log(`⚠️  Channel not found: ${testChannel.name}`);
    }
  }

  // Test failing channels
  console.log('\n❌ TESTING FAILING CHANNELS');
  console.log('============================');
  for (const testChannel of TEST_CHANNELS.failing) {
    const channel = channels.find(c => 
      c.name?.toLowerCase().includes(testChannel.pattern.toLowerCase())
    );
    
    if (channel) {
      const stream = await getStreamInfo(channel.id);
      const endpointTest = await testStreamEndpoint(channel.id, channel.name);
      
      let ffmpegTest = null;
      if (stream?.url) {
        const directTest = await testDirectStreamUrl(stream.url);
        ffmpegTest = await testStreamWithFFmpeg(channel.id, channel.name, stream.url);
        ffmpegTest.directAccess = directTest;
      }
      
      results.failing.push({
        channel,
        stream,
        endpointTest,
        ffmpegTest
      });
    } else {
      console.log(`⚠️  Channel not found: ${testChannel.name}`);
    }
  }

  // Compare results
  console.log('\n📊 COMPARISON ANALYSIS');
  console.log('======================\n');

  console.log('Working Channels Summary:');
  results.working.forEach(r => {
    console.log(`  ${r.channel.name}:`);
    console.log(`    - PlexBridge endpoint: ${r.endpointTest.endpoints.get?.status || 'N/A'}`);
    console.log(`    - Returns HTML: ${r.endpointTest.endpoints.get?.isHtml ? '❌ YES' : '✅ NO'}`);
    console.log(`    - Direct URL accessible: ${r.ffmpegTest?.directAccess?.accessible ? '✅' : '❌'}`);
    console.log(`    - FFmpeg can read: ${r.ffmpegTest?.ffmpeg?.success ? '✅' : '❌'}`);
    if (r.stream?.url) {
      console.log(`    - Stream URL: ${r.stream.url.substring(0, 50)}...`);
    }
  });

  console.log('\nFailing Channels Summary:');
  results.failing.forEach(r => {
    console.log(`  ${r.channel.name}:`);
    console.log(`    - PlexBridge endpoint: ${r.endpointTest.endpoints.get?.status || 'N/A'}`);
    console.log(`    - Returns HTML: ${r.endpointTest.endpoints.get?.isHtml ? '❌ YES' : '✅ NO'}`);
    console.log(`    - Direct URL accessible: ${r.ffmpegTest?.directAccess?.accessible ? '✅' : '❌'}`);
    console.log(`    - Direct URL status: ${r.ffmpegTest?.directAccess?.status || 'N/A'}`);
    console.log(`    - FFmpeg can read: ${r.ffmpegTest?.ffmpeg?.success ? '✅' : '❌'}`);
    console.log(`    - FFmpeg error type: ${r.ffmpegTest?.ffmpeg?.errorType || 'N/A'}`);
    if (r.stream?.url) {
      console.log(`    - Stream URL: ${r.stream.url.substring(0, 50)}...`);
    }
  });

  // Key differences
  console.log('\n🔍 KEY DIFFERENCES:');
  console.log('==================');
  
  const workingReturnsHtml = results.working.filter(r => r.endpointTest.endpoints.get?.isHtml).length;
  const failingReturnsHtml = results.failing.filter(r => r.endpointTest.endpoints.get?.isHtml).length;
  
  console.log(`HTML responses instead of video:`);
  console.log(`  - Working channels: ${workingReturnsHtml}/${results.working.length}`);
  console.log(`  - Failing channels: ${failingReturnsHtml}/${results.failing.length}`);
  
  const workingDirectAccess = results.working.filter(r => r.ffmpegTest?.directAccess?.accessible).length;
  const failingDirectAccess = results.failing.filter(r => r.ffmpegTest?.directAccess?.accessible).length;
  
  console.log(`\nDirect stream URL accessibility:`);
  console.log(`  - Working channels: ${workingDirectAccess}/${results.working.length} accessible`);
  console.log(`  - Failing channels: ${failingDirectAccess}/${results.failing.length} accessible`);
  
  const working403 = results.working.filter(r => r.ffmpegTest?.directAccess?.status === 403).length;
  const failing403 = results.failing.filter(r => r.ffmpegTest?.directAccess?.status === 403).length;
  
  if (failing403 > 0) {
    console.log(`\n⚠️  ${failing403} failing channel(s) return 403 Forbidden`);
    console.log(`  This suggests geo-blocking or authentication issues`);
  }

  // Save detailed results
  const fs = require('fs');
  const reportFile = `stream-diagnosis-${Date.now()}.json`;
  fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
  console.log(`\n📄 Detailed results saved to: ${reportFile}`);
}

main().catch(console.error);