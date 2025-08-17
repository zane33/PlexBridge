const { test, expect } = require('@playwright/test');

test.describe('M3U Import Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to Stream Manager using data-testid for better reliability
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
  });

  test('should display M3U import dialog', async ({ page }) => {
    // Click Import M3U button using data-testid
    await page.click('[data-testid="import-m3u-button"]');
    
    // Check if import dialog is visible using data-testid
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-dialog-title"]')).toContainText('Import Multiple Channels');
    await expect(page.locator('[data-testid="import-url-input"]')).toBeVisible();
  });

  test('should parse M3U playlist and show all channels with pagination', async ({ page }) => {
    // Click Import M3U button using data-testid
    await page.click('[data-testid="import-m3u-button"]');
    
    // Enter a test M3U URL
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"]', testM3UUrl);
    
    // Click Parse Channels using data-testid
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load in the import dialog
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 30000 });
    
    // Check if channels are displayed in the import dialog
    const channelRows = page.locator('[data-testid="import-dialog"] table tbody tr');
    const rowCount = await channelRows.count();
    expect(rowCount).toBeGreaterThan(0);
    
    // Check pagination controls are present if there are many channels
    if (rowCount >= 25) {
      await expect(page.locator('[data-testid="import-dialog"] .MuiTablePagination-actions button[aria-label="Go to next page"]')).toBeVisible();
      await expect(page.locator('[data-testid="import-dialog"] text="Rows per page"')).toBeVisible();
    }
  });

  test('should allow pagination through all imported channels', async ({ page }) => {
    // Click Import M3U button using data-testid
    await page.click('[data-testid="import-m3u-button"]');
    
    // Use a test playlist with many channels
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"]', testM3UUrl);
    
    // Click Parse Channels using data-testid
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load in import dialog
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 30000 });
    
    // Get initial channel count from import dialog
    const channelCountElement = await page.locator('[data-testid="import-dialog"] text="Found"').first();
    if (await channelCountElement.isVisible()) {
      const initialChannelText = await channelCountElement.textContent();
      const totalChannels = parseInt(initialChannelText.match(/Found (\d+) Channels/)?.[1] || '0');
      
      if (totalChannels > 25) {
        // Test pagination within import dialog
        const firstChannelName = await page.locator('[data-testid="import-dialog"] table tbody tr').first().locator('td:nth-child(3)').textContent();
        
        // Go to next page
        await page.click('[data-testid="import-dialog"] .MuiTablePagination-actions button[aria-label="Go to next page"]');
        await page.waitForLoadState('networkidle');
        
        // Check that different channels are shown
        const secondPageFirstChannel = await page.locator('[data-testid="import-dialog"] table tbody tr').first().locator('td:nth-child(3)').textContent();
        expect(secondPageFirstChannel).not.toBe(firstChannelName);
        
        // Go back to first page
        await page.click('[data-testid="import-dialog"] .MuiTablePagination-actions button[aria-label="Go to previous page"]');
        await page.waitForLoadState('networkidle');
        
        // Verify we're back to the original first channel
        const backToFirstChannel = await page.locator('[data-testid="import-dialog"] table tbody tr').first().locator('td:nth-child(3)').textContent();
        expect(backToFirstChannel).toBe(firstChannelName);
      }
    }
  });

  test('should change rows per page and display correct number of channels', async ({ page }) => {
    // Click Import M3U button using data-testid
    await page.click('[data-testid="import-m3u-button"]');
    
    // Use a test playlist
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"]', testM3UUrl);
    
    // Click Parse Channels using data-testid
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load in import dialog
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 30000 });
    
    // Get total channel count from import dialog
    const channelCountElement = await page.locator('[data-testid="import-dialog"] text="Found"').first();
    if (await channelCountElement.isVisible()) {
      const channelCountText = await channelCountElement.textContent();
      const totalChannels = parseInt(channelCountText.match(/Found (\d+) Channels/)?.[1] || '0');
      
      if (totalChannels > 50) {
        // Change rows per page to 50 in import dialog
        await page.click('[data-testid="import-dialog"] .MuiTablePagination-select');
        await page.click('li[data-value="50"]');
        
        // Check that up to 50 rows are displayed
        const displayedRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
        expect(displayedRows).toBeLessThanOrEqual(50);
        expect(displayedRows).toBeGreaterThan(25);
      }
    }
  });

  test('should select and deselect channels correctly', async ({ page }) => {
    // Click Import M3U button using data-testid
    await page.click('[data-testid="import-m3u-button"]');
    
    // Use a test playlist
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"]', testM3UUrl);
    
    // Click Parse Channels using data-testid
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load in import dialog
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 30000 });
    
    // Initially all channels should be selected in import dialog
    const headerCheckbox = page.locator('[data-testid="import-dialog"] thead input[type="checkbox"]');
    await expect(headerCheckbox).toBeChecked();
    
    // Deselect all
    await headerCheckbox.click();
    await expect(headerCheckbox).not.toBeChecked();
    
    // Select individual channels
    const firstRowCheckbox = page.locator('[data-testid="import-dialog"] tbody tr').first().locator('input[type="checkbox"]');
    await firstRowCheckbox.click();
    await expect(firstRowCheckbox).toBeChecked();
    
    // Check that import button shows correct count using data-testid
    await expect(page.locator('[data-testid="import-selected-button"]')).toContainText('Import 1 Selected');
  });

  test('should successfully import selected channels', async ({ page }) => {
    // This test might need to be adjusted based on your test environment
    test.skip(true, 'Skipping actual import to avoid creating test data');
    
    // Click Import M3U button using data-testid
    await page.click('[data-testid="import-m3u-button"]');
    
    // Use a small test playlist for import
    const testM3UUrl = 'data:text/plain,#EXTM3U\n#EXTINF:-1,Test Channel\nhttps://example.com/test.m3u8';
    await page.fill('[data-testid="import-url-input"]', testM3UUrl);
    
    // Enable auto-create channels (should be enabled by default)
    const autoCreateCheckbox = page.locator('[data-testid="import-dialog"] input[type="checkbox"]:near(text="Auto-create")');
    if (!(await autoCreateCheckbox.isChecked())) {
      await autoCreateCheckbox.check();
    }
    
    // Click Parse Channels using data-testid
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait and import
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 15000 });
    await page.click('[data-testid="import-selected-button"]');
    
    // Wait for success message
    await expect(page.locator('text="imported successfully"')).toBeVisible({ timeout: 30000 });
  });
});