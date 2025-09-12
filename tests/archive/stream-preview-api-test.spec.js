const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Functionality (API-based)', () => {
  test('should create stream via API and test preview functionality', async ({ page, request }) => {
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

    // Step 1: First check what channels exist
    console.log('Step 1: Checking existing channels via API');
    const channelsResponse = await request.get('http://localhost:8080/api/channels');
    const channels = await channelsResponse.json();
    console.log(`Found ${channels.length} channels:`, channels);
    
    let channelId = null;
    if (channels.length > 0) {
      channelId = channels[0].id;
      console.log(`Using existing channel ID: ${channelId}`);
    } else {
      // Create a channel first
      console.log('Creating a test channel via API');
      const createChannelResponse = await request.post('http://localhost:8080/api/channels', {
        data: {
          name: 'Test Channel',
          number: 101,
          enabled: true
        }
      });
      const newChannel = await createChannelResponse.json();
      channelId = newChannel.id;
      console.log(`Created channel with ID: ${channelId}`);
    }

    // Step 2: Create a stream via API to bypass the UI form issues
    console.log('Step 2: Creating test stream via API');
    const createStreamResponse = await request.post('http://localhost:8080/api/streams', {
      data: {
        name: 'Test HLS Stream',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        type: 'hls',
        channelId: channelId,
        enabled: true
      }
    });
    
    expect(createStreamResponse.status()).toBe(201);
    const newStream = await createStreamResponse.json();
    console.log('Created stream:', newStream);

    // Step 3: Navigate to the application and streams page
    console.log('Step 3: Navigating to streams page');
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of homepage
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/api-01-homepage.png',
      fullPage: true 
    });

    // Navigate to streams page
    const isMobileView = await page.locator('[data-testid="mobile-menu-button"]').isVisible();
    
    if (isMobileView) {
      await page.click('[data-testid="mobile-menu-button"]');
      await page.waitForTimeout(500);
    }
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of streams page
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/api-02-streams-page.png',
      fullPage: true 
    });

    // Step 4: Find the created stream in the table
    console.log('Step 4: Looking for the created stream in the table');
    const streamRow = page.locator('table tbody tr:has-text("Test HLS Stream")');
    await expect(streamRow).toBeVisible({ timeout: 10000 });
    
    // Take screenshot showing the stream in the list
    await page.screenshot({ 
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/api-03-stream-in-list.png',
      fullPage: true 
    });

    // Step 5: Look for any preview/test buttons in the stream row
    console.log('Step 5: Looking for preview/test buttons');
    
    // Try multiple possible selectors for preview/test buttons
    const buttonSelectors = [
      '[data-testid="preview-stream-button"]',
      '[data-testid="test-stream-button"]',
      'button:has-text("Preview")',
      'button:has-text("Test")',
      'button[title*="preview" i]',
      'button[aria-label*="preview" i]',
      'button[title*="test" i]',
      'button[aria-label*="test" i]',
      '.MuiIconButton-root:has([data-testid="PlayArrowIcon"])',
      '.MuiIconButton-root:has(svg[data-testid="PlayArrowIcon"])',
      'button:has(svg)',
      '.MuiIconButton-root'
    ];
    
    let previewButton = null;
    let foundSelector = null;
    
    for (const selector of buttonSelectors) {
      const button = streamRow.locator(selector);
      if (await button.isVisible()) {
        previewButton = button;
        foundSelector = selector;
        console.log(`Found button with selector: ${selector}`);
        break;
      }
    }
    
    if (previewButton) {
      console.log(`Step 6: Clicking preview button found with selector: ${foundSelector}`);
      
      // Clear previous requests/responses for cleaner monitoring
      requests.length = 0;
      responses.length = 0;
      
      await previewButton.first().click();
      
      // Wait a bit for any requests to be made
      await page.waitForTimeout(3000);
      
      // Take screenshot after clicking preview
      await page.screenshot({ 
        path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/api-04-after-preview-click.png',
        fullPage: true 
      });
      
      // Check if a video player or preview dialog appeared
      const videoElements = [
        'video',
        '[data-testid="video-player"]',
        '.video-js',
        '[data-testid="preview-dialog"]',
        '.MuiDialog-root:has(video)',
        '.MuiDialog-root:has([data-testid="video-player"])',
        '.video-container',
        'iframe[src*="stream"]'
      ];
      
      let foundVideo = false;
      for (const selector of videoElements) {
        const element = page.locator(selector);
        if (await element.isVisible()) {
          console.log(`Found video element: ${selector}`);
          foundVideo = true;
          await page.screenshot({ 
            path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/api-05-video-player.png',
            fullPage: true 
          });
          break;
        }
      }
      
      if (!foundVideo) {
        console.log('No video player found after clicking preview');
      }
      
      // Wait a bit more to see if video loads
      await page.waitForTimeout(3000);
      
      // Take final screenshot
      await page.screenshot({ 
        path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/api-06-final-state.png',
        fullPage: true 
      });
      
    } else {
      console.log('Step 6: No preview button found in stream row');
      
      // Take screenshot of the row to see what buttons are available
      await page.screenshot({ 
        path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/api-04-no-preview-button.png',
        fullPage: true 
      });
      
      // Log all buttons in the row for debugging
      const allButtons = streamRow.locator('button');
      const buttonCount = await allButtons.count();
      console.log(`Found ${buttonCount} buttons in the stream row`);
      
      for (let i = 0; i < buttonCount; i++) {
        const button = allButtons.nth(i);
        const buttonText = await button.textContent();
        const buttonTitle = await button.getAttribute('title');
        const buttonAriaLabel = await button.getAttribute('aria-label');
        console.log(`Button ${i}: text="${buttonText}" title="${buttonTitle}" aria-label="${buttonAriaLabel}"`);
      }
    }

    // Step 7: Test direct stream access
    console.log('Step 7: Testing direct stream access');
    
    // Try to access the stream directly
    const streamId = newStream.id;
    const streamUrl = `http://localhost:8080/stream/${streamId}`;
    
    console.log(`Testing direct stream access: ${streamUrl}`);
    const streamResponse = await request.get(streamUrl);
    console.log(`Direct stream access status: ${streamResponse.status()}`);
    
    if (streamResponse.status() === 200) {
      console.log('Direct stream access successful');
    } else {
      console.log('Direct stream access failed');
    }

    // Step 8: Summary of network requests and responses
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

    // Clean up: Delete the test stream
    console.log('\nStep 9: Cleaning up test stream');
    const deleteResponse = await request.delete(`http://localhost:8080/api/streams/${streamId}`);
    console.log(`Delete stream response: ${deleteResponse.status()}`);

    // Return the collected data for analysis
    return {
      streamCreated: newStream,
      previewButtonFound: previewButton !== null,
      foundButtonSelector: foundSelector,
      directStreamAccess: streamResponse.status() === 200,
      requests: requests.filter(req => 
        req.url.includes('stream') || req.url.includes('api') || req.url.includes('preview')
      ),
      responses: responses.filter(res => 
        res.url.includes('stream') || res.url.includes('api') || res.url.includes('preview')
      )
    };
  });
});