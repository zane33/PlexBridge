const { test, expect } = require('@playwright/test');

test.describe('Video Player Focused Debug', () => {
  test('Debug Stream Preview with Existing Data', async ({ page }) => {
    let consoleMessages = [];
    let networkRequests = [];
    let networkResponses = [];

    // Capture console messages
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
      console.log(`[CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    // Capture network activity
    page.on('request', request => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        timestamp: new Date().toISOString()
      });
      if (request.url().includes('stream') || request.url().includes('.m3u8')) {
        console.log(`[REQUEST] ${request.method()} ${request.url()}`);
      }
    });

    page.on('response', response => {
      networkResponses.push({
        url: response.url(),
        status: response.status(),
        timestamp: new Date().toISOString()
      });
      if (response.url().includes('stream') || response.url().includes('.m3u8')) {
        console.log(`[RESPONSE] ${response.status()} ${response.url()}`);
      }
    });

    console.log('\n=== FOCUSED VIDEO PLAYER DEBUG TEST ===');

    // Step 1: Navigate to the application
    console.log('\n=== STEP 1: NAVIGATE TO APPLICATION ===');
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/focused-01-homepage.png', fullPage: true });

    // Step 2: Navigate to Streams section
    console.log('\n=== STEP 2: NAVIGATE TO STREAMS SECTION ===');
    
    // Check if we're on mobile layout
    const isMobile = await page.locator('[data-testid="mobile-menu-button"]').isVisible();
    if (isMobile) {
      console.log('Mobile layout detected, opening menu first');
      await page.click('[data-testid="mobile-menu-button"]');
      await page.waitForTimeout(500);
    }
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/focused-02-streams-page.png', fullPage: true });

    // Step 3: Check current state and potentially add a test stream
    console.log('\n=== STEP 3: PREPARE TEST STREAM ===');
    
    // Look for existing streams first
    await page.waitForSelector('table, .MuiTableContainer-root', { timeout: 5000 });
    
    const streamRows = await page.locator('table tbody tr').count();
    console.log(`Existing streams count: ${streamRows}`);

    let hasTestStream = false;
    if (streamRows > 0) {
      // Check if we already have a suitable test stream
      const firstRowText = await page.locator('table tbody tr').first().textContent();
      console.log(`First stream: ${firstRowText}`);
      hasTestStream = true;
    }

    if (!hasTestStream) {
      console.log('No streams found, creating test stream...');
      
      // Click Add Stream button
      await page.click('[data-testid="add-stream-button"]');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      
      // Fill in stream details - try different input selectors
      const nameInput = page.locator('input[label="Stream Name"], input[name="name"], [data-testid="stream-name-input"], input:near(text="Stream Name")').first();
      const urlInput = page.locator('input[label="Stream URL"], input[name="url"], [data-testid="stream-url-input"], input:near(text="Stream URL")').first();
      
      await nameInput.fill('Test HLS Stream Debug');
      await urlInput.fill('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
      
      // Save the stream
      await page.click('button:has-text("Save")');
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 });
      
      await page.waitForTimeout(2000);
      console.log('Test stream created');
    }

    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/focused-03-streams-ready.png', fullPage: true });

    // Step 4: Find and click preview button
    console.log('\n=== STEP 4: LOCATE AND CLICK PREVIEW BUTTON ===');
    
    // Get the first stream row
    const firstStreamRow = page.locator('table tbody tr').first();
    await expect(firstStreamRow).toBeVisible();
    
    const streamName = await firstStreamRow.locator('td').first().textContent();
    console.log(`Testing stream: ${streamName}`);

    // Look for preview button - try multiple selectors
    const previewSelectors = [
      '[data-testid="preview-stream-button"]',
      'button[aria-label*="Preview"]', 
      'button[aria-label*="preview"]',
      'button:has-text("Preview")',
      'button[title*="Preview"]',
      '.preview-button',
      '[aria-label*="Play"]'
    ];
    
    let previewButton = null;
    for (const selector of previewSelectors) {
      const element = firstStreamRow.locator(selector);
      if (await element.isVisible()) {
        previewButton = element;
        console.log(`Found preview button with selector: ${selector}`);
        break;
      }
    }
    
    if (!previewButton) {
      // Look at all buttons in the row
      const buttons = firstStreamRow.locator('button');
      const buttonCount = await buttons.count();
      console.log(`Total buttons in row: ${buttonCount}`);
      
      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const buttonText = await button.textContent();
        const buttonAriaLabel = await button.getAttribute('aria-label');
        const buttonTitle = await button.getAttribute('title');
        console.log(`Button ${i}: text="${buttonText}", aria-label="${buttonAriaLabel}", title="${buttonTitle}"`);
        
        if (buttonText?.includes('Preview') || buttonAriaLabel?.includes('Preview') || buttonAriaLabel?.includes('preview')) {
          previewButton = button;
          break;
        }
      }
    }

    if (!previewButton) {
      console.log('❌ No preview button found, checking row structure...');
      const rowHTML = await firstStreamRow.innerHTML();
      console.log('Row HTML:', rowHTML.substring(0, 500));
      
      // Try clicking any play-like button
      previewButton = firstStreamRow.locator('button').first();
    }

    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/focused-04-before-preview-click.png', fullPage: true });

    // Clear network capture arrays before the important part
    networkRequests.length = 0;
    networkResponses.length = 0;
    consoleMessages.length = 0;

    // Click the preview button
    console.log('Clicking preview button...');
    await previewButton.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/focused-05-after-preview-click.png', fullPage: true });

    // Step 5: Analyze what happened
    console.log('\n=== STEP 5: ANALYZE PREVIEW RESULT ===');
    
    // Check for any dialogs or modals
    const dialogs = await page.locator('[role="dialog"], .MuiDialog-root').count();
    console.log(`Dialogs opened: ${dialogs}`);

    if (dialogs > 0) {
      const dialog = page.locator('[role="dialog"], .MuiDialog-root').first();
      const dialogText = await dialog.textContent();
      console.log(`Dialog content preview: ${dialogText.substring(0, 200)}...`);
      
      // Check for video element
      const videoElements = await dialog.locator('video').count();
      console.log(`Video elements in dialog: ${videoElements}`);
      
      if (videoElements > 0) {
        const video = dialog.locator('video').first();
        
        // Get video attributes
        const videoSrc = await video.getAttribute('src');
        const videoClass = await video.getAttribute('class');
        const dataVjsPlayer = await video.getAttribute('data-vjs-player');
        
        console.log('=== VIDEO ELEMENT ANALYSIS ===');
        console.log(`Video src: ${videoSrc}`);
        console.log(`Video class: ${videoClass}`);
        console.log(`Video data-vjs-player: ${dataVjsPlayer}`);
        
        // Get video properties via JavaScript
        const videoProps = await video.evaluate((videoEl) => {
          return {
            currentSrc: videoEl.currentSrc,
            src: videoEl.src,
            networkState: videoEl.networkState,
            readyState: videoEl.readyState,
            error: videoEl.error ? {
              code: videoEl.error.code,
              message: videoEl.error.message
            } : null,
            paused: videoEl.paused,
            ended: videoEl.ended,
            seeking: videoEl.seeking,
            videoWidth: videoEl.videoWidth,
            videoHeight: videoEl.videoHeight,
            duration: videoEl.duration,
            buffered: videoEl.buffered.length > 0 ? {
              start: videoEl.buffered.start(0),
              end: videoEl.buffered.end(videoEl.buffered.length - 1)
            } : null
          };
        });
        
        console.log('=== VIDEO PROPERTIES ===');
        console.log(JSON.stringify(videoProps, null, 2));
        
        // Check for Video.js player instance
        const hasVideojsPlayer = await video.evaluate((videoEl) => {
          return {
            hasPlayerProperty: !!videoEl.player,
            hasVideojsClass: videoEl.classList.contains('video-js'),
            hasVjsAttribute: !!videoEl.getAttribute('data-vjs-player')
          };
        });
        
        console.log('=== VIDEO.JS DETECTION ===');
        console.log(JSON.stringify(hasVideojsPlayer, null, 2));
      }
      
      // Check for loading indicators
      const loadingElements = await dialog.locator('text="Loading", .MuiCircularProgress-root, [role="progressbar"]').count();
      console.log(`Loading indicators: ${loadingElements}`);
      
      // Check for error messages
      const errorElements = await dialog.locator('.MuiAlert-root, .error, [role="alert"]').count();
      console.log(`Error indicators: ${errorElements}`);
      
      if (errorElements > 0) {
        const errorText = await dialog.locator('.MuiAlert-root, .error, [role="alert"]').first().textContent();
        console.log(`Error message: ${errorText}`);
      }
      
      await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/focused-06-dialog-analysis.png', fullPage: true });
      
      // Wait a bit to see if anything loads
      console.log('Waiting for potential video initialization...');
      await page.waitForTimeout(5000);
      
      await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/focused-07-after-wait.png', fullPage: true });
      
      // Check video properties again after wait
      if (videoElements > 0) {
        const video = dialog.locator('video').first();
        const videoPropsAfter = await video.evaluate((videoEl) => {
          return {
            currentSrc: videoEl.currentSrc,
            networkState: videoEl.networkState,
            readyState: videoEl.readyState,
            error: videoEl.error ? {
              code: videoEl.error.code,
              message: videoEl.error.message
            } : null,
            videoWidth: videoEl.videoWidth,
            videoHeight: videoEl.videoHeight
          };
        });
        
        console.log('=== VIDEO PROPERTIES AFTER WAIT ===');
        console.log(JSON.stringify(videoPropsAfter, null, 2));
      }
      
    } else {
      console.log('❌ No dialog opened after clicking preview button');
    }

    // Step 6: Network analysis
    console.log('\n=== STEP 6: NETWORK ANALYSIS ===');
    
    const streamRequests = networkRequests.filter(req => 
      req.url.includes('/streams/preview/') || 
      req.url.includes('.m3u8') ||
      req.url.includes('stream') ||
      req.url.includes('mux.dev')
    );
    console.log(`Stream-related requests: ${streamRequests.length}`);
    streamRequests.forEach((req, index) => {
      console.log(`  ${index + 1}. ${req.method} ${req.url}`);
    });

    const streamResponses = networkResponses.filter(res => 
      res.url.includes('/streams/preview/') || 
      res.url.includes('.m3u8') ||
      res.url.includes('stream') ||
      res.url.includes('mux.dev')
    );
    console.log(`Stream-related responses: ${streamResponses.length}`);
    streamResponses.forEach((res, index) => {
      console.log(`  ${index + 1}. ${res.status} ${res.url}`);
    });

    // Step 7: Console errors
    console.log('\n=== STEP 7: CONSOLE ANALYSIS ===');
    
    const errors = consoleMessages.filter(msg => msg.type === 'error');
    console.log(`Console errors: ${errors.length}`);
    errors.forEach((error, index) => {
      console.log(`  Error ${index + 1}: ${error.text}`);
    });

    const warnings = consoleMessages.filter(msg => msg.type === 'warning');
    console.log(`Console warnings: ${warnings.length}`);
    warnings.forEach((warning, index) => {
      console.log(`  Warning ${index + 1}: ${warning.text}`);
    });

    // Final screenshot
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/focused-08-final.png', fullPage: true });

    // Step 8: Generate findings report
    console.log('\n=== FINAL FINDINGS REPORT ===');
    
    const findings = {
      timestamp: new Date().toISOString(),
      dialogsOpened: dialogs,
      videoElementsFound: dialogs > 0 ? await page.locator('[role="dialog"] video, .MuiDialog-root video').count() : 0,
      streamRequestsCount: streamRequests.length,
      streamResponsesCount: streamResponses.length,
      consoleErrorsCount: errors.length,
      consoleWarningsCount: warnings.length,
      networkRequests: streamRequests,
      networkResponses: streamResponses,
      consoleErrors: errors,
      consoleWarnings: warnings
    };
    
    console.log(JSON.stringify(findings, null, 2));

    // Test passes if we at least got to click something
    expect(true).toBe(true);
  });

  test('Backend Stream API Analysis', async ({ request }) => {
    console.log('\n=== BACKEND STREAM API ANALYSIS ===');
    
    // Test streams endpoint
    try {
      const response = await request.get('http://localhost:8080/api/streams');
      console.log(`Streams API status: ${response.status()}`);
      
      if (response.status() === 200) {
        const streams = await response.json();
        console.log(`Streams found: ${streams.length}`);
        
        if (streams.length > 0) {
          const firstStream = streams[0];
          console.log('First stream:', firstStream);
          
          // Test preview endpoint
          const previewResponse = await request.get(`http://localhost:8080/streams/preview/${firstStream.id}`);
          console.log(`Preview endpoint status: ${previewResponse.status()}`);
          console.log(`Preview content-type: ${previewResponse.headers()['content-type']}`);
          
          if (previewResponse.status() >= 400) {
            const errorText = await previewResponse.text();
            console.log(`Preview error: ${errorText}`);
          }
        }
      }
    } catch (error) {
      console.log(`Backend API test failed: ${error.message}`);
    }
  });
});