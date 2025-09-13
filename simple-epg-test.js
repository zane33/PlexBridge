const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('Opening PlexBridge...');
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(3000);
  
  console.log('Taking homepage screenshot...');
  await page.screenshot({ path: 'homepage.png', fullPage: true });
  
  console.log('Navigating to EPG Manager...');
  await page.click('text=EPG');
  await page.waitForTimeout(2000);
  
  console.log('Taking EPG page screenshot...');
  await page.screenshot({ path: 'epg-manager.png', fullPage: true });
  
  console.log('Opening Add Source dialog...');
  await page.click('text=Add Source');
  await page.waitForTimeout(2000);
  
  console.log('Taking dialog screenshot...');
  await page.screenshot({ path: 'epg-add-dialog.png', fullPage: true });
  
  console.log('Screenshots saved: homepage.png, epg-manager.png, epg-add-dialog.png');
  console.log('Check these files to verify the category dropdown is present');
  
  await browser.close();
})();