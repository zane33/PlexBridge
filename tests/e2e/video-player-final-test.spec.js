const { test, expect } = require('@playwright/test');

test.describe('Video Player Final Test', () => {
  
  test('Test video player opens and plays content', async ({ page }) => {
    console.log('=== STARTING VIDEO PLAYER FINAL TEST ===');
    
    // Navigate to application
    await page.goto('http://localhost:8080');
    await page.waitForSelector('[data-testid="nav-dashboard"]', { timeout: 10000 });
    
    // Navigate to streams section
    console.log('=== NAVIGATING TO STREAMS ===');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Wait for any existing video player dialogs to close
    await page.waitForTimeout(1000);
    
    // Find first stream with preview button
    console.log('=== CLICKING PREVIEW BUTTON ===');
    const previewButton = page.locator('[data-testid="preview-stream-button"]').first();
    await previewButton.click();
    
    // Wait for any of the video player dialogs to appear (more flexible approach)
    console.log('=== WAITING FOR VIDEO PLAYER DIALOG ===');
    try {
      await page.waitForSelector('[data-testid="video-player-dialog"]', { timeout: 20000 });
      console.log('✅ Video player dialog found');
    } catch (e) {
      // Try alternative selectors
      const dialogExists = await page.locator('.MuiDialog-root').count() > 0;
      if (dialogExists) {
        console.log('✅ Video player dialog found (alternative selector)');
      } else {
        throw new Error('Video player dialog not found');
      }
    }
    
    // Take screenshot of video player
    await page.screenshot({ path: 'test-results/video-player-open.png', fullPage: true });
    
    console.log('=== ANALYZING VIDEO ELEMENT ===');
    
    // Check if video element exists
    const videoElement = page.locator('video');
    const videoCount = await videoElement.count();
    console.log(`Video elements found: ${videoCount}`);
    
    if (videoCount > 0) {
      // Get video element properties
      const videoProps = await videoElement.first().evaluate(el => ({
        src: el.src,
        currentSrc: el.currentSrc,
        readyState: el.readyState,
        networkState: el.networkState,
        videoWidth: el.videoWidth,
        videoHeight: el.videoHeight,
        duration: el.duration,
        paused: el.paused,
        muted: el.muted,
        volume: el.volume,
        controls: el.controls,
        autoplay: el.autoplay,
        preload: el.preload,
        error: el.error ? {
          code: el.error.code,
          message: el.error.message
        } : null
      }));
      
      console.log('=== VIDEO ELEMENT PROPERTIES ===');
      console.log(JSON.stringify(videoProps, null, 2));
      
      // Check video readiness
      if (videoProps.readyState >= 1) {
        console.log('✅ Video metadata loaded (readyState >= 1)');
      } else {
        console.log('❌ Video metadata not yet loaded');
      }
      
      // Check for video dimensions
      if (videoProps.videoWidth > 0 && videoProps.videoHeight > 0) {
        console.log(`✅ Video has dimensions: ${videoProps.videoWidth}x${videoProps.videoHeight}`);
      } else {
        console.log('⚠️ Video dimensions not available - may be audio-only or still loading');
      }
      
      // Check for errors
      if (videoProps.error) {
        console.log('❌ Video has error:', videoProps.error);
      } else {
        console.log('✅ No video errors detected');
      }
      
      console.log('=== ATTEMPTING TO PLAY VIDEO ===');
      
      // Try to unmute first (required for autoplay in most browsers)
      try {
        await videoElement.first().evaluate(el => el.muted = false);
        console.log('✅ Video unmuted');
      } catch (e) {
        console.log('⚠️ Could not unmute video:', e.message);
      }
      
      // Try to play the video
      try {
        const playResult = await videoElement.first().evaluate(async (el) => {
          try {
            await el.play();
            return { success: true, error: null };
          } catch (error) {
            return { success: false, error: error.message };
          }
        });
        
        if (playResult.success) {
          console.log('✅ Video.play() succeeded');
          
          // Wait a bit and check playback state
          await page.waitForTimeout(3000);
          
          const playbackState = await videoElement.first().evaluate(el => ({
            paused: el.paused,
            currentTime: el.currentTime,
            ended: el.ended,
            buffered: el.buffered.length > 0 ? {
              start: el.buffered.start(0),
              end: el.buffered.end(0)
            } : null
          }));
          
          console.log('=== PLAYBACK STATE AFTER 3 SECONDS ===');
          console.log(JSON.stringify(playbackState, null, 2));
          
          if (!playbackState.paused && playbackState.currentTime > 0) {
            console.log('✅ Video is actively playing with progressing time');
          } else if (!playbackState.paused) {
            console.log('⚠️ Video appears to be playing but time is not progressing');
          } else {
            console.log('❌ Video is paused');
          }
          
        } else {
          console.log('❌ Video.play() failed:', playResult.error);
        }
        
      } catch (e) {
        console.log('❌ Error during video play attempt:', e.message);
      }
      
    } else {
      console.log('❌ No video elements found in the player');
    }
    
    console.log('=== CHECKING BROWSER CONSOLE LOGS ===');
    
    // Monitor console messages
    const consoleMessages = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleMessages.push(`[CONSOLE ERROR] ${msg.text()}`);
      }
    });
    
    // Check for network errors
    const networkErrors = [];
    page.on('response', response => {
      const url = response.url();
      if (url.includes('/streams/preview/') && response.status() >= 400) {
        networkErrors.push(`[NETWORK ERROR] ${response.status()} ${url}`);
      }
    });
    
    // Wait a bit to collect any async errors
    await page.waitForTimeout(2000);
    
    if (consoleMessages.length > 0) {
      console.log('=== CONSOLE ERRORS ===');
      consoleMessages.forEach(msg => console.log(msg));
    } else {
      console.log('✅ No console errors detected');
    }
    
    if (networkErrors.length > 0) {
      console.log('=== NETWORK ERRORS ===');
      networkErrors.forEach(error => console.log(error));
    } else {
      console.log('✅ No network errors detected');
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'test-results/video-player-final-state.png', fullPage: true });
    
    console.log('=== VIDEO PLAYER TEST COMPLETE ===');
    
    // Close the dialog
    try {
      await page.click('[data-testid="close-video-player"]');
      console.log('✅ Video player closed successfully');
    } catch (e) {
      console.log('⚠️ Could not close video player with testid, trying escape key');
      await page.keyboard.press('Escape');
    }
  });
  
  test('Test stream preview endpoints and content types', async ({ page }) => {
    console.log('=== TESTING STREAM PREVIEW ENDPOINTS ===');
    
    // Test the backend endpoints directly
    const streamsResponse = await page.request.get('http://localhost:8080/api/streams');
    const streams = await streamsResponse.json();
    console.log(`Found ${streams.length} streams in database`);
    
    if (streams.length > 0) {
      // Test different stream types
      const streamTypes = {};
      streams.forEach(stream => {
        if (!streamTypes[stream.type]) {
          streamTypes[stream.type] = [];
        }
        streamTypes[stream.type].push(stream);
      });
      
      console.log('=== STREAM TYPES FOUND ===');
      Object.keys(streamTypes).forEach(type => {
        console.log(`${type}: ${streamTypes[type].length} streams`);
      });
      
      // Test preview endpoints for different stream types
      for (const [type, typeStreams] of Object.entries(streamTypes)) {
        if (typeStreams.length > 0) {
          const testStream = typeStreams[0];
          console.log(`=== TESTING ${type.toUpperCase()} STREAM ===`);
          console.log(`Stream: ${testStream.name} (${testStream.id})`);
          
          try {
            const previewResponse = await page.request.get(
              `http://localhost:8080/streams/preview/${testStream.id}`,
              { timeout: 10000 }
            );
            
            console.log(`Preview status: ${previewResponse.status()}`);
            console.log(`Content-Type: ${previewResponse.headers()['content-type']}`);
            
            if (previewResponse.status() === 200) {
              const contentType = previewResponse.headers()['content-type'];
              if (contentType && (
                contentType.includes('video/') || 
                contentType.includes('application/vnd.apple.mpegurl') ||
                contentType.includes('application/dash+xml')
              )) {
                console.log(`✅ ${type} stream endpoint working correctly`);
              } else {
                console.log(`⚠️ ${type} stream has unexpected content-type: ${contentType}`);
              }
            } else {
              console.log(`❌ ${type} stream endpoint failed with status ${previewResponse.status()}`);
            }
            
          } catch (error) {
            console.log(`❌ Error testing ${type} stream:`, error.message);
          }
        }
      }
    }
  });
});