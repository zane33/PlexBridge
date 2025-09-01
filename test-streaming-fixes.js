#!/usr/bin/env node

/**
 * Test script to validate the streaming fixes for PlexBridge
 * Tests both working and problematic streams
 */

const axios = require('axios');
const { spawn } = require('child_process');

const PRODUCTION_URL = 'http://192.168.3.148:3000';

// Test configuration
const tests = {
  workingStream: {
    channelId: '0f350a4c-9a41-4600-85a9-0be879e55be2',
    channelName: 'TVNZ 1',
    expectedType: 'hls'
  },
  problematicStream: {
    channelId: 'c83e4187-f358-45b0-81ce-05bc2567cf08',
    channelName: 'FOX Cricket 501 AU',
    expectedType: 'http'  // Should be HTTP, not HLS
  }
};

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function getStreamInfo(channelId) {
  try {
    const response = await axios.get(`${PRODUCTION_URL}/api/streams?channelId=${channelId}`);
    const stream = response.data.find(s => s.channel_id === channelId);
    return stream;
  } catch (error) {
    throw new Error(`Failed to get stream info: ${error.message}`);
  }
}

async function testStreamEndpoint(channelId, channelName) {
  log(`\nTesting stream endpoint for ${channelName}...`, 'blue');
  
  try {
    // Test with Plex User-Agent
    const response = await axios.head(`${PRODUCTION_URL}/stream/${channelId}`, {
      headers: {
        'User-Agent': 'Lavf/LIBAVFORMAT_VERSION'
      },
      timeout: 10000,
      validateStatus: () => true // Accept any status
    });
    
    log(`  Status: ${response.status}`, response.status === 200 ? 'green' : 'red');
    log(`  Content-Type: ${response.headers['content-type'] || 'Not set'}`);
    log(`  Has X-Session-ID: ${response.headers['x-session-id'] ? 'Yes' : 'No'}`);
    
    // Check if we're getting MPEG-TS content type
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('video/mp2t')) {
      log('  ✓ Correct MPEG-TS content type', 'green');
    } else if (contentType.includes('text/html')) {
      log('  ✗ ERROR: Returning HTML instead of video stream!', 'red');
      return false;
    }
    
    return response.status === 200;
  } catch (error) {
    log(`  ✗ Error: ${error.message}`, 'red');
    return false;
  }
}

async function testFFmpegCommand(streamUrl, channelName) {
  log(`\nTesting FFmpeg command for ${channelName}...`, 'blue');
  
  return new Promise((resolve) => {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-user_agent', 'VLC/3.0.20 LibVLC/3.0.20',
      '-headers', 'Accept: */*\r\nConnection: keep-alive\r\n',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-timeout', '10000000',
      '-analyzeduration', '10000000',
      '-probesize', '10000000',
      '-i', streamUrl,
      '-t', '5',  // Only test for 5 seconds
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-f', 'mpegts',
      '-y',
      '/dev/null'
    ];
    
    log(`  Command: ffmpeg ${args.slice(0, 10).join(' ')}...`);
    
    const ffmpeg = spawn('ffmpeg', args);
    let stderrOutput = '';
    
    ffmpeg.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        log('  ✓ FFmpeg successfully processed stream', 'green');
        resolve(true);
      } else {
        log(`  ✗ FFmpeg failed with code ${code}`, 'red');
        if (stderrOutput) {
          log('  FFmpeg errors:', 'yellow');
          console.log(stderrOutput.split('\n').slice(0, 5).join('\n'));
        }
        resolve(false);
      }
    });
    
    ffmpeg.on('error', (error) => {
      log(`  ✗ FFmpeg spawn error: ${error.message}`, 'red');
      resolve(false);
    });
    
    // Timeout after 15 seconds
    setTimeout(() => {
      if (!ffmpeg.killed) {
        ffmpeg.kill();
        log('  ⚠ FFmpeg test timed out', 'yellow');
        resolve(false);
      }
    }, 15000);
  });
}

async function checkIPTVStreamStatus() {
  log('\n=== Checking IPTV Stream Status ===', 'blue');
  
  try {
    const response = await axios.get(`${PRODUCTION_URL}/api/admin/iptv-stream-status`);
    const data = response.data;
    
    if (data.success) {
      log(`\nIPTV Stream Statistics:`, 'yellow');
      log(`  Total IPTV streams: ${data.stats.total}`);
      log(`  Correctly typed: ${data.stats.correct}`, 'green');
      log(`  Incorrectly typed: ${data.stats.incorrect}`, data.stats.incorrect > 0 ? 'red' : 'green');
      log(`  Disabled: ${data.stats.disabled}`);
      
      if (data.problematicStreams && data.problematicStreams.length > 0) {
        log('\nProblematic streams (need fixing):', 'red');
        data.problematicStreams.slice(0, 5).forEach(stream => {
          log(`  - ${stream.name} (Channel ${stream.channelNumber}): Type=${stream.type}`);
        });
        
        return false;  // Needs fixing
      }
      return true;  // All good
    }
  } catch (error) {
    log(`Failed to check IPTV stream status: ${error.message}`, 'red');
    if (error.response?.status === 404) {
      log('Note: Admin fix endpoint not yet deployed to production', 'yellow');
    }
  }
  return null;
}

async function runTests() {
  log('=== PlexBridge Streaming Fix Validation ===\n', 'blue');
  
  // Check IPTV stream status
  const statusOk = await checkIPTVStreamStatus();
  
  // Test working stream
  log('\n=== Testing Working Stream (TVNZ 1) ===', 'green');
  const tvnzStream = await getStreamInfo(tests.workingStream.channelId);
  if (tvnzStream) {
    log(`Stream URL: ${tvnzStream.url}`);
    log(`Stream Type: ${tvnzStream.type}`);
    
    const tvnzEndpointOk = await testStreamEndpoint(tests.workingStream.channelId, tests.workingStream.channelName);
    
    if (tvnzStream.url) {
      await testFFmpegCommand(tvnzStream.url, tests.workingStream.channelName);
    }
  }
  
  // Test problematic stream
  log('\n=== Testing Problematic Stream (FOX Cricket) ===', 'yellow');
  const foxStream = await getStreamInfo(tests.problematicStream.channelId);
  if (foxStream) {
    log(`Stream URL: ${foxStream.url}`);
    log(`Stream Type: ${foxStream.type}`);
    
    if (foxStream.type === 'hls' && foxStream.url.includes('premiumpowers')) {
      log('⚠️  WARNING: Stream is incorrectly typed as HLS!', 'red');
      log('  This stream should be type "http" for proper handling', 'yellow');
    }
    
    const foxEndpointOk = await testStreamEndpoint(tests.problematicStream.channelId, tests.problematicStream.channelName);
    
    if (foxStream.url) {
      await testFFmpegCommand(foxStream.url, tests.problematicStream.channelName);
    }
  }
  
  // Summary
  log('\n=== Test Summary ===', 'blue');
  
  if (statusOk === false) {
    log('⚠️  IPTV streams need type correction', 'yellow');
    log('   Run: curl -X POST http://192.168.3.148:3000/api/admin/fix-iptv-stream-types', 'yellow');
  } else if (statusOk === true) {
    log('✓ All IPTV streams correctly typed', 'green');
  }
  
  log('\nNote: The fixes have been implemented in the code but need to be:', 'yellow');
  log('1. Deployed to production (192.168.3.148)', 'yellow');
  log('2. Stream types corrected via admin endpoint', 'yellow');
  log('3. PlexBridge service restarted', 'yellow');
}

// Run the tests
runTests().catch(error => {
  log(`\nFatal error: ${error.message}`, 'red');
  process.exit(1);
});