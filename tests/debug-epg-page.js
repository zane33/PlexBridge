const { chromium } = require('playwright');

async function debugEPGPage() {
  console.log('Debugging EPG page structure...');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 2000
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate and take screenshot
    await page.goto('http://localhost:8080');
    await page.screenshot({ path: 'tests/screenshots/debug-01-homepage.png', fullPage: true });
    
    // Navigate to EPG
    await page.click('[data-testid="nav-epg"]');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/screenshots/debug-02-epg-page.png', fullPage: true });
    
    // Check available tabs
    const tabs = await page.locator('button[role="tab"]').allInnerTexts();
    console.log('Available tabs:', tabs);
    
    // Click Program Guide tab
    const programGuideTab = page.locator('button[role="tab"]:has-text("Program Guide")');
    await programGuideTab.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/screenshots/debug-03-program-guide-tab.png', fullPage: true });
    
    // List all form controls and selects
    const formControls = await page.locator('.MuiFormControl-root').count();
    console.log(`Found ${formControls} form controls`);
    
    const selects = await page.locator('.MuiSelect-root').count();
    console.log(`Found ${selects} select elements`);
    
    // Check for any select with "Channel" in the label
    const channelSelects = await page.locator('.MuiFormControl-root:has(label:text("Channel"))').count();
    console.log(`Found ${channelSelects} channel selects`);
    
    // Get all text content to see what's on the page
    const pageText = await page.locator('body').innerText();
    console.log('Page contains "Channel":', pageText.includes('Channel'));
    console.log('Page contains "Program Guide":', pageText.includes('Program Guide'));
    
    // Look for any data-testid attributes
    const testIds = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid]');
      return Array.from(elements).map(el => el.getAttribute('data-testid'));
    });
    console.log('Found data-testids:', testIds);
    
    // Take a final screenshot
    await page.screenshot({ path: 'tests/screenshots/debug-04-final-state.png', fullPage: true });
    
    console.log('Debug complete!');
    
  } catch (error) {
    console.error('Debug error:', error);
    await page.screenshot({ path: 'tests/screenshots/debug-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

debugEPGPage().catch(console.error);