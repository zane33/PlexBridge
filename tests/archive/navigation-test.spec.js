const { test, expect } = require('@playwright/test');

test.describe('Navigation Test', () => {
  test('should identify navigation elements', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Take screenshot to see what's there
    await page.screenshot({ path: 'test-results/navigation-debug.png' });
    
    // Get all navigation links
    const navLinks = await page.locator('nav a, [role="navigation"] a, a').all();
    console.log('Found navigation links:', navLinks.length);
    
    // Get text content of all links
    for (let i = 0; i < navLinks.length; i++) {
      const text = await navLinks[i].textContent();
      const href = await navLinks[i].getAttribute('href');
      console.log(`Link ${i}: "${text}" href="${href}"`);
    }
    
    // Look for any button or link containing "stream" or "channel"
    const streamElements = await page.locator('text=/stream/i').all();
    const channelElements = await page.locator('text=/channel/i').all();
    
    console.log('Stream elements:', streamElements.length);
    console.log('Channel elements:', channelElements.length);
    
    // Check if we can find typical sidebar or navigation
    const sidebar = page.locator('[role="navigation"], nav, .sidebar, .menu');
    if (await sidebar.first().isVisible()) {
      console.log('Found navigation container');
      const sidebarText = await sidebar.first().textContent();
      console.log('Navigation text:', sidebarText);
    }
  });
});