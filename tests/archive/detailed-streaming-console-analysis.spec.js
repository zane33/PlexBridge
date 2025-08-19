const { test, expect } = require('@playwright/test');

test.describe('Detailed Streaming Console and Video Analysis', () => {
  const consoleMessages = [];
  const networkFailures = [];
  const videoPlayerErrors = [];

  test.beforeEach(async ({ page }) => {
    // Clear arrays
    consoleMessages.length = 0;
    networkFailures.length = 0;
    videoPlayerErrors.length = 0;

    // Monitor console messages with detailed error tracking
    page.on('console', msg => {
      const message = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString(),
        url: msg.location()?.url || 'unknown'
      };
      consoleMessages.push(message);
      
      if (msg.type() === 'error') {
        console.log(`❌ Console Error: ${msg.text()}`);
      } else if (msg.type() === 'warning') {
        console.log(`⚠️ Console Warning: ${msg.text()}`);
      }
    });

    // Monitor network failures
    page.on('response', response => {
      if (response.status() >= 400) {
        const failure = {
          url: response.url(),
          status: response.status(),
          statusText: response.statusText(),
          timestamp: new Date().toISOString()
        };
        networkFailures.push(failure);
        console.log(`🌐 Network Failure: ${response.status()} ${response.url()}`);
      }
    });

    // Monitor page errors
    page.on('pageerror', error => {
      console.log(`💥 Page Error: ${error.message}`);
    });

    await page.goto('/');
  });

  test('Detailed Stream Preview Console Analysis', async ({ page }) => {
    console.log('\n🔍 Starting Detailed Stream Preview Console Analysis');
    
    // Navigate to streams page
    await page.locator('[data-testid="desktop-drawer"] [data-testid="nav-streams"]').click();
    await page.waitForTimeout(2000);
    
    console.log('\n📊 Initial Console State:');
    console.log(`Console messages: ${consoleMessages.length}`);
    console.log(`Network failures: ${networkFailures.length}`);
    
    // Take screenshot of streams page
    await page.screenshot({ 
      path: 'tests/e2e/screenshots-streaming/detailed-01-streams-page.png',
      fullPage: true 
    });
    
    // Find and click first preview button
    const previewButton = page.locator('[data-testid="preview-stream-button"], button:has-text("Preview"), .MuiIconButton-root[title*="preview" i]').first();
    
    if (await previewButton.count() > 0) {
      console.log('\n🎥 Opening Stream Preview...');
      await previewButton.click();
      await page.waitForTimeout(3000);
      
      // Take screenshot of preview dialog
      await page.screenshot({ 
        path: 'tests/e2e/screenshots-streaming/detailed-02-preview-opened.png',
        fullPage: true 
      });
      
      // Wait longer for video player to initialize
      await page.waitForTimeout(5000);
      
      // Analyze video player state
      console.log('\n🎬 Analyzing Video Player State...');
      
      const videoPlayerAnalysis = await page.evaluate(() => {
        const videos = document.querySelectorAll('video');
        const analysis = {
          videoElementsFound: videos.length,
          players: []
        };
        
        videos.forEach((video, index) => {
          const playerInfo = {
            index,
            src: video.src || video.currentSrc || 'none',
            readyState: video.readyState,
            networkState: video.networkState,
            duration: video.duration,
            currentTime: video.currentTime,
            paused: video.paused,
            ended: video.ended,
            controls: video.controls,
            autoplay: video.autoplay,
            muted: video.muted,
            error: video.error ? {
              code: video.error.code,
              message: video.error.message
            } : null,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
          };
          analysis.players.push(playerInfo);
        });
        
        return analysis;
      });
      
      console.log('\n📺 Video Player Analysis Results:');
      console.log(`Video elements found: ${videoPlayerAnalysis.videoElementsFound}`);
      
      videoPlayerAnalysis.players.forEach((player, index) => {
        console.log(`\nPlayer ${index + 1}:`);
        console.log(`  Source: ${player.src}`);
        console.log(`  Ready State: ${player.readyState} (0=empty, 1=metadata, 2=currentdata, 3=futuredata, 4=enough)`);
        console.log(`  Network State: ${player.networkState} (0=empty, 1=idle, 2=loading, 3=loaded)`);
        console.log(`  Duration: ${player.duration}`);
        console.log(`  Current Time: ${player.currentTime}`);
        console.log(`  Paused: ${player.paused}`);
        console.log(`  Controls: ${player.controls}`);
        console.log(`  Video Dimensions: ${player.videoWidth}x${player.videoHeight}`);
        
        if (player.error) {
          console.log(`  ❌ Video Error: Code ${player.error.code} - ${player.error.message}`);
          videoPlayerErrors.push(player.error);
        }
      });
      
      // Check for Video.js or other video libraries
      const videoLibraryInfo = await page.evaluate(() => {
        const info = {
          videojs: typeof window.videojs !== 'undefined',
          hlsjs: typeof window.Hls !== 'undefined',
          dashjs: typeof window.dashjs !== 'undefined',
          plyr: typeof window.Plyr !== 'undefined'
        };
        
        // Check for Video.js players
        if (info.videojs && window.videojs.getPlayers) {
          const players = window.videojs.getPlayers();
          info.videojsPlayers = Object.keys(players).length;
        }
        
        return info;
      });
      
      console.log('\n📚 Video Library Detection:');
      console.log(`Video.js: ${videoLibraryInfo.videojs ? 'Found' : 'Not found'}`);
      console.log(`HLS.js: ${videoLibraryInfo.hlsjs ? 'Found' : 'Not found'}`);
      console.log(`Dash.js: ${videoLibraryInfo.dashjs ? 'Found' : 'Not found'}`);
      console.log(`Plyr: ${videoLibraryInfo.plyr ? 'Found' : 'Not found'}`);
      
      if (videoLibraryInfo.videojsPlayers) {
        console.log(`Video.js Players: ${videoLibraryInfo.videojsPlayers}`);
      }
      
      // Take screenshot after video analysis
      await page.screenshot({ 
        path: 'tests/e2e/screenshots-streaming/detailed-03-video-analyzed.png',
        fullPage: true 
      });
      
      // Test different playback modes by toggling options
      console.log('\n⚙️ Testing Playback Options...');
      
      // Try toggling proxy mode
      const proxyToggle = page.locator('input[type="checkbox"]:near(:text("PlexBridge Proxy"))').first();
      if (await proxyToggle.count() > 0) {
        console.log('Testing PlexBridge Proxy toggle...');
        await proxyToggle.click();
        await page.waitForTimeout(2000);
        
        await page.screenshot({ 
          path: 'tests/e2e/screenshots-streaming/detailed-04-proxy-toggled.png',
          fullPage: true 
        });
      }
      
      // Try toggling transcoding
      const transcodingToggle = page.locator('input[type="checkbox"]:near(:text("Video Transcoding"))').first();
      if (await transcodingToggle.count() > 0) {
        console.log('Testing Video Transcoding toggle...');
        await transcodingToggle.click();
        await page.waitForTimeout(2000);
        
        await page.screenshot({ 
          path: 'tests/e2e/screenshots-streaming/detailed-05-transcoding-toggled.png',
          fullPage: true 
        });
      }
      
      // Test external player buttons
      const vlcButton = page.locator('button:has-text("VLC")');
      const mpcButton = page.locator('button:has-text("MPC-HC")');
      
      if (await vlcButton.count() > 0) {
        console.log('VLC button found - testing click...');
        await vlcButton.click();
        await page.waitForTimeout(1000);
      }
      
      if (await mpcButton.count() > 0) {
        console.log('MPC-HC button found - testing click...');
        await mpcButton.click();
        await page.waitForTimeout(1000);
      }
      
      await page.screenshot({ 
        path: 'tests/e2e/screenshots-streaming/detailed-06-final-state.png',
        fullPage: true 
      });
      
    } else {
      console.log('❌ No preview buttons found');
    }
    
    // Final console analysis
    console.log('\n📊 Final Console Analysis:');
    console.log(`Total console messages: ${consoleMessages.length}`);
    console.log(`Network failures: ${networkFailures.length}`);
    console.log(`Video player errors: ${videoPlayerErrors.length}`);
    
    // Report console errors
    const errors = consoleMessages.filter(msg => msg.type === 'error');
    const warnings = consoleMessages.filter(msg => msg.type === 'warning');
    
    console.log(`\n❌ Console Errors (${errors.length}):`);
    errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.text} (${error.url})`);
    });
    
    console.log(`\n⚠️ Console Warnings (${warnings.length}):`);
    warnings.forEach((warning, index) => {
      console.log(`${index + 1}. ${warning.text} (${warning.url})`);
    });
    
    console.log(`\n🌐 Network Failures (${networkFailures.length}):`);
    networkFailures.forEach((failure, index) => {
      console.log(`${index + 1}. ${failure.status} ${failure.statusText} - ${failure.url}`);
    });
    
    // Test specific stream URLs directly
    console.log('\n🔗 Testing Direct Stream Proxy URLs...');
    
    // Get stream IDs from the page
    const streamInfo = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const streams = [];
      
      rows.forEach(row => {
        const nameCell = row.querySelector('td:first-child');
        const urlCell = row.querySelector('td:nth-child(4)'); // URL column
        const previewBtn = row.querySelector('[data-testid="preview-stream-button"], button[title*="preview" i]');
        
        if (nameCell && urlCell && previewBtn) {
          // Try to extract stream ID from preview button or data attributes
          const onClick = previewBtn.getAttribute('onclick') || '';
          const dataId = previewBtn.getAttribute('data-stream-id') || '';
          
          streams.push({
            name: nameCell.textContent.trim(),
            url: urlCell.textContent.trim(),
            id: dataId || onClick.match(/[a-f0-9-]{36}/)?.[0] || 'unknown'
          });
        }
      });
      
      return streams;
    });
    
    console.log(`Found ${streamInfo.length} streams for direct testing`);
    
    // Test first few stream proxy URLs
    for (let i = 0; i < Math.min(3, streamInfo.length); i++) {
      const stream = streamInfo[i];
      if (stream.id !== 'unknown') {
        const proxyUrl = `/streams/preview/${stream.id}`;
        console.log(`\nTesting proxy URL: ${proxyUrl} for stream: ${stream.name}`);
        
        try {
          const response = await page.request.get(proxyUrl);
          console.log(`Response status: ${response.status()}`);
          
          if (response.status() === 200) {
            const contentType = response.headers()['content-type'] || '';
            console.log(`Content-Type: ${contentType}`);
          }
        } catch (error) {
          console.log(`Request failed: ${error.message}`);
        }
      }
    }
  });

  test.afterEach(async ({ page }) => {
    // Save detailed analysis to file
    const analysisReport = {
      timestamp: new Date().toISOString(),
      summary: {
        totalConsoleMessages: consoleMessages.length,
        consoleErrors: consoleMessages.filter(m => m.type === 'error').length,
        consoleWarnings: consoleMessages.filter(m => m.type === 'warning').length,
        networkFailures: networkFailures.length,
        videoPlayerErrors: videoPlayerErrors.length
      },
      consoleMessages: consoleMessages.slice(-100), // Last 100 messages
      networkFailures,
      videoPlayerErrors
    };
    
    console.log('\n📊 DETAILED ANALYSIS SUMMARY');
    console.log('=' .repeat(50));
    console.log(`Timestamp: ${analysisReport.timestamp}`);
    console.log(`Console Messages: ${analysisReport.summary.totalConsoleMessages}`);
    console.log(`Console Errors: ${analysisReport.summary.consoleErrors}`);
    console.log(`Console Warnings: ${analysisReport.summary.consoleWarnings}`);
    console.log(`Network Failures: ${analysisReport.summary.networkFailures}`);
    console.log(`Video Player Errors: ${analysisReport.summary.videoPlayerErrors}`);
    console.log('=' .repeat(50));
  });
});