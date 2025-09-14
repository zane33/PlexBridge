const { test, expect } = require('@playwright/test');

/**
 * FFmpeg Profile Manager - Immediate State Update Fix Test
 * 
 * This test verifies that the React state management fix properly updates
 * the Associated Streams list immediately after remove operations.
 * 
 * Key testing scenarios:
 * 1. Remove stream operation shows immediate UI update
 * 2. Bulk assignment operation shows immediate UI update  
 * 3. No need to close/reopen dialog to see changes
 * 4. Stream count badge updates immediately
 */

test.describe('FFmpeg Profile Manager - Immediate State Updates', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to FFmpeg Profile Manager
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Click on FFmpeg Profiles navigation (note: space in test ID, not dash)
    await page.click('[data-testid="nav-ffmpeg profiles"]');
    await page.waitForLoadState('networkidle');
  });

  test('should immediately update Associated Streams list when removing streams', async ({ page }) => {
    // First, create a test profile
    await page.click('[data-testid="add-profile-button"]');
    await page.waitForSelector('[data-testid="profile-dialog"]');
    
    // Fill profile details
    await page.fill('[data-testid="profile-name-input"]', 'Test Immediate Update Profile');
    await page.fill('[data-testid="profile-description-input"]', 'Testing immediate state updates');
    
    // Add a client configuration
    await page.click('[data-testid="add-client-type-select"]');
    await page.click('li[data-value="web_browser"]');
    
    // Save the profile
    await page.click('[data-testid="save-profile-button"]');
    await page.waitForSelector('[data-testid="profile-dialog"]', { state: 'hidden' });
    
    // Find the profile and edit it
    await page.click('text="Test Immediate Update Profile"');
    await page.waitForSelector('[data-testid="profile-dialog"]');
    
    // Switch to Bulk Assignment tab
    await page.click('[data-testid="bulk-assignment-tab"]');
    await page.waitForLoadState('networkidle');
    
    // Wait for available streams to load
    await page.waitForSelector('[data-testid="available-streams-list"] .MuiListItem-root', { timeout: 10000 });
    
    // Select first 2 streams for assignment
    const streamCheckboxes = await page.locator('[data-testid="available-streams-list"] input[type="checkbox"]').all();
    if (streamCheckboxes.length >= 2) {
      await streamCheckboxes[0].check();
      await streamCheckboxes[1].check();
      
      // Assign selected streams
      await page.click('[data-testid="assign-selected-button"]');
      await page.waitForSelector('text="Successfully assigned"');
      
      // Switch to Associated Streams tab
      await page.click('[data-testid="associated-streams-tab"]');
      
      // Verify streams appear immediately in Associated Streams list
      const associatedStreamsList = page.locator('[data-testid="associated-streams-list"] .MuiListItem-root');
      await expect(associatedStreamsList).toHaveCount(2, { timeout: 2000 });
      
      // Verify stream count badge shows correct number
      const streamCountBadge = page.locator('[data-testid="profile-dialog"] .MuiBadge-badge');
      await expect(streamCountBadge).toHaveText('2');
      
      // Test immediate removal - click Remove on first stream
      const firstRemoveButton = page.locator('[data-testid="associated-streams-list"] .MuiListItem-root').first().locator('button:has-text("Remove")');
      await firstRemoveButton.click();
      
      // Wait for success notification
      await page.waitForSelector('text="Successfully removed"');
      
      // Verify stream is immediately removed from list (no dialog close/reopen needed)
      await expect(associatedStreamsList).toHaveCount(1, { timeout: 2000 });
      
      // Verify stream count badge updates immediately
      await expect(streamCountBadge).toHaveText('1');
      
      // Test removing the remaining stream
      const secondRemoveButton = page.locator('[data-testid="associated-streams-list"] .MuiListItem-root').first().locator('button:has-text("Remove")');
      await secondRemoveButton.click();
      
      // Wait for success notification
      await page.waitForSelector('text="Successfully removed"');
      
      // Verify no streams remain in the list
      await expect(associatedStreamsList).toHaveCount(0, { timeout: 2000 });
      
      // Verify stream count badge shows 0
      await expect(streamCountBadge).toHaveText('0');
      
      // Verify "No streams assigned" message appears
      await expect(page.locator('text="No streams are currently assigned to this profile"')).toBeVisible();
      
      console.log('✅ IMMEDIATE STATE UPDATE FIX VERIFIED:');
      console.log('   - Remove operations update UI immediately');
      console.log('   - Stream count badge updates immediately');
      console.log('   - No dialog close/reopen required');
      console.log('   - React state management working correctly');
    }
    
    // Close dialog
    await page.click('[data-testid="cancel-profile-button"]');
  });

  test('should immediately update when assigning streams in bulk', async ({ page }) => {
    // Navigate to an existing profile (or create one if none exist)
    const profileCards = await page.locator('.MuiCard-root').count();
    
    if (profileCards > 0) {
      // Click edit on first profile
      await page.locator('.MuiCard-root').first().locator('[data-testid="edit-profile-button"]').click();
    } else {
      // Create a new profile first
      await page.click('[data-testid="add-profile-button"]');
      await page.fill('[data-testid="profile-name-input"]', 'Test Bulk Assignment Profile');
      await page.click('[data-testid="add-client-type-select"]');
      await page.click('li[data-value="web_browser"]');
      await page.click('[data-testid="save-profile-button"]');
      await page.waitForSelector('[data-testid="profile-dialog"]', { state: 'hidden' });
      
      // Now edit the created profile
      await page.click('text="Test Bulk Assignment Profile"');
    }
    
    await page.waitForSelector('[data-testid="profile-dialog"]');
    
    // Switch to Bulk Assignment tab
    await page.click('[data-testid="bulk-assignment-tab"]');
    await page.waitForLoadState('networkidle');
    
    // Wait for available streams to load
    await page.waitForSelector('[data-testid="available-streams-list"] .MuiListItem-root', { timeout: 10000 });
    
    // Get initial stream count
    const initialStreamCountText = await page.locator('[data-testid="profile-dialog"] .MuiBadge-badge').textContent() || '0';
    const initialCount = parseInt(initialStreamCountText);
    
    // Select 3 streams for bulk assignment
    const streamCheckboxes = await page.locator('[data-testid="available-streams-list"] input[type="checkbox"]').all();
    const streamsToSelect = Math.min(3, streamCheckboxes.length);
    
    if (streamsToSelect > 0) {
      for (let i = 0; i < streamsToSelect; i++) {
        await streamCheckboxes[i].check();
      }
      
      // Verify selection count shows
      await expect(page.locator(`text="${streamsToSelect} stream${streamsToSelect !== 1 ? 's' : ''} selected"`)).toBeVisible();
      
      // Click assign selected
      await page.click('[data-testid="assign-selected-button"]');
      
      // Wait for success notification
      await page.waitForSelector('text="Successfully assigned"');
      
      // Switch to Associated Streams tab to verify immediate update
      await page.click('[data-testid="associated-streams-tab"]');
      
      // Verify stream count updated immediately
      const expectedCount = initialCount + streamsToSelect;
      const streamCountBadge = page.locator('[data-testid="profile-dialog"] .MuiBadge-badge');
      await expect(streamCountBadge).toHaveText(expectedCount.toString());
      
      // Verify streams appear in Associated Streams list
      const associatedStreamsList = page.locator('[data-testid="associated-streams-list"] .MuiListItem-root');
      await expect(associatedStreamsList).toHaveCount(expectedCount);
      
      console.log('✅ BULK ASSIGNMENT IMMEDIATE UPDATE VERIFIED:');
      console.log(`   - Added ${streamsToSelect} streams via bulk assignment`);
      console.log(`   - Stream count updated from ${initialCount} to ${expectedCount}`);
      console.log('   - Associated Streams list updated immediately');
      console.log('   - No dialog refresh required');
    }
    
    // Close dialog
    await page.click('[data-testid="cancel-profile-button"]');
  });

  test('should maintain state consistency across tab switches', async ({ page }) => {
    // Create or edit a profile with streams
    const profileCards = await page.locator('.MuiCard-root').count();
    
    if (profileCards > 0) {
      await page.locator('.MuiCard-root').first().locator('[data-testid="edit-profile-button"]').click();
    } else {
      // Create new profile
      await page.click('[data-testid="add-profile-button"]');
      await page.fill('[data-testid="profile-name-input"]', 'Test State Consistency Profile');
      await page.click('[data-testid="add-client-type-select"]');
      await page.click('li[data-value="web_browser"]');
      await page.click('[data-testid="save-profile-button"]');
      await page.waitForSelector('[data-testid="profile-dialog"]', { state: 'hidden' });
      await page.click('text="Test State Consistency Profile"');
    }
    
    await page.waitForSelector('[data-testid="profile-dialog"]');
    
    // Add some streams via bulk assignment
    await page.click('[data-testid="bulk-assignment-tab"]');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="available-streams-list"] .MuiListItem-root', { timeout: 10000 });
    
    const streamCheckboxes = await page.locator('[data-testid="available-streams-list"] input[type="checkbox"]').all();
    if (streamCheckboxes.length >= 2) {
      await streamCheckboxes[0].check();
      await streamCheckboxes[1].check();
      await page.click('[data-testid="assign-selected-button"]');
      await page.waitForSelector('text="Successfully assigned"');
      
      // Switch to Associated Streams tab
      await page.click('[data-testid="associated-streams-tab"]');
      
      // Verify 2 streams are present
      const associatedStreamsList = page.locator('[data-testid="associated-streams-list"] .MuiListItem-root');
      await expect(associatedStreamsList).toHaveCount(2);
      
      // Remove one stream
      const removeButton = associatedStreamsList.first().locator('button:has-text("Remove")');
      await removeButton.click();
      await page.waitForSelector('text="Successfully removed"');
      
      // Verify count is now 1
      await expect(associatedStreamsList).toHaveCount(1);
      
      // Switch to Configuration tab and back
      await page.click('[data-testid="configuration-tab"]');
      await page.click('[data-testid="associated-streams-tab"]');
      
      // Verify count is still 1 (state maintained across tab switches)
      await expect(associatedStreamsList).toHaveCount(1);
      
      // Switch to Bulk Assignment tab and back
      await page.click('[data-testid="bulk-assignment-tab"]');
      await page.click('[data-testid="associated-streams-tab"]');
      
      // Verify count is still 1 (state maintained)
      await expect(associatedStreamsList).toHaveCount(1);
      
      console.log('✅ STATE CONSISTENCY VERIFIED:');
      console.log('   - State maintained across tab switches');
      console.log('   - Stream count remains accurate');
      console.log('   - No state loss during navigation');
    }
    
    // Close dialog
    await page.click('[data-testid="cancel-profile-button"]');
  });

});