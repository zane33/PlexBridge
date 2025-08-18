const { test, expect } = require('@playwright/test');

test.describe('UI Exploration and Analysis', () => {
  test('Explore the actual UI structure', async ({ page }) => {
    // Set longer timeout
    test.setTimeout(60000);
    
    console.log('Starting UI exploration...');
    
    // Navigate to homepage
    await page.goto('http://localhost:8080/');
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ path: 'test-results/ui-01-homepage.png', fullPage: true });
    
    // Log the page title and main content
    const title = await page.title();
    console.log('Page title:', title);
    
    // Check what's actually on the page
    const bodyText = await page.locator('body').textContent();
    console.log('Body text length:', bodyText.length);
    console.log('Body preview:', bodyText.substring(0, 500));
    
    // Look for any h1, h2, h3 elements
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').allTextContents();
    console.log('Headings found:', headings);
    
    // Look for navigation elements
    const navElements = await page.locator('nav, [role="navigation"], .MuiDrawer-root, .MuiAppBar-root').count();
    console.log('Navigation elements count:', navElements);
    
    // Look for any buttons
    const buttons = await page.locator('button').count();
    console.log('Buttons found:', buttons);
    
    // Look for links that might be navigation
    const links = await page.locator('a').count();
    console.log('Links found:', links);
    
    // Check for any React error boundaries or error messages
    const errorMessages = await page.locator('text="Error"').count();
    console.log('Error messages:', errorMessages);
    
    // Look for common Material-UI components
    const muiComponents = await page.locator('[class*="Mui"]').count();
    console.log('Material-UI components:', muiComponents);
    
    // Try to find any navigation-like text
    const navTexts = ['Dashboard', 'Streams', 'Channels', 'Settings', 'Home'];
    for (const text of navTexts) {
      const found = await page.locator(`text="${text}"`).count();
      console.log(`Navigation text "${text}":`, found);
    }
    
    // Look for any data-testid attributes
    const testIds = await page.locator('[data-testid]').count();
    console.log('Elements with data-testid:', testIds);
    
    if (testIds > 0) {
      const testIdElements = await page.locator('[data-testid]').all();
      for (let i = 0; i < Math.min(testIdElements.length, 10); i++) {
        const testId = await testIdElements[i].getAttribute('data-testid');
        console.log(`Test ID found: ${testId}`);
      }
    }
    
    // Try to navigate to streams if possible
    let navigatedToStreams = false;
    
    // Try different navigation strategies
    const streamSelectors = [
      'text="Streams"',
      'a[href*="stream"]',
      'button:has-text("Stream")',
      '[data-testid*="stream"]',
      '.MuiListItem-root:has-text("Stream")'
    ];
    
    for (const selector of streamSelectors) {
      try {
        const element = page.locator(selector);
        const count = await element.count();
        console.log(`Selector "${selector}" found ${count} elements`);
        
        if (count > 0 && !navigatedToStreams) {
          await element.first().click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: 'test-results/ui-02-after-click.png', fullPage: true });
          
          const currentUrl = page.url();
          console.log('Current URL after click:', currentUrl);
          
          if (currentUrl.includes('stream') || currentUrl !== 'http://localhost:8080/') {
            navigatedToStreams = true;
            console.log('Successfully navigated using:', selector);
            break;
          }
        }
      } catch (e) {
        console.log(`Selector "${selector}" failed:`, e.message);
      }
    }
    
    // If we couldn't navigate, try mobile menu
    if (!navigatedToStreams) {
      try {
        const mobileMenuButton = page.locator('[aria-label="menu"], .MuiIconButton-root');
        const menuCount = await mobileMenuButton.count();
        console.log('Mobile menu buttons found:', menuCount);
        
        if (menuCount > 0) {
          await mobileMenuButton.first().click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: 'test-results/ui-03-mobile-menu.png', fullPage: true });
          
          // Try to find streams in mobile menu
          const mobileStreamLink = page.locator('text="Streams"');
          const mobileCount = await mobileStreamLink.count();
          console.log('Mobile stream links:', mobileCount);
          
          if (mobileCount > 0) {
            await mobileStreamLink.first().click();
            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'test-results/ui-04-mobile-streams.png', fullPage: true });
            navigatedToStreams = true;
          }
        }
      } catch (e) {
        console.log('Mobile navigation failed:', e.message);
      }
    }
    
    // Final analysis of current page
    const finalUrl = page.url();
    const finalBodyText = await page.locator('body').textContent();
    
    console.log('Final URL:', finalUrl);
    console.log('Navigation successful:', navigatedToStreams);
    console.log('Final page text preview:', finalBodyText.substring(0, 300));
    
    // Look for stream-related content
    const streamContent = [
      'Add Stream',
      'Import',
      'M3U',
      'Preview',
      'Stream Manager',
      'URL'
    ];
    
    for (const content of streamContent) {
      const found = await page.locator(`text="${content}"`).count();
      console.log(`Stream content "${content}":`, found);
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'test-results/ui-05-final-analysis.png', fullPage: true });
  });
});