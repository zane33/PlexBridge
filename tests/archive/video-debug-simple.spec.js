const { test, expect } = require('@playwright/test');

test('Debug video player initialization', async ({ page }) => {
  console.log('=== VIDEO PLAYER DEBUG TEST ===');
  
  // Capture all console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const message = `[${msg.type().toUpperCase()}] ${msg.text()}`;
    console.log(message);
    consoleMessages.push(message);
  });
  
  // Navigate to application
  await page.goto('http://localhost:8080');
  await page.waitForSelector('[data-testid="nav-streams"]');
  
  // Navigate to streams
  await page.click('[data-testid="nav-streams"]');
  await page.waitForSelector('table tbody tr');
  
  // Click preview button
  console.log('=== CLICKING PREVIEW BUTTON ===');
  await page.click('[data-testid="preview-stream-button"]');
  
  // Wait for dialog
  await page.waitForSelector('.MuiDialog-root', { timeout: 10000 });
  
  // Wait for video element
  await page.waitForSelector('video', { timeout: 5000 });
  
  // Wait a bit for initialization
  await page.waitForTimeout(3000);
  
  // Check video properties
  const videoProps = await page.locator('video').first().evaluate(el => ({
    src: el.src,
    hasSource: el.src !== '',
    readyState: el.readyState
  }));
  
  console.log('=== FINAL VIDEO STATE ===');
  console.log(JSON.stringify(videoProps, null, 2));
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/video-debug.png', fullPage: true });
  
  console.log('=== ALL CONSOLE MESSAGES ===');
  consoleMessages.forEach(msg => console.log(msg));
});