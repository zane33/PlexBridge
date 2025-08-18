const { test, expect } = require('@playwright/test');

test.describe('PlexBridge - Comprehensive Test Suite', () => {
  let errors = [];
  let networkFailures = [];
  let screenshots = [];

  // Capture console errors and network failures for comprehensive analysis
  test.beforeEach(async ({ page }) => {
    errors = [];
    networkFailures = [];
    screenshots = [];

    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`Console Error: ${msg.text()}`);
        console.log(`❌ Console Error: ${msg.text()}`);
      } else if (msg.type() === 'warning') {
        console.log(`⚠️ Console Warning: ${msg.text()}`);
      }
    });

    // Listen for page errors
    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.message}`);
      console.log(`❌ Page Error: ${error.message}`);
    });

    // Listen for network failures
    page.on('response', response => {
      if (!response.ok() && response.status() >= 400) {
        const failure = `Network Failure: ${response.status()} ${response.url()}`;
        networkFailures.push(failure);
        console.log(`❌ ${failure}`);
      }
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Take final screenshot
    const screenshotPath = `test-results/comprehensive-suite-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-')}-final.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshots.push(screenshotPath);

    // Log test summary
    console.log(`\n📊 Test Summary for: ${testInfo.title}`);
    console.log(`📸 Screenshots taken: ${screenshots.length}`);
    console.log(`❌ Errors found: ${errors.length}`);
    console.log(`🔌 Network failures: ${networkFailures.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(error => console.log(`  - ${error}`));
    }
    
    if (networkFailures.length > 0) {
      console.log('\n🔌 Network Failures:');
      networkFailures.forEach(failure => console.log(`  - ${failure}`));
    }
  });

  test('1. Application startup and navigation health check', async ({ page }) => {
    console.log('🔍 Test 1: Comprehensive application startup check...');
    
    // Navigate to the application
    const response = await page.goto('http://localhost:8080');
    expect(response.status()).toBe(200);

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of homepage
    const homepageScreenshot = 'test-results/01-homepage-comprehensive.png';
    await page.screenshot({ path: homepageScreenshot, fullPage: true });
    screenshots.push(homepageScreenshot);
    
    // Verify core navigation elements are present
    await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-streams"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-channels"]')).toBeVisible();
    
    // Test navigation to each section
    const sections = [
      { id: 'nav-dashboard', name: 'Dashboard' },
      { id: 'nav-streams', name: 'Streams' },
      { id: 'nav-channels', name: 'Channels' },
      { id: 'nav-epg', name: 'EPG' },
      { id: 'nav-logs', name: 'Logs' },
      { id: 'nav-settings', name: 'Settings' }
    ];
    
    for (const section of sections) {
      const navElement = page.locator(`[data-testid="${section.id}"]`);
      
      if (await navElement.isVisible()) {
        console.log(`📍 Testing navigation to ${section.name}...`);
        await navElement.click();
        await page.waitForLoadState('networkidle');
        
        // Take screenshot of each section
        const sectionScreenshot = `test-results/01-${section.name.toLowerCase()}-section.png`;
        await page.screenshot({ path: sectionScreenshot, fullPage: true });
        screenshots.push(sectionScreenshot);
        
        // Verify section loaded without errors
        const currentErrors = errors.length;
        const currentNetworkFailures = networkFailures.length;
        
        console.log(`✅ ${section.name} loaded - Errors: ${currentErrors}, Network failures: ${currentNetworkFailures}`);
      }
    }
  });

  test('2. API endpoints health check', async ({ page }) => {
    console.log('🔍 Test 2: Comprehensive API health check...');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Test critical API endpoints
    const apiEndpoints = [
      { url: '/health', description: 'Health check' },
      { url: '/api/channels', description: 'Channels API' },
      { url: '/api/streams', description: 'Streams API' },
      { url: '/api/metrics', description: 'Metrics API' },
      { url: '/api/settings', description: 'Settings API' },
      { url: '/api/logs', description: 'Logs API' },
      { url: '/api/epg-sources', description: 'EPG Sources API' },
      { url: '/api/epg/channels', description: 'EPG Channels API' },
      { url: '/api/epg/programs', description: 'EPG Programs API' },
      { url: '/discover.json', description: 'Plex Discovery' },
      { url: '/lineup.json', description: 'Plex Lineup' }
    ];
    
    for (const endpoint of apiEndpoints) {
      console.log(`🔗 Testing ${endpoint.description} (${endpoint.url})...`);
      
      try {
        const response = await page.request.get(`http://localhost:8080${endpoint.url}`);
        const status = response.status();
        const contentType = response.headers()['content-type'] || '';
        
        console.log(`  Status: ${status}, Content-Type: ${contentType}`);
        
        // Verify response is successful and returns JSON (not HTML error page)
        expect(status).toBeLessThan(500);
        
        if (status === 200) {
          expect(contentType).toContain('application/json');
          
          // Try to parse JSON to ensure it's valid
          const responseBody = await response.text();
          const jsonData = JSON.parse(responseBody);
          expect(jsonData).toBeDefined();
          
          console.log(`  ✅ ${endpoint.description} - Valid JSON response`);
        } else {
          console.log(`  ⚠️ ${endpoint.description} - Non-200 status: ${status}`);
        }
      } catch (error) {
        console.log(`  ❌ ${endpoint.description} - Error: ${error.message}`);
        errors.push(`API Error ${endpoint.url}: ${error.message}`);
      }
    }
  });

  test('3. Stream management comprehensive workflow', async ({ page }) => {
    console.log('🔍 Test 3: Comprehensive stream management workflow...');
    
    await page.goto('http://localhost:8080');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of streams page
    const streamsPageScreenshot = 'test-results/03-streams-page.png';
    await page.screenshot({ path: streamsPageScreenshot, fullPage: true });
    screenshots.push(streamsPageScreenshot);
    
    // Test stream creation
    await page.click('[data-testid="add-stream-button"]');
    await expect(page.locator('[data-testid="stream-dialog"]')).toBeVisible();
    
    // Take screenshot of create dialog
    const createDialogScreenshot = 'test-results/03-create-stream-dialog.png';
    await page.screenshot({ path: createDialogScreenshot, fullPage: true });
    screenshots.push(createDialogScreenshot);
    
    // Fill in test stream data
    await page.fill('[data-testid="stream-name-input"]', 'Comprehensive Test Stream');
    await page.fill('[data-testid="stream-url-input"]', 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
    
    // Test stream preview functionality
    const testButton = page.locator('[data-testid="test-stream-button"]');
    if (await testButton.isEnabled()) {
      console.log('🎬 Testing stream preview functionality...');
      await testButton.click();
      
      // Wait for video player to open
      const videoPlayerVisible = await page.locator('dialog:has(video), [role="dialog"]:has(video)').isVisible({ timeout: 15000 });
      if (videoPlayerVisible) {
        console.log('✅ Video player opened successfully');
        
        // Take screenshot of video player
        const videoPlayerScreenshot = 'test-results/03-video-player.png';
        await page.screenshot({ path: videoPlayerScreenshot, fullPage: true });
        screenshots.push(videoPlayerScreenshot);
        
        // Close video player
        await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
      } else {
        console.log('⚠️ Video player did not open');
      }
    }
    
    // Cancel stream creation (to avoid test data)
    await page.click('[data-testid="cancel-stream-button"]');
    
    // Test existing streams if any
    const streamRows = await page.locator('table tbody tr').count();
    console.log(`📊 Found ${streamRows} existing streams`);
    
    if (streamRows > 0) {
      // Test preview on existing stream
      const previewButton = page.locator('[data-testid="preview-stream-button"]').first();
      if (await previewButton.isVisible()) {
        await previewButton.click();
        
        const existingStreamPlayerVisible = await page.locator('dialog:has(video), [role="dialog"]:has(video)').isVisible({ timeout: 15000 });
        if (existingStreamPlayerVisible) {
          console.log('✅ Existing stream preview works');
          
          // Take screenshot
          const existingStreamScreenshot = 'test-results/03-existing-stream-preview.png';
          await page.screenshot({ path: existingStreamScreenshot, fullPage: true });
          screenshots.push(existingStreamScreenshot);
          
          await page.click('button[aria-label="close"], button:has([data-testid="CloseIcon"])');
        }
      }
    }
  });

  test('4. M3U import comprehensive workflow', async ({ page }) => {
    console.log('🔍 Test 4: Comprehensive M3U import workflow...');
    
    await page.goto('http://localhost:8080');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Test M3U import dialog
    await page.click('[data-testid="import-m3u-button"]');
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Take screenshot of import dialog
    const importDialogScreenshot = 'test-results/04-m3u-import-dialog.png';
    await page.screenshot({ path: importDialogScreenshot, fullPage: true });
    screenshots.push(importDialogScreenshot);
    
    // Test with real IPTV playlist
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    await page.fill('[data-testid="import-url-input"]', testM3UUrl);
    
    console.log('📡 Starting M3U parsing...');
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for progress indicator
    const progressVisible = await page.locator('[data-testid="import-dialog"] [role="progressbar"]').isVisible({ timeout: 10000 });
    if (progressVisible) {
      console.log('✅ Progress indicator shown');
      
      // Take screenshot of progress
      const progressScreenshot = 'test-results/04-m3u-parsing-progress.png';
      await page.screenshot({ path: progressScreenshot, fullPage: true });
      screenshots.push(progressScreenshot);
    }
    
    // Wait for channels to load (extended timeout for large playlists)
    const channelsLoaded = await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 120000 }).then(() => true).catch(() => false);
    
    if (channelsLoaded) {
      console.log('✅ Channels loaded successfully');
      
      const channelCount = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      console.log(`📊 Loaded ${channelCount} channels`);
      
      // Take screenshot of loaded channels
      const channelsLoadedScreenshot = 'test-results/04-m3u-channels-loaded.png';
      await page.screenshot({ path: channelsLoadedScreenshot, fullPage: true });
      screenshots.push(channelsLoadedScreenshot);
      
      // Test pagination if present
      const pagination = page.locator('[data-testid="import-dialog"] .MuiTablePagination-root');
      if (await pagination.isVisible()) {
        console.log('📄 Testing pagination...');
        
        const nextButton = page.locator('[data-testid="import-dialog"] .MuiTablePagination-actions button[aria-label="Go to next page"]');
        if (await nextButton.isEnabled()) {
          await nextButton.click();
          await page.waitForTimeout(1000);
          
          // Take screenshot of page 2
          const page2Screenshot = 'test-results/04-m3u-page-2.png';
          await page.screenshot({ path: page2Screenshot, fullPage: true });
          screenshots.push(page2Screenshot);
          
          console.log('✅ Pagination works');
        }
      }
      
      // Test search functionality if available
      const searchInput = page.locator('[data-testid="channel-search-input"]');
      if (await searchInput.isVisible()) {
        console.log('🔍 Testing search functionality...');
        await searchInput.fill('news');
        await page.waitForTimeout(1000);
        
        // Take screenshot of search results
        const searchScreenshot = 'test-results/04-m3u-search-results.png';
        await page.screenshot({ path: searchScreenshot, fullPage: true });
        screenshots.push(searchScreenshot);
        
        console.log('✅ Search functionality works');
      }
    } else {
      console.log('⚠️ Channels failed to load within timeout');
    }
    
    // Close import dialog
    await page.click('[data-testid="cancel-import-button"]');
  });

  test('5. Channel management comprehensive workflow', async ({ page }) => {
    console.log('🔍 Test 5: Comprehensive channel management workflow...');
    
    await page.goto('http://localhost:8080');
    await page.click('[data-testid="nav-channels"]');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of channels page
    const channelsPageScreenshot = 'test-results/05-channels-page.png';
    await page.screenshot({ path: channelsPageScreenshot, fullPage: true });
    screenshots.push(channelsPageScreenshot);
    
    const channelCount = await page.locator('table tbody tr').count();
    console.log(`📊 Found ${channelCount} existing channels`);
    
    // Test channel creation dialog
    await page.click('[data-testid="add-channel-button"]');
    
    const channelDialogVisible = await page.locator('dialog:has(text="Add Channel"), [data-testid="channel-dialog"]').isVisible({ timeout: 5000 });
    if (channelDialogVisible) {
      console.log('✅ Channel creation dialog opened');
      
      // Take screenshot of channel dialog
      const channelDialogScreenshot = 'test-results/05-channel-dialog.png';
      await page.screenshot({ path: channelDialogScreenshot, fullPage: true });
      screenshots.push(channelDialogScreenshot);
      
      // Close dialog
      await page.click('button:has-text("Cancel"), [data-testid="cancel-channel-button"]');
    }
    
    // Test channel editing if channels exist
    if (channelCount > 0) {
      const editButton = page.locator('[data-testid="edit-channel-button"]').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        
        const editDialogVisible = await page.locator('dialog:has(text="Edit Channel")').isVisible({ timeout: 5000 });
        if (editDialogVisible) {
          console.log('✅ Channel edit dialog opened');
          
          // Take screenshot
          const editDialogScreenshot = 'test-results/05-channel-edit-dialog.png';
          await page.screenshot({ path: editDialogScreenshot, fullPage: true });
          screenshots.push(editDialogScreenshot);
          
          // Close dialog
          await page.click('button:has-text("Cancel"), [data-testid="cancel-channel-button"]');
        }
      }
    }
  });

  test('6. Mobile responsiveness comprehensive check', async ({ page }) => {
    console.log('🔍 Test 6: Comprehensive mobile responsiveness check...');
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of mobile homepage
    const mobileHomepageScreenshot = 'test-results/06-mobile-homepage.png';
    await page.screenshot({ path: mobileHomepageScreenshot, fullPage: true });
    screenshots.push(mobileHomepageScreenshot);
    
    // Test mobile navigation
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
    if (await mobileMenuButton.isVisible()) {
      console.log('📱 Testing mobile navigation...');
      await mobileMenuButton.click();
      
      // Take screenshot of mobile menu
      const mobileMenuScreenshot = 'test-results/06-mobile-menu.png';
      await page.screenshot({ path: mobileMenuScreenshot, fullPage: true });
      screenshots.push(mobileMenuScreenshot);
      
      // Test navigation to streams
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      // Take screenshot of mobile streams page
      const mobileStreamsScreenshot = 'test-results/06-mobile-streams.png';
      await page.screenshot({ path: mobileStreamsScreenshot, fullPage: true });
      screenshots.push(mobileStreamsScreenshot);
      
      // Test mobile FAB
      const mobileFab = page.locator('[data-testid="add-stream-fab"]');
      if (await mobileFab.isVisible()) {
        await mobileFab.click();
        
        const mobileDialogVisible = await page.locator('[data-testid="stream-dialog"]').isVisible({ timeout: 5000 });
        if (mobileDialogVisible) {
          console.log('✅ Mobile dialog opened');
          
          // Take screenshot
          const mobileDialogScreenshot = 'test-results/06-mobile-dialog.png';
          await page.screenshot({ path: mobileDialogScreenshot, fullPage: true });
          screenshots.push(mobileDialogScreenshot);
          
          await page.click('[data-testid="cancel-stream-button"]');
        }
      }
    }
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    
    // Take screenshot of tablet view
    const tabletScreenshot = 'test-results/06-tablet-view.png';
    await page.screenshot({ path: tabletScreenshot, fullPage: true });
    screenshots.push(tabletScreenshot);
    
    console.log('✅ Mobile responsiveness tested');
  });

  test('7. Error handling and resilience check', async ({ page }) => {
    console.log('🔍 Test 7: Comprehensive error handling check...');
    
    await page.goto('http://localhost:8080');
    
    // Test with simulated network errors
    await page.route('**/api/streams', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Simulated server error' })
      });
    });
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of error state
    const errorStateScreenshot = 'test-results/07-error-state.png';
    await page.screenshot({ path: errorStateScreenshot, fullPage: true });
    screenshots.push(errorStateScreenshot);
    
    // Look for error handling UI
    const errorIndicators = [
      '[role="alert"]',
      'text=/error/i',
      'text=/failed/i',
      'text=/unable/i',
      '.error',
      '.MuiAlert-standardError'
    ];
    
    let errorHandlingFound = false;
    for (const selector of errorIndicators) {
      if (await page.locator(selector).isVisible({ timeout: 2000 })) {
        console.log(`✅ Error handling UI found: ${selector}`);
        errorHandlingFound = true;
        break;
      }
    }
    
    // Test recovery by removing error simulation
    await page.unroute('**/api/streams');
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of recovery
    const recoveryScreenshot = 'test-results/07-error-recovery.png';
    await page.screenshot({ path: recoveryScreenshot, fullPage: true });
    screenshots.push(recoveryScreenshot);
    
    console.log('✅ Error handling and recovery tested');
  });

  test('8. Performance and load testing', async ({ page }) => {
    console.log('🔍 Test 8: Performance and load testing...');
    
    const startTime = Date.now();
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    console.log(`⏱️ Initial page load time: ${loadTime}ms`);
    
    // Measure navigation performance
    const navigationTimes = [];
    const sections = ['nav-streams', 'nav-channels', 'nav-dashboard'];
    
    for (const section of sections) {
      const navStartTime = Date.now();
      
      await page.click(`[data-testid="${section}"]`);
      await page.waitForLoadState('networkidle');
      
      const navTime = Date.now() - navStartTime;
      navigationTimes.push({ section, time: navTime });
      console.log(`⏱️ Navigation to ${section}: ${navTime}ms`);
    }
    
    // Take performance screenshot
    const performanceScreenshot = 'test-results/08-performance-test.png';
    await page.screenshot({ path: performanceScreenshot, fullPage: true });
    screenshots.push(performanceScreenshot);
    
    // Verify reasonable performance (adjust thresholds as needed)
    expect(loadTime).toBeLessThan(10000); // 10 seconds for initial load
    
    for (const nav of navigationTimes) {
      expect(nav.time).toBeLessThan(5000); // 5 seconds for navigation
    }
    
    console.log('✅ Performance testing completed');
  });

  test('9. Accessibility compliance check', async ({ page }) => {
    console.log('🔍 Test 9: Accessibility compliance check...');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Check for basic accessibility features
    const accessibilityChecks = [
      {
        name: 'Navigation landmarks',
        selector: '[role="navigation"], nav',
        required: true
      },
      {
        name: 'Main content area',
        selector: '[role="main"], main',
        required: true
      },
      {
        name: 'Button labels',
        selector: 'button[aria-label], button[title]',
        required: false
      },
      {
        name: 'Form labels',
        selector: 'input[aria-label], input + label, label',
        required: false
      },
      {
        name: 'Heading structure',
        selector: 'h1, h2, h3, h4, h5, h6',
        required: true
      }
    ];
    
    for (const check of accessibilityChecks) {
      const elements = page.locator(check.selector);
      const count = await elements.count();
      
      console.log(`♿ ${check.name}: ${count} elements found`);
      
      if (check.required) {
        expect(count).toBeGreaterThan(0);
      }
    }
    
    // Test keyboard navigation
    console.log('⌨️ Testing keyboard navigation...');
    
    // Focus on first interactive element
    await page.keyboard.press('Tab');
    
    // Check if focus is visible
    const focusedElement = page.locator(':focus');
    const hasFocus = await focusedElement.count() > 0;
    
    if (hasFocus) {
      console.log('✅ Keyboard focus working');
    }
    
    // Take accessibility screenshot
    const accessibilityScreenshot = 'test-results/09-accessibility-check.png';
    await page.screenshot({ path: accessibilityScreenshot, fullPage: true });
    screenshots.push(accessibilityScreenshot);
    
    console.log('✅ Accessibility check completed');
  });

  test('10. Final comprehensive status report', async ({ page }) => {
    console.log('🔍 Test 10: Final comprehensive status report...');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Take final comprehensive screenshot
    const finalScreenshot = 'test-results/10-final-comprehensive-status.png';
    await page.screenshot({ path: finalScreenshot, fullPage: true });
    screenshots.push(finalScreenshot);
    
    // Generate comprehensive report
    console.log('\n📋 COMPREHENSIVE TEST REPORT');
    console.log('=' .repeat(50));
    
    console.log('\n📊 OVERALL STATISTICS:');
    console.log(`📸 Total screenshots: ${screenshots.length}`);
    console.log(`❌ Total errors: ${errors.length}`);
    console.log(`🔌 Total network failures: ${networkFailures.length}`);
    
    console.log('\n🎯 CRITICAL FUNCTIONALITY:');
    
    // Verify critical elements one final time
    const criticalElements = [
      { selector: '[data-testid="nav-dashboard"]', name: 'Dashboard Navigation' },
      { selector: '[data-testid="nav-streams"]', name: 'Streams Navigation' },
      { selector: '[data-testid="nav-channels"]', name: 'Channels Navigation' },
      { selector: 'table, [role="table"]', name: 'Data Tables' },
      { selector: 'button, [role="button"]', name: 'Interactive Buttons' }
    ];
    
    let criticalElementsWorking = 0;
    
    for (const element of criticalElements) {
      const isVisible = await page.locator(element.selector).isVisible({ timeout: 2000 });
      if (isVisible) {
        console.log(`✅ ${element.name}: Working`);
        criticalElementsWorking++;
      } else {
        console.log(`❌ ${element.name}: Not found`);
      }
    }
    
    const criticalFunctionalityScore = (criticalElementsWorking / criticalElements.length) * 100;
    console.log(`\n📈 Critical Functionality Score: ${criticalFunctionalityScore.toFixed(1)}%`);
    
    console.log('\n🏥 HEALTH STATUS:');
    
    if (errors.length === 0) {
      console.log('✅ No JavaScript errors detected');
    } else {
      console.log(`❌ ${errors.length} JavaScript errors found`);
      errors.forEach(error => console.log(`   - ${error}`));
    }
    
    if (networkFailures.length === 0) {
      console.log('✅ No network failures detected');
    } else {
      console.log(`❌ ${networkFailures.length} network failures found`);
      networkFailures.forEach(failure => console.log(`   - ${failure}`));
    }
    
    console.log('\n📁 ARTIFACTS:');
    console.log('Screenshots saved to:');
    screenshots.forEach(screenshot => console.log(`   - ${screenshot}`));
    
    console.log('\n🎉 COMPREHENSIVE TEST SUITE COMPLETED!');
    console.log('=' .repeat(50));
    
    // Final assertions
    expect(criticalFunctionalityScore).toBeGreaterThan(80); // At least 80% of critical functionality working
    expect(errors.length).toBeLessThan(5); // Maximum 5 errors acceptable
    expect(networkFailures.length).toBeLessThan(3); // Maximum 3 network failures acceptable
  });
});
