const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Validation - Actual Video Loading', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000); // 2 minutes

    // Capture console messages and errors
    page.on('console', (msg) => {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    page.on('pageerror', (error) => {
      console.log(`[PAGE ERROR] ${error.message}`);
    });

    page.on('requestfailed', (request) => {
      console.log(`[REQUEST FAILED] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Navigate to PlexBridge
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Validate Stream Preview Actually Loads Video', async ({ page }) => {
    console.log('🔍 Testing if stream preview actually loads and plays video');

    // Navigate to Stream Manager
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');

    // Check for existing streams
    const existingStreams = await page.locator('table tbody tr').count();
    console.log(`📊 Found ${existingStreams} existing streams`);

    if (existingStreams === 0) {
      console.log('ℹ️ No existing streams found. Creating a test stream first.');
      
      // Create a test stream with a working URL
      await page.click('[data-testid="add-stream-button"]');
      await page.waitForSelector('[data-testid="stream-dialog"]');
      
      // Fill in test stream details with a known working stream
      const nameInput = page.locator('[data-testid="stream-name-input"] input').first();
      const urlInput = page.locator('[data-testid="stream-url-input"] input').first();
      
      await nameInput.fill('Test Stream - Big Buck Bunny');
      await urlInput.fill('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
      
      // Save the stream
      await page.click('[data-testid="save-stream-button"]');
      await page.waitForTimeout(2000);
      
      console.log('✅ Test stream created');
    }

    // Now test preview on the first stream
    const firstRow = page.locator('table tbody tr').first();
    const streamName = await firstRow.locator('td').nth(1).textContent();
    console.log(`📺 Testing preview for stream: ${streamName}`);

    // Look for preview button
    const previewButton = firstRow.locator('[data-testid="preview-stream-button"]');
    
    if (!(await previewButton.isVisible())) {
      console.log('❌ No preview button found - checking for alternative selectors');
      
      // Try other possible selectors for preview
      const actionButtons = firstRow.locator('button');
      const buttonCount = await actionButtons.count();
      console.log(`Found ${buttonCount} buttons in row`);
      
      for (let i = 0; i < buttonCount; i++) {
        const button = actionButtons.nth(i);
        const buttonText = await button.textContent();
        const ariaLabel = await button.getAttribute('aria-label');
        console.log(`Button ${i}: text="${buttonText}", aria-label="${ariaLabel}"`);
        
        if (buttonText?.includes('preview') || ariaLabel?.includes('preview') || 
            buttonText?.includes('play') || ariaLabel?.includes('play')) {
          console.log(`🎬 Found potential preview button: ${buttonText || ariaLabel}`);
          await button.click();
          break;
        }
      }
    } else {
      console.log('🎬 Clicking preview button');
      await previewButton.click();
    }

    await page.waitForTimeout(2000);

    // Check if preview modal opened
    const previewModal = page.locator('.MuiDialog-root');
    const isModalVisible = await previewModal.isVisible();
    
    if (!isModalVisible) {
      console.log('❌ Preview modal did not open');
      await page.screenshot({ path: 'test-results/preview-modal-not-opened.png' });
      throw new Error('Preview modal did not open');
    }

    console.log('✅ Preview modal opened');
    await page.screenshot({ path: 'test-results/preview-modal-opened.png' });

    // Look for video element and check its state
    const videoElement = page.locator('video');
    const isVideoVisible = await videoElement.isVisible();
    
    if (!isVideoVisible) {
      console.log('❌ Video element not found in preview modal');
      await page.screenshot({ path: 'test-results/no-video-element.png' });
    } else {
      console.log('✅ Video element found');
      
      // Check video properties
      const videoSrc = await videoElement.getAttribute('src');
      const videoCurrentTime = await videoElement.evaluate(video => video.currentTime);
      const videoReadyState = await videoElement.evaluate(video => video.readyState);
      const videoNetworkState = await videoElement.evaluate(video => video.networkState);
      const videoError = await videoElement.evaluate(video => video.error);
      
      console.log(`📹 Video properties:`);
      console.log(`   src: ${videoSrc}`);
      console.log(`   currentTime: ${videoCurrentTime}`);
      console.log(`   readyState: ${videoReadyState} (0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA)`);
      console.log(`   networkState: ${videoNetworkState} (0=EMPTY, 1=IDLE, 2=LOADING, 3=NO_SOURCE)`);
      console.log(`   error: ${videoError ? videoError.code : 'null'}`);
      
      if (videoError) {
        console.log(`❌ Video has error: ${videoError.code} - ${videoError.message}`);
      }
      
      if (videoReadyState >= 1) {
        console.log('✅ Video has loaded metadata successfully');
      } else {
        console.log('❌ Video has not loaded metadata');
      }
      
      // Wait for video to potentially load
      console.log('⏱️ Waiting for video to load...');
      try {
        await page.waitForFunction(
          () => {
            const video = document.querySelector('video');
            return video && (video.readyState >= 2 || video.error);
          },
          { timeout: 10000 }
        );
        
        // Check again after waiting
        const finalReadyState = await videoElement.evaluate(video => video.readyState);
        const finalError = await videoElement.evaluate(video => video.error);
        
        if (finalError) {
          console.log(`❌ Video failed to load: Error ${finalError.code}`);
          await page.screenshot({ path: 'test-results/video-load-error.png' });
        } else if (finalReadyState >= 2) {
          console.log('🎉 SUCCESS: Video loaded successfully!');
          await page.screenshot({ path: 'test-results/video-loaded-success.png' });
        }
      } catch (timeoutError) {
        console.log('⏱️ Timeout waiting for video to load');
      }
    }

    // Check for Video.js player
    const videojsPlayer = page.locator('.video-js');
    if (await videojsPlayer.isVisible()) {
      console.log('📺 Video.js player detected');
      
      // Check Video.js player state
      const playerClass = await videojsPlayer.getAttribute('class');
      console.log(`Video.js classes: ${playerClass}`);
      
      if (playerClass?.includes('vjs-error')) {
        console.log('❌ Video.js player is in error state');
      } else if (playerClass?.includes('vjs-playing')) {
        console.log('▶️ Video.js player is playing');
      } else if (playerClass?.includes('vjs-paused')) {
        console.log('⏸️ Video.js player is paused');
      }
    }

    // Test preview controls if they exist
    const playButton = previewModal.locator('button[aria-label*="play"], .vjs-play-control');
    if (await playButton.isVisible()) {
      console.log('🎮 Play button found - testing playback');
      await playButton.click();
      await page.waitForTimeout(2000);
      
      const isPlaying = await videoElement.evaluate(video => !video.paused);
      if (isPlaying) {
        console.log('🎉 Video is playing!');
      } else {
        console.log('❌ Video is not playing');
      }
    }

    // Close modal
    const closeButton = previewModal.locator('button[aria-label="close"], .MuiDialogTitle-root button');
    if (await closeButton.isVisible()) {
      await closeButton.click();
      console.log('✅ Preview modal closed');
    }

    // Final assessment
    console.log('\\n📋 STREAM PREVIEW VALIDATION SUMMARY:');
    console.log('=====================================');
    console.log(`🎭 Modal opened: ${isModalVisible ? 'YES' : 'NO'}`);
    console.log(`📹 Video element found: ${isVideoVisible ? 'YES' : 'NO'}`);
    
    if (isVideoVisible) {
      const finalVideoError = await videoElement.evaluate(video => video.error);
      const finalReadyState = await videoElement.evaluate(video => video.readyState);
      
      console.log(`✅ Video loaded successfully: ${finalReadyState >= 2 && !finalVideoError ? 'YES' : 'NO'}`);
      console.log(`❌ Video has errors: ${finalVideoError ? 'YES' : 'NO'}`);
      
      if (finalVideoError || finalReadyState < 2) {
        throw new Error(`Stream preview validation failed: Video ${finalVideoError ? 'has error' : 'did not load'}`);
      }
    } else {
      throw new Error('Stream preview validation failed: No video element found');
    }
  });

  test('Test Stream Preview with Known Working URL', async ({ page }) => {
    console.log('🔍 Testing stream preview with a known working video URL');

    // Navigate to Stream Manager
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');

    // Create a test stream with a known working video
    await page.click('[data-testid="add-stream-button"]');
    await page.waitForSelector('[data-testid="stream-dialog"]');
    
    const nameInput = page.locator('[data-testid="stream-dialog"] [data-testid="stream-name-input"] input');
    const urlInput = page.locator('[data-testid="stream-dialog"] [data-testid="stream-url-input"] input');
    
    await nameInput.fill('Test Video Stream');
    // Use a direct MP4 file that should work
    await urlInput.fill('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
    
    // Test the stream before saving
    const testButton = page.locator('[data-testid="test-stream-button"]');
    if (await testButton.isVisible()) {
      console.log('🧪 Testing stream URL before saving');
      await testButton.click();
      await page.waitForTimeout(5000);
      
      // Check for any error messages
      const errorAlert = page.locator('.MuiAlert-root[severity="error"]');
      if (await errorAlert.isVisible()) {
        const errorText = await errorAlert.textContent();
        console.log(`❌ Stream test failed: ${errorText}`);
      } else {
        console.log('✅ Stream test passed');
      }
    }
    
    // Save the stream
    await page.click('[data-testid="save-stream-button"]');
    await page.waitForTimeout(2000);
    
    console.log('✅ Test stream created with working URL');
    
    // Now test preview on this stream
    const newStreamRow = page.locator('table tbody tr:has-text("Test Video Stream")');
    const previewButton = newStreamRow.locator('[data-testid="preview-stream-button"]');
    
    if (await previewButton.isVisible()) {
      await previewButton.click();
      await page.waitForTimeout(3000);
      
      // Verify video loads
      const video = page.locator('video');
      if (await video.isVisible()) {
        const readyState = await video.evaluate(v => v.readyState);
        const error = await video.evaluate(v => v.error);
        
        console.log(`📹 Video readyState: ${readyState}`);
        console.log(`❌ Video error: ${error ? error.code : 'none'}`);
        
        if (readyState >= 2 && !error) {
          console.log('🎉 SUCCESS: Stream preview working with known good URL!');
        } else {
          console.log('❌ FAILED: Even known good URL not working in preview');
        }
      }
    }
  });
});