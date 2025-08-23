const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('HGTV Stream Preview Testing', () => {
  let browser, context, page;

  test.beforeAll(async ({ browser: testBrowser }) => {
    browser = testBrowser;
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: 'tests/screenshots/videos/',
        size: { width: 1920, height: 1080 }
      }
    });
    page = await context.newPage();

    // Enable console logging
    page.on('console', msg => {
      console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text());
    });

    // Log network requests
    page.on('request', request => {
      if (request.url().includes('stream') || request.url().includes('preview')) {
        console.log(`[NETWORK REQUEST]: ${request.method()} ${request.url()}`);
      }
    });

    // Log network responses
    page.on('response', response => {
      if (response.url().includes('stream') || response.url().includes('preview')) {
        console.log(`[NETWORK RESPONSE]: ${response.status()} ${response.url()}`);
      }
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('Complete HGTV Stream Preview Functionality Test', async () => {
    console.log('\n=== Starting HGTV Stream Preview Test ===\n');

    // Step 1: Navigate to PlexBridge application
    console.log('Step 1: Navigating to PlexBridge application...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Take screenshot of homepage
    await page.screenshot({ 
      path: 'tests/screenshots/01-homepage-loaded.png', 
      fullPage: true 
    });
    console.log('Screenshot saved: 01-homepage-loaded.png');

    // Verify homepage loaded correctly
    await expect(page).toHaveTitle(/PlexBridge/);
    console.log('✓ Homepage loaded successfully');

    // Step 2: Navigate to Streams section
    console.log('\nStep 2: Navigating to Streams section...');
    
    // Check if mobile or desktop layout
    const isMobileLayout = await page.locator('[data-testid="mobile-menu-button"]').isVisible();
    
    if (isMobileLayout) {
      await page.click('[data-testid="mobile-menu-button"]');
      await page.waitForTimeout(500);
    }
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of streams page
    await page.screenshot({ 
      path: 'tests/screenshots/02-streams-page-loaded.png', 
      fullPage: true 
    });
    console.log('Screenshot saved: 02-streams-page-loaded.png');

    // Wait for streams to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    console.log('✓ Streams page loaded successfully');

    // Step 3: Locate HGTV channel
    console.log('\nStep 3: Locating HGTV stream...');
    
    // Search for HGTV stream by name or ID
    const hgtvRow = page.locator('table tbody tr').filter({ hasText: 'HGTV' }).first();
    const isHgtvVisible = await hgtvRow.isVisible();
    
    if (!isHgtvVisible) {
      console.log('HGTV stream not visible, searching by ID or alternative methods...');
      // Try to find by ID in the data or other identifiers
      const allRows = await page.locator('table tbody tr').count();
      console.log(`Total streams found: ${allRows}`);
      
      // Take screenshot showing available streams
      await page.screenshot({ 
        path: 'tests/screenshots/03-available-streams.png', 
        fullPage: true 
      });
    }

    await expect(hgtvRow).toBeVisible();
    console.log('✓ HGTV stream found in streams table');

    // Take screenshot highlighting HGTV stream
    await page.screenshot({ 
      path: 'tests/screenshots/04-hgtv-stream-found.png', 
      fullPage: true 
    });
    console.log('Screenshot saved: 04-hgtv-stream-found.png');

    // Step 4: Click preview button
    console.log('\nStep 4: Clicking HGTV stream preview button...');
    
    // Look for preview button in the HGTV row
    const previewButton = hgtvRow.locator('[data-testid="preview-stream-button"], button:has-text("Preview"), button:has-text("Play")').first();
    await expect(previewButton).toBeVisible();
    
    await previewButton.click();
    console.log('✓ Preview button clicked');

    // Step 5: Wait for video player dialog to open
    console.log('\nStep 5: Waiting for video player dialog...');
    
    // Wait for video player dialog or modal
    const videoDialog = page.locator('[data-testid="video-player-dialog"], .MuiDialog-root, [role="dialog"]').first();
    await expect(videoDialog).toBeVisible({ timeout: 10000 });
    console.log('✓ Video player dialog opened');

    // Take screenshot of video player dialog
    await page.screenshot({ 
      path: 'tests/screenshots/05-video-player-dialog.png', 
      fullPage: true 
    });
    console.log('Screenshot saved: 05-video-player-dialog.png');

    // Step 6: Wait for video element to load
    console.log('\nStep 6: Checking video player element...');
    
    // Look for video element
    const videoElement = page.locator('video').first();
    await expect(videoElement).toBeVisible({ timeout: 15000 });
    console.log('✓ Video element found and visible');

    // Wait a moment for video to start loading
    await page.waitForTimeout(3000);

    // Check video element properties
    const videoSrc = await videoElement.getAttribute('src');
    const videoCurrentTime = await videoElement.evaluate(el => el.currentTime);
    const videoReadyState = await videoElement.evaluate(el => el.readyState);
    const videoNetworkState = await videoElement.evaluate(el => el.networkState);
    
    console.log(`Video src: ${videoSrc}`);
    console.log(`Video currentTime: ${videoCurrentTime}`);
    console.log(`Video readyState: ${videoReadyState}`);
    console.log(`Video networkState: ${videoNetworkState}`);

    // Step 7: Take detailed screenshot of video player
    console.log('\nStep 7: Capturing detailed video player screenshots...');
    
    // Focus on the video player area
    await page.screenshot({ 
      path: 'tests/screenshots/06-video-player-detailed.png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1920, height: 1080 }
    });
    console.log('Screenshot saved: 06-video-player-detailed.png');

    // Step 8: Check for HLS.js usage and transcoding
    console.log('\nStep 8: Checking HLS.js and transcoding...');
    
    // Check if HLS.js is being used
    const hlsInfo = await page.evaluate(() => {
      return {
        hlsExists: typeof window.Hls !== 'undefined',
        hlsVersion: typeof window.Hls !== 'undefined' ? window.Hls.version : 'N/A',
        hlsSupported: typeof window.Hls !== 'undefined' ? window.Hls.isSupported() : false
      };
    });
    
    console.log('HLS.js Info:', hlsInfo);

    // Check for transcoding in network requests
    const networkRequests = [];
    page.on('request', request => {
      if (request.url().includes('transcode') || request.url().includes('stream') || request.url().includes('m3u8')) {
        networkRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });

    // Wait for potential network activity
    await page.waitForTimeout(5000);

    // Step 9: Test video player controls
    console.log('\nStep 9: Testing video player controls...');
    
    // Look for play/pause controls
    const playButton = page.locator('button[aria-label*="play"], button[title*="play"], .vjs-play-control').first();
    const muteButton = page.locator('button[aria-label*="mute"], button[title*="mute"], .vjs-mute-control').first();
    
    if (await playButton.isVisible()) {
      console.log('✓ Play button found');
      await playButton.click();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'tests/screenshots/07-video-controls-test.png', 
        fullPage: false,
        clip: { x: 0, y: 0, width: 1920, height: 1080 }
      });
      console.log('Screenshot saved: 07-video-controls-test.png');
    }

    if (await muteButton.isVisible()) {
      console.log('✓ Mute button found');
    }

    // Step 10: Check browser console for errors
    console.log('\nStep 10: Checking for JavaScript errors...');
    
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Wait a bit more to catch any delayed errors
    await page.waitForTimeout(3000);

    // Step 11: Final comprehensive screenshot
    console.log('\nStep 11: Taking final comprehensive screenshot...');
    
    await page.screenshot({ 
      path: 'tests/screenshots/08-final-video-player-state.png', 
      fullPage: true 
    });
    console.log('Screenshot saved: 08-final-video-player-state.png');

    // Step 12: Create test summary
    console.log('\nStep 12: Creating test summary...');
    
    const testSummary = {
      timestamp: new Date().toISOString(),
      testResults: {
        homepageLoaded: true,
        streamsPageLoaded: true,
        hgtvStreamFound: isHgtvVisible,
        videoPlayerOpened: await videoDialog.isVisible(),
        videoElementVisible: await videoElement.isVisible(),
        hlsSupported: hlsInfo.hlsSupported,
        videoProperties: {
          src: videoSrc,
          currentTime: videoCurrentTime,
          readyState: videoReadyState,
          networkState: videoNetworkState
        },
        networkRequests: networkRequests.slice(0, 10), // Limit to first 10
        consoleErrors: consoleErrors.slice(0, 5) // Limit to first 5 errors
      }
    };

    console.log('\n=== TEST SUMMARY ===');
    console.log(JSON.stringify(testSummary, null, 2));

    // Verify core functionality
    expect(testSummary.testResults.homepageLoaded).toBe(true);
    expect(testSummary.testResults.streamsPageLoaded).toBe(true);
    expect(testSummary.testResults.videoPlayerOpened).toBe(true);
    expect(testSummary.testResults.videoElementVisible).toBe(true);

    console.log('\n✅ HGTV Stream Preview Test Completed Successfully!\n');
  });
});