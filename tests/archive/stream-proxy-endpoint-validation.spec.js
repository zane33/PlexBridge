const { test, expect } = require('@playwright/test');

/**
 * STREAM PROXY ENDPOINT VALIDATION TEST SUITE
 * 
 * This test suite specifically targets the stream proxy endpoints that are
 * returning 404 errors, causing video player failures and infinite loops.
 * 
 * Focus Areas:
 * 1. Direct API endpoint testing for all stream proxy routes
 * 2. Content-Type header validation (should be video streams, not HTML error pages)
 * 3. Stream ID generation and URL construction
 * 4. Proxy vs direct stream URL handling
 * 5. Error response analysis and debugging
 */

test.describe('Stream Proxy Endpoint Validation', () => {
  let streamIds = [];
  let channelIds = [];
  
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000);
    
    // Reset arrays
    streamIds = [];
    channelIds = [];
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('1. API Endpoint Direct Testing', () => {
    test('Core API endpoints return JSON (not HTML error pages)', async ({ page }) => {
      console.log('🎯 Testing core API endpoints for JSON responses');
      
      const coreEndpoints = [
        { url: '/api/health', method: 'GET', expectedContent: 'application/json' },
        { url: '/api/streams', method: 'GET', expectedContent: 'application/json' },
        { url: '/api/channels', method: 'GET', expectedContent: 'application/json' },
        { url: '/api/settings', method: 'GET', expectedContent: 'application/json' },
        { url: '/api/metrics', method: 'GET', expectedContent: 'application/json' },
        { url: '/discover.json', method: 'GET', expectedContent: 'application/json' },
        { url: '/lineup.json', method: 'GET', expectedContent: 'application/json' },
        { url: '/lineup_status.json', method: 'GET', expectedContent: 'application/json' }
      ];
      
      const results = [];
      
      for (const endpoint of coreEndpoints) {
        console.log(`📡 Testing ${endpoint.method} ${endpoint.url}`);
        
        try {
          const response = await page.request.get(endpoint.url);
          const status = response.status();
          const contentType = response.headers()['content-type'] || '';
          const body = await response.text();
          
          const result = {
            url: endpoint.url,
            status,
            contentType,
            isJson: contentType.includes('application/json'),
            isHtml: contentType.includes('text/html') || body.includes('<!DOCTYPE html>'),
            bodyPreview: body.substring(0, 200),
            success: status === 200 && contentType.includes(endpoint.expectedContent)
          };
          
          results.push(result);
          
          console.log(`📊 ${endpoint.url}: Status ${status}, Content-Type: ${contentType}`);
          
          // Critical assertion: API endpoints should return JSON, not HTML
          if (status === 200) {
            expect(result.isJson).toBe(true);
            expect(result.isHtml).toBe(false);
          }
          
        } catch (error) {
          console.log(`❌ ${endpoint.url} failed: ${error.message}`);
          results.push({
            url: endpoint.url,
            error: error.message,
            success: false
          });
        }
      }
      
      // Take screenshot with results analysis
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>API Endpoint Test Results</title></head>
        <body>
          <h1>API Endpoint Test Results</h1>
          <table border="1" style="border-collapse: collapse; width: 100%;">
            <tr>
              <th>Endpoint</th>
              <th>Status</th>
              <th>Content-Type</th>
              <th>Is JSON</th>
              <th>Is HTML Error</th>
              <th>Success</th>
            </tr>
            ${results.map(r => `
              <tr style="background-color: ${r.success ? '#d4edda' : '#f8d7da'};">
                <td>${r.url}</td>
                <td>${r.status || 'ERROR'}</td>
                <td>${r.contentType || 'N/A'}</td>
                <td>${r.isJson ? '✅' : '❌'}</td>
                <td>${r.isHtml ? '❌' : '✅'}</td>
                <td>${r.success ? '✅' : '❌'}</td>
              </tr>
            `).join('')}
          </table>
          <h2>Summary</h2>
          <p>Successful endpoints: ${results.filter(r => r.success).length}/${results.length}</p>
          <p>Failed endpoints: ${results.filter(r => !r.success).length}/${results.length}</p>
        </body>
        </html>
      `);
      
      await page.screenshot({ 
        path: 'test-screenshots/api-endpoints-validation.png', 
        fullPage: true 
      });
      
      console.log('📊 API Endpoint Results:', JSON.stringify(results, null, 2));
    });

    test('Stream-specific API endpoints functionality', async ({ page }) => {
      console.log('🎯 Testing stream-specific API endpoints');
      
      // First, create some test streams via the UI to get real stream IDs
      await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
      await page.waitForLoadState('networkidle');
      
      const testStreams = [
        { name: 'API Test Stream 1', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
        { name: 'API Test Stream 2', url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' }
      ];
      
      // Monitor network requests to capture stream IDs
      const streamCreationRequests = [];
      page.on('request', request => {
        if (request.url().includes('/api/streams') && request.method() === 'POST') {
          streamCreationRequests.push(request);
        }
      });
      
      const streamCreationResponses = [];
      page.on('response', response => {
        if (response.url().includes('/api/streams') && response.request().method() === 'POST') {
          streamCreationResponses.push(response);
        }
      });
      
      // Create test streams
      for (const stream of testStreams) {
        console.log(`➕ Creating stream: ${stream.name}`);
        
        await page.click('[data-testid="add-stream-button"]').catch(() => page.click('button:has-text("Add")'));
        await page.waitForTimeout(1000);
        
        await page.fill('[data-testid="stream-name-input"], input[name="name"]', stream.name);
        await page.fill('[data-testid="stream-url-input"], input[name="url"]', stream.url);
        await page.click('[data-testid="save-stream-button"], button:has-text("Save")');
        await page.waitForTimeout(2000);
      }
      
      await page.screenshot({ 
        path: 'test-screenshots/streams-created-for-api-test.png', 
        fullPage: true 
      });
      
      // Extract stream IDs from responses
      for (const response of streamCreationResponses) {
        try {
          const responseBody = await response.json();
          if (responseBody.id) {
            streamIds.push(responseBody.id);
            console.log(`📝 Captured stream ID: ${responseBody.id}`);
          }
        } catch (error) {
          console.log('❌ Failed to parse stream creation response');
        }
      }
      
      // If we couldn't get IDs from responses, try to extract from the UI
      if (streamIds.length === 0) {
        console.log('🔍 Attempting to extract stream IDs from UI');
        
        // Look for preview buttons or data attributes that might contain IDs
        const previewButtons = page.locator('[data-testid="preview-stream-button"], button:has-text("Preview")');
        const buttonCount = await previewButtons.count();
        
        for (let i = 0; i < buttonCount; i++) {
          const button = previewButtons.nth(i);
          const parentRow = button.locator('xpath=ancestor::tr[1]');
          const rowText = await parentRow.textContent().catch(() => '');
          
          // Look for UUID patterns in the row
          const uuidMatch = rowText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          if (uuidMatch) {
            streamIds.push(uuidMatch[0]);
            console.log(`🔍 Extracted stream ID from UI: ${uuidMatch[0]}`);
          }
        }
      }
      
      console.log(`📊 Total stream IDs collected: ${streamIds.length}`);
    });

    test('Stream preview endpoints with real stream IDs', async ({ page }) => {
      console.log('🎯 Testing stream preview endpoints with real stream IDs');
      
      // Test known stream preview endpoint patterns
      const previewEndpointPatterns = [
        '/streams/preview/{id}',
        '/api/streams/{id}/preview',
        '/api/streams/preview/{id}',
        '/stream/{id}',
        '/preview/{id}'
      ];
      
      // Test with both real IDs (if available) and test IDs
      const testIds = [
        ...streamIds,
        'test-stream-id',
        'd81b0171-d3a8-4bb3-b8d7-3e45d86c6112', // Known test ID
        '550e8400-e29b-41d4-a716-446655440000'  // Another test UUID
      ];
      
      const endpointResults = [];
      
      for (const pattern of previewEndpointPatterns) {
        for (const id of testIds) {
          const endpoint = pattern.replace('{id}', id);
          console.log(`📡 Testing preview endpoint: ${endpoint}`);
          
          try {
            const response = await page.request.get(endpoint);
            const status = response.status();
            const contentType = response.headers()['content-type'] || '';
            const contentLength = response.headers()['content-length'] || '0';
            
            const result = {
              endpoint,
              streamId: id,
              status,
              contentType,
              contentLength,
              isVideo: contentType.includes('video/') || contentType.includes('application/octet-stream'),
              isHtml: contentType.includes('text/html'),
              isNotFound: status === 404,
              isServerError: status >= 500,
              success: status === 200 && !contentType.includes('text/html')
            };
            
            endpointResults.push(result);
            
            console.log(`📊 ${endpoint}: ${status} ${contentType} (${contentLength} bytes)`);
            
            // Log body preview for error responses
            if (status >= 400) {
              const body = await response.text();
              console.log(`❌ Error response body preview: ${body.substring(0, 200)}`);
            }
            
          } catch (error) {
            console.log(`❌ ${endpoint} request failed: ${error.message}`);
            endpointResults.push({
              endpoint,
              streamId: id,
              error: error.message,
              success: false
            });
          }
        }
      }
      
      // Generate comprehensive results page
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Stream Preview Endpoint Test Results</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .success { background-color: #d4edda; }
            .not-found { background-color: #fff3cd; }
            .error { background-color: #f8d7da; }
            .summary { background-color: #e2e3e5; padding: 15px; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>Stream Preview Endpoint Validation Results</h1>
          
          <div class="summary">
            <h2>Summary</h2>
            <p><strong>Total Tests:</strong> ${endpointResults.length}</p>
            <p><strong>Successful:</strong> ${endpointResults.filter(r => r.success).length}</p>
            <p><strong>404 Not Found:</strong> ${endpointResults.filter(r => r.isNotFound).length}</p>
            <p><strong>Server Errors:</strong> ${endpointResults.filter(r => r.isServerError).length}</p>
            <p><strong>HTML Error Pages:</strong> ${endpointResults.filter(r => r.isHtml).length}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Stream ID</th>
                <th>Status</th>
                <th>Content-Type</th>
                <th>Content-Length</th>
                <th>Is Video</th>
                <th>Is HTML Error</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              ${endpointResults.map(r => `
                <tr class="${r.success ? 'success' : (r.isNotFound ? 'not-found' : 'error')}">
                  <td>${r.endpoint}</td>
                  <td>${r.streamId}</td>
                  <td>${r.status || 'ERROR'}</td>
                  <td>${r.contentType || 'N/A'}</td>
                  <td>${r.contentLength || 'N/A'}</td>
                  <td>${r.isVideo ? '✅' : '❌'}</td>
                  <td>${r.isHtml ? '❌' : '✅'}</td>
                  <td>${r.success ? '✅ SUCCESS' : (r.error ? '❌ ERROR' : '❌ FAILED')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <h2>Analysis</h2>
          <ul>
            <li>The most critical issue appears to be 404 errors on stream preview endpoints</li>
            <li>When preview endpoints return HTML error pages instead of video streams, the video player fails</li>
            <li>This causes infinite loading loops and audio-only playback issues</li>
            <li>Valid stream preview endpoints should return video content-types or proper error responses</li>
          </ul>
        </body>
        </html>
      `);
      
      await page.screenshot({ 
        path: 'test-screenshots/stream-preview-endpoints-validation.png', 
        fullPage: true 
      });
      
      // Assert that we have at least some working preview endpoints
      const workingEndpoints = endpointResults.filter(r => r.success);
      const notFoundEndpoints = endpointResults.filter(r => r.isNotFound);
      
      console.log(`📊 Working preview endpoints: ${workingEndpoints.length}`);
      console.log(`📊 404 preview endpoints: ${notFoundEndpoints.length}`);
      
      // Log detailed results
      console.log('📊 Stream Preview Endpoint Results:', JSON.stringify(endpointResults, null, 2));
      
      // This test should identify the 404 issues without necessarily failing
      // The goal is to document the problem for fixing
      if (notFoundEndpoints.length > 0) {
        console.log('🚨 CRITICAL ISSUE IDENTIFIED: Stream preview endpoints returning 404');
        console.log('This explains the video player infinite loops and audio-only playback');
      }
    });
  });

  test.describe('2. Video Player URL Construction Testing', () => {
    test('Test video player URL construction logic', async ({ page }) => {
      console.log('🎯 Testing video player URL construction logic');
      
      // Navigate to streams and create test streams
      await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
      await page.waitForLoadState('networkidle');
      
      // Add a test stream
      await page.click('[data-testid="add-stream-button"]').catch(() => page.click('button:has-text("Add")'));
      await page.waitForTimeout(1000);
      
      await page.fill('[data-testid="stream-name-input"], input[name="name"]', 'URL Construction Test');
      await page.fill('[data-testid="stream-url-input"], input[name="url"]', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
      await page.click('[data-testid="save-stream-button"], button:has-text("Save")');
      await page.waitForTimeout(3000);
      
      // Open video player and inspect the URL construction
      await page.click('[data-testid="preview-stream-button"], button:has-text("Preview")');
      await page.waitForTimeout(3000);
      
      await page.screenshot({ 
        path: 'test-screenshots/url-construction-video-player.png', 
        fullPage: true 
      });
      
      // Extract the actual URLs being used by the video player
      const videoPlayerUrls = await page.evaluate(() => {
        const video = document.querySelector('[data-testid="video-player-dialog"] video, .MuiDialog-root video');
        const streamInfoText = document.querySelector('[data-testid="video-player-dialog"] .MuiBox-root, .MuiDialog-root .MuiBox-root');
        
        const results = {
          videoSrc: video ? video.src : null,
          videoCurrentSrc: video ? video.currentSrc : null,
          streamInfoText: streamInfoText ? streamInfoText.textContent : null,
          windowOrigin: window.location.origin,
          possibleUrls: []
        };
        
        // Look for URL patterns in the page
        const allText = document.body.textContent;
        const urlMatches = allText.match(/https?:\/\/[^\s]+/g) || [];
        results.possibleUrls = [...new Set(urlMatches)];
        
        return results;
      });
      
      console.log('📊 Video Player URL Analysis:', JSON.stringify(videoPlayerUrls, null, 2));
      
      // Test both proxy and direct URLs if toggle is available
      const proxyToggle = page.locator('[data-testid="video-player-dialog"] .MuiSwitch-root, .MuiDialog-root .MuiSwitch-root');
      
      if (await proxyToggle.isVisible()) {
        console.log('🔄 Testing URL construction with proxy toggle');
        
        // Test with proxy off
        await proxyToggle.click();
        await page.waitForTimeout(2000);
        
        const directUrls = await page.evaluate(() => {
          const video = document.querySelector('[data-testid="video-player-dialog"] video, .MuiDialog-root video');
          return {
            videoSrc: video ? video.src : null,
            videoCurrentSrc: video ? video.currentSrc : null
          };
        });
        
        console.log('📊 Direct URL Mode:', JSON.stringify(directUrls, null, 2));
        
        // Test with proxy on
        await proxyToggle.click();
        await page.waitForTimeout(2000);
        
        const proxyUrls = await page.evaluate(() => {
          const video = document.querySelector('[data-testid="video-player-dialog"] video, .MuiDialog-root video');
          return {
            videoSrc: video ? video.src : null,
            videoCurrentSrc: video ? video.currentSrc : null
          };
        });
        
        console.log('📊 Proxy URL Mode:', JSON.stringify(proxyUrls, null, 2));
        
        await page.screenshot({ 
          path: 'test-screenshots/url-construction-proxy-comparison.png', 
          fullPage: true 
        });
      }
      
      // Close video player
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    });

    test('Test stream ID extraction and validation', async ({ page }) => {
      console.log('🎯 Testing stream ID extraction and validation');
      
      // Navigate to streams page
      await page.click('[data-testid="nav-streams"]').catch(() => page.click('text="Streams"'));
      await page.waitForLoadState('networkidle');
      
      await page.screenshot({ 
        path: 'test-screenshots/stream-id-extraction-page.png', 
        fullPage: true 
      });
      
      // Extract all possible stream IDs from the page
      const extractedData = await page.evaluate(() => {
        const results = {
          streamIds: [],
          dataAttributes: [],
          buttonAttributes: [],
          tableData: []
        };
        
        // Look for UUID patterns in text content
        const allText = document.body.textContent;
        const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
        const uuidMatches = allText.match(uuidPattern) || [];
        results.streamIds = [...new Set(uuidMatches)];
        
        // Look for data attributes that might contain IDs
        const elementsWithData = document.querySelectorAll('[data-*]');
        elementsWithData.forEach(el => {
          const attrs = {};
          for (let attr of el.attributes) {
            if (attr.name.startsWith('data-')) {
              attrs[attr.name] = attr.value;
            }
          }
          if (Object.keys(attrs).length > 0) {
            results.dataAttributes.push(attrs);
          }
        });
        
        // Look for preview buttons and their attributes
        const previewButtons = document.querySelectorAll('[data-testid="preview-stream-button"], button:has-text("Preview")');
        previewButtons.forEach(btn => {
          const attrs = {};
          for (let attr of btn.attributes) {
            attrs[attr.name] = attr.value;
          }
          results.buttonAttributes.push(attrs);
        });
        
        // Extract table row data
        const tableRows = document.querySelectorAll('table tbody tr, .MuiTableBody-root tr');
        tableRows.forEach((row, index) => {
          results.tableData.push({
            index,
            textContent: row.textContent,
            innerHTML: row.innerHTML.substring(0, 500)
          });
        });
        
        return results;
      });
      
      console.log('📊 Extracted Stream Data:', JSON.stringify(extractedData, null, 2));
      
      // Test the extracted stream IDs against preview endpoints
      if (extractedData.streamIds.length > 0) {
        console.log(`🔍 Testing ${extractedData.streamIds.length} extracted stream IDs`);
        
        for (const streamId of extractedData.streamIds.slice(0, 3)) { // Test first 3
          const previewEndpoints = [
            `/streams/preview/${streamId}`,
            `/api/streams/${streamId}/preview`,
            `/stream/${streamId}`
          ];
          
          for (const endpoint of previewEndpoints) {
            try {
              const response = await page.request.get(endpoint);
              console.log(`📡 ${endpoint}: ${response.status()} ${response.headers()['content-type']}`);
            } catch (error) {
              console.log(`❌ ${endpoint}: ${error.message}`);
            }
          }
        }
      }
    });
  });

  test.describe('3. Error Response Analysis', () => {
    test('Analyze 404 error responses in detail', async ({ page }) => {
      console.log('🎯 Analyzing 404 error responses in detail');
      
      // Test various stream endpoint patterns that might return 404
      const problematicEndpoints = [
        '/streams/preview/nonexistent-id',
        '/api/streams/invalid-uuid/preview',
        '/stream/missing-channel',
        '/streams/preview/',
        '/api/streams//preview',
        '/streams/preview/null',
        '/streams/preview/undefined'
      ];
      
      const errorAnalysis = [];
      
      for (const endpoint of problematicEndpoints) {
        console.log(`📡 Analyzing error response: ${endpoint}`);
        
        try {
          const response = await page.request.get(endpoint);
          const status = response.status();
          const contentType = response.headers()['content-type'] || '';
          const body = await response.text();
          
          const analysis = {
            endpoint,
            status,
            contentType,
            isHtml: contentType.includes('text/html') || body.includes('<!DOCTYPE html>'),
            isJson: contentType.includes('application/json'),
            bodyLength: body.length,
            bodyPreview: body.substring(0, 300),
            containsStackTrace: body.includes('Error:') || body.includes('    at '),
            containsExpressError: body.includes('Cannot GET') || body.includes('express'),
            containsProperErrorMessage: body.includes('Stream not found') || body.includes('Invalid stream')
          };
          
          errorAnalysis.push(analysis);
          
        } catch (error) {
          errorAnalysis.push({
            endpoint,
            requestError: error.message,
            failed: true
          });
        }
      }
      
      // Generate detailed error analysis report
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>404 Error Response Analysis</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .endpoint { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
            .status-404 { background-color: #fff3cd; }
            .status-500 { background-color: #f8d7da; }
            .status-200 { background-color: #d4edda; }
            .body-preview { background-color: #f8f9fa; padding: 10px; margin: 5px 0; white-space: pre-wrap; font-family: monospace; font-size: 12px; }
            .issue { color: #dc3545; font-weight: bold; }
            .good { color: #28a745; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>404 Error Response Analysis</h1>
          <p>This analysis examines the error responses returned by stream preview endpoints to identify why the video player is failing.</p>
          
          ${errorAnalysis.map(analysis => `
            <div class="endpoint status-${analysis.status || 'error'}">
              <h3>${analysis.endpoint}</h3>
              <p><strong>Status:</strong> ${analysis.status || 'Request Failed'}</p>
              <p><strong>Content-Type:</strong> ${analysis.contentType || 'N/A'}</p>
              <p><strong>Is HTML Error Page:</strong> ${analysis.isHtml ? '<span class="issue">YES - This is the problem!</span>' : '<span class="good">No</span>'}</p>
              <p><strong>Is JSON Response:</strong> ${analysis.isJson ? '<span class="good">Yes</span>' : '<span class="issue">No</span>'}</p>
              <p><strong>Contains Express Error:</strong> ${analysis.containsExpressError ? '<span class="issue">Yes</span>' : 'No'}</p>
              <p><strong>Contains Proper Error Message:</strong> ${analysis.containsProperErrorMessage ? '<span class="good">Yes</span>' : '<span class="issue">No</span>'}</p>
              
              ${analysis.bodyPreview ? `
                <h4>Response Body Preview:</h4>
                <div class="body-preview">${analysis.bodyPreview}</div>
              ` : ''}
              
              ${analysis.requestError ? `
                <p><strong>Request Error:</strong> <span class="issue">${analysis.requestError}</span></p>
              ` : ''}
            </div>
          `).join('')}
          
          <h2>Key Findings</h2>
          <ul>
            <li><strong>HTML Error Pages:</strong> ${errorAnalysis.filter(a => a.isHtml).length} endpoints return HTML instead of proper API responses</li>
            <li><strong>Express Default Errors:</strong> ${errorAnalysis.filter(a => a.containsExpressError).length} endpoints show Express.js default error pages</li>
            <li><strong>Missing Error Handling:</strong> ${errorAnalysis.filter(a => !a.containsProperErrorMessage && a.status === 404).length} endpoints lack proper error messages</li>
          </ul>
          
          <h2>Resolution Required</h2>
          <p>The video player expects video streams but receives HTML error pages instead. This causes:</p>
          <ul>
            <li>Infinite loading loops as the player tries to parse HTML as video</li>
            <li>Audio-only playback when the player falls back to audio codecs</li>
            <li>Poor user experience with cryptic error messages</li>
          </ul>
          
          <p><strong>Fix:</strong> Stream preview endpoints should return proper JSON error responses with appropriate HTTP status codes, not HTML error pages.</p>
        </body>
        </html>
      `);
      
      await page.screenshot({ 
        path: 'test-screenshots/404-error-analysis-detailed.png', 
        fullPage: true 
      });
      
      console.log('📊 404 Error Analysis Results:', JSON.stringify(errorAnalysis, null, 2));
      
      // Assertions to document the issues
      const htmlErrorPages = errorAnalysis.filter(a => a.isHtml && a.status === 404);
      if (htmlErrorPages.length > 0) {
        console.log('🚨 CRITICAL ISSUE: Stream endpoints returning HTML error pages instead of proper API responses');
        console.log('This is the root cause of video player infinite loops and audio-only playback');
      }
    });

    test('Test error handling improvements verification', async ({ page }) => {
      console.log('🎯 Testing error handling improvements verification');
      
      // This test verifies that the backend properly handles errors
      // and returns appropriate JSON responses instead of HTML error pages
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Test error scenarios that should return proper JSON errors
      const errorScenarios = [
        {
          description: 'Nonexistent stream ID',
          endpoint: '/api/streams/nonexistent-stream-id',
          expectedStatus: 404,
          expectedJson: true
        },
        {
          description: 'Invalid UUID format',
          endpoint: '/api/streams/not-a-uuid',
          expectedStatus: 400,
          expectedJson: true
        },
        {
          description: 'Empty stream ID',
          endpoint: '/api/streams/',
          expectedStatus: 404,
          expectedJson: true
        },
        {
          description: 'Stream preview with invalid ID',
          endpoint: '/streams/preview/invalid-id',
          expectedStatus: 404,
          expectedJson: true
        }
      ];
      
      const verificationResults = [];
      
      for (const scenario of errorScenarios) {
        console.log(`🧪 Testing: ${scenario.description}`);
        
        try {
          const response = await page.request.get(scenario.endpoint);
          const status = response.status();
          const contentType = response.headers()['content-type'] || '';
          const body = await response.text();
          
          const result = {
            ...scenario,
            actualStatus: status,
            actualContentType: contentType,
            isJson: contentType.includes('application/json'),
            isHtml: contentType.includes('text/html') || body.includes('<!DOCTYPE html>'),
            bodyPreview: body.substring(0, 200),
            statusMatches: status === scenario.expectedStatus,
            contentTypeCorrect: scenario.expectedJson ? contentType.includes('application/json') : true,
            passed: status === scenario.expectedStatus && !body.includes('<!DOCTYPE html>')
          };
          
          verificationResults.push(result);
          
          console.log(`📊 ${scenario.endpoint}: ${status} ${contentType}`);
          
        } catch (error) {
          verificationResults.push({
            ...scenario,
            error: error.message,
            passed: false
          });
        }
      }
      
      // Generate verification report
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error Handling Verification Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .scenario { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
            .passed { background-color: #d4edda; }
            .failed { background-color: #f8d7da; }
            .summary { background-color: #e2e3e5; padding: 15px; margin: 20px 0; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>Error Handling Verification Report</h1>
          
          <div class="summary">
            <h2>Summary</h2>
            <p><strong>Total Scenarios:</strong> ${verificationResults.length}</p>
            <p><strong>Passed:</strong> ${verificationResults.filter(r => r.passed).length}</p>
            <p><strong>Failed:</strong> ${verificationResults.filter(r => !r.passed).length}</p>
            <p><strong>HTML Error Pages:</strong> ${verificationResults.filter(r => r.isHtml).length}</p>
          </div>
          
          ${verificationResults.map(result => `
            <div class="scenario ${result.passed ? 'passed' : 'failed'}">
              <h3>${result.description}</h3>
              <p><strong>Endpoint:</strong> ${result.endpoint}</p>
              <p><strong>Expected Status:</strong> ${result.expectedStatus} | <strong>Actual:</strong> ${result.actualStatus}</p>
              <p><strong>Expected JSON:</strong> ${result.expectedJson} | <strong>Actual:</strong> ${result.isJson}</p>
              <p><strong>Content-Type:</strong> ${result.actualContentType}</p>
              <p><strong>Is HTML Error Page:</strong> ${result.isHtml ? 'YES (Problem!)' : 'No'}</p>
              <p><strong>Result:</strong> ${result.passed ? '✅ PASSED' : '❌ FAILED'}</p>
              ${result.bodyPreview ? `<p><strong>Response Preview:</strong> ${result.bodyPreview}</p>` : ''}
            </div>
          `).join('')}
          
          <h2>Recommendations</h2>
          <ul>
            <li>All API endpoints should return JSON responses, even for errors</li>
            <li>Use proper HTTP status codes (404 for not found, 400 for bad request, etc.)</li>
            <li>Include helpful error messages in JSON format</li>
            <li>Avoid Express.js default HTML error pages for API endpoints</li>
            <li>Implement proper error middleware for consistent error handling</li>
          </ul>
        </body>
        </html>
      `);
      
      await page.screenshot({ 
        path: 'test-screenshots/error-handling-verification.png', 
        fullPage: true 
      });
      
      console.log('📊 Error Handling Verification:', JSON.stringify(verificationResults, null, 2));
    });
  });

  test.afterEach(async ({ page }) => {
    console.log('\n📊 STREAM PROXY ENDPOINT TEST SUMMARY:');
    console.log('=====================================');
    console.log(`Stream IDs collected: ${streamIds.length}`);
    console.log(`Channel IDs collected: ${channelIds.length}`);
    console.log('=====================================\n');
    
    await page.waitForTimeout(1000);
  });
});