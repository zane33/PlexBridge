// Simple API verification test focused on the key fixes
const { test, expect } = require('@playwright/test');

test.describe('Simple API Fixes Verification', () => {
  const baseURL = 'http://localhost:8081';

  test('Dashboard loads without TypeError map errors', async ({ page }) => {
    const consoleMessages = [];
    const errors = [];

    // Capture all console messages
    page.on('console', msg => {
      consoleMessages.push(msg.text());
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.toString()}`);
    });

    console.log('Navigating to dashboard...');
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/dashboard-verification.png', fullPage: true });

    // Check for specific JavaScript errors we were fixing
    const mapErrors = errors.filter(error => 
      error.includes('.map is not a function') || 
      error.includes('TypeError') && error.includes('map')
    );

    console.log('Console messages:', consoleMessages);
    console.log('Errors found:', errors);
    console.log('Map-related errors:', mapErrors);

    // Verify no map-related TypeErrors
    expect(mapErrors.length).toBe(0);

    console.log('✅ Dashboard loaded without TypeError .map() errors');
  });

  test('EPG page loads without TypeError map errors', async ({ page }) => {
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.toString()}`);
    });

    console.log('Navigating to EPG page...');
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Navigate to EPG
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/epg-verification.png', fullPage: true });

    // Check for map errors
    const mapErrors = errors.filter(error => 
      error.includes('.map is not a function') || 
      error.includes('TypeError') && error.includes('map')
    );

    console.log('Errors found on EPG page:', errors);
    console.log('Map-related errors:', mapErrors);

    expect(mapErrors.length).toBe(0);
    console.log('✅ EPG page loaded without TypeError .map() errors');
  });

  test('Settings page loads without TypeError map errors', async ({ page }) => {
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.toString()}`);
    });

    console.log('Navigating to Settings page...');
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Navigate to Settings
    await page.click('[data-testid="nav-settings"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/settings-verification.png', fullPage: true });

    // Check for map errors
    const mapErrors = errors.filter(error => 
      error.includes('.map is not a function') || 
      error.includes('TypeError') && error.includes('map')
    );

    console.log('Errors found on Settings page:', errors);
    console.log('Map-related errors:', mapErrors);

    expect(mapErrors.length).toBe(0);
    console.log('✅ Settings page loaded without TypeError .map() errors');
  });

  test('Logs page loads without TypeError map errors', async ({ page }) => {
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.toString()}`);
    });

    console.log('Navigating to Logs page...');
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Navigate to Logs
    await page.click('[data-testid="nav-logs"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/logs-verification.png', fullPage: true });

    // Check for map errors
    const mapErrors = errors.filter(error => 
      error.includes('.map is not a function') || 
      error.includes('TypeError') && error.includes('map')
    );

    console.log('Errors found on Logs page:', errors);
    console.log('Map-related errors:', mapErrors);

    expect(mapErrors.length).toBe(0);
    console.log('✅ Logs page loaded without TypeError .map() errors');
  });

  test('Dashboard shows proper content without API errors', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Get page content
    const content = await page.textContent('body');
    
    // Should not contain error messages about failed API calls
    expect(content).not.toContain('Failed to load system metrics');
    expect(content).not.toContain('TypeError: n.map is not a function');
    expect(content).not.toContain('Error loading');
    
    // Take final screenshot
    await page.screenshot({ path: 'test-screenshots/dashboard-content-verification.png', fullPage: true });
    
    console.log('✅ Dashboard shows proper content without API errors');
  });
});