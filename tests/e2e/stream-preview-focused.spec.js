const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000); // 1 minute

    // Capture console and error messages
    page.on('console', (msg) => {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    page.on('pageerror', (error) => {
      console.log(`[PAGE ERROR] ${error.message}`);
    });

    page.on('requestfailed', (request) => {
      console.log(`[REQUEST FAILED] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Stream Preview Modal and Video Element Test', async ({ page }) => {
    console.log('🔍 Testing stream preview modal and video element presence');

    // Navigate to Stream Manager
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/focused-01-streams-page.png' });

    // Check for existing streams
    const streamRows = await page.locator('table tbody tr').count();
    console.log(`📊 Found ${streamRows} existing streams`);

    if (streamRows === 0) {
      console.log('ℹ️ No streams found to test preview');
      return;
    }

    // Get the first stream details
    const firstRow = page.locator('table tbody tr').first();
    const streamName = await firstRow.locator('td').nth(1).textContent();
    console.log(`📺 Testing stream: ${streamName}`);

    // Look for preview button
    const previewButton = firstRow.locator('[data-testid="preview-stream-button"]');
    
    if (!(await previewButton.isVisible())) {
      console.log('❌ Preview button not found');
      await page.screenshot({ path: 'test-results/focused-02-no-preview-button.png' });
      
      // List all buttons in the row for debugging
      const buttons = firstRow.locator('button');
      const buttonCount = await buttons.count();
      console.log(`Found ${buttonCount} buttons in row:`);
      
      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const text = await button.textContent();
        const testId = await button.getAttribute('data-testid');
        const ariaLabel = await button.getAttribute('aria-label');
        console.log(`  Button ${i+1}: text="${text}", testid="${testId}", aria-label="${ariaLabel}"`);
      }
      return;
    }

    console.log('✅ Preview button found, clicking...');
    await previewButton.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/focused-03-after-preview-click.png' });

    // Check if modal opened
    const previewModal = page.locator('.MuiDialog-root, [role="dialog"]');
    const isModalVisible = await previewModal.isVisible();
    
    console.log(`🎭 Preview modal visible: ${isModalVisible ? 'YES' : 'NO'}`);
    
    if (!isModalVisible) {
      console.log('❌ Preview modal did not open');
      await page.screenshot({ path: 'test-results/focused-04-modal-not-opened.png' });
      return;
    }

    await page.screenshot({ path: 'test-results/focused-05-modal-opened.png' });

    // Check for video element
    const videoElement = page.locator('video');
    const isVideoVisible = await videoElement.isVisible();
    
    console.log(`📹 Video element visible: ${isVideoVisible ? 'YES' : 'NO'}`);

    if (isVideoVisible) {
      // Get video properties
      const videoSrc = await videoElement.getAttribute('src');
      const videoCurrentTime = await videoElement.evaluate(v => v.currentTime);
      const videoReadyState = await videoElement.evaluate(v => v.readyState);
      const videoNetworkState = await videoElement.evaluate(v => v.networkState);
      const videoError = await videoElement.evaluate(v => v.error);
      
      console.log('📹 Video Properties:');
      console.log(`   Source: ${videoSrc || 'not set'}`);
      console.log(`   Current time: ${videoCurrentTime}`);
      console.log(`   Ready state: ${videoReadyState} (0=nothing, 1=metadata, 2=current, 3=future, 4=enough)`);
      console.log(`   Network state: ${videoNetworkState} (0=empty, 1=idle, 2=loading, 3=no_source)`);
      console.log(`   Error: ${videoError ? `${videoError.code} - ${videoError.message}` : 'none'}`);

      await page.screenshot({ path: 'test-results/focused-06-video-element-found.png' });

      // Check if video has a source in data attribute or other attributes
      const dataSrc = await videoElement.getAttribute('data-src');
      const poster = await videoElement.getAttribute('poster');
      
      console.log(`   Data-src: ${dataSrc || 'not set'}`);
      console.log(`   Poster: ${poster || 'not set'}`);

      // Wait a bit to see if the video loads
      await page.waitForTimeout(5000);
      
      const finalReadyState = await videoElement.evaluate(v => v.readyState);
      const finalError = await videoElement.evaluate(v => v.error);
      
      console.log(`📹 Final video state:`);
      console.log(`   Ready state: ${finalReadyState}`);
      console.log(`   Error: ${finalError ? `${finalError.code} - ${finalError.message}` : 'none'}`);

      if (finalReadyState >= 1) {
        console.log('✅ Video loaded metadata successfully');
      } else if (finalError) {
        console.log('❌ Video has error');
      } else {
        console.log('⚠️ Video has no source or not loading');
      }
    }

    // Check for Video.js player
    const videojsPlayer = page.locator('.video-js');
    if (await videojsPlayer.isVisible()) {
      console.log('📺 Video.js player detected');
      const playerClasses = await videojsPlayer.getAttribute('class');
      console.log(`   Player classes: ${playerClasses}`);
    }

    // Check for any error messages in the modal
    const errorMessages = previewModal.locator('.MuiAlert-root, .error, [class*="error"]');
    const errorCount = await errorMessages.count();
    if (errorCount > 0) {
      console.log(`❌ Found ${errorCount} error messages in modal:`);
      for (let i = 0; i < errorCount; i++) {
        const errorText = await errorMessages.nth(i).textContent();
        console.log(`   Error ${i+1}: ${errorText}`);
      }
    }

    // Check the modal content
    const modalContent = await previewModal.locator('.MuiDialogContent-root, [class*="content"]').textContent();
    console.log(`📄 Modal content preview: ${modalContent?.substring(0, 200) || 'empty'}...`);

    // Try to close the modal
    const closeButton = previewModal.locator('button[aria-label="close"], .MuiDialogTitle-root button, button:has-text("Close")');
    if (await closeButton.first().isVisible()) {
      await closeButton.first().click();
      await page.waitForTimeout(1000);
      console.log('✅ Modal closed');
    }

    await page.screenshot({ path: 'test-results/focused-07-final-state.png' });

    // Summary
    console.log('\\n📋 STREAM PREVIEW TEST SUMMARY:');
    console.log('================================');
    console.log(`✅ Preview button found: ${await previewButton.isVisible()}`);
    console.log(`✅ Modal opened: ${isModalVisible}`);
    console.log(`✅ Video element found: ${isVideoVisible}`);
    
    if (isVideoVisible) {
      const hasSrc = !!(await videoElement.getAttribute('src'));
      const hasDataSrc = !!(await videoElement.getAttribute('data-src'));
      console.log(`✅ Video has source: ${hasSrc || hasDataSrc}`);
    }
  });

  test('Stream Preview API Endpoints Test', async ({ page }) => {
    console.log('🔍 Testing stream preview API endpoints');

    // Test API calls directly
    const apiTestResults = await page.evaluate(async () => {
      const results = [];
      
      try {
        // Test main streams API
        const streamsResp = await fetch('/api/streams');
        results.push({
          test: 'GET /api/streams',
          status: streamsResp.status,
          success: streamsResp.ok
        });

        if (streamsResp.ok) {
          const streams = await streamsResp.json();
          results.push({
            test: 'Streams data',
            count: streams.length,
            success: streams.length > 0
          });

          if (streams.length > 0) {
            const firstStream = streams[0];
            
            // Test preview endpoint
            const previewUrl = `/streams/preview/${firstStream.id}`;
            const previewResp = await fetch(previewUrl, { method: 'HEAD' });
            results.push({
              test: `HEAD ${previewUrl}`,
              status: previewResp.status,
              success: previewResp.ok,
              contentType: previewResp.headers.get('content-type')
            });
          }
        }

        // Test health endpoint
        const healthResp = await fetch('/health');
        results.push({
          test: 'GET /health',
          status: healthResp.status,
          success: healthResp.ok
        });

      } catch (error) {
        results.push({
          test: 'API Test Error',
          error: error.message,
          success: false
        });
      }

      return results;
    });

    console.log('📊 API Test Results:');
    apiTestResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const details = result.status ? `(${result.status})` : 
                     result.count !== undefined ? `(${result.count} items)` : 
                     result.error ? `(${result.error})` : '';
      console.log(`   ${status} ${result.test} ${details}`);
      
      if (result.contentType) {
        console.log(`      Content-Type: ${result.contentType}`);
      }
    });

    await page.screenshot({ path: 'test-results/focused-api-test.png' });
  });
});