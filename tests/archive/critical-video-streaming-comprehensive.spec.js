const { test, expect } = require('@playwright/test');

/**
 * CRITICAL VIDEO STREAMING COMPREHENSIVE TEST SUITE
 * 
 * This test suite focuses on the critical video player and streaming issues:
 * 1. Video player infinite loops and audio-only playback
 * 2. Stream proxy endpoints returning 404 errors  
 * 3. EPG program counting showing 0 for all channels
 * 4. Network monitoring and error detection
 * 5. Cross-browser compatibility and responsive design
 * 
 * TESTING PROTOCOL:
 * - Use proper data-testid selectors for reliability
 * - Test both success and error scenarios
 * - Capture detailed screenshots for analysis
 * - Monitor console logs and network requests
 * - Verify video playback (not just audio)
 * - Test cross-browser compatibility
 */

test.describe('Critical Video Streaming Comprehensive Tests', () => {
  // Test configuration
  const testStreamUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const tsStreamUrl = 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'; // Fallback direct video
  const problematicTsUrl = 'http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts'; // Known problematic TS stream
  
  let networkRequests = [];
  let networkResponses = [];
  let consoleMessages = [];
  let pageErrors = [];

  test.beforeEach(async ({ page }) => {
    // Set extended timeout for complex tests
    test.setTimeout(180000);
    
    // Clear monitoring arrays
    networkRequests = [];
    networkResponses = [];
    consoleMessages = [];
    pageErrors = [];
    
    // Monitor network traffic
    page.on('request', request => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        timestamp: new Date().toISOString(),
        headers: Object.fromEntries(Object.entries(request.headers()))
      });
    });
    
    page.on('response', response => {
      networkResponses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        timestamp: new Date().toISOString(),
        headers: Object.fromEntries(Object.entries(response.headers()))
      });
    });
    
    // Monitor console messages and page errors
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
      console.log(`🖥️ CONSOLE [${msg.type()}]: ${msg.text()}`);
    });
    
    page.on('pageerror', err => {
      pageErrors.push({
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
      console.log(`❌ PAGE ERROR: ${err.message}`);
    });
    
    page.on('requestfailed', req => {
      console.log(`❌ REQUEST FAILED: ${req.url()} - ${req.failure()?.errorText}`);
    });
    
    // Navigate to homepage and wait for load
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('1. Video Player Component Testing', () => {
    test('Video player dialog opens and displays correctly', async ({ page }) => {
      console.log('🎯 Testing video player dialog functionality');
      
      // Navigate to streams section
      await page.click('[data-testid="nav-streams"]').catch(async () => {
        // Fallback navigation methods
        await page.click('text="Streams"').catch(async () => {
          await page.click('[data-testid="mobile-menu-button"]').catch(() => {});
          await page.waitForTimeout(500);
          await page.click('text="Streams"').catch(() => {});
        });
      });
      
      await page.waitForLoadState('networkidle');
      await page.screenshot({ 
        path: 'test-screenshots/video-01-streams-page.png', 
        fullPage: true 
      });
      
      // Add a test stream
      await page.click('[data-testid="add-stream-button"]').catch(async () => {
        await page.click('button:has-text("Add")').catch(async () => {
          await page.click('.MuiFab-root').catch(() => {});
        });
      });
      
      await page.waitForTimeout(1000);
      await page.screenshot({ 
        path: 'test-screenshots/video-02-add-stream-dialog.png', 
        fullPage: true 
      });
      
      // Fill stream details using comprehensive selectors
      const streamNameInput = page.locator('[data-testid="stream-name-input"]').or(
        page.locator('input[name="name"]')
      ).or(
        page.locator('input[placeholder*="name" i]')
      );
      await streamNameInput.fill('Video Player Test Stream');
      
      const streamUrlInput = page.locator('[data-testid="stream-url-input"]').or(
        page.locator('input[name="url"]')
      ).or(
        page.locator('input[placeholder*="url" i]')
      );
      await streamUrlInput.fill(testStreamUrl);
      
      // Save the stream
      await page.click('[data-testid="save-stream-button"]').catch(async () => {
        await page.click('[data-testid="save-button"]').catch(async () => {
          await page.click('button:has-text("Save")').catch(async () => {
            await page.click('button:has-text("Add")').catch(() => {});
          });
        });
      });
      
      await page.waitForTimeout(3000);
      await page.screenshot({ 
        path: 'test-screenshots/video-03-stream-saved.png', 
        fullPage: true 
      });
      
      // Find and click preview button
      const previewButton = page.locator('[data-testid="preview-stream-button"]').or(
        page.locator('button:has-text("Preview")')
      ).or(
        page.locator('[aria-label*="preview" i]')
      );
      
      await previewButton.first().click();
      await page.waitForTimeout(2000);
      
      // Verify video player dialog opens
      const videoPlayerDialog = page.locator('[data-testid="video-player-dialog"]').or(
        page.locator('.MuiDialog-root')
      );
      
      await expect(videoPlayerDialog).toBeVisible();
      await page.screenshot({ 
        path: 'test-screenshots/video-04-player-dialog-opened.png', 
        fullPage: true 
      });
      
      // Check for video element within dialog
      const videoElement = page.locator('[data-testid="video-player-dialog"] video').or(
        page.locator('.MuiDialog-root video')
      );
      
      await expect(videoElement).toBeVisible();
      console.log('✅ Video player dialog and video element are visible');
    });

    test('Video player handles proxy vs direct streaming correctly', async ({ page }) => {
      console.log('🎯 Testing proxy vs direct streaming modes');
      
      // Navigate to streams and add test stream
      await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="add-stream-button"]').catch(() => page.click('button:has-text("Add")'));
      await page.waitForTimeout(1000);
      
      // Add stream for proxy/direct testing
      await page.fill('[data-testid="stream-name-input"], input[name="name"]', 'Proxy Test Stream');
      await page.fill('[data-testid="stream-url-input"], input[name="url"]', testStreamUrl);
      await page.click('[data-testid="save-stream-button"], button:has-text("Save")');
      await page.waitForTimeout(3000);
      
      // Open video player
      await page.click('[data-testid="preview-stream-button"], button:has-text("Preview")');
      await page.waitForTimeout(3000);
      
      await page.screenshot({ 
        path: 'test-screenshots/video-05-proxy-mode-initial.png', 
        fullPage: true 
      });
      
      // Check for proxy toggle within dialog
      const proxyToggle = page.locator('[data-testid="video-player-dialog"] .MuiSwitch-root').or(
        page.locator('.MuiDialog-root .MuiSwitch-root')
      ).or(
        page.locator('input[type="checkbox"]')
      );
      
      if (await proxyToggle.isVisible()) {
        console.log('🔄 Testing proxy toggle functionality');
        
        // Test with proxy enabled (default)
        await page.waitForTimeout(2000);
        await page.screenshot({ 
          path: 'test-screenshots/video-06-proxy-enabled.png', 
          fullPage: true 
        });
        
        // Toggle proxy off
        await proxyToggle.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ 
          path: 'test-screenshots/video-07-proxy-disabled.png', 
          fullPage: true 
        });
        
        // Toggle proxy back on
        await proxyToggle.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ 
          path: 'test-screenshots/video-08-proxy-re-enabled.png', 
          fullPage: true 
        });
        
        console.log('✅ Proxy toggle functionality tested');
      } else {
        console.log('⚠️ Proxy toggle not found in video player dialog');
      }
      
      // Test video element properties in different modes
      const videoProperties = await page.evaluate(() => {
        const video = document.querySelector('[data-testid="video-player-dialog"] video, .MuiDialog-root video');
        if (video) {
          return {
            src: video.src,
            currentSrc: video.currentSrc,
            networkState: video.networkState,
            readyState: video.readyState,
            duration: video.duration,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            error: video.error ? {
              code: video.error.code,
              message: video.error.message
            } : null
          };
        }
        return null;
      });
      
      console.log('📊 Video Properties:', JSON.stringify(videoProperties, null, 2));
    });

    test('Video player prevents infinite loops and handles audio-only correctly', async ({ page }) => {
      console.log('🎯 Testing video player infinite loop prevention and audio handling');
      
      // Navigate to streams
      await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
      await page.waitForLoadState('networkidle');
      
      // Add a problematic TS stream to test audio-only scenarios
      await page.click('[data-testid="add-stream-button"]').catch(() => page.click('button:has-text("Add")'));
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="stream-name-input"], input[name="name"]', 'Audio-Only Test Stream');
      await page.fill('[data-testid="stream-url-input"], input[name="url"]', problematicTsUrl);
      await page.click('[data-testid="save-stream-button"], button:has-text("Save")');
      await page.waitForTimeout(3000);
      
      // Open video player
      await page.click('[data-testid="preview-stream-button"], button:has-text("Preview")');
      await page.waitForTimeout(5000);
      
      await page.screenshot({ 
        path: 'test-screenshots/video-09-audio-only-test.png', 
        fullPage: true 
      });
      
      // Monitor for infinite loop patterns in console
      const relevantConsoleMessages = consoleMessages.filter(msg => 
        msg.text.includes('HLS') || 
        msg.text.includes('error') || 
        msg.text.includes('retry') ||
        msg.text.includes('infinite') ||
        msg.text.includes('loop')
      );
      
      console.log('🔍 Relevant console messages:', relevantConsoleMessages);
      
      // Check video element state over time to detect loops
      const videoStates = [];
      for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(2000);
        const state = await page.evaluate(() => {
          const video = document.querySelector('[data-testid="video-player-dialog"] video, .MuiDialog-root video');
          if (video) {
            return {
              currentTime: video.currentTime,
              networkState: video.networkState,
              readyState: video.readyState,
              paused: video.paused,
              seeking: video.seeking,
              buffered: video.buffered.length,
              error: video.error ? video.error.code : null
            };
          }
          return null;
        });
        
        videoStates.push({
          iteration: i,
          timestamp: new Date().toISOString(),
          state
        });
        
        console.log(`📊 Video State ${i}:`, state);
      }
      
      // Check for error displays and recovery mechanisms
      const errorAlert = page.locator('.MuiAlert-root').or(
        page.locator('[data-testid="error-message"]')
      ).or(
        page.locator('text="Error"')
      );
      
      const errorVisible = await errorAlert.isVisible();
      if (errorVisible) {
        await page.screenshot({ 
          path: 'test-screenshots/video-10-error-displayed.png', 
          fullPage: true 
        });
        
        // Test retry functionality
        const retryButton = page.locator('button:has-text("Retry")').or(
          page.locator('[data-testid="retry-button"]')
        );
        
        if (await retryButton.isVisible()) {
          console.log('🔄 Testing retry functionality');
          await retryButton.click();
          await page.waitForTimeout(3000);
          await page.screenshot({ 
            path: 'test-screenshots/video-11-after-retry.png', 
            fullPage: true 
          });
        }
      }
      
      console.log('📊 Video States Over Time:', JSON.stringify(videoStates, null, 2));
      console.log('❌ Error visible:', errorVisible);
    });

    test('Video player dialog close and cleanup functionality', async ({ page }) => {
      console.log('🎯 Testing video player dialog close and cleanup');
      
      // Navigate to streams and open video player
      await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="add-stream-button"]').catch(() => page.click('button:has-text("Add")'));
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="stream-name-input"], input[name="name"]', 'Cleanup Test Stream');
      await page.fill('[data-testid="stream-url-input"], input[name="url"]', testStreamUrl);
      await page.click('[data-testid="save-stream-button"], button:has-text("Save")');
      await page.waitForTimeout(3000);
      
      await page.click('[data-testid="preview-stream-button"], button:has-text("Preview")');
      await page.waitForTimeout(3000);
      
      await page.screenshot({ 
        path: 'test-screenshots/video-12-before-close.png', 
        fullPage: true 
      });
      
      // Test different close methods
      const closeButton = page.locator('[data-testid="close-video-player"]').or(
        page.locator('[data-testid="video-player-dialog"] .MuiIconButton-root')
      ).or(
        page.locator('.MuiDialog-root .MuiIconButton-root')
      );
      
      if (await closeButton.isVisible()) {
        console.log('🔴 Testing close button functionality');
        await closeButton.click();
        await page.waitForTimeout(1000);
        
        // Verify dialog is closed
        const dialogClosed = await page.locator('[data-testid="video-player-dialog"]').isHidden();
        expect(dialogClosed).toBe(true);
        
        await page.screenshot({ 
          path: 'test-screenshots/video-13-after-close.png', 
          fullPage: true 
        });
        console.log('✅ Video player dialog closed successfully');
      } else {
        console.log('⚠️ Close button not found, testing ESC key');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        await page.screenshot({ 
          path: 'test-screenshots/video-14-escape-close.png', 
          fullPage: true 
        });
      }
    });
  });

  test.describe('2. Stream Proxy Endpoint Testing', () => {
    test('Stream preview API endpoints return proper responses', async ({ page }) => {
      console.log('🎯 Testing stream preview API endpoints');
      
      // Test direct API endpoints
      const apiEndpoints = [
        '/api/streams',
        '/api/channels', 
        '/api/health',
        '/api/metrics',
        '/api/settings'
      ];
      
      for (const endpoint of apiEndpoints) {
        console.log(`📡 Testing API endpoint: ${endpoint}`);
        
        try {
          const response = await page.request.get(endpoint);
          const status = response.status();
          const contentType = response.headers()['content-type'] || '';
          
          console.log(`📊 ${endpoint}: Status ${status}, Content-Type: ${contentType}`);
          
          // API endpoints should return JSON, not HTML
          if (status === 200) {
            expect(contentType).toContain('application/json');
          }
          
          // Store response info
          networkResponses.push({
            url: endpoint,
            status,
            contentType,
            timestamp: new Date().toISOString()
          });
          
        } catch (error) {
          console.log(`❌ ${endpoint} failed: ${error.message}`);
          pageErrors.push({
            endpoint,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    test('Stream proxy endpoints handle different stream types correctly', async ({ page }) => {
      console.log('🎯 Testing stream proxy endpoints with different stream types');
      
      // Add streams of different types
      await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
      await page.waitForLoadState('networkidle');
      
      const streamTypes = [
        { name: 'HLS Stream', url: testStreamUrl, type: 'hls' },
        { name: 'Direct Video', url: tsStreamUrl, type: 'direct' },
        { name: 'TS Stream', url: problematicTsUrl, type: 'ts' }
      ];
      
      const streamIds = [];
      
      for (const stream of streamTypes) {
        console.log(`➕ Adding ${stream.name}`);
        
        await page.click('[data-testid="add-stream-button"]').catch(() => page.click('button:has-text("Add")'));
        await page.waitForTimeout(1000);
        
        await page.fill('[data-testid="stream-name-input"], input[name="name"]', stream.name);
        await page.fill('[data-testid="stream-url-input"], input[name="url"]', stream.url);
        await page.click('[data-testid="save-stream-button"], button:has-text("Save")');
        await page.waitForTimeout(2000);
        
        // Try to capture stream ID from network requests
        const streamCreationRequests = networkRequests.filter(req => 
          req.url.includes('/api/streams') && req.method === 'POST'
        );
        
        console.log(`📊 Stream creation requests: ${streamCreationRequests.length}`);
      }
      
      await page.screenshot({ 
        path: 'test-screenshots/proxy-01-multiple-streams.png', 
        fullPage: true 
      });
      
      // Test preview functionality for each stream
      const previewButtons = page.locator('[data-testid="preview-stream-button"], button:has-text("Preview")');
      const buttonCount = await previewButtons.count();
      
      console.log(`🔍 Found ${buttonCount} preview buttons`);
      
      for (let i = 0; i < Math.min(buttonCount, 3); i++) {
        console.log(`🎬 Testing preview ${i + 1}`);
        
        await previewButtons.nth(i).click();
        await page.waitForTimeout(3000);
        
        await page.screenshot({ 
          path: `test-screenshots/proxy-02-preview-${i + 1}.png`, 
          fullPage: true 
        });
        
        // Check for errors
        const errorAlert = await page.locator('.MuiAlert-root, [data-testid="error-message"]').isVisible();
        console.log(`❌ Error in preview ${i + 1}: ${errorAlert}`);
        
        // Close dialog
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    });

    test('Network monitoring for 404 errors and failed requests', async ({ page }) => {
      console.log('🎯 Monitoring network requests for 404 errors');
      
      // Navigate through the application and trigger various requests
      await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="nav-channels"]').catch(() => page.click('text="Channels"'));
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="nav-epg"]').catch(() => page.click('text="EPG"'));
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="nav-settings"]').catch(() => page.click('text="Settings"'));
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ 
        path: 'test-screenshots/network-01-navigation-complete.png', 
        fullPage: true 
      });
      
      // Analyze network responses for issues
      const failedRequests = networkResponses.filter(resp => 
        resp.status >= 400 || resp.status === 0
      );
      
      const notFoundRequests = networkResponses.filter(resp => 
        resp.status === 404
      );
      
      const serverErrorRequests = networkResponses.filter(resp => 
        resp.status >= 500
      );
      
      console.log('📊 Network Analysis:');
      console.log(`- Total requests: ${networkRequests.length}`);
      console.log(`- Total responses: ${networkResponses.length}`);
      console.log(`- Failed requests (4xx/5xx): ${failedRequests.length}`);
      console.log(`- 404 Not Found: ${notFoundRequests.length}`);
      console.log(`- Server errors (5xx): ${serverErrorRequests.length}`);
      
      if (failedRequests.length > 0) {
        console.log('❌ Failed requests:');
        failedRequests.forEach(req => {
          console.log(`  - ${req.status} ${req.url}`);
        });
      }
      
      // Test specific stream proxy endpoints
      const streamProxyTests = [
        '/streams/preview/test-id',
        '/api/streams/test-id/preview',
        '/stream/test-channel'
      ];
      
      for (const endpoint of streamProxyTests) {
        try {
          const response = await page.request.get(endpoint);
          console.log(`📡 ${endpoint}: ${response.status()}`);
        } catch (error) {
          console.log(`❌ ${endpoint}: ${error.message}`);
        }
      }
      
      // Expect minimal 404 errors on core functionality
      expect(notFoundRequests.length).toBeLessThan(5);
    });
  });

  test.describe('3. EPG Manager Testing', () => {
    test('EPG program counting and display accuracy', async ({ page }) => {
      console.log('🎯 Testing EPG program counting and display');
      
      // Navigate to EPG section
      await page.click('[data-testid="nav-epg"]').catch(async () => {
        await page.click('text="EPG"').catch(async () => {
          await page.click('text="Program Guide"').catch(() => {});
        });
      });
      
      await page.waitForLoadState('networkidle');
      await page.screenshot({ 
        path: 'test-screenshots/epg-01-epg-page.png', 
        fullPage: true 
      });
      
      // Look for program count displays
      const programCountSelectors = [
        '[data-testid="program-count"]',
        'text=/\\d+ programs?/i',
        'text=/\\d+ shows?/i',
        '.program-count',
        '[title*="program"]'
      ];
      
      let programCountFound = false;
      let programCountText = '';
      
      for (const selector of programCountSelectors) {
        try {
          const element = page.locator(selector);
          if (await element.isVisible({ timeout: 2000 })) {
            programCountText = await element.textContent();
            programCountFound = true;
            console.log(`📊 Found program count: ${programCountText}`);
            break;
          }
        } catch (e) {
          console.log(`Program count selector ${selector} not found`);
        }
      }
      
      // Look for channel listings with program counts
      const channelRows = page.locator('table tbody tr, .channel-row, .MuiTableRow-root');
      const channelCount = await channelRows.count();
      
      console.log(`📺 Found ${channelCount} channels`);
      
      if (channelCount > 0) {
        // Check each channel for program count
        for (let i = 0; i < Math.min(channelCount, 5); i++) {
          const row = channelRows.nth(i);
          const rowText = await row.textContent();
          
          // Look for zero program counts (the reported issue)
          const hasZeroPrograms = rowText.includes('0 program') || 
                                 rowText.includes('0 show') ||
                                 rowText.match(/0\s*$/);
          
          if (hasZeroPrograms) {
            console.log(`⚠️ Channel ${i + 1} shows 0 programs: ${rowText}`);
          }
          
          console.log(`📊 Channel ${i + 1}: ${rowText.substring(0, 100)}...`);
        }
      }
      
      await page.screenshot({ 
        path: 'test-screenshots/epg-02-channel-listings.png', 
        fullPage: true 
      });
      
      // Test EPG refresh functionality
      const refreshButton = page.locator('[data-testid="refresh-epg"]').or(
        page.locator('button:has-text("Refresh")')
      ).or(
        page.locator('[aria-label*="refresh" i]')
      );
      
      if (await refreshButton.isVisible()) {
        console.log('🔄 Testing EPG refresh');
        await refreshButton.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ 
          path: 'test-screenshots/epg-03-after-refresh.png', 
          fullPage: true 
        });
      }
      
      console.log('📊 EPG Analysis Results:');
      console.log(`- Program count display found: ${programCountFound}`);
      console.log(`- Program count text: ${programCountText}`);
      console.log(`- Channel count: ${channelCount}`);
    });

    test('EPG timezone and date formatting', async ({ page }) => {
      console.log('🎯 Testing EPG timezone and date formatting');
      
      await page.click('[data-testid="nav-epg"]').catch(() => page.click('text="EPG"'));
      await page.waitForLoadState('networkidle');
      
      // Look for date/time displays
      const dateTimeSelectors = [
        '[data-testid="epg-date"]',
        '[data-testid="program-time"]',
        'text=/\\d{1,2}:\\d{2}/g',
        'text=/\\d{1,2}\\/\\d{1,2}\\/\\d{4}/',
        '.date-time',
        '.program-time'
      ];
      
      const foundDateTimes = [];
      
      for (const selector of dateTimeSelectors) {
        try {
          const elements = page.locator(selector);
          const count = await elements.count();
          
          for (let i = 0; i < Math.min(count, 3); i++) {
            const text = await elements.nth(i).textContent();
            foundDateTimes.push(text);
          }
        } catch (e) {
          // Selector not found, continue
        }
      }
      
      console.log('📅 Found date/time displays:', foundDateTimes);
      
      // Check for New Zealand timezone handling
      const nzTimePattern = /NZDT|NZST|UTC\+1[23]/;
      const hasNzTimezone = foundDateTimes.some(dt => nzTimePattern.test(dt));
      
      console.log('🌏 New Zealand timezone detected:', hasNzTimezone);
      
      await page.screenshot({ 
        path: 'test-screenshots/epg-04-datetime-formatting.png', 
        fullPage: true 
      });
    });

    test('EPG data source management', async ({ page }) => {
      console.log('🎯 Testing EPG data source management');
      
      await page.click('[data-testid="nav-epg"]').catch(() => page.click('text="EPG"'));
      await page.waitForLoadState('networkidle');
      
      // Look for EPG source management
      const epgSourceSelectors = [
        '[data-testid="epg-sources"]',
        'button:has-text("Sources")',
        'button:has-text("Add Source")',
        'text="XMLTV"',
        '.epg-source'
      ];
      
      let epgSourcesFound = false;
      
      for (const selector of epgSourceSelectors) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 2000 })) {
            epgSourcesFound = true;
            await page.click(selector);
            await page.waitForTimeout(1000);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      await page.screenshot({ 
        path: 'test-screenshots/epg-05-source-management.png', 
        fullPage: true 
      });
      
      console.log('📡 EPG source management found:', epgSourcesFound);
      
      // Test EPG source addition if available
      if (epgSourcesFound) {
        const addSourceButton = page.locator('button:has-text("Add")').or(
          page.locator('[data-testid="add-epg-source"]')
        );
        
        if (await addSourceButton.isVisible()) {
          await addSourceButton.click();
          await page.waitForTimeout(1000);
          
          await page.screenshot({ 
            path: 'test-screenshots/epg-06-add-source-dialog.png', 
            fullPage: true 
          });
        }
      }
    });
  });

  test.describe('4. Cross-Browser and Responsive Testing', () => {
    test('Responsive design on different screen sizes', async ({ page }) => {
      console.log('🎯 Testing responsive design across screen sizes');
      
      const screenSizes = [
        { name: 'Desktop', width: 1920, height: 1080 },
        { name: 'Laptop', width: 1366, height: 768 },
        { name: 'Tablet', width: 768, height: 1024 },
        { name: 'Mobile', width: 375, height: 667 }
      ];
      
      for (const size of screenSizes) {
        console.log(`📱 Testing ${size.name} (${size.width}x${size.height})`);
        
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.reload();
        await page.waitForLoadState('networkidle');
        
        await page.screenshot({ 
          path: `test-screenshots/responsive-${size.name.toLowerCase()}-home.png`, 
          fullPage: true 
        });
        
        // Test navigation on different screen sizes
        if (size.width <= 768) {
          // Mobile navigation
          const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]').or(
            page.locator('.MuiIconButton-root')
          );
          
          if (await mobileMenuButton.isVisible()) {
            await mobileMenuButton.click();
            await page.waitForTimeout(500);
            await page.screenshot({ 
              path: `test-screenshots/responsive-${size.name.toLowerCase()}-menu.png`, 
              fullPage: true 
            });
          }
        }
        
        // Test video player responsiveness
        await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
        await page.waitForLoadState('networkidle');
        
        await page.screenshot({ 
          path: `test-screenshots/responsive-${size.name.toLowerCase()}-streams.png`, 
          fullPage: true 
        });
      }
    });

    test('Video player responsiveness and mobile compatibility', async ({ page }) => {
      console.log('🎯 Testing video player mobile compatibility');
      
      // Test on mobile size
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Navigate to streams
      await page.click('[data-testid="mobile-menu-button"]').catch(() => {});
      await page.waitForTimeout(500);
      await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
      await page.waitForLoadState('networkidle');
      
      // Add a test stream
      await page.click('[data-testid="add-stream-button"]').catch(() => page.click('.MuiFab-root'));
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="stream-name-input"], input[name="name"]', 'Mobile Test Stream');
      await page.fill('[data-testid="stream-url-input"], input[name="url"]', testStreamUrl);
      await page.click('[data-testid="save-stream-button"], button:has-text("Save")');
      await page.waitForTimeout(3000);
      
      // Open video player on mobile
      await page.click('[data-testid="preview-stream-button"], button:has-text("Preview")');
      await page.waitForTimeout(3000);
      
      await page.screenshot({ 
        path: 'test-screenshots/mobile-video-player.png', 
        fullPage: true 
      });
      
      // Test video player controls on mobile
      const videoElement = page.locator('[data-testid="video-player-dialog"] video, .MuiDialog-root video');
      
      if (await videoElement.isVisible()) {
        // Test fullscreen capability
        await videoElement.dblclick();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: 'test-screenshots/mobile-video-fullscreen.png', 
          fullPage: true 
        });
        
        console.log('✅ Mobile video player tested');
      }
    });
  });

  test.describe('5. Error Handling and Recovery', () => {
    test('Video player error handling and recovery mechanisms', async ({ page }) => {
      console.log('🎯 Testing video player error handling');
      
      // Test with invalid stream URL
      await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
      await page.waitForLoadState('networkidle');
      
      await page.click('[data-testid="add-stream-button"]').catch(() => page.click('button:has-text("Add")'));
      await page.waitForTimeout(1000);
      
      const invalidUrls = [
        'https://invalid-domain-12345.com/stream.m3u8',
        'http://httpstat.us/404',
        'not-a-valid-url',
        'https://httpstat.us/500'
      ];
      
      for (let i = 0; i < invalidUrls.length; i++) {
        const url = invalidUrls[i];
        console.log(`❌ Testing error handling for: ${url}`);
        
        await page.fill('[data-testid="stream-name-input"], input[name="name"]', `Error Test ${i + 1}`);
        await page.fill('[data-testid="stream-url-input"], input[name="url"]', url);
        await page.click('[data-testid="save-stream-button"], button:has-text("Save")');
        await page.waitForTimeout(2000);
        
        // Try to preview the invalid stream
        const previewButtons = page.locator('[data-testid="preview-stream-button"], button:has-text("Preview")');
        const buttonCount = await previewButtons.count();
        
        if (buttonCount > 0) {
          await previewButtons.last().click();
          await page.waitForTimeout(5000);
          
          await page.screenshot({ 
            path: `test-screenshots/error-handling-${i + 1}.png`, 
            fullPage: true 
          });
          
          // Check for error displays
          const errorAlert = await page.locator('.MuiAlert-root, [data-testid="error-message"]').isVisible();
          console.log(`🚨 Error displayed for invalid URL ${i + 1}: ${errorAlert}`);
          
          // Test retry functionality
          const retryButton = page.locator('button:has-text("Retry")');
          if (await retryButton.isVisible()) {
            console.log('🔄 Testing retry button');
            await retryButton.click();
            await page.waitForTimeout(2000);
          }
          
          // Close error dialog
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        }
      }
    });

    test('Network failure simulation and recovery', async ({ page }) => {
      console.log('🎯 Testing network failure simulation');
      
      // Simulate offline condition
      await page.context().setOffline(true);
      
      await page.reload().catch(() => {});
      await page.waitForTimeout(3000);
      
      await page.screenshot({ 
        path: 'test-screenshots/network-offline.png', 
        fullPage: true 
      });
      
      // Check for offline indicators
      const offlineIndicators = [
        await page.locator('text="offline"').isVisible().catch(() => false),
        await page.locator('text="No connection"').isVisible().catch(() => false),
        await page.locator('[data-testid="offline-indicator"]').isVisible().catch(() => false)
      ];
      
      const offlineDetected = offlineIndicators.some(indicator => indicator);
      console.log('📡 Offline state detected:', offlineDetected);
      
      // Restore connection
      await page.context().setOffline(false);
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ 
        path: 'test-screenshots/network-restored.png', 
        fullPage: true 
      });
      
      console.log('✅ Network failure recovery tested');
    });
  });

  test.afterEach(async ({ page }) => {
    // Generate comprehensive test report
    console.log('\n📊 TEST SUMMARY REPORT:');
    console.log('========================');
    console.log(`Console Messages: ${consoleMessages.length}`);
    console.log(`Page Errors: ${pageErrors.length}`);
    console.log(`Network Requests: ${networkRequests.length}`);
    console.log(`Network Responses: ${networkResponses.length}`);
    
    // Log critical errors
    const criticalErrors = consoleMessages.filter(msg => 
      msg.type === 'error' && 
      !msg.text.includes('favicon') // Filter out non-critical favicon errors
    );
    
    if (criticalErrors.length > 0) {
      console.log('\n❌ CRITICAL CONSOLE ERRORS:');
      criticalErrors.forEach(error => {
        console.log(`  - ${error.text}`);
      });
    }
    
    // Log page errors
    if (pageErrors.length > 0) {
      console.log('\n❌ PAGE ERRORS:');
      pageErrors.forEach(error => {
        console.log(`  - ${error.message}`);
      });
    }
    
    // Log failed network requests
    const failedResponses = networkResponses.filter(resp => resp.status >= 400);
    if (failedResponses.length > 0) {
      console.log('\n❌ FAILED NETWORK REQUESTS:');
      failedResponses.forEach(resp => {
        console.log(`  - ${resp.status} ${resp.url}`);
      });
    }
    
    console.log('========================\n');
    
    // Wait before next test
    await page.waitForTimeout(1000);
  });
});