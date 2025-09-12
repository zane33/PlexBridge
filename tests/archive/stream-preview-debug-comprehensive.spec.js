const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Debug - Comprehensive Analysis', () => {
  let streamId, streamName, streamUrl;

  test.beforeAll(async ({ browser }) => {
    // Get test data from API
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.get('http://localhost:8080/api/streams');
    const streams = await response.json();
    
    if (streams.length === 0) {
      throw new Error('No streams available for testing');
    }
    
    // Use the first available stream
    const testStream = streams[0];
    streamId = testStream.id;
    streamName = testStream.name;
    streamUrl = testStream.url;
    
    console.log('Test stream:', { streamId, streamName, streamUrl });
    await context.close();
  });

  test('Complete Stream Preview Debug Flow', async ({ page, browser }) => {
    let logs = [];
    let networkRequests = [];
    let networkResponses = [];
    let consoleMessages = [];
    
    // Capture all console messages
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
      console.log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    // Capture all network requests
    page.on('request', request => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: new Date().toISOString()
      });
      console.log(`[REQUEST] ${request.method()} ${request.url()}`);
    });

    // Capture all network responses
    page.on('response', response => {
      networkResponses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        timestamp: new Date().toISOString()
      });
      console.log(`[RESPONSE] ${response.status()} ${response.url()}`);
    });

    // Capture page errors
    page.on('pageerror', error => {
      logs.push({
        type: 'PAGE_ERROR',
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      console.log(`[PAGE_ERROR] ${error.message}`);
    });

    console.log('\n=== STEP 1: NAVIGATE TO APPLICATION ===');
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/01-homepage.png', fullPage: true });

    console.log('\n=== STEP 2: NAVIGATE TO STREAMS SECTION ===');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    // Take streams page screenshot
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/02-streams-page.png', fullPage: true });

    console.log('\n=== STEP 3: VERIFY STREAM EXISTS ===');
    const streamExists = await page.locator(`table tbody tr:has-text("${streamName}")`).isVisible();
    console.log(`Stream "${streamName}" exists in table: ${streamExists}`);
    
    if (!streamExists) {
      console.log('Available streams in table:');
      const streamRows = await page.locator('table tbody tr').count();
      for (let i = 0; i < streamRows; i++) {
        const rowText = await page.locator('table tbody tr').nth(i).textContent();
        console.log(`  Row ${i}: ${rowText}`);
      }
    }

    console.log('\n=== STEP 4: LOCATE PREVIEW BUTTON ===');
    const streamRow = page.locator(`table tbody tr:has-text("${streamName}")`);
    const previewButton = streamRow.locator('[data-testid="preview-stream-button"]');
    
    const previewButtonExists = await previewButton.isVisible();
    console.log(`Preview button exists: ${previewButtonExists}`);
    
    if (previewButtonExists) {
      const buttonText = await previewButton.getAttribute('aria-label') || await previewButton.textContent();
      console.log(`Preview button text/aria-label: ${buttonText}`);
    }

    // Take screenshot before clicking
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/03-before-preview-click.png', fullPage: true });

    console.log('\n=== STEP 5: CLICK PREVIEW BUTTON ===');
    await previewButton.click();
    
    // Wait for any immediate UI changes
    await page.waitForTimeout(1000);
    
    // Take screenshot after clicking
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/04-after-preview-click.png', fullPage: true });

    console.log('\n=== STEP 6: CHECK FOR VIDEO PLAYER DIALOG ===');
    const playerDialog = page.locator('.MuiDialog-root');
    const playerDialogExists = await playerDialog.isVisible({ timeout: 5000 });
    console.log(`Player dialog visible: ${playerDialogExists}`);

    if (playerDialogExists) {
      console.log('Dialog detected - checking contents...');
      
      // Check dialog title
      const dialogTitle = await page.locator('.MuiDialogTitle-root').textContent();
      console.log(`Dialog title: ${dialogTitle}`);
      
      // Check for video element
      const videoElement = page.locator('video');
      const videoExists = await videoElement.isVisible();
      console.log(`Video element exists: ${videoExists}`);
      
      if (videoExists) {
        const videoSrc = await videoElement.getAttribute('src');
        const videoClass = await videoElement.getAttribute('class');
        console.log(`Video src: ${videoSrc}`);
        console.log(`Video class: ${videoClass}`);
      }
      
      // Check for loading indicator
      const loadingIndicator = page.locator('text="Loading stream..."');
      const isLoading = await loadingIndicator.isVisible();
      console.log(`Loading indicator visible: ${isLoading}`);
      
      // Check for error messages
      const errorAlert = page.locator('.MuiAlert-root');
      const hasError = await errorAlert.isVisible();
      console.log(`Error alert visible: ${hasError}`);
      
      if (hasError) {
        const errorText = await errorAlert.textContent();
        console.log(`Error message: ${errorText}`);
      }
      
      // Take screenshot of player dialog
      await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/05-player-dialog.png', fullPage: true });
      
      // Wait a bit longer to see if anything loads
      console.log('\n=== STEP 7: WAIT FOR PLAYER INITIALIZATION ===');
      await page.waitForTimeout(5000);
      
      // Check again for changes
      const videoSrcAfterWait = await videoElement.getAttribute('src');
      const hasErrorAfterWait = await errorAlert.isVisible();
      console.log(`Video src after wait: ${videoSrcAfterWait}`);
      console.log(`Error alert visible after wait: ${hasErrorAfterWait}`);
      
      if (hasErrorAfterWait) {
        const errorTextAfterWait = await errorAlert.textContent();
        console.log(`Error message after wait: ${errorTextAfterWait}`);
      }
      
      // Take final screenshot
      await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/06-player-final-state.png', fullPage: true });
      
    } else {
      console.log('No player dialog detected - checking for other UI changes...');
      
      // Check if anything else appeared
      const dialogs = await page.locator('.MuiDialog-root').count();
      console.log(`Total dialogs on page: ${dialogs}`);
      
      // Check for any popups or modals
      const popups = await page.locator('[role="dialog"]').count();
      console.log(`Total dialog elements: ${popups}`);
    }

    console.log('\n=== STEP 8: TEST BACKEND ENDPOINT DIRECTLY ===');
    try {
      const previewResponse = await page.request.get(`http://localhost:8080/streams/preview/${streamId}`);
      console.log(`Preview endpoint status: ${previewResponse.status()}`);
      console.log(`Preview endpoint headers:`, previewResponse.headers());
      
      if (previewResponse.status() !== 200) {
        const errorBody = await previewResponse.text();
        console.log(`Preview endpoint error body: ${errorBody}`);
      }
    } catch (error) {
      console.log(`Preview endpoint request failed: ${error.message}`);
    }

    console.log('\n=== STEP 9: TEST STREAM VALIDATION ENDPOINT ===');
    try {
      const validationResponse = await page.request.post('http://localhost:8080/streams/validate', {
        data: {
          url: streamUrl,
          type: 'hls'
        }
      });
      console.log(`Validation endpoint status: ${validationResponse.status()}`);
      const validationBody = await validationResponse.json();
      console.log(`Validation result:`, validationBody);
    } catch (error) {
      console.log(`Validation endpoint request failed: ${error.message}`);
    }

    console.log('\n=== STEP 10: INSPECT DOM FOR VIDEO.JS ELEMENTS ===');
    const videojsElements = await page.locator('.video-js').count();
    console.log(`Video.js elements found: ${videojsElements}`);
    
    const videojsPlayer = await page.locator('[data-vjs-player]').count();
    console.log(`Video.js player elements found: ${videojsPlayer}`);

    console.log('\n=== STEP 11: CHECK JAVASCRIPT ERRORS IN CONSOLE ===');
    const errorMessages = consoleMessages.filter(msg => msg.type === 'error');
    console.log(`Total console errors: ${errorMessages.length}`);
    errorMessages.forEach((msg, index) => {
      console.log(`  Error ${index + 1}: ${msg.text}`);
    });

    console.log('\n=== STEP 12: ANALYZE NETWORK REQUESTS ===');
    const streamRequests = networkRequests.filter(req => 
      req.url.includes('/streams/preview/') || 
      req.url.includes('.m3u8') ||
      req.url.includes('stream')
    );
    console.log(`Stream-related requests: ${streamRequests.length}`);
    streamRequests.forEach((req, index) => {
      console.log(`  Request ${index + 1}: ${req.method} ${req.url}`);
    });

    const streamResponses = networkResponses.filter(res => 
      res.url.includes('/streams/preview/') || 
      res.url.includes('.m3u8') ||
      res.url.includes('stream')
    );
    console.log(`Stream-related responses: ${streamResponses.length}`);
    streamResponses.forEach((res, index) => {
      console.log(`  Response ${index + 1}: ${res.status} ${res.url}`);
    });

    // Generate comprehensive report
    const report = {
      testTimestamp: new Date().toISOString(),
      testStream: { streamId, streamName, streamUrl },
      findings: {
        playerDialogOpened: playerDialogExists,
        videoElementExists: playerDialogExists ? await page.locator('video').isVisible() : false,
        errorMessagesCount: errorMessages.length,
        networkRequestsCount: networkRequests.length,
        streamRequestsCount: streamRequests.length,
        streamResponsesCount: streamResponses.length
      },
      consoleErrors: errorMessages,
      networkRequests: streamRequests,
      networkResponses: streamResponses,
      screenshots: [
        '01-homepage.png',
        '02-streams-page.png', 
        '03-before-preview-click.png',
        '04-after-preview-click.png',
        '05-player-dialog.png',
        '06-player-final-state.png'
      ]
    };

    // Write detailed report
    await page.evaluate((reportData) => {
      console.log('\n=== COMPREHENSIVE DEBUG REPORT ===');
      console.log(JSON.stringify(reportData, null, 2));
    }, report);

    // The test should pass if we can at least click the button and something happens
    expect(previewButtonExists).toBe(true);
  });

  test('Backend Stream Preview Endpoint Test', async ({ request }) => {
    console.log('\n=== BACKEND ENDPOINT DIRECT TEST ===');
    
    try {
      const response = await request.get(`http://localhost:8080/streams/preview/${streamId}`);
      console.log(`Preview endpoint status: ${response.status()}`);
      console.log(`Preview endpoint status text: ${response.statusText()}`);
      
      const headers = response.headers();
      console.log('Response headers:', headers);
      
      if (response.status() >= 400) {
        try {
          const errorBody = await response.json();
          console.log('Error response body:', errorBody);
        } catch (e) {
          const errorText = await response.text();
          console.log('Error response text:', errorText);
        }
      }
      
      // Test if it's trying to stream
      const contentType = headers['content-type'];
      console.log(`Content-Type: ${contentType}`);
      
      if (contentType && (contentType.includes('video') || contentType.includes('application/vnd.apple.mpegurl'))) {
        console.log('✅ Endpoint appears to be streaming video content');
      } else {
        console.log('❌ Endpoint not returning video content');
      }
      
    } catch (error) {
      console.log(`❌ Backend test failed: ${error.message}`);
    }
  });

  test('Stream Validation Test', async ({ request }) => {
    console.log('\n=== STREAM VALIDATION TEST ===');
    
    try {
      const response = await request.post('http://localhost:8080/streams/validate', {
        data: {
          url: streamUrl,
          type: 'hls'
        }
      });
      
      console.log(`Validation status: ${response.status()}`);
      const result = await response.json();
      console.log('Validation result:', result);
      
      if (result.valid) {
        console.log('✅ Stream validation passed');
      } else {
        console.log(`❌ Stream validation failed: ${result.error}`);
      }
      
    } catch (error) {
      console.log(`❌ Validation test failed: ${error.message}`);
    }
  });
});