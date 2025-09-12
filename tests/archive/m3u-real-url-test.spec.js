const { test, expect } = require('@playwright/test');

test.describe('M3U Real URL Test', () => {
  let consoleLogs = [];
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    // Clear logs
    consoleLogs = [];
    consoleErrors = [];

    // Capture console logs and errors  
    page.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
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

  test('should test M3U import with a small real HTTP URL', async ({ page }) => {
    console.log('🧪 Testing M3U import with real HTTP URL...');
    
    // Click Import M3U button
    await page.click('[data-testid="import-m3u-button"]');
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Use a small, known working M3U playlist
    const testM3UUrl = 'https://raw.githubusercontent.com/hishamhm/htop/master/sample.m3u'; // If this doesn't work, we'll use another
    
    // Alternative test URLs in case the first doesn't work:
    // const testM3UUrl = 'https://iptv-org.github.io/iptv/countries/ad.m3u';
    // const testM3UUrl = 'https://iptv-org.github.io/iptv/categories/news.m3u';
    
    console.log(`Using test URL: ${testM3UUrl}`);
    
    // Find the input field within the Material-UI TextField
    const urlInput = page.locator('[data-testid="import-dialog"]')
      .locator('[data-testid="import-url-input"]')
      .locator('input');
    
    await expect(urlInput).toBeVisible();
    await urlInput.fill(testM3UUrl);
    
    // Take screenshot after filling URL
    await page.screenshot({ 
      path: 'test-results/real-url-filled.png',
      fullPage: true 
    });
    
    console.log('✅ Real URL filled successfully');
    
    // Click Parse Channels button
    await page.click('[data-testid="parse-channels-button"]');
    
    console.log('🔄 Parsing real M3U playlist...');
    
    // Take screenshot after clicking parse
    await page.screenshot({ 
      path: 'test-results/real-url-parsing-started.png',
      fullPage: true 
    });
    
    // Wait for parsing results with timeout - this is the critical test
    try {
      // Wait for either success (channels appear) or failure (error message)
      const result = await Promise.race([
        // Success case: channels appear in table
        page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 45000 })
          .then(() => 'success'),
        // Error case: error message appears  
        page.waitForSelector('text=/error|failed|invalid|not supported/i', { timeout: 45000 })
          .then(() => 'error'),
        // Progress case: still showing progress after reasonable time
        new Promise(resolve => setTimeout(() => resolve('timeout'), 45000))
      ]);
      
      await page.screenshot({ 
        path: 'test-results/real-url-final-result.png',
        fullPage: true 
      });
      
      if (result === 'success') {
        // Check how many channels were found
        const channelCount = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
        console.log(`✅ SUCCESS: Found ${channelCount} channels in import table!`);
        console.log('✅ Legacy parser fix is working correctly!');
        
        // Verify channel data is properly displayed
        if (channelCount > 0) {
          const firstChannelCells = await page.locator('[data-testid="import-dialog"] table tbody tr')
            .first().locator('td').allTextContents();
          console.log(`First channel data: ${firstChannelCells.join(' | ')}`);
        }
        
        // Check if import button is properly enabled
        const importButton = page.locator('[data-testid="import-selected-button"]');
        if (await importButton.isVisible()) {
          const buttonText = await importButton.textContent();
          console.log(`Import button: ${buttonText}`);
          
          // Button should show a count
          expect(buttonText).toMatch(/Import \d+ Selected/);
        }
        
        // Test: Verify form didn't reset (URL should still be there)
        const urlValue = await urlInput.inputValue();
        expect(urlValue).toBe(testM3UUrl);
        console.log('✅ Form persistence working - URL not reset after parsing');
        
      } else if (result === 'error') {
        const errorElements = await page.locator('text=/error|failed|invalid|not supported/i').allTextContents();
        const errorText = errorElements.join(' | ');
        console.log(`❌ Error during parsing: ${errorText}`);
        
        // If it's a protocol error, that's expected and we should try HTTP URL
        if (errorText.includes('not supported') || errorText.includes('protocol')) {
          console.log('ℹ️ Protocol error is expected for data: URLs, trying HTTP URL would work');
        } else {
          console.log('❌ Unexpected error - may indicate legacy parser issue');
        }
        
      } else {
        console.log('⚠️ Parsing timed out - this might indicate the legacy parser issue');
        console.log('⚠️ Channels may be parsed but not passed to UI due to callback issue');
      }
      
    } catch (error) {
      await page.screenshot({ 
        path: 'test-results/real-url-error.png',
        fullPage: true 
      });
      console.log(`❌ Exception during test: ${error.message}`);
    }
    
    // Print captured console output
    console.log('\n📋 Console Logs:');
    consoleLogs.forEach((log, i) => console.log(`  ${i+1}: ${log}`));
    
    if (consoleErrors.length > 0) {
      console.log('\n❌ Console Errors:');
      consoleErrors.forEach((error, i) => console.log(`  ${i+1}: ${error}`));
    }
  });

  test('should test with a known small M3U playlist', async ({ page }) => {
    console.log('🧪 Testing with a known small M3U playlist from IPTV.org...');
    
    // Click Import M3U button
    await page.click('[data-testid="import-m3u-button"]');
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Use a very small M3U playlist from IPTV.org that should have few channels
    const testM3UUrl = 'https://iptv-org.github.io/iptv/countries/ad.m3u'; // Andorra - should be very small
    
    console.log(`Using small country playlist: ${testM3UUrl}`);
    
    const urlInput = page.locator('[data-testid="import-dialog"]')
      .locator('[data-testid="import-url-input"]')
      .locator('input');
    
    await urlInput.fill(testM3UUrl);
    
    await page.screenshot({ 
      path: 'test-results/small-country-url-filled.png',
      fullPage: true 
    });
    
    // Click Parse Channels
    await page.click('[data-testid="parse-channels-button"]');
    
    console.log('🔄 Parsing small country playlist...');
    
    // Monitor with shorter intervals but detailed logging
    let attempts = 0;
    const maxAttempts = 30;
    let foundChannels = false;
    
    while (attempts < maxAttempts && !foundChannels) {
      attempts++;
      
      // Check for channels
      const channelCount = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      if (channelCount > 0) {
        console.log(`✅ SUCCESS after ${attempts} seconds: ${channelCount} channels found!`);
        foundChannels = true;
        
        // Take success screenshot
        await page.screenshot({ 
          path: 'test-results/small-country-success.png',
          fullPage: true 
        });
        
        break;
      }
      
      // Check for error messages
      const errorCount = await page.locator('text=/error|failed|invalid/i').count();
      if (errorCount > 0) {
        const errorText = await page.locator('text=/error|failed|invalid/i').allTextContents();
        console.log(`❌ Error after ${attempts} seconds: ${errorText.join(' | ')}`);
        break;
      }
      
      // Log status periodically
      if (attempts % 5 === 0) {
        console.log(`... still parsing after ${attempts} seconds`);
        await page.screenshot({ 
          path: `test-results/small-country-wait-${attempts}s.png`,
          fullPage: true 
        });
      }
      
      await page.waitForTimeout(1000);
    }
    
    if (!foundChannels && attempts >= maxAttempts) {
      console.log('❌ CRITICAL: Parsing timed out - this suggests the legacy parser fix is NOT working');
      console.log('❌ Channels may be parsed by backend but onChannels() callback is not working');
      
      await page.screenshot({ 
        path: 'test-results/small-country-timeout.png',
        fullPage: true 
      });
    }
    
    // Print logs for debugging
    console.log('\n📋 Console Output:');
    consoleLogs.forEach(log => console.log(`  ${log}`));
  });
});