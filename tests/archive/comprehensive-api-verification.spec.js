const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs').promises;

// Create screenshots directory for this test run
const screenshotsDir = path.join(__dirname, '..', 'screenshots', 'api-verification', new Date().toISOString().replace(/[:.]/g, '-'));

test.beforeAll(async () => {
  // Ensure screenshots directory exists
  await fs.mkdir(screenshotsDir, { recursive: true });
  console.log(`Screenshots will be saved to: ${screenshotsDir}`);
});

test.describe('PlexBridge Comprehensive API Verification', () => {
  test.setTimeout(120000); // 2 minute timeout for comprehensive testing

  test('Complete API and Frontend Functionality Test', async ({ page, context }) => {
    // Enable console logging to catch JavaScript errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`❌ JavaScript Error: ${msg.text()}`);
      }
    });

    // Monitor failed network requests
    page.on('requestfailed', request => {
      console.error(`❌ Request failed: ${request.url()}`);
    });

    const apiResults = {
      working: [],
      failed: [],
      errors: []
    };

    const testResults = [];

    // Helper function to test API endpoints directly
    async function testApiEndpoint(endpoint, description) {
      try {
        const response = await page.request.get(`http://localhost:8080${endpoint}`);
        const contentType = response.headers()['content-type'] || '';
        const status = response.status();
        
        if (status === 200 && contentType.includes('application/json')) {
          const data = await response.json();
          apiResults.working.push({ endpoint, description, status, dataReceived: true });
          console.log(`✅ API ${endpoint}: Working (JSON response)`);
          return { success: true, data };
        } else {
          apiResults.failed.push({ endpoint, description, status, contentType });
          console.log(`❌ API ${endpoint}: Failed (Status: ${status}, Content-Type: ${contentType})`);
          return { success: false, status, contentType };
        }
      } catch (error) {
        apiResults.errors.push({ endpoint, description, error: error.message });
        console.log(`❌ API ${endpoint}: Error - ${error.message}`);
        return { success: false, error: error.message };
      }
    }

    // Helper function to capture section screenshot
    async function captureSection(name, selector = null) {
      const filename = path.join(screenshotsDir, `${name.replace(/\s+/g, '-').toLowerCase()}.png`);
      if (selector) {
        await page.locator(selector).screenshot({ path: filename });
      } else {
        await page.screenshot({ path: filename, fullPage: true });
      }
      console.log(`📸 Screenshot saved: ${name}`);
      return filename;
    }

    // Helper function to check for errors
    async function checkForErrors(sectionName) {
      const consoleErrors = [];
      const networkErrors = [];
      
      // Check for any error messages in the UI
      const errorElements = await page.locator('.error, .MuiAlert-standardError, [class*="error"]').all();
      
      return {
        section: sectionName,
        hasErrors: errorElements.length > 0,
        errorCount: errorElements.length,
        timestamp: new Date().toISOString()
      };
    }

    console.log('\n🔍 Starting Comprehensive PlexBridge API Verification...\n');

    // ==========================
    // 1. TEST API ENDPOINTS DIRECTLY
    // ==========================
    console.log('📡 Testing API Endpoints Directly...\n');
    
    await testApiEndpoint('/health', 'Health Check');
    await testApiEndpoint('/api/channels', 'Channels API');
    await testApiEndpoint('/api/streams', 'Streams API');
    await testApiEndpoint('/api/settings', 'Settings API');
    await testApiEndpoint('/api/logs', 'Logs API');
    await testApiEndpoint('/api/metrics', 'Metrics API');
    await testApiEndpoint('/api/epg/sources', 'EPG Sources API');
    await testApiEndpoint('/api/epg/channels', 'EPG Channels API');
    await testApiEndpoint('/api/epg/programs', 'EPG Programs API');
    await testApiEndpoint('/discover.json', 'HDHomeRun Discovery');
    await testApiEndpoint('/lineup.json', 'HDHomeRun Lineup');

    // ==========================
    // 2. DASHBOARD TEST
    // ==========================
    console.log('\n🏠 Testing Dashboard...\n');
    
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000); // Allow time for all components to load
    
    // Check if dashboard loaded
    const dashboardLoaded = await page.locator('[data-testid="nav-dashboard"], a[href="/dashboard"], .MuiDrawer-root').isVisible({ timeout: 10000 }).catch(() => false);
    
    if (dashboardLoaded) {
      console.log('✅ Dashboard page loaded');
      
      // Check for metrics
      const metricsVisible = await page.locator('text=/Active Streams|Total Channels|EPG Sources|System Health/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (metricsVisible) {
        console.log('✅ Dashboard metrics are visible');
        testResults.push({ section: 'Dashboard', status: 'Working', details: 'Metrics loaded successfully' });
      } else {
        console.log('⚠️ Dashboard metrics not fully visible');
        testResults.push({ section: 'Dashboard', status: 'Partial', details: 'Page loaded but metrics not visible' });
      }
    } else {
      console.log('❌ Dashboard failed to load');
      testResults.push({ section: 'Dashboard', status: 'Failed', details: 'Page did not load properly' });
    }
    
    await captureSection('1-Dashboard');
    const dashboardErrors = await checkForErrors('Dashboard');
    
    // ==========================
    // 3. CHANNELS MANAGER TEST
    // ==========================
    console.log('\n📺 Testing Channels Manager...\n');
    
    // Navigate to Channels
    const channelsNav = await page.locator('[data-testid="nav-channels"], a[href="/channels"], button:has-text("Channels")').first();
    if (await channelsNav.isVisible()) {
      await channelsNav.click();
      await page.waitForTimeout(2000);
      
      // Check if channels page loaded
      const channelsLoaded = await page.locator('text=/Channel.*Manager|Channels/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (channelsLoaded) {
        console.log('✅ Channels page loaded');
        
        // Check for channel data or empty state
        const hasChannelData = await page.locator('table, .MuiDataGrid-root, text=/No channels|Add.*channel/i').isVisible({ timeout: 5000 }).catch(() => false);
        
        if (hasChannelData) {
          console.log('✅ Channels data/table is visible');
          testResults.push({ section: 'Channels Manager', status: 'Working', details: 'Page and data loaded successfully' });
        } else {
          console.log('⚠️ Channels data not visible');
          testResults.push({ section: 'Channels Manager', status: 'Partial', details: 'Page loaded but data not visible' });
        }
      } else {
        console.log('❌ Channels page failed to load');
        testResults.push({ section: 'Channels Manager', status: 'Failed', details: 'Page did not load properly' });
      }
    } else {
      console.log('❌ Could not find Channels navigation');
      testResults.push({ section: 'Channels Manager', status: 'Failed', details: 'Navigation not found' });
    }
    
    await captureSection('2-Channels-Manager');
    const channelsErrors = await checkForErrors('Channels Manager');
    
    // ==========================
    // 4. STREAMS MANAGER TEST
    // ==========================
    console.log('\n📡 Testing Streams Manager...\n');
    
    // Navigate to Streams
    const streamsNav = await page.locator('[data-testid="nav-streams"], a[href="/streams"], button:has-text("Streams")').first();
    if (await streamsNav.isVisible()) {
      await streamsNav.click();
      await page.waitForTimeout(2000);
      
      // Check if streams page loaded
      const streamsLoaded = await page.locator('text=/Stream.*Manager|Streams/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (streamsLoaded) {
        console.log('✅ Streams page loaded');
        
        // Check for stream data or empty state
        const hasStreamData = await page.locator('table, .MuiDataGrid-root, text=/No streams|Add.*stream|Import.*M3U/i').isVisible({ timeout: 5000 }).catch(() => false);
        
        if (hasStreamData) {
          console.log('✅ Streams data/table is visible');
          
          // Check for Import M3U button
          const hasImportButton = await page.locator('button:has-text("Import M3U"), [data-testid="import-m3u-button"]').isVisible().catch(() => false);
          if (hasImportButton) {
            console.log('✅ Import M3U button is available');
          }
          
          testResults.push({ section: 'Streams Manager', status: 'Working', details: 'Page and data loaded successfully' });
        } else {
          console.log('⚠️ Streams data not visible');
          testResults.push({ section: 'Streams Manager', status: 'Partial', details: 'Page loaded but data not visible' });
        }
      } else {
        console.log('❌ Streams page failed to load');
        testResults.push({ section: 'Streams Manager', status: 'Failed', details: 'Page did not load properly' });
      }
    } else {
      console.log('❌ Could not find Streams navigation');
      testResults.push({ section: 'Streams Manager', status: 'Failed', details: 'Navigation not found' });
    }
    
    await captureSection('3-Streams-Manager');
    const streamsErrors = await checkForErrors('Streams Manager');
    
    // ==========================
    // 5. EPG MANAGER TEST
    // ==========================
    console.log('\n📅 Testing EPG Manager...\n');
    
    // Navigate to EPG
    const epgNav = await page.locator('[data-testid="nav-epg"], a[href="/epg"], button:has-text("EPG")').first();
    if (await epgNav.isVisible()) {
      await epgNav.click();
      await page.waitForTimeout(2000);
      
      // Check if EPG page loaded
      const epgLoaded = await page.locator('text=/EPG.*Manager|Electronic.*Program.*Guide/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (epgLoaded) {
        console.log('✅ EPG page loaded');
        
        // Check for EPG data or empty state
        const hasEpgData = await page.locator('table, .MuiDataGrid-root, text=/No.*EPG|Add.*source/i').isVisible({ timeout: 5000 }).catch(() => false);
        
        if (hasEpgData) {
          console.log('✅ EPG data/table is visible');
          testResults.push({ section: 'EPG Manager', status: 'Working', details: 'Page and data loaded successfully' });
        } else {
          console.log('⚠️ EPG data not visible');
          testResults.push({ section: 'EPG Manager', status: 'Partial', details: 'Page loaded but data not visible' });
        }
      } else {
        console.log('❌ EPG page failed to load');
        testResults.push({ section: 'EPG Manager', status: 'Failed', details: 'Page did not load properly' });
      }
    } else {
      console.log('⚠️ EPG navigation not found (may not be implemented)');
      testResults.push({ section: 'EPG Manager', status: 'Not Found', details: 'Navigation element not found' });
    }
    
    await captureSection('4-EPG-Manager');
    const epgErrors = await checkForErrors('EPG Manager');
    
    // ==========================
    // 6. LOGS VIEWER TEST
    // ==========================
    console.log('\n📋 Testing Logs Viewer...\n');
    
    // Navigate to Logs
    const logsNav = await page.locator('[data-testid="nav-logs"], a[href="/logs"], button:has-text("Logs")').first();
    if (await logsNav.isVisible()) {
      await logsNav.click();
      await page.waitForTimeout(2000);
      
      // Check if logs page loaded
      const logsLoaded = await page.locator('text=/Log.*Viewer|Application.*Logs/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (logsLoaded) {
        console.log('✅ Logs page loaded');
        
        // Check for log data
        const hasLogData = await page.locator('pre, code, .log-entry, text=/INFO|ERROR|WARN|DEBUG/').isVisible({ timeout: 5000 }).catch(() => false);
        
        if (hasLogData) {
          console.log('✅ Log data is visible');
          testResults.push({ section: 'Logs Viewer', status: 'Working', details: 'Page and logs loaded successfully' });
        } else {
          console.log('⚠️ Log data not visible');
          testResults.push({ section: 'Logs Viewer', status: 'Partial', details: 'Page loaded but logs not visible' });
        }
      } else {
        console.log('❌ Logs page failed to load');
        testResults.push({ section: 'Logs Viewer', status: 'Failed', details: 'Page did not load properly' });
      }
    } else {
      console.log('⚠️ Logs navigation not found');
      testResults.push({ section: 'Logs Viewer', status: 'Not Found', details: 'Navigation element not found' });
    }
    
    await captureSection('5-Logs-Viewer');
    const logsErrors = await checkForErrors('Logs Viewer');
    
    // ==========================
    // 7. SETTINGS TEST
    // ==========================
    console.log('\n⚙️ Testing Settings...\n');
    
    // Navigate to Settings
    const settingsNav = await page.locator('[data-testid="nav-settings"], a[href="/settings"], button:has-text("Settings")').first();
    if (await settingsNav.isVisible()) {
      await settingsNav.click();
      await page.waitForTimeout(2000);
      
      // Check if settings page loaded
      const settingsLoaded = await page.locator('text=/Settings|Configuration/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (settingsLoaded) {
        console.log('✅ Settings page loaded');
        
        // Check for settings form
        const hasSettingsForm = await page.locator('input, select, form, text=/Port|Host|Server/i').isVisible({ timeout: 5000 }).catch(() => false);
        
        if (hasSettingsForm) {
          console.log('✅ Settings form is visible');
          testResults.push({ section: 'Settings', status: 'Working', details: 'Page and form loaded successfully' });
        } else {
          console.log('⚠️ Settings form not visible');
          testResults.push({ section: 'Settings', status: 'Partial', details: 'Page loaded but form not visible' });
        }
      } else {
        console.log('❌ Settings page failed to load');
        testResults.push({ section: 'Settings', status: 'Failed', details: 'Page did not load properly' });
      }
    } else {
      console.log('⚠️ Settings navigation not found');
      testResults.push({ section: 'Settings', status: 'Not Found', details: 'Navigation element not found' });
    }
    
    await captureSection('6-Settings');
    const settingsErrors = await checkForErrors('Settings');
    
    // ==========================
    // 8. CHECK BROWSER CONSOLE FOR ERRORS
    // ==========================
    console.log('\n🔍 Checking for JavaScript errors...\n');
    
    // Navigate back to dashboard to check overall state
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Evaluate console for any remaining errors
    const consoleErrors = await page.evaluate(() => {
      const errors = [];
      // Check if there are any error indicators in the DOM
      const errorElements = document.querySelectorAll('.error, .MuiAlert-standardError, [class*="error"]');
      errorElements.forEach(el => {
        errors.push(el.textContent);
      });
      return errors;
    });
    
    if (consoleErrors.length > 0) {
      console.log(`⚠️ Found ${consoleErrors.length} error elements in the UI`);
    } else {
      console.log('✅ No error elements found in the UI');
    }
    
    await captureSection('7-Final-State');
    
    // ==========================
    // GENERATE FINAL REPORT
    // ==========================
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE API VERIFICATION REPORT');
    console.log('='.repeat(80));
    
    console.log('\n📡 API ENDPOINTS STATUS:');
    console.log('-'.repeat(40));
    
    console.log('\n✅ WORKING ENDPOINTS:');
    apiResults.working.forEach(api => {
      console.log(`  • ${api.endpoint} - ${api.description}`);
    });
    
    if (apiResults.failed.length > 0) {
      console.log('\n❌ FAILED ENDPOINTS:');
      apiResults.failed.forEach(api => {
        console.log(`  • ${api.endpoint} - ${api.description} (Status: ${api.status}, Type: ${api.contentType})`);
      });
    }
    
    if (apiResults.errors.length > 0) {
      console.log('\n⚠️ ENDPOINTS WITH ERRORS:');
      apiResults.errors.forEach(api => {
        console.log(`  • ${api.endpoint} - ${api.error}`);
      });
    }
    
    console.log('\n🖥️ FRONTEND COMPONENTS STATUS:');
    console.log('-'.repeat(40));
    
    testResults.forEach(result => {
      const icon = result.status === 'Working' ? '✅' : 
                   result.status === 'Partial' ? '⚠️' : 
                   result.status === 'Not Found' ? '🔍' : '❌';
      console.log(`${icon} ${result.section}: ${result.status}`);
      console.log(`   Details: ${result.details}`);
    });
    
    console.log('\n📈 OVERALL ASSESSMENT:');
    console.log('-'.repeat(40));
    
    const workingApis = apiResults.working.length;
    const totalApis = workingApis + apiResults.failed.length + apiResults.errors.length;
    const apiSuccessRate = (workingApis / totalApis * 100).toFixed(1);
    
    const workingComponents = testResults.filter(r => r.status === 'Working').length;
    const totalComponents = testResults.length;
    const componentSuccessRate = (workingComponents / totalComponents * 100).toFixed(1);
    
    console.log(`• API Success Rate: ${apiSuccessRate}% (${workingApis}/${totalApis} endpoints working)`);
    console.log(`• Frontend Success Rate: ${componentSuccessRate}% (${workingComponents}/${totalComponents} components working)`);
    
    if (apiSuccessRate === '100.0' && componentSuccessRate >= 80) {
      console.log('\n🎉 APPLICATION STATUS: FULLY FUNCTIONAL');
      console.log('All API endpoints are returning JSON responses correctly.');
      console.log('The routing fix has successfully resolved the API issues.');
    } else if (apiSuccessRate >= 80) {
      console.log('\n⚠️ APPLICATION STATUS: MOSTLY FUNCTIONAL');
      console.log('Most API endpoints are working, but some issues remain.');
    } else {
      console.log('\n❌ APPLICATION STATUS: NEEDS ATTENTION');
      console.log('Several API endpoints or components are not working correctly.');
    }
    
    console.log('\n📸 SCREENSHOTS SAVED TO:');
    console.log(`   ${screenshotsDir}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('Testing completed at:', new Date().toISOString());
    console.log('='.repeat(80) + '\n');
    
    // Assert overall success
    expect(apiSuccessRate).toBeGreaterThanOrEqual(80);
    expect(workingComponents).toBeGreaterThanOrEqual(4);
  });
});