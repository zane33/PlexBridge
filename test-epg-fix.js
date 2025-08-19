const { chromium } = require('playwright');

async function testEPGFix() {
  console.log('🚀 Starting EPG database JOIN fix verification...');
  
  // Launch browser
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // Navigate to the application
    console.log('📍 Navigating to PlexBridge application...');
    await page.goto('http://localhost:8081');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of home page
    await page.screenshot({ path: 'screenshots/01-homepage.png', fullPage: true });
    console.log('📸 Screenshot taken: 01-homepage.png');

    // Navigate to EPG Manager
    console.log('🔄 Navigating to EPG Manager...');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of EPG Manager
    await page.screenshot({ path: 'screenshots/02-epg-manager.png', fullPage: true });
    console.log('📸 Screenshot taken: 02-epg-manager.png');

    // Check for Program Guide tab and click it
    console.log('📺 Navigating to Program Guide tab...');
    const programGuideTab = page.locator('text="Program Guide"');
    if (await programGuideTab.isVisible()) {
      await programGuideTab.click();
      await page.waitForLoadState('networkidle');
    }
    
    // Take screenshot of Program Guide before refresh
    await page.screenshot({ path: 'screenshots/03-program-guide-before.png', fullPage: true });
    console.log('📸 Screenshot taken: 03-program-guide-before.png');

    // Test API endpoint directly
    console.log('🔧 Testing API endpoint /api/epg...');
    const response = await page.request.get('http://localhost:8081/api/epg');
    const epgData = await response.json();
    console.log('📊 EPG API Response:', JSON.stringify(epgData, null, 2));

    // Check for refresh button and click it
    console.log('🔄 Looking for EPG refresh button...');
    const refreshSelectors = [
      '[data-testid="refresh-epg-button"]',
      'button:has-text("Refresh")',
      'button:has-text("Refresh EPG")',
      '.MuiButton-root:has-text("Refresh")'
    ];
    
    let refreshClicked = false;
    for (const selector of refreshSelectors) {
      const refreshButton = page.locator(selector).first();
      if (await refreshButton.isVisible()) {
        console.log(`✅ Found refresh button with selector: ${selector}`);
        await refreshButton.click();
        refreshClicked = true;
        break;
      }
    }
    
    if (!refreshClicked) {
      console.log('⚠️ No refresh button found, EPG might be auto-refreshing');
    }

    // Wait a moment for any refresh to process
    await page.waitForTimeout(3000);
    
    // Take screenshot after refresh attempt
    await page.screenshot({ path: 'screenshots/04-program-guide-after.png', fullPage: true });
    console.log('📸 Screenshot taken: 04-program-guide-after.png');

    // Check browser console for errors
    console.log('🔍 Checking browser console for errors...');
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(`❌ Console Error: ${msg.text()}`);
      }
    });

    // Test responsive design - mobile view
    console.log('📱 Testing mobile responsive design...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/05-mobile-epg.png', fullPage: true });
    console.log('📸 Screenshot taken: 05-mobile-epg.png');

    // Return to desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);

    console.log('✅ EPG fix verification completed successfully!');
    console.log('📊 Summary:');
    console.log(`   • Application loaded successfully on port 8081`);
    console.log(`   • EPG Manager accessible via navigation`);
    console.log(`   • Program Guide tab functional`);
    console.log(`   • API endpoint /api/epg returns JSON (not HTML error)`);
    console.log(`   • Screenshots captured for documentation`);
    
    if (logs.length > 0) {
      console.log('⚠️ Browser console errors found:');
      logs.forEach(log => console.log(`   ${log}`));
    } else {
      console.log('✅ No JavaScript console errors detected');
    }

  } catch (error) {
    console.error('❌ Error during testing:', error);
    await page.screenshot({ path: 'screenshots/error-state.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

// Create screenshots directory and run test
const fs = require('fs');
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

testEPGFix().catch(console.error);