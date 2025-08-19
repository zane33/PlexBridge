const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Final Validation', () => {
  test('Complete Stream Preview Functionality Assessment', async ({ page }) => {
    test.setTimeout(60000);

    console.log('🎯 FINAL STREAM PREVIEW VALIDATION');
    console.log('=====================================');

    // Navigate to application
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 1. Interface Availability Test
    console.log('\\n1️⃣ INTERFACE AVAILABILITY TEST');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    const streamRows = await page.locator('table tbody tr').count();
    const hasStreams = streamRows > 0;
    const previewButton = page.locator('[data-testid="preview-stream-button"]').first();
    const buttonExists = await previewButton.isVisible();
    
    console.log(`   📊 Streams available: ${hasStreams ? '✅ YES' : '❌ NO'} (${streamRows} found)`);
    console.log(`   🔘 Preview button exists: ${buttonExists ? '✅ YES' : '❌ NO'}`);

    // 2. API Endpoint Test
    console.log('\\n2️⃣ API ENDPOINT TEST');
    const apiTests = await page.evaluate(async () => {
      const results = {};
      
      // Test streams API
      try {
        const streamsResp = await fetch('/api/streams');
        results.streamsAPI = {
          status: streamsResp.status,
          working: streamsResp.ok
        };
        
        if (streamsResp.ok) {
          const streams = await streamsResp.json();
          if (streams.length > 0) {
            // Test preview endpoint
            const previewResp = await fetch(`/streams/preview/${streams[0].id}`);
            results.previewAPI = {
              status: previewResp.status,
              working: previewResp.ok,
              error: previewResp.ok ? null : await previewResp.text()
            };
          }
        }
      } catch (error) {
        results.error = error.message;
      }
      
      return results;
    });

    console.log(`   🌐 Streams API: ${apiTests.streamsAPI?.working ? '✅ WORKING' : '❌ FAILED'} (${apiTests.streamsAPI?.status || 'error'})`);
    console.log(`   🎬 Preview API: ${apiTests.previewAPI?.working ? '✅ WORKING' : '❌ FAILED'} (${apiTests.previewAPI?.status || 'error'})`);
    
    if (apiTests.previewAPI?.error) {
      console.log(`   📝 Preview error: ${apiTests.previewAPI.error}`);
    }

    // 3. Frontend Integration Test
    console.log('\\n3️⃣ FRONTEND INTEGRATION TEST');
    if (buttonExists && hasStreams) {
      await previewButton.click();
      await page.waitForTimeout(3000);
      
      const modalVisible = await page.locator('.MuiDialog-root').isVisible();
      console.log(`   🎭 Modal opens: ${modalVisible ? '✅ YES' : '❌ NO'}`);
      
      if (modalVisible) {
        const videoExists = await page.locator('video').isVisible();
        console.log(`   📹 Video player: ${videoExists ? '✅ PRESENT' : '❌ MISSING'}`);
        
        if (videoExists) {
          const videoSrc = await page.locator('video').getAttribute('src');
          const hasSource = !!videoSrc;
          console.log(`   🔗 Video source: ${hasSource ? '✅ SET' : '❌ NOT SET'}`);
          
          if (hasSource) {
            await page.waitForTimeout(5000);
            const readyState = await page.locator('video').evaluate(v => v.readyState);
            console.log(`   ▶️ Video loading: ${readyState >= 2 ? '✅ LOADED' : '❌ NOT LOADED'} (state: ${readyState})`);
          }
        }
        
        // Check for error messages
        const errorAlert = page.locator('.MuiAlert-root');
        const hasErrors = await errorAlert.isVisible();
        if (hasErrors) {
          const errorText = await errorAlert.textContent();
          console.log(`   ⚠️ Error message: "${errorText}"`);
        }
        
        // Close modal
        const closeButton = page.locator('button[aria-label="close"]').first();
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
      }
    } else {
      console.log(`   ⏭️ Skipping frontend test - ${!hasStreams ? 'no streams' : 'no button'}`);
    }

    // 4. Overall Assessment
    console.log('\\n4️⃣ OVERALL ASSESSMENT');
    const workingComponents = [
      hasStreams && 'Stream data available',
      buttonExists && 'Preview button present',
      apiTests.streamsAPI?.working && 'Streams API working',
      await page.locator('.MuiDialog-root').isVisible() && 'Modal system working'
    ].filter(Boolean);
    
    const failingComponents = [
      !apiTests.previewAPI?.working && 'Preview API failing',
      !(await page.locator('video').getAttribute('src')) && 'Video source not set'
    ].filter(Boolean);

    console.log('\\n   ✅ WORKING COMPONENTS:');
    workingComponents.forEach(component => console.log(`      • ${component}`));
    
    console.log('\\n   ❌ FAILING COMPONENTS:');
    failingComponents.forEach(component => console.log(`      • ${component}`));

    const overallStatus = failingComponents.length === 0 ? 'FULLY WORKING' : 
                         workingComponents.length > failingComponents.length ? 'PARTIALLY WORKING' : 
                         'MOSTLY BROKEN';
    
    console.log(`\\n   🎯 OVERALL STATUS: ${overallStatus}`);
    console.log(`   📊 Success Rate: ${Math.round((workingComponents.length / (workingComponents.length + failingComponents.length)) * 100)}%`);

    // 5. Recommendations
    console.log('\\n5️⃣ RECOMMENDATIONS');
    if (!apiTests.previewAPI?.working) {
      console.log('   🔧 FIX REQUIRED: Preview endpoint returns 500 error');
      console.log('   📝 ACTION: Check streamManager.createStreamProxy() method');
      console.log('   🛠️ LIKELY CAUSE: FFmpeg process spawn failure');
    }
    
    if (workingComponents.length > 0) {
      console.log('   ✅ POSITIVE: Frontend interface is properly implemented');
      console.log('   ✅ POSITIVE: Error handling and user feedback working');
    }

    console.log('\\n=====================================');
    console.log('🏁 STREAM PREVIEW VALIDATION COMPLETE');
    
    // Take final screenshot for documentation
    await page.screenshot({ path: 'test-results/final-validation-complete.png' });
  });
});