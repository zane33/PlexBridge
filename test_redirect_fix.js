#!/usr/bin/env node

const axios = require('axios');

async function testM3U8RedirectHandling() {
  console.log('🔍 Testing M3U8 Redirect Handling Fix');
  console.log('=====================================\n');
  
  const testUrl = 'http://38.64.138.128:8089/live/4862347298/4964672797/820994.m3u8';
  
  console.log(`Testing URL: ${testUrl}\n`);
  
  try {
    console.log('📡 Step 1: Testing redirect detection with maxRedirects=0...');
    
    const response = await axios.get(testUrl, {
      maxRedirects: 0, // Don't follow automatically to detect redirect
      timeout: 15000,
      validateStatus: function (status) {
        // Accept both success and redirect responses
        return (status >= 200 && status < 300) || (status >= 300 && status < 400);
      },
      headers: {
        'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      }
    });
    
    console.log(`✅ Response Status: ${response.status}`);
    console.log(`📋 Content-Type: ${response.headers['content-type']}`);
    console.log(`📏 Content-Length: ${response.headers['content-length']}`);
    
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      const redirectUrl = response.headers.location;
      console.log(`🔀 REDIRECT DETECTED!`);
      console.log(`📍 Location: ${redirectUrl.substring(0, 100)}...`);
      
      console.log('\n📡 Step 2: Testing final redirect URL...');
      
      // Test the redirect URL with automatic redirect following
      const finalResponse = await axios.get(redirectUrl, {
        maxRedirects: 5,
        timeout: 15000,
        headers: {
          'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
          'Accept': '*/*',
          'Connection': 'keep-alive'
        }
      });
      
      console.log(`✅ Final Response Status: ${finalResponse.status}`);
      console.log(`📋 Final Content-Type: ${finalResponse.headers['content-type']}`);
      console.log(`📏 Final Content-Length: ${finalResponse.headers['content-length']}`);
      
      // Check if it's valid M3U8 content
      if (finalResponse.data && finalResponse.data.includes('#EXTM3U')) {
        console.log('✅ SUCCESS: Valid M3U8 playlist found!');
        console.log('📄 Playlist preview:');
        console.log('---');
        console.log(finalResponse.data.split('\n').slice(0, 10).join('\n'));
        console.log('...');
        console.log('---');
        
        // Count segments
        const segments = finalResponse.data.split('\n').filter(line => line.includes('.ts'));
        console.log(`🎬 Found ${segments.length} video segments`);
        
        return {
          success: true,
          originalUrl: testUrl,
          redirectUrl: redirectUrl,
          finalStatus: finalResponse.status,
          segmentCount: segments.length
        };
      } else {
        console.log('❌ ERROR: Invalid M3U8 content');
        console.log('📄 Content preview:');
        console.log(finalResponse.data.substring(0, 200));
        return { success: false, error: 'Invalid M3U8 content' };
      }
    } else if (response.status >= 200 && response.status < 300) {
      console.log('ℹ️  No redirect - direct M3U8 response');
      
      if (response.data && response.data.includes('#EXTM3U')) {
        console.log('✅ SUCCESS: Direct M3U8 access works!');
        const segments = response.data.split('\n').filter(line => line.includes('.ts'));
        console.log(`🎬 Found ${segments.length} video segments`);
        return {
          success: true,
          originalUrl: testUrl,
          directAccess: true,
          segmentCount: segments.length
        };
      } else {
        console.log('❌ ERROR: Direct response but not valid M3U8');
        return { success: false, error: 'Not valid M3U8 content' };
      }
    }
  } catch (error) {
    console.error('❌ ERROR during redirect test:');
    console.error(`   ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
    }
    return { success: false, error: error.message };
  }
}

// Run the test
testM3U8RedirectHandling()
  .then(result => {
    console.log('\n🏁 TEST RESULTS:');
    console.log('================');
    if (result.success) {
      console.log('✅ REDIRECT HANDLING FIX: SUCCESS');
      console.log(`📊 Original URL: ${result.originalUrl}`);
      if (result.redirectUrl) {
        console.log(`🔀 Redirect URL: ${result.redirectUrl.substring(0, 100)}...`);
      }
      if (result.directAccess) {
        console.log('✅ Direct access works (no redirect needed)');
      }
      if (result.segmentCount) {
        console.log(`🎬 Video segments: ${result.segmentCount}`);
      }
      console.log('\n🎯 CONCLUSION: PlexBridge should now properly handle this stream!');
      process.exit(0);
    } else {
      console.log('❌ REDIRECT HANDLING FIX: FAILED');
      console.log(`💥 Error: ${result.error}`);
      console.log('\n🔧 The fix needs further refinement.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('💥 UNEXPECTED ERROR:', error.message);
    process.exit(1);
  });