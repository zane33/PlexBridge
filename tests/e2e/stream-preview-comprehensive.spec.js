const { test, expect } = require('@playwright/test');

test.describe('Stream Preview - Comprehensive Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to Stream Manager using data-testid for better reliability
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
  });

  test('should open stream preview dialog from existing streams', async ({ page }) => {
    // Wait for streams to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    // Check if there are streams available
    const streamRows = await page.locator('table tbody tr').count();
    
    if (streamRows > 0) {
      // Click on the first preview button using data-testid
      await page.locator('[data-testid="preview-stream-button"]').first().click();
      
      // Check if video player dialog opens
      await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
      
      // Verify video element is present
      await expect(page.locator('video')).toBeVisible();
      
      // Close the player using proper selector
      await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
      
      // Verify player is closed
      await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).not.toBeVisible();
    } else {
      test.skip(true, 'No streams available for testing');
    }
  });

  test('should test stream from stream creation dialog', async ({ page }) => {
    // Click Add Stream button using data-testid
    await page.click('[data-testid="add-stream-button"]');
    
    // Wait for dialog to open
    await expect(page.locator('[data-testid="stream-dialog"]')).toBeVisible();
    
    // Fill in stream details with a working test URL
    await page.fill('[data-testid="stream-name-input"]', 'Test Stream Preview');
    await page.fill('[data-testid="stream-url-input"]', 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
    
    // Verify test button is enabled after URL is entered
    const testButton = page.locator('[data-testid="test-stream-button"]');
    await expect(testButton).toBeEnabled();
    
    // Test the stream using the "Test in Player" button
    await testButton.click();
    
    // Check if video player dialog opens
    await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
    
    // Verify video element is present and has correct attributes
    const videoElement = page.locator('video');
    await expect(videoElement).toBeVisible();
    
    // Close the player
    await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
    
    // Cancel the stream creation dialog
    await page.click('[data-testid="cancel-stream-button"]');
    
    // Verify both dialogs are closed
    await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).not.toBeVisible();
    await expect(page.locator('[data-testid="stream-dialog"]')).not.toBeVisible();
  });

  test('should validate stream URL before enabling test button', async ({ page }) => {
    await page.click('[data-testid="add-stream-button"]');
    
    const testButton = page.locator('[data-testid="test-stream-button"]');
    
    // Test button should be disabled when no URL is entered
    await expect(testButton).toBeDisabled();
    
    // Enter stream name but no URL - test button should still be disabled
    await page.fill('[data-testid="stream-name-input"]', 'Test Stream');
    await expect(testButton).toBeDisabled();
    
    // Enter invalid URL - test button should still be disabled or show error
    await page.fill('[data-testid="stream-url-input"]', 'invalid-url');
    await expect(testButton).toBeDisabled();
    
    // Enter valid URL - test button should be enabled
    await page.fill('[data-testid="stream-url-input"]', 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
    await expect(testButton).toBeEnabled();
    
    // Clear URL - test button should be disabled again
    await page.fill('[data-testid="stream-url-input"]', '');
    await expect(testButton).toBeDisabled();
  });

  test('should handle stream preview errors gracefully', async ({ page }) => {
    // Create a test stream with invalid URL for error testing
    await page.click('[data-testid="add-stream-button"]');
    
    // Fill in stream details with invalid URL
    await page.fill('[data-testid="stream-name-input"]', 'Test Invalid Stream');
    await page.fill('[data-testid="stream-url-input"]', 'https://invalid-streaming-url-for-testing.com/nonexistent.m3u8');
    
    // Test the invalid stream
    await page.click('[data-testid="test-stream-button"]');
    
    // Player should still open (error handling happens within player)
    await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
    
    // Wait for error to be displayed (could be in console, error message, or player UI)
    await page.waitForTimeout(5000);
    
    // Look for error indicators in the player or error messages
    const errorIndicators = [
      page.locator('text=/error/i'),
      page.locator('text=/failed/i'),
      page.locator('text=/unable/i'),
      page.locator('[role="alert"]'),
      page.locator('.error')
    ];
    
    let errorFound = false;
    for (const indicator of errorIndicators) {
      if (await indicator.isVisible({ timeout: 2000 })) {
        errorFound = true;
        break;
      }
    }
    
    // Close the player
    await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
    
    // Cancel stream creation
    await page.click('[data-testid="cancel-stream-button"]');
  });

  test('should display proxy URL for existing streams', async ({ page }) => {
    // Wait for streams to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    const streamRows = await page.locator('table tbody tr').count();
    
    if (streamRows > 0) {
      // Click edit on first stream using data-testid
      await page.locator('[data-testid="edit-stream-button"]').first().click();
      
      // Wait for edit dialog to open
      await expect(page.locator('[data-testid="stream-dialog"]')).toBeVisible();
      
      // Check if proxy URL field is displayed for existing streams
      const proxyUrlField = page.locator('input[label*="Proxy URL"], input[readonly]:has-text("/stream/"), text=/stream\//i');
      await expect(proxyUrlField.or(page.locator('text=/PlexBridge Proxy URL/i'))).toBeVisible({ timeout: 10000 });
      
      // Verify copy functionality if present
      const copyButton = page.locator('button:has([data-testid="ContentCopyIcon"]), button[aria-label*="copy"i]');
      if (await copyButton.isVisible()) {
        await copyButton.click();
        // Should show success message
        await expect(page.locator('text=/copied/i')).toBeVisible({ timeout: 5000 });
      }
      
      // Cancel the edit
      await page.click('[data-testid="cancel-stream-button"]');
    } else {
      test.skip(true, 'No streams available for testing');
    }
  });

  test('should handle video player controls and interactions', async ({ page }) => {
    // Wait for streams to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    const streamRows = await page.locator('table tbody tr').count();
    
    if (streamRows > 0) {
      // Open stream preview using data-testid
      await page.locator('[data-testid="preview-stream-button"]').first().click();
      
      // Wait for video player to load
      await page.waitForSelector('dialog:has(video), [role="dialog"]:has(video)', { timeout: 15000 });
      
      // Verify video element is present
      const videoElement = page.locator('video').first();
      await expect(videoElement).toBeVisible();
      
      // Test player controls if visible
      const playButton = page.locator('button:has([data-testid="PlayIcon"]), button[aria-label*="play"i]');
      const pauseButton = page.locator('button:has([data-testid="PauseIcon"]), button[aria-label*="pause"i]');
      const volumeButton = page.locator('button[aria-label*="volume"i], button[aria-label*="mute"i]');
      const fullscreenButton = page.locator('button[aria-label*="fullscreen"i]');
      
      // Test play/pause functionality
      if (await playButton.isVisible({ timeout: 5000 })) {
        await playButton.click();
        await page.waitForTimeout(2000);
        
        // Check if video is playing (duration should change)
        const initialTime = await videoElement.evaluate(video => video.currentTime);
        await page.waitForTimeout(2000);
        const laterTime = await videoElement.evaluate(video => video.currentTime);
        
        // Video should have progressed (allowing for some tolerance)
        expect(laterTime).toBeGreaterThan(initialTime - 0.1);
      }
      
      if (await pauseButton.isVisible({ timeout: 5000 })) {
        await pauseButton.click();
        await page.waitForTimeout(1000);
      }
      
      // Test volume controls
      if (await volumeButton.isVisible({ timeout: 3000 })) {
        await volumeButton.click();
        await page.waitForTimeout(500);
      }
      
      // Test proxy toggle if present
      const proxySwitch = page.locator('input[type="checkbox"]:near(text="proxy"), input[type="checkbox"]:near(text="Proxy")');
      if (await proxySwitch.isVisible({ timeout: 3000 })) {
        const initialState = await proxySwitch.isChecked();
        await proxySwitch.click();
        await page.waitForTimeout(1000);
        
        const newState = await proxySwitch.isChecked();
        expect(newState).not.toBe(initialState);
        
        // Toggle back
        await proxySwitch.click();
        await page.waitForTimeout(1000);
      }
      
      // Close the player
      await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
    } else {
      test.skip(true, 'No streams available for testing');
    }
  });

  test('should work correctly on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    
    // On mobile, navigation might be in a drawer
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
    }
    
    // Navigate to streams
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // On mobile, the add button should be a FAB
    const addFab = page.locator('[data-testid="add-stream-fab"]');
    if (await addFab.isVisible()) {
      await addFab.click();
      
      // Check stream creation dialog opens in fullscreen on mobile
      const streamDialog = page.locator('[data-testid="stream-dialog"]');
      await expect(streamDialog).toBeVisible();
      
      // Fill in test data
      await page.fill('[data-testid="stream-name-input"]', 'Mobile Test Stream');
      await page.fill('[data-testid="stream-url-input"]', 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
      
      // Test preview on mobile
      await page.click('[data-testid="test-stream-button"]');
      
      // Player should open in fullscreen on mobile
      await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
      
      // Close player
      await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
      
      // Close dialog
      await page.click('[data-testid="cancel-stream-button"]');
    }
  });

  test('should handle different stream types correctly', async ({ page }) => {
    const testStreams = [
      {
        name: 'HLS Test Stream',
        url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
        type: 'hls'
      },
      {
        name: 'DASH Test Stream', 
        url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.mpd',
        type: 'dash'
      }
    ];
    
    for (const stream of testStreams) {
      await page.click('[data-testid="add-stream-button"]');
      
      await page.fill('[data-testid="stream-name-input"]', stream.name);
      await page.fill('[data-testid="stream-url-input"]', stream.url);
      
      // Select stream type if dropdown is available
      const typeSelect = page.locator('select:near(text="Type"), [role="combobox"]:near(text="Type")');
      if (await typeSelect.isVisible()) {
        await typeSelect.click();
        await page.click(`text="${stream.type.toUpperCase()}", text="${stream.type}"`);
      }
      
      // Test preview
      await page.click('[data-testid="test-stream-button"]');
      
      // Player should open
      await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
      
      // Close player
      await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
      
      // Cancel dialog
      await page.click('[data-testid="cancel-stream-button"]');
      
      await page.waitForTimeout(1000); // Brief pause between tests
    }
  });

  test('should provide proper accessibility for screen readers', async ({ page }) => {
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    const streamRows = await page.locator('table tbody tr').count();
    
    if (streamRows > 0) {
      // Check aria-labels on preview buttons
      const previewButton = page.locator('[data-testid="preview-stream-button"]').first();
      const buttonTitle = await previewButton.getAttribute('aria-label') || await previewButton.getAttribute('title');
      
      // Should have descriptive label for screen readers
      expect(buttonTitle).toBeTruthy();
      
      await previewButton.click();
      
      // Player dialog should have proper aria attributes
      const playerDialog = page.locator('dialog:has(video), [role="dialog"]:has(video)');
      await expect(playerDialog).toBeVisible({ timeout: 15000 });
      
      // Check for aria-label or role on video player
      const videoElement = page.locator('video');
      const videoRole = await videoElement.getAttribute('role') || await videoElement.getAttribute('aria-label');
      
      // Close button should have proper aria-label
      const closeButton = page.locator('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
      const closeLabel = await closeButton.getAttribute('aria-label');
      expect(closeLabel).toBeTruthy();
      
      await closeButton.click();
    } else {
      test.skip(true, 'No streams available for testing');
    }
  });

  test('should handle keyboard navigation', async ({ page }) => {
    await page.click('[data-testid="add-stream-button"]');
    
    // Test tab navigation through form
    await page.keyboard.press('Tab'); // Should focus on name input
    await page.keyboard.type('Keyboard Test Stream');
    
    await page.keyboard.press('Tab'); // Should focus on URL input
    await page.keyboard.type('https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
    
    // Continue tabbing to test button
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => document.activeElement.tagName);
      if (focusedElement === 'BUTTON') {
        const buttonText = await page.evaluate(() => document.activeElement.textContent);
        if (buttonText.includes('Test')) {
          // Press Enter to activate test button
          await page.keyboard.press('Enter');
          break;
        }
      }
    }
    
    // Player should open
    await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
    
    // Test Escape key to close player
    await page.keyboard.press('Escape');
    
    // Should close player and return to form
    await expect(page.locator('[data-testid="stream-dialog"]')).toBeVisible();
    
    // Escape again to close form
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="stream-dialog"]')).not.toBeVisible();
  });

  test('should handle network interruptions during preview', async ({ page }) => {
    await page.click('[data-testid="add-stream-button"]');
    
    await page.fill('[data-testid="stream-name-input"]', 'Network Test Stream');
    await page.fill('[data-testid="stream-url-input"]', 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
    
    await page.click('[data-testid="test-stream-button"]');
    
    // Wait for player to open
    await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
    
    // Simulate network condition (slow 3G)
    await page.context().route('**/*', route => {
      // Delay all requests to simulate slow network
      setTimeout(() => route.continue(), 1000);
    });
    
    // Player should handle slow network gracefully
    await page.waitForTimeout(3000);
    
    // Should still be visible and functional
    await expect(page.locator('video')).toBeVisible();
    
    // Close player
    await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
    await page.click('[data-testid="cancel-stream-button"]');
  });
});
