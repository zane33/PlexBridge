const { test, expect } = require('@playwright/test');

/**
 * CRITICAL VIDEO PLAYER DIAGNOSIS AND TESTING
 * Focus on testing enhanced video player components and exact URIs
 */

test.describe('Enhanced Video Player Diagnosis', () => {
  test.beforeEach(async ({ page }) => {
    // Enable verbose console logging
    page.on('console', msg => console.log(`🖥️  CONSOLE [${msg.type()}]: ${msg.text()}`));
    page.on('pageerror', err => console.log(`❌ PAGE ERROR: ${err.message}`));
    page.on('requestfailed', req => console.log(`❌ REQUEST FAILED: ${req.url()} - ${req.failure()?.errorText}`));
  });

  test('Test Enhanced Video Player with HLS.js and Video.js Support', async ({ page }) => {
    console.log('🎯 Testing Enhanced Video Player Components');
    
    // Create an enhanced HTML page with multiple video player libraries
    const enhancedPlayerHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Enhanced Video Player Test</title>
    <meta charset="utf-8">
    <style>
        body { margin: 20px; font-family: Arial, sans-serif; background: #f5f5f5; }
        .player-container { margin: 20px 0; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        video { width: 100%; max-width: 640px; height: 360px; border: 2px solid #ccc; border-radius: 4px; }
        .info { margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 4px; }
        .error { color: red; background: #fee; border: 1px solid #fcc; }
        .success { color: green; background: #efe; border: 1px solid #cfc; }
        .warning { color: orange; background: #ffc; border: 1px solid #fc6; }
        .status { font-weight: bold; margin: 5px 0; }
        .test-section { border: 2px solid #ddd; margin: 20px 0; padding: 15px; border-radius: 8px; }
        .button { padding: 8px 16px; margin: 5px; background: #007cba; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .button:hover { background: #005a87; }
    </style>
    <!-- HLS.js Library -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <!-- Video.js Library -->
    <link href="https://vjs.zencdn.net/8.6.1/video-js.css" rel="stylesheet">
    <script src="https://vjs.zencdn.net/8.6.1/video.min.js"></script>
</head>
<body>
    <h1>Enhanced Video Player Testing</h1>
    
    <!-- Test 1: Native HTML5 Video with Direct URI -->
    <div class="test-section">
        <h2>Test 1: Native HTML5 Video Player (Direct URI)</h2>
        <div class="info">
            <strong>Testing URI:</strong> http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts
        </div>
        <video id="nativeVideo" controls preload="metadata">
            <source src="http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts" type="video/mp2t">
            Your browser does not support the video tag.
        </video>
        <div id="nativeStatus" class="status">Loading...</div>
        <div id="nativeErrors"></div>
    </div>

    <!-- Test 2: Native HTML5 Video with Proxy URI -->
    <div class="test-section">
        <h2>Test 2: Native HTML5 Video Player (Proxy URI)</h2>
        <div class="info">
            <strong>Testing URI:</strong> http://localhost:8081/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112
        </div>
        <video id="proxyVideo" controls preload="metadata">
            <source src="http://localhost:8081/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112" type="video/mp2t">
            Your browser does not support the video tag.
        </video>
        <div id="proxyStatus" class="status">Loading...</div>
        <div id="proxyErrors"></div>
    </div>

    <!-- Test 3: HLS.js Player with Direct URI -->
    <div class="test-section">
        <h2>Test 3: HLS.js Player (Direct URI)</h2>
        <div class="info">
            <strong>Testing URI:</strong> http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts
        </div>
        <video id="hlsVideo" controls width="640" height="360"></video>
        <div id="hlsStatus" class="status">Loading...</div>
        <div id="hlsErrors"></div>
        <button class="button" onclick="loadHLSStream()">Load with HLS.js</button>
    </div>

    <!-- Test 4: Video.js Player with Direct URI -->
    <div class="test-section">
        <h2>Test 4: Video.js Player (Direct URI)</h2>
        <div class="info">
            <strong>Testing URI:</strong> http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts
        </div>
        <video
            id="videojsPlayer"
            class="video-js vjs-default-skin"
            controls
            preload="auto"
            width="640"
            height="360"
            data-setup="{}">
        </video>
        <div id="videojsStatus" class="status">Loading...</div>
        <div id="videojsErrors"></div>
        <button class="button" onclick="loadVideoJSStream()">Load with Video.js</button>
    </div>

    <!-- Test 5: Manual Format Detection -->
    <div class="test-section">
        <h2>Test 5: Format Detection and Analysis</h2>
        <div id="formatAnalysis" class="info">Analyzing stream formats...</div>
        <button class="button" onclick="analyzeFormats()">Analyze Stream Formats</button>
    </div>

    <script>
        // Global variables
        let hlsPlayer = null;
        let videojsPlayer = null;
        const directURI = 'http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts';
        const proxyURI = 'http://localhost:8081/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112';

        // Utility function to log video events
        function setupVideoEventListeners(video, statusElement, errorElement) {
            const events = ['loadstart', 'durationchange', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing', 'error', 'stalled', 'waiting', 'ended'];
            
            events.forEach(event => {
                video.addEventListener(event, (e) => {
                    console.log(\`Video event (\${video.id}): \${event}\`, e);
                    statusElement.innerHTML = \`Event: \${event}\`;
                    statusElement.className = 'status success';
                });
            });
            
            video.addEventListener('error', (e) => {
                const error = video.error;
                const errorMsg = \`Video Error: \${error ? error.message + ' (Code: ' + error.code + ')' : 'Unknown error'}\`;
                console.error(\`\${video.id} error:\`, errorMsg);
                errorElement.innerHTML = \`<div class="error">\${errorMsg}</div>\`;
                statusElement.innerHTML = 'Error occurred';
                statusElement.className = 'status error';
            });
            
            video.addEventListener('canplay', () => {
                statusElement.innerHTML = \`✅ Video can play! Duration: \${video.duration}s\`;
                statusElement.className = 'status success';
            });
        }

        // Test 1: Native Video Setup
        const nativeVideo = document.getElementById('nativeVideo');
        const nativeStatus = document.getElementById('nativeStatus');
        const nativeErrors = document.getElementById('nativeErrors');
        setupVideoEventListeners(nativeVideo, nativeStatus, nativeErrors);

        // Test 2: Proxy Video Setup
        const proxyVideo = document.getElementById('proxyVideo');
        const proxyStatus = document.getElementById('proxyStatus');
        const proxyErrors = document.getElementById('proxyErrors');
        setupVideoEventListeners(proxyVideo, proxyStatus, proxyErrors);

        // Test 3: HLS.js Setup
        function loadHLSStream() {
            const hlsVideo = document.getElementById('hlsVideo');
            const hlsStatus = document.getElementById('hlsStatus');
            const hlsErrors = document.getElementById('hlsErrors');
            
            if (Hls.isSupported()) {
                hlsStatus.innerHTML = 'HLS.js is supported, attempting to load stream...';
                hlsStatus.className = 'status warning';
                
                if (hlsPlayer) {
                    hlsPlayer.destroy();
                }
                
                hlsPlayer = new Hls();
                hlsPlayer.loadSource(directURI);
                hlsPlayer.attachMedia(hlsVideo);
                
                hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
                    hlsStatus.innerHTML = '✅ HLS.js: Manifest parsed successfully';
                    hlsStatus.className = 'status success';
                    console.log('HLS.js: Manifest parsed');
                });
                
                hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
                    console.error('HLS.js error:', data);
                    hlsErrors.innerHTML = \`<div class="error">HLS.js Error: \${data.type} - \${data.details}</div>\`;
                    hlsStatus.innerHTML = 'HLS.js Error occurred';
                    hlsStatus.className = 'status error';
                });
                
                setupVideoEventListeners(hlsVideo, hlsStatus, hlsErrors);
            } else if (hlsVideo.canPlayType('application/vnd.apple.mpegurl')) {
                hlsStatus.innerHTML = 'Native HLS support detected, loading directly...';
                hlsVideo.src = directURI;
            } else {
                hlsErrors.innerHTML = '<div class="error">HLS is not supported in this browser</div>';
                hlsStatus.innerHTML = 'HLS not supported';
                hlsStatus.className = 'status error';
            }
        }

        // Test 4: Video.js Setup
        function loadVideoJSStream() {
            const videojsStatus = document.getElementById('videojsStatus');
            const videojsErrors = document.getElementById('videojsErrors');
            
            try {
                if (videojsPlayer) {
                    videojsPlayer.dispose();
                }
                
                videojsPlayer = videojs('videojsPlayer', {
                    sources: [{
                        src: directURI,
                        type: 'video/mp2t'
                    }],
                    fluid: false,
                    responsive: false
                });
                
                videojsPlayer.ready(() => {
                    videojsStatus.innerHTML = '✅ Video.js player initialized';
                    videojsStatus.className = 'status success';
                    console.log('Video.js: Player ready');
                });
                
                videojsPlayer.on('error', (e) => {
                    const error = videojsPlayer.error();
                    console.error('Video.js error:', error);
                    videojsErrors.innerHTML = \`<div class="error">Video.js Error: \${error ? error.message + ' (Code: ' + error.code + ')' : 'Unknown error'}</div>\`;
                    videojsStatus.innerHTML = 'Video.js Error occurred';
                    videojsStatus.className = 'status error';
                });
                
            } catch (error) {
                console.error('Video.js initialization error:', error);
                videojsErrors.innerHTML = \`<div class="error">Video.js Initialization Error: \${error.message}</div>\`;
                videojsStatus.innerHTML = 'Video.js Initialization Failed';
                videojsStatus.className = 'status error';
            }
        }

        // Test 5: Format Analysis
        async function analyzeFormats() {
            const formatAnalysis = document.getElementById('formatAnalysis');
            
            formatAnalysis.innerHTML = 'Analyzing stream formats...';
            
            const results = [];
            
            // Test direct URI
            try {
                const response = await fetch(directURI, { method: 'HEAD', mode: 'cors' });
                results.push(\`Direct URI Status: \${response.status}\`);
                results.push(\`Content-Type: \${response.headers.get('content-type')}\`);
                results.push(\`Content-Length: \${response.headers.get('content-length')}\`);
                results.push(\`Accept-Ranges: \${response.headers.get('accept-ranges')}\`);
            } catch (error) {
                results.push(\`Direct URI Error: \${error.message}\`);
            }
            
            // Test proxy URI
            try {
                const response = await fetch(proxyURI, { method: 'HEAD' });
                results.push(\`Proxy URI Status: \${response.status}\`);
                results.push(\`Proxy Content-Type: \${response.headers.get('content-type')}\`);
                results.push(\`Proxy Content-Length: \${response.headers.get('content-length')}\`);
            } catch (error) {
                results.push(\`Proxy URI Error: \${error.message}\`);
            }
            
            // Browser capabilities
            const video = document.createElement('video');
            results.push('--- Browser Support ---');
            results.push(\`MP4: \${video.canPlayType('video/mp4')}\`);
            results.push(\`WebM: \${video.canPlayType('video/webm')}\`);
            results.push(\`HLS: \${video.canPlayType('application/vnd.apple.mpegurl')}\`);
            results.push(\`MP2T: \${video.canPlayType('video/mp2t')}\`);
            results.push(\`HLS.js Supported: \${Hls.isSupported()}\`);
            results.push(\`Video.js Available: \${typeof videojs !== 'undefined'}\`);
            
            formatAnalysis.innerHTML = results.map(r => \`<div>\${r}</div>\`).join('');
        }

        // Auto-start some tests
        window.addEventListener('load', () => {
            console.log('🚀 Enhanced Video Player Testing Started');
            setTimeout(analyzeFormats, 1000);
        });
    </script>
</body>
</html>`;

    // Set content and wait for page to load
    await page.setContent(enhancedPlayerHTML);
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ 
      path: 'test-screenshots/enhanced-01-initial-load.png',
      fullPage: true 
    });
    
    // Wait for format analysis to complete
    await page.waitForTimeout(3000);
    
    // Take screenshot after format analysis
    await page.screenshot({ 
      path: 'test-screenshots/enhanced-02-format-analysis.png',
      fullPage: true 
    });
    
    // Test HLS.js player
    console.log('🎯 Testing HLS.js Player...');
    await page.click('button:has-text("Load with HLS.js")');
    await page.waitForTimeout(5000);
    
    // Take screenshot after HLS.js attempt
    await page.screenshot({ 
      path: 'test-screenshots/enhanced-03-hlsjs-test.png',
      fullPage: true 
    });
    
    // Test Video.js player
    console.log('🎯 Testing Video.js Player...');
    await page.click('button:has-text("Load with Video.js")');
    await page.waitForTimeout(5000);
    
    // Take screenshot after Video.js attempt
    await page.screenshot({ 
      path: 'test-screenshots/enhanced-04-videojs-test.png',
      fullPage: true 
    });
    
    // Get all status information
    const nativeStatus = await page.locator('#nativeStatus').textContent();
    const proxyStatus = await page.locator('#proxyStatus').textContent();
    const hlsStatus = await page.locator('#hlsStatus').textContent();
    const videojsStatus = await page.locator('#videojsStatus').textContent();
    const formatAnalysis = await page.locator('#formatAnalysis').textContent();
    
    console.log('📊 FINAL RESULTS:');
    console.log('Native Player Status:', nativeStatus);
    console.log('Proxy Player Status:', proxyStatus);
    console.log('HLS.js Status:', hlsStatus);
    console.log('Video.js Status:', videojsStatus);
    console.log('Format Analysis:', formatAnalysis);
    
    // Take final screenshot
    await page.screenshot({ 
      path: 'test-screenshots/enhanced-05-final-results.png',
      fullPage: true 
    });
  });
});

module.exports = {};