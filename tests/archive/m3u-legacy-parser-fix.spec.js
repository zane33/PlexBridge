const { test, expect } = require('@playwright/test');

test.describe('M3U Legacy Parser Fix Verification', () => {
  let consoleLogs = [];
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    // Capture console logs and errors
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      } else {
        consoleLogs.push(text);
      }
    });

    // Navigate to the application
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Navigate to Stream Manager
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
  });

  test('should verify legacy parser fix with small M3U playlist', async ({ page }) => {
    console.log('🧪 Testing M3U import with small playlist to verify legacy parser fix...');
    
    // Clear console logs for this test
    consoleLogs = [];
    consoleErrors = [];
    
    // Click Import M3U button
    await page.click('[data-testid="import-m3u-button"]');
    
    // Wait for import dialog to open
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Take screenshot of the dialog
    await page.screenshot({ 
      path: 'test-results/m3u-import-dialog-opened.png',
      fullPage: true 
    });
    
    // Create a small test M3U playlist for faster testing
    const testM3UContent = `#EXTM3U
#EXTINF:-1 tvg-id="test1" tvg-name="Test Channel 1" tvg-logo="http://example.com/logo1.png" group-title="Test",Test Channel 1
http://example.com/stream1.m3u8
#EXTINF:-1 tvg-id="test2" tvg-name="Test Channel 2" tvg-logo="http://example.com/logo2.png" group-title="Test",Test Channel 2
http://example.com/stream2.m3u8
#EXTINF:-1 tvg-id="test3" tvg-name="Test Channel 3" tvg-logo="http://example.com/logo3.png" group-title="News",Test Channel 3
http://example.com/stream3.m3u8`;
    
    const testDataURL = `data:text/plain,${encodeURIComponent(testM3UContent)}`;
    
    // Find the correct input field within the Material-UI TextField
    const urlInput = page.locator('[data-testid="import-dialog"]')
      .locator('[data-testid="import-url-input"]')
      .locator('input[type="text"], input[type="url"], input:not([type]), textarea');
    
    await expect(urlInput).toBeVisible();
    await urlInput.fill(testDataURL);
    
    // Take screenshot after filling the URL
    await page.screenshot({ 
      path: 'test-results/m3u-url-filled.png',
      fullPage: true 
    });
    
    console.log('✅ URL filled successfully');
    
    // Click Parse Channels button
    await page.click('[data-testid="parse-channels-button"]');
    
    console.log('🔄 Parsing channels...');
    
    // Wait for parsing to complete - look for progress or results
    // The critical test: channels should appear after parsing completes
    try {
      // Wait for either channels to appear in the table OR an error message
      await Promise.race([
        page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 30000 }),
        page.waitForSelector('text=/error|failed|invalid/i', { timeout: 30000 })
      ]);
      
      // Take screenshot after parsing attempt
      await page.screenshot({ 
        path: 'test-results/m3u-after-parsing.png',
        fullPage: true 
      });
      
      // Check if channels appeared in the import dialog table
      const channelRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      
      if (channelRows > 0) {
        console.log(`✅ SUCCESS: ${channelRows} channels found and displayed in import dialog!`);
        console.log('✅ Legacy parser fix is working - channels appear after parsing');
        
        // Verify the channels have the expected data
        const firstChannelName = await page.locator('[data-testid="import-dialog"] table tbody tr').first().locator('td').nth(2).textContent();
        expect(firstChannelName).toContain('Test Channel');
        
        // Check if Import Selected button is enabled and shows correct count
        const importButton = page.locator('[data-testid="import-selected-button"]');
        await expect(importButton).toBeVisible();
        const buttonText = await importButton.textContent();
        expect(buttonText).toMatch(/Import \d+ Selected/);
        
        console.log(`✅ Import button shows: ${buttonText}`);
        
        // Test pagination if applicable (should not be needed for 3 channels)
        const paginationControls = page.locator('[data-testid="import-dialog"] .MuiTablePagination-root');
        if (await paginationControls.isVisible()) {
          console.log('ℹ️ Pagination controls visible for small dataset');
        }
        
      } else {
        // Check for error messages
        const errorText = await page.locator('text=/error|failed|invalid/i').textContent().catch(() => 'No error message found');
        console.log(`❌ FAILURE: No channels displayed. Error: ${errorText}`);
        console.log('❌ Legacy parser fix may not be working correctly');
        throw new Error(`No channels found after parsing. Error: ${errorText}`);
      }
      
    } catch (error) {
      await page.screenshot({ 
        path: 'test-results/m3u-parsing-error.png',
        fullPage: true 
      });
      console.log(`❌ Error during parsing: ${error.message}`);
      throw error;
    }
    
    // Print console logs for debugging
    console.log('\n📋 Console Logs:');
    consoleLogs.forEach(log => console.log(`  ${log}`));
    
    if (consoleErrors.length > 0) {
      console.log('\n❌ Console Errors:');
      consoleErrors.forEach(error => console.log(`  ${error}`));
    }
  });

  test('should verify legacy parser fix with IPTV.org playlist', async ({ page }) => {
    console.log('🧪 Testing M3U import with large IPTV.org playlist...');
    
    // Clear console logs for this test
    consoleLogs = [];
    consoleErrors = [];
    
    // Click Import M3U button
    await page.click('[data-testid="import-m3u-button"]');
    
    // Wait for import dialog to open
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Use the IPTV.org test playlist
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    
    // Find the correct input field within the Material-UI TextField
    const urlInput = page.locator('[data-testid="import-dialog"]')
      .locator('[data-testid="import-url-input"]')
      .locator('input[type="text"], input[type="url"], input:not([type]), textarea');
    
    await expect(urlInput).toBeVisible();
    await urlInput.fill(testM3UUrl);
    
    // Take screenshot after filling the URL
    await page.screenshot({ 
      path: 'test-results/m3u-large-url-filled.png',
      fullPage: true 
    });
    
    console.log('✅ Large playlist URL filled successfully');
    
    // Click Parse Channels button
    await page.click('[data-testid="parse-channels-button"]');
    
    console.log('🔄 Parsing large playlist (this may take longer)...');
    
    // Wait for parsing to complete with longer timeout for large playlist
    try {
      // Look for progress indicators or completion
      await Promise.race([
        page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 120000 }), // 2 minutes for large playlist
        page.waitForSelector('text=/error|failed|invalid/i', { timeout: 120000 }),
        page.waitForSelector('text=/Found \\d+ Channels/i', { timeout: 120000 })
      ]);
      
      // Take screenshot after parsing attempt
      await page.screenshot({ 
        path: 'test-results/m3u-large-after-parsing.png',
        fullPage: true 
      });
      
      // Check if channels appeared in the import dialog table
      const channelRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      
      if (channelRows > 0) {
        console.log(`✅ SUCCESS: ${channelRows} channels displayed in import dialog!`);
        console.log('✅ Legacy parser fix working with large playlist');
        
        // Test pagination with large dataset
        const paginationControls = page.locator('[data-testid="import-dialog"] .MuiTablePagination-root');
        if (await paginationControls.isVisible()) {
          console.log('✅ Pagination controls visible for large dataset');
          
          // Test next page functionality
          const nextButton = page.locator('[data-testid="import-dialog"] .MuiTablePagination-actions button[aria-label="Go to next page"]');
          if (await nextButton.isEnabled()) {
            const firstPageFirstChannel = await page.locator('[data-testid="import-dialog"] table tbody tr').first().locator('td').nth(2).textContent();
            
            await nextButton.click();
            await page.waitForTimeout(1000);
            
            const secondPageFirstChannel = await page.locator('[data-testid="import-dialog"] table tbody tr').first().locator('td').nth(2).textContent();
            
            if (firstPageFirstChannel !== secondPageFirstChannel) {
              console.log('✅ Pagination working correctly');
            }
            
            // Take screenshot of second page
            await page.screenshot({ 
              path: 'test-results/m3u-large-second-page.png',
              fullPage: true 
            });
          }
        }
        
        // Check channel count display
        const channelCountText = await page.locator('[data-testid="import-dialog"] text=/Found \\d+ Channels/i').textContent().catch(() => '');
        if (channelCountText) {
          console.log(`✅ Channel count display: ${channelCountText}`);
        }
        
      } else {
        // Check for error messages
        const errorText = await page.locator('text=/error|failed|invalid/i').textContent().catch(() => 'No error message found');
        console.log(`❌ FAILURE: No channels displayed from large playlist. Error: ${errorText}`);
        throw new Error(`No channels found after parsing large playlist. Error: ${errorText}`);
      }
      
    } catch (error) {
      await page.screenshot({ 
        path: 'test-results/m3u-large-parsing-error.png',
        fullPage: true 
      });
      console.log(`❌ Error during large playlist parsing: ${error.message}`);
      throw error;
    }
    
    // Print console logs for debugging
    console.log('\n📋 Console Logs:');
    consoleLogs.forEach(log => console.log(`  ${log}`));
    
    if (consoleErrors.length > 0) {
      console.log('\n❌ Console Errors:');
      consoleErrors.forEach(error => console.log(`  ${error}`));
    }
  });

  test('should verify form does not reset after parsing completion', async ({ page }) => {
    console.log('🧪 Testing form persistence after parsing...');
    
    // Click Import M3U button
    await page.click('[data-testid="import-m3u-button"]');
    
    // Wait for import dialog to open
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Create a small test playlist
    const testM3UContent = `#EXTM3U
#EXTINF:-1,Simple Test Channel
http://example.com/test.m3u8`;
    
    const testDataURL = `data:text/plain,${encodeURIComponent(testM3UContent)}`;
    
    // Fill the URL input
    const urlInput = page.locator('[data-testid="import-dialog"]')
      .locator('[data-testid="import-url-input"]')
      .locator('input[type="text"], input[type="url"], input:not([type]), textarea');
    
    await urlInput.fill(testDataURL);
    
    // Parse channels
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for parsing to complete
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 30000 });
    
    // Check that the URL field still contains the entered URL (form should not reset)
    const urlValue = await urlInput.inputValue();
    expect(urlValue).toBe(testDataURL);
    console.log('✅ Form did not reset after parsing - URL field retained value');
    
    // Check that parsed channels are still visible
    const channelRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
    expect(channelRows).toBeGreaterThan(0);
    console.log(`✅ Parsed channels still visible: ${channelRows} channels`);
    
    // Take final screenshot
    await page.screenshot({ 
      path: 'test-results/m3u-form-persistence.png',
      fullPage: true 
    });
  });
});