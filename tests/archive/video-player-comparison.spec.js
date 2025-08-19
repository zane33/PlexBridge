const { test, expect } = require('@playwright/test');

test.describe('Video Player Format Comparison', () => {
  test('Compare HLS vs Transcoded MP4 playback', async ({ page }) => {
    console.log('\n=== VIDEO PLAYER FORMAT COMPARISON ===\n');

    // Navigate to application
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Navigate to Stream Manager
    await page.locator('[data-testid="nav-streams"]').first().click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: './test-results/comparison-01-stream-manager.png', fullPage: true });

    // Get the first stream ID from the test data we saw earlier
    const streamId = 'bc861379-ed58-44af-b7cd-8c935b981b9b'; // HGTV stream

    // Test 1: Direct URL testing in browser
    console.log('=== TESTING HLS FORMAT DIRECTLY ===');
    
    const hlsUrl = `http://localhost:8080/streams/preview/${streamId}`;
    await page.goto(hlsUrl);
    await page.waitForTimeout(5000); // Wait for potential loading
    await page.screenshot({ path: './test-results/comparison-02-hls-direct-browser.png', fullPage: true });
    
    const hlsDirectAnalysis = await page.evaluate(() => {
      const video = document.querySelector('video');
      return {
        hasVideo: !!video,
        pageTitle: document.title,
        bodyContent: document.body.textContent?.substring(0, 200),
        contentType: document.contentType,
        videoProperties: video ? {
          src: video.src,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          duration: video.duration,
          readyState: video.readyState,
          error: video.error ? { code: video.error.code, message: video.error.message } : null
        } : null
      };
    });
    
    console.log('HLS Direct Browser Test:', JSON.stringify(hlsDirectAnalysis, null, 2));

    // Test 2: Transcoded format directly
    console.log('\n=== TESTING TRANSCODED MP4 FORMAT DIRECTLY ===');
    
    const transcodedUrl = `http://localhost:8080/streams/preview/${streamId}?transcode=true`;
    await page.goto(transcodedUrl);
    await page.waitForTimeout(10000); // Wait longer for transcoding
    await page.screenshot({ path: './test-results/comparison-03-transcoded-direct-browser.png', fullPage: true });
    
    const transcodedDirectAnalysis = await page.evaluate(() => {
      const video = document.querySelector('video');
      return {
        hasVideo: !!video,
        pageTitle: document.title,
        bodyContent: document.body.textContent?.substring(0, 200),
        contentType: document.contentType,
        videoProperties: video ? {
          src: video.src,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          duration: video.duration,
          readyState: video.readyState,
          error: video.error ? { code: video.error.code, message: video.error.message } : null
        } : null
      };
    });
    
    console.log('Transcoded Direct Browser Test:', JSON.stringify(transcodedDirectAnalysis, null, 2));

    // Test 3: Video player UI testing
    console.log('\n=== TESTING VIDEO PLAYER UI COMPONENT ===');
    
    // Go back to stream manager
    await page.goto('http://localhost:8080');
    await page.locator('[data-testid="nav-streams"]').first().click();
    await page.waitForLoadState('networkidle');

    // Click preview button for first stream (HGTV)
    const previewButton = page.locator('table tbody tr').first().locator('[data-testid="preview-stream-button"]');
    await previewButton.click();
    
    // Wait for dialog and take screenshot
    await page.waitForTimeout(3000);
    await page.screenshot({ path: './test-results/comparison-04-ui-player-default.png', fullPage: true });

    // Analyze default video player state
    const defaultPlayerState = await page.evaluate(() => {
      const video = document.querySelector('video');
      if (!video) return { error: 'No video element found' };
      
      return {
        src: video.src,
        currentSrc: video.currentSrc,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
        readyState: video.readyState,
        readyStateText: ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][video.readyState],
        paused: video.paused,
        currentTime: video.currentTime,
        error: video.error ? { code: video.error.code, message: video.error.message } : null,
        loadedData: video.readyState >= 2, // HAVE_CURRENT_DATA or higher
        hasVideo: video.videoWidth > 0 && video.videoHeight > 0
      };
    });
    
    console.log('Default UI Player State:', JSON.stringify(defaultPlayerState, null, 2));

    // Test with transcoding enabled
    console.log('\n=== TESTING WITH TRANSCODING ENABLED ===');
    
    // Toggle transcoding option
    const transcodingToggle = page.locator('text=Video Transcoding').locator('input[type="checkbox"]');
    if (await transcodingToggle.count() > 0) {
      await transcodingToggle.check();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: './test-results/comparison-05-ui-player-transcoded.png', fullPage: true });
      
      // Analyze transcoded player state
      const transcodedPlayerState = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) return { error: 'No video element found' };
        
        return {
          src: video.src,
          currentSrc: video.currentSrc,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          duration: video.duration,
          readyState: video.readyState,
          readyStateText: ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][video.readyState],
          paused: video.paused,
          currentTime: video.currentTime,
          error: video.error ? { code: video.error.code, message: video.error.message } : null,
          loadedData: video.readyState >= 2,
          hasVideo: video.videoWidth > 0 && video.videoHeight > 0
        };
      });
      
      console.log('Transcoded UI Player State:', JSON.stringify(transcodedPlayerState, null, 2));
    }

    // Test with Video.js player
    console.log('\n=== TESTING WITH VIDEO.JS PLAYER ===');
    
    // Toggle Video.js option
    const videojsToggle = page.locator('text=Video.js Player').locator('input[type="checkbox"]');
    if (await videojsToggle.count() > 0) {
      await videojsToggle.check();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: './test-results/comparison-06-ui-player-videojs.png', fullPage: true });
      
      // Analyze Video.js player state
      const videojsPlayerState = await page.evaluate(() => {
        const video = document.querySelector('video');
        const videojsPlayer = document.querySelector('.video-js');
        
        return {
          hasVideoElement: !!video,
          hasVideojsWrapper: !!videojsPlayer,
          videoProperties: video ? {
            src: video.src,
            currentSrc: video.currentSrc,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            duration: video.duration,
            readyState: video.readyState,
            error: video.error ? { code: video.error.code, message: video.error.message } : null,
            hasVideo: video.videoWidth > 0 && video.videoHeight > 0
          } : null,
          videojsClasses: videojsPlayer ? videojsPlayer.className : null
        };
      });
      
      console.log('Video.js UI Player State:', JSON.stringify(videojsPlayerState, null, 2));
    }

    // Test browser codec support again for reference
    console.log('\n=== BROWSER CODEC SUPPORT REFERENCE ===');
    
    const codecSupport = await page.evaluate(() => {
      const video = document.createElement('video');
      
      const testCodecs = [
        { name: 'H.264 MP4', type: 'video/mp4; codecs="avc1.42E01E"' },
        { name: 'HLS', type: 'application/vnd.apple.mpegurl' },
        { name: 'M3U8', type: 'application/x-mpegURL' },
        { name: 'MPEG-TS', type: 'video/mp2t' }
      ];

      return {
        userAgent: navigator.userAgent,
        codecs: testCodecs.map(codec => ({
          ...codec,
          support: video.canPlayType(codec.type)
        })),
        mediaSource: typeof window.MediaSource !== 'undefined'
      };
    });
    
    console.log('Browser Codec Support:', JSON.stringify(codecSupport, null, 2));

    // Final summary analysis
    console.log('\n=== ANALYSIS SUMMARY ===');
    console.log('1. HLS Direct:', hlsDirectAnalysis.hasVideo ? 'Has video element' : 'No video element');
    console.log('2. Transcoded Direct:', transcodedDirectAnalysis.hasVideo ? 'Has video element' : 'No video element');
    console.log('3. Default UI Player Video Dimensions:', defaultPlayerState.hasVideo ? `${defaultPlayerState.videoWidth}x${defaultPlayerState.videoHeight}` : 'No video dimensions');
    console.log('4. Default UI Player Duration:', defaultPlayerState.duration || 'No duration');
    console.log('5. Default UI Player Ready State:', defaultPlayerState.readyStateText || 'Unknown');

    await page.screenshot({ path: './test-results/comparison-07-final-state.png', fullPage: true });
  });

  test('Test external player links', async ({ page }) => {
    console.log('\n=== TESTING EXTERNAL PLAYER LINKS ===\n');

    await page.goto('http://localhost:8080');
    await page.locator('[data-testid="nav-streams"]').first().click();
    await page.waitForLoadState('networkidle');

    // Open video player dialog
    const previewButton = page.locator('table tbody tr').first().locator('[data-testid="preview-stream-button"]');
    await previewButton.click();
    await page.waitForTimeout(2000);

    // Test VLC button
    const vlcButton = page.locator('text=VLC');
    const mpcButton = page.locator('text=MPC-HC');
    
    console.log('VLC button exists:', await vlcButton.count() > 0);
    console.log('MPC-HC button exists:', await mpcButton.count() > 0);

    // Get the URLs that would be opened by external players
    const externalPlayerUrls = await page.evaluate(() => {
      const vlcBtn = document.querySelector('button:has-text("VLC"), a:has-text("VLC")');
      const mpcBtn = document.querySelector('button:has-text("MPC-HC"), a:has-text("MPC-HC")');
      
      return {
        vlc: vlcBtn ? vlcBtn.href || vlcBtn.getAttribute('href') : null,
        mpc: mpcBtn ? mpcBtn.href || mpcBtn.getAttribute('href') : null
      };
    });
    
    console.log('External Player URLs:', externalPlayerUrls);

    await page.screenshot({ path: './test-results/external-players-ui.png', fullPage: true });
  });
});