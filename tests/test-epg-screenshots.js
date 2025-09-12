const { chromium } = require('playwright');

async function captureEPGScreenshots() {
  console.log('Starting EPG Channel Selector screenshot capture...');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to the application
    console.log('Navigating to PlexBridge...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    
    // Take full dashboard screenshot first
    await page.screenshot({ 
      path: 'tests/screenshots/01-dashboard-initial.png',
      fullPage: true 
    });
    console.log('✓ Dashboard screenshot captured');
    
    // Navigate to EPG Manager
    console.log('Navigating to EPG Manager...');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    
    // Take EPG Manager initial view
    await page.screenshot({ 
      path: 'tests/screenshots/02-epg-manager-initial.png',
      fullPage: true 
    });
    console.log('✓ EPG Manager initial screenshot captured');
    
    // Click on Program Guide tab
    console.log('Clicking Program Guide tab...');
    const programGuideTab = page.locator('button[role="tab"]:has-text("Program Guide")');
    if (await programGuideTab.isVisible()) {
      await programGuideTab.click();
      await page.waitForTimeout(2000); // Wait for tab content to load
      
      // Take Program Guide tab screenshot
      await page.screenshot({ 
        path: 'tests/screenshots/03-program-guide-tab.png',
        fullPage: true 
      });
      console.log('✓ Program Guide tab screenshot captured');
      
      // Look for channel selector
      console.log('Looking for channel selector...');
      const channelSelector = page.locator('[data-testid="channel-selector"]');
      
      if (await channelSelector.isVisible()) {
        console.log('✓ Channel selector found!');
        
        // Take focused screenshot of selector area
        const selectorBox = await channelSelector.boundingBox();
        if (selectorBox) {
          await page.screenshot({
            path: 'tests/screenshots/04-channel-selector-focused.png',
            clip: {
              x: Math.max(0, selectorBox.x - 50),
              y: Math.max(0, selectorBox.y - 50),
              width: Math.min(page.viewportSize().width, selectorBox.width + 100),
              height: Math.min(page.viewportSize().height, selectorBox.height + 100)
            }
          });
          console.log('✓ Channel selector focused screenshot captured');
        }
        
        // Test dropdown functionality
        console.log('Testing dropdown functionality...');
        await channelSelector.click();
        await page.waitForTimeout(1000);
        
        // Check if dropdown opened
        const dropdown = page.locator('.MuiMenu-paper, .MuiSelect-popper');
        if (await dropdown.isVisible()) {
          await page.screenshot({ 
            path: 'tests/screenshots/05-channel-dropdown-open.png',
            fullPage: true 
          });
          console.log('✓ Channel dropdown screenshot captured');
          
          // Count options
          const options = await page.locator('.MuiMenuItem-root').count();
          console.log(`Found ${options} dropdown options`);
          
          // Try to select a specific channel if available
          if (options > 1) {
            const secondOption = page.locator('.MuiMenuItem-root').nth(1);
            const optionText = await secondOption.innerText();
            console.log(`Selecting channel: ${optionText}`);
            
            await secondOption.click();
            await page.waitForTimeout(2000);
            
            // Take screenshot after selection
            await page.screenshot({ 
              path: 'tests/screenshots/06-channel-selected.png',
              fullPage: true 
            });
            console.log('✓ Channel selected screenshot captured');
            
            // Check for channel alert
            const alert = page.locator('.MuiAlert-root:has-text("Showing program guide for")');
            if (await alert.isVisible()) {
              console.log('✓ Channel info alert is displayed');
            }
          }
        } else {
          console.log('⚠ Dropdown did not open, trying alternative selectors...');
          await page.keyboard.press('Escape');
        }
        
      } else {
        console.log('⚠ Channel selector not found with data-testid, trying alternative selectors...');
        
        // Try to find selector by other means
        const selectors = [
          'select',
          '.MuiSelect-root',
          '[role="button"]:has-text("Channel")',
          'input[placeholder*="channel"]'
        ];
        
        for (const selector of selectors) {
          const element = page.locator(selector);
          if (await element.isVisible()) {
            console.log(`Found potential selector: ${selector}`);
            break;
          }
        }
      }
      
    } else {
      console.log('⚠ Program Guide tab not found');
    }
    
    // Test mobile view
    console.log('Testing mobile viewport...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: 'tests/screenshots/07-mobile-view.png',
      fullPage: true 
    });
    console.log('✓ Mobile view screenshot captured');
    
    // Test tablet view
    console.log('Testing tablet viewport...');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: 'tests/screenshots/08-tablet-view.png',
      fullPage: true 
    });
    console.log('✓ Tablet view screenshot captured');
    
    // Reset to desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    
  } catch (error) {
    console.error('Error during screenshot capture:', error);
    
    // Take error screenshot
    await page.screenshot({ 
      path: 'tests/screenshots/error-state.png',
      fullPage: true 
    });
  } finally {
    await browser.close();
    console.log('Browser closed. Screenshot capture complete!');
  }
}

// Run the screenshot capture
captureEPGScreenshots().catch(console.error);