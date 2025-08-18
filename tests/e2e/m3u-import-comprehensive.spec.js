const { test, expect } = require('@playwright/test');

test.describe('M3U Import - Comprehensive Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to Stream Manager using data-testid for better reliability
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
  });

  test('should display M3U import dialog with correct elements', async ({ page }) => {
    // Click Import M3U button using data-testid
    await page.click('[data-testid="import-m3u-button"]');
    
    // Check if import dialog is visible using data-testid
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-title"]')).toContainText('Import Multiple Channels');
    
    // Verify all required form elements are present
    await expect(page.locator('[data-testid="import-url-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="parse-channels-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="cancel-import-button"]')).toBeVisible();
    
    // Verify auto-create channels toggle is present and enabled by default
    const autoCreateToggle = page.locator('[data-testid="import-dialog"] input[type="checkbox"]:near(text="Auto-create")');
    await expect(autoCreateToggle).toBeVisible();
    await expect(autoCreateToggle).toBeChecked();
  });

  test('should validate URL input before parsing', async ({ page }) => {
    await page.click('[data-testid="import-m3u-button"]');
    
    // Parse button should be disabled when no URL is entered
    await expect(page.locator('[data-testid="parse-channels-button"]')).toBeDisabled();
    
    // Enter URL and verify button becomes enabled
    await page.fill('[data-testid="import-url-input"]', 'https://example.com/test.m3u');
    await expect(page.locator('[data-testid="parse-channels-button"]')).toBeEnabled();
    
    // Clear URL and verify button becomes disabled again
    await page.fill('[data-testid="import-url-input"]', '');
    await expect(page.locator('[data-testid="parse-channels-button"]')).toBeDisabled();
  });

  test('should parse M3U playlist and display channels with pagination', async ({ page }) => {
    await page.click('[data-testid="import-m3u-button"]');
    
    // Wait for import dialog to open
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Enter a test M3U URL
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.locator('[data-testid="import-dialog"]')
      .locator('[data-testid="import-url-input"]')
      .fill(testM3UUrl);
    
    // Click Parse Channels using data-testid
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for parsing to start and show progress
    await page.waitForSelector('[data-testid="import-dialog"] [role="progressbar"]', { timeout: 10000 });
    
    // Wait for channels to load in the import dialog (with extended timeout for large playlists)
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 120000 });
    
    // Check if channels are displayed in the import dialog
    const channelRows = page.locator('[data-testid="import-dialog"] table tbody tr');
    const rowCount = await channelRows.count();
    expect(rowCount).toBeGreaterThan(0);
    
    // Verify pagination controls are present for large datasets
    const paginationContainer = page.locator('[data-testid="import-dialog"] .MuiTablePagination-root');
    if (await paginationContainer.isVisible()) {
      await expect(paginationContainer).toContainText('Rows per page');
      
      // Check pagination navigation buttons
      const nextPageButton = page.locator('[data-testid="import-dialog"] .MuiTablePagination-actions button[aria-label="Go to next page"]');
      const prevPageButton = page.locator('[data-testid="import-dialog"] .MuiTablePagination-actions button[aria-label="Go to previous page"]');
      
      await expect(nextPageButton).toBeVisible();
      await expect(prevPageButton).toBeVisible();
    }
    
    // Verify channel count display
    await expect(page.locator('[data-testid="import-dialog"]')).toContainText(/Found \d+ channels/i);
  });

  test('should handle Material-UI pagination correctly', async ({ page }) => {
    await page.click('[data-testid="import-m3u-button"]');
    
    // Use a test playlist with many channels
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"]', testM3UUrl);
    
    // Click Parse Channels
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load in import dialog
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 120000 });
    
    // Wait for pagination to be visible if present
    const paginationRoot = page.locator('[data-testid="import-dialog"] .MuiTablePagination-root');
    
    if (await paginationRoot.isVisible({ timeout: 5000 })) {
      // Test rows per page selector
      const rowsPerPageSelect = page.locator('[data-testid="import-dialog"] .MuiTablePagination-select');
      if (await rowsPerPageSelect.isVisible()) {
        await rowsPerPageSelect.click();
        
        // Select 50 rows per page if available
        const option50 = page.locator('li[data-value="50"]');
        if (await option50.isVisible()) {
          await option50.click();
          await page.waitForTimeout(1000); // Allow pagination to update
          
          // Verify that up to 50 rows are displayed
          const displayedRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
          expect(displayedRows).toBeLessThanOrEqual(50);
        }
      }
      
      // Test pagination navigation
      const nextPageButton = page.locator('[data-testid="import-dialog"] .MuiTablePagination-actions button[aria-label="Go to next page"]');
      
      if (await nextPageButton.isEnabled()) {
        // Get first channel name on current page
        const firstChannelName = await page.locator('[data-testid="import-dialog"] table tbody tr').first().locator('td:nth-child(3)').textContent();
        
        // Go to next page
        await nextPageButton.click();
        await page.waitForTimeout(1000);
        
        // Verify different channels are shown
        const secondPageFirstChannel = await page.locator('[data-testid="import-dialog"] table tbody tr').first().locator('td:nth-child(3)').textContent();
        expect(secondPageFirstChannel).not.toBe(firstChannelName);
        
        // Go back to first page
        const prevPageButton = page.locator('[data-testid="import-dialog"] .MuiTablePagination-actions button[aria-label="Go to previous page"]');
        await prevPageButton.click();
        await page.waitForTimeout(1000);
        
        // Verify we're back to the original first channel
        const backToFirstChannel = await page.locator('[data-testid="import-dialog"] table tbody tr').first().locator('td:nth-child(3)').textContent();
        expect(backToFirstChannel).toBe(firstChannelName);
      }
    }
  });

  test('should handle channel selection with proper checkbox interactions', async ({ page }) => {
    await page.click('[data-testid="import-m3u-button"]');
    
    // Use a small test playlist for better control
    const testM3UContent = `#EXTM3U
#EXTINF:-1,Test Channel 1
http://example.com/stream1.m3u8
#EXTINF:-1,Test Channel 2
http://example.com/stream2.m3u8`;
    const dataUrl = `data:text/plain,${encodeURIComponent(testM3UContent)}`;
    
    await page.fill('[data-testid="import-url-input"]', dataUrl);
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 30000 });
    
    // Initially all channels should be selected (for small playlists)
    const headerCheckbox = page.locator('[data-testid="import-dialog"] thead input[type="checkbox"]');
    
    // Test deselect all
    if (await headerCheckbox.isChecked()) {
      await headerCheckbox.click();
      await expect(headerCheckbox).not.toBeChecked();
    }
    
    // Test individual selection
    const firstRowCheckbox = page.locator('[data-testid="import-dialog"] tbody tr').first().locator('input[type="checkbox"]');
    await firstRowCheckbox.click();
    await expect(firstRowCheckbox).toBeChecked();
    
    // Verify import button updates count
    await expect(page.locator('[data-testid="import-selected-button"]')).toContainText('1');
    
    // Test select all
    await headerCheckbox.click();
    await expect(headerCheckbox).toBeChecked();
    
    // Verify all rows are selected
    const allRowCheckboxes = page.locator('[data-testid="import-dialog"] tbody tr input[type="checkbox"]');
    const checkboxCount = await allRowCheckboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      await expect(allRowCheckboxes.nth(i)).toBeChecked();
    }
  });

  test('should handle search and filtering functionality', async ({ page }) => {
    await page.click('[data-testid="import-m3u-button"]');
    
    // Use IPTV-org playlist for realistic filtering test
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"]', testM3UUrl);
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 120000 });
    
    // Test search functionality if search input is available
    const searchInput = page.locator('[data-testid="channel-search-input"]');
    if (await searchInput.isVisible({ timeout: 5000 })) {
      // Search for "news" channels
      await searchInput.fill('news');
      await page.waitForTimeout(1000); // Allow debounced search
      
      // Verify filtered results contain search term
      const visibleRows = page.locator('[data-testid="import-dialog"] table tbody tr:visible');
      const firstVisibleRow = await visibleRows.first().textContent();
      expect(firstVisibleRow.toLowerCase()).toContain('news');
      
      // Clear search
      await searchInput.fill('');
      await page.waitForTimeout(1000);
    }
    
    // Test group filtering if available
    const groupFilter = page.locator('[data-testid="group-filter-select"]');
    if (await groupFilter.isVisible({ timeout: 5000 })) {
      await groupFilter.click();
      
      // Select first available group
      const firstGroup = page.locator('li[role="option"]').nth(1); // Skip "All Groups" option
      if (await firstGroup.isVisible()) {
        await firstGroup.click();
        await page.waitForTimeout(1000);
        
        // Verify channels are filtered
        const rowCount = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
        expect(rowCount).toBeGreaterThan(0);
      }
    }
  });

  test('should handle import process with proper validation', async ({ page }) => {
    await page.click('[data-testid="import-m3u-button"]');
    
    // Use a small test playlist for import testing
    const testM3UContent = `#EXTM3U
#EXTINF:-1 tvg-id="test1" group-title="Test",Test Channel 1
http://example.com/stream1.m3u8`;
    const dataUrl = `data:text/plain,${encodeURIComponent(testM3UContent)}`;
    
    await page.fill('[data-testid="import-url-input"]', dataUrl);
    
    // Ensure auto-create is enabled
    const autoCreateCheckbox = page.locator('[data-testid="import-dialog"] input[type="checkbox"]:near(text="Auto-create")');
    if (!(await autoCreateCheckbox.isChecked())) {
      await autoCreateCheckbox.check();
    }
    
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 30000 });
    
    // Verify import button is enabled
    const importButton = page.locator('[data-testid="import-selected-button"]');
    await expect(importButton).toBeEnabled();
    await expect(importButton).toContainText(/Import \d+ Selected/);
    
    // Test import button disabled when no channels selected
    const headerCheckbox = page.locator('[data-testid="import-dialog"] thead input[type="checkbox"]');
    if (await headerCheckbox.isChecked()) {
      await headerCheckbox.click(); // Deselect all
      await expect(importButton).toBeDisabled();
      
      // Re-select for potential import (but skip actual import to avoid test data)
      await headerCheckbox.click();
      await expect(importButton).toBeEnabled();
    }
  });

  test('should handle large playlist performance optimizations', async ({ page }) => {
    await page.click('[data-testid="import-m3u-button"]');
    
    // Test with IPTV-org playlist which has thousands of channels
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"]', testM3UUrl);
    
    // Start parsing
    const startTime = Date.now();
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for progress indicator
    await page.waitForSelector('[data-testid="import-dialog"] [role="progressbar"]', { timeout: 10000 });
    
    // Wait for channels to load with extended timeout for large playlists
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 180000 });
    
    const loadTime = Date.now() - startTime;
    console.log(`Large playlist loaded in ${loadTime}ms`);
    
    // Verify performance warnings are shown for large datasets
    const warningAlert = page.locator('[data-testid="import-dialog"] [role="alert"]');
    if (await warningAlert.isVisible()) {
      const alertText = await warningAlert.textContent();
      expect(alertText).toMatch(/performance|large|dataset/i);
    }
    
    // Verify that not all channels are auto-selected for large playlists
    const totalChannels = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
    const selectedCount = await page.locator('[data-testid="import-selected-button"]').textContent();
    
    if (totalChannels > 1000) {
      // For large playlists, channels should not be auto-selected
      expect(selectedCount).toContain('0 Selected');
    }
  });

  test('should handle errors gracefully', async ({ page }) => {
    await page.click('[data-testid="import-m3u-button"]');
    
    // Test with invalid URL
    await page.fill('[data-testid="import-url-input"]', 'invalid-url');
    await page.click('[data-testid="parse-channels-button"]');
    
    // Should show error message
    await expect(page.locator('text=/error|failed|invalid/i')).toBeVisible({ timeout: 10000 });
    
    // Test with non-existent URL
    await page.fill('[data-testid="import-url-input"]', 'https://non-existent-domain-12345.com/playlist.m3u');
    await page.click('[data-testid="parse-channels-button"]');
    
    // Should show network error
    await expect(page.locator('text=/error|failed|network/i')).toBeVisible({ timeout: 15000 });
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
    
    // Import button should be accessible on mobile
    await page.click('[data-testid="import-m3u-button"]');
    
    // Dialog should be fullscreen on mobile
    const importDialog = page.locator('[data-testid="import-dialog"]');
    await expect(importDialog).toBeVisible();
    
    // Test form interactions on mobile
    await page.fill('[data-testid="import-url-input"]', 'https://example.com/test.m3u');
    await expect(page.locator('[data-testid="parse-channels-button"]')).toBeEnabled();
    
    // Close dialog
    await page.click('[data-testid="cancel-import-button"]');
    await expect(importDialog).not.toBeVisible();
  });

  test('should preserve dialog state during operations', async ({ page }) => {
    await page.click('[data-testid="import-m3u-button"]');
    
    // Fill form data
    await page.fill('[data-testid="import-url-input"]', 'https://example.com/test.m3u');
    
    // Verify form state is preserved when switching focus
    await page.click('body'); // Click outside
    
    const urlValue = await page.locator('[data-testid="import-url-input"]').inputValue();
    expect(urlValue).toBe('https://example.com/test.m3u');
    
    // Test that dialog doesn't close accidentally during operations
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Only cancel button should close the dialog
    await page.click('[data-testid="cancel-import-button"]');
    await expect(page.locator('[data-testid="import-dialog"]')).not.toBeVisible();
  });
});
