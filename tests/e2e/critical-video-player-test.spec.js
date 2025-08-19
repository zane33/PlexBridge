const { test, expect } = require('@playwright/test');

/**
 * CRITICAL VIDEO PLAYER TESTING
 * Testing the exact URIs provided by the user:
 * 1. Direct URI: http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts
 * 2. Proxy URI: http://localhost:8081/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112
 */

test.describe('Critical Video Player URI Testing', () => {
  test.beforeEach(async ({ page }) => {
    // Enable verbose console logging
    page.on('console', msg => console.log(`🖥️  CONSOLE [${msg.type()}]: ${msg.text()}`));
    page.on('pageerror', err => console.log(`❌ PAGE ERROR: ${err.message}`));
    page.on('requestfailed', req => console.log(`❌ REQUEST FAILED: ${req.url()} - ${req.failure()?.errorText}`));
  });

  test('Test Direct URI in Basic HTML Video Element', async ({ page }) => {
    console.log('🎯 Testing Direct URI: http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts');
    
    // Create a simple HTML page with video element to test direct URI
    const testHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Direct URI Video Test</title>
    <style>
        body { margin: 20px; font-family: Arial, sans-serif; }
        video { width: 640px; height: 360px; border: 2px solid #ccc; }
        .info { margin: 10px 0; padding: 10px; background: #f0f0f0; }
        .error { color: red; }
        .success { color: green; }
    </style>
</head>
<body>
    <h1>Direct URI Video Player Test</h1>
    <div class="info">
        <strong>Testing URI:</strong> http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts
    </div>
    <video id="directVideo" controls preload="metadata">
        <source src="http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts" type="video/mp2t">
        Your browser does not support the video tag.
    </video>
    <div id="status" class="info">Loading video...</div>
    <div id="errors"></div>
    
    <script>
        const video = document.getElementById('directVideo');
        const status = document.getElementById('status');
        const errors = document.getElementById('errors');
        
        // Log all video events
        const events = ['loadstart', 'durationchange', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing', 'error', 'stalled', 'waiting'];
        events.forEach(event => {
            video.addEventListener(event, (e) => {
                console.log('Video event:', event, e);
                status.innerHTML = 'Event: ' + event;
            });
        });
        
        video.addEventListener('error', (e) => {
            const error = video.error;
            const errorMsg = 'Video Error: ' + (error ? error.message + ' (Code: ' + error.code + ')' : 'Unknown error');
            console.error(errorMsg);
            errors.innerHTML = '<div class="error">' + errorMsg + '</div>';
        });
        
        video.addEventListener('canplay', () => {
            status.innerHTML = '<div class="success">✅ Video can play! Duration: ' + video.duration + 's</div>';
        });
        
        // Try to load the video
        video.load();
    </script>
</body>
</html>`;

    // Set content and wait for page to load
    await page.setContent(testHTML);
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ 
      path: 'test-screenshots/critical-01-direct-uri-initial.png',
      fullPage: true 
    });
    
    // Wait for video events and check status
    await page.waitForTimeout(5000); // Wait 5 seconds for video to attempt loading
    
    // Take screenshot after loading attempt
    await page.screenshot({ 
      path: 'test-screenshots/critical-02-direct-uri-after-5s.png',
      fullPage: true 
    });
    
    // Check video element properties
    const videoProperties = await page.evaluate(() => {
      const video = document.getElementById('directVideo');
      return {
        networkState: video.networkState,
        readyState: video.readyState,
        error: video.error ? {
          code: video.error.code,
          message: video.error.message
        } : null,
        currentSrc: video.currentSrc,
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight
      };
    });
    
    console.log('📊 Direct URI Video Properties:', JSON.stringify(videoProperties, null, 2));
    
    // Check status and error messages
    const statusText = await page.locator('#status').textContent();
    const errorText = await page.locator('#errors').textContent();
    
    console.log('📊 Status:', statusText);
    console.log('❌ Errors:', errorText);
  });

  test('Test Proxy URI via PlexBridge', async ({ page }) => {
    console.log('🎯 Testing Proxy URI: http://localhost:8081/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112');
    
    // First check if test server is running
    try {
      await page.goto('http://localhost:8081/health');
      const healthResponse = await page.textContent('body');
      console.log('🏥 Health Check:', healthResponse);
    } catch (error) {
      console.error('❌ Test server not accessible:', error.message);
      return;
    }
    
    // Create HTML page to test proxy URI
    const testHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Proxy URI Video Test</title>
    <style>
        body { margin: 20px; font-family: Arial, sans-serif; }
        video { width: 640px; height: 360px; border: 2px solid #ccc; }
        .info { margin: 10px 0; padding: 10px; background: #f0f0f0; }
        .error { color: red; }
        .success { color: green; }
    </style>
</head>
<body>
    <h1>Proxy URI Video Player Test</h1>
    <div class="info">
        <strong>Testing URI:</strong> http://localhost:8081/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112
    </div>
    <video id="proxyVideo" controls preload="metadata">
        <source src="http://localhost:8081/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112" type="video/mp2t">
        Your browser does not support the video tag.
    </video>
    <div id="status" class="info">Loading video...</div>
    <div id="errors"></div>
    <div id="network"></div>
    
    <script>
        const video = document.getElementById('proxyVideo');
        const status = document.getElementById('status');
        const errors = document.getElementById('errors');
        const network = document.getElementById('network');
        
        // Test proxy endpoint first
        fetch('http://localhost:8081/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112', { method: 'HEAD' })
            .then(response => {
                network.innerHTML = '<div class="success">✅ Proxy endpoint accessible. Status: ' + response.status + '</div>';
                console.log('Proxy endpoint headers:', [...response.headers.entries()]);
            })
            .catch(error => {
                network.innerHTML = '<div class="error">❌ Proxy endpoint error: ' + error.message + '</div>';
            });
        
        // Log all video events
        const events = ['loadstart', 'durationchange', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing', 'error', 'stalled', 'waiting'];
        events.forEach(event => {
            video.addEventListener(event, (e) => {
                console.log('Video event:', event, e);
                status.innerHTML = 'Event: ' + event;
            });
        });
        
        video.addEventListener('error', (e) => {
            const error = video.error;
            const errorMsg = 'Video Error: ' + (error ? error.message + ' (Code: ' + error.code + ')' : 'Unknown error');
            console.error(errorMsg);
            errors.innerHTML = '<div class="error">' + errorMsg + '</div>';
        });
        
        video.addEventListener('canplay', () => {
            status.innerHTML = '<div class="success">✅ Video can play! Duration: ' + video.duration + 's</div>';
        });
        
        // Try to load the video
        video.load();
    </script>
</body>
</html>`;

    // Set content and wait for page to load
    await page.setContent(testHTML);
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ 
      path: 'test-screenshots/critical-03-proxy-uri-initial.png',
      fullPage: true 
    });
    
    // Wait for video events and check status
    await page.waitForTimeout(10000); // Wait 10 seconds for video to attempt loading via proxy
    
    // Take screenshot after loading attempt
    await page.screenshot({ 
      path: 'test-screenshots/critical-04-proxy-uri-after-10s.png',
      fullPage: true 
    });
    
    // Check video element properties
    const videoProperties = await page.evaluate(() => {
      const video = document.getElementById('proxyVideo');
      return {
        networkState: video.networkState,
        readyState: video.readyState,
        error: video.error ? {
          code: video.error.code,
          message: video.error.message
        } : null,
        currentSrc: video.currentSrc,
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight
      };
    });
    
    console.log('📊 Proxy URI Video Properties:', JSON.stringify(videoProperties, null, 2));
    
    // Check status and error messages
    const statusText = await page.locator('#status').textContent();
    const errorText = await page.locator('#errors').textContent();
    const networkText = await page.locator('#network').textContent();
    
    console.log('📊 Status:', statusText);
    console.log('❌ Errors:', errorText);
    console.log('🌐 Network:', networkText);
  });

  test('Test PlexBridge Video Player Components', async ({ page }) => {
    console.log('🎯 Testing PlexBridge Video Player Components');
    
    // Navigate to the PlexBridge application
    await page.goto('http://localhost:8081');
    
    // Take screenshot of homepage
    await page.screenshot({ 
      path: 'test-screenshots/critical-05-plexbridge-homepage.png',
      fullPage: true 
    });
    
    // Check if Streams page is accessible
    try {
      // Look for navigation elements
      await page.waitForSelector('body', { timeout: 5000 });
      
      // Take screenshot of loaded page
      await page.screenshot({ 
        path: 'test-screenshots/critical-06-plexbridge-loaded.png',
        fullPage: true 
      });
      
      console.log('✅ PlexBridge application loaded successfully');
      
      // Check if we can find stream-related components
      const pageContent = await page.content();
      console.log('📄 Page contains video/stream elements:', 
        pageContent.includes('video') || 
        pageContent.includes('stream') || 
        pageContent.includes('player')
      );
      
    } catch (error) {
      console.error('❌ Error accessing PlexBridge application:', error.message);
      
      // Take error screenshot
      await page.screenshot({ 
        path: 'test-screenshots/critical-07-plexbridge-error.png',
        fullPage: true 
      });
    }
  });

  test('Network and CORS Analysis', async ({ page }) => {
    console.log('🌐 Analyzing Network Requests and CORS for Video URIs');
    
    const requests = [];
    const responses = [];
    
    // Monitor network requests
    page.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      });
    });
    
    page.on('response', response => {
      responses.push({
        url: response.url(),
        status: response.status(),
        headers: response.headers()
      });
    });
    
    // Test direct URI network request
    console.log('📡 Testing direct URI network request...');
    
    try {
      const directResponse = await page.request.get('http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts', {
        timeout: 10000
      });
      
      console.log('📊 Direct URI Response Status:', directResponse.status());
      console.log('📊 Direct URI Headers:', await directResponse.headers());
      
    } catch (error) {
      console.error('❌ Direct URI Request Failed:', error.message);
    }
    
    // Test proxy URI network request
    console.log('📡 Testing proxy URI network request...');
    
    try {
      const proxyResponse = await page.request.get('http://localhost:8081/streams/preview/d81b0171-d3a8-4bb3-b8d7-3e45d86c6112', {
        timeout: 10000
      });
      
      console.log('📊 Proxy URI Response Status:', proxyResponse.status());
      console.log('📊 Proxy URI Headers:', await proxyResponse.headers());
      
    } catch (error) {
      console.error('❌ Proxy URI Request Failed:', error.message);
    }
    
    // Create summary page
    const summaryHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Network Analysis Summary</title>
    <style>
        body { margin: 20px; font-family: Arial, sans-serif; }
        .result { margin: 10px 0; padding: 10px; background: #f0f0f0; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <h1>Network Analysis Summary</h1>
    <div id="results">
        <div class="result">Network analysis completed. Check console for detailed results.</div>
    </div>
</body>
</html>`;
    
    await page.setContent(summaryHTML);
    await page.screenshot({ 
      path: 'test-screenshots/critical-08-network-analysis.png',
      fullPage: true 
    });
  });
});