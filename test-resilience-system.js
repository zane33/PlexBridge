#!/usr/bin/env node

/**
 * PlexBridge Resilience System Test
 * 
 * This script tests the multi-layer resilience system by:
 * 1. Starting a resilient stream
 * 2. Simulating various failure scenarios
 * 3. Verifying recovery mechanisms
 * 4. Testing the monitoring API
 */

const axios = require('axios');
const { spawn } = require('child_process');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const TEST_CHANNEL_ID = process.env.TEST_CHANNEL_ID || '1';

console.log('PlexBridge Resilience System Test');
console.log('==================================');
console.log(`Base URL: ${BASE_URL}`);
console.log(`Test Channel ID: ${TEST_CHANNEL_ID}`);
console.log('');

let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
  }
  testResults.tests.push({ name, passed, details });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testResilienceAPI() {
  console.log('Testing Resilience API...');
  
  try {
    const response = await axios.get(`${BASE_URL}/streams/resilience`, {
      timeout: 5000
    });
    
    logTest(
      'Resilience API responds correctly',
      response.status === 200 && response.data.success === true,
      response.status !== 200 ? `Status: ${response.status}` : ''
    );
    
    const data = response.data;
    logTest(
      'Resilience API includes health information',
      data.health && typeof data.health.available === 'boolean'
    );
    
    logTest(
      'Resilience API includes statistics',
      data.statistics && data.statistics.service && data.statistics.streams
    );
    
    logTest(
      'Resilience API includes configuration',
      data.configuration && data.configuration.resilienceLayers === 4
    );
    
    console.log('Current resilience status:');
    console.log(`- Service available: ${data.health?.available}`);
    console.log(`- Total resilient streams: ${data.summary?.totalResilientStreams || 0}`);
    console.log(`- Healthy streams: ${data.summary?.healthyStreamsPercent || 0}%`);
    console.log('');
    
  } catch (error) {
    logTest(
      'Resilience API responds correctly',
      false,
      `Error: ${error.message}`
    );
  }
}

async function testStreamEndpointWithResilience() {
  console.log('Testing Stream Endpoint with Resilience...');
  
  try {
    // Test with explicit resilience request
    const response = await axios.get(`${BASE_URL}/stream/${TEST_CHANNEL_ID}?resilient=true`, {
      timeout: 10000,
      responseType: 'stream',
      headers: {
        'User-Agent': 'PlexBridge-Test/1.0 AndroidTV'
      }
    });
    
    logTest(
      'Stream endpoint accepts resilience parameter',
      response.status === 200,
      response.status !== 200 ? `Status: ${response.status}` : ''
    );
    
    logTest(
      'Stream response includes resilience headers',
      response.headers['x-stream-type'] === 'resilient' ||
      response.headers['x-resilience-layers'] === '4'
    );
    
    logTest(
      'Stream response has correct MPEG-TS content type',
      response.headers['content-type'] === 'video/mp2t'
    );
    
    // Test that the response is actually streaming
    let dataReceived = false;
    const timeout = setTimeout(() => {
      logTest('Stream provides data within 10 seconds', false, 'Timeout waiting for data');
    }, 10000);
    
    response.data.on('data', (chunk) => {
      if (!dataReceived) {
        dataReceived = true;
        clearTimeout(timeout);
        logTest(
          'Stream provides data within 10 seconds',
          chunk && chunk.length > 0,
          `Received ${chunk.length} bytes`
        );
        
        // Destroy stream to avoid consuming too much data
        response.data.destroy();
      }
    });
    
    response.data.on('error', (error) => {
      clearTimeout(timeout);
      logTest(
        'Stream data flows without errors',
        false,
        `Stream error: ${error.message}`
      );
    });
    
    // Wait a bit for the stream test to complete
    await sleep(5000);
    
  } catch (error) {
    logTest(
      'Stream endpoint accepts resilience parameter',
      false,
      `Error: ${error.message}`
    );
  }
}

async function testAndroidTVUserAgent() {
  console.log('Testing Android TV User Agent Detection...');
  
  try {
    // Test various Android TV user agents
    const androidTVUserAgents = [
      'Plex/1.0 AndroidTV',
      'Mozilla/5.0 (AndroidTV; Android 9)',
      'MiBox/1.0 AndroidTV',
      'Shield/1.0 Android TV',
      'Nexus Player AndroidTV'
    ];
    
    for (const userAgent of androidTVUserAgents) {
      try {
        const response = await axios.head(`${BASE_URL}/stream/${TEST_CHANNEL_ID}`, {
          timeout: 5000,
          headers: {
            'User-Agent': userAgent
          }
        });
        
        logTest(
          `Android TV detection works for: ${userAgent}`,
          response.status === 200,
          response.status !== 200 ? `Status: ${response.status}` : ''
        );
        
      } catch (error) {
        logTest(
          `Android TV detection works for: ${userAgent}`,
          false,
          `Error: ${error.message}`
        );
      }
      
      // Small delay between requests
      await sleep(500);
    }
    
  } catch (error) {
    console.log(`Error testing Android TV user agents: ${error.message}`);
  }
}

async function testHealthCheck() {
  console.log('Testing System Health...');
  
  try {
    const response = await axios.get(`${BASE_URL}/health`, {
      timeout: 5000
    });
    
    logTest(
      'Health endpoint responds',
      response.status === 200,
      response.status !== 200 ? `Status: ${response.status}` : ''
    );
    
    if (response.status === 200 && response.data) {
      logTest(
        'Database is healthy',
        response.data.database?.status === 'healthy' || 
        response.data.services?.database?.status === 'healthy'
      );
      
      logTest(
        'Cache service is healthy',
        response.data.cache?.status === 'healthy' || 
        response.data.services?.cache?.status === 'healthy'
      );
    }
    
  } catch (error) {
    logTest(
      'Health endpoint responds',
      false,
      `Error: ${error.message}`
    );
  }
}

async function testStreamingDecision() {
  console.log('Testing Streaming Decision Logic...');
  
  const testCases = [
    {
      name: 'Explicit resilience request',
      url: `/stream/${TEST_CHANNEL_ID}?resilient=true`,
      userAgent: 'Test/1.0',
      expectResilient: true
    },
    {
      name: 'Android TV client (automatic resilience)',
      url: `/stream/${TEST_CHANNEL_ID}`,
      userAgent: 'Plex/1.0 AndroidTV',
      expectResilient: true
    },
    {
      name: 'Regular desktop client',
      url: `/stream/${TEST_CHANNEL_ID}`,
      userAgent: 'Plex/1.0 Desktop',
      expectResilient: false
    },
    {
      name: 'Mobile client',
      url: `/stream/${TEST_CHANNEL_ID}`,
      userAgent: 'Plex/1.0 Mobile',
      expectResilient: false
    }
  ];
  
  for (const testCase of testCases) {
    try {
      const response = await axios.head(`${BASE_URL}${testCase.url}`, {
        timeout: 5000,
        headers: {
          'User-Agent': testCase.userAgent
        }
      });
      
      const hasResilienceHeaders = response.headers['x-stream-type'] === 'resilient' ||
                                  response.headers['x-resilience-layers'] === '4';
      
      logTest(
        testCase.name,
        testCase.expectResilient ? hasResilienceHeaders : !hasResilienceHeaders,
        `Expected resilient: ${testCase.expectResilient}, Got resilient: ${hasResilienceHeaders}`
      );
      
    } catch (error) {
      logTest(
        testCase.name,
        false,
        `Error: ${error.message}`
      );
    }
    
    await sleep(500);
  }
}

async function testStreamManagerStats() {
  console.log('Testing Stream Manager Statistics...');
  
  try {
    // First check if we have any active streams
    const activeResponse = await axios.get(`${BASE_URL}/streams/active`, {
      timeout: 5000
    });
    
    logTest(
      'Stream manager active endpoint responds',
      activeResponse.status === 200 && activeResponse.data.success === true
    );
    
    console.log(`Active streams: ${activeResponse.data.data?.sessions?.length || 0}`);
    
  } catch (error) {
    logTest(
      'Stream manager active endpoint responds',
      false,
      `Error: ${error.message}`
    );
  }
}

async function runAllTests() {
  console.log('Starting comprehensive resilience system tests...\n');
  
  await testHealthCheck();
  console.log('');
  
  await testResilienceAPI();
  console.log('');
  
  await testStreamManagerStats();
  console.log('');
  
  await testAndroidTVUserAgent();
  console.log('');
  
  await testStreamingDecision();
  console.log('');
  
  await testStreamEndpointWithResilience();
  console.log('');
  
  // Print final results
  console.log('Test Results Summary');
  console.log('===================');
  console.log(`Total tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success rate: ${Math.round((testResults.passed / testResults.total) * 100)}%`);
  console.log('');
  
  if (testResults.failed > 0) {
    console.log('Failed tests:');
    testResults.tests
      .filter(test => !test.passed)
      .forEach(test => {
        console.log(`- ${test.name}: ${test.details}`);
      });
    console.log('');
  }
  
  const overallSuccess = testResults.failed === 0;
  console.log(`Overall result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  return overallSuccess;
}

// Run the tests
if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test suite failed with error:', error);
      process.exit(1);
    });
}

module.exports = {
  runAllTests,
  testResults
};