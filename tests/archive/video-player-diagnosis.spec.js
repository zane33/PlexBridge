const { test, expect } = require('@playwright/test');

test.describe('Video Player Diagnosis', () => {
  
  test('Diagnose video player issues with stream preview', async ({ page }) => {
    console.log('=== STARTING VIDEO PLAYER DIAGNOSIS ===');
    
    // Navigate to application
    console.log('=== STEP 1: NAVIGATE TO APPLICATION ===');
    await page.goto('http://localhost:8080');
    
    // Wait for the app to load
    await page.waitForSelector('[data-testid="nav-dashboard"]', { timeout: 10000 });
    
    // Navigate to streams section
    console.log('=== STEP 2: NAVIGATE TO STREAMS SECTION ===');
    await page.click('[data-testid="nav-streams"]');
    
    // Wait for streams table to load
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Take screenshot of streams page
    await page.screenshot({ path: 'test-results/streams-page.png', fullPage: true });
    
    // Check if there are any existing streams
    const streamRows = await page.locator('table tbody tr').count();
    console.log(`Found ${streamRows} streams in table`);
    
    if (streamRows === 0) {
      console.log('No streams found, creating a test stream...');
      
      // Click Add Stream button
      await page.click('[data-testid="add-stream-button"]');
      
      // Wait for dialog to open
      await page.waitForSelector('[data-testid="stream-dialog"]');
      
      // Find the actual input elements within the dialog
      const nameInput = await page.locator('[data-testid="stream-dialog"] input[name="name"]');
      const urlInput = await page.locator('[data-testid="stream-dialog"] input[name="url"]');
      
      // Fill stream details
      await nameInput.fill('Test Video Stream');
      await urlInput.fill('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
      
      // Save the stream
      await page.click('[data-testid="save-stream-button"]');
      
      // Wait for stream to be created
      await page.waitForSelector('table tbody tr', { timeout: 10000 });
    }
    
    // Get the first stream for testing
    const firstStreamRow = page.locator('table tbody tr').first();
    
    // Take screenshot before clicking preview
    await page.screenshot({ path: 'test-results/before-preview.png', fullPage: true });
    
    console.log('=== STEP 3: CLICK STREAM PREVIEW BUTTON ===');
    
    // Click the preview button for the first stream
    const previewButton = firstStreamRow.locator('[data-testid="preview-stream-button"]');
    await previewButton.click();
    
    // Wait for video player dialog to open
    console.log('=== STEP 4: WAIT FOR VIDEO PLAYER DIALOG ===');
    await page.waitForSelector('[data-testid="video-player-dialog"]', { timeout: 15000 });
    
    // Take screenshot of opened video player dialog
    await page.screenshot({ path: 'test-results/video-player-dialog.png', fullPage: true });
    
    console.log('=== STEP 5: ANALYZE VIDEO PLAYER ELEMENTS ===');
    
    // Check if video element exists
    const videoElement = page.locator('video');
    const videoExists = await videoElement.count() > 0;
    console.log(`Video element exists: ${videoExists}`);
    
    if (videoExists) {
      // Get video element properties
      const videoProps = await videoElement.evaluate(el => ({
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
        error: el.error ? {
          code: el.error.code,
          message: el.error.message
        } : null
      }));
      
      console.log('=== VIDEO ELEMENT PROPERTIES ===');
      console.log(JSON.stringify(videoProps, null, 2));
      
      // Check if video has loaded metadata
      if (videoProps.readyState >= 1) {
        console.log('✅ Video metadata loaded');
      } else {
        console.log('❌ Video metadata not loaded');
      }
      
      // Check if video has audio/video tracks
      const hasVideoTrack = videoProps.videoWidth > 0 && videoProps.videoHeight > 0;
      console.log(`Video track detected: ${hasVideoTrack} (${videoProps.videoWidth}x${videoProps.videoHeight})`);
      
      // Try to play the video
      console.log('=== STEP 6: ATTEMPT TO PLAY VIDEO ===');
      
      // Unmute first (browsers require user interaction)
      if (videoProps.muted) {
        await page.click('[data-testid="unmute-button"]', { force: true }).catch(() => {
          console.log('Unmute button not found, trying video controls');
        });
      }
      
      // Try to play
      try {
        await videoElement.evaluate(el => el.play());
        console.log('✅ Video play() called successfully');
        
        // Wait a bit and check if video is actually playing
        await page.waitForTimeout(3000);
        
        const playingState = await videoElement.evaluate(el => ({
          paused: el.paused,
          currentTime: el.currentTime,
          ended: el.ended
        }));
        
        console.log('=== VIDEO PLAYBACK STATE ===');
        console.log(JSON.stringify(playingState, null, 2));
        
        if (!playingState.paused && playingState.currentTime > 0) {
          console.log('✅ Video is playing with both audio and video');
        } else if (!playingState.paused) {
          console.log('⚠️ Video appears to be playing but currentTime is 0 - check for audio-only playback');
        } else {
          console.log('❌ Video is not playing');
        }
        
      } catch (playError) {
        console.log('❌ Video play() failed:', playError.message);
      }
    }
    
    console.log('=== STEP 7: CHECK BROWSER CONSOLE ERRORS ===');
    
    // Collect any console errors
    const consoleMessages = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleMessages.push(`[CONSOLE ERROR] ${msg.text()}`);
      }
    });
    
    // Check for JavaScript errors
    const jsErrors = [];
    page.on('pageerror', error => {
      jsErrors.push(`[JS ERROR] ${error.message}`);
    });
    
    // Wait a bit more to collect any async errors
    await page.waitForTimeout(2000);
    
    if (consoleMessages.length > 0) {
      console.log('=== CONSOLE ERRORS FOUND ===');
      consoleMessages.forEach(msg => console.log(msg));
    } else {
      console.log('✅ No console errors detected');
    }
    
    if (jsErrors.length > 0) {
      console.log('=== JAVASCRIPT ERRORS FOUND ===');
      jsErrors.forEach(error => console.log(error));
    } else {
      console.log('✅ No JavaScript errors detected');
    }
    
    console.log('=== STEP 8: CHECK NETWORK REQUESTS ===');
    
    // Monitor network requests for video-related URLs
    const videoRequests = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/streams/preview/') || 
          url.includes('.m3u8') || 
          url.includes('.ts') || 
          url.includes('.mp4') || 
          url.includes('video/')) {
        videoRequests.push({
          url: url,
          method: request.method(),
          headers: request.headers()
        });
      }
    });
    
    page.on('response', response => {
      const url = response.url();
      if (url.includes('/streams/preview/') || 
          url.includes('.m3u8') || 
          url.includes('.ts') || 
          url.includes('.mp4')) {
        console.log(`[NETWORK] ${response.status()} ${url}`);
        console.log(`[HEADERS] Content-Type: ${response.headers()['content-type']}`);
      }
    });
    
    // Refresh the video to trigger new network requests
    try {
      await page.click('[data-testid="refresh-stream-button"]', { timeout: 5000 });
      await page.waitForTimeout(3000);
    } catch (e) {
      console.log('Refresh button not found or not clickable');
    }
    
    console.log('=== VIDEO NETWORK REQUESTS ===');
    videoRequests.forEach(req => {
      console.log(`${req.method} ${req.url}`);
      if (req.headers['content-type']) {
        console.log(`  Content-Type: ${req.headers['content-type']}`);
      }
    });
    
    // Take final screenshot
    await page.screenshot({ path: 'test-results/video-player-final.png', fullPage: true });
    
    console.log('=== DIAGNOSIS COMPLETE ===');
    
    // Close the video player dialog
    await page.click('[data-testid="close-video-player"]').catch(() => {
      console.log('Close button not found, using escape key');
      page.keyboard.press('Escape');
    });
  });
  
  test('Test backend stream preview endpoints directly', async ({ page }) => {
    console.log('=== TESTING BACKEND ENDPOINTS DIRECTLY ===');
    
    // Test the streams API
    const streamsResponse = await page.request.get('http://localhost:8080/api/streams');
    console.log(`Streams API status: ${streamsResponse.status()}`);
    
    const streams = await streamsResponse.json();
    console.log(`Found ${streams.length} streams in database`);
    
    if (streams.length > 0) {
      const testStream = streams[0];
      console.log(`Testing stream: ${testStream.name} (${testStream.id})`);
      
      // Test the preview endpoint
      const previewResponse = await page.request.get(
        `http://localhost:8080/streams/preview/${testStream.id}`
      );
      
      console.log(`Preview endpoint status: ${previewResponse.status()}`);
      console.log(`Content-Type: ${previewResponse.headers()['content-type']}`);
      
      // Try to access the stream data
      if (previewResponse.status() === 200) {
        console.log('✅ Stream preview endpoint is working');
        
        // Check if it's returning video data or an error page
        const contentType = previewResponse.headers()['content-type'];
        if (contentType && (
          contentType.includes('video/') || 
          contentType.includes('application/vnd.apple.mpegurl') ||
          contentType.includes('application/dash+xml')
        )) {
          console.log('✅ Response appears to be valid video content');
        } else {
          console.log('⚠️ Response content type may indicate an error or HTML page');
          const bodyText = await previewResponse.text();
          console.log('Response body preview:', bodyText.substring(0, 500));
        }
      } else {
        console.log('❌ Stream preview endpoint failed');
        const errorText = await previewResponse.text();
        console.log('Error response:', errorText);
      }
    } else {
      console.log('❌ No streams found in database');
    }
  });
});