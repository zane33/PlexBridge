const { test, expect } = require('@playwright/test');

test.describe('PlexBridge Streaming Functionality - Comprehensive Analysis', () => {
  let screenshotCounter = 1;
  const screenshots = [];
  const issues = [];
  const networkRequests = [];
  const consoleMessages = [];

  // Helper function to take and document screenshots
  async function takeAnalysisScreenshot(page, description, analysis = '') {
    const filename = `streaming-analysis-${screenshotCounter.toString().padStart(2, '0')}-${description.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.png`;
    await page.screenshot({ 
      path: `tests/e2e/screenshots-streaming/${filename}`,
      fullPage: true 
    });
    
    screenshots.push({
      number: screenshotCounter,
      filename,
      description,
      analysis,
      timestamp: new Date().toISOString()
    });
    
    console.log(`📸 Screenshot ${screenshotCounter}: ${description}`);
    if (analysis) console.log(`   Analysis: ${analysis}`);
    
    screenshotCounter++;
    return filename;
  }

  // Helper function to log issues
  function logIssue(type, description, severity = 'medium') {
    issues.push({
      type,
      description,
      severity,
      timestamp: new Date().toISOString()
    });
    console.log(`❌ ${type.toUpperCase()}: ${description} (Severity: ${severity})`);
  }

  // Helper function to check for JavaScript errors in console
  async function checkConsoleErrors(page) {
    const errors = consoleMessages.filter(msg => msg.type === 'error');
    if (errors.length > 0) {
      logIssue('console-error', `Found ${errors.length} JavaScript errors in console`, 'high');
      errors.forEach(error => {
        console.log(`   - ${error.text}`);
      });
    }
    return errors;
  }

  // Helper function to analyze network requests
  function analyzeNetworkRequests(requests) {
    const failedRequests = requests.filter(req => req.status >= 400);
    const streamRequests = requests.filter(req => req.url.includes('/streams/'));
    const apiRequests = requests.filter(req => req.url.includes('/api/'));
    
    if (failedRequests.length > 0) {
      logIssue('network-error', `Found ${failedRequests.length} failed network requests`, 'high');
      failedRequests.forEach(req => {
        console.log(`   - ${req.method} ${req.url} → ${req.status}`);
      });
    }
    
    return {
      total: requests.length,
      failed: failedRequests.length,
      stream: streamRequests.length,
      api: apiRequests.length
    };
  }

  test.beforeEach(async ({ page }) => {
    // Reset counters and arrays for each test
    screenshotCounter = 1;
    screenshots.length = 0;
    issues.length = 0;
    networkRequests.length = 0;
    consoleMessages.length = 0;

    // Create screenshots directory
    await page.evaluate(() => {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(process.cwd(), 'tests/e2e/screenshots-streaming');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }).catch(() => {
      // Directory creation might fail in browser context, that's OK
    });

    // Set up network monitoring
    page.on('request', request => {
      networkRequests.push({
        method: request.method(),
        url: request.url(),
        timestamp: new Date().toISOString()
      });
    });

    page.on('response', response => {
      const request = networkRequests.find(req => req.url === response.url());
      if (request) {
        request.status = response.status();
        request.statusText = response.statusText();
      }
    });

    // Set up console monitoring
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
    });

    // Set up error monitoring
    page.on('pageerror', error => {
      logIssue('page-error', `Page error: ${error.message}`, 'high');
    });

    // Navigate to application
    await page.goto('/', { waitUntil: 'networkidle' });
  });

  test('Comprehensive Streaming Functionality Analysis - Desktop (1920x1080)', async ({ page }) => {
    console.log('\n🚀 Starting Comprehensive Streaming Functionality Analysis');
    console.log('📱 Testing on Desktop: 1920x1080');

    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // 1. Initial Dashboard State
    await takeAnalysisScreenshot(page, 'dashboard-initial-state', 
      'Capturing initial dashboard state to verify app loads correctly');

    // Check for immediate JavaScript errors
    await page.waitForTimeout(2000);
    await checkConsoleErrors(page);

    // 2. Navigate to Stream Manager
    console.log('\n📡 Testing Stream Manager Navigation');
    
    // Check if streams navigation exists - handle multiple matches by using desktop drawer
    const desktopStreamsNav = page.locator('[data-testid="desktop-drawer"] [data-testid="nav-streams"]');
    if (await desktopStreamsNav.count() > 0) {
      await desktopStreamsNav.click();
    } else {
      // Try alternative selectors if desktop drawer not found
      const altStreamsNav = page.locator('text="Streams"').first();
      if (await altStreamsNav.count() > 0) {
        await altStreamsNav.click();
      } else {
        logIssue('navigation-error', 'Cannot find Streams navigation link', 'high');
        await takeAnalysisScreenshot(page, 'navigation-missing-streams', 
          'Streams navigation link not found - checking available navigation options');
      }
    }

    await page.waitForTimeout(1000);
    await takeAnalysisScreenshot(page, 'streams-page-loaded', 
      'Stream Manager page loaded - checking for stream list and controls');

    // 3. Analyze Stream Manager Layout
    const streamTableExists = await page.locator('table').count() > 0;
    const streamCardsExist = await page.locator('[data-testid*="stream"]').count() > 0;
    
    if (!streamTableExists && !streamCardsExist) {
      logIssue('ui-layout', 'No streams table or cards found on streams page', 'medium');
    }

    // 4. Check for existing streams
    console.log('\n📋 Analyzing Existing Streams');
    const streamRows = page.locator('table tbody tr, [data-testid*="stream-item"]');
    const streamCount = await streamRows.count();
    
    console.log(`Found ${streamCount} existing streams`);
    
    if (streamCount === 0) {
      await takeAnalysisScreenshot(page, 'no-streams-found', 
        'No existing streams found - will test with sample stream');
      
      // Try to add a test stream
      const addStreamBtn = page.locator('[data-testid="add-stream-button"], button:has-text("Add Stream")').first();
      if (await addStreamBtn.count() > 0) {
        await addStreamBtn.click();
        await page.waitForTimeout(1000);
        
        await takeAnalysisScreenshot(page, 'add-stream-dialog', 
          'Add stream dialog opened - checking form fields');
        
        // Fill in test stream data
        const nameInput = page.locator('[data-testid="stream-name-input"], input[placeholder*="name" i]').first();
        const urlInput = page.locator('[data-testid="stream-url-input"], input[placeholder*="url" i]').first();
        
        if (await nameInput.count() > 0 && await urlInput.count() > 0) {
          await nameInput.fill('Test Audio Stream');
          await urlInput.fill('https://stream.radiojar.com/4wqre23fytzuv');
          
          const saveBtn = page.locator('[data-testid="save-stream-button"], button:has-text("Save")').first();
          if (await saveBtn.count() > 0) {
            await saveBtn.click();
            await page.waitForTimeout(2000);
            
            await takeAnalysisScreenshot(page, 'test-stream-added', 
              'Test stream added successfully');
          }
        }
      }
    }

    // 5. Test Stream Preview Functionality
    console.log('\n🎥 Testing Stream Preview Functionality');
    
    // Look for preview buttons
    const previewButtons = page.locator('[data-testid="preview-stream-button"], button:has-text("Preview"), button[title*="preview" i]');
    const previewCount = await previewButtons.count();
    
    console.log(`Found ${previewCount} preview buttons`);
    
    if (previewCount > 0) {
      // Test first preview button
      await previewButtons.first().click();
      await page.waitForTimeout(3000);
      
      await takeAnalysisScreenshot(page, 'stream-preview-dialog', 
        'Stream preview dialog opened - checking video player component');
      
      // Check for video player elements
      const videoPlayer = page.locator('video, [data-testid="video-player"], .video-player');
      const videoPlayerExists = await videoPlayer.count() > 0;
      
      if (videoPlayerExists) {
        console.log('✅ Video player component found');
        
        // Check video player state
        const videoElement = videoPlayer.first();
        const videoSrc = await videoElement.getAttribute('src');
        const videoControls = await videoElement.getAttribute('controls');
        
        console.log(`Video src: ${videoSrc}`);
        console.log(`Video controls: ${videoControls}`);
        
        // Wait for video to potentially load
        await page.waitForTimeout(5000);
        
        await takeAnalysisScreenshot(page, 'video-player-state', 
          'Video player after loading attempt - checking for playback or errors');
        
        // Check for video player errors
        const videoError = await page.evaluate(() => {
          const videos = document.querySelectorAll('video');
          for (let video of videos) {
            if (video.error) {
              return {
                code: video.error.code,
                message: video.error.message
              };
            }
          }
          return null;
        });
        
        if (videoError) {
          logIssue('video-error', `Video player error: ${videoError.message} (Code: ${videoError.code})`, 'high');
        }
        
      } else {
        logIssue('ui-component', 'Video player component not found in preview dialog', 'high');
      }
      
      // Check for Material-UI dialog errors
      const dialogError = page.locator('.MuiDialog-root .error, .error-message');
      if (await dialogError.count() > 0) {
        const errorText = await dialogError.first().textContent();
        logIssue('dialog-error', `Dialog error message: ${errorText}`, 'medium');
      }
      
      // Close dialog
      const closeBtn = page.locator('[data-testid="close-dialog"], button:has-text("Close"), .MuiDialog-root [aria-label="close"]').first();
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(1000);
      }
    } else {
      logIssue('ui-missing', 'No preview buttons found on streams page', 'medium');
    }

    // 6. Test Proxied Stream Endpoints
    console.log('\n🔗 Testing Proxied Stream Endpoints');
    
    // Navigate to a stream preview URL directly
    const testStreamId = 'test-stream-uuid';
    const proxyUrl = `/streams/preview/${testStreamId}`;
    
    await page.goto(proxyUrl, { waitUntil: 'networkidle' });
    await takeAnalysisScreenshot(page, 'proxy-stream-direct', 
      'Direct access to proxied stream endpoint - checking response');
    
    // Check if it's a valid response or error page
    const pageContent = await page.textContent('body');
    if (pageContent.includes('Cannot GET') || pageContent.includes('404') || pageContent.includes('Not Found')) {
      logIssue('endpoint-error', `Proxied stream endpoint ${proxyUrl} returns 404`, 'medium');
    }

    // 7. Test API Endpoints
    console.log('\n🔌 Testing Stream-related API Endpoints');
    
    // Test /api/streams endpoint
    const streamsApiResponse = await page.request.get('/api/streams');
    console.log(`API /api/streams status: ${streamsApiResponse.status()}`);
    
    if (streamsApiResponse.status() !== 200) {
      logIssue('api-error', `/api/streams returned status ${streamsApiResponse.status()}`, 'high');
    }

    // Return to streams page
    await page.goto('/streams', { waitUntil: 'networkidle' });
    await takeAnalysisScreenshot(page, 'final-streams-state', 
      'Final streams page state after all tests');

    // 8. Network Analysis
    console.log('\n🌐 Analyzing Network Requests');
    const networkAnalysis = analyzeNetworkRequests(networkRequests);
    console.log(`Total requests: ${networkAnalysis.total}`);
    console.log(`Failed requests: ${networkAnalysis.failed}`);
    console.log(`Stream requests: ${networkAnalysis.stream}`);
    console.log(`API requests: ${networkAnalysis.api}`);

    // 9. Final Console Check
    await checkConsoleErrors(page);

    // 10. Generate Summary Report
    console.log('\n📊 Test Summary Report');
    console.log('==========================================');
    console.log(`Screenshots captured: ${screenshots.length}`);
    console.log(`Issues found: ${issues.length}`);
    console.log(`Network requests: ${networkRequests.length}`);
    console.log(`Console messages: ${consoleMessages.length}`);
    
    if (issues.length > 0) {
      console.log('\n❌ Issues Found:');
      issues.forEach((issue, index) => {
        console.log(`${index + 1}. [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`);
      });
    } else {
      console.log('\n✅ No critical issues found');
    }
    
    console.log('\n📸 Screenshots Captured:');
    screenshots.forEach(screenshot => {
      console.log(`${screenshot.number}. ${screenshot.description}`);
      if (screenshot.analysis) {
        console.log(`   Analysis: ${screenshot.analysis}`);
      }
    });
  });

  test('Mobile Streaming Functionality Analysis (375x667)', async ({ page }) => {
    console.log('\n📱 Starting Mobile Streaming Functionality Analysis');
    console.log('📱 Testing on Mobile: 375x667');

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await takeAnalysisScreenshot(page, 'mobile-dashboard-initial', 
      'Mobile dashboard initial state - checking responsive design');

    // Test mobile navigation
    const mobileMenuBtn = page.locator('[data-testid="mobile-menu-button"], .MuiIconButton-root[aria-label*="menu"]').first();
    if (await mobileMenuBtn.count() > 0) {
      await mobileMenuBtn.click();
      await page.waitForTimeout(1000);
      
      await takeAnalysisScreenshot(page, 'mobile-menu-opened', 
        'Mobile navigation menu opened - checking menu items');
      
      // Navigate to streams - use visible mobile navigation
      const mobileStreamsLink = page.locator('[data-testid="mobile-drawer"] [data-testid="nav-streams"], .MuiDrawer-root [data-testid="nav-streams"]').first();
      if (await mobileStreamsLink.count() > 0) {
        await mobileStreamsLink.click();
        await page.waitForTimeout(1000);
        
        await takeAnalysisScreenshot(page, 'mobile-streams-page', 
          'Mobile streams page - checking responsive layout and touch controls');
      } else {
        logIssue('mobile-navigation', 'Mobile streams navigation not found', 'medium');
      }
    } else {
      logIssue('mobile-navigation', 'Mobile menu button not found', 'medium');
    }

    // Test mobile stream preview
    const mobilePreviewBtn = page.locator('[data-testid="preview-stream-button"], button:has-text("Preview")').first();
    if (await mobilePreviewBtn.count() > 0) {
      await mobilePreviewBtn.click();
      await page.waitForTimeout(2000);
      
      await takeAnalysisScreenshot(page, 'mobile-stream-preview', 
        'Mobile stream preview dialog - checking video player on mobile');
    }

    await takeAnalysisScreenshot(page, 'mobile-final-state', 
      'Mobile final state - summary of mobile functionality');
  });

  test.afterEach(async ({ page }) => {
    // Final analysis and cleanup
    console.log('\n🔍 Final Analysis Complete');
    
    // Save detailed test results to a file
    const testResults = {
      timestamp: new Date().toISOString(),
      screenshots,
      issues,
      networkRequests: networkRequests.slice(-50), // Last 50 requests
      consoleMessages: consoleMessages.slice(-50), // Last 50 messages
      summary: {
        totalScreenshots: screenshots.length,
        totalIssues: issues.length,
        criticalIssues: issues.filter(i => i.severity === 'high').length,
        networkRequests: networkRequests.length,
        failedRequests: networkRequests.filter(r => r.status >= 400).length
      }
    };

    // Write results to file (this will work in Node.js context)
    await page.evaluate((results) => {
      // This runs in browser context, can't write files directly
      console.log('Test Results:', JSON.stringify(results, null, 2));
    }, testResults).catch(() => {
      // Expected to fail in browser context
    });
  });
});