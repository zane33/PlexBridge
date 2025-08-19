const { chromium } = require('playwright');

async function finalEPGTest() {
  console.log('Final EPG Channel Selector Test...');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    console.log('1. Loading PlexBridge homepage...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'tests/screenshots/final-01-homepage.png', fullPage: true });
    
    console.log('2. Navigating to EPG Manager...');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/screenshots/final-02-epg-manager.png', fullPage: true });
    
    console.log('3. Clicking Program Guide tab...');
    await page.click('button[role="tab"]:has-text("Program Guide")');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'tests/screenshots/final-03-program-guide.png', fullPage: true });
    
    console.log('4. Analyzing page structure...');
    
    // Get all visible elements with text containing "Channel"
    const channelElements = await page.locator('text=/Channel/i').count();
    console.log(`Found ${channelElements} elements containing "Channel"`);
    
    // Look for any select or dropdown elements
    const selectors = [
      '.MuiSelect-root',
      '.MuiFormControl-root',
      'select',
      '[role="combobox"]',
      '[data-testid="channel-selector"]'
    ];
    
    for (const selector of selectors) {
      const count = await page.locator(selector).count();
      console.log(`${selector}: ${count} found`);
      
      if (count > 0) {
        const isVisible = await page.locator(selector).first().isVisible();
        console.log(`  First ${selector} visible: ${isVisible}`);
      }
    }
    
    // Check for specific Program Guide content area
    const programGuideContent = await page.locator('text=/Program Guide/i').count();
    console.log(`Program Guide content elements: ${programGuideContent}`);
    
    // Look for refresh button as a reference point
    const refreshButton = await page.locator('button:has-text("Refresh")').count();
    console.log(`Refresh buttons: ${refreshButton}`);
    
    if (refreshButton > 0) {
      console.log('5. Taking focused screenshot of controls area...');
      const refreshBtn = page.locator('button:has-text("Refresh")').first();
      const box = await refreshBtn.boundingBox();
      
      if (box) {
        await page.screenshot({
          path: 'tests/screenshots/final-04-controls-area.png',
          clip: {
            x: Math.max(0, box.x - 300),
            y: Math.max(0, box.y - 50),
            width: Math.min(800, page.viewportSize().width - box.x + 300),
            height: Math.min(200, page.viewportSize().height - box.y + 50)
          }
        });
      }
    }
    
    console.log('6. Testing mobile viewport...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/screenshots/final-05-mobile.png', fullPage: true });
    
    console.log('7. Testing tablet viewport...');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/screenshots/final-06-tablet.png', fullPage: true });
    
    // Reset to desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    console.log('8. Capturing network activity...');
    
    // Monitor API calls
    const apiCalls = [];
    page.on('response', async (response) => {
      if (response.url().includes('/api/')) {
        apiCalls.push({
          url: response.url(),
          status: response.status(),
          type: response.headers()['content-type']
        });
      }
    });
    
    // Refresh the page to capture API calls
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('[data-testid="nav-epg"]');
    await page.waitForTimeout(2000);
    await page.click('button[role="tab"]:has-text("Program Guide")');
    await page.waitForTimeout(3000);
    
    console.log('9. API calls captured:', apiCalls.slice(-5)); // Last 5 calls
    
    console.log('10. Final desktop screenshot...');
    await page.screenshot({ path: 'tests/screenshots/final-07-final-state.png', fullPage: true });
    
    console.log('✓ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ path: 'tests/screenshots/final-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

finalEPGTest().catch(console.error);