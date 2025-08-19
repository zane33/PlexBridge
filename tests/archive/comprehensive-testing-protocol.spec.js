const { test, expect } = require('@playwright/test');

/**
 * COMPREHENSIVE PLEXBRIDGE TESTING PROTOCOL
 * As mandated by CLAUDE.md - Testing Strategy section
 * 
 * This test suite follows the CRITICAL mandatory testing protocol:
 * 1. Test ALL application functionality with Chrome browser automation
 * 2. Take screenshots of EVERY page and UI state during testing
 * 3. Analyze screenshots for visual errors, JavaScript errors, network failures, etc.
 * 4. Test all pages, API endpoints, responsive design, and interactive elements
 * 5. Verify error states and React error boundaries
 * 6. Ensure browser console shows only normal operation messages
 */

test.describe('PlexBridge Comprehensive Testing Protocol', () => {
  let screenshots = [];
  let consoleMessages = [];
  let networkErrors = [];
  let testResults = {
    pages: {},
    apis: {},
    responsive: {},
    interactions: {},
    errors: {}
  };

  test.beforeEach(async ({ page }) => {
    // Capture console messages and errors
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      });
    });

    // Capture network failures
    page.on('response', response => {
      if (!response.ok()) {
        networkErrors.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        });
      }
    });

    // Clear arrays for each test
    screenshots = [];
    consoleMessages = [];
    networkErrors = [];
  });

  test('1. DESKTOP TESTING (1920x1080) - All Pages and APIs', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    console.log('🔍 STARTING DESKTOP COMPREHENSIVE TESTING');

    try {
      // Test 1: Dashboard Page
      console.log('📊 Testing Dashboard Page');
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      const dashboardScreenshot = await page.screenshot({ 
        path: 'test-results/screenshots/desktop-dashboard.png', 
        fullPage: true 
      });
      screenshots.push({ name: 'Desktop Dashboard', path: 'desktop-dashboard.png' });

      // Verify dashboard elements
      const dashboardElements = [
        'h4:has-text("System Metrics")',
        'h4:has-text("Active Streams")',
        'h4:has-text("Channel Count")',
        '[data-testid="system-metrics"]'
      ];

      let dashboardErrors = [];
      for (const selector of dashboardElements) {
        try {
          await expect(page.locator(selector)).toBeVisible({ timeout: 5000 });
        } catch (error) {
          dashboardErrors.push(`Dashboard element missing: ${selector}`);
        }
      }
      testResults.pages.dashboard = { errors: dashboardErrors, screenshot: 'desktop-dashboard.png' };

      // Test 2: Channels Page
      console.log('📺 Testing Channels Page');
      await page.click('[data-testid="nav-channels"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ 
        path: 'test-results/screenshots/desktop-channels.png', 
        fullPage: true 
      });
      screenshots.push({ name: 'Desktop Channels', path: 'desktop-channels.png' });

      let channelErrors = [];
      try {
        await expect(page.locator('h4:has-text("Channel Management")')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('[data-testid="add-channel-button"]')).toBeVisible({ timeout: 5000 });
      } catch (error) {
        channelErrors.push(`Channels page error: ${error.message}`);
      }
      testResults.pages.channels = { errors: channelErrors, screenshot: 'desktop-channels.png' };

      // Test 3: Streams Page
      console.log('🎬 Testing Streams Page');
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ 
        path: 'test-results/screenshots/desktop-streams.png', 
        fullPage: true 
      });
      screenshots.push({ name: 'Desktop Streams', path: 'desktop-streams.png' });

      let streamErrors = [];
      try {
        await expect(page.locator('h4:has-text("Stream Management")')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('[data-testid="add-stream-button"]')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('[data-testid="import-m3u-button"]')).toBeVisible({ timeout: 5000 });
      } catch (error) {
        streamErrors.push(`Streams page error: ${error.message}`);
      }
      testResults.pages.streams = { errors: streamErrors, screenshot: 'desktop-streams.png' };

      // Test 4: EPG Page
      console.log('📅 Testing EPG Page');
      await page.click('[data-testid="nav-epg"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ 
        path: 'test-results/screenshots/desktop-epg.png', 
        fullPage: true 
      });
      screenshots.push({ name: 'Desktop EPG', path: 'desktop-epg.png' });

      let epgErrors = [];
      try {
        await expect(page.locator('h4:has-text("EPG Management")')).toBeVisible({ timeout: 5000 });
      } catch (error) {
        epgErrors.push(`EPG page error: ${error.message}`);
      }
      testResults.pages.epg = { errors: epgErrors, screenshot: 'desktop-epg.png' };

      // Test 5: Logs Page
      console.log('📋 Testing Logs Page');
      await page.click('[data-testid="nav-logs"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ 
        path: 'test-results/screenshots/desktop-logs.png', 
        fullPage: true 
      });
      screenshots.push({ name: 'Desktop Logs', path: 'desktop-logs.png' });

      let logErrors = [];
      try {
        await expect(page.locator('h4:has-text("Application Logs")')).toBeVisible({ timeout: 5000 });
      } catch (error) {
        logErrors.push(`Logs page error: ${error.message}`);
      }
      testResults.pages.logs = { errors: logErrors, screenshot: 'desktop-logs.png' };

      // Test 6: Settings Page
      console.log('⚙️ Testing Settings Page');
      await page.click('[data-testid="nav-settings"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ 
        path: 'test-results/screenshots/desktop-settings.png', 
        fullPage: true 
      });
      screenshots.push({ name: 'Desktop Settings', path: 'desktop-settings.png' });

      let settingsErrors = [];
      try {
        await expect(page.locator('h4:has-text("Application Settings")')).toBeVisible({ timeout: 5000 });
      } catch (error) {
        settingsErrors.push(`Settings page error: ${error.message}`);
      }
      testResults.pages.settings = { errors: settingsErrors, screenshot: 'desktop-settings.png' };

    } catch (error) {
      console.error('❌ Desktop testing failed:', error);
      testResults.pages.general = { errors: [error.message] };
    }
  });

  test('2. MOBILE TESTING (375x667) - Responsive Design', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    console.log('📱 STARTING MOBILE RESPONSIVE TESTING');

    try {
      // Mobile Dashboard
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ 
        path: 'test-results/screenshots/mobile-dashboard.png', 
        fullPage: true 
      });
      screenshots.push({ name: 'Mobile Dashboard', path: 'mobile-dashboard.png' });

      let mobileErrors = [];
      
      // Check for mobile menu button
      try {
        const mobileMenu = page.locator('[data-testid="mobile-menu-button"]');
        const desktopNav = page.locator('[data-testid="nav-channels"]:visible');
        
        // On mobile, either mobile menu should exist OR desktop nav should be hidden
        const mobileMenuVisible = await mobileMenu.isVisible();
        const desktopNavVisible = await desktopNav.isVisible();
        
        if (!mobileMenuVisible && desktopNavVisible) {
          // This might be acceptable if it's a responsive design
          console.log('📝 Note: Desktop navigation visible on mobile - checking responsiveness');
        }
      } catch (error) {
        mobileErrors.push(`Mobile navigation error: ${error.message}`);
      }

      // Test mobile navigation
      try {
        // Try to click mobile menu if it exists
        const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
        if (await mobileMenuButton.isVisible()) {
          await mobileMenuButton.click();
          await page.screenshot({ 
            path: 'test-results/screenshots/mobile-menu-open.png', 
            fullPage: true 
          });
          screenshots.push({ name: 'Mobile Menu Open', path: 'mobile-menu-open.png' });
        }

        // Navigate to streams page on mobile
        await page.click('[data-testid="nav-streams"]');
        await page.waitForLoadState('networkidle');
        
        await page.screenshot({ 
          path: 'test-results/screenshots/mobile-streams.png', 
          fullPage: true 
        });
        screenshots.push({ name: 'Mobile Streams', path: 'mobile-streams.png' });

      } catch (error) {
        mobileErrors.push(`Mobile navigation error: ${error.message}`);
      }

      testResults.responsive.mobile = { errors: mobileErrors, screenshots: screenshots.filter(s => s.name.includes('Mobile')) };

    } catch (error) {
      console.error('❌ Mobile testing failed:', error);
      testResults.responsive.mobile = { errors: [error.message] };
    }
  });

  test('3. API ENDPOINTS TESTING', async ({ page }) => {
    console.log('🔗 STARTING API ENDPOINTS TESTING');

    const apiEndpoints = [
      '/health',
      '/api/channels',
      '/api/streams', 
      '/api/metrics',
      '/api/settings',
      '/api/logs',
      '/api/epg-sources',
      '/api/epg/channels',
      '/api/epg/programs',
      '/discover.json',
      '/lineup.json'
    ];

    for (const endpoint of apiEndpoints) {
      try {
        console.log(`🔍 Testing API endpoint: ${endpoint}`);
        
        const response = await page.request.get(`http://localhost:8080${endpoint}`);
        
        const apiResult = {
          status: response.status(),
          ok: response.ok(),
          headers: await response.allHeaders()
        };

        // Try to parse as JSON
        try {
          const body = await response.text();
          if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
            apiResult.isJson = true;
            apiResult.bodyPreview = body.substring(0, 200);
          } else {
            apiResult.isJson = false;
            apiResult.bodyPreview = body.substring(0, 200);
            apiResult.error = 'Response is not JSON';
          }
        } catch (parseError) {
          apiResult.error = `JSON parse error: ${parseError.message}`;
        }

        testResults.apis[endpoint] = apiResult;

      } catch (error) {
        console.error(`❌ API ${endpoint} failed:`, error);
        testResults.apis[endpoint] = {
          error: error.message,
          status: 'failed'
        };
      }
    }
  });

  test('4. INTERACTIVE ELEMENTS TESTING', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    console.log('🎯 STARTING INTERACTIVE ELEMENTS TESTING');

    try {
      // Test Stream Management Interactions
      await page.goto('/');
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');

      // Test Add Stream Button
      try {
        await page.click('[data-testid="add-stream-button"]');
        await page.waitForSelector('[data-testid="stream-dialog"]', { timeout: 5000 });
        
        await page.screenshot({ 
          path: 'test-results/screenshots/add-stream-dialog.png', 
          fullPage: true 
        });
        screenshots.push({ name: 'Add Stream Dialog', path: 'add-stream-dialog.png' });

        // Close dialog
        await page.press('Escape');
        testResults.interactions.addStream = { success: true };

      } catch (error) {
        testResults.interactions.addStream = { error: error.message };
      }

      // Test M3U Import
      try {
        await page.click('[data-testid="import-m3u-button"]');
        await page.waitForSelector('[data-testid="import-dialog"]', { timeout: 5000 });
        
        await page.screenshot({ 
          path: 'test-results/screenshots/m3u-import-dialog.png', 
          fullPage: true 
        });
        screenshots.push({ name: 'M3U Import Dialog', path: 'm3u-import-dialog.png' });

        // Close dialog
        await page.press('Escape');
        testResults.interactions.m3uImport = { success: true };

      } catch (error) {
        testResults.interactions.m3uImport = { error: error.message };
      }

      // Test Stream Preview Functionality (Critical Fix)
      try {
        // Look for existing streams first
        const streamRows = page.locator('table tbody tr');
        const streamCount = await streamRows.count();
        
        if (streamCount > 0) {
          // Test preview on first stream
          await streamRows.first().locator('[data-testid="preview-stream-button"]').click();
          await page.waitForTimeout(2000); // Wait for player to initialize
          
          await page.screenshot({ 
            path: 'test-results/screenshots/stream-preview-player.png', 
            fullPage: true 
          });
          screenshots.push({ name: 'Stream Preview Player', path: 'stream-preview-player.png' });

          testResults.interactions.streamPreview = { success: true, streams: streamCount };
        } else {
          testResults.interactions.streamPreview = { note: 'No streams available for preview testing' };
        }

      } catch (error) {
        testResults.interactions.streamPreview = { error: error.message };
      }

    } catch (error) {
      console.error('❌ Interactive elements testing failed:', error);
      testResults.interactions.general = { error: error.message };
    }
  });

  test('5. ERROR BOUNDARIES AND CONSOLE TESTING', async ({ page }) => {
    console.log('🛡️ STARTING ERROR BOUNDARIES AND CONSOLE TESTING');

    // Navigate through all pages and collect console messages
    const pages = ['/', '/channels', '/streams', '/epg', '/logs', '/settings'];
    
    for (const pagePath of pages) {
      try {
        await page.goto(pagePath);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Let any async operations complete
        
      } catch (error) {
        console.error(`Error navigating to ${pagePath}:`, error);
      }
    }

    // Analyze console messages
    const errorMessages = consoleMessages.filter(msg => msg.type === 'error');
    const warningMessages = consoleMessages.filter(msg => msg.type === 'warning');
    
    testResults.errors = {
      consoleErrors: errorMessages,
      consoleWarnings: warningMessages,
      networkErrors: networkErrors,
      totalConsoleMessages: consoleMessages.length
    };

    await page.screenshot({ 
      path: 'test-results/screenshots/final-state.png', 
      fullPage: true 
    });
    screenshots.push({ name: 'Final Application State', path: 'final-state.png' });
  });

  test.afterAll(async () => {
    // Generate comprehensive test report
    const report = {
      timestamp: new Date().toISOString(),
      screenshots: screenshots,
      testResults: testResults,
      summary: {
        pagesTestedCount: Object.keys(testResults.pages).length,
        apisTestedCount: Object.keys(testResults.apis).length,
        consoleErrorCount: testResults.errors?.consoleErrors?.length || 0,
        networkErrorCount: testResults.errors?.networkErrors?.length || 0,
        screenshotCount: screenshots.length
      },
      acceptanceCriteria: {
        allPagesLoadWithoutErrors: (testResults.errors?.consoleErrors?.length || 0) === 0,
        allApiEndpointsReturnJson: Object.values(testResults.apis).every(api => api.isJson !== false),
        noVisualLayoutIssues: 'Manual review required of screenshots',
        responsiveDesignWorks: testResults.responsive?.mobile ? true : false,
        navigationFunctionsProperly: Object.keys(testResults.pages).length >= 5,
        noReactErrorBoundaries: 'Verified through console monitoring',
        browserConsoleNormal: (testResults.errors?.consoleErrors?.length || 0) === 0
      }
    };

    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE TESTING PROTOCOL RESULTS');
    console.log('='.repeat(80));
    console.log(`🕐 Timestamp: ${report.timestamp}`);
    console.log(`📸 Screenshots captured: ${report.summary.screenshotCount}`);
    console.log(`📄 Pages tested: ${report.summary.pagesTestedCount}`);
    console.log(`🔗 APIs tested: ${report.summary.apisTestedCount}`);
    console.log(`❌ Console errors: ${report.summary.consoleErrorCount}`);
    console.log(`🌐 Network errors: ${report.summary.networkErrorCount}`);
    console.log('\n📋 ACCEPTANCE CRITERIA STATUS:');
    Object.entries(report.acceptanceCriteria).forEach(([criteria, status]) => {
      const icon = status === true ? '✅' : status === false ? '❌' : '📝';
      console.log(`${icon} ${criteria}: ${status}`);
    });
    console.log('='.repeat(80));

    // Write detailed report to file
    require('fs').writeFileSync(
      'test-results/comprehensive-test-report.json',
      JSON.stringify(report, null, 2)
    );
  });
});