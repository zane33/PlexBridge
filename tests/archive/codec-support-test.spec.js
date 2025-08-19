const { test, expect } = require('@playwright/test');

test.describe('Browser Codec and HLS Support', () => {
  test('Test browser HLS and codec support', async ({ page }) => {
    console.log('\n=== BROWSER CODEC AND HLS SUPPORT TEST ===\n');

    await page.goto('http://localhost:8080');

    // Test basic codec support
    const codecTest = await page.evaluate(() => {
      const video = document.createElement('video');
      const audio = document.createElement('audio');
      
      const videoCodecs = [
        'video/mp4; codecs="avc1.42E01E"',  // H.264 Baseline
        'video/mp4; codecs="avc1.4D401F"',  // H.264 Main (from HLS stream)
        'video/mp4; codecs="avc1.4D4028"',  // H.264 High (from HLS stream)
        'video/mp4; codecs="mp4a.40.2"',    // AAC Audio
        'application/vnd.apple.mpegurl',     // HLS
        'application/x-mpegURL'              // Alternative HLS MIME
      ];

      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        videoCodecSupport: videoCodecs.map(codec => ({
          codec,
          support: video.canPlayType(codec),
          supportLevel: video.canPlayType(codec) === 'probably' ? 'high' : 
                       video.canPlayType(codec) === 'maybe' ? 'partial' : 'none'
        })),
        hlsSupport: {
          nativeHLS: video.canPlayType('application/vnd.apple.mpegurl'),
          alternateHLS: video.canPlayType('application/x-mpegURL'),
          mediaSource: typeof window.MediaSource !== 'undefined',
          isTypeSupported: typeof window.MediaSource !== 'undefined' && 
                          typeof window.MediaSource.isTypeSupported === 'function'
        }
      };
    });

    console.log('Browser Codec Test Results:', JSON.stringify(codecTest, null, 2));

    // Test HLS.js availability
    const hlsJsTest = await page.evaluate(() => {
      return {
        hlsJsAvailable: typeof window.Hls !== 'undefined',
        hlsJsSupported: typeof window.Hls !== 'undefined' ? window.Hls.isSupported() : false,
        hlsJsVersion: typeof window.Hls !== 'undefined' ? window.Hls.version : null
      };
    });

    console.log('HLS.js Test Results:', JSON.stringify(hlsJsTest, null, 2));

    // Test direct video element with HLS URL
    console.log('\n=== TESTING DIRECT VIDEO ELEMENT WITH HLS ===');
    
    const hlsDirectTest = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.controls = true;
        video.style.width = '400px';
        video.style.height = '300px';
        document.body.appendChild(video);

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
              error: video.error ? { 
                code: video.error.code, 
                message: video.error.message 
              } : null
            }
          });
        }, 10000);

        const eventTypes = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'error', 'stalled'];
        eventTypes.forEach(eventType => {
          video.addEventListener(eventType, (e) => {
            events.push({
              type: eventType,
              timestamp: Date.now(),
              readyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              duration: video.duration
            });

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
                  error: video.error ? { 
                    code: video.error.code, 
                    message: video.error.message 
                  } : null
                }
              });
            }
          });
        });

        // Set HLS stream URL
        video.src = 'http://localhost:8080/streams/preview/bc861379-ed58-44af-b7cd-8c935b981b9b';
        video.load();
      });
    });

    console.log('HLS Direct Video Test:', JSON.stringify(hlsDirectTest, null, 2));

    // Test direct video element with transcoded MP4
    console.log('\n=== TESTING DIRECT VIDEO ELEMENT WITH TRANSCODED MP4 ===');
    
    const mp4DirectTest = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.controls = true;
        video.style.width = '400px';
        video.style.height = '300px';
        document.body.appendChild(video);

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
              error: video.error ? { 
                code: video.error.code, 
                message: video.error.message 
              } : null
            }
          });
        }, 15000); // Longer timeout for transcoding

        const eventTypes = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'error', 'stalled'];
        eventTypes.forEach(eventType => {
          video.addEventListener(eventType, (e) => {
            events.push({
              type: eventType,
              timestamp: Date.now(),
              readyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              duration: video.duration
            });

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
                  error: video.error ? { 
                    code: video.error.code, 
                    message: video.error.message 
                  } : null
                }
              });
            }
          });
        });

        // Set transcoded stream URL
        video.src = 'http://localhost:8080/streams/preview/bc861379-ed58-44af-b7cd-8c935b981b9b?transcode=true';
        video.load();
      });
    });

    console.log('MP4 Direct Video Test:', JSON.stringify(mp4DirectTest, null, 2));

    // Take screenshots
    await page.screenshot({ path: './test-results/codec-test-final.png', fullPage: true });

    // Summary analysis
    console.log('\n=== ANALYSIS SUMMARY ===');
    console.log('1. Native HLS Support:', codecTest.hlsSupport.nativeHLS || 'No native support');
    console.log('2. MediaSource Extensions:', codecTest.hlsSupport.mediaSource ? 'Available' : 'Not available');
    console.log('3. HLS.js Available:', hlsJsTest.hlsJsAvailable ? 'Yes' : 'No');
    console.log('4. HLS Direct Test Video Dimensions:', 
      hlsDirectTest.finalState?.videoWidth && hlsDirectTest.finalState?.videoHeight ? 
      `${hlsDirectTest.finalState.videoWidth}x${hlsDirectTest.finalState.videoHeight}` : 'No video dimensions');
    console.log('5. MP4 Direct Test Video Dimensions:', 
      mp4DirectTest.finalState?.videoWidth && mp4DirectTest.finalState?.videoHeight ? 
      `${mp4DirectTest.finalState.videoWidth}x${mp4DirectTest.finalState.videoHeight}` : 'No video dimensions');
    console.log('6. HLS Direct Test Errors:', hlsDirectTest.finalState?.error?.message || 'None');
    console.log('7. MP4 Direct Test Errors:', mp4DirectTest.finalState?.error?.message || 'None');
  });
});