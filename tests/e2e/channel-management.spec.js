const { test, expect } = require('@playwright/test');

test.describe('Channel Management Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to Channel Manager using data-testid for better reliability
    await page.click('[data-testid="nav-channels"]');
    await page.waitForLoadState('networkidle');
  });

  test('should display channel management interface', async ({ page }) => {
    // Check if the channel manager page loads
    await expect(page.locator('text=Channel Manager')).toBeVisible();
    await expect(page.locator('[data-testid="add-channel-button"]')).toBeVisible();
    
    // Check if channels table is present
    await expect(page.locator('table')).toBeVisible();
  });

  test('should allow stream preview from channel view', async ({ page }) => {
    // Wait for channels to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    const channelRows = await page.locator('table tbody tr').count();
    
    if (channelRows > 0) {
      // Look for channels with streams
      const channelWithStreams = page.locator('table tbody tr').filter({ hasText: /\d+ streams/ }).first();
      
      if (await channelWithStreams.isVisible()) {
        // Click on the streams button/link
        await channelWithStreams.locator('button:has([data-testid="StreamIcon"]), a:has-text("streams")').click();
        
        // Should navigate to streams or open stream management
        // This depends on your implementation - might open a dialog or navigate to streams page
        await page.waitForTimeout(2000);
        
        // Check if we can access stream preview functionality
        const previewButton = page.locator('[data-testid="preview-stream-button"]').first();
        if (await previewButton.isVisible({ timeout: 5000 })) {
          await previewButton.click();
          
          // Check if video player opens
          await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
          
          // Close the player
          await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
        }
      } else {
        test.skip(true, 'No channels with streams available for testing');
      }
    } else {
      test.skip(true, 'No channels available for testing');
    }
  });

  test('should create new channel with stream and test preview', async ({ page }) => {
    // Create a new channel using data-testid
    await page.click('[data-testid="add-channel-button"]');
    
    // Fill channel details (need to add data-testids to channel dialog inputs)
    await page.fill('input[label*="Channel Name"]', 'Test Preview Channel');
    await page.fill('input[label*="Channel Number"]', '999');
    
    // Save channel
    await page.click('button:has-text("Save Channel")');
    
    // Wait for success message
    await expect(page.locator('text=created successfully')).toBeVisible({ timeout: 10000 });
    
    // Navigate to streams using data-testid
    await page.click('[data-testid="nav-streams"]');
    
    // Create a stream for the channel
    await page.click('[data-testid="add-stream-button"]');
    
    // Fill stream details using data-testid
    await page.fill('[data-testid="stream-name-input"]', 'Test Preview Stream');
    await page.fill('[data-testid="stream-url-input"]', 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
    
    // Select the channel we just created
    await page.click('[role="combobox"]:near(text="Channel")');
    await page.click('li:has-text("Test Preview Channel")');
    
    // Save stream using data-testid
    await page.click('[data-testid="save-stream-button"]');
    
    // Wait for success message
    await expect(page.locator('text=created successfully')).toBeVisible({ timeout: 10000 });
    
    // Now test the stream preview using data-testid
    const newStreamRow = page.locator('table tbody tr').filter({ hasText: 'Test Preview Stream' });
    await newStreamRow.locator('[data-testid="preview-stream-button"]').click();
    
    // Check if video player opens
    await expect(page.locator('dialog:has(video), [role="dialog"]:has(video)')).toBeVisible({ timeout: 15000 });
    
    // Close the player
    await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
    
    // Clean up - delete the test stream and channel using data-testid
    await newStreamRow.locator('[data-testid="delete-stream-button"]').click();
    await page.waitForTimeout(1000);
    
    // Navigate back to channels and delete test channel
    await page.click('[data-testid="nav-channels"]');
    const testChannelRow = page.locator('table tbody tr').filter({ hasText: 'Test Preview Channel' });
    await testChannelRow.locator('[data-testid="delete-channel-button"]').click();
    await page.waitForTimeout(1000);
  });

  test('should handle channel stream navigation correctly', async ({ page }) => {
    // Wait for channels to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    const channelRows = await page.locator('table tbody tr').count();
    
    if (channelRows > 0) {
      // Find a channel with streams
      const channelWithStreams = page.locator('table tbody tr').filter({ hasText: /[1-9]\d* streams/ }).first();
      
      if (await channelWithStreams.isVisible()) {
        // Click on manage streams button
        await channelWithStreams.locator('button:has([data-testid="StreamIcon"])').click();
        
        // Should navigate or open stream management
        await page.waitForTimeout(2000);
        
        // Verify we can see stream-related functionality
        const hasStreamInterface = await page.locator('text=Stream, [data-testid="add-stream-button"], table:has(text="URL")').first().isVisible({ timeout: 5000 });
        
        expect(hasStreamInterface).toBeTruthy();
      } else {
        test.skip(true, 'No channels with streams available for testing');
      }
    } else {
      test.skip(true, 'No channels available for testing');
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
    
    // Navigate to channels
    await page.click('[data-testid="nav-channels"]');
    await page.waitForLoadState('networkidle');
    
    // On mobile, the add button should be a FAB
    const addFab = page.locator('[data-testid="add-channel-fab"]');
    if (await addFab.isVisible()) {
      await addFab.click();
      
      // Check channel creation dialog opens
      await expect(page.locator('dialog:has(text="Add Channel")')).toBeVisible();
      
      // Close dialog
      await page.click('button:has-text("Cancel")');
    }
  });

  test('should handle edit and delete operations with proper selectors', async ({ page }) => {
    // Wait for channels to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    const channelRows = await page.locator('table tbody tr').count();
    
    if (channelRows > 0) {
      // Test edit functionality using data-testid
      await page.locator('[data-testid="edit-channel-button"]').first().click();
      
      // Check edit dialog opens
      await expect(page.locator('dialog:has(text="Edit Channel")')).toBeVisible();
      
      // Close edit dialog
      await page.click('button:has-text("Cancel")');
      
      // Verify the delete button is present but don't actually delete
      await expect(page.locator('[data-testid="delete-channel-button"]').first()).toBeVisible();
    } else {
      test.skip(true, 'No channels available for testing');
    }
  });

  test('should navigate between different sections correctly', async ({ page }) => {
    // Test navigation between sections using data-testid
    
    // Start at channels
    await expect(page.locator('text=Channel Manager')).toBeVisible();
    
    // Navigate to streams
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Stream Manager')).toBeVisible();
    
    // Navigate back to channels
    await page.click('[data-testid="nav-channels"]');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Channel Manager')).toBeVisible();
    
    // Navigate to dashboard
    await page.click('[data-testid="nav-dashboard"]');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });
});