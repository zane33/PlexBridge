const { test, expect } = require('@playwright/test');

test.describe('Video Player Format Testing - Audio-Only Issue Diagnosis', () => {
  let page;
  let context;

  test.beforeAll(async ({ browser }) => {
    // Create a new context with proper permissions and settings
    context = await browser.newContext({
      permissions: ['microphone', 'camera'],
      recordVideo: {
        dir: './test-results/videos',
        size: { width: 1920, height: 1080 }
      }
    });
    page = await context.newPage();

    // Enable console logging for debugging
    page.on('console', (msg) => {
      console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text());
    });

    // Monitor network failures
    page.on('requestfailed', (request) => {
      console.log(`[NETWORK FAILURE]: ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Monitor JavaScript errors
    page.on('pageerror', (error) => {
      console.log(`[PAGE ERROR]:`, error.message);
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('Comprehensive Video Player Format Analysis', async () => {
    console.log('\n=== STARTING COMPREHENSIVE VIDEO PLAYER FORMAT TESTING ===\n');

    // Step 1: Navigate to application and verify basic functionality
    console.log('Step 1: Loading PlexBridge application...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.screenshot({ path: './test-results/01-homepage-loaded.png', fullPage: true });

    // Verify page loaded correctly
    await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
    console.log('✓ Application loaded successfully');

    // Step 2: Navigate to Stream Manager
    console.log('\nStep 2: Navigating to Stream Manager...');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: './test-results/02-stream-manager-loaded.png', fullPage: true });

    // Verify streams table loaded
    await expect(page.locator('table')).toBeVisible();
    console.log('✓ Stream Manager loaded successfully');

    // Step 3: Check if we have any existing streams to test
    console.log('\nStep 3: Checking for existing streams...');
    const streamRows = await page.locator('table tbody tr').count();
    console.log(`Found ${streamRows} streams in database`);

    let testStreamId = null;
    if (streamRows > 0) {
      // Get the first stream ID for testing
      const firstRow = page.locator('table tbody tr').first();
      testStreamId = await firstRow.getAttribute('data-stream-id') || 
                    await firstRow.locator('[data-testid="preview-stream-button"]').getAttribute('data-stream-id');
      
      if (!testStreamId) {
        // Try to extract from preview button click handler
        const previewButton = firstRow.locator('[data-testid="preview-stream-button"]');
        if (await previewButton.count() > 0) {
          const onClickAttr = await previewButton.getAttribute('onclick') || '';
          const match = onClickAttr.match(/['"]([^'"]+)['"]/);
          if (match) {
            testStreamId = match[1];
          }
        }
      }
      
      console.log(`Using stream ID for testing: ${testStreamId}`);
    }

    // Step 4: Test API endpoints directly first
    console.log('\nStep 4: Testing API endpoints directly...');
    
    // Test health endpoint
    const healthResponse = await page.evaluate(async () => {
      const response = await fetch('/health');
      return {
        status: response.status,
        data: await response.json(),
        headers: Object.fromEntries(response.headers.entries())
      };
    });
    console.log('Health endpoint response:', healthResponse);

    // Test streams API endpoint
    const streamsApiResponse = await page.evaluate(async () => {
      const response = await fetch('/api/streams');
      return {
        status: response.status,
        data: await response.json(),
        headers: Object.fromEntries(response.headers.entries())
      };
    });
    console.log('Streams API response:', streamsApiResponse);

    // Test discover.json (Plex endpoint)
    const discoverResponse = await page.evaluate(async () => {
      const response = await fetch('/discover.json');
      return {
        status: response.status,
        data: await response.json(),
        headers: Object.fromEntries(response.headers.entries())
      };
    });
    console.log('Discover.json endpoint response:', discoverResponse);

    // Test lineup.json (Plex endpoint)
    const lineupResponse = await page.evaluate(async () => {
      const response = await fetch('/lineup.json');
      return {
        status: response.status,
        data: await response.json(),
        headers: Object.fromEntries(response.headers.entries())
      };
    });
    console.log('Lineup.json endpoint response:', lineupResponse);

    // Step 5: Test stream preview functionality if we have streams
    if (testStreamId && streamRows > 0) {
      console.log('\nStep 5: Testing stream preview functionality...');
      
      // Test HLS stream preview (original format)
      console.log('\n--- Testing HLS Stream Preview (Original Format) ---');
      const hlsStreamResponse = await page.evaluate(async (streamId) => {
        try {
          const response = await fetch(`/streams/preview/${streamId}`);
          const responseData = {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            url: response.url,
            redirected: response.redirected
          };
          
          // Try to get response content if it's JSON
          if (response.headers.get('content-type')?.includes('application/json')) {
            responseData.data = await response.json();
          } else {
            responseData.contentType = response.headers.get('content-type');
            responseData.contentLength = response.headers.get('content-length');
          }
          
          return responseData;
        } catch (error) {
          return { error: error.message };
        }
      }, testStreamId);
      console.log('HLS stream preview response:', hlsStreamResponse);

      // Test transcoded stream preview (MP4 format)
      console.log('\n--- Testing Transcoded Stream Preview (MP4 Format) ---');
      const transcodedStreamResponse = await page.evaluate(async (streamId) => {
        try {
          const response = await fetch(`/streams/preview/${streamId}?transcode=true`);
          const responseData = {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            url: response.url,
            redirected: response.redirected
          };
          
          // Try to get response content if it's JSON
          if (response.headers.get('content-type')?.includes('application/json')) {
            responseData.data = await response.json();
          } else {
            responseData.contentType = response.headers.get('content-type');
            responseData.contentLength = response.headers.get('content-length');
          }
          
          return responseData;
        } catch (error) {
          return { error: error.message };
        }
      }, testStreamId);
      console.log('Transcoded stream preview response:', transcodedStreamResponse);

      // Step 6: Test video player with both formats
      console.log('\nStep 6: Testing video player behavior with different formats...');
      
      // Find and click a preview button to open video player
      const previewButton = page.locator('[data-testid="preview-stream-button"]').first();
      if (await previewButton.count() > 0) {
        console.log('Clicking preview button to open video player...');
        await previewButton.click();
        
        // Wait for video player dialog to appear
        await page.waitForSelector('[data-testid="stream-player-dialog"]', { timeout: 10000 });
        await page.screenshot({ path: './test-results/03-video-player-dialog-opened.png', fullPage: true });
        
        // Wait for video element to be available
        await page.waitForSelector('video', { timeout: 10000 });
        
        // Step 6a: Analyze video element properties for HLS format
        console.log('\n--- Analyzing Video Element Properties (HLS Format) ---');
        const hlsVideoProperties = await page.evaluate(() => {
          const video = document.querySelector('video');
          if (!video) return { error: 'No video element found' };
          
          return {
            src: video.src,
            currentSrc: video.currentSrc,
            readyState: video.readyState,
            readyStateText: ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][video.readyState],
            networkState: video.networkState,
            networkStateText: ['NETWORK_EMPTY', 'NETWORK_IDLE', 'NETWORK_LOADING', 'NETWORK_NO_SOURCE'][video.networkState],
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            duration: video.duration,
            currentTime: video.currentTime,
            paused: video.paused,
            ended: video.ended,
            muted: video.muted,
            volume: video.volume,
            playbackRate: video.playbackRate,
            buffered: video.buffered.length > 0 ? {
              start: video.buffered.start(0),
              end: video.buffered.end(video.buffered.length - 1)
            } : null,
            error: video.error ? {
              code: video.error.code,
              message: video.error.message
            } : null,
            controls: video.controls,
            autoplay: video.autoplay,
            loop: video.loop,
            preload: video.preload
          };
        });
        console.log('HLS Video Element Properties:', JSON.stringify(hlsVideoProperties, null, 2));
        
        // Take screenshot of video player in current state
        await page.screenshot({ path: './test-results/04-video-player-hls-format.png', fullPage: true });
        
        // Try to play the video and monitor events
        console.log('Attempting to play HLS video...');
        const hlsPlayResult = await page.evaluate(() => {
          return new Promise((resolve) => {
            const video = document.querySelector('video');
            if (!video) {
              resolve({ error: 'No video element found' });
              return;
            }
            
            const events = [];
            const eventTypes = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'play', 'playing', 'error', 'stalled', 'waiting'];
            
            const timeout = setTimeout(() => {
              resolve({ 
                events,
                finalState: {
                  readyState: video.readyState,
                  networkState: video.networkState,
                  videoWidth: video.videoWidth,
                  videoHeight: video.videoHeight,
                  duration: video.duration,
                  error: video.error ? { code: video.error.code, message: video.error.message } : null
                }
              });
            }, 5000);
            
            eventTypes.forEach(eventType => {
              video.addEventListener(eventType, (e) => {
                events.push({
                  type: eventType,
                  timestamp: Date.now(),
                  readyState: video.readyState,
                  videoWidth: video.videoWidth,
                  videoHeight: video.videoHeight
                });
                
                if (eventType === 'canplaythrough' || eventType === 'error') {
                  clearTimeout(timeout);
                  resolve({ 
                    events,
                    finalState: {
                      readyState: video.readyState,
                      networkState: video.networkState,
                      videoWidth: video.videoWidth,
                      videoHeight: video.videoHeight,
                      duration: video.duration,
                      error: video.error ? { code: video.error.code, message: video.error.message } : null
                    }
                  });
                }
              });
            });
            
            // Attempt to play
            video.play().catch(error => {
              events.push({ type: 'play_promise_rejected', error: error.message, timestamp: Date.now() });
            });
          });
        });
        console.log('HLS Video Play Result:', JSON.stringify(hlsPlayResult, null, 2));
        
        // Wait a bit for video to load/play
        await page.waitForTimeout(3000);
        await page.screenshot({ path: './test-results/05-video-player-hls-playing.png', fullPage: true });
        
        // Step 6b: Test transcoded format by changing URL
        console.log('\n--- Testing Transcoded Format ---');
        
        // Close current dialog and test transcoded version
        const closeButton = page.locator('[data-testid="stream-player-dialog"] button[aria-label="close"], [data-testid="stream-player-dialog"] .MuiDialogTitle-root button');
        if (await closeButton.count() > 0) {
          await closeButton.click();
          await page.waitForTimeout(1000);
        }
        
        // Navigate to transcoded stream URL directly to test browser compatibility
        console.log('Testing transcoded stream URL directly in browser...');
        const transcodedUrl = `http://localhost:8080/streams/preview/${testStreamId}?transcode=true`;
        await page.goto(transcodedUrl);
        await page.waitForTimeout(3000);
        await page.screenshot({ path: './test-results/06-transcoded-stream-direct.png', fullPage: true });
        
        // Analyze what the browser received
        const pageContent = await page.content();
        const responseInfo = await page.evaluate(() => {
          return {
            title: document.title,
            contentType: document.contentType,
            readyState: document.readyState,
            hasVideo: document.querySelector('video') !== null,
            bodyText: document.body.textContent?.substring(0, 500)
          };
        });
        console.log('Transcoded stream direct response:', responseInfo);
        
        // Go back to main app to test HLS URL directly
        console.log('Testing HLS stream URL directly in browser...');
        const hlsUrl = `http://localhost:8080/streams/preview/${testStreamId}`;
        await page.goto(hlsUrl);
        await page.waitForTimeout(3000);
        await page.screenshot({ path: './test-results/07-hls-stream-direct.png', fullPage: true });
        
        // Analyze what the browser received for HLS
        const hlsPageContent = await page.content();
        const hlsResponseInfo = await page.evaluate(() => {
          return {
            title: document.title,
            contentType: document.contentType,
            readyState: document.readyState,
            hasVideo: document.querySelector('video') !== null,
            bodyText: document.body.textContent?.substring(0, 500)
          };
        });
        console.log('HLS stream direct response:', hlsResponseInfo);
      }
    } else {
      console.log('\nNo streams available for testing. Creating a test stream...');
      
      // Step 5: Create a test stream for testing
      await page.click('[data-testid="add-stream-button"]');
      await page.waitForSelector('[data-testid="stream-dialog"]');
      
      // Fill in test stream data
      await page.fill('[data-testid="stream-name-input"]', 'Test Video Stream');
      await page.fill('[data-testid="stream-url-input"]', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
      
      // Save the stream
      await page.click('[data-testid="save-stream-button"]');
      await page.waitForLoadState('networkidle');
      
      console.log('Test stream created. Re-running tests...');
      
      // Find the newly created stream and get its ID
      const streamRows = await page.locator('table tbody tr').count();
      if (streamRows > 0) {
        const previewButton = page.locator('[data-testid="preview-stream-button"]').first();
        if (await previewButton.count() > 0) {
          await previewButton.click();
          await page.waitForSelector('[data-testid="stream-player-dialog"]');
          await page.screenshot({ path: './test-results/08-test-stream-player.png', fullPage: true });
          
          // Test the created stream
          const testVideoProperties = await page.evaluate(() => {
            const video = document.querySelector('video');
            if (!video) return { error: 'No video element found' };
            
            return {
              src: video.src,
              currentSrc: video.currentSrc,
              readyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              duration: video.duration,
              error: video.error ? {
                code: video.error.code,
                message: video.error.message
              } : null
            };
          });
          console.log('Test stream video properties:', testVideoProperties);
        }
      }
    }

    // Step 7: Test Plex-specific endpoints for format differences
    console.log('\nStep 7: Testing Plex-specific stream endpoints...');
    
    // Get channels for testing Plex endpoints
    const channelsResponse = await page.evaluate(async () => {
      const response = await fetch('/api/channels');
      return {
        status: response.status,
        data: await response.json()
      };
    });
    console.log('Channels response:', channelsResponse);
    
    // If we have channels, test the Plex stream endpoint
    if (channelsResponse.data && channelsResponse.data.length > 0) {
      const testChannelId = channelsResponse.data[0].id;
      console.log(`Testing Plex stream endpoint for channel: ${testChannelId}`);
      
      const plexStreamResponse = await page.evaluate(async (channelId) => {
        try {
          const response = await fetch(`/stream/${channelId}`);
          return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            redirected: response.redirected,
            url: response.url
          };
        } catch (error) {
          return { error: error.message };
        }
      }, testChannelId);
      console.log('Plex stream endpoint response:', plexStreamResponse);
    }

    // Step 8: Comprehensive analysis and recommendations
    console.log('\n=== COMPREHENSIVE ANALYSIS COMPLETE ===\n');
    
    // Final screenshot of the application state
    await page.goto('http://localhost:8080');
    await page.screenshot({ path: './test-results/09-final-application-state.png', fullPage: true });

    console.log('Video player format testing completed. Check test-results/ directory for screenshots and analysis.');
  });

  test('Browser Codec Support Analysis', async () => {
    console.log('\n=== BROWSER CODEC SUPPORT ANALYSIS ===\n');

    await page.goto('http://localhost:8080');

    // Test browser codec support
    const codecSupport = await page.evaluate(() => {
      const video = document.createElement('video');
      
      const codecs = [
        { name: 'H.264 Baseline', type: 'video/mp4; codecs="avc1.42E01E"' },
        { name: 'H.264 Main', type: 'video/mp4; codecs="avc1.4D4015"' },
        { name: 'H.264 High', type: 'video/mp4; codecs="avc1.64001E"' },
        { name: 'H.265/HEVC', type: 'video/mp4; codecs="hvc1.1.6.L93.B0"' },
        { name: 'VP8', type: 'video/webm; codecs="vp8"' },
        { name: 'VP9', type: 'video/webm; codecs="vp9"' },
        { name: 'AAC Audio', type: 'audio/mp4; codecs="mp4a.40.2"' },
        { name: 'MP3 Audio', type: 'audio/mpeg' },
        { name: 'HLS', type: 'application/vnd.apple.mpegurl' },
        { name: 'DASH', type: 'application/dash+xml' }
      ];

      return codecs.map(codec => ({
        name: codec.name,
        type: codec.type,
        support: video.canPlayType(codec.type)
      }));
    });

    console.log('Browser Codec Support:', JSON.stringify(codecSupport, null, 2));

    // Test Media Source Extensions support
    const mseSupport = await page.evaluate(() => {
      return {
        mediaSource: typeof window.MediaSource !== 'undefined',
        isTypeSupported: typeof window.MediaSource !== 'undefined' && typeof window.MediaSource.isTypeSupported === 'function',
        supported_codecs: typeof window.MediaSource !== 'undefined' ? [
          'video/mp4; codecs="avc1.42E01E"',
          'video/webm; codecs="vp8"',
          'audio/mp4; codecs="mp4a.40.2"'
        ].map(codec => ({
          codec,
          supported: window.MediaSource.isTypeSupported(codec)
        })) : []
      };
    });

    console.log('Media Source Extensions Support:', JSON.stringify(mseSupport, null, 2));
  });
});