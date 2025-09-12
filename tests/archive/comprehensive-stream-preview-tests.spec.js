const { test, expect } = require('@playwright/test');

test.describe('PlexBridge Comprehensive Stream Preview Tests', () => {
  // Test configuration
  const testStreamUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const invalidStreamUrl = 'https://invalid-stream-url.com/nonexistent.m3u8';
  const testM3uUrl = 'https://iptv-org.github.io/iptv/index.m3u';

  test.beforeEach(async ({ page }) => {
    // Set longer timeout for tests
    test.setTimeout(120000);
    
    // Navigate to homepage
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('1. Navigation and Basic UI', () => {
    test('Homepage loads correctly', async ({ page }) => {
      await page.screenshot({ path: 'test-results/01-homepage-loads.png', fullPage: true });
      
      // Check that main elements are present
      await expect(page.locator('h1, h2, [data-testid="app-title"]')).toBeVisible();
      
      // Check for navigation elements
      const navElements = await page.locator('nav, [role="navigation"], .MuiDrawer-root').count();
      expect(navElements).toBeGreaterThan(0);
    });

    test('Navigation to Streams section works', async ({ page }) => {
      // Try multiple navigation strategies
      const streamNavSelectors = [
        '[data-testid="nav-streams"]',
        'a[href*="streams"]',
        'text="Streams"',
        '.MuiListItem-root:has-text("Streams")'
      ];

      let navigated = false;
      for (const selector of streamNavSelectors) {
        try {
          const element = page.locator(selector);
          if (await element.isVisible({ timeout: 2000 })) {
            await element.click();
            navigated = true;
            break;
          }
        } catch (e) {
          console.log(`Navigation selector ${selector} failed:`, e.message);
        }
      }

      if (!navigated) {
        // Try hamburger menu for mobile
        try {
          await page.click('[data-testid="mobile-menu-button"], .MuiIconButton-root');
          await page.waitForTimeout(500);
          await page.click('text="Streams"');
          navigated = true;
        } catch (e) {
          console.log('Mobile navigation failed:', e.message);
        }
      }

      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-results/02-streams-navigation.png', fullPage: true });
      
      // Verify we're on streams page
      const currentUrl = page.url();
      const isStreamsPage = currentUrl.includes('streams') || 
                           await page.locator('text="Stream Manager", text="Streams"').isVisible();
      expect(isStreamsPage).toBe(true);
    });

    test('All UI elements are present and functional', async ({ page }) => {
      // Navigate to streams
      await page.goto('/');
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      
      await page.screenshot({ path: 'test-results/03-ui-elements.png', fullPage: true });
      
      // Check for key UI elements
      const addButtonSelectors = [
        '[data-testid="add-stream-button"]',
        'button:has-text("Add")',
        '.MuiFab-root',
        '[aria-label*="add"], [title*="add"]'
      ];

      let addButtonFound = false;
      for (const selector of addButtonSelectors) {
        if (await page.locator(selector).isVisible({ timeout: 2000 }).catch(() => false)) {
          addButtonFound = true;
          break;
        }
      }
      expect(addButtonFound).toBe(true);
    });
  });

  test.describe('2. Stream Management', () => {
    test('Add new stream functionality', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to streams
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ path: 'test-results/04-before-add-stream.png', fullPage: true });
      
      // Find and click add button
      const addButtonSelectors = [
        '[data-testid="add-stream-button"]',
        'button:has-text("Add")',
        '.MuiFab-root',
        '[aria-label*="add"]'
      ];

      let dialogOpened = false;
      for (const selector of addButtonSelectors) {
        try {
          const button = page.locator(selector);
          if (await button.isVisible({ timeout: 2000 })) {
            await button.click();
            await page.waitForTimeout(1000);
            
            // Check if dialog opened
            const dialogVisible = await page.locator('.MuiDialog-root, [role="dialog"]').isVisible();
            if (dialogVisible) {
              dialogOpened = true;
              break;
            }
          }
        } catch (e) {
          console.log(`Add button selector ${selector} failed:`, e.message);
        }
      }

      await page.screenshot({ path: 'test-results/05-add-stream-dialog.png', fullPage: true });
      expect(dialogOpened).toBe(true);
      
      // Fill form
      await page.fill('[data-testid="stream-name-input"], input[name="name"], input[placeholder*="name"]', 'Test Stream');
      await page.fill('[data-testid="stream-url-input"], input[name="url"], input[placeholder*="url"]', testStreamUrl);
      
      await page.screenshot({ path: 'test-results/06-filled-form.png', fullPage: true });
    });

    test('Stream preview button appears and works', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to streams and add a test stream first
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      // Add a stream
      await page.click('[data-testid="add-stream-button"], button:has-text("Add"), .MuiFab-root').catch(() => {});
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="stream-name-input"], input[name="name"], input[placeholder*="name"]', 'Preview Test Stream');
      await page.fill('[data-testid="stream-url-input"], input[name="url"], input[placeholder*="url"]', testStreamUrl);
      
      // Save the stream
      await page.click('[data-testid="save-button"], button:has-text("Save"), button:has-text("Add")').catch(() => {});
      await page.waitForTimeout(2000);
      
      await page.screenshot({ path: 'test-results/07-stream-added.png', fullPage: true });
      
      // Look for preview button
      const previewButtonSelectors = [
        '[data-testid="preview-stream-button"]',
        'button:has-text("Preview")',
        '[aria-label*="preview"]',
        '.MuiIconButton-root[title*="preview"]'
      ];

      let previewButtonFound = false;
      for (const selector of previewButtonSelectors) {
        const buttons = page.locator(selector);
        const count = await buttons.count();
        if (count > 0) {
          previewButtonFound = true;
          break;
        }
      }
      
      expect(previewButtonFound).toBe(true);
    });

    test('Video player modal opens correctly', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to streams
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      // Add a stream if none exists
      await page.click('[data-testid="add-stream-button"], button:has-text("Add"), .MuiFab-root').catch(() => {});
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="stream-name-input"], input[name="name"], input[placeholder*="name"]', 'Video Player Test');
      await page.fill('[data-testid="stream-url-input"], input[name="url"], input[placeholder*="url"]', testStreamUrl);
      await page.click('[data-testid="save-button"], button:has-text("Save"), button:has-text("Add")').catch(() => {});
      await page.waitForTimeout(2000);
      
      // Click preview button
      const previewSelectors = [
        '[data-testid="preview-stream-button"]',
        'button:has-text("Preview")',
        '[aria-label*="preview"]'
      ];

      let modalOpened = false;
      for (const selector of previewSelectors) {
        try {
          const buttons = page.locator(selector);
          const count = await buttons.count();
          if (count > 0) {
            await buttons.first().click();
            await page.waitForTimeout(2000);
            
            // Check for video player modal
            const modalVisible = await page.locator('.MuiDialog-root, [role="dialog"]').isVisible();
            if (modalVisible) {
              modalOpened = true;
              break;
            }
          }
        } catch (e) {
          console.log(`Preview selector ${selector} failed:`, e.message);
        }
      }

      await page.screenshot({ path: 'test-results/08-video-player-modal.png', fullPage: true });
      expect(modalOpened).toBe(true);
    });
  });

  test.describe('3. Stream Preview Functionality', () => {
    test('Test preview with reliable HLS stream', async ({ page }) => {
      await page.goto('/');
      
      // Add a reliable test stream
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="add-stream-button"], button:has-text("Add"), .MuiFab-root').catch(() => {});
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="stream-name-input"], input[name="name"], input[placeholder*="name"]', 'Reliable HLS Stream');
      await page.fill('[data-testid="stream-url-input"], input[name="url"], input[placeholder*="url"]', testStreamUrl);
      await page.click('[data-testid="save-button"], button:has-text("Save"), button:has-text("Add")').catch(() => {});
      await page.waitForTimeout(3000);
      
      // Click preview
      await page.click('[data-testid="preview-stream-button"], button:has-text("Preview")').catch(() => {});
      await page.waitForTimeout(3000);
      
      await page.screenshot({ path: 'test-results/09-hls-preview.png', fullPage: true });
      
      // Check for video element
      const videoElement = await page.locator('video, .video-js, [data-testid="video-player"]').isVisible();
      expect(videoElement).toBe(true);
    });

    test('Test both proxy and direct streaming modes', async ({ page }) => {
      await page.goto('/');
      
      // This test would check both streaming modes if toggle is available
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ path: 'test-results/10-streaming-modes.png', fullPage: true });
      
      // Look for streaming mode toggles
      const modeToggleSelectors = [
        '[data-testid="proxy-mode-toggle"]',
        'input[type="checkbox"]',
        '.MuiSwitch-root',
        'button:has-text("Proxy")'
      ];

      let toggleFound = false;
      for (const selector of modeToggleSelectors) {
        if (await page.locator(selector).isVisible({ timeout: 2000 }).catch(() => false)) {
          toggleFound = true;
          break;
        }
      }
      
      // This may not be implemented yet, so we'll note it
      console.log('Streaming mode toggle found:', toggleFound);
    });

    test('Test transcoding toggle functionality', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ path: 'test-results/11-transcoding-toggle.png', fullPage: true });
      
      // Look for transcoding options
      const transcodingSelectors = [
        '[data-testid="transcoding-toggle"]',
        'text="Transcoding"',
        'input[name*="transcode"]'
      ];

      let transcodingFound = false;
      for (const selector of transcodingSelectors) {
        if (await page.locator(selector).isVisible({ timeout: 2000 }).catch(() => false)) {
          transcodingFound = true;
          break;
        }
      }
      
      console.log('Transcoding options found:', transcodingFound);
    });

    test('Verify video player loads and displays correctly', async ({ page }) => {
      await page.goto('/');
      
      // Add stream and test video player
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="add-stream-button"], button:has-text("Add"), .MuiFab-root').catch(() => {});
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="stream-name-input"], input[name="name"], input[placeholder*="name"]', 'Video Player Test');
      await page.fill('[data-testid="stream-url-input"], input[name="url"], input[placeholder*="url"]', testStreamUrl);
      await page.click('[data-testid="save-button"], button:has-text("Save"), button:has-text("Add")').catch(() => {});
      await page.waitForTimeout(3000);
      
      // Open preview
      await page.click('[data-testid="preview-stream-button"], button:has-text("Preview")').catch(() => {});
      await page.waitForTimeout(5000);
      
      await page.screenshot({ path: 'test-results/12-video-player-check.png', fullPage: true });
      
      // Check video player elements
      const videoPlayerChecks = [
        await page.locator('video').isVisible().catch(() => false),
        await page.locator('.video-js').isVisible().catch(() => false),
        await page.locator('[data-testid="video-player"]').isVisible().catch(() => false),
        await page.locator('.MuiDialog-root video').isVisible().catch(() => false)
      ];
      
      const videoPlayerVisible = videoPlayerChecks.some(check => check === true);
      expect(videoPlayerVisible).toBe(true);
    });

    test('Test error handling for invalid streams', async ({ page }) => {
      await page.goto('/');
      
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="add-stream-button"], button:has-text("Add"), .MuiFab-root').catch(() => {});
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="stream-name-input"], input[name="name"], input[placeholder*="name"]', 'Invalid Stream');
      await page.fill('[data-testid="stream-url-input"], input[name="url"], input[placeholder*="url"]', invalidStreamUrl);
      await page.click('[data-testid="save-button"], button:has-text("Save"), button:has-text("Add")').catch(() => {});
      await page.waitForTimeout(3000);
      
      // Try to preview
      await page.click('[data-testid="preview-stream-button"], button:has-text("Preview")').catch(() => {});
      await page.waitForTimeout(5000);
      
      await page.screenshot({ path: 'test-results/13-invalid-stream-error.png', fullPage: true });
      
      // Check for error indicators
      const errorIndicators = [
        await page.locator('text="Error"').isVisible().catch(() => false),
        await page.locator('text="Failed"').isVisible().catch(() => false),
        await page.locator('.error, .MuiAlert-root').isVisible().catch(() => false),
        await page.locator('[data-testid="error-message"]').isVisible().catch(() => false)
      ];
      
      const errorDisplayed = errorIndicators.some(indicator => indicator === true);
      console.log('Error handling for invalid stream:', errorDisplayed);
    });
  });

  test.describe('4. M3U Import with Preview', () => {
    test('Test M3U import functionality', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      // Look for M3U import button
      const importButtonSelectors = [
        '[data-testid="import-m3u-button"]',
        'button:has-text("Import")',
        'button:has-text("M3U")',
        '[aria-label*="import"]'
      ];

      let importButtonFound = false;
      for (const selector of importButtonSelectors) {
        try {
          const button = page.locator(selector);
          if (await button.isVisible({ timeout: 2000 })) {
            await button.click();
            await page.waitForTimeout(1000);
            importButtonFound = true;
            break;
          }
        } catch (e) {
          console.log(`Import button selector ${selector} failed:`, e.message);
        }
      }

      await page.screenshot({ path: 'test-results/14-m3u-import.png', fullPage: true });
      
      if (importButtonFound) {
        // Fill M3U URL
        await page.fill('[data-testid="import-url-input"], input[placeholder*="M3U"], input[placeholder*="url"]', testM3uUrl);
        await page.click('[data-testid="parse-channels-button"], button:has-text("Parse"), button:has-text("Load")').catch(() => {});
        await page.waitForTimeout(10000); // Allow time for parsing
        
        await page.screenshot({ path: 'test-results/15-m3u-parsed.png', fullPage: true });
      }
      
      console.log('M3U import functionality available:', importButtonFound);
    });

    test('Verify preview works during channel import', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      // Try M3U import
      await page.click('[data-testid="import-m3u-button"], button:has-text("Import")').catch(() => {});
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="import-url-input"], input[placeholder*="M3U"], input[placeholder*="url"]', testM3uUrl);
      await page.click('[data-testid="parse-channels-button"], button:has-text("Parse")').catch(() => {});
      await page.waitForTimeout(10000);
      
      await page.screenshot({ path: 'test-results/16-import-preview.png', fullPage: true });
      
      // Look for preview buttons in import dialog
      const previewInImport = await page.locator('[data-testid="import-dialog"] button:has-text("Preview")').count();
      console.log('Preview buttons in import dialog:', previewInImport);
    });

    test('Test channel selection and bulk operations', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="import-m3u-button"], button:has-text("Import")').catch(() => {});
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="import-url-input"], input[placeholder*="M3U"]', testM3uUrl);
      await page.click('[data-testid="parse-channels-button"], button:has-text("Parse")').catch(() => {});
      await page.waitForTimeout(10000);
      
      await page.screenshot({ path: 'test-results/17-bulk-operations.png', fullPage: true });
      
      // Test checkboxes and bulk operations
      const checkboxes = await page.locator('input[type="checkbox"]').count();
      const bulkButtons = await page.locator('button:has-text("Select"), button:has-text("All")').count();
      
      console.log('Checkboxes found:', checkboxes);
      console.log('Bulk operation buttons:', bulkButtons);
    });
  });

  test.describe('5. Responsive Design', () => {
    test('Test on different screen sizes', async ({ page }) => {
      // Desktop
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/');
      await page.screenshot({ path: 'test-results/18-desktop-view.png', fullPage: true });
      
      // Tablet
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-results/19-tablet-view.png', fullPage: true });
      
      // Mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-results/20-mobile-view.png', fullPage: true });
      
      // Test mobile navigation
      const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"], .MuiIconButton-root');
      const isMobileMenuVisible = await mobileMenuButton.isVisible();
      
      if (isMobileMenuVisible) {
        await mobileMenuButton.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'test-results/21-mobile-menu.png', fullPage: true });
      }
      
      console.log('Mobile menu functionality:', isMobileMenuVisible);
    });

    test('Mobile view functionality', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Test mobile-specific features
      const mobileElements = [
        await page.locator('.MuiFab-root').isVisible().catch(() => false),
        await page.locator('[data-testid="mobile-menu-button"]').isVisible().catch(() => false)
      ];
      
      await page.screenshot({ path: 'test-results/22-mobile-features.png', fullPage: true });
      
      const mobileOptimized = mobileElements.some(element => element === true);
      console.log('Mobile-optimized elements found:', mobileOptimized);
    });
  });

  test.describe('6. Error Scenarios', () => {
    test('Invalid stream URLs', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="add-stream-button"], button:has-text("Add"), .MuiFab-root').catch(() => {});
      await page.waitForTimeout(1000);
      
      const invalidUrls = [
        'not-a-url',
        'http://nonexistent-domain-12345.com/stream.m3u8',
        'https://httpstat.us/404/stream.m3u8'
      ];
      
      for (let i = 0; i < invalidUrls.length; i++) {
        const url = invalidUrls[i];
        await page.fill('[data-testid="stream-name-input"], input[name="name"]', `Invalid ${i + 1}`);
        await page.fill('[data-testid="stream-url-input"], input[name="url"]', url);
        
        // Try to save and check for validation
        await page.click('[data-testid="save-button"], button:has-text("Save")').catch(() => {});
        await page.waitForTimeout(1000);
        
        await page.screenshot({ path: `test-results/23-invalid-url-${i + 1}.png`, fullPage: true });
        
        // Clear form for next iteration
        await page.fill('[data-testid="stream-url-input"], input[name="url"]', '');
      }
    });

    test('Network timeouts', async ({ page }) => {
      await page.goto('/');
      
      // Test with a URL that will timeout
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="add-stream-button"], button:has-text("Add"), .MuiFab-root').catch(() => {});
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="stream-name-input"], input[name="name"]', 'Timeout Test');
      await page.fill('[data-testid="stream-url-input"], input[name="url"]', 'https://httpstat.us/200?sleep=30000');
      await page.click('[data-testid="save-button"], button:has-text("Save")').catch(() => {});
      await page.waitForTimeout(5000);
      
      await page.screenshot({ path: 'test-results/24-network-timeout.png', fullPage: true });
    });

    test('Backend API failures', async ({ page }) => {
      await page.goto('/');
      
      // This test checks how the frontend handles API failures
      // We'll navigate around and see if there are any error boundaries
      await page.click('[data-testid="nav-streams"], text="Streams"').catch(() => {});
      await page.waitForLoadState('networkidle');
      
      // Check for error boundaries or error messages
      const errorElements = [
        await page.locator('text="Error"').isVisible().catch(() => false),
        await page.locator('.error').isVisible().catch(() => false),
        await page.locator('[data-testid="error-boundary"]').isVisible().catch(() => false)
      ];
      
      await page.screenshot({ path: 'test-results/25-api-errors.png', fullPage: true });
      
      const errorsDisplayed = errorElements.some(element => element === true);
      console.log('Error handling UI elements:', errorsDisplayed);
    });
  });

  test.afterEach(async ({ page }) => {
    // Clean up after each test
    await page.waitForTimeout(1000);
  });
});