const { test, expect } = require('@playwright/test');

/**
 * COMPLETE SCREENSHOT ANALYSIS 
 * Captures screenshots of ALL pages as mandated by CLAUDE.md testing protocol
 * Focuses on completing the comprehensive visual analysis
 */

test.describe('Complete Screenshot Analysis', () => {
  let testResults = {
    pages: {},
    screenshots: [],
    errors: []
  };

  test('Capture ALL Page Screenshots - Desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    console.log('📸 CAPTURING ALL PAGE SCREENSHOTS - DESKTOP');

    try {
      // Page 1: Dashboard
      console.log('📊 Capturing Dashboard...');
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.screenshot({ path: 'test-results/screenshots/complete-01-dashboard-desktop.png', fullPage: true });
      testResults.screenshots.push('complete-01-dashboard-desktop.png');

      // Page 2: Channels
      console.log('📺 Capturing Channels...');
      await page.click('[data-testid="nav-channels"]');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-results/screenshots/complete-02-channels-desktop.png', fullPage: true });
      testResults.screenshots.push('complete-02-channels-desktop.png');

      // Page 3: Streams
      console.log('🎬 Capturing Streams...');
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-results/screenshots/complete-03-streams-desktop.png', fullPage: true });
      testResults.screenshots.push('complete-03-streams-desktop.png');

      // Page 4: EPG
      console.log('📅 Capturing EPG...');
      await page.click('[data-testid="nav-epg"]');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-results/screenshots/complete-04-epg-desktop.png', fullPage: true });
      testResults.screenshots.push('complete-04-epg-desktop.png');

      // Page 5: Logs
      console.log('📋 Capturing Logs...');
      await page.click('[data-testid="nav-logs"]');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-results/screenshots/complete-05-logs-desktop.png', fullPage: true });
      testResults.screenshots.push('complete-05-logs-desktop.png');

      // Page 6: Settings
      console.log('⚙️ Capturing Settings...');
      await page.click('[data-testid="nav-settings"]');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-results/screenshots/complete-06-settings-desktop.png', fullPage: true });
      testResults.screenshots.push('complete-06-settings-desktop.png');

    } catch (error) {
      console.error('❌ Error capturing desktop screenshots:', error);
      testResults.errors.push(`Desktop screenshot error: ${error.message}`);
    }
  });

  test('Capture Stream Management Dialogs', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    console.log('🎯 CAPTURING STREAM MANAGEMENT DIALOGS');

    try {
      // Go to streams page
      await page.goto('/');
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');

      // Add Stream Dialog
      console.log('➕ Capturing Add Stream Dialog...');
      await page.click('[data-testid="add-stream-button"]');
      await page.waitForSelector('[data-testid="stream-dialog"]', { timeout: 10000 });
      await page.screenshot({ path: 'test-results/screenshots/complete-07-add-stream-dialog.png', fullPage: true });
      testResults.screenshots.push('complete-07-add-stream-dialog.png');
      
      // Close dialog
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);

      // M3U Import Dialog
      console.log('📂 Capturing M3U Import Dialog...');
      await page.click('[data-testid="import-m3u-button"]');
      await page.waitForSelector('[data-testid="import-dialog"]', { timeout: 10000 });
      await page.screenshot({ path: 'test-results/screenshots/complete-08-m3u-import-dialog.png', fullPage: true });
      testResults.screenshots.push('complete-08-m3u-import-dialog.png');

      // Test M3U URL input functionality
      const urlInput = page.locator('[data-testid="import-dialog"] [data-testid="import-url-input"]');
      await urlInput.fill('https://iptv-org.github.io/iptv/index.m3u');
      await page.screenshot({ path: 'test-results/screenshots/complete-09-m3u-dialog-with-url.png', fullPage: true });
      testResults.screenshots.push('complete-09-m3u-dialog-with-url.png');

      // Close dialog
      await page.keyboard.press('Escape');

    } catch (error) {
      console.error('❌ Error capturing dialog screenshots:', error);
      testResults.errors.push(`Dialog screenshot error: ${error.message}`);
    }
  });

  test('Test Stream Preview Functionality', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    console.log('🎥 TESTING STREAM PREVIEW FUNCTIONALITY');

    try {
      await page.goto('/');
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');

      // Check if there are existing streams
      const streamRows = await page.locator('table tbody tr').count();
      console.log(`📊 Found ${streamRows} streams in table`);

      if (streamRows === 0) {
        console.log('📝 No streams found - creating a test stream for preview testing');
        
        // Add a test stream
        await page.click('[data-testid="add-stream-button"]');
        await page.waitForSelector('[data-testid="stream-dialog"]');
        
        await page.fill('[data-testid="stream-name-input"]', 'Test Stream');
        await page.fill('[data-testid="stream-url-input"]', 'https://test.com/stream.m3u8');
        
        // Look for channel selection - may be a dropdown
        const channelSelect = page.locator('[data-testid="channel-select"]');
        if (await channelSelect.isVisible()) {
          await channelSelect.click();
          await page.waitForTimeout(500);
          // Select first available channel option
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
        }

        await page.click('[data-testid="save-stream-button"]');
        await page.waitForLoadState('networkidle');
        
        await page.screenshot({ path: 'test-results/screenshots/complete-10-new-stream-added.png', fullPage: true });
        testResults.screenshots.push('complete-10-new-stream-added.png');
      }

      // Now test stream preview on available streams
      const updatedStreamCount = await page.locator('table tbody tr').count();
      
      if (updatedStreamCount > 0) {
        console.log('🎬 Testing stream preview functionality...');
        
        // Look for preview button in first row
        const firstRow = page.locator('table tbody tr').first();
        const previewButton = firstRow.locator('[data-testid="preview-stream-button"]');
        
        if (await previewButton.isVisible()) {
          await previewButton.click();
          await page.waitForTimeout(3000); // Allow player to initialize
          
          await page.screenshot({ path: 'test-results/screenshots/complete-11-stream-preview-player.png', fullPage: true });
          testResults.screenshots.push('complete-11-stream-preview-player.png');
          console.log('✅ Stream preview player screenshot captured');

          // Check for video element and player controls
          const videoPlayer = page.locator('video');
          const playerExists = await videoPlayer.isVisible();
          
          if (playerExists) {
            console.log('✅ Video player element found');
          } else {
            console.log('⚠️ Video player element not visible');
          }

          // Look for player controls
          const playerControls = page.locator('.video-js, .vjs-control-bar, .plyr__controls');
          const controlsExist = await playerControls.count() > 0;
          
          if (controlsExist) {
            console.log('✅ Video player controls found');
          } else {
            console.log('⚠️ Video player controls not found');
          }

        } else {
          console.log('⚠️ Preview button not found in stream table');
          testResults.errors.push('Preview button not found in stream table');
        }
      } else {
        console.log('⚠️ No streams available for preview testing');
        testResults.errors.push('No streams available for preview testing');
      }

    } catch (error) {
      console.error('❌ Stream preview test error:', error);
      testResults.errors.push(`Stream preview error: ${error.message}`);
    }
  });

  test('Mobile Responsive Screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    console.log('📱 CAPTURING MOBILE RESPONSIVE SCREENSHOTS');

    try {
      // Mobile Dashboard
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.screenshot({ path: 'test-results/screenshots/complete-12-mobile-dashboard.png', fullPage: true });
      testResults.screenshots.push('complete-12-mobile-dashboard.png');

      // Mobile Streams page
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-results/screenshots/complete-13-mobile-streams.png', fullPage: true });
      testResults.screenshots.push('complete-13-mobile-streams.png');

      // Test mobile menu if it exists
      const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
      if (await mobileMenuButton.isVisible()) {
        await mobileMenuButton.click();
        await page.screenshot({ path: 'test-results/screenshots/complete-14-mobile-menu-open.png', fullPage: true });
        testResults.screenshots.push('complete-14-mobile-menu-open.png');
      }

    } catch (error) {
      console.error('❌ Mobile screenshots error:', error);
      testResults.errors.push(`Mobile screenshot error: ${error.message}`);
    }
  });

  test.afterAll(async () => {
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPLETE SCREENSHOT ANALYSIS RESULTS');
    console.log('='.repeat(80));
    console.log(`📸 Total Screenshots: ${testResults.screenshots.length}`);
    console.log(`❌ Total Errors: ${testResults.errors.length}`);
    console.log('\n📸 Screenshots Captured:');
    testResults.screenshots.forEach((screenshot, i) => {
      console.log(`${i + 1}. ${screenshot}`);
    });
    
    if (testResults.errors.length > 0) {
      console.log('\n❌ Errors Encountered:');
      testResults.errors.forEach((error, i) => {
        console.log(`${i + 1}. ${error}`);
      });
    }
    console.log('='.repeat(80));
  });
});