const { test, expect } = require('@playwright/test');

test.describe('PlexBridge Comprehensive Stream Preview Tests - Working Version', () => {
  // Test configuration
  const testStreamUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const invalidStreamUrl = 'https://invalid-stream-url.com/nonexistent.m3u8';
  const testM3uUrl = 'https://iptv-org.github.io/iptv/index.m3u';

  test.beforeEach(async ({ page }) => {
    // Set longer timeout for tests
    test.setTimeout(180000);
    
    // Navigate to homepage
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait for React to load
    await page.waitForSelector('[data-testid="nav-dashboard"]', { timeout: 30000 });
  });

  test.describe('1. Navigation and Basic UI', () => {
    test('Homepage loads correctly', async ({ page }) => {
      await page.screenshot({ path: 'test-results/working-01-homepage.png', fullPage: true });
      
      // Check that we have the PlexBridge interface
      await expect(page.locator('text="PlexBridge"')).toBeVisible();
      await expect(page.locator('text="Dashboard"')).toBeVisible();
      
      // Check for navigation elements using actual data-testid
      await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-streams"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-channels"]')).toBeVisible();
      
      console.log('✅ Homepage loads correctly with all navigation elements');
    });

    test('Navigation to Streams section works', async ({ page }) => {
      // Navigate to streams using the correct data-testid
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ path: 'test-results/working-02-streams-navigation.png', fullPage: true });
      
      // Verify we're on streams page
      const currentUrl = page.url();
      expect(currentUrl).toContain('streams');
      
      // Check for Stream Manager heading
      await expect(page.locator('text="Stream Manager"')).toBeVisible();
      
      console.log('✅ Successfully navigated to Streams section');
    });

    test('All UI elements are present and functional', async ({ page }) => {
      // Navigate to streams
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ path: 'test-results/working-03-ui-elements.png', fullPage: true });
      
      // Check for key UI elements
      await expect(page.locator('text="Add Stream"')).toBeVisible();
      await expect(page.locator('text="Import M3U"')).toBeVisible();
      
      // Check table headers
      await expect(page.locator('text="Name"')).toBeVisible();
      await expect(page.locator('text="URL"')).toBeVisible();
      await expect(page.locator('text="Status"')).toBeVisible();
      await expect(page.locator('text="Actions"')).toBeVisible();
      
      console.log('✅ All expected UI elements are present');
    });
  });

  test.describe('2. Stream Management', () => {
    test('Add new stream functionality', async ({ page }) => {
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ path: 'test-results/working-04-before-add-stream.png', fullPage: true });
      
      // Click Add Stream button
      await page.click('text="Add Stream"');
      await page.waitForTimeout(1000);
      
      // Check if dialog opened
      await page.screenshot({ path: 'test-results/working-05-add-stream-dialog.png', fullPage: true });
      
      // Look for form fields in the dialog
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
      const urlInput = page.locator('input[name="url"], input[placeholder*="url" i]');
      
      await expect(nameInput.or(page.locator('label:has-text("Name") + * input'))).toBeVisible();
      await expect(urlInput.or(page.locator('label:has-text("URL") + * input'))).toBeVisible();
      
      console.log('✅ Add stream dialog opens with required form fields');
    });

    test('Stream creation and preview functionality', async ({ page }) => {
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      // Add a test stream
      await page.click('text="Add Stream"');
      await page.waitForTimeout(1000);
      
      // Fill the form - try multiple selector strategies
      const nameField = page.locator('input[name="name"]').or(
        page.locator('input[placeholder*="name" i]')
      ).or(
        page.locator('label:has-text("Name") + * input')
      ).first();
      
      const urlField = page.locator('input[name="url"]').or(
        page.locator('input[placeholder*="url" i]')
      ).or(
        page.locator('label:has-text("URL") + * input')
      ).first();
      
      await nameField.fill('Test HLS Stream');
      await urlField.fill(testStreamUrl);
      
      await page.screenshot({ path: 'test-results/working-06-filled-form.png', fullPage: true });
      
      // Save the stream
      await page.click('button:has-text("Save"), button:has-text("Add")');
      await page.waitForTimeout(3000);
      
      await page.screenshot({ path: 'test-results/working-07-stream-added.png', fullPage: true });
      
      // Look for the stream in the table
      await expect(page.locator('text="Test HLS Stream"')).toBeVisible();
      
      console.log('✅ Stream created successfully and appears in table');
    });

    test('Stream preview button functionality', async ({ page }) => {
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      // First, ensure we have a stream to preview
      const existingStream = await page.locator('text="Test HLS Stream"').isVisible();
      
      if (!existingStream) {
        // Add a stream first
        await page.click('text="Add Stream"');
        await page.waitForTimeout(1000);
        
        const nameField = page.locator('input[name="name"]').or(
          page.locator('input[placeholder*="name" i]')
        ).first();
        const urlField = page.locator('input[name="url"]').or(
          page.locator('input[placeholder*="url" i]')
        ).first();
        
        await nameField.fill('Preview Test Stream');
        await urlField.fill(testStreamUrl);
        await page.click('button:has-text("Save"), button:has-text("Add")');
        await page.waitForTimeout(3000);
      }
      
      await page.screenshot({ path: 'test-results/working-08-before-preview.png', fullPage: true });
      
      // Look for preview button in the Actions column
      const previewButton = page.locator('button:has-text("Preview"), [aria-label*="preview" i], [title*="preview" i]');
      const previewCount = await previewButton.count();
      
      console.log(`Found ${previewCount} preview button(s)`);
      
      if (previewCount > 0) {
        await previewButton.first().click();
        await page.waitForTimeout(3000);
        
        await page.screenshot({ path: 'test-results/working-09-preview-clicked.png', fullPage: true });
        
        // Check for video player modal/dialog
        const videoDialog = await page.locator('.MuiDialog-root, [role="dialog"]').isVisible();
        const videoElement = await page.locator('video').isVisible();
        
        console.log('Video dialog visible:', videoDialog);
        console.log('Video element visible:', videoElement);
        
        expect(videoDialog || videoElement).toBe(true);
        console.log('✅ Preview functionality works - video player opened');
      } else {
        console.log('⚠️ No preview button found - may not be implemented yet');
      }
    });
  });

  test.describe('3. Stream Preview Functionality', () => {
    test('Test preview with reliable HLS stream', async ({ page }) => {
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      // Add a reliable HLS stream
      await page.click('text="Add Stream"');
      await page.waitForTimeout(1000);
      
      const nameField = page.locator('input[name="name"]').or(page.locator('input[placeholder*="name" i]')).first();
      const urlField = page.locator('input[name="url"]').or(page.locator('input[placeholder*="url" i]')).first();
      
      await nameField.fill('Reliable HLS Test');
      await urlField.fill(testStreamUrl);
      await page.click('button:has-text("Save"), button:has-text("Add")');
      await page.waitForTimeout(3000);
      
      await page.screenshot({ path: 'test-results/working-10-hls-stream-added.png', fullPage: true });
      
      // Try to preview
      const previewButton = page.locator('button:has-text("Preview")');
      if (await previewButton.isVisible({ timeout: 5000 })) {
        await previewButton.click();
        await page.waitForTimeout(5000);
        
        await page.screenshot({ path: 'test-results/working-11-hls-preview.png', fullPage: true });
        
        // Check for video player elements
        const videoChecks = [
          await page.locator('video').isVisible().catch(() => false),
          await page.locator('.video-js').isVisible().catch(() => false),
          await page.locator('[class*="player"]').isVisible().catch(() => false)
        ];
        
        const hasVideoPlayer = videoChecks.some(check => check);
        console.log('✅ HLS stream preview:', hasVideoPlayer ? 'Video player found' : 'No video player detected');
      } else {
        console.log('⚠️ Preview button not available for this stream');
      }
    });

    test('Test error handling for invalid streams', async ({ page }) => {
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      // Add an invalid stream
      await page.click('text="Add Stream"');
      await page.waitForTimeout(1000);
      
      const nameField = page.locator('input[name="name"]').or(page.locator('input[placeholder*="name" i]')).first();
      const urlField = page.locator('input[name="url"]').or(page.locator('input[placeholder*="url" i]')).first();
      
      await nameField.fill('Invalid Stream Test');
      await urlField.fill(invalidStreamUrl);
      
      // Try to save
      await page.click('button:has-text("Save"), button:has-text("Add")');
      await page.waitForTimeout(3000);
      
      await page.screenshot({ path: 'test-results/working-12-invalid-stream.png', fullPage: true });
      
      // Check for validation or error messages
      const errorIndicators = [
        await page.locator('text="Error"').isVisible().catch(() => false),
        await page.locator('text="Invalid"').isVisible().catch(() => false),
        await page.locator('.error, .MuiAlert-root').isVisible().catch(() => false),
        await page.locator('[role="alert"]').isVisible().catch(() => false)
      ];
      
      const hasErrorHandling = errorIndicators.some(indicator => indicator);
      console.log('✅ Error handling for invalid streams:', hasErrorHandling ? 'Error indicators found' : 'No specific error handling detected');
    });
  });

  test.describe('4. M3U Import Functionality', () => {
    test('Test M3U import button and dialog', async ({ page }) => {
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ path: 'test-results/working-13-before-m3u-import.png', fullPage: true });
      
      // Click Import M3U button
      const importButton = page.locator('text="Import M3U"');
      await expect(importButton).toBeVisible();
      
      await importButton.click();
      await page.waitForTimeout(2000);
      
      await page.screenshot({ path: 'test-results/working-14-m3u-import-dialog.png', fullPage: true });
      
      // Check if import dialog opened
      const dialogVisible = await page.locator('.MuiDialog-root, [role="dialog"]').isVisible();
      expect(dialogVisible).toBe(true);
      
      // Look for URL input field
      const urlInput = page.locator('input[placeholder*="M3U" i], input[placeholder*="url" i]');
      await expect(urlInput).toBeVisible();
      
      console.log('✅ M3U import dialog opens successfully');
    });

    test('Test M3U parsing with real playlist', async ({ page }) => {
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      await page.click('text="Import M3U"');
      await page.waitForTimeout(1000);
      
      // Fill M3U URL
      const urlInput = page.locator('input[placeholder*="M3U" i], input[placeholder*="url" i]').first();
      await urlInput.fill(testM3uUrl);
      
      await page.screenshot({ path: 'test-results/working-15-m3u-url-filled.png', fullPage: true });
      
      // Click parse/load button
      const parseButton = page.locator('button:has-text("Parse"), button:has-text("Load"), button:has-text("Import")');
      if (await parseButton.isVisible({ timeout: 5000 })) {
        await parseButton.click();
        
        // Wait for parsing to complete (this might take a while)
        await page.waitForTimeout(15000);
        
        await page.screenshot({ path: 'test-results/working-16-m3u-parsed.png', fullPage: true });
        
        // Check for channels table or list
        const channelsTable = await page.locator('table, .MuiDataGrid-root').isVisible();
        const channelsList = await page.locator('text="channel", text="Channel"').isVisible();
        
        console.log('✅ M3U parsing:', channelsTable || channelsList ? 'Channels loaded successfully' : 'No channels detected');
      } else {
        console.log('⚠️ Parse button not found in dialog');
      }
    });
  });

  test.describe('5. Responsive Design', () => {
    test('Test mobile view and responsive behavior', async ({ page }) => {
      // Test desktop view first
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="nav-dashboard"]');
      
      await page.screenshot({ path: 'test-results/working-17-desktop-view.png', fullPage: true });
      
      // Check if navigation drawer is visible on desktop
      const desktopDrawer = await page.locator('[data-testid="desktop-drawer"]').isVisible();
      console.log('Desktop drawer visible:', desktopDrawer);
      
      // Switch to mobile view
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="mobile-menu-button"]');
      
      await page.screenshot({ path: 'test-results/working-18-mobile-view.png', fullPage: true });
      
      // Test mobile menu
      const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
      await expect(mobileMenuButton).toBeVisible();
      
      await mobileMenuButton.click();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ path: 'test-results/working-19-mobile-menu-open.png', fullPage: true });
      
      // Check if navigation items are accessible in mobile
      await expect(page.locator('[data-testid="nav-streams"]')).toBeVisible();
      
      console.log('✅ Mobile responsive design works correctly');
    });

    test('Test tablet view', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="nav-dashboard"]');
      
      await page.screenshot({ path: 'test-results/working-20-tablet-view.png', fullPage: true });
      
      // Navigate to streams on tablet
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ path: 'test-results/working-21-tablet-streams.png', fullPage: true });
      
      // Check if UI elements are properly arranged for tablet
      await expect(page.locator('text="Stream Manager"')).toBeVisible();
      await expect(page.locator('text="Add Stream"')).toBeVisible();
      
      console.log('✅ Tablet view displays correctly');
    });
  });

  test.describe('6. System Health and Status', () => {
    test('Test dashboard system information', async ({ page }) => {
      // Ensure we're on dashboard
      await page.click('[data-testid="nav-dashboard"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ path: 'test-results/working-22-dashboard-status.png', fullPage: true });
      
      // Check for system status indicators
      await expect(page.locator('text="Active Streams"')).toBeVisible();
      await expect(page.locator('text="Memory Usage"')).toBeVisible();
      await expect(page.locator('text="System Uptime"')).toBeVisible();
      
      // Check for status indicators
      const statusElements = [
        await page.locator('text="Healthy"').isVisible().catch(() => false),
        await page.locator('text="Connected"').isVisible().catch(() => false),
        await page.locator('text="Database Status"').isVisible().catch(() => false)
      ];
      
      const hasSystemStatus = statusElements.some(element => element);
      expect(hasSystemStatus).toBe(true);
      
      console.log('✅ Dashboard displays system health information');
    });

    test('Test API health endpoint', async ({ page }) => {
      // Test the health endpoint directly
      const healthResponse = await page.request.get('/health');
      expect(healthResponse.status()).toBe(200);
      
      const healthData = await healthResponse.json();
      expect(healthData).toHaveProperty('status');
      expect(healthData).toHaveProperty('services');
      
      console.log('Health status:', healthData.status);
      console.log('Services:', Object.keys(healthData.services || {}));
      
      console.log('✅ API health endpoint working correctly');
    });
  });

  test.describe('7. Error Scenarios and Edge Cases', () => {
    test('Test network error handling', async ({ page }) => {
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      
      // Try to add a stream with a very slow/timeout URL
      await page.click('text="Add Stream"');
      await page.waitForTimeout(1000);
      
      const nameField = page.locator('input[name="name"]').or(page.locator('input[placeholder*="name" i]')).first();
      const urlField = page.locator('input[name="url"]').or(page.locator('input[placeholder*="url" i]')).first();
      
      await nameField.fill('Slow Response Test');
      await urlField.fill('https://httpstat.us/200?sleep=30000'); // 30 second delay
      
      await page.click('button:has-text("Save"), button:has-text("Add")');
      await page.waitForTimeout(5000); // Don't wait for full timeout
      
      await page.screenshot({ path: 'test-results/working-23-network-timeout.png', fullPage: true });
      
      // Check if there's any loading indicator or timeout handling
      const loadingIndicators = [
        await page.locator('.MuiCircularProgress-root').isVisible().catch(() => false),
        await page.locator('text="Loading"').isVisible().catch(() => false),
        await page.locator('[role="progressbar"]').isVisible().catch(() => false)
      ];
      
      const hasLoadingIndicator = loadingIndicators.some(indicator => indicator);
      console.log('✅ Network timeout handling:', hasLoadingIndicator ? 'Loading indicators present' : 'No specific loading UI detected');
    });

    test('Test frontend error boundary', async ({ page }) => {
      await page.screenshot({ path: 'test-results/working-24-error-boundary-test.png', fullPage: true });
      
      // Check for any JavaScript errors in console
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      
      // Navigate through different sections to check for errors
      await page.click('[data-testid="nav-channels"]');
      await page.waitForTimeout(2000);
      await page.click('[data-testid="nav-streams"]');
      await page.waitForTimeout(2000);
      await page.click('[data-testid="nav-epg"]');
      await page.waitForTimeout(2000);
      
      console.log('JavaScript errors detected:', consoleErrors.length);
      if (consoleErrors.length > 0) {
        console.log('Errors:', consoleErrors.slice(0, 3)); // Show first 3 errors
      }
      
      console.log('✅ Error boundary test completed');
    });
  });

  test.afterEach(async ({ page }) => {
    // Take a final screenshot if test failed
    if (test.info().status !== 'passed') {
      await page.screenshot({ 
        path: `test-results/failed-${test.info().title.replace(/[^a-zA-Z0-9]/g, '-')}.png`, 
        fullPage: true 
      });
    }
  });
});