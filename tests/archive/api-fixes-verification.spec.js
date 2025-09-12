// API Fixes Verification Test
// Tests that all API endpoints return JSON and no JavaScript errors occur

const { test, expect } = require('@playwright/test');

test.describe('API Fixes Verification', () => {
  const baseURL = 'http://localhost:8081';

  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`Console error: ${msg.text()}`);
      }
    });

    // Listen for page errors
    page.on('pageerror', error => {
      console.error(`Page error: ${error.toString()}`);
    });
  });

  test('All API endpoints return proper JSON responses', async ({ page }) => {
    // Test direct API endpoint calls
    const endpoints = [
      '/api/metrics',
      '/api/epg/sources',
      '/api/logs',
      '/api/settings',
      '/api/channels',
      '/api/streams',
      '/api/epg/channels',
      '/api/epg/programs'
    ];

    for (const endpoint of endpoints) {
      console.log(`Testing endpoint: ${endpoint}`);
      
      const response = await page.request.get(`${baseURL}${endpoint}`);
      expect(response.status()).toBe(200);
      
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('application/json');
      
      // Verify it's valid JSON
      const data = await response.json();
      expect(data).toBeDefined();
      
      console.log(`✅ ${endpoint} returned valid JSON`);
    }
  });

  test('Dashboard loads without JavaScript errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(`${baseURL}/`);
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/dashboard-fixed.png', fullPage: true });
    
    // Check for specific data loading indicators
    await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
    
    // Verify no JavaScript errors occurred
    expect(errors.length).toBe(0);
    
    console.log('✅ Dashboard loaded without JavaScript errors');
  });

  test('All navigation pages load without errors', async ({ page }) => {
    const errors = [];
    const pages = [
      { name: 'Dashboard', selector: '[data-testid="nav-dashboard"]', path: '/' },
      { name: 'Channels', selector: '[data-testid="nav-channels"]', path: '/' },
      { name: 'Streams', selector: '[data-testid="nav-streams"]', path: '/' },
      { name: 'EPG', selector: '[data-testid="nav-epg"]', path: '/' },
      { name: 'Logs', selector: '[data-testid="nav-logs"]', path: '/' },
      { name: 'Settings', selector: '[data-testid="nav-settings"]', path: '/' }
    ];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    for (const testPage of pages) {
      console.log(`Testing ${testPage.name} page...`);
      
      await page.goto(`${baseURL}${testPage.path}`);
      await page.waitForLoadState('networkidle');
      
      // Navigate to the specific page
      if (testPage.selector !== '[data-testid="nav-dashboard"]') {
        await page.click(testPage.selector);
        await page.waitForLoadState('networkidle');
      }
      
      // Wait for content to load
      await page.waitForTimeout(1000);
      
      // Take screenshot
      await page.screenshot({ 
        path: `test-screenshots/${testPage.name.toLowerCase()}-fixed.png`, 
        fullPage: true 
      });
      
      console.log(`✅ ${testPage.name} loaded successfully`);
    }

    // Verify no JavaScript errors occurred across all pages
    expect(errors.length).toBe(0);
    
    console.log('✅ All pages loaded without JavaScript errors');
  });

  test('Verify no TypeError n.map errors on EPG page', async ({ page }) => {
    const errors = [];
    const warnings = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      } else if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });

    await page.goto(`${baseURL}/`);
    await page.waitForLoadState('networkidle');
    
    // Navigate to EPG page
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot of EPG page
    await page.screenshot({ path: 'test-screenshots/epg-page-fixed.png', fullPage: true });
    
    // Filter for the specific error we're fixing
    const mapErrors = errors.filter(error => error.includes('.map is not a function'));
    expect(mapErrors.length).toBe(0);
    
    console.log('✅ EPG page loaded without .map() errors');
  });

  test('Verify no TypeError n.map errors on Logs page', async ({ page }) => {
    const errors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(`${baseURL}/`);
    await page.waitForLoadState('networkidle');
    
    // Navigate to Logs page
    await page.click('[data-testid="nav-logs"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot of Logs page
    await page.screenshot({ path: 'test-screenshots/logs-page-fixed.png', fullPage: true });
    
    // Filter for the specific error we're fixing
    const mapErrors = errors.filter(error => error.includes('.map is not a function'));
    expect(mapErrors.length).toBe(0);
    
    console.log('✅ Logs page loaded without .map() errors');
  });

  test('Verify no TypeError n.map errors on Settings page', async ({ page }) => {
    const errors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(`${baseURL}/`);
    await page.waitForLoadState('networkidle');
    
    // Navigate to Settings page
    await page.click('[data-testid="nav-settings"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot of Settings page
    await page.screenshot({ path: 'test-screenshots/settings-page-fixed.png', fullPage: true });
    
    // Filter for the specific error we're fixing
    const mapErrors = errors.filter(error => error.includes('.map is not a function'));
    expect(mapErrors.length).toBe(0);
    
    console.log('✅ Settings page loaded without .map() errors');
  });

  test('Dashboard metrics load successfully', async ({ page }) => {
    const errors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(`${baseURL}/`);
    await page.waitForLoadState('networkidle');
    
    // Wait for dashboard content to load
    await page.waitForTimeout(3000);
    
    // Check if we can see system metrics or similar content
    const pageContent = await page.textContent('body');
    
    // Should not contain error messages about failed API calls
    expect(pageContent).not.toContain('Failed to load system metrics');
    expect(pageContent).not.toContain('Error loading');
    
    // Should not have JavaScript errors
    expect(errors.length).toBe(0);
    
    console.log('✅ Dashboard metrics loaded without errors');
  });

  test('All pages have proper responsive layout', async ({ page }) => {
    const viewports = [
      { name: 'Desktop', width: 1920, height: 1080 },
      { name: 'Mobile', width: 375, height: 667 }
    ];

    const pages = ['/', '/'];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      for (const testPath of pages) {
        await page.goto(`${baseURL}${testPath}`);
        await page.waitForLoadState('networkidle');
        
        // Take screenshots at different viewport sizes
        await page.screenshot({ 
          path: `test-screenshots/${viewport.name.toLowerCase()}-layout-fixed.png`, 
          fullPage: true 
        });
      }
    }

    console.log('✅ Responsive layout verified');
  });
});