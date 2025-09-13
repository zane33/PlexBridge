const { chromium } = require('playwright');

(async () => {
  console.log('\n=== Manual Settings Test ===');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    console.log('\n1. Checking API first...');
    
    // Check API response
    const apiResponse = await page.request.get('http://localhost:3000/api/settings');
    const apiData = await apiResponse.json();
    console.log('Backend maxConcurrentStreams:', apiData.streaming?.maxConcurrentStreams);
    
    console.log('\n2. Loading frontend...');
    
    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of dashboard
    await page.screenshot({ path: 'manual-test-dashboard.png', fullPage: true });
    console.log('✓ Screenshot saved: manual-test-dashboard.png');
    
    // Check dashboard capacity
    const capacityText = await page.locator('text=/of \\d+ max capacity/').textContent();
    console.log('Dashboard shows:', capacityText);
    
    console.log('\n3. Checking settings page...');
    
    // Navigate to settings
    await page.click('[data-testid="nav-settings"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Give more time for settings to load
    
    await page.screenshot({ path: 'manual-test-settings.png', fullPage: true });
    console.log('✓ Screenshot saved: manual-test-settings.png');
    
    // Check streaming chip - should now show "5 max streams"
    try {
      const streamingChips = await page.locator('text=/\\d+ max streams/').all();
      console.log('Found', streamingChips.length, 'streaming chips');
      
      for (let i = 0; i < streamingChips.length; i++) {
        const chipText = await streamingChips[i].textContent();
        console.log(`Chip ${i + 1}:`, chipText);
      }
      
      const streamingChip = await page.locator('text=Streaming').locator('..').locator('text=/\\d+ max streams/').textContent();
      console.log('Settings streaming chip shows:', streamingChip);
      
      if (streamingChip === '5 max streams') {
        console.log('✅ SUCCESS! Fix is working - frontend shows correct value');
      } else {
        console.log('❌ ISSUE: Frontend still showing incorrect value');
      }
    } catch (error) {
      console.log('Error reading streaming chip:', error.message);
      
      // Try to get all text content for debugging
      const allText = await page.textContent('body');
      const streamingMatches = allText.match(/\d+ max streams/g);
      console.log('All "max streams" text found:', streamingMatches);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    console.log('\n4. Closing browser...');
    await browser.close();
  }
})();