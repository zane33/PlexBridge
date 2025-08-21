const { chromium } = require('playwright');

async function testEPGChannelSelector() {
  console.log('Testing EPG Channel Selector...');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000, // Slow down for observation
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate with extended timeout
    console.log('Navigating to PlexBridge...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: 'tests/screenshots/01-initial-load.png', fullPage: true });
    
    // Navigate to EPG Manager
    console.log('Clicking EPG nav...');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForTimeout(3000); // Wait for page load
    await page.screenshot({ path: 'tests/screenshots/02-epg-manager.png', fullPage: true });
    
    // Click Program Guide tab and wait for content
    console.log('Clicking Program Guide tab...');
    const programGuideTab = page.locator('button[role="tab"]:has-text("Program Guide")');
    await programGuideTab.click();
    await page.waitForTimeout(5000); // Extended wait for React rendering
    await page.screenshot({ path: 'tests/screenshots/03-program-guide-loading.png', fullPage: true });
    
    // Wait for the Program Guide content to be visible
    console.log('Waiting for Program Guide content...');
    await page.waitForSelector('[data-testid="epg-program-guide"]', { timeout: 15000 });
    await page.screenshot({ path: 'tests/screenshots/04-program-guide-loaded.png', fullPage: true });
    
    // Look for the channel selector
    console.log('Looking for channel selector...');
    const channelSelector = page.locator('[data-testid="channel-selector"]');
    
    await page.waitForTimeout(2000); // Additional wait
    const isVisible = await channelSelector.isVisible();
    console.log('Channel selector visible:', isVisible);
    
    if (isVisible) {
      console.log('✓ Channel selector found!');
      
      // Take focused screenshot
      await page.screenshot({ path: 'tests/screenshots/05-channel-selector-found.png', fullPage: true });
      
      // Get the current value
      const currentValue = await channelSelector.inputValue();
      console.log('Current channel selector value:', currentValue);
      
      // Test clicking to open dropdown
      console.log('Opening channel selector dropdown...');
      await channelSelector.click();
      await page.waitForTimeout(2000);
      
      // Look for dropdown menu
      const dropdown = page.locator('.MuiMenu-paper');
      const dropdownVisible = await dropdown.isVisible();
      console.log('Dropdown visible:', dropdownVisible);
      
      if (dropdownVisible) {
        await page.screenshot({ path: 'tests/screenshots/06-dropdown-open.png', fullPage: true });
        
        // Count menu items
        const menuItems = await page.locator('.MuiMenuItem-root').count();
        console.log(`Found ${menuItems} menu items`);
        
        // Try to select a channel if there are options
        if (menuItems > 1) {
          console.log('Selecting second menu item...');
          await page.locator('.MuiMenuItem-root').nth(1).click();
          await page.waitForTimeout(3000);
          
          await page.screenshot({ path: 'tests/screenshots/07-channel-selected.png', fullPage: true });
          
          // Check for channel alert
          const alert = page.locator('.MuiAlert-root:has-text("Showing program guide for")');
          const alertVisible = await alert.isVisible();
          console.log('Channel info alert visible:', alertVisible);
          
          if (alertVisible) {
            const alertText = await alert.innerText();
            console.log('Alert text:', alertText);
          }
        }
      } else {
        console.log('⚠ Dropdown did not open');
      }
      
    } else {
      console.log('❌ Channel selector not found');
      
      // Debug: Look for any select elements
      const selects = await page.locator('select, .MuiSelect-root, [role="combobox"]').count();
      console.log(`Found ${selects} select-like elements`);
      
      // Check if Program Guide content exists
      const programGuideExists = await page.locator('[data-testid="epg-program-guide"]').isVisible();
      console.log('Program Guide container exists:', programGuideExists);
    }
    
    // Test mobile view
    console.log('Testing mobile view...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/screenshots/08-mobile-view.png', fullPage: true });
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    console.log('Test completed!');
    
  } catch (error) {
    console.error('Error during test:', error);
    await page.screenshot({ path: 'tests/screenshots/error-state.png', fullPage: true });
  } finally {
    await page.close();
    await browser.close();
  }
}

testEPGChannelSelector().catch(console.error);