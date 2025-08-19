// Quick manual test to verify video player fixes work
const { chromium } = require('playwright');

async function testVideoPlayer() {
  console.log('Starting video player test...');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('infinite') || msg.text().includes('Using proxy URL')) {
      console.log(`CONSOLE ${msg.type()}: ${msg.text()}`);
    }
  });

  try {
    console.log('Navigating to application...');
    await page.goto('http://localhost:8080');
    
    console.log('Waiting for page to load...');
    await page.waitForLoadState('networkidle');
    
    console.log('Taking screenshot of main page...');
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/main-page.png', fullPage: true });
    
    // Navigate to streams page
    console.log('Navigating to streams page...');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    console.log('Taking screenshot of streams page...');
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/streams-page.png', fullPage: true });

    // Look for stream preview buttons
    const previewButtons = await page.locator('[data-testid="preview-stream-button"]');
    const previewCount = await previewButtons.count();
    
    if (previewCount > 0) {
      console.log(`Found ${previewCount} stream preview buttons`);
      
      // Click first preview button
      console.log('Clicking first stream preview button...');
      await previewButtons.first().click();
      
      // Wait for video player dialog
      console.log('Waiting for video player dialog...');
      await page.waitForSelector('[data-testid="video-player-dialog"]', { timeout: 10000 });
      
      console.log('Taking screenshot of video player dialog...');
      await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/video-player-dialog.png', fullPage: true });
      
      // Wait a few seconds to see if infinite loops occur
      console.log('Waiting 5 seconds to monitor for infinite loops...');
      await page.waitForTimeout(5000);
      
      console.log('Final screenshot after waiting...');
      await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/video-player-final.png', fullPage: true });
      
    } else {
      console.log('No stream preview buttons found');
    }

  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('Video player test completed');
  }
}

testVideoPlayer();