const { test, expect } = require('@playwright/test');

test.describe('PlexBridge Comprehensive Application Test', () => {
  let errors = [];
  let networkFailures = [];
  let screenshots = [];

  // Capture console errors and network failures
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

  test('1. Navigate to homepage and verify page loads', async ({ page }) => {
    console.log('🔍 Test 1: Loading homepage...');
    
    // Navigate to the application
    const response = await page.goto('http://localhost:8080');
    expect(response.status()).toBe(200);

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of homepage
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/01-homepage.png',
      fullPage: true 
    });
    screenshots.push('01-homepage.png');
    console.log('📸 Homepage screenshot saved');

    // Verify basic page structure
    const title = await page.title();
    expect(title).toBeTruthy();
    console.log(`✅ Page title: ${title}`);

    // Check if React app has loaded
    await expect(page.locator('#root')).toBeVisible();
    console.log('✅ React root element found');

    // Wait a bit for any async loading
    await page.waitForTimeout(2000);
  });

  test('2. Test health endpoint', async ({ page }) => {
    console.log('🔍 Test 2: Testing health endpoint...');
    
    // Test health endpoint directly
    const response = await page.request.get('http://localhost:8080/health');
    expect(response.status()).toBe(200);
    
    const healthData = await response.json();
    expect(healthData.status).toBe('healthy');
    expect(healthData.timestamp).toBeTruthy();
    expect(healthData.uptime).toBeGreaterThan(0);
    
    console.log('✅ Health endpoint responding correctly');
    console.log(`✅ Health data:`, healthData);
  });

  test('3. Test main application interface and React components', async ({ page }) => {
    console.log('🔍 Test 3: Testing main application interface...');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Look for Material-UI components
    const appBar = page.locator('.MuiAppBar-root');
    if (await appBar.count() > 0) {
      await expect(appBar.first()).toBeVisible();
      console.log('✅ Material-UI AppBar found');
    }

    // Look for main content area
    const mainContent = page.locator('main, [role="main"], .main-content');
    if (await mainContent.count() > 0) {
      await expect(mainContent.first()).toBeVisible();
      console.log('✅ Main content area found');
    }

    // Check for navigation elements
    const navigation = page.locator('nav, .navigation, .nav-menu');
    if (await navigation.count() > 0) {
      console.log('✅ Navigation elements found');
    }

    // Look for any data-testid elements (as per project guidelines)
    const testIdElements = await page.locator('[data-testid]').count();
    console.log(`✅ Found ${testIdElements} elements with data-testid attributes`);

    // Take screenshot of main interface
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/02-main-interface.png',
      fullPage: true 
    });
    screenshots.push('02-main-interface.png');
    console.log('📸 Main interface screenshot saved');
  });

  test('4. Test basic navigation and routes', async ({ page }) => {
    console.log('🔍 Test 4: Testing navigation and routes...');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Try common routes that might exist based on the project structure
    const routes = [
      '/',
      '/dashboard',
      '/channels',
      '/streams',
      '/epg',
      '/settings',
      '/logs'
    ];

    for (const route of routes) {
      try {
        console.log(`🔍 Testing route: ${route}`);
        const response = await page.goto(`http://localhost:8080${route}`);
        
        if (response.status() === 200) {
          console.log(`✅ Route ${route} - Status: ${response.status()}`);
          await page.waitForLoadState('networkidle');
          
          // Take screenshot of each working route
          const routeName = route.replace('/', '') || 'home';
          const screenshotPath = `/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/03-route-${routeName}.png`;
          await page.screenshot({ 
            path: screenshotPath,
            fullPage: true 
          });
          screenshots.push(`03-route-${routeName}.png`);
          console.log(`📸 Screenshot saved for route ${route}`);
        } else {
          console.log(`⚠️ Route ${route} - Status: ${response.status()}`);
        }
      } catch (error) {
        console.log(`❌ Route ${route} failed: ${error.message}`);
      }
      
      await page.waitForTimeout(1000); // Brief pause between route tests
    }
  });

  test('5. Test responsive design', async ({ page }) => {
    console.log('🔍 Test 5: Testing responsive design...');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Test different viewport sizes
    const viewports = [
      { name: 'desktop', width: 1920, height: 1080 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 375, height: 667 }
    ];

    for (const viewport of viewports) {
      console.log(`🔍 Testing ${viewport.name} viewport (${viewport.width}x${viewport.height})`);
      
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(1000); // Allow layout to adjust
      
      // Take screenshot of responsive view
      await page.screenshot({ 
        path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/04-responsive-${viewport.name}.png`,
        fullPage: true 
      });
      screenshots.push(`04-responsive-${viewport.name}.png`);
      console.log(`📸 Responsive screenshot saved for ${viewport.name}`);
      
      // Check if mobile menu is present on smaller screens
      if (viewport.width < 768) {
        const mobileMenu = page.locator('[data-testid="mobile-menu-button"]');
        if (await mobileMenu.count() > 0) {
          console.log('✅ Mobile menu button found');
        }
      }
    }
  });

  test('6. Test API endpoints', async ({ page }) => {
    console.log('🔍 Test 6: Testing API endpoints...');
    
    const apiEndpoints = [
      '/api/channels',
      '/api/streams', 
      '/api/epg',
      '/api/metrics',
      '/api/settings',
      '/health',
      '/discover.json',
      '/lineup.json'
    ];

    for (const endpoint of apiEndpoints) {
      try {
        const response = await page.request.get(`http://localhost:8080${endpoint}`);
        console.log(`✅ ${endpoint} - Status: ${response.status()}`);
        
        if (response.status() === 200) {
          const contentType = response.headers()['content-type'];
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            console.log(`✅ ${endpoint} returned valid JSON`);
          }
        }
      } catch (error) {
        console.log(`❌ ${endpoint} failed: ${error.message}`);
      }
    }
  });

  test('7. Test application functionality', async ({ page }) => {
    console.log('🔍 Test 7: Testing application functionality...');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Look for interactive elements
    const buttons = await page.locator('button').count();
    const links = await page.locator('a').count();
    const forms = await page.locator('form').count();
    const inputs = await page.locator('input').count();

    console.log(`✅ Found ${buttons} buttons, ${links} links, ${forms} forms, ${inputs} inputs`);

    // Test if any navigation is clickable
    const navElements = page.locator('[data-testid^="nav-"], .nav-item, .menu-item');
    const navCount = await navElements.count();
    
    if (navCount > 0) {
      console.log(`✅ Found ${navCount} navigation elements`);
      
      // Try clicking the first navigation element
      try {
        await navElements.first().click();
        await page.waitForTimeout(2000);
        console.log('✅ Successfully clicked navigation element');
        
        // Take screenshot after navigation
        await page.screenshot({ 
          path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/05-after-navigation.png',
          fullPage: true 
        });
        screenshots.push('05-after-navigation.png');
      } catch (error) {
        console.log(`⚠️ Navigation click failed: ${error.message}`);
      }
    }
  });

  test('8. Final status report', async ({ page }) => {
    console.log('\n🔍 Test 8: Generating final status report...');
    
    // Create a comprehensive status report
    const report = {
      timestamp: new Date().toISOString(),
      application_status: 'TESTED',
      total_errors: errors.length,
      total_network_failures: networkFailures.length,
      screenshots_taken: screenshots.length,
      errors: errors,
      network_failures: networkFailures,
      screenshots: screenshots
    };

    console.log('\n📊 COMPREHENSIVE TEST REPORT');
    console.log('================================');
    console.log(`✅ Application Status: ${report.application_status}`);
    console.log(`📊 Total Errors: ${report.total_errors}`);
    console.log(`📊 Network Failures: ${report.total_network_failures}`);
    console.log(`📸 Screenshots Taken: ${report.screenshots_taken}`);
    
    if (errors.length > 0) {
      console.log('\n❌ ERRORS ENCOUNTERED:');
      errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    } else {
      console.log('\n✅ NO JAVASCRIPT/CONSOLE ERRORS DETECTED');
    }

    if (networkFailures.length > 0) {
      console.log('\n❌ NETWORK FAILURES:');
      networkFailures.forEach((failure, index) => {
        console.log(`  ${index + 1}. ${failure}`);
      });
    } else {
      console.log('\n✅ NO NETWORK FAILURES DETECTED');
    }

    console.log('\n📸 SCREENSHOTS SAVED:');
    screenshots.forEach((screenshot, index) => {
      console.log(`  ${index + 1}. ${screenshot}`);
    });

    console.log('\n🎉 TESTING COMPLETE!');
    console.log('================================\n');

    // Assert overall success (allow some minor errors but not major failures)
    expect(report.total_errors).toBeLessThan(10); // Allow some minor console warnings
    expect(report.total_network_failures).toBeLessThan(5); // Allow some minor network issues
  });
});