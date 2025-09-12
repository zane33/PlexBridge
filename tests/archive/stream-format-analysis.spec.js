const { test, expect } = require('@playwright/test');

test.describe('Stream Format Analysis', () => {
  test.beforeEach(async ({ page }) => {
    // Enable console logging for debugging
    page.on('console', (msg) => {
      console.log(`[BROWSER ${msg.type()}]:`, msg.text());
    });

    // Monitor network failures
    page.on('requestfailed', (request) => {
      console.log(`[NETWORK FAIL]: ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Monitor JavaScript errors
    page.on('pageerror', (error) => {
      console.log(`[JS ERROR]:`, error.message);
    });
  });

  test('Analyze existing streams and test formats', async ({ page }) => {
    console.log('\n=== STREAM FORMAT ANALYSIS ===\n');

    // Navigate to application
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: './test-results/streams-01-homepage.png', fullPage: true });

    // Navigate to Stream Manager using the first nav-streams element
    await page.locator('[data-testid="nav-streams"]').first().click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: './test-results/streams-02-stream-manager.png', fullPage: true });

    // Check API endpoints first
    console.log('Testing API endpoints...');
    
    const apiTests = await page.evaluate(async () => {
      const results = {};
      
      try {
        // Test streams API
        const streamsResponse = await fetch('/api/streams');
        results.streams = {
          status: streamsResponse.status,
          data: await streamsResponse.json(),
          headers: Object.fromEntries(streamsResponse.headers.entries())
        };
      } catch (error) {
        results.streams = { error: error.message };
      }
      
      try {
        // Test channels API
        const channelsResponse = await fetch('/api/channels');
        results.channels = {
          status: channelsResponse.status,
          data: await channelsResponse.json(),
          headers: Object.fromEntries(channelsResponse.headers.entries())
        };
      } catch (error) {
        results.channels = { error: error.message };
      }
      
      try {
        // Test Plex discover endpoint
        const discoverResponse = await fetch('/discover.json');
        results.discover = {
          status: discoverResponse.status,
          data: await discoverResponse.json(),
          headers: Object.fromEntries(discoverResponse.headers.entries())
        };
      } catch (error) {
        results.discover = { error: error.message };
      }
      
      try {
        // Test Plex lineup endpoint
        const lineupResponse = await fetch('/lineup.json');
        results.lineup = {
          status: lineupResponse.status,
          data: await lineupResponse.json(),
          headers: Object.fromEntries(lineupResponse.headers.entries())
        };
      } catch (error) {
        results.lineup = { error: error.message };
      }
      
      return results;
    });
    
    console.log('API Test Results:');
    console.log('- Streams API:', JSON.stringify(apiTests.streams, null, 2));
    console.log('- Channels API:', JSON.stringify(apiTests.channels, null, 2));
    console.log('- Discover API:', JSON.stringify(apiTests.discover, null, 2));
    console.log('- Lineup API:', JSON.stringify(apiTests.lineup, null, 2));

    // Check if we have streams to test
    const streamCount = await page.locator('table tbody tr').count();
    console.log(`Found ${streamCount} streams in the database`);

    if (streamCount > 0) {
      console.log('\nTesting existing streams...');
      
      // Get stream information from the table
      const streamInfo = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr');
        const streams = [];
        
        rows.forEach((row, index) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 4) {
            const previewButton = row.querySelector('[data-testid="preview-stream-button"]');
            streams.push({
              index,
              name: cells[0]?.textContent?.trim() || '',
              url: cells[1]?.textContent?.trim() || '',
              type: cells[2]?.textContent?.trim() || '',
              status: cells[3]?.textContent?.trim() || '',
              hasPreviewButton: !!previewButton,
              streamId: previewButton?.getAttribute('data-stream-id') || 
                       previewButton?.getAttribute('onclick')?.match(/['"]([^'"]+)['"]/)?.[1] || 
                       `stream-${index}`
            });
          }
        });
        
        return streams;
      });
      
      console.log('Stream Information:', JSON.stringify(streamInfo, null, 2));
      
      // Test the first stream if available
      if (streamInfo.length > 0) {
        const testStream = streamInfo[0];
        console.log(`\nTesting stream: ${testStream.name} (${testStream.streamId})`);
        
        // Test stream preview endpoints directly
        const streamTests = await page.evaluate(async (streamId) => {
          const results = {};
          
          try {
            // Test HLS format (original)
            const hlsResponse = await fetch(`/streams/preview/${streamId}`);
            results.hls = {
              status: hlsResponse.status,
              url: hlsResponse.url,
              redirected: hlsResponse.redirected,
              headers: Object.fromEntries(hlsResponse.headers.entries())
            };
            
            // Check if response is JSON or binary
            const contentType = hlsResponse.headers.get('content-type');
            if (contentType?.includes('application/json')) {
              results.hls.data = await hlsResponse.json();
            } else {
              results.hls.contentType = contentType;
              results.hls.contentLength = hlsResponse.headers.get('content-length');
            }
          } catch (error) {
            results.hls = { error: error.message };
          }
          
          try {
            // Test transcoded format (MP4)
            const transcodedResponse = await fetch(`/streams/preview/${streamId}?transcode=true`);
            results.transcoded = {
              status: transcodedResponse.status,
              url: transcodedResponse.url,
              redirected: transcodedResponse.redirected,
              headers: Object.fromEntries(transcodedResponse.headers.entries())
            };
            
            // Check if response is JSON or binary
            const contentType = transcodedResponse.headers.get('content-type');
            if (contentType?.includes('application/json')) {
              results.transcoded.data = await transcodedResponse.json();
            } else {
              results.transcoded.contentType = contentType;
              results.transcoded.contentLength = transcodedResponse.headers.get('content-length');
            }
          } catch (error) {
            results.transcoded = { error: error.message };
          }
          
          return results;
        }, testStream.streamId);
        
        console.log('Stream Test Results:');
        console.log('- HLS Format:', JSON.stringify(streamTests.hls, null, 2));
        console.log('- Transcoded Format:', JSON.stringify(streamTests.transcoded, null, 2));
        
        // Test video player functionality
        console.log('\nTesting video player...');
        
        const previewButton = page.locator('[data-testid="preview-stream-button"]').first();
        if (await previewButton.count() > 0) {
          await previewButton.click();
          
          // Wait for video player dialog
          await page.waitForSelector('[data-testid="stream-player-dialog"]', { timeout: 10000 });
          await page.screenshot({ path: './test-results/streams-03-video-dialog.png', fullPage: true });
          
          // Wait for video element
          await page.waitForSelector('video', { timeout: 10000 });
          
          // Analyze video element properties
          const videoAnalysis = await page.evaluate(() => {
            const video = document.querySelector('video');
            if (!video) return { error: 'No video element found' };
            
            return {
              initialState: {
                src: video.src,
                currentSrc: video.currentSrc,
                readyState: video.readyState,
                readyStateText: ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][video.readyState],
                networkState: video.networkState,
                networkStateText: ['NETWORK_EMPTY', 'NETWORK_IDLE', 'NETWORK_LOADING', 'NETWORK_NO_SOURCE'][video.networkState],
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                duration: video.duration,
                paused: video.paused,
                error: video.error ? { code: video.error.code, message: video.error.message } : null
              }
            };
          });
          
          console.log('Initial Video Analysis:', JSON.stringify(videoAnalysis, null, 2));
          
          // Wait for video to load and capture events
          const playbackTest = await page.evaluate(() => {
            return new Promise((resolve) => {
              const video = document.querySelector('video');
              if (!video) {
                resolve({ error: 'No video element found' });
                return;
              }
              
              const events = [];
              const timeout = setTimeout(() => {
                resolve({ 
                  events,
                  finalState: {
                    readyState: video.readyState,
                    networkState: video.networkState,
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                    duration: video.duration,
                    error: video.error ? { code: video.error.code, message: video.error.message } : null,
                    paused: video.paused,
                    currentTime: video.currentTime
                  }
                });
              }, 8000);
              
              const eventTypes = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'play', 'playing', 'error', 'stalled', 'waiting', 'timeupdate'];
              
              eventTypes.forEach(eventType => {
                video.addEventListener(eventType, (e) => {
                  events.push({
                    type: eventType,
                    timestamp: Date.now(),
                    readyState: video.readyState,
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                    duration: video.duration,
                    currentTime: video.currentTime,
                    error: video.error ? { code: video.error.code, message: video.error.message } : null
                  });
                  
                  // Resolve early on critical events
                  if (eventType === 'error' || eventType === 'canplaythrough') {
                    clearTimeout(timeout);
                    resolve({ 
                      events,
                      finalState: {
                        readyState: video.readyState,
                        networkState: video.networkState,
                        videoWidth: video.videoWidth,
                        videoHeight: video.videoHeight,
                        duration: video.duration,
                        error: video.error ? { code: video.error.code, message: video.error.message } : null,
                        paused: video.paused,
                        currentTime: video.currentTime
                      }
                    });
                  }
                });
              });
              
              // Try to play the video
              video.play().catch(error => {
                events.push({ type: 'play_promise_rejected', error: error.message, timestamp: Date.now() });
              });
            });
          });
          
          console.log('Playback Test Results:', JSON.stringify(playbackTest, null, 2));
          
          // Take final screenshot of video player
          await page.screenshot({ path: './test-results/streams-04-video-playing.png', fullPage: true });
          
          // Test switching to transcoded format
          console.log('\nTesting format switching...');
          
          // Check if there's a format switch option in the UI
          const formatSwitchTest = await page.evaluate(async (streamId) => {
            const video = document.querySelector('video');
            if (!video) return { error: 'No video element' };
            
            // Store original src
            const originalSrc = video.src;
            
            // Try changing to transcoded format
            const transcodedUrl = `/streams/preview/${streamId}?transcode=true`;
            video.src = transcodedUrl;
            
            // Wait a bit for the change
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            return {
              originalSrc,
              newSrc: video.src,
              currentSrc: video.currentSrc,
              readyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              error: video.error ? { code: video.error.code, message: video.error.message } : null
            };
          }, testStream.streamId);
          
          console.log('Format Switch Test:', JSON.stringify(formatSwitchTest, null, 2));
          
          await page.screenshot({ path: './test-results/streams-05-transcoded-format.png', fullPage: true });
        }
      }
    } else {
      console.log('\nNo streams found. Creating a test stream...');
      
      // Create a test stream for analysis
      await page.click('[data-testid="add-stream-button"]');
      await page.waitForSelector('[data-testid="stream-dialog"]');
      
      // Fill in test stream data
      await page.fill('[data-testid="stream-name-input"]', 'Test Video Analysis');
      await page.fill('[data-testid="stream-url-input"]', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
      
      await page.screenshot({ path: './test-results/streams-06-create-test-stream.png', fullPage: true });
      
      // Save the stream
      await page.click('[data-testid="save-stream-button"]');
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ path: './test-results/streams-07-test-stream-created.png', fullPage: true });
      
      // Now test the created stream
      const previewButton = page.locator('[data-testid="preview-stream-button"]').first();
      if (await previewButton.count() > 0) {
        await previewButton.click();
        await page.waitForSelector('[data-testid="stream-player-dialog"]');
        await page.screenshot({ path: './test-results/streams-08-test-video-dialog.png', fullPage: true });
        
        // Analyze the test video
        const testVideoAnalysis = await page.evaluate(() => {
          const video = document.querySelector('video');
          if (!video) return { error: 'No video element found' };
          
          return {
            src: video.src,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            duration: video.duration,
            readyState: video.readyState,
            error: video.error ? { code: video.error.code, message: video.error.message } : null
          };
        });
        
        console.log('Test Video Analysis:', JSON.stringify(testVideoAnalysis, null, 2));
      }
    }

    console.log('\n=== STREAM FORMAT ANALYSIS COMPLETE ===');
  });

  test('Direct URL testing in browser', async ({ page }) => {
    console.log('\n=== DIRECT URL TESTING ===\n');

    // Test API endpoints that should return JSON
    const apiUrls = [
      '/health',
      '/api/streams',
      '/api/channels',
      '/discover.json',
      '/lineup.json'
    ];

    for (const url of apiUrls) {
      console.log(`Testing ${url}...`);
      await page.goto(`http://localhost:8080${url}`);
      await page.screenshot({ path: `./test-results/api-${url.replace(/[\/\.]/g, '-')}.png`, fullPage: true });
      
      const pageAnalysis = await page.evaluate(() => {
        return {
          title: document.title,
          contentType: document.contentType,
          bodyText: document.body.textContent?.substring(0, 500),
          hasJsonFormat: document.body.textContent?.trim().startsWith('{') || document.body.textContent?.trim().startsWith('[')
        };
      });
      
      console.log(`${url} analysis:`, pageAnalysis);
    }

    console.log('\n=== DIRECT URL TESTING COMPLETE ===');
  });
});