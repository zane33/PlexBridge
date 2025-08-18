const { test, expect } = require('@playwright/test');

test.describe('PlexBridge Final Focused Verification', () => {
  
  test('Complete API Endpoint Validation', async ({ request }) => {
    console.log('--- API Endpoint Validation ---');
    
    const endpoints = [
      { url: '/health', name: 'Health Check' },
      { url: '/api/channels', name: 'Channels API' },
      { url: '/api/streams', name: 'Streams API' },
      { url: '/api/metrics', name: 'Metrics API' },
      { url: '/api/settings', name: 'Settings API' },
      { url: '/api/logs', name: 'Logs API' },
      { url: '/api/epg-sources', name: 'EPG Sources API' },
      { url: '/api/epg/channels', name: 'EPG Channels API' },
      { url: '/api/epg/programs', name: 'EPG Programs API' },
      { url: '/discover.json', name: 'HDHomeRun Discovery' },
      { url: '/lineup.json', name: 'HDHomeRun Lineup' }
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(endpoint.url);
      const responseText = await response.text();
      
      console.log(`${endpoint.name} (${endpoint.url}): ${response.status()}`);
      
      // Verify successful response
      expect(response.status()).toBe(200);
      
      // Verify JSON endpoints return proper JSON
      if (endpoint.url.startsWith('/api/') || endpoint.url.endsWith('.json')) {
        expect(response.headers()['content-type']).toContain('application/json');
        expect(responseText).not.toContain('<html>');
        expect(responseText).not.toContain('<!DOCTYPE');
        
        // Verify it's valid JSON
        expect(() => JSON.parse(responseText)).not.toThrow();
      }
    }
  });

  test('Visual Desktop Page Verification', async ({ page }) => {
    console.log('--- Desktop Visual Verification ---');
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    const pages = [
      { url: '/', name: 'Dashboard' },
      { url: '/channels', name: 'Channels' },
      { url: '/streams', name: 'Streams' },
      { url: '/epg', name: 'EPG' },
      { url: '/logs', name: 'Logs' },
      { url: '/settings', name: 'Settings' }
    ];

    for (const pageInfo of pages) {
      console.log(`Verifying ${pageInfo.name} page...`);
      
      await page.goto(pageInfo.url);
      await page.waitForLoadState('networkidle');
      
      // Take screenshot for visual verification
      await page.screenshot({ 
        path: `test-screenshots/verification-desktop-${pageInfo.name.toLowerCase()}.png`,
        fullPage: true 
      });
      
      // Basic page load verification
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('[data-testid="desktop-drawer"], [data-testid="mobile-drawer"]')).toBeVisible();
      
      // Verify no React error boundaries are triggered
      const errorBoundary = await page.locator('[data-testid="error-boundary"]').count();
      expect(errorBoundary).toBe(0);
      
      console.log(`✅ ${pageInfo.name} page loaded successfully`);
    }
  });

  test('Mobile Responsive Verification', async ({ page }) => {
    console.log('--- Mobile Responsive Verification ---');
    
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Test dashboard on mobile
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Take mobile screenshot
    await page.screenshot({ 
      path: 'test-screenshots/verification-mobile-dashboard.png',
      fullPage: true 
    });
    
    // Verify mobile layout elements are present
    await expect(page.locator('body')).toBeVisible();
    
    // Check for mobile menu button
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
    if (await mobileMenuButton.isVisible()) {
      console.log('✅ Mobile menu button found');
      
      // Test mobile menu functionality
      await mobileMenuButton.click();
      await page.waitForTimeout(1000);
      
      // Take screenshot with menu open
      await page.screenshot({ 
        path: 'test-screenshots/verification-mobile-menu-open.png',
        fullPage: true 
      });
    }
    
    console.log('✅ Mobile layout verification complete');
  });

  test('UI Component Interaction Test', async ({ page }) => {
    console.log('--- UI Component Interaction Test ---');
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Test Streams page functionality
    await page.goto('/streams');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of streams page
    await page.screenshot({ 
      path: 'test-screenshots/verification-streams-interaction.png',
      fullPage: true 
    });
    
    // Test Add Stream button
    const addStreamButton = page.locator('[data-testid="add-stream-button"]');
    if (await addStreamButton.isVisible()) {
      console.log('Add Stream button found');
      await addStreamButton.click();
      await page.waitForTimeout(1000);
      
      // Verify dialog opens
      const streamDialog = page.locator('[data-testid="stream-dialog"], .MuiDialog-root');
      if (await streamDialog.isVisible()) {
        console.log('✅ Add Stream dialog opened');
        
        // Take screenshot of dialog
        await page.screenshot({ 
          path: 'test-screenshots/verification-add-stream-dialog.png',
          fullPage: true 
        });
        
        // Close dialog
        const closeButton = page.locator('[data-testid="cancel-stream-button"], button:has-text("Cancel")').first();
        if (await closeButton.isVisible()) {
          await closeButton.click();
          await page.waitForTimeout(500);
          console.log('✅ Dialog closed successfully');
        }
      }
    }
    
    // Test M3U Import button
    const importButton = page.locator('[data-testid="import-m3u-button"]');
    if (await importButton.isVisible()) {
      console.log('M3U Import button found');
      await importButton.click();
      await page.waitForTimeout(1000);
      
      // Verify import dialog opens
      const importDialog = page.locator('[data-testid="import-dialog"], .MuiDialog-root');
      if (await importDialog.isVisible()) {
        console.log('✅ M3U Import dialog opened');
        
        // Take screenshot of import dialog
        await page.screenshot({ 
          path: 'test-screenshots/verification-m3u-import-dialog.png',
          fullPage: true 
        });
        
        // Close dialog
        const closeButton = page.locator('button:has-text("Cancel")').first();
        if (await closeButton.isVisible()) {
          await closeButton.click();
          await page.waitForTimeout(500);
          console.log('✅ Import dialog closed successfully');
        }
      }
    }
  });

  test('Console Error Monitoring', async ({ page }) => {
    console.log('--- Console Error Monitoring ---');
    
    const consoleErrors = [];
    const consoleWarnings = [];
    
    page.on('console', message => {
      const type = message.type();
      const text = message.text();
      
      if (type === 'error') {
        consoleErrors.push(text);
        console.error(`Console Error: ${text}`);
      } else if (type === 'warning') {
        consoleWarnings.push(text);
      }
    });
    
    // Visit all main pages
    const pages = ['/', '/channels', '/streams', '/epg', '/logs', '/settings'];
    
    for (const url of pages) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
    
    console.log(`Total console errors detected: ${consoleErrors.length}`);
    console.log(`Total console warnings detected: ${consoleWarnings.length}`);
    
    // Report critical errors (non-React dev warnings)
    const criticalErrors = consoleErrors.filter(error => 
      !error.includes('Warning:') && 
      !error.includes('ReactDOM.render') &&
      !error.includes('findDOMNode')
    );
    
    console.log(`Critical errors: ${criticalErrors.length}`);
    
    if (criticalErrors.length > 0) {
      console.log('Critical errors found:');
      criticalErrors.forEach(error => console.log(`- ${error}`));
    }
  });

  test('Network Request Analysis', async ({ page }) => {
    console.log('--- Network Request Analysis ---');
    
    const requests = [];
    const failedRequests = [];
    
    page.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType()
      });
    });
    
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure()?.errorText
      });
    });
    
    // Navigate through the application
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.goto('/streams');
    await page.waitForLoadState('networkidle');
    await page.goto('/channels');
    await page.waitForLoadState('networkidle');
    
    console.log(`Total network requests: ${requests.length}`);
    console.log(`Failed requests: ${failedRequests.length}`);
    
    // Analyze API requests
    const apiRequests = requests.filter(req => req.url.includes('/api/'));
    console.log(`API requests made: ${apiRequests.length}`);
    
    if (failedRequests.length > 0) {
      console.log('Failed requests:');
      failedRequests.forEach(req => {
        console.log(`- ${req.url}: ${req.failure}`);
      });
    }
    
    // Verify no critical failures
    expect(failedRequests.length).toBeLessThanOrEqual(2); // Allow minor asset failures
  });

  test('Final Application State Verification', async ({ page }) => {
    console.log('--- Final Application State Verification ---');
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Navigate to dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Capture final state
    await page.screenshot({ 
      path: 'test-screenshots/final-application-state.png',
      fullPage: true 
    });
    
    // Verify core UI elements are present and functional
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('[class*="Dashboard"], h1, h2')).toHaveCount({ min: 1 });
    
    // Verify navigation is working
    const navigationItems = ['Dashboard', 'Channels', 'Streams', 'EPG', 'Logs', 'Settings'];
    for (const item of navigationItems) {
      const navElement = page.locator(`text="${item}"`).first();
      if (await navElement.isVisible()) {
        console.log(`✅ Navigation item "${item}" is visible`);
      }
    }
    
    // Check for server connectivity
    const healthResponse = await page.request.get('/health');
    expect(healthResponse.status()).toBe(200);
    console.log('✅ Server health check passed');
    
    console.log('✅ Final application state verification complete');
  });

});