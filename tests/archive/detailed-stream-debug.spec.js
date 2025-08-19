const { test, expect } = require('@playwright/test');

test.describe('Detailed Stream Debug', () => {
  test('Debug stream preview with detailed logging', async ({ page }) => {
    console.log('🔍 Starting detailed stream preview debug');
    
    // Navigate to the application
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Set up console and network monitoring
    const consoleMessages = [];
    const networkRequests = [];
    const networkResponses = [];
    
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });
    
    page.on('request', request => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: new Date().toISOString()
      });
      console.log(`[REQUEST] ${request.method()} ${request.url()}`);
    });
    
    page.on('response', response => {
      networkResponses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        timestamp: new Date().toISOString()
      });
      if (response.status() >= 400) {
        console.log(`[RESPONSE ERROR] ${response.status()} ${response.url()}`);
      }
    });
    
    // Go to streams section
    console.log('📍 Navigating to streams section');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Get the first stream from the table
    console.log('📍 Looking for streams in table');
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    const streamRows = await page.locator('table tbody tr').all();
    console.log(`📊 Found ${streamRows.length} stream rows`);
    
    if (streamRows.length === 0) {
      throw new Error('No streams found in table');
    }
    
    // Get stream ID and details from the first row
    const firstRow = streamRows[0];
    const streamName = await firstRow.locator('td').nth(0).textContent();
    const streamId = await firstRow.getAttribute('data-stream-id') || 
                     await firstRow.locator('[data-testid="preview-stream-button"]').getAttribute('data-stream-id');
    
    console.log(`📺 Testing stream: ${streamName}`);
    console.log(`🆔 Stream ID: ${streamId}`);
    
    // Before clicking preview, let's test the API directly
    console.log('📍 Testing API endpoints directly');
    
    // Test database query endpoint
    const apiResponse = await page.request.get('http://localhost:8080/api/streams');
    const apiData = await apiResponse.json();
    console.log(`📊 API Response Status: ${apiResponse.status()}`);
    console.log(`📊 API Data:`, JSON.stringify(apiData, null, 2));
    
    // Find the specific stream we're testing
    const targetStream = apiData.data?.find(s => s.id === streamId || s.name === streamName);
    if (targetStream) {
      console.log(`📺 Target stream found:`, JSON.stringify(targetStream, null, 2));
      
      // Test the preview endpoint directly via fetch API
      const previewTestResult = await page.evaluate(async (streamId) => {
        try {
          const response = await fetch(`/streams/preview/${streamId}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });
          
          return {
            success: true,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: await response.text()
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }, targetStream.id);
      
      console.log('📊 Direct Preview Test Result:', JSON.stringify(previewTestResult, null, 2));
    }
    
    // Now click the preview button and observe
    console.log('📍 Clicking preview button');
    const previewButton = firstRow.locator('[data-testid="preview-stream-button"]');
    await expect(previewButton).toBeVisible();
    
    await previewButton.click();
    
    // Wait for modal and check its state
    console.log('📍 Checking modal state');
    await page.waitForSelector('.MuiDialog-root', { timeout: 5000 });
    
    const modal = page.locator('.MuiDialog-root');
    const isModalVisible = await modal.isVisible();
    console.log(`🎭 Modal visible: ${isModalVisible}`);
    
    if (isModalVisible) {
      // Check for error messages
      const errorMessages = await modal.locator('.MuiAlert-root, .error-message, [role="alert"]').all();
      console.log(`❌ Found ${errorMessages.length} error elements in modal`);
      
      for (let i = 0; i < errorMessages.length; i++) {
        const errorText = await errorMessages[i].textContent();
        console.log(`   Error ${i + 1}: ${errorText}`);
      }
      
      // Check video element
      const videoElement = modal.locator('video').first();
      if (await videoElement.isVisible()) {
        const videoSrc = await videoElement.getAttribute('src');
        const readyState = await videoElement.evaluate(el => el.readyState);
        const networkState = await videoElement.evaluate(el => el.networkState);
        
        console.log(`📹 Video src: ${videoSrc}`);
        console.log(`📹 Video ready state: ${readyState}`);
        console.log(`📹 Video network state: ${networkState}`);
      }
      
      // Close modal
      const closeButton = modal.locator('button[aria-label="close"], .MuiIconButton-root').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    }
    
    // Summary of all captured network activity related to preview
    console.log('\n📋 NETWORK ACTIVITY SUMMARY:');
    console.log('==========================');
    
    const previewRequests = networkRequests.filter(req => req.url.includes('preview'));
    console.log(`📊 Preview requests: ${previewRequests.length}`);
    previewRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url}`);
    });
    
    const previewResponses = networkResponses.filter(res => res.url.includes('preview'));
    console.log(`📊 Preview responses: ${previewResponses.length}`);
    previewResponses.forEach(res => {
      console.log(`  ${res.status} ${res.statusText} - ${res.url}`);
    });
    
    // Look for any 500 errors
    const serverErrors = networkResponses.filter(res => res.status >= 500);
    console.log(`📊 Server errors (5xx): ${serverErrors.length}`);
    serverErrors.forEach(res => {
      console.log(`  ${res.status} ${res.statusText} - ${res.url}`);
    });
    
    // Look for any 404 errors
    const notFoundErrors = networkResponses.filter(res => res.status === 404);
    console.log(`📊 Not found errors (404): ${notFoundErrors.length}`);
    notFoundErrors.forEach(res => {
      console.log(`  ${res.status} ${res.statusText} - ${res.url}`);
    });
  });
});