const { test, expect } = require('@playwright/test');

test.describe('Video Player Network Debug', () => {
  test('Monitor exact network requests during video player initialization', async ({ page }) => {
    console.log('🔍 Starting video player network debug');
    
    // Set up comprehensive network monitoring
    const allRequests = [];
    const allResponses = [];
    
    page.on('request', request => {
      allRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: new Date().toISOString()
      });
      console.log(`[REQUEST] ${request.method()} ${request.url()}`);
    });
    
    page.on('response', async response => {
      let responseBody = '';
      try {
        if (response.url().includes('preview') && response.status() >= 400) {
          responseBody = await response.text();
        }
      } catch (e) {
        // Ignore response body read errors
      }
      
      allResponses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        body: responseBody,
        timestamp: new Date().toISOString()
      });
      
      if (response.url().includes('preview') || response.status() >= 400) {
        console.log(`[RESPONSE] ${response.status()} ${response.statusText()} - ${response.url()}`);
        if (responseBody) {
          console.log(`[RESPONSE BODY] ${responseBody}`);
        }
      }
    });
    
    page.on('requestfailed', request => {
      console.log(`[REQUEST FAILED] ${request.method()} ${request.url()} - ${request.failure().errorText}`);
    });
    
    // Navigate and get to stream preview
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Get stream data first
    console.log('📍 Getting stream data');
    const streamData = await page.evaluate(() => {
      return fetch('/api/streams')
        .then(res => res.json())
        .then(data => data[0])
        .catch(err => ({ error: err.message }));
    });
    
    console.log('📊 Stream data:', JSON.stringify(streamData, null, 2));
    
    // Click preview button
    console.log('📍 Clicking preview button');
    await page.locator('[data-testid="preview-stream-button"]').first().click();
    
    // Wait for modal
    console.log('📍 Waiting for modal');
    await page.waitForSelector('.MuiDialog-root', { timeout: 5000 });
    
    // Wait for video player initialization (this is when the request should happen)
    console.log('📍 Waiting for video player initialization (15 seconds)');
    await page.waitForTimeout(15000);
    
    // Check the video element state
    console.log('📍 Checking video element state');
    const videoState = await page.evaluate(() => {
      const video = document.querySelector('video');
      if (!video) return { error: 'No video element found' };
      
      return {
        src: video.src,
        currentSrc: video.currentSrc,
        readyState: video.readyState,
        networkState: video.networkState,
        error: video.error ? {
          code: video.error.code,
          message: video.error.message
        } : null,
        videoJSPlayer: !!video.player,
        hasPlayer: video.player ? 'yes' : 'no'
      };
    });
    
    console.log('📹 Video state:', JSON.stringify(videoState, null, 2));
    
    // Check for any console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log(`[BROWSER ERROR] ${msg.text()}`);
      }
    });
    
    // Look for preview-specific requests
    const previewRequests = allRequests.filter(req => req.url.includes('preview'));
    const previewResponses = allResponses.filter(res => res.url.includes('preview'));
    
    console.log(`\n📋 FINAL ANALYSIS:`);
    console.log(`==================`);
    console.log(`📊 Total requests made: ${allRequests.length}`);
    console.log(`📊 Preview requests: ${previewRequests.length}`);
    console.log(`📊 Preview responses: ${previewResponses.length}`);
    
    if (previewRequests.length > 0) {
      console.log(`\n📨 Preview requests:`);
      previewRequests.forEach((req, i) => {
        console.log(`  ${i + 1}. ${req.method} ${req.url} at ${req.timestamp}`);
      });
    }
    
    if (previewResponses.length > 0) {
      console.log(`\n📨 Preview responses:`);
      previewResponses.forEach((res, i) => {
        console.log(`  ${i + 1}. ${res.status} ${res.statusText} - ${res.url} at ${res.timestamp}`);
        if (res.body) {
          console.log(`     Body: ${res.body}`);
        }
      });
    }
    
    // Look for any server errors
    const serverErrors = allResponses.filter(res => res.status >= 500);
    if (serverErrors.length > 0) {
      console.log(`\n❌ Server errors (5xx):`);
      serverErrors.forEach((res, i) => {
        console.log(`  ${i + 1}. ${res.status} ${res.statusText} - ${res.url}`);
        if (res.body) {
          console.log(`     Body: ${res.body}`);
        }
      });
    }
    
    // Check if the URL generation is working
    console.log(`\n📍 Testing URL generation logic`);
    const urlGenTest = await page.evaluate((streamData) => {
      const streamId = streamData.id;
      const expectedUrl = `${window.location.origin}/streams/preview/${streamId}`;
      console.log(`Expected preview URL: ${expectedUrl}`);
      return {
        streamId,
        expectedUrl,
        origin: window.location.origin
      };
    }, streamData);
    
    console.log(`🔗 URL generation test:`, JSON.stringify(urlGenTest, null, 2));
    
    // Test the preview endpoint directly
    console.log(`\n📍 Testing preview endpoint directly`);
    const directTest = await page.request.get(`http://localhost:8080/streams/preview/${streamData.id}`);
    console.log(`📊 Direct endpoint test: ${directTest.status()} ${directTest.statusText()}`);
    
    try {
      const directBody = await directTest.text();
      console.log(`📊 Direct endpoint body: ${directBody}`);
    } catch (e) {
      console.log(`📊 Could not read direct endpoint body: ${e.message}`);
    }
    
    // Close modal
    await page.keyboard.press('Escape');
  });
});