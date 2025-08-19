const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Functionality', () => {
  test('should add stream and test preview functionality', async ({ page }) => {
    // Enable request interception to monitor network requests
    const requests = [];
    const responses = [];
    
    page.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData()
      });
      console.log(`REQUEST: ${request.method()} ${request.url()}`);
    });
    
    page.on('response', response => {
      responses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText()
      });
      console.log(`RESPONSE: ${response.status()} ${response.url()}`);
    });
    
    // Listen for console logs
    page.on('console', msg => {
      console.log(`CONSOLE ${msg.type()}: ${msg.text()}`);
    });
    
    // Listen for page errors
    page.on('pageerror', error => {
      console.log(`PAGE ERROR: ${error.message}`);
    });

    // Step 1: Navigate to the application
    console.log('Step 1: Navigating to http://localhost:8080');
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of homepage
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/01-homepage.png',
      fullPage: true 
    });

    // Step 2: First create a channel if none exist (streams need a channel)
    console.log('Step 2a: Checking if we need to create a channel first');
    
    // Check if we need to use mobile menu
    const isMobileView = await page.locator('[data-testid="mobile-menu-button"]').isVisible();
    
    if (isMobileView) {
      await page.click('[data-testid="mobile-menu-button"]');
      await page.waitForTimeout(500);
    }
    
    await page.click('[data-testid="nav-channels"]');
    await page.waitForLoadState('networkidle');
    
    // Check if there are any channels in the table
    const channelTable = page.locator('table tbody tr');
    const channelCount = await channelTable.count();
    
    if (channelCount === 0) {
      console.log('No channels found, creating a test channel');
      await page.click('[data-testid="add-channel-button"]');
      await page.waitForSelector('[data-testid="channel-dialog"], .MuiDialog-root', { state: 'visible' });
      
      // Fill channel details
      await page.getByRole('textbox', { name: /channel name/i }).fill('Test Channel');
      await page.getByRole('textbox', { name: /channel number/i }).fill('101');
      
      // Save the channel
      await page.getByRole('button', { name: /save/i }).click();
      await page.waitForLoadState('networkidle');
      console.log('Created test channel');
    } else {
      console.log(`Found ${channelCount} existing channels`);
    }
    
    // Step 2b: Navigate to Streams section
    console.log('Step 2b: Navigating to Streams section');
    
    if (isMobileView) {
      await page.click('[data-testid="mobile-menu-button"]');
      await page.waitForTimeout(500);
    }
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of streams page
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/02-streams-page.png',
      fullPage: true 
    });

    // Step 3: Add a new test stream
    console.log('Step 3: Adding new test stream');
    await page.click('[data-testid="add-stream-button"]');
    await page.waitForSelector('[data-testid="stream-dialog"]', { state: 'visible' });
    
    // Take screenshot of add stream dialog
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/03-add-stream-dialog.png',
      fullPage: true 
    });

    // Fill in stream details using the role-based selectors identified by Playwright
    await page.getByRole('textbox', { name: 'Stream Name *' })
      .fill('Test HLS Stream');
      
    await page.getByRole('textbox', { name: 'Stream URL *' })
      .fill('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
    
    // Select a channel from the dropdown - it's required
    console.log('Step 3b: Selecting a channel');
    
    // First try to find the channel combobox using a more specific approach
    const channelCombobox = page.locator('[data-testid="stream-dialog"]')
      .locator('div[role="combobox"]')
      .filter({ hasNotText: 'HLS' }); // Exclude the type dropdown
    
    try {
      await channelCombobox.click({ timeout: 5000 });
      console.log('Clicked channel dropdown');
      
      // Wait for dropdown menu to appear
      await page.waitForSelector('[role="presentation"] ul[role="listbox"], .MuiMenu-root', { timeout: 5000 });
      
      // Select the first option using force click to bypass backdrop issues
      const firstOption = page.locator('[role="presentation"] ul[role="listbox"] li, .MuiMenu-root li').first();
      await firstOption.click({ force: true, timeout: 5000 });
      console.log('Selected first available channel');
      
      // Wait a moment for the selection to register
      await page.waitForTimeout(1000);
    } catch (error) {
      console.log('Channel selection failed:', error.message);
      console.log('Trying alternative approach...');
      
      // Alternative: use keyboard navigation
      await channelCombobox.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      console.log('Used keyboard to select channel');
    }
    
    // Type is already set to HLS by default, but let's check if there's a test button
    const testButton = page.locator('[data-testid="stream-dialog"]')
      .locator('button:has-text("Test"), [data-testid="test-stream-button"]');
    if (await testButton.isVisible()) {
      console.log('Test button found in dialog');
    }
    
    // Take screenshot before saving
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/04-filled-stream-form.png',
      fullPage: true 
    });

    // Step 4: Save the stream
    console.log('Step 4: Saving the stream');
    await page.locator('[data-testid="stream-dialog"]').getByRole('button', { name: 'Save Stream' }).click();
    
    // Wait for dialog to close and page to update
    await page.waitForSelector('[data-testid="stream-dialog"]', { state: 'hidden' });
    await page.waitForLoadState('networkidle');
    
    // Take screenshot after saving
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/05-after-save.png',
      fullPage: true 
    });

    // Step 5: Verify stream was saved and find preview button
    console.log('Step 5: Looking for the saved stream and preview button');
    
    // Look for the stream in the table
    const streamRow = page.locator('table tbody tr:has-text("Test HLS Stream")');
    await expect(streamRow).toBeVisible({ timeout: 10000 });
    
    // Take screenshot showing the stream in the list
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/06-stream-in-list.png',
      fullPage: true 
    });

    // Step 6: Try to preview the stream
    console.log('Step 6: Attempting to preview the stream');
    
    // Look for preview button in the stream row - try multiple selectors
    const previewButton = streamRow.locator('[data-testid="preview-stream-button"], button:has-text("Preview"), button:has-text("Test"), button[title*="preview" i], .MuiIconButton-root:has([data-testid="PlayArrowIcon"])');
    
    if (await previewButton.isVisible()) {
      console.log('Preview button found, clicking it...');
      
      // Clear previous requests/responses for cleaner monitoring
      requests.length = 0;
      responses.length = 0;
      
      await previewButton.click();
      
      // Wait a bit for any requests to be made
      await page.waitForTimeout(2000);
      
      // Take screenshot after clicking preview
      await page.screenshot({ 
        path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/07-after-preview-click.png',
        fullPage: true 
      });
      
      // Check if a video player or preview dialog appeared
      const videoPlayer = page.locator('video, [data-testid="video-player"], .video-js');
      const previewDialog = page.locator('[data-testid="preview-dialog"], .MuiDialog-root:has(video)');
      
      if (await videoPlayer.isVisible()) {
        console.log('Video player is visible');
        await page.screenshot({ 
          path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/08-video-player.png',
          fullPage: true 
        });
      }
      
      if (await previewDialog.isVisible()) {
        console.log('Preview dialog is visible');
        await page.screenshot({ 
          path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/08-preview-dialog.png',
          fullPage: true 
        });
      }
      
      // Wait a bit more to see if video loads
      await page.waitForTimeout(3000);
      
      // Take final screenshot
      await page.screenshot({ 
        path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/09-final-state.png',
        fullPage: true 
      });
      
    } else {
      console.log('Preview button not found in stream row');
      
      // Look for alternative preview buttons
      const alternativeButtons = [
        '[data-testid="test-stream-button"]',
        'button:has-text("Preview")',
        'button:has-text("Test")',
        'button[title*="preview" i]',
        'button[aria-label*="preview" i]'
      ];
      
      for (const selector of alternativeButtons) {
        const button = streamRow.locator(selector);
        if (await button.isVisible()) {
          console.log(`Found alternative preview button: ${selector}`);
          await button.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
      
      await page.screenshot({ 
        path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/07-no-preview-button.png',
        fullPage: true 
      });
    }

    // Step 7: Summary of network requests and responses
    console.log('\n=== NETWORK REQUEST SUMMARY ===');
    console.log(`Total requests made: ${requests.length}`);
    console.log(`Total responses received: ${responses.length}`);
    
    console.log('\n=== RELEVANT REQUESTS ===');
    requests.forEach((req, index) => {
      if (req.url.includes('stream') || req.url.includes('api') || req.url.includes('preview')) {
        console.log(`${index + 1}. ${req.method} ${req.url}`);
        if (req.postData) {
          console.log(`   Data: ${req.postData}`);
        }
      }
    });
    
    console.log('\n=== RELEVANT RESPONSES ===');
    responses.forEach((res, index) => {
      if (res.url.includes('stream') || res.url.includes('api') || res.url.includes('preview')) {
        console.log(`${index + 1}. ${res.status} ${res.statusText} - ${res.url}`);
      }
    });

    // Return the collected data for analysis
    return {
      requests: requests.filter(req => 
        req.url.includes('stream') || req.url.includes('api') || req.url.includes('preview')
      ),
      responses: responses.filter(res => 
        res.url.includes('stream') || res.url.includes('api') || res.url.includes('preview')
      )
    };
  });
});