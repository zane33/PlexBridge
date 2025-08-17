#!/usr/bin/env node

// Simple API test to verify application functionality
const http = require('http');
const https = require('https');

async function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PlexBridge-Test/1.0'
      }
    };
    
    if (data && method !== 'GET') {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }
    
    const req = client.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (error) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data && method !== 'GET') {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runTests() {
  const baseUrl = 'http://localhost:8080';
  let passed = 0;
  let failed = 0;
  
  console.log('🧪 PlexBridge API Test Suite\n');
  
  // Test 1: Health Check
  try {
    console.log('1. Testing health endpoint...');
    const health = await makeRequest(`${baseUrl}/health`);
    if (health.status === 200 && health.data.status === 'healthy') {
      console.log('   ✅ Health check passed');
      passed++;
    } else {
      console.log('   ❌ Health check failed:', health);
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Health check error:', error.message);
    failed++;
  }
  
  // Test 2: M3U Parsing
  try {
    console.log('2. Testing M3U parsing...');
    const m3uResult = await makeRequest(`${baseUrl}/api/streams/parse/m3u`, 'POST', {
      url: 'https://iptv-org.github.io/iptv/index.m3u'
    });
    
    if (m3uResult.status === 200 && m3uResult.data.success && m3uResult.data.channels.length > 0) {
      console.log(`   ✅ M3U parsing passed - found ${m3uResult.data.channels.length} channels`);
      passed++;
    } else {
      console.log('   ❌ M3U parsing failed:', m3uResult);
      failed++;
    }
  } catch (error) {
    console.log('   ❌ M3U parsing error:', error.message);
    failed++;
  }
  
  // Test 3: HDHomeRun Discovery
  try {
    console.log('3. Testing HDHomeRun discovery...');
    const discovery = await makeRequest(`${baseUrl}/discover.json`);
    if (discovery.status === 200 && discovery.data.FriendlyName === 'PlexBridge') {
      console.log('   ✅ HDHomeRun discovery passed');
      passed++;
    } else {
      console.log('   ❌ HDHomeRun discovery failed:', discovery);
      failed++;
    }
  } catch (error) {
    console.log('   ❌ HDHomeRun discovery error:', error.message);
    failed++;
  }
  
  // Test 4: Channels API
  try {
    console.log('4. Testing channels API...');
    const channels = await makeRequest(`${baseUrl}/api/channels`);
    if (channels.status === 200 && Array.isArray(channels.data)) {
      console.log('   ✅ Channels API passed');
      passed++;
    } else {
      console.log('   ❌ Channels API failed:', channels);
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Channels API error:', error.message);
    failed++;
  }
  
  // Test 5: Streams API
  try {
    console.log('5. Testing streams API...');
    const streams = await makeRequest(`${baseUrl}/api/streams`);
    if (streams.status === 200 && Array.isArray(streams.data)) {
      console.log('   ✅ Streams API passed');
      passed++;
    } else {
      console.log('   ❌ Streams API failed:', streams);
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Streams API error:', error.message);
    failed++;
  }
  
  // Test 6: Database Status
  try {
    console.log('6. Testing database status...');
    const dbHealth = await makeRequest(`${baseUrl}/api/database/health`);
    if (dbHealth.status === 200 && dbHealth.data.status === 'healthy') {
      console.log('   ✅ Database status passed');
      passed++;
    } else {
      console.log('   ❌ Database status failed:', dbHealth);
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Database status error:', error.message);
    failed++;
  }
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Application is ready for production.');
    return true;
  } else {
    console.log('⚠️  Some tests failed. Check the application configuration.');
    return false;
  }
}

if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
  });
}

module.exports = { runTests };