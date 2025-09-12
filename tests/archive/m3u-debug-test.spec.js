const { test, expect } = require('@playwright/test');

test.describe('M3U Import Debug Test', () => {
  let consoleLogs = [];
  let consoleErrors = [];
  let networkRequests = [];
  let networkResponses = [];

  test.beforeEach(async ({ page }) => {
    // Clear logs
    consoleLogs = [];
    consoleErrors = [];
    networkRequests = [];
    networkResponses = [];

    // Capture console logs and errors
    page.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      } else {
        consoleLogs.push(text);
      }
      console.log(`Console: ${text}`);
    });

    // Capture network requests
    page.on('request', request => {
      const info = `${request.method()} ${request.url()}`;
      networkRequests.push(info);
      console.log(`Request: ${info}`);
    });

    // Capture network responses
    page.on('response', response => {
      const info = `${response.status()} ${response.url()}`;
      networkResponses.push(info);
      console.log(`Response: ${info}`);
    });

    // Navigate to the application
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Navigate to Stream Manager
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
  });

  test('should debug M3U import process step by step', async ({ page }) => {
    console.log('🔍 Starting detailed M3U import debug test...');
    
    // Step 1: Open import dialog
    console.log('📝 Step 1: Opening import dialog...');
    await page.click('[data-testid="import-m3u-button"]');
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/debug-step1-dialog-open.png',
      fullPage: true 
    });
    
    // Step 2: Fill URL with very simple M3U
    console.log('📝 Step 2: Filling URL with simple test data...');
    const simpleM3U = `#EXTM3U
#EXTINF:-1,Test Channel
http://example.com/test.m3u8`;
    
    const testDataURL = `data:text/plain,${encodeURIComponent(simpleM3U)}`;
    console.log(`Using test URL: ${testDataURL.substring(0, 100)}...`);
    
    // Find input field
    const urlInput = page.locator('[data-testid="import-dialog"]')
      .locator('[data-testid="import-url-input"]')
      .locator('input');
    
    await expect(urlInput).toBeVisible();
    await urlInput.fill(testDataURL);
    
    // Verify URL was filled
    const filledValue = await urlInput.inputValue();
    console.log(`✅ URL filled. Length: ${filledValue.length} characters`);
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/debug-step2-url-filled.png',
      fullPage: true 
    });
    
    // Step 3: Click Parse Channels and monitor
    console.log('📝 Step 3: Clicking Parse Channels...');
    await page.click('[data-testid="parse-channels-button"]');
    
    // Take screenshot immediately after clicking
    await page.screenshot({ 
      path: 'test-results/debug-step3-parsing-started.png',
      fullPage: true 
    });
    
    // Monitor for status changes with detailed logging
    console.log('📝 Step 4: Monitoring parsing progress...');
    
    let statusChecks = 0;
    const maxStatusChecks = 30; // 30 seconds worth of checks
    let lastStatus = '';
    let foundChannels = false;
    
    while (statusChecks < maxStatusChecks && !foundChannels) {
      statusChecks++;
      
      // Check for channels in table
      const channelCount = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      
      // Check for any status messages
      const statusElements = await page.locator('[data-testid="import-dialog"] text=/parsing|fetching|loading|error|found/i').allTextContents();
      const currentStatus = statusElements.join(' | ');
      
      if (currentStatus !== lastStatus) {
        console.log(`Status Update ${statusChecks}: ${currentStatus}`);
        lastStatus = currentStatus;
      }
      
      if (channelCount > 0) {
        console.log(`✅ SUCCESS: Found ${channelCount} channels!`);
        foundChannels = true;
        break;
      }
      
      // Check for error messages
      const errorElements = await page.locator('text=/error|failed|invalid/i').count();
      if (errorElements > 0) {
        const errorText = await page.locator('text=/error|failed|invalid/i').allTextContents();
        console.log(`❌ Error detected: ${errorText.join(' | ')}`);
        break;
      }
      
      // Take periodic screenshots
      if (statusChecks % 5 === 0) {
        await page.screenshot({ 
          path: `test-results/debug-step4-monitoring-${statusChecks}.png`,
          fullPage: true 
        });
      }
      
      await page.waitForTimeout(1000); // Wait 1 second between checks
    }
    
    // Final status check
    await page.screenshot({ 
      path: 'test-results/debug-step4-final-status.png',
      fullPage: true 
    });
    
    if (foundChannels) {
      console.log('🎉 M3U import working correctly - legacy parser fix is functional!');
      
      // Verify channel details
      const firstChannelText = await page.locator('[data-testid="import-dialog"] table tbody tr').first().allTextContents();
      console.log(`First channel data: ${firstChannelText.join(' | ')}`);
      
      // Check import button
      const importButton = page.locator('[data-testid="import-selected-button"]');
      if (await importButton.isVisible()) {
        const buttonText = await importButton.textContent();
        console.log(`Import button text: ${buttonText}`);
      }
      
    } else {
      console.log('❌ M3U import failed - legacy parser fix may not be working');
      console.log(`Final status after ${statusChecks} checks: ${lastStatus}`);
    }
    
    // Print all captured logs
    console.log('\n📋 All Console Logs:');
    consoleLogs.forEach((log, i) => console.log(`  ${i+1}: ${log}`));
    
    if (consoleErrors.length > 0) {
      console.log('\n❌ Console Errors:');
      consoleErrors.forEach((error, i) => console.log(`  ${i+1}: ${error}`));
    }
    
    console.log('\n🌐 Network Requests:');
    networkRequests.forEach((req, i) => console.log(`  ${i+1}: ${req}`));
    
    console.log('\n🌐 Network Responses:');
    networkResponses.forEach((res, i) => console.log(`  ${i+1}: ${res}`));
    
    // Final assertion
    expect(foundChannels).toBe(true);
  });
});