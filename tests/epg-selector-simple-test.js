const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'epg-simple-screenshots');

async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.log('Directory already exists or error creating:', error.message);
  }
}

async function simpleEPGTest() {
  console.log('Starting simplified EPG Channel Selector test...\n');
  await ensureDir(screenshotsDir);
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    
    // Listen for console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log('Console Error:', msg.text());
      }
    });
    
    // Listen for network requests
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
        console.log(`API Request: ${request.method()} ${request.url()}`);
      }
    });
    
    // Step 1: Navigate to application
    console.log('1. Loading PlexBridge application...');
    try {
      await page.goto('http://localhost:8080', { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });
      await page.waitForTimeout(3000);
    } catch (error) {
      console.log('Navigation error:', error.message);
    }
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-homepage-attempt.png'),
      fullPage: true 
    });
    
    // Check what actually loaded
    const pageTitle = await page.title();
    const bodyText = await page.textContent('body').catch(() => 'Unable to get body text');
    console.log(`Page title: "${pageTitle}"`);
    console.log(`Body preview: "${bodyText.substring(0, 200)}..."`);
    
    // Check if it's an error page
    const hasError = bodyText.includes('error') || bodyText.includes('Error');
    if (hasError) {
      console.log('❌ Error page detected');
      
      // Try to restart the service or check direct API access
      console.log('\n2. Testing direct API access...');
      
      const response = await fetch('http://localhost:8080/api/epg/channels');
      const apiData = await response.json();
      console.log('EPG Channels API response:', apiData);
      
      await page.screenshot({ 
        path: path.join(screenshotsDir, '02-error-state.png'),
        fullPage: true 
      });
      
      console.log('\n❌ Cannot proceed with EPG selector test due to server error');
      console.log('The application is not serving the frontend properly.');
      console.log('API endpoints are working, but the main application interface has issues.');
      
      return {
        success: false,
        error: 'Frontend not loading - server error',
        apiWorking: true,
        screenshots: ['01-homepage-attempt.png', '02-error-state.png']
      };
    }
    
    // If we get here, the app loaded successfully
    console.log('✅ Application loaded successfully');
    
    // Step 2: Look for navigation
    console.log('\n2. Looking for navigation elements...');
    
    // Try different possible navigation selectors
    const navSelectors = [
      '[data-testid="nav-epg"]',
      'a[href*="epg"]',
      'button:has-text("EPG")',
      'nav a:has-text("EPG")',
      '.MuiTab-root:has-text("EPG")'
    ];
    
    let navElement = null;
    for (const selector of navSelectors) {
      const element = await page.locator(selector).first();
      if (await element.count() > 0) {
        navElement = element;
        console.log(`Found navigation using selector: ${selector}`);
        break;
      }
    }
    
    if (!navElement) {
      console.log('❌ No EPG navigation found');
      
      // Take screenshot of current state
      await page.screenshot({ 
        path: path.join(screenshotsDir, '03-no-nav-found.png'),
        fullPage: true 
      });
      
      // List all available navigation
      const allLinks = await page.locator('a, button').allTextContents();
      console.log('Available navigation elements:', allLinks.slice(0, 10));
      
      return {
        success: false,
        error: 'EPG navigation not found',
        availableNavigation: allLinks,
        screenshots: ['01-homepage-attempt.png', '03-no-nav-found.png']
      };
    }
    
    // Step 3: Navigate to EPG
    console.log('\n3. Navigating to EPG Manager...');
    await navElement.click();
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '04-epg-page.png'),
      fullPage: true 
    });
    
    // Step 4: Look for Program Guide tab
    console.log('\n4. Looking for Program Guide tab...');
    const programGuideTab = await page.locator('button[role="tab"]:has-text("Program Guide")');
    
    if (await programGuideTab.count() === 0) {
      console.log('❌ Program Guide tab not found');
      
      // List available tabs
      const tabs = await page.locator('button[role="tab"]').allTextContents();
      console.log('Available tabs:', tabs);
      
      await page.screenshot({ 
        path: path.join(screenshotsDir, '05-no-program-guide-tab.png'),
        fullPage: true 
      });
      
      return {
        success: false,
        error: 'Program Guide tab not found',
        availableTabs: tabs,
        screenshots: ['01-homepage-attempt.png', '04-epg-page.png', '05-no-program-guide-tab.png']
      };
    }
    
    // Step 5: Click Program Guide tab
    console.log('\n5. Opening Program Guide tab...');
    await programGuideTab.click();
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '06-program-guide-tab.png'),
      fullPage: true 
    });
    
    // Step 6: Look for channel selector
    console.log('\n6. Looking for channel selector...');
    const channelSelector = await page.locator('[data-testid="channel-selector"]');
    const selectorExists = await channelSelector.count() > 0;
    
    if (!selectorExists) {
      console.log('❌ Channel selector not found');
      
      // Look for any select elements
      const selects = await page.locator('select, .MuiSelect-root').count();
      console.log(`Found ${selects} select elements on page`);
      
      await page.screenshot({ 
        path: path.join(screenshotsDir, '07-no-channel-selector.png'),
        fullPage: true 
      });
      
      return {
        success: false,
        error: 'Channel selector not found on Program Guide tab',
        selectElementsFound: selects,
        screenshots: ['01-homepage-attempt.png', '04-epg-page.png', '06-program-guide-tab.png', '07-no-channel-selector.png']
      };
    }
    
    // Step 7: Test channel selector
    console.log('\n7. ✅ Channel selector found! Testing functionality...');
    
    // Check current value
    const currentValue = await channelSelector.inputValue().catch(() => 'Unable to get value');
    console.log(`Current selector value: "${currentValue}"`);
    
    // Open dropdown
    await channelSelector.click();
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '08-selector-dropdown-open.png'),
      fullPage: true 
    });
    
    // Get options
    const options = await page.locator('li[role="option"]').allTextContents();
    console.log(`Channel options found: ${options.length}`);
    console.log('Options:', options.slice(0, 5));
    
    // Test selecting an option
    if (options.length > 1) {
      console.log('\n8. Testing channel selection...');
      
      const secondOption = await page.locator('li[role="option"]').nth(1);
      await secondOption.click();
      await page.waitForTimeout(2000);
      
      await page.screenshot({ 
        path: path.join(screenshotsDir, '09-channel-selected.png'),
        fullPage: true 
      });
      
      // Check for alert
      const alertExists = await page.locator('.MuiAlert-root').count() > 0;
      console.log(`Alert displayed: ${alertExists ? 'Yes' : 'No'}`);
    }
    
    console.log('\n✅ EPG Channel Selector test completed successfully!');
    
    return {
      success: true,
      channelSelectorFound: true,
      channelOptions: options.length,
      channelOptionsPreview: options.slice(0, 5),
      apiRequests: apiRequests,
      consoleErrors: consoleErrors,
      screenshots: [
        '01-homepage-attempt.png',
        '04-epg-page.png', 
        '06-program-guide-tab.png',
        '08-selector-dropdown-open.png',
        '09-channel-selected.png'
      ]
    };
    
  } catch (error) {
    console.error('Test error:', error);
    return {
      success: false,
      error: error.message,
      screenshots: []
    };
  } finally {
    await browser.close();
  }
}

// Run the test
simpleEPGTest().then(result => {
  console.log('\n=== FINAL TEST RESULT ===');
  console.log(JSON.stringify(result, null, 2));
}).catch(console.error);