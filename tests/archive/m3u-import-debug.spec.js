const { test, expect } = require('@playwright/test');

test.describe('M3U Import Debug Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Enhanced console logging
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      console.log(`[BROWSER ${type.toUpperCase()}]:`, text);
    });
    
    // Capture page errors
    page.on('pageerror', error => {
      console.error('[PAGE ERROR]:', error.message);
      console.error('[STACK]:', error.stack);
    });
    
    // Capture network errors
    page.on('requestfailed', request => {
      console.error('[NETWORK ERROR]:', request.url(), request.failure().errorText);
    });
    
    // Navigate to PlexBridge
    console.log('Navigating to PlexBridge...');
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    console.log('PlexBridge loaded successfully');
  });

  test('M3U Import Complete Debug Test', async ({ page }) => {
    console.log('\n=== STARTING M3U IMPORT DEBUG TEST ===\n');
    
    // Step 1: Navigate to Stream Manager
    console.log('1. Navigating to Stream Manager...');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/debug-01-stream-manager.png' });
    console.log('✓ Stream Manager loaded');
    
    // Step 2: Open M3U Import Dialog
    console.log('2. Opening M3U Import Dialog...');
    await page.click('[data-testid="import-m3u-button"]');
    await page.waitForSelector('[data-testid="import-dialog"]', { timeout: 10000 });
    await page.screenshot({ path: 'test-results/debug-02-import-dialog.png' });
    console.log('✓ Import dialog opened');
    
    // Step 3: Enter test M3U URL
    console.log('3. Entering M3U URL...');
    const testUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"] input', testUrl);
    await page.screenshot({ path: 'test-results/debug-03-url-entered.png' });
    console.log('✓ URL entered:', testUrl);
    
    // Step 4: Click Parse Channels and monitor closely
    console.log('4. Starting M3U parsing...');
    
    // Set up monitoring for state changes
    let progressVisible = false;
    let channelsFoundInUI = false;
    let finalChannelCount = 0;
    
    // Monitor table state every second
    const monitorChannels = setInterval(async () => {
      try {
        const tableRows = await page.$$('[data-testid="import-dialog"] table tbody tr');
        const currentCount = tableRows.length;
        
        if (currentCount !== finalChannelCount) {
          finalChannelCount = currentCount;
          console.log(`⚡ Channel count changed: ${currentCount} channels in table`);
        }
        
        if (currentCount > 0 && !channelsFoundInUI) {
          channelsFoundInUI = true;
          console.log('🎉 CHANNELS APPEARED IN UI!');
        }
      } catch (error) {
        // Ignore errors during monitoring
      }
    }, 1000);
    
    // Click Parse Channels
    await page.click('[data-testid="parse-channels-button"]');
    console.log('✓ Parse button clicked');
    
    // Step 5: Monitor parsing progress with detailed logging
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max
    let parsingComplete = false;
    
    while (attempts < maxAttempts && !parsingComplete) {
      attempts++;
      
      // Check for progress bar
      const progressBar = await page.$('.MuiLinearProgress-root');
      if (progressBar && !progressVisible) {
        progressVisible = true;
        console.log('📊 Progress bar appeared - parsing started');
        await page.screenshot({ path: 'test-results/debug-04-parsing-started.png' });
      }
      
      // Check if progress disappeared (parsing complete)
      if (progressVisible && !progressBar) {
        parsingComplete = true;
        console.log('✅ Progress bar disappeared - parsing completed');
        await page.screenshot({ path: 'test-results/debug-05-parsing-complete.png' });
        break;
      }
      
      // Take periodic screenshots
      if (attempts % 20 === 0) {
        await page.screenshot({ path: `test-results/debug-progress-${attempts}s.png` });
        console.log(`⏱️  Progress check at ${attempts} seconds`);
        
        // Check for any visible messages
        try {
          const messages = await page.$$eval('.MuiAlert-message', elements => 
            elements.map(el => el.textContent)
          );
          if (messages.length > 0) {
            console.log('📢 Messages found:', messages);
          }
        } catch (e) {}
      }
      
      await page.waitForTimeout(1000);
    }
    
    // Step 6: Detailed post-parsing analysis
    console.log('\n6. POST-PARSING ANALYSIS:');
    
    // Stop monitoring
    clearInterval(monitorChannels);
    
    // Wait a bit more for UI to settle
    await page.waitForTimeout(3000);
    
    // Check final table state
    const finalTableRows = await page.$$('[data-testid="import-dialog"] table tbody tr');
    console.log(`📋 Final table rows: ${finalTableRows.length}`);
    
    // Check pagination display
    try {
      const paginationText = await page.textContent('.MuiTablePagination-displayedRows');
      console.log('📄 Pagination text:', paginationText);
    } catch (e) {
      console.log('❌ No pagination text found');
    }
    
    // Check for any error messages
    try {
      const errorMessages = await page.$$eval('.MuiAlert-standardError', elements => 
        elements.map(el => el.textContent)
      );
      if (errorMessages.length > 0) {
        console.log('🚨 Error messages:', errorMessages);
      }
    } catch (e) {}
    
    // Check React state by looking at input values or hidden fields
    try {
      const channelCountElement = await page.$('[data-testid="channel-count"]');
      if (channelCountElement) {
        const count = await channelCountElement.textContent();
        console.log('🔢 Channel count element:', count);
      }
    } catch (e) {}
    
    // Step 7: Take final screenshots
    await page.screenshot({ path: 'test-results/debug-06-final-state.png' });
    
    // Try to inspect the dialog content more deeply
    const dialogContent = await page.$('[data-testid="import-dialog"]');
    if (dialogContent) {
      await dialogContent.screenshot({ path: 'test-results/debug-07-dialog-only.png' });
    }
    
    // Check if channels exist but are hidden due to pagination/filtering
    try {
      const hiddenChannels = await page.$$('[data-testid="import-dialog"] .virtualized-table-row');
      console.log(`🔍 Hidden/virtualized channels: ${hiddenChannels.length}`);
    } catch (e) {}
    
    console.log('\n=== FINAL RESULTS ===');
    console.log(`⏱️  Total time: ${attempts} seconds`);
    console.log(`📊 Progress visible: ${progressVisible}`);
    console.log(`✅ Parsing complete: ${parsingComplete}`);
    console.log(`📋 Channels in UI: ${channelsFoundInUI}`);
    console.log(`🔢 Final channel count: ${finalChannelCount}`);
    
    // Assertions
    expect(parsingComplete).toBe(true);
    if (channelsFoundInUI) {
      expect(finalChannelCount).toBeGreaterThan(0);
      console.log('🎉 TEST PASSED: Channels appeared successfully!');
    } else {
      console.log('❌ TEST FAILED: No channels appeared in UI');
      console.log('🔍 This confirms the bug - channels are parsed but not displayed');
    }
  });

  test('Check API Response Directly', async ({ page }) => {
    console.log('\n=== TESTING API RESPONSE DIRECTLY ===\n');
    
    // Navigate to Stream Manager
    await page.click('[data-testid="nav-streams"]');
    await page.click('[data-testid="import-m3u-button"]');
    
    // Intercept API calls
    const apiResponses = [];
    
    page.on('response', response => {
      if (response.url().includes('/api/streams/parse') || 
          response.url().includes('/api/streams/import')) {
        console.log(`🌐 API Call: ${response.url()}`);
        console.log(`📊 Status: ${response.status()}`);
        apiResponses.push({
          url: response.url(),
          status: response.status(),
          timestamp: Date.now()
        });
      }
    });
    
    // Start parsing
    const testUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"]', testUrl);
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for API calls
    await page.waitForTimeout(30000);
    
    console.log('\n📡 API RESPONSES CAPTURED:');
    apiResponses.forEach((resp, i) => {
      console.log(`${i + 1}. ${resp.url} - Status: ${resp.status}`);
    });
    
    // Check if we got any successful API responses
    const successfulCalls = apiResponses.filter(r => r.status === 200);
    console.log(`✅ Successful API calls: ${successfulCalls.length}`);
    
    expect(apiResponses.length).toBeGreaterThan(0);
  });

  test('Memory and Performance Check', async ({ page }) => {
    console.log('\n=== MEMORY AND PERFORMANCE CHECK ===\n');
    
    // Monitor memory usage
    const startMemory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
    console.log(`🧠 Initial memory: ${Math.round(startMemory / 1024 / 1024)}MB`);
    
    // Navigate and start import
    await page.click('[data-testid="nav-streams"]');
    await page.click('[data-testid="import-m3u-button"]');
    
    const testUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"]', testUrl);
    
    // Monitor during parsing
    await page.click('[data-testid="parse-channels-button"]');
    
    let memoryChecks = 0;
    const memoryMonitor = setInterval(async () => {
      try {
        const currentMemory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
        const memoryMB = Math.round(currentMemory / 1024 / 1024);
        console.log(`🧠 Memory at ${memoryChecks * 10}s: ${memoryMB}MB`);
        memoryChecks++;
      } catch (e) {}
    }, 10000);
    
    await page.waitForTimeout(60000);
    clearInterval(memoryMonitor);
    
    const finalMemory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
    console.log(`🧠 Final memory: ${Math.round(finalMemory / 1024 / 1024)}MB`);
    console.log(`📈 Memory increase: ${Math.round((finalMemory - startMemory) / 1024 / 1024)}MB`);
  });
});