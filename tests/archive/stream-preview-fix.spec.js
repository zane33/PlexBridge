const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Fix Tests', () => {
  const testStreamUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const testStreamName = 'Test HLS Stream';

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="nav-dashboard"]', { timeout: 30000 });
  });

  test('Add and preview stream workflow', async ({ page }) => {
    console.log('Step 1: Navigate to Streams');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text="Stream Manager"')).toBeVisible();

    console.log('Step 2: Open Add Stream dialog');
    await page.click('[data-testid="add-stream-button"]');
    await page.waitForTimeout(1000);
    
    // Verify dialog opened
    const dialogVisible = await page.locator('.MuiDialog-root').isVisible();
    expect(dialogVisible).toBe(true);

    console.log('Step 3: Fill stream details');
    // Use proper Material-UI TextField selectors
    await page.fill('[data-testid="stream-name-input"] input', testStreamName);
    await page.fill('[data-testid="stream-url-input"] input', testStreamUrl);
    
    // Select a channel (required for form validation)
    console.log('Step 3.5: Select a channel');
    await page.waitForTimeout(1000); // Give time for channels to load
    await page.click('.MuiFormControl-root:has(.MuiInputLabel-root:text("Channel")) .MuiSelect-select');
    await page.waitForSelector('.MuiMenuItem-root', { timeout: 5000 });
    await page.click('.MuiMenuItem-root:first-child');
    
    // Select stream type if available
    const typeSelector = page.locator('[data-testid="stream-type-select"]');
    if (await typeSelector.isVisible({ timeout: 1000 })) {
      await typeSelector.click();
      await page.click('li[data-value="hls"]');
    }

    console.log('Step 4: Save stream');
    await page.click('[data-testid="save-stream-button"]');
    await page.waitForTimeout(3000);

    // Verify stream was added to table (use first() to handle multiple instances)
    await expect(page.locator(`tr:has-text("${testStreamName}")`).first()).toBeVisible();

    console.log('Step 5: Click preview button');
    // Find the row with our stream and click its preview button
    const streamRow = page.locator(`tr:has-text("${testStreamName}")`).first();
    const previewButton = streamRow.locator('[data-testid="preview-stream-button"]');
    
    await expect(previewButton).toBeVisible();
    await previewButton.click();
    await page.waitForTimeout(2000);

    console.log('Step 6: Verify video player modal');
    // Check for video player dialog
    const playerDialog = page.locator('[data-testid="video-player-dialog"]');
    const videoElement = page.locator('video');
    
    // Wait for either the dialog or video element
    await expect(playerDialog.or(videoElement)).toBeVisible({ timeout: 10000 });

    console.log('Step 7: Check video player functionality');
    // If video element exists, check if it's playing
    if (await videoElement.isVisible()) {
      // Wait for video to start loading
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video && (video.readyState >= 2 || video.networkState === 1);
        },
        { timeout: 15000 }
      );

      // Check video properties
      const videoProperties = await page.evaluate(() => {
        const video = document.querySelector('video');
        return {
          src: video?.src || video?.currentSrc,
          readyState: video?.readyState,
          networkState: video?.networkState,
          paused: video?.paused,
          duration: video?.duration,
          currentTime: video?.currentTime
        };
      });

      console.log('Video properties:', videoProperties);
      
      // Verify video has a source
      expect(videoProperties.src).toBeTruthy();
      
      // Try to play the video if paused
      if (videoProperties.paused) {
        await page.evaluate(() => {
          const video = document.querySelector('video');
          if (video) video.play().catch(e => console.log('Play failed:', e));
        });
        await page.waitForTimeout(2000);
      }
    }

    // Take screenshot of final state
    await page.screenshot({ path: 'test-results/stream-preview-final.png', fullPage: true });
    
    console.log('✅ Stream add and preview test completed');
  });

  test('Test direct stream URL preview', async ({ page }) => {
    console.log('Testing direct stream preview without proxy');
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');

    // Check if there's an existing stream to preview
    const existingPreviewButton = page.locator('[data-testid="preview-stream-button"]').first();
    
    if (await existingPreviewButton.isVisible({ timeout: 5000 })) {
      await existingPreviewButton.click();
      await page.waitForTimeout(3000);

      // Check the stream URL being used
      const streamUrl = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.src || video?.currentSrc;
      });

      console.log('Stream URL being played:', streamUrl);

      // Check if it's using proxy or direct URL
      const isProxied = streamUrl?.includes('/stream/') || streamUrl?.includes('/api/stream');
      const isDirect = streamUrl?.includes('.m3u8') || streamUrl?.includes('.m3u');

      console.log('Stream mode:', isProxied ? 'Proxied' : isDirect ? 'Direct' : 'Unknown');
    }
  });

  test('Test stream validation before preview', async ({ page }) => {
    console.log('Testing stream validation');
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');

    // Add a stream with invalid URL
    await page.click('[data-testid="add-stream-button"]');
    await page.waitForTimeout(1000);

    await page.fill('[data-testid="stream-name-input"] input', 'Invalid Stream');
    await page.fill('[data-testid="stream-url-input"] input', 'https://invalid-url.com/stream.m3u8');

    // Select a channel (required for form validation)
    await page.waitForTimeout(1000); // Give time for channels to load
    await page.click('.MuiFormControl-root:has(.MuiInputLabel-root:text("Channel")) .MuiSelect-select');
    await page.waitForSelector('.MuiMenuItem-root', { timeout: 5000 });
    await page.click('.MuiMenuItem-root:first-child');

    // Check for test/validate button
    const testButton = page.locator('[data-testid="test-stream-button"]');
    if (await testButton.isVisible({ timeout: 2000 })) {
      await testButton.click();
      await page.waitForTimeout(3000);

      // Check for validation error
      const errorMessage = await page.locator('.MuiAlert-root, [role="alert"]').isVisible();
      console.log('Validation error shown:', errorMessage);
    }

    await page.click('[data-testid="cancel-stream-button"]');
  });
});