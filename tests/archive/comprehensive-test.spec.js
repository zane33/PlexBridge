const { test, expect } = require('@playwright/test');

test.describe('PlexBridge Comprehensive Testing', () => {
  let consoleMessages = [];
  let networkErrors = [];

  test.beforeEach(async ({ page }) => {
    // Reset message arrays
    consoleMessages = [];
    networkErrors = [];
    
    // Listen for console messages
    page.on('console', (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      });
    });

    // Listen for network failures
    page.on('response', (response) => {
      if (!response.ok()) {
        networkErrors.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        });
      }
    });

    // Listen for page errors
    page.on('pageerror', (error) => {
      consoleMessages.push({
        type: 'error',
        text: `Page Error: ${error.message}`,
        location: { url: page.url() }
      });
    });
  });

  test('API Endpoints Testing', async ({ page }) => {
    console.log('\n=== Testing API Endpoints ===');
    
    const endpoints = [
      '/health',
      '/api/channels',
      '/api/streams', 
      '/api/metrics',
      '/api/settings',
      '/api/logs',
      '/discover.json',
      '/lineup.json'
    ];

    for (const endpoint of endpoints) {
      const response = await page.request.get(`http://localhost:8080${endpoint}`);
      console.log(`\n${endpoint}:`);
      console.log(`Status: ${response.status()}`);
      
      if (response.ok()) {
        try {
          const data = await response.json();
          console.log(`Response: ${JSON.stringify(data, null, 2).substring(0, 200)}${JSON.stringify(data, null, 2).length > 200 ? '...' : ''}`);
        } catch (e) {
          const text = await response.text();
          console.log(`Response (text): ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
        }
      } else {
        const text = await response.text();
        console.log(`Error Response: ${text}`);
      }
    }
  });

  test('Desktop Homepage and Dashboard', async ({ page }) => {
    console.log('\n=== Testing Desktop Homepage and Dashboard ===');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of homepage
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/01-desktop-homepage.png',
      fullPage: true 
    });

    // Check page title
    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Check for basic elements
    const body = await page.locator('body').innerHTML();
    console.log(`Body content preview: ${body.substring(0, 300)}...`);

    // Log console messages
    console.log('\nConsole messages:');
    consoleMessages.forEach(msg => {
      console.log(`  ${msg.type.toUpperCase()}: ${msg.text}`);
    });

    // Log network errors
    if (networkErrors.length > 0) {
      console.log('\nNetwork errors:');
      networkErrors.forEach(err => {
        console.log(`  ${err.status} - ${err.url}: ${err.statusText}`);
      });
    }
  });

  test('Navigation Testing', async ({ page }) => {
    console.log('\n=== Testing Navigation Between Sections ===');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Test navigation to different sections
    const sections = [
      { name: 'Dashboard', path: '/', selector: 'nav a[href="/"], nav a[href="#dashboard"], [data-testid="nav-dashboard"]' },
      { name: 'Channels', path: '/channels', selector: 'nav a[href="/channels"], nav a[href="#channels"], [data-testid="nav-channels"]' },
      { name: 'Streams', path: '/streams', selector: 'nav a[href="/streams"], nav a[href="#streams"], [data-testid="nav-streams"]' },
      { name: 'EPG', path: '/epg', selector: 'nav a[href="/epg"], nav a[href="#epg"], [data-testid="nav-epg"]' },
      { name: 'Logs', path: '/logs', selector: 'nav a[href="/logs"], nav a[href="#logs"], [data-testid="nav-logs"]' },
      { name: 'Settings', path: '/settings', selector: 'nav a[href="/settings"], nav a[href="#settings"], [data-testid="nav-settings"]' }
    ];

    for (const section of sections) {
      console.log(`\nTesting navigation to ${section.name}...`);
      
      try {
        // Try multiple selector approaches
        const selectors = section.selector.split(', ');
        let clicked = false;
        
        for (const selector of selectors) {
          try {
            const element = page.locator(selector).first();
            if (await element.isVisible({ timeout: 2000 })) {
              await element.click();
              clicked = true;
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }

        if (!clicked) {
          // Try direct navigation if clicking fails
          await page.goto(`http://localhost:8080${section.path}`);
        }

        await page.waitForLoadState('networkidle');
        
        // Take screenshot
        await page.screenshot({ 
          path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/02-navigation-${section.name.toLowerCase()}.png`,
          fullPage: true 
        });

        console.log(`Successfully navigated to ${section.name} - Screenshot saved`);

      } catch (error) {
        console.log(`Error navigating to ${section.name}: ${error.message}`);
        
        // Still take a screenshot to see what's on the page
        await page.screenshot({ 
          path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/02-navigation-${section.name.toLowerCase()}-error.png`,
          fullPage: true 
        });
      }
    }
  });

  test('Responsive Design Testing', async ({ page }) => {
    console.log('\n=== Testing Responsive Design ===');
    
    const viewports = [
      { name: 'Desktop', width: 1920, height: 1080 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Mobile', width: 375, height: 667 }
    ];

    for (const viewport of viewports) {
      console.log(`\nTesting ${viewport.name} viewport (${viewport.width}x${viewport.height})...`);
      
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('http://localhost:8080');
      await page.waitForLoadState('networkidle');
      
      // Take screenshot
      await page.screenshot({ 
        path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/03-responsive-${viewport.name.toLowerCase()}.png`,
        fullPage: true 
      });

      // Test mobile navigation if applicable
      if (viewport.width < 768) {
        try {
          // Look for mobile menu button
          const mobileMenuSelectors = [
            '[data-testid="mobile-menu-button"]',
            'button[aria-label*="menu"]',
            '.MuiIconButton-root',
            'button svg[data-testid="MenuIcon"]'
          ];

          for (const selector of mobileMenuSelectors) {
            try {
              const menuButton = page.locator(selector).first();
              if (await menuButton.isVisible({ timeout: 1000 })) {
                await menuButton.click();
                await page.waitForTimeout(500);
                
                await page.screenshot({ 
                  path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/03-responsive-${viewport.name.toLowerCase()}-menu-open.png`,
                  fullPage: true 
                });
                
                console.log(`Mobile menu opened successfully`);
                break;
              }
            } catch (e) {
              // Try next selector
            }
          }
        } catch (error) {
          console.log(`Could not test mobile menu: ${error.message}`);
        }
      }

      console.log(`${viewport.name} viewport testing completed`);
    }
  });

  test('Interactive Elements Testing', async ({ page }) => {
    console.log('\n=== Testing Interactive Elements ===');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Test various interactive elements
    const interactiveElements = [
      'button',
      'a[href]',
      'input',
      'select',
      '[role="button"]',
      '.MuiButton-root',
      '.MuiFab-root'
    ];

    for (const selector of interactiveElements) {
      try {
        const elements = await page.locator(selector).all();
        console.log(`Found ${elements.length} ${selector} elements`);
        
        if (elements.length > 0) {
          // Test first few elements of each type
          for (let i = 0; i < Math.min(3, elements.length); i++) {
            try {
              const element = elements[i];
              const isVisible = await element.isVisible();
              const isEnabled = await element.isEnabled();
              const text = await element.textContent() || await element.getAttribute('aria-label') || '';
              
              console.log(`  ${selector}[${i}]: visible=${isVisible}, enabled=${isEnabled}, text="${text.substring(0, 30)}"`);
            } catch (e) {
              // Element might have been removed from DOM
            }
          }
        }
      } catch (error) {
        console.log(`Error testing ${selector}: ${error.message}`);
      }
    }

    // Take screenshot after interactive elements test
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/04-interactive-elements.png',
      fullPage: true 
    });
  });

  test('Error Detection and Console Analysis', async ({ page }) => {
    console.log('\n=== Error Detection and Console Analysis ===');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Navigate through the app to collect any errors
    const paths = ['/', '/channels', '/streams', '/epg', '/logs', '/settings'];
    
    for (const path of paths) {
      try {
        await page.goto(`http://localhost:8080${path}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000); // Allow time for any async operations
      } catch (error) {
        console.log(`Error navigating to ${path}: ${error.message}`);
      }
    }

    // Final screenshot
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/05-final-state.png',
      fullPage: true 
    });

    // Report all console messages and errors
    console.log('\n=== FINAL CONSOLE MESSAGES SUMMARY ===');
    if (consoleMessages.length === 0) {
      console.log('No console messages detected');
    } else {
      consoleMessages.forEach((msg, index) => {
        console.log(`${index + 1}. [${msg.type.toUpperCase()}] ${msg.text}`);
        if (msg.location && msg.location.url) {
          console.log(`   Location: ${msg.location.url}`);
        }
      });
    }

    console.log('\n=== NETWORK ERRORS SUMMARY ===');
    if (networkErrors.length === 0) {
      console.log('No network errors detected');
    } else {
      networkErrors.forEach((err, index) => {
        console.log(`${index + 1}. ${err.status} - ${err.url}: ${err.statusText}`);
      });
    }
  });
});