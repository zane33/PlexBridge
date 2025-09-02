const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('1. Opening PlexBridge...');
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);
  
  console.log('2. Navigating to EPG Manager...');
  await page.click('[data-testid="nav-epg"]');
  await page.waitForTimeout(2000);
  
  console.log('3. Opening Add Source dialog...');
  await page.click('button:has-text("Add Source")');
  await page.waitForTimeout(1000);
  
  console.log('4. Filling in EPG source details...');
  await page.fill('input[placeholder="My XMLTV Source"]', 'Sports Channel EPG');
  await page.fill('input[placeholder="https://example.com/epg.xml"]', 'https://raw.githubusercontent.com/iptv-org/epg/master/sites/directv.com/directv.com_us.channels.xml');
  
  console.log('5. Selecting Sports category...');
  // Click on the Plex Category dropdown
  await page.click('text=Plex Category');
  await page.waitForTimeout(500);
  
  // Select Sports from the dropdown
  await page.click('li[data-value="Sports"]');
  await page.waitForTimeout(500);
  
  console.log('6. Taking screenshot of filled form...');
  await page.screenshot({ path: 'epg-category-form.png', fullPage: true });
  
  console.log('7. Saving the EPG source...');
  await page.click('button:has-text("Save Source")');
  await page.waitForTimeout(3000);
  
  console.log('8. Taking screenshot of EPG sources table...');
  await page.screenshot({ path: 'epg-sources-table.png', fullPage: true });
  
  console.log('Test completed! Check epg-category-form.png and epg-sources-table.png');
  
  await browser.close();
})();