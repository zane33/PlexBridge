const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('M3U Import Investigation - Channel Disappearing Issue', () => {
  let consoleLogs = [];
  let consoleErrors = [];
  let screenshotCount = 0;

  test.beforeEach(async ({ page }) => {
    // Clear logs for each test
    consoleLogs = [];
    consoleErrors = [];
    screenshotCount = 0;

    // Capture all console messages
    page.on('console', (msg) => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      };
      
      consoleLogs.push(logEntry);
      
      if (msg.type() === 'error') {
        consoleErrors.push(logEntry);
      }
      
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    // Capture JavaScript errors
    page.on('pageerror', (error) => {
      const errorEntry = {
        timestamp: new Date().toISOString(),
        type: 'pageerror',
        message: error.message,
        stack: error.stack
      };
      
      consoleErrors.push(errorEntry);
      console.log(`[PAGE ERROR] ${error.message}`);
    });

    // Capture failed requests
    page.on('requestfailed', (request) => {
      console.log(`[REQUEST FAILED] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Set longer timeout for this investigation
    test.setTimeout(120000); // 2 minutes
  });

  async function takeScreenshot(page, description) {
    screenshotCount++;
    const filename = `screenshot-${screenshotCount.toString().padStart(2, '0')}-${description.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
    const screenshotPath = path.join('./test-results', filename);
    
    await page.screenshot({ 
      path: screenshotPath, 
      fullPage: true 
    });
    
    console.log(`📸 Screenshot taken: ${filename} - ${description}`);
    return screenshotPath;
  }

  async function waitForNetworkIdle(page, timeout = 10000) {
    console.log('🌐 Waiting for network to be idle...');
    await page.waitForLoadState('networkidle', { timeout });
  }

  test('M3U Import Complete Investigation - Channel Lifecycle Tracking', async ({ page }) => {
    console.log('🔍 Starting M3U Import Investigation Test');
    console.log('📋 Test M3U URL: https://iptv-org.github.io/iptv/index.m3u');
    
    // Step 1: Navigate to PlexBridge
    console.log('\n📍 Step 1: Navigating to PlexBridge homepage');
    await page.goto('/');
    await waitForNetworkIdle(page);
    await takeScreenshot(page, 'homepage-loaded');
    
    // Verify homepage loads correctly (handle both mobile and desktop)
    await expect(page.locator('[data-testid="nav-dashboard"]').first()).toBeVisible({ timeout: 10000 });
    console.log('✅ Homepage loaded successfully');

    // Step 2: Navigate to Stream Manager
    console.log('\n📍 Step 2: Opening Stream Manager');
    await page.locator('[data-testid="nav-streams"]').first().click();
    await waitForNetworkIdle(page);
    await takeScreenshot(page, 'stream-manager-opened');
    
    // Verify Stream Manager loads
    await expect(page.locator('[data-testid="import-m3u-button"]')).toBeVisible({ timeout: 10000 });
    console.log('✅ Stream Manager opened successfully');

    // Step 3: Open M3U Import Dialog
    console.log('\n📍 Step 3: Opening M3U Import Dialog');
    await page.click('[data-testid="import-m3u-button"]');
    
    // Wait for dialog to appear
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible({ timeout: 10000 });
    await takeScreenshot(page, 'import-dialog-opened');
    console.log('✅ M3U Import Dialog opened');

    // Step 4: Enter M3U URL
    console.log('\n📍 Step 4: Entering M3U URL');
    const testM3uUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    
    const urlInput = page.locator('[data-testid="import-dialog"] [data-testid="import-url-input"] input');
    await expect(urlInput).toBeVisible({ timeout: 5000 });
    
    await urlInput.clear();
    await urlInput.fill(testM3uUrl);
    await takeScreenshot(page, 'url-entered');
    console.log(`✅ M3U URL entered: ${testM3uUrl}`);

    // Step 5: Start Parsing Process
    console.log('\n📍 Step 5: Starting M3U parsing process');
    const parseButton = page.locator('[data-testid="parse-channels-button"]');
    await expect(parseButton).toBeVisible();
    await expect(parseButton).toBeEnabled();
    
    // Take screenshot before parsing
    await takeScreenshot(page, 'before-parsing-starts');
    
    // Click parse and immediately start monitoring
    console.log('🚀 Clicking Parse Channels button...');
    await parseButton.click();
    
    // Step 6: Monitor Parsing Progress
    console.log('\n📍 Step 6: Monitoring parsing progress');
    
    // Wait for progress indicator to appear
    try {
      await expect(page.locator('.MuiLinearProgress-root')).toBeVisible({ timeout: 5000 });
      await takeScreenshot(page, 'parsing-progress-visible');
      console.log('📊 Progress bar appeared');
    } catch (error) {
      console.log('⚠️ Progress bar not found, continuing...');
    }

    // Monitor for up to 60 seconds
    const maxWaitTime = 60000;
    const checkInterval = 2000;
    let elapsedTime = 0;
    let channelsFound = false;
    let progressComplete = false;

    console.log('⏱️ Monitoring parsing progress (max 60 seconds)...');
    
    while (elapsedTime < maxWaitTime && !channelsFound) {
      await page.waitForTimeout(checkInterval);
      elapsedTime += checkInterval;
      
      // Check for channels in the table
      const channelRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      
      // Check if progress is complete
      const progressBars = await page.locator('.MuiLinearProgress-root').count();
      progressComplete = progressBars === 0;
      
      console.log(`⏱️ ${elapsedTime/1000}s: Found ${channelRows} channel rows, Progress complete: ${progressComplete}`);
      
      if (channelRows > 0) {
        channelsFound = true;
        await takeScreenshot(page, `channels-found-${channelRows}-rows`);
        console.log(`🎉 Channels found! ${channelRows} channels in table`);
        break;
      }
      
      // Take periodic screenshots
      if (elapsedTime % 10000 === 0) { // Every 10 seconds
        await takeScreenshot(page, `parsing-progress-${elapsedTime/1000}s`);
      }
    }

    // Step 7: Final State Analysis
    console.log('\n📍 Step 7: Final state analysis');
    
    // Take final screenshot
    await takeScreenshot(page, 'final-state-after-parsing');
    
    // Check final channel count
    const finalChannelCount = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
    console.log(`📊 Final channel count: ${finalChannelCount}`);
    
    // Check if any error messages are visible
    const errorMessages = await page.locator('.MuiAlert-root[severity="error"]').count();
    if (errorMessages > 0) {
      console.log(`⚠️ Found ${errorMessages} error message(s)`);
      await takeScreenshot(page, 'error-messages-visible');
    }
    
    // Check table pagination info
    try {
      const paginationInfo = await page.locator('.MuiTablePagination-displayedRows').textContent();
      console.log(`📄 Pagination info: ${paginationInfo}`);
    } catch (error) {
      console.log('📄 No pagination info found');
    }

    // Step 8: Test Pagination (if channels exist)
    if (finalChannelCount > 0) {
      console.log('\n📍 Step 8: Testing pagination controls');
      
      // Check rows per page selector
      try {
        const rowsPerPageSelect = page.locator('[data-testid="import-dialog"] .MuiTablePagination-select');
        if (await rowsPerPageSelect.isVisible()) {
          await rowsPerPageSelect.click();
          await takeScreenshot(page, 'rows-per-page-dropdown');
          
          // Try selecting 50 rows per page
          const option50 = page.locator('li[data-value="50"]');
          if (await option50.isVisible()) {
            await option50.click();
            await page.waitForTimeout(1000);
            await takeScreenshot(page, 'pagination-50-rows-selected');
            
            const newChannelCount = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
            console.log(`📊 After selecting 50 rows per page: ${newChannelCount} channels visible`);
          }
        }
      } catch (error) {
        console.log('⚠️ Pagination controls not accessible:', error.message);
      }
      
      // Test next page button
      try {
        const nextPageButton = page.locator('[data-testid="import-dialog"] .MuiTablePagination-actions button[aria-label="Go to next page"]');
        if (await nextPageButton.isEnabled()) {
          await nextPageButton.click();
          await page.waitForTimeout(1000);
          await takeScreenshot(page, 'next-page-clicked');
          
          const nextPageChannelCount = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
          console.log(`📊 After clicking next page: ${nextPageChannelCount} channels visible`);
        }
      } catch (error) {
        console.log('⚠️ Next page button not accessible:', error.message);
      }
    }

    // Step 9: Log Summary
    console.log('\n📋 TEST SUMMARY:');
    console.log('================');
    console.log(`🔢 Total console logs captured: ${consoleLogs.length}`);
    console.log(`❌ Total errors captured: ${consoleErrors.length}`);
    console.log(`📸 Screenshots taken: ${screenshotCount}`);
    console.log(`📊 Final channel count: ${finalChannelCount}`);
    console.log(`⏱️ Total test time: ${elapsedTime/1000} seconds`);
    
    // Log all console errors
    if (consoleErrors.length > 0) {
      console.log('\n❌ CONSOLE ERRORS:');
      consoleErrors.forEach((error, index) => {
        console.log(`${index + 1}. [${error.timestamp}] ${error.type}: ${error.message}`);
        if (error.stack) {
          console.log(`   Stack: ${error.stack.split('\n')[0]}`);
        }
      });
    }
    
    // Log key console messages
    console.log('\n📝 KEY CONSOLE MESSAGES:');
    const keyMessages = consoleLogs.filter(log => 
      log.text.includes('M3U') || 
      log.text.includes('parse') || 
      log.text.includes('channel') ||
      log.text.includes('error') ||
      log.text.includes('fail')
    );
    
    keyMessages.slice(-10).forEach((log, index) => {
      console.log(`${index + 1}. [${log.type}] ${log.text}`);
    });
    
    // Final assertions
    if (finalChannelCount === 0) {
      console.log('\n🔍 ISSUE CONFIRMED: Channels disappeared after parsing!');
      console.log('📋 Recommendations:');
      console.log('   1. Check console errors for JavaScript issues');
      console.log('   2. Verify M3U parsing service responses');
      console.log('   3. Check React state management in StreamManager');
      console.log('   4. Verify table rendering logic');
    } else {
      console.log('\n✅ SUCCESS: Channels remained visible after parsing');
    }

    // Don't fail the test - we want to capture the behavior
    console.log('\n✅ Investigation test completed successfully');
  });

  test.afterEach(async ({ page }) => {
    // Save console logs to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join('./test-results', `console-logs-${timestamp}.json`);
    
    const logData = {
      timestamp,
      totalLogs: consoleLogs.length,
      totalErrors: consoleErrors.length,
      logs: consoleLogs,
      errors: consoleErrors
    };
    
    // Ensure test-results directory exists
    const testResultsDir = './test-results';
    if (!fs.existsSync(testResultsDir)) {
      fs.mkdirSync(testResultsDir, { recursive: true });
    }
    
    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
    console.log(`💾 Console logs saved to: ${logFile}`);
  });
});