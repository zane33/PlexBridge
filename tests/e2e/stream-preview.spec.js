const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to Stream Manager using data-testid for better reliability
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
  });

  test('should open stream preview from stream table', async ({ page }) => {
    // Wait for streams to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    // Check if there are streams available
    const streamRows = await page.locator('table tbody tr').count();
    
    if (streamRows > 0) {
      // Click on the first preview button using data-testid
      await page.locator('[data-testid="preview-stream-button"]').first().click();
      
      // Check if video player dialog opens
      await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
    } else {
      test.skip(true, 'No streams available for testing');
    }
  });

  test('should handle stream preview errors gracefully', async ({ page }) => {
    // Create a test stream with invalid URL for testing
    await page.click('[data-testid="add-stream-button"]');
    
    // Fill in stream details with invalid URL
    await page.fill('[data-testid="stream-name-input"]', 'Test Invalid Stream');
    await page.fill('[data-testid="stream-url-input"]', 'https://invalid-url-for-testing.com/stream.m3u8');
    
    // Select a channel if available
    const channelSelect = page.locator('[role="combobox"]:near(text="Channel")');
    if (await channelSelect.isVisible()) {
      await channelSelect.click();
      await page.click('li[role="option"]').first();
    }
    
    // Save the stream
    await page.click('[data-testid="save-stream-button"]');
    
    // Wait for stream to be created
    await page.waitForSelector('text=created successfully', { timeout: 10000 });
    
    // Now try to preview the invalid stream
    await page.locator('table tbody tr').filter({ hasText: 'Test Invalid Stream' }).locator('[data-testid="preview-stream-button"]').click();
    
    // Check for error handling in video player
    await page.waitForSelector('dialog:has(video), [role="dialog"]:has(video)', { timeout: 15000 });
    
    // Look for error messages or retry options
    await expect(page.locator('text=error, text=failed, text=unable')).toBeVisible({ timeout: 30000 });
  });

  test('should test stream from stream creation dialog', async ({ page }) => {
    // Click Add Stream button using data-testid
    await page.click('[data-testid="add-stream-button"]');
    
    // Fill in stream details
    await page.fill('[data-testid="stream-name-input"]', 'Test Stream Preview');
    await page.fill('[data-testid="stream-url-input"]', 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
    
    // Test the stream using the "Test in Player" button
    await page.click('[data-testid="test-stream-button"]');
    
    // Check if video player dialog opens
    await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
    
    // Close the player
    await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
    
    // Cancel the stream creation
    await page.click('[data-testid="cancel-stream-button"]');
  });

  test('should validate stream URL before testing', async ({ page }) => {
    // Click Add Stream button using data-testid
    await page.click('[data-testid="add-stream-button"]');
    
    // Try to test without entering URL - test button should be disabled
    const testButton = page.locator('[data-testid="test-stream-button"]');
    await expect(testButton).toBeDisabled();
    
    // Enter stream name but no URL - test button should still be disabled
    await page.fill('[data-testid="stream-name-input"]', 'Test Stream');
    await expect(testButton).toBeDisabled();
    
    // Enter URL - test button should be enabled
    await page.fill('[data-testid="stream-url-input"]', 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
    await expect(testButton).toBeEnabled();
  });

  test('should show proxy URL for existing streams', async ({ page }) => {
    // Wait for streams to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    const streamRows = await page.locator('table tbody tr').count();
    
    if (streamRows > 0) {
      // Click edit on first stream using data-testid
      await page.locator('[data-testid="edit-stream-button"]').first().click();
      
      // Check if proxy URL is displayed
      await expect(page.locator('input[label*="PlexBridge Proxy URL"], input[readonly]:has-text("/stream/")').or(page.locator('text=/stream/'))).toBeVisible({ timeout: 10000 });
      
      // Cancel the edit
      await page.click('[data-testid="cancel-stream-button"]');
    } else {
      test.skip(true, 'No streams available for testing');
    }
  });

  test('should handle video player controls', async ({ page }) => {
    // This test assumes we have a working stream
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    const streamRows = await page.locator('table tbody tr').count();
    
    if (streamRows > 0) {
      // Open stream preview using data-testid
      await page.locator('[data-testid="preview-stream-button"]').first().click();
      
      // Wait for video player to load
      await page.waitForSelector('dialog:has(video), [role="dialog"]:has(video)', { timeout: 15000 });
      
      // Look for video controls
      const videoElement = page.locator('video').first();
      await expect(videoElement).toBeVisible();
      
      // Test player controls if visible
      const playButton = page.locator('button:has([data-testid="PlayIcon"]), button[aria-label*="play"]');
      const pauseButton = page.locator('button:has([data-testid="PauseIcon"]), button[aria-label*="pause"]');
      
      if (await playButton.isVisible({ timeout: 5000 })) {
        await playButton.click();
        await page.waitForTimeout(2000);
      }
      
      if (await pauseButton.isVisible({ timeout: 5000 })) {
        await pauseButton.click();
      }
      
      // Close the player
      await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
    } else {
      test.skip(true, 'No streams available for testing');
    }
  });

  test('should allow switching between proxy and direct URL', async ({ page }) => {
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    const streamRows = await page.locator('table tbody tr').count();
    
    if (streamRows > 0) {
      // Open stream preview using data-testid
      await page.locator('[data-testid="preview-stream-button"]').first().click();
      
      // Wait for video player to load
      await page.waitForSelector('dialog:has(video), [role="dialog"]:has(video)', { timeout: 15000 });
      
      // Look for proxy toggle switch
      const proxySwitch = page.locator('input[type="checkbox"]:near(text="proxy"), input[type="checkbox"]:near(text="Proxy")');
      
      if (await proxySwitch.isVisible({ timeout: 5000 })) {
        // Toggle proxy setting
        await proxySwitch.click();
        await page.waitForTimeout(1000);
        
        // Toggle back
        await proxySwitch.click();
      }
      
      // Close the player
      await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
    } else {
      test.skip(true, 'No streams available for testing');
    }
  });

  // Add responsive design test for mobile viewport
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
      
      // Check stream creation dialog opens
      await expect(page.locator('[data-testid="stream-dialog"]')).toBeVisible();
      
      // Close dialog
      await page.click('[data-testid="cancel-stream-button"]');
    }
  });
});