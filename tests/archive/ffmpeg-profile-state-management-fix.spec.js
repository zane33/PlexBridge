const { test, expect } = require('@playwright/test');

test.describe('FFmpeg Profile Manager - State Management Fixes', () => {
  let testProfileId;
  let testStreamIds = [];

  test.beforeEach(async ({ page }) => {
    // Navigate to FFmpeg Profiles page
    await page.goto('/');
    await page.click('[data-testid="nav-ffmpeg profiles"]');
    await page.waitForSelector('text="FFmpeg Profiles"');
  });

  test.afterEach(async ({ page }) => {
    // Clean up test data if created
    if (testProfileId) {
      try {
        await fetch(`http://localhost:8080/api/ffmpeg-profiles/${testProfileId}`, {
          method: 'DELETE'
        });
      } catch (e) {
        console.log('Cleanup: Profile deletion failed or already deleted');
      }
    }
  });

  test('should immediately update GUI when removing streams from Associated Streams tab', async ({ page }) => {
    // First, create a test profile with streams
    await page.click('button:has-text("Add Profile")');
    await page.fill('input[label="Profile Name"]', 'Test Profile for State Management');
    await page.fill('textarea[label="Description"]', 'Testing immediate state updates');
    
    // Add a client configuration
    await page.click('text="Add Client Type"');
    await page.click('text="Web Browser"');
    
    // Save the profile
    await page.click('button:has-text("Create Profile")');
    await page.waitForSelector('text="Profile created successfully"');
    
    // Find the newly created profile
    await page.click('text="Test Profile for State Management"');
    
    // Wait for the profile dialog to open
    await page.waitForSelector('[data-testid="profile-edit-dialog"]');
    
    // Go to Bulk Assignment tab to assign some streams
    await page.click('[data-testid="bulk-assignment-tab"]');
    
    // Wait for streams to load
    await page.waitForSelector('[data-testid="available-streams-list"]');
    
    // Select a few streams (first 2)
    const streamCheckboxes = page.locator('[data-testid="stream-checkbox"]');
    const streamCount = await streamCheckboxes.count();
    
    if (streamCount >= 2) {
      await streamCheckboxes.nth(0).click();
      await streamCheckboxes.nth(1).click();
      
      // Assign the selected streams
      await page.click('[data-testid="assign-selected-button"]');
      await page.waitForSelector('text="Successfully assigned"');
      
      // Go to Associated Streams tab
      await page.click('[data-testid="associated-streams-tab"]');
      
      // Verify streams are visible
      await page.waitForSelector('[data-testid="associated-streams-list"]');
      const associatedStreamsBefore = page.locator('[data-testid="associated-stream-item"]');
      const initialCount = await associatedStreamsBefore.count();
      
      expect(initialCount).toBeGreaterThan(0);
      
      // Remove the first stream
      const firstRemoveButton = page.locator('[data-testid="remove-stream-button"]').first();
      await firstRemoveButton.click();
      
      // CRITICAL TEST: Verify immediate GUI state update
      // The stream should disappear from the list IMMEDIATELY after clicking remove
      await page.waitForSelector('text="Successfully removed"');
      
      // Check that the stream count decreased immediately
      const associatedStreamsAfter = page.locator('[data-testid="associated-stream-item"]');
      const finalCount = await associatedStreamsAfter.count();
      
      expect(finalCount).toBe(initialCount - 1);
      
      // Verify the stream counter in the tab badge also updated
      const tabBadge = page.locator('[data-testid="associated-streams-tab"] .MuiBadge-badge');
      const badgeText = await tabBadge.textContent();
      expect(parseInt(badgeText)).toBe(finalCount);
      
    } else {
      console.log('Not enough streams available for testing');
    }
  });

  test('should immediately update GUI when bulk assigning streams', async ({ page }) => {
    // Create a test profile first
    await page.click('[data-testid="add-profile-button"]');
    await page.fill('[data-testid="profile-name-input"]', 'Bulk Assignment Test Profile');
    
    // Add a client configuration
    await page.click('[data-testid="add-client-type-select"]');
    await page.click('li[data-value="android_mobile"]');
    
    // Save profile
    await page.click('[data-testid="save-profile-button"]');
    await page.waitForSelector('text="Profile created successfully"');
    
    // Edit the profile
    await page.click('text="Bulk Assignment Test Profile"');
    await page.waitForSelector('[data-testid="profile-edit-dialog"]');
    
    // Go to Bulk Assignment tab
    await page.click('[data-testid="bulk-assignment-tab"]');
    await page.waitForSelector('[data-testid="available-streams-list"]');
    
    // Select streams for assignment
    const streamCheckboxes = page.locator('[data-testid="stream-checkbox"]');
    const streamCount = await streamCheckboxes.count();
    
    if (streamCount >= 1) {
      // Select first stream
      await streamCheckboxes.nth(0).click();
      
      // Check that the assignment button is enabled and shows correct count
      await expect(page.locator('[data-testid="assign-selected-button"]')).toBeEnabled();
      await expect(page.locator('text="1 stream selected"')).toBeVisible();
      
      // Perform bulk assignment
      await page.click('[data-testid="assign-selected-button"]');
      await page.waitForSelector('text="Successfully assigned"');
      
      // CRITICAL TEST: Go to Associated Streams tab and verify immediate update
      await page.click('[data-testid="associated-streams-tab"]');
      
      // The assigned stream should appear IMMEDIATELY without needing to close/reopen dialog
      await page.waitForSelector('[data-testid="associated-streams-list"]');
      const associatedStreams = page.locator('[data-testid="associated-stream-item"]');
      const count = await associatedStreams.count();
      
      expect(count).toBeGreaterThan(0);
      
      // Verify the tab badge shows correct count
      const tabBadge = page.locator('[data-testid="associated-streams-tab"] .MuiBadge-badge');
      const badgeText = await tabBadge.textContent();
      expect(parseInt(badgeText)).toBe(count);
      
      // Verify that selection was cleared in bulk assignment tab
      await page.click('[data-testid="bulk-assignment-tab"]');
      await expect(page.locator('text="selected"')).not.toBeVisible();
    }
  });

  test('should maintain state consistency across tab switches without backend refresh', async ({ page }) => {
    // Create a test profile
    await page.click('[data-testid="add-profile-button"]');
    await page.fill('[data-testid="profile-name-input"]', 'Tab Consistency Test');
    
    // Add client config
    await page.click('[data-testid="add-client-type-select"]');
    await page.click('li[data-value="ios_mobile"]');
    
    await page.click('[data-testid="save-profile-button"]');
    await page.waitForSelector('text="Profile created successfully"');
    
    // Edit profile
    await page.click('text="Tab Consistency Test"');
    await page.waitForSelector('[data-testid="profile-edit-dialog"]');
    
    // Assign streams
    await page.click('[data-testid="bulk-assignment-tab"]');
    await page.waitForSelector('[data-testid="available-streams-list"]');
    
    const streamCheckboxes = page.locator('[data-testid="stream-checkbox"]');
    const streamCount = await streamCheckboxes.count();
    
    if (streamCount >= 2) {
      // Assign 2 streams
      await streamCheckboxes.nth(0).click();
      await streamCheckboxes.nth(1).click();
      await page.click('[data-testid="assign-selected-button"]');
      await page.waitForSelector('text="Successfully assigned"');
      
      // Go to Associated Streams tab
      await page.click('[data-testid="associated-streams-tab"]');
      const initialStreams = await page.locator('[data-testid="associated-stream-item"]').count();
      
      // Remove one stream
      await page.locator('[data-testid="remove-stream-button"]').first().click();
      await page.waitForSelector('text="Successfully removed"');
      
      const afterRemovalCount = await page.locator('[data-testid="associated-stream-item"]').count();
      expect(afterRemovalCount).toBe(initialStreams - 1);
      
      // Switch to Configuration tab and back
      await page.click('[data-testid="configuration-tab"]');
      await page.waitForTimeout(500); // Small delay to ensure tab switch
      await page.click('[data-testid="associated-streams-tab"]');
      
      // CRITICAL TEST: Stream count should be consistent without backend refresh
      const finalCount = await page.locator('[data-testid="associated-stream-item"]').count();
      expect(finalCount).toBe(afterRemovalCount);
      
      // Switch to Bulk Assignment tab and back
      await page.click('[data-testid="bulk-assignment-tab"]');
      await page.waitForTimeout(500);
      await page.click('[data-testid="associated-streams-tab"]');
      
      // State should still be consistent
      const veryFinalCount = await page.locator('[data-testid="associated-stream-item"]').count();
      expect(veryFinalCount).toBe(finalCount);
    }
  });

  test('should show success notifications only after actual GUI state updates', async ({ page }) => {
    // Create profile for testing
    await page.click('[data-testid="add-profile-button"]');
    await page.fill('[data-testid="profile-name-input"]', 'Notification Timing Test');
    
    await page.click('[data-testid="add-client-type-select"]');
    await page.click('li[data-value="apple_tv"]');
    
    await page.click('[data-testid="save-profile-button"]');
    await page.waitForSelector('text="Profile created successfully"');
    
    // Edit and assign streams
    await page.click('text="Notification Timing Test"');
    await page.click('[data-testid="bulk-assignment-tab"]');
    await page.waitForSelector('[data-testid="available-streams-list"]');
    
    const streamCheckboxes = page.locator('[data-testid="stream-checkbox"]');
    if (await streamCheckboxes.count() >= 1) {
      await streamCheckboxes.nth(0).click();
      
      // Monitor for both success notification and GUI state change
      const [notificationPromise, statePromise] = await Promise.all([
        page.waitForSelector('.notistack-snackbar'),
        page.click('[data-testid="assign-selected-button"]')
      ]);
      
      // Wait for assignment completion
      await page.waitForSelector('text="Successfully assigned"');
      
      // Verify GUI state changed by checking Associated Streams tab
      await page.click('[data-testid="associated-streams-tab"]');
      const streams = await page.locator('[data-testid="associated-stream-item"]').count();
      expect(streams).toBeGreaterThan(0);
      
      // Test removal with notification timing
      await page.locator('[data-testid="remove-stream-button"]').first().click();
      await page.waitForSelector('text="Successfully removed"');
      
      // Verify immediate GUI update
      const remainingStreams = await page.locator('[data-testid="associated-stream-item"]').count();
      expect(remainingStreams).toBe(streams - 1);
    }
  });
});