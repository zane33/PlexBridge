const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Debug Tests', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000); // 1.5 minutes

    // Capture all console messages and errors
    page.on('console', (msg) => {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    page.on('pageerror', (error) => {
      console.log(`[PAGE ERROR] ${error.message}`);
    });

    page.on('requestfailed', (request) => {
      console.log(`[REQUEST FAILED] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        console.log(`[HTTP ERROR] ${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Debug Stream Preview Process Step by Step', async ({ page }) => {
    console.log('🔍 Starting detailed stream preview debug test');

    // Step 1: Navigate to Stream Manager
    console.log('📍 Step 1: Navigate to Stream Manager');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/debug-01-streams-page.png' });

    // Step 2: Check existing streams
    const streamRows = await page.locator('table tbody tr').count();
    console.log(`📊 Found ${streamRows} existing streams`);

    if (streamRows === 0) {
      console.log('ℹ️ No streams available for testing');
      return;
    }

    // Step 3: Get stream details via API first
    console.log('📍 Step 2: Get stream details via API');
    const apiStreamData = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/streams');
        const streams = await response.json();
        return { success: true, data: streams };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    console.log('📊 API Stream Data:', JSON.stringify(apiStreamData, null, 2));

    if (!apiStreamData.success || apiStreamData.data.length === 0) {
      console.log('❌ Failed to get stream data from API');
      return;
    }

    const firstStream = apiStreamData.data[0];
    console.log(`📺 Testing stream: ${firstStream.name} (ID: ${firstStream.id})`);
    console.log(`🌐 Stream URL: ${firstStream.url}`);

    // Step 4: Test stream preview endpoint directly
    console.log('📍 Step 3: Test preview endpoint directly');
    const previewEndpointTest = await page.evaluate(async (streamId) => {
      try {
        console.log(`Testing preview endpoint: /streams/preview/${streamId}`);
        
        const response = await fetch(`/streams/preview/${streamId}`, {
          method: 'HEAD' // Use HEAD to avoid getting actual stream data
        });
        
        return {
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }, firstStream.id);

    console.log('📊 Preview Endpoint Test Result:', JSON.stringify(previewEndpointTest, null, 2));

    // Step 5: Test with GET request to see actual error
    const previewErrorTest = await page.evaluate(async (streamId) => {
      try {
        const response = await fetch(`/streams/preview/${streamId}`);
        const text = await response.text();
        
        return {
          status: response.status,
          statusText: response.statusText,
          body: text,
          headers: Object.fromEntries(response.headers.entries())
        };
      } catch (error) {
        return {
          error: error.message
        };
      }
    }, firstStream.id);

    console.log('📊 Preview Error Details:', JSON.stringify(previewErrorTest, null, 2));

    // Step 6: Now test the frontend preview button
    console.log('📍 Step 4: Test frontend preview button');
    const firstRow = page.locator('table tbody tr').first();
    const previewButton = firstRow.locator('[data-testid="preview-stream-button"]');

    await page.screenshot({ path: 'test-results/debug-02-before-preview.png' });

    if (!(await previewButton.isVisible())) {
      console.log('❌ Preview button not found in table');
      
      // Debug: List all buttons in the first row
      const buttons = firstRow.locator('button');
      const buttonCount = await buttons.count();
      console.log(`🔘 Found ${buttonCount} buttons in first row:`);
      
      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const text = await button.textContent();
        const testId = await button.getAttribute('data-testid');
        const ariaLabel = await button.getAttribute('aria-label');
        const title = await button.getAttribute('title');
        console.log(`   Button ${i+1}: text="${text}", testid="${testId}", aria-label="${ariaLabel}", title="${title}"`);
      }
      return;
    }

    console.log('✅ Preview button found, clicking...');
    await previewButton.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/debug-03-after-preview-click.png' });

    // Step 7: Check modal state
    console.log('📍 Step 5: Check modal state');
    const modalExists = await page.locator('.MuiDialog-root').count();
    console.log(`🎭 Found ${modalExists} modal elements`);

    if (modalExists > 0) {
      // Get specific modal for preview
      const previewModal = page.locator('.MuiDialog-root').last(); // Use last if multiple modals
      const isModalVisible = await previewModal.isVisible();
      console.log(`🎭 Preview modal visible: ${isModalVisible}`);

      if (isModalVisible) {
        await page.screenshot({ path: 'test-results/debug-04-modal-opened.png' });

        // Check modal content
        const modalTitle = await previewModal.locator('.MuiDialogTitle-root').textContent();
        console.log(`📰 Modal title: ${modalTitle}`);

        // Check for video element
        const videoElement = previewModal.locator('video');
        const videoExists = await videoElement.count();
        console.log(`📹 Video elements in modal: ${videoExists}`);

        if (videoExists > 0) {
          const video = videoElement.first();
          const videoSrc = await video.getAttribute('src');
          const videoError = await video.evaluate(v => v.error);
          const readyState = await video.evaluate(v => v.readyState);
          const networkState = await video.evaluate(v => v.networkState);

          console.log('📹 Video element details:');
          console.log(`   Source: ${videoSrc || 'not set'}`);
          console.log(`   Ready state: ${readyState}`);
          console.log(`   Network state: ${networkState}`);
          console.log(`   Error: ${videoError ? `${videoError.code} - ${videoError.message}` : 'none'}`);

          // Wait a bit to see if video loads
          await page.waitForTimeout(5000);
          const finalReadyState = await video.evaluate(v => v.readyState);
          const finalError = await video.evaluate(v => v.error);
          
          console.log(`📹 Final video state after 5s:`);
          console.log(`   Ready state: ${finalReadyState}`);
          console.log(`   Error: ${finalError ? `${finalError.code} - ${finalError.message}` : 'none'}`);

          await page.screenshot({ path: 'test-results/debug-05-video-state.png' });

          // Check Video.js if present
          const videojsPlayer = previewModal.locator('.video-js');
          if (await videojsPlayer.isVisible()) {
            const playerClasses = await videojsPlayer.getAttribute('class');
            console.log(`📺 Video.js player classes: ${playerClasses}`);
          }
        }

        // Check for error messages in modal
        const errorMessages = previewModal.locator('.MuiAlert-root, .error, [class*="error"]');
        const errorCount = await errorMessages.count();
        if (errorCount > 0) {
          console.log(`❌ Found ${errorCount} error messages in modal:`);
          for (let i = 0; i < errorCount; i++) {
            const errorText = await errorMessages.nth(i).textContent();
            console.log(`   Error ${i+1}: ${errorText}`);
          }
        }

        // Try to close modal
        const closeButton = previewModal.locator('button[aria-label="close"], .MuiDialogTitle-root button');
        if (await closeButton.isVisible()) {
          await closeButton.click();
          await page.waitForTimeout(1000);
          console.log('✅ Modal closed');
        }
      }
    }

    // Step 8: Final summary
    console.log('\\n📋 STREAM PREVIEW DEBUG SUMMARY:');
    console.log('==================================');
    console.log(`🔗 Stream URL: ${firstStream.url}`);
    console.log(`🌐 Preview endpoint status: ${previewErrorTest.status || 'failed'}`);
    console.log(`❌ Preview endpoint error: ${previewErrorTest.body || 'none'}`);
    console.log(`✅ Frontend button found: ${await previewButton.isVisible()}`);
    console.log(`🎭 Modal opened: ${modalExists > 0}`);
    
    await page.screenshot({ path: 'test-results/debug-06-final-state.png' });
  });

  test('Test Stream Validation Endpoint', async ({ page }) => {
    console.log('🔍 Testing stream validation endpoint');

    // Get stream data first
    const streamData = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/streams');
        const streams = await response.json();
        return streams.length > 0 ? streams[0] : null;
      } catch (error) {
        return null;
      }
    });

    if (!streamData) {
      console.log('ℹ️ No streams available for validation test');
      return;
    }

    console.log(`📺 Testing validation for: ${streamData.name}`);

    // Test stream validation
    const validationResult = await page.evaluate(async (stream) => {
      try {
        const response = await fetch('/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: stream.url,
            type: stream.type
          })
        });

        const result = await response.json();
        return {
          status: response.status,
          success: response.ok,
          data: result
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }, streamData);

    console.log('📊 Stream Validation Result:');
    console.log(JSON.stringify(validationResult, null, 2));

    if (validationResult.success && validationResult.data.valid) {
      console.log('✅ Stream validation passed - stream should work');
    } else {
      console.log('❌ Stream validation failed - this explains preview issues');
    }
  });
});