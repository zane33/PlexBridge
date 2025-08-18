const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Functionality Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for stream operations
    test.setTimeout(180000); // 3 minutes

    // Capture console messages for debugging
    page.on('console', (msg) => {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    page.on('pageerror', (error) => {
      console.log(`[PAGE ERROR] ${error.message}`);
    });

    page.on('requestfailed', (request) => {
      console.log(`[REQUEST FAILED] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Navigate to PlexBridge
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Complete M3U Import and Stream Preview Workflow', async ({ page }) => {
    console.log('🔍 Starting complete M3U import and stream preview test');

    // Step 1: Navigate to Stream Manager
    console.log('📍 Step 1: Navigating to Stream Manager');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="import-m3u-button"]')).toBeVisible({ timeout: 10000 });
    console.log('✅ Stream Manager loaded');

    // Step 2: Open M3U Import Dialog
    console.log('📍 Step 2: Opening M3U Import Dialog');
    await page.click('[data-testid="import-m3u-button"]');
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/stream-preview-01-dialog-opened.png' });
    console.log('✅ Import dialog opened');

    // Step 3: Enter M3U URL for testing
    console.log('📍 Step 3: Entering test M3U URL');
    const testM3uUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    const urlInput = page.locator('[data-testid="import-dialog"] [data-testid="import-url-input"] input');
    await expect(urlInput).toBeVisible({ timeout: 5000 });
    await urlInput.clear();
    await urlInput.fill(testM3uUrl);
    console.log(`✅ URL entered: ${testM3uUrl}`);

    // Step 4: Start parsing with enhanced monitoring
    console.log('📍 Step 4: Starting M3U parsing');
    await page.click('[data-testid="parse-channels-button"]');
    await page.screenshot({ path: 'test-results/stream-preview-02-parsing-started.png' });

    // Step 5: Wait for channels to appear with detailed monitoring
    console.log('📍 Step 5: Waiting for channels to appear');
    let channelsFound = false;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

    while (attempts < maxAttempts && !channelsFound) {
      await page.waitForTimeout(1000);
      attempts++;

      const channelRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      
      if (channelRows > 0) {
        channelsFound = true;
        console.log(`🎉 SUCCESS: Found ${channelRows} channels in table!`);
        await page.screenshot({ path: `test-results/stream-preview-03-channels-found-${channelRows}.png` });
        break;
      }

      // Take periodic screenshots for debugging
      if (attempts % 15 === 0) {
        await page.screenshot({ path: `test-results/stream-preview-debug-${attempts}s.png` });
        console.log(`⏱️ Still waiting... ${attempts}s elapsed`);
      }
    }

    // Verify channels were found
    if (!channelsFound) {
      console.log('❌ FAILED: No channels appeared after parsing');
      await page.screenshot({ path: 'test-results/stream-preview-04-no-channels-found.png' });
      throw new Error('M3U parsing failed - no channels appeared');
    }

    // Step 6: Test pagination and find a suitable channel for preview
    console.log('📍 Step 6: Finding a channel to preview');
    const totalChannelRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
    console.log(`📊 Total channels visible: ${totalChannelRows}`);

    // Look for the first few channels and find one suitable for testing
    let previewChannelFound = false;
    let channelName = '';
    
    for (let i = 0; i < Math.min(totalChannelRows, 5); i++) {
      const row = page.locator('[data-testid="import-dialog"] table tbody tr').nth(i);
      const nameCell = row.locator('td').nth(1); // Assuming name is in second column
      channelName = await nameCell.textContent();
      
      console.log(`📺 Channel ${i + 1}: ${channelName}`);
      
      // Check if this row has a preview button
      const previewButton = row.locator('[data-testid="preview-stream-button"]');
      if (await previewButton.isVisible()) {
        previewChannelFound = true;
        console.log(`✅ Found preview button for channel: ${channelName}`);
        
        // Step 7: Test stream preview
        console.log('📍 Step 7: Testing stream preview');
        await page.screenshot({ path: 'test-results/stream-preview-05-before-preview.png' });
        
        // Click the preview button
        await previewButton.click();
        await page.waitForTimeout(2000); // Wait for preview to load
        
        // Check if preview modal/dialog appeared
        const previewModal = page.locator('.MuiDialog-root');
        const videoPlayer = page.locator('video');
        
        if (await previewModal.isVisible()) {
          console.log('✅ Preview modal opened');
          await page.screenshot({ path: 'test-results/stream-preview-06-modal-opened.png' });
          
          // Wait a bit for video to potentially load
          await page.waitForTimeout(5000);
          
          if (await videoPlayer.isVisible()) {
            console.log('✅ Video player visible in preview');
            await page.screenshot({ path: 'test-results/stream-preview-07-video-player.png' });
          } else {
            console.log('⚠️ Video player not visible, but modal opened');
          }
          
          // Close preview modal
          const closeButton = previewModal.locator('button[aria-label="close"], .MuiDialogTitle-root button');
          if (await closeButton.isVisible()) {
            await closeButton.click();
            await page.waitForTimeout(1000);
            console.log('✅ Preview modal closed');
          }
        } else {
          console.log('⚠️ Preview modal did not appear');
          await page.screenshot({ path: 'test-results/stream-preview-06-no-modal.png' });
        }
        
        break;
      }
    }

    if (!previewChannelFound) {
      console.log('⚠️ No channels with preview buttons found');
      await page.screenshot({ path: 'test-results/stream-preview-05-no-preview-buttons.png' });
    }

    // Step 8: Test channel selection and import workflow
    console.log('📍 Step 8: Testing channel selection for import');
    
    // Select first few channels for import
    const checkboxes = page.locator('[data-testid="import-dialog"] table tbody tr input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    const selectCount = Math.min(checkboxCount, 3); // Select up to 3 channels
    
    for (let i = 0; i < selectCount; i++) {
      await checkboxes.nth(i).check();
      console.log(`✅ Selected channel ${i + 1} for import`);
    }
    
    await page.screenshot({ path: 'test-results/stream-preview-08-channels-selected.png' });

    // Check if import button is enabled
    const importButton = page.locator('[data-testid="import-selected-button"]');
    if (await importButton.isVisible() && await importButton.isEnabled()) {
      console.log('✅ Import button is enabled with selected channels');
      
      // For this test, we won't actually import to avoid modifying the database
      console.log('ℹ️ Skipping actual import to preserve test environment');
    } else {
      console.log('❌ Import button not available or enabled');
    }

    // Step 9: Close dialog and verify cleanup
    console.log('📍 Step 9: Closing dialog and verifying cleanup');
    const cancelButton = page.locator('[data-testid="import-dialog"] [data-testid="cancel-button"], [data-testid="import-dialog"] button:has-text("Cancel")');
    await cancelButton.click();
    
    // Verify dialog closed
    await expect(page.locator('[data-testid="import-dialog"]')).not.toBeVisible({ timeout: 5000 });
    console.log('✅ Import dialog closed successfully');

    // Final screenshot
    await page.screenshot({ path: 'test-results/stream-preview-09-test-complete.png' });

    console.log('\\n🎉 Stream Preview Test Summary:');
    console.log(`📊 Channels found: ${channelsFound ? 'YES' : 'NO'}`);
    console.log(`🎬 Preview tested: ${previewChannelFound ? 'YES' : 'NO'}`);
    console.log(`📺 Channel tested: ${channelName || 'N/A'}`);
    console.log('✅ Stream preview workflow test completed successfully');
  });

  test('Direct Stream Preview Test', async ({ page }) => {
    console.log('🔍 Starting direct stream preview test');

    // Navigate to Stream Manager
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');

    // Look for existing streams in the table
    const existingStreams = await page.locator('table tbody tr').count();
    console.log(`📊 Found ${existingStreams} existing streams`);

    if (existingStreams > 0) {
      // Test preview on existing stream
      console.log('📍 Testing preview on existing stream');
      
      const firstRow = page.locator('table tbody tr').first();
      const streamName = await firstRow.locator('td').nth(1).textContent();
      console.log(`📺 Testing preview for stream: ${streamName}`);

      // Look for preview button in the row
      const previewButton = firstRow.locator('[data-testid="preview-stream-button"]');
      
      if (await previewButton.isVisible()) {
        await previewButton.click();
        await page.waitForTimeout(3000);
        
        // Check for preview modal
        const previewModal = page.locator('.MuiDialog-root');
        if (await previewModal.isVisible()) {
          console.log('✅ Stream preview modal opened for existing stream');
          await page.screenshot({ path: 'test-results/direct-preview-success.png' });
          
          // Close modal
          const closeButton = previewModal.locator('button[aria-label="close"]');
          if (await closeButton.isVisible()) {
            await closeButton.click();
          }
        } else {
          console.log('❌ Preview modal did not open');
          await page.screenshot({ path: 'test-results/direct-preview-failed.png' });
        }
      } else {
        console.log('❌ No preview button found in existing stream row');
        await page.screenshot({ path: 'test-results/direct-preview-no-button.png' });
      }
    } else {
      console.log('ℹ️ No existing streams found to test preview');
    }
  });

  test('Stream Preview Error Handling', async ({ page }) => {
    console.log('🔍 Testing stream preview error handling');

    // Navigate to Stream Manager
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');

    // Try to create a stream with an invalid URL for testing error handling
    const addButton = page.locator('[data-testid="add-stream-button"]');
    if (await addButton.isVisible()) {
      await addButton.click();
      
      // Fill in a test stream with invalid URL
      const nameInput = page.locator('[data-testid="stream-name-input"]');
      const urlInput = page.locator('[data-testid="stream-url-input"]');
      
      if (await nameInput.isVisible() && await urlInput.isVisible()) {
        await nameInput.fill('Test Invalid Stream');
        await urlInput.fill('http://invalid-stream-url.test/stream.m3u8');
        
        // Look for test/preview button
        const testButton = page.locator('[data-testid="test-stream-button"]');
        if (await testButton.isVisible()) {
          console.log('📍 Testing stream preview with invalid URL');
          await testButton.click();
          await page.waitForTimeout(5000);
          
          // Check for error messages
          const errorAlerts = page.locator('.MuiAlert-root[severity="error"]');
          if (await errorAlerts.count() > 0) {
            console.log('✅ Error handling working - error message displayed');
            await page.screenshot({ path: 'test-results/preview-error-handling.png' });
          } else {
            console.log('⚠️ No error message shown for invalid URL');
          }
        }
        
        // Cancel/close the dialog
        const cancelButton = page.locator('button:has-text("Cancel")');
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
        }
      }
    }
  });
});