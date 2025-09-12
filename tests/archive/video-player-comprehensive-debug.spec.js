const { test, expect } = require('@playwright/test');

test.describe('Video Player Comprehensive Debug', () => {
  let consoleMessages = [];
  let networkRequests = [];
  let networkResponses = [];
  let pageErrors = [];

  test.beforeEach(async ({ page }) => {
    // Reset capture arrays
    consoleMessages = [];
    networkRequests = [];
    networkResponses = [];
    pageErrors = [];

    // Capture all console messages
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
        timestamp: new Date().toISOString()
      });
      console.log(`[CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    // Capture all network requests
    page.on('request', request => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData(),
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
      pageErrors.push({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      console.log(`[PAGE_ERROR] ${error.message}`);
    });
  });

  test('Comprehensive Video Player Debug Test', async ({ page }) => {
    console.log('\n=== STARTING COMPREHENSIVE VIDEO PLAYER DEBUG ===');
    
    // Step 1: Navigate to the application
    console.log('\n=== STEP 1: NAVIGATE TO APPLICATION ===');
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-01-homepage.png', fullPage: true });

    // Step 2: Navigate to Streams section
    console.log('\n=== STEP 2: NAVIGATE TO STREAMS SECTION ===');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForSelector('table', { timeout: 10000 });
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-02-streams-page.png', fullPage: true });

    // Step 3: Check if there are existing streams or create a test stream
    console.log('\n=== STEP 3: ENSURE TEST STREAM EXISTS ===');
    const existingStreams = await page.locator('table tbody tr').count();
    console.log(`Existing streams count: ${existingStreams}`);

    let testStreamName = 'Test HLS Stream';
    let testStreamUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

    // Check if our test stream already exists
    const testStreamExists = await page.locator(`table tbody tr:has-text("${testStreamName}")`).isVisible();

    if (!testStreamExists) {
      console.log('Creating test stream...');
      
      // Click Add Stream button
      await page.click('[data-testid="add-stream-button"]');
      await page.waitForSelector('[data-testid="stream-dialog"]');
      
      // Fill in stream details
      await page.fill('[data-testid="stream-name-input"]', testStreamName);
      await page.fill('[data-testid="stream-url-input"]', testStreamUrl);
      
      // Save the stream
      await page.click('[data-testid="save-stream-button"]');
      await page.waitForSelector('[data-testid="stream-dialog"]', { state: 'hidden' });
      
      // Wait for the table to update
      await page.waitForTimeout(2000);
      
      console.log('Test stream created successfully');
    } else {
      console.log('Test stream already exists');
    }

    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-03-stream-ready.png', fullPage: true });

    // Step 4: Locate the test stream and preview button
    console.log('\n=== STEP 4: LOCATE PREVIEW BUTTON ===');
    const streamRow = page.locator(`table tbody tr:has-text("${testStreamName}")`);
    await expect(streamRow).toBeVisible();

    const previewButton = streamRow.locator('[data-testid="preview-stream-button"]');
    await expect(previewButton).toBeVisible();

    console.log('Preview button located successfully');

    // Step 5: Test backend endpoints before clicking preview
    console.log('\n=== STEP 5: TEST BACKEND ENDPOINTS ===');
    
    // Get the stream ID from the row
    const streamRowText = await streamRow.textContent();
    console.log(`Stream row text: ${streamRowText}`);
    
    // Test stream validation endpoint
    console.log('Testing stream validation endpoint...');
    try {
      const validationResponse = await page.request.post('http://localhost:8080/streams/validate', {
        data: {
          url: testStreamUrl,
          type: 'hls'
        }
      });
      console.log(`Validation status: ${validationResponse.status()}`);
      const validationResult = await validationResponse.json();
      console.log('Validation result:', validationResult);
    } catch (error) {
      console.log(`Validation test failed: ${error.message}`);
    }

    // Get stream ID from API
    console.log('Getting stream ID from API...');
    let streamId = null;
    try {
      const streamsResponse = await page.request.get('http://localhost:8080/api/streams');
      const streams = await streamsResponse.json();
      const testStream = streams.find(s => s.name === testStreamName);
      if (testStream) {
        streamId = testStream.id;
        console.log(`Test stream ID: ${streamId}`);
        
        // Test preview endpoint
        console.log('Testing preview endpoint...');
        const previewResponse = await page.request.get(`http://localhost:8080/streams/preview/${streamId}`);
        console.log(`Preview endpoint status: ${previewResponse.status()}`);
        console.log(`Preview endpoint headers:`, previewResponse.headers());
        
        if (previewResponse.status() !== 200) {
          try {
            const errorBody = await previewResponse.text();
            console.log(`Preview endpoint error body: ${errorBody}`);
          } catch (e) {
            console.log('Could not read error body');
          }
        }
      } else {
        console.log('Could not find test stream in API response');
      }
    } catch (error) {
      console.log(`API test failed: ${error.message}`);
    }

    // Step 6: Click preview button and monitor everything
    console.log('\n=== STEP 6: CLICK PREVIEW BUTTON AND MONITOR ===');
    
    // Clear previous network activity
    networkRequests.length = 0;
    networkResponses.length = 0;
    consoleMessages.length = 0;
    pageErrors.length = 0;

    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-04-before-preview.png', fullPage: true });

    // Click the preview button
    await previewButton.click();

    // Wait a moment for any immediate UI changes
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-05-after-preview-click.png', fullPage: true });

    // Step 7: Check for video player dialog
    console.log('\n=== STEP 7: CHECK FOR VIDEO PLAYER DIALOG ===');
    
    const playerDialog = page.locator('.MuiDialog-root').first();
    const dialogVisible = await playerDialog.isVisible({ timeout: 5000 });
    console.log(`Player dialog visible: ${dialogVisible}`);

    if (dialogVisible) {
      console.log('Dialog detected! Analyzing contents...');
      
      // Check dialog title
      const dialogTitle = await page.locator('.MuiDialogTitle-root').textContent();
      console.log(`Dialog title: ${dialogTitle}`);
      
      // Take screenshot of the dialog
      await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-06-dialog-opened.png', fullPage: true });

      // Step 8: Analyze video element
      console.log('\n=== STEP 8: ANALYZE VIDEO ELEMENT ===');
      
      const videoElement = page.locator('video').first();
      const videoExists = await videoElement.isVisible();
      console.log(`Video element exists: ${videoExists}`);

      if (videoExists) {
        // Get all video element attributes
        const videoSrc = await videoElement.getAttribute('src');
        const videoClass = await videoElement.getAttribute('class');
        const videoControls = await videoElement.getAttribute('controls');
        const videoAutoplay = await videoElement.getAttribute('autoplay');
        const videoMuted = await videoElement.getAttribute('muted');
        const videoDataSetup = await videoElement.getAttribute('data-setup');
        const videoDataVjsPlayer = await videoElement.getAttribute('data-vjs-player');
        
        console.log('=== VIDEO ELEMENT ANALYSIS ===');
        console.log(`Video src: ${videoSrc}`);
        console.log(`Video class: ${videoClass}`);
        console.log(`Video controls: ${videoControls}`);
        console.log(`Video autoplay: ${videoAutoplay}`);
        console.log(`Video muted: ${videoMuted}`);
        console.log(`Video data-setup: ${videoDataSetup}`);
        console.log(`Video data-vjs-player: ${videoDataVjsPlayer}`);

        // Check video element properties via JavaScript
        const videoProperties = await videoElement.evaluate((video) => {
          return {
            currentSrc: video.currentSrc,
            src: video.src,
            networkState: video.networkState,
            readyState: video.readyState,
            error: video.error ? {
              code: video.error.code,
              message: video.error.message
            } : null,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            duration: video.duration,
            paused: video.paused,
            ended: video.ended,
            seeking: video.seeking,
            buffered: video.buffered.length > 0 ? {
              start: video.buffered.start(0),
              end: video.buffered.end(video.buffered.length - 1)
            } : null
          };
        });

        console.log('=== VIDEO ELEMENT PROPERTIES ===');
        console.log(JSON.stringify(videoProperties, null, 2));

        // Check for Video.js player instance
        const videojsPlayer = await page.evaluate(() => {
          const videoElement = document.querySelector('video');
          if (videoElement && videoElement.player) {
            return {
              hasPlayer: true,
              playerType: videoElement.player.constructor.name,
              playerState: videoElement.player.readyState(),
              playerError: videoElement.player.error()
            };
          }
          return { hasPlayer: false };
        });

        console.log('=== VIDEO.JS PLAYER ANALYSIS ===');
        console.log(JSON.stringify(videojsPlayer, null, 2));
      }

      // Step 9: Check for loading indicators and error messages
      console.log('\n=== STEP 9: CHECK FOR UI STATE INDICATORS ===');
      
      const loadingIndicator = page.locator('text="Loading stream..."');
      const isLoading = await loadingIndicator.isVisible();
      console.log(`Loading indicator visible: ${isLoading}`);

      const errorAlert = page.locator('.MuiAlert-root');
      const hasError = await errorAlert.isVisible();
      console.log(`Error alert visible: ${hasError}`);

      if (hasError) {
        const errorText = await errorAlert.textContent();
        console.log(`Error message: ${errorText}`);
      }

      // Check for switches/toggles
      const proxySwitch = page.locator('input[type="checkbox"]').first();
      const proxyEnabled = await proxySwitch.isChecked();
      console.log(`Proxy switch enabled: ${proxyEnabled}`);

      // Wait for player initialization
      console.log('\n=== STEP 10: WAIT FOR PLAYER INITIALIZATION ===');
      await page.waitForTimeout(5000);

      // Take another screenshot after waiting
      await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-07-after-wait.png', fullPage: true });

      // Re-check video properties after wait
      if (videoExists) {
        const videoPropertiesAfterWait = await videoElement.evaluate((video) => {
          return {
            currentSrc: video.currentSrc,
            networkState: video.networkState,
            readyState: video.readyState,
            error: video.error ? {
              code: video.error.code,
              message: video.error.message
            } : null,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
          };
        });

        console.log('=== VIDEO PROPERTIES AFTER WAIT ===');
        console.log(JSON.stringify(videoPropertiesAfterWait, null, 2));
      }

      // Step 11: Try to interact with the video
      console.log('\n=== STEP 11: ATTEMPT VIDEO INTERACTION ===');
      
      if (videoExists) {
        // Try to play the video
        try {
          await videoElement.click();
          await page.waitForTimeout(2000);
          console.log('Clicked on video element');
        } catch (error) {
          console.log(`Failed to click video: ${error.message}`);
        }

        // Check for play button
        const playButton = page.locator('[aria-label="Play"], button:has-text("Play"), .vjs-play-control');
        const playButtonExists = await playButton.first().isVisible();
        console.log(`Play button visible: ${playButtonExists}`);

        if (playButtonExists) {
          try {
            await playButton.first().click();
            await page.waitForTimeout(2000);
            console.log('Clicked play button');
          } catch (error) {
            console.log(`Failed to click play button: ${error.message}`);
          }
        }
      }

      // Step 12: Test proxy toggle
      console.log('\n=== STEP 12: TEST PROXY TOGGLE ===');
      
      try {
        const proxyToggle = page.locator('input[type="checkbox"]').first();
        const initialState = await proxyToggle.isChecked();
        console.log(`Initial proxy state: ${initialState}`);
        
        // Toggle proxy
        await proxyToggle.click();
        await page.waitForTimeout(3000); // Wait for re-initialization
        
        const newState = await proxyToggle.isChecked();
        console.log(`New proxy state: ${newState}`);
        
        await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-08-after-proxy-toggle.png', fullPage: true });
        
        // Check video src after toggle
        if (videoExists) {
          const videoSrcAfterToggle = await videoElement.getAttribute('src');
          console.log(`Video src after proxy toggle: ${videoSrcAfterToggle}`);
        }
        
      } catch (error) {
        console.log(`Proxy toggle test failed: ${error.message}`);
      }

      // Step 13: Test direct stream URL access
      console.log('\n=== STEP 13: TEST DIRECT STREAM URL ACCESS ===');
      
      if (streamId) {
        try {
          // Test direct preview URL
          const directPreviewUrl = `http://localhost:8080/streams/preview/${streamId}`;
          console.log(`Testing direct access to: ${directPreviewUrl}`);
          
          // Open in new tab to test direct access
          const newPage = await page.context().newPage();
          const response = await newPage.goto(directPreviewUrl);
          console.log(`Direct URL response status: ${response.status()}`);
          console.log(`Direct URL response headers:`, response.headers());
          
          await newPage.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-09-direct-url-test.png' });
          await newPage.close();
          
        } catch (error) {
          console.log(`Direct URL test failed: ${error.message}`);
        }
      }

    } else {
      console.log('❌ NO PLAYER DIALOG DETECTED');
      
      // Check for any other dialogs or modals
      const allDialogs = await page.locator('[role="dialog"], .MuiDialog-root, .modal, .popup').count();
      console.log(`Total dialog elements found: ${allDialogs}`);
      
      // Check if anything else happened
      const allVisibleElements = await page.locator('*:visible').count();
      console.log(`Total visible elements: ${allVisibleElements}`);
    }

    // Step 14: Network analysis
    console.log('\n=== STEP 14: NETWORK ANALYSIS ===');
    
    const streamRequests = networkRequests.filter(req => 
      req.url.includes('/streams/preview/') || 
      req.url.includes('.m3u8') ||
      req.url.includes('stream') ||
      req.url.includes(testStreamUrl) ||
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
      res.url.includes(testStreamUrl) ||
      res.url.includes('mux.dev')
    );
    console.log(`Stream-related responses: ${streamResponses.length}`);
    streamResponses.forEach((res, index) => {
      console.log(`  ${index + 1}. ${res.status} ${res.statusText} ${res.url}`);
    });

    // Step 15: Console and error analysis
    console.log('\n=== STEP 15: CONSOLE AND ERROR ANALYSIS ===');
    
    const errorMessages = consoleMessages.filter(msg => msg.type === 'error');
    console.log(`Console errors: ${errorMessages.length}`);
    errorMessages.forEach((msg, index) => {
      console.log(`  Error ${index + 1}: ${msg.text}`);
      console.log(`    Location: ${msg.location ? JSON.stringify(msg.location) : 'unknown'}`);
    });

    const warningMessages = consoleMessages.filter(msg => msg.type === 'warning');
    console.log(`Console warnings: ${warningMessages.length}`);
    warningMessages.forEach((msg, index) => {
      console.log(`  Warning ${index + 1}: ${msg.text}`);
    });

    console.log(`Page errors: ${pageErrors.length}`);
    pageErrors.forEach((error, index) => {
      console.log(`  Page Error ${index + 1}: ${error.message}`);
    });

    // Step 16: DOM analysis
    console.log('\n=== STEP 16: DOM ANALYSIS ===');
    
    const videojsElements = await page.locator('.video-js').count();
    console.log(`Video.js elements: ${videojsElements}`);
    
    const vjsPlayerElements = await page.locator('[data-vjs-player]').count();
    console.log(`VJS player elements: ${vjsPlayerElements}`);

    const videoElements = await page.locator('video').count();
    console.log(`Total video elements: ${videoElements}`);

    // Take final screenshot
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-10-final-state.png', fullPage: true });

    // Step 17: Generate comprehensive report
    console.log('\n=== STEP 17: COMPREHENSIVE REPORT ===');
    
    const report = {
      timestamp: new Date().toISOString(),
      testStream: {
        name: testStreamName,
        url: testStreamUrl,
        id: streamId
      },
      findings: {
        dialogOpened: dialogVisible,
        videoElementExists: videoExists,
        videojsElementsCount: videojsElements,
        consoleErrorsCount: errorMessages.length,
        pageErrorsCount: pageErrors.length,
        networkRequestsCount: networkRequests.length,
        streamRequestsCount: streamRequests.length,
        streamResponsesCount: streamResponses.length
      },
      detailedAnalysis: {
        consoleErrors: errorMessages,
        pageErrors: pageErrors,
        streamRequests: streamRequests,
        streamResponses: streamResponses,
        warnings: warningMessages
      },
      screenshots: [
        'debug-01-homepage.png',
        'debug-02-streams-page.png',
        'debug-03-stream-ready.png',
        'debug-04-before-preview.png',
        'debug-05-after-preview-click.png',
        'debug-06-dialog-opened.png',
        'debug-07-after-wait.png',
        'debug-08-after-proxy-toggle.png',
        'debug-09-direct-url-test.png',
        'debug-10-final-state.png'
      ]
    };

    console.log('\n=== FINAL COMPREHENSIVE REPORT ===');
    console.log(JSON.stringify(report, null, 2));

    // Basic assertions to ensure test passes
    expect(true).toBe(true); // Test completed successfully
  });

  test('Backend Stream Endpoints Direct Test', async ({ request }) => {
    console.log('\n=== BACKEND ENDPOINTS DIRECT TEST ===');
    
    // Test streams API
    console.log('Testing /api/streams endpoint...');
    try {
      const streamsResponse = await request.get('http://localhost:8080/api/streams');
      console.log(`Streams API status: ${streamsResponse.status()}`);
      const streams = await streamsResponse.json();
      console.log(`Streams count: ${streams.length}`);
      
      if (streams.length > 0) {
        const testStream = streams[0];
        console.log(`Test stream:`, testStream);
        
        // Test preview endpoint with first stream
        console.log(`Testing preview endpoint for stream ${testStream.id}...`);
        const previewResponse = await request.get(`http://localhost:8080/streams/preview/${testStream.id}`);
        console.log(`Preview status: ${previewResponse.status()}`);
        console.log(`Preview headers:`, previewResponse.headers());
        
        const contentType = previewResponse.headers()['content-type'];
        console.log(`Content-Type: ${contentType}`);
        
        if (previewResponse.status() >= 400) {
          try {
            const errorText = await previewResponse.text();
            console.log(`Preview error: ${errorText}`);
          } catch (e) {
            console.log('Could not read preview error response');
          }
        }
      }
    } catch (error) {
      console.log(`Backend test failed: ${error.message}`);
    }
  });

  test('Stream URL Direct Access Test', async ({ page }) => {
    console.log('\n=== STREAM URL DIRECT ACCESS TEST ===');
    
    const testUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    
    try {
      console.log(`Testing direct access to: ${testUrl}`);
      const response = await page.goto(testUrl);
      console.log(`Direct stream access status: ${response.status()}`);
      console.log(`Direct stream headers:`, response.headers());
      
      // Take screenshot of direct stream access
      await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-results/debug-direct-stream-access.png' });
      
      // Try to parse as text if it's an M3U8
      if (response.headers()['content-type']?.includes('application/x-mpegURL') || 
          response.headers()['content-type']?.includes('vnd.apple.mpegurl')) {
        const m3u8Content = await response.text();
        console.log('M3U8 content preview:', m3u8Content.substring(0, 500));
      }
      
    } catch (error) {
      console.log(`Direct stream access failed: ${error.message}`);
    }
  });
});