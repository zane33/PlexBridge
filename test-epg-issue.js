const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testEPGManager() {
  console.log('Starting comprehensive EPG Manager testing...');
  
  // Create screenshots directory
  const screenshotsDir = path.join(__dirname, 'test-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Enable console logging
  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text());
  });
  
  // Track network requests
  const networkRequests = [];
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Track network responses
  const networkResponses = [];
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      networkResponses.push({
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
        timestamp: new Date().toISOString()
      });
    }
  });

  try {
    console.log('1. Loading main application...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Take screenshot of main page
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-main-page.png'),
      fullPage: true 
    });
    console.log('✓ Main page loaded and screenshot captured');

    console.log('2. Navigating to EPG Manager...');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForSelector('[data-testid="epg-manager"]', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '02-epg-manager-main.png'),
      fullPage: true 
    });
    console.log('✓ EPG Manager page loaded');

    console.log('3. Testing Program Guide tab...');
    // Look for Program Guide tab
    const programGuideTab = page.locator('button:has-text("Program Guide")');
    await programGuideTab.click();
    await page.waitForTimeout(3000); // Give time for API calls
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '03-program-guide-tab.png'),
      fullPage: true 
    });
    console.log('✓ Program Guide tab clicked');

    console.log('4. Analyzing API endpoint response...');
    // Intercept and capture /api/epg response
    const [epgResponse] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/epg') && response.status() === 200),
      page.reload()
    ]);
    
    const epgData = await epgResponse.json();
    console.log('✓ /api/epg Response captured:', JSON.stringify(epgData, null, 2));
    
    // Save API response to file
    fs.writeFileSync(
      path.join(screenshotsDir, 'api-epg-response.json'), 
      JSON.stringify(epgData, null, 2)
    );

    console.log('5. Checking browser console for errors...');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '04-after-reload.png'),
      fullPage: true 
    });

    console.log('6. Opening browser developer tools to inspect network...');
    await page.keyboard.press('F12');
    await page.waitForTimeout(1000);
    
    // Click on Network tab in dev tools
    await page.click('text=Network');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '05-dev-tools-network.png'),
      fullPage: true 
    });

    console.log('7. Testing different API endpoints...');
    
    // Test /api/epg/sources
    const sourcesResponse = await page.evaluate(async () => {
      const response = await fetch('/api/epg/sources');
      return {
        status: response.status,
        data: await response.json()
      };
    });
    console.log('✓ /api/epg/sources response:', JSON.stringify(sourcesResponse, null, 2));
    
    // Test /api/epg/programs
    const programsResponse = await page.evaluate(async () => {
      const response = await fetch('/api/epg/programs');
      return {
        status: response.status,
        data: await response.json()
      };
    });
    console.log('✓ /api/epg/programs response:', JSON.stringify(programsResponse, null, 2));
    
    // Test /api/epg/channels
    const channelsResponse = await page.evaluate(async () => {
      const response = await fetch('/api/epg/channels');
      return {
        status: response.status,
        data: await response.json()
      };
    });
    console.log('✓ /api/epg/channels response:', JSON.stringify(channelsResponse, null, 2));

    console.log('8. Analyzing frontend expectations vs backend response...');
    
    // Get the actual component state and props
    const componentState = await page.evaluate(() => {
      // Try to access React component state
      const epgManager = document.querySelector('[data-testid="epg-manager"]');
      if (epgManager && epgManager._reactInternalFiber) {
        return {
          hasReactState: true,
          elementFound: true
        };
      }
      return {
        hasReactState: false,
        elementFound: !!epgManager,
        textContent: epgManager ? epgManager.textContent.substring(0, 200) : 'not found'
      };
    });
    console.log('✓ Component state analysis:', componentState);

    console.log('9. Checking for "No program data available" message...');
    
    const noDataMessage = await page.locator('text=No program data available').count();
    const hasNoDataMessage = noDataMessage > 0;
    console.log(`✓ "No program data available" message found: ${hasNoDataMessage}`);
    
    if (hasNoDataMessage) {
      await page.screenshot({ 
        path: path.join(screenshotsDir, '06-no-data-message.png'),
        fullPage: true 
      });
    }

    console.log('10. Summary of network requests and responses...');
    console.log('Network Requests:', networkRequests);
    console.log('Network Responses:', networkResponses);
    
    // Save network data
    fs.writeFileSync(
      path.join(screenshotsDir, 'network-requests.json'), 
      JSON.stringify({ requests: networkRequests, responses: networkResponses }, null, 2)
    );

    console.log('\n=== ANALYSIS RESULTS ===');
    console.log('1. API Response Structure:', epgData);
    console.log('2. Frontend expects: response.data.programs');
    console.log('3. Backend returns:', Object.keys(epgData));
    console.log('4. "No program data available" shown:', hasNoDataMessage);
    console.log('5. Screenshots saved to:', screenshotsDir);

    // Final screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '07-final-state.png'),
      fullPage: true 
    });

  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'error-state.png'),
      fullPage: true 
    });
  } finally {
    await browser.close();
    console.log('\nTest completed. Check screenshots in:', screenshotsDir);
  }
}

// Run the test
testEPGManager().catch(console.error);