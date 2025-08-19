const { test, expect } = require('@playwright/test');
const path = require('path');

// Helper function to take and analyze screenshots
async function takeScreenshot(page, name, testInfo) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved: ${name}`);
  
  // Check for JavaScript errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  return { screenshotPath, consoleErrors };
}

test.describe('PlexBridge Full Application Test Suite', () => {
  test.setTimeout(120000); // 2 minute timeout for comprehensive tests

  test('Dashboard - Desktop and Mobile Views', async ({ page }, testInfo) => {
    console.log('\n=== TESTING DASHBOARD ===\n');
    
    // Desktop view (1920x1080)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:8080/');
    await page.waitForTimeout(3000); // Allow full page load
    
    // Take screenshot of dashboard desktop
    await takeScreenshot(page, 'dashboard-desktop-initial', testInfo);
    
    // Check for maxConcurrentStreams value
    const maxStreamsElement = await page.locator('text=/Maximum Concurrent Streams/i').first();
    if (await maxStreamsElement.isVisible()) {
      const maxStreamsText = await maxStreamsElement.textContent();
      console.log(`Found max concurrent streams text: ${maxStreamsText}`);
      
      // Look for the actual value (should be 15, not 5)
      const valueElement = await page.locator('[data-testid="max-concurrent-streams-value"], .MuiTypography-h4:has-text(/\\d+\\/\\d+/)').first();
      if (await valueElement.isVisible()) {
        const value = await valueElement.textContent();
        console.log(`Max concurrent streams value found: ${value}`);
        
        if (value.includes('/5')) {
          console.error('❌ ERROR: Dashboard showing max capacity of 5 instead of 15!');
        } else if (value.includes('/15')) {
          console.log('✅ Dashboard correctly showing max capacity of 15');
        }
      }
    }
    
    // Check system metrics
    const metrics = await page.locator('[data-testid="system-metrics"], .MuiCard-root:has-text("System Metrics")').first();
    await takeScreenshot(page, 'dashboard-desktop-metrics', testInfo);
    
    // Mobile view (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'dashboard-mobile', testInfo);
    
    // Check for any error messages
    const errorElements = await page.locator('.MuiAlert-standardError, [role="alert"]').all();
    if (errorElements.length > 0) {
      console.error(`Found ${errorElements.length} error alerts on dashboard`);
      for (const error of errorElements) {
        const text = await error.textContent();
        console.error(`Error alert: ${text}`);
      }
    }
  });

  test('Settings Page - Configuration and Persistence', async ({ page }, testInfo) => {
    console.log('\n=== TESTING SETTINGS PAGE ===\n');
    
    // Desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:8080/');
    
    // Navigate to Settings
    await page.click('[data-testid="nav-settings"], a:has-text("Settings"), button:has-text("Settings")');
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, 'settings-page-initial', testInfo);
    
    // Look for maxConcurrentStreams setting
    const maxStreamsInput = await page.locator('input[name="maxConcurrentStreams"], input[id*="concurrent"], input[type="number"]').first();
    
    if (await maxStreamsInput.isVisible()) {
      const currentValue = await maxStreamsInput.inputValue();
      console.log(`Current maxConcurrentStreams value: ${currentValue}`);
      
      if (currentValue === '5') {
        console.error('❌ ERROR: maxConcurrentStreams is set to 5, should be 15!');
      } else if (currentValue === '15') {
        console.log('✅ maxConcurrentStreams correctly set to 15');
      }
      
      // Try to change the value
      await maxStreamsInput.fill('');
      await maxStreamsInput.fill('20');
      await takeScreenshot(page, 'settings-page-edited', testInfo);
      
      // Try to save settings
      const saveButton = await page.locator('button:has-text("Save"), [data-testid="save-settings"]').first();
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await page.waitForTimeout(2000);
        
        // Check for success/error messages
        const alerts = await page.locator('.MuiAlert-root, .MuiSnackbar-root').all();
        for (const alert of alerts) {
          const text = await alert.textContent();
          console.log(`Alert after save: ${text}`);
        }
        
        await takeScreenshot(page, 'settings-page-after-save', testInfo);
        
        // Reload page to check persistence
        await page.reload();
        await page.waitForTimeout(2000);
        
        const reloadedValue = await maxStreamsInput.inputValue();
        console.log(`Value after reload: ${reloadedValue}`);
        
        if (reloadedValue !== '20') {
          console.error('❌ ERROR: Settings not persisting after save and reload!');
        } else {
          console.log('✅ Settings persisted correctly');
        }
        
        await takeScreenshot(page, 'settings-page-after-reload', testInfo);
      }
    } else {
      console.error('❌ ERROR: Could not find maxConcurrentStreams input field!');
    }
    
    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'settings-mobile', testInfo);
  });

  test('Channels Page - CRUD Operations', async ({ page }, testInfo) => {
    console.log('\n=== TESTING CHANNELS PAGE ===\n');
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:8080/');
    
    // Navigate to Channels
    await page.click('[data-testid="nav-channels"], a:has-text("Channels"), button:has-text("Channels")');
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, 'channels-page-initial', testInfo);
    
    // Try to add a channel
    const addButton = await page.locator('[data-testid="add-channel-button"], button:has-text("Add Channel"), button:has-text("Add")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForTimeout(1000);
      
      await takeScreenshot(page, 'channels-add-dialog', testInfo);
      
      // Fill in channel details
      const nameInput = await page.locator('[data-testid="channel-name-input"], input[name="name"], input[placeholder*="name" i]').first();
      const numberInput = await page.locator('[data-testid="channel-number-input"], input[name="number"], input[type="number"]').first();
      
      if (await nameInput.isVisible() && await numberInput.isVisible()) {
        await nameInput.fill('Test Channel');
        await numberInput.fill('999');
        
        await takeScreenshot(page, 'channels-add-filled', testInfo);
        
        // Save channel
        const saveButton = await page.locator('[data-testid="save-channel-button"], button:has-text("Save")').first();
        await saveButton.click();
        await page.waitForTimeout(2000);
        
        await takeScreenshot(page, 'channels-after-add', testInfo);
        
        // Check if channel appears in list
        const channelRow = await page.locator('tr:has-text("Test Channel"), td:has-text("Test Channel")').first();
        if (await channelRow.isVisible()) {
          console.log('✅ Channel successfully added to list');
        } else {
          console.error('❌ ERROR: Channel not appearing in list after add!');
        }
      }
    }
    
    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'channels-mobile', testInfo);
  });

  test('Streams Page - M3U Import and Search', async ({ page }, testInfo) => {
    console.log('\n=== TESTING STREAMS PAGE ===\n');
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:8080/');
    
    // Navigate to Streams
    await page.click('[data-testid="nav-streams"], a:has-text("Streams"), button:has-text("Streams")');
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, 'streams-page-initial', testInfo);
    
    // Test M3U import
    const importButton = await page.locator('[data-testid="import-m3u-button"], button:has-text("Import M3U"), button:has-text("Import")').first();
    if (await importButton.isVisible()) {
      await importButton.click();
      await page.waitForTimeout(1000);
      
      await takeScreenshot(page, 'streams-import-dialog', testInfo);
      
      // Check for import URL input
      const urlInput = await page.locator('[data-testid="import-url-input"], input[placeholder*="m3u" i], input[placeholder*="url" i]').first();
      if (await urlInput.isVisible()) {
        await urlInput.fill('https://iptv-org.github.io/iptv/index.m3u');
        
        await takeScreenshot(page, 'streams-import-url-entered', testInfo);
        
        // Parse channels
        const parseButton = await page.locator('[data-testid="parse-channels-button"], button:has-text("Parse")').first();
        if (await parseButton.isVisible()) {
          await parseButton.click();
          await page.waitForTimeout(5000); // Allow time for parsing
          
          await takeScreenshot(page, 'streams-import-parsed', testInfo);
          
          // Check for pagination
          const paginationElement = await page.locator('.MuiTablePagination-root').first();
          if (await paginationElement.isVisible()) {
            console.log('✅ Pagination controls found');
            
            // Check rows per page
            const rowsPerPageSelect = await page.locator('.MuiTablePagination-select').first();
            if (await rowsPerPageSelect.isVisible()) {
              const currentRowsPerPage = await rowsPerPageSelect.textContent();
              console.log(`Current rows per page: ${currentRowsPerPage}`);
            }
            
            // Try next page
            const nextPageButton = await page.locator('button[aria-label="Go to next page"]').first();
            if (await nextPageButton.isEnabled()) {
              await nextPageButton.click();
              await page.waitForTimeout(1000);
              await takeScreenshot(page, 'streams-import-page2', testInfo);
            }
          }
        }
      }
      
      // Close dialog
      const closeButton = await page.locator('button[aria-label="close"], [data-testid="cancel-button"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    }
    
    // Test search functionality
    const searchInput = await page.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await takeScreenshot(page, 'streams-search-results', testInfo);
    }
    
    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'streams-mobile', testInfo);
  });

  test('EPG Page - Basic Functionality', async ({ page }, testInfo) => {
    console.log('\n=== TESTING EPG PAGE ===\n');
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:8080/');
    
    // Navigate to EPG
    await page.click('[data-testid="nav-epg"], a:has-text("EPG"), button:has-text("EPG")');
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, 'epg-page-initial', testInfo);
    
    // Check for EPG sources or data
    const epgContent = await page.locator('.MuiCard-root, .MuiPaper-root').first();
    if (await epgContent.isVisible()) {
      const text = await epgContent.textContent();
      console.log(`EPG content preview: ${text.substring(0, 100)}...`);
    }
    
    // Check for any error states
    const errors = await page.locator('.MuiAlert-standardError').all();
    if (errors.length > 0) {
      console.error(`Found ${errors.length} errors on EPG page`);
    }
    
    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'epg-mobile', testInfo);
  });

  test('Logs Page - Basic Functionality', async ({ page }, testInfo) => {
    console.log('\n=== TESTING LOGS PAGE ===\n');
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:8080/');
    
    // Navigate to Logs
    await page.click('[data-testid="nav-logs"], a:has-text("Logs"), button:has-text("Logs")');
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, 'logs-page-initial', testInfo);
    
    // Check for log entries
    const logEntries = await page.locator('pre, code, .log-entry, tr').all();
    console.log(`Found ${logEntries.length} log entries`);
    
    // Check for filter controls
    const filterInput = await page.locator('input[placeholder*="filter" i], input[placeholder*="search" i]').first();
    if (await filterInput.isVisible()) {
      await filterInput.fill('error');
      await page.waitForTimeout(1000);
      await takeScreenshot(page, 'logs-filtered', testInfo);
    }
    
    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'logs-mobile', testInfo);
  });

  test('JavaScript Console Errors Check', async ({ page }, testInfo) => {
    console.log('\n=== CHECKING FOR JAVASCRIPT ERRORS ===\n');
    
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          text: msg.text(),
          location: msg.location()
        });
      }
    });
    
    // Visit all pages and collect errors
    const pages = ['/', '/channels', '/streams', '/epg', '/logs', '/settings'];
    
    for (const pagePath of pages) {
      await page.goto(`http://localhost:8080${pagePath}`);
      await page.waitForTimeout(2000);
      
      // Take screenshot
      await takeScreenshot(page, `console-check-${pagePath.replace('/', '') || 'home'}`, testInfo);
    }
    
    if (consoleErrors.length > 0) {
      console.error('❌ JAVASCRIPT CONSOLE ERRORS FOUND:');
      consoleErrors.forEach(error => {
        console.error(`  - ${error.text}`);
        if (error.location?.url) {
          console.error(`    at ${error.location.url}:${error.location.lineNumber}`);
        }
      });
    } else {
      console.log('✅ No JavaScript console errors detected');
    }
  });

  test('API Endpoints Health Check', async ({ page }, testInfo) => {
    console.log('\n=== TESTING API ENDPOINTS ===\n');
    
    const endpoints = [
      '/health',
      '/api/channels',
      '/api/streams',
      '/api/metrics',
      '/api/settings',
      '/api/logs',
      '/api/epg-sources',
      '/discover.json',
      '/lineup.json'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await page.request.get(`http://localhost:8080${endpoint}`);
        const status = response.status();
        const contentType = response.headers()['content-type'];
        
        console.log(`${endpoint}: Status ${status}, Content-Type: ${contentType}`);
        
        if (status >= 400) {
          console.error(`❌ ERROR: ${endpoint} returned status ${status}`);
          
          if (contentType?.includes('text/html')) {
            console.error('  ERROR: API endpoint returning HTML instead of JSON!');
          }
        } else {
          console.log(`✅ ${endpoint} is responding correctly`);
        }
        
        // For settings endpoint, check the actual values
        if (endpoint === '/api/settings' && status === 200) {
          const data = await response.json();
          console.log(`  maxConcurrentStreams: ${data.maxConcurrentStreams}`);
          
          if (data.maxConcurrentStreams === 5) {
            console.error('  ❌ ERROR: API returning maxConcurrentStreams as 5 instead of 15!');
          }
        }
      } catch (error) {
        console.error(`❌ ERROR accessing ${endpoint}: ${error.message}`);
      }
    }
  });
});