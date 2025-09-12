const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(__dirname, '../screenshots/api-diagnosis');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

test.describe('PlexBridge API Routing Diagnosis', () => {
  let page;
  let context;
  let consoleErrors = [];
  let networkErrors = [];

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    page = await context.newPage();

    // Capture console messages
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          url: page.url(),
          message: msg.text(),
          timestamp: new Date().toISOString()
        });
        console.log(`Console Error on ${page.url()}: ${msg.text()}`);
      }
    });

    // Capture network failures
    page.on('response', response => {
      if (response.status() >= 400) {
        networkErrors.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText(),
          timestamp: new Date().toISOString()
        });
        console.log(`Network Error: ${response.url()} - ${response.status()} ${response.statusText()}`);
      }
    });
  });

  test.afterAll(async () => {
    // Generate comprehensive error report
    const errorReport = {
      consoleErrors,
      networkErrors,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(screenshotsDir, 'error-report.json'),
      JSON.stringify(errorReport, null, 2)
    );

    console.log('\n=== ERROR SUMMARY ===');
    console.log(`Console Errors: ${consoleErrors.length}`);
    console.log(`Network Errors: ${networkErrors.length}`);
    
    await context.close();
  });

  test('1. Homepage and Navigation Test', async () => {
    // Navigate to homepage
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Take homepage screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-homepage.png'),
      fullPage: true 
    });

    // Check if React app loaded
    const title = await page.title();
    console.log(`Homepage Title: ${title}`);
    
    // Wait for any React components to load
    await page.waitForTimeout(2000);
    
    // Take screenshot after loading
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-homepage-loaded.png'),
      fullPage: true 
    });
  });

  test('2. Navigation to All Pages', async () => {
    const pages = [
      { name: 'Dashboard', url: '/', selector: '[data-testid="nav-dashboard"]', fallback: 'text=Dashboard' },
      { name: 'Channels', url: '/channels', selector: '[data-testid="nav-channels"]', fallback: 'text=Channels' },
      { name: 'Streams', url: '/streams', selector: '[data-testid="nav-streams"]', fallback: 'text=Streams' },
      { name: 'EPG', url: '/epg', selector: '[data-testid="nav-epg"]', fallback: 'text=EPG' },
      { name: 'Logs', url: '/logs', selector: '[data-testid="nav-logs"]', fallback: 'text=Logs' },
      { name: 'Settings', url: '/settings', selector: '[data-testid="nav-settings"]', fallback: 'text=Settings' }
    ];

    for (const pageInfo of pages) {
      try {
        console.log(`\\nTesting ${pageInfo.name} page...`);
        
        // Navigate directly to the page URL
        await page.goto(`http://localhost:8080${pageInfo.url}`);
        await page.waitForLoadState('networkidle');
        
        // Wait for page to render
        await page.waitForTimeout(2000);
        
        // Take screenshot
        await page.screenshot({ 
          path: path.join(screenshotsDir, `02-${pageInfo.name.toLowerCase()}-page.png`),
          fullPage: true 
        });

        console.log(`${pageInfo.name} page loaded successfully`);
      } catch (error) {
        console.error(`Failed to load ${pageInfo.name} page: ${error.message}`);
        
        // Take error screenshot
        await page.screenshot({ 
          path: path.join(screenshotsDir, `02-${pageInfo.name.toLowerCase()}-error.png`),
          fullPage: true 
        });
      }
    }
  });

  test('3. EPG Manager Specific Test', async () => {
    console.log('\\nTesting EPG Manager specifically...');
    
    // Navigate to EPG page
    await page.goto('http://localhost:8080/epg');
    await page.waitForLoadState('networkidle');
    
    // Wait for EPG components to load and make API calls
    await page.waitForTimeout(5000);
    
    // Take screenshot of EPG page
    await page.screenshot({ 
      path: path.join(screenshotsDir, '03-epg-manager-detailed.png'),
      fullPage: true 
    });

    // Check for specific EPG-related errors
    const epgErrors = consoleErrors.filter(error => 
      error.message.includes('EPG') || 
      error.message.includes('programs') ||
      error.url.includes('/epg')
    );
    
    console.log(`EPG-specific errors found: ${epgErrors.length}`);
    epgErrors.forEach(error => {
      console.log(`  - ${error.message}`);
    });
  });

  test('4. Direct API Endpoint Testing', async () => {
    const apiEndpoints = [
      '/api/health',
      '/api/channels',
      '/api/streams', 
      '/api/epg-sources',
      '/api/epg/channels',
      '/api/epg/programs',
      '/api/settings',
      '/api/logs',
      '/api/metrics',
      '/discover.json',
      '/lineup.json'
    ];

    const apiResults = [];

    for (const endpoint of apiEndpoints) {
      try {
        console.log(`\\nTesting API endpoint: ${endpoint}`);
        
        // Navigate directly to API endpoint
        const response = await page.goto(`http://localhost:8080${endpoint}`);
        await page.waitForLoadState('networkidle');
        
        const statusCode = response.status();
        const contentType = response.headers()['content-type'] || '';
        
        // Get page content
        const content = await page.content();
        const bodyText = await page.evaluate(() => document.body.textContent || document.body.innerText);
        
        // Determine if response is JSON or HTML
        const isJson = contentType.includes('application/json');
        const isHtml = contentType.includes('text/html') || content.includes('<html>') || content.includes('<!DOCTYPE html>');
        
        let parsedContent = null;
        let isValidJson = false;
        
        try {
          // Try to parse as JSON
          parsedContent = JSON.parse(bodyText);
          isValidJson = true;
        } catch (e) {
          // Not valid JSON
          isValidJson = false;
        }

        const result = {
          endpoint,
          statusCode,
          contentType,
          isJson,
          isHtml,
          isValidJson,
          isReactApp: content.includes('react') || content.includes('React') || content.includes('root'),
          contentPreview: bodyText.substring(0, 200),
          success: statusCode === 200 && isValidJson
        };
        
        apiResults.push(result);
        
        console.log(`  Status: ${statusCode}`);
        console.log(`  Content-Type: ${contentType}`);
        console.log(`  Is JSON: ${isJson}`);
        console.log(`  Is Valid JSON: ${isValidJson}`);
        console.log(`  Is HTML/React: ${isHtml}`);
        console.log(`  Success: ${result.success}`);
        
        // Take screenshot of API response
        await page.screenshot({ 
          path: path.join(screenshotsDir, `04-api-${endpoint.replace(/[/\\:*?"<>|]/g, '-')}.png`),
          fullPage: true 
        });
        
      } catch (error) {
        console.error(`  ERROR: ${error.message}`);
        
        apiResults.push({
          endpoint,
          error: error.message,
          success: false
        });
        
        // Take error screenshot
        await page.screenshot({ 
          path: path.join(screenshotsDir, `04-api-${endpoint.replace(/[/\\:*?"<>|]/g, '-')}-error.png`),
          fullPage: true 
        });
      }
    }

    // Save API test results
    fs.writeFileSync(
      path.join(screenshotsDir, 'api-endpoint-results.json'),
      JSON.stringify(apiResults, null, 2)
    );

    // Analyze results
    const workingEndpoints = apiResults.filter(r => r.success);
    const brokenEndpoints = apiResults.filter(r => !r.success);
    const htmlResponses = apiResults.filter(r => r.isHtml && !r.isValidJson);

    console.log('\\n=== API ENDPOINT ANALYSIS ===');
    console.log(`Working endpoints: ${workingEndpoints.length}`);
    console.log(`Broken endpoints: ${brokenEndpoints.length}`);
    console.log(`HTML responses (routing issues): ${htmlResponses.length}`);
    
    console.log('\\nWorking endpoints:');
    workingEndpoints.forEach(r => console.log(`  ✅ ${r.endpoint}`));
    
    console.log('\\nBroken endpoints:');
    brokenEndpoints.forEach(r => console.log(`  ❌ ${r.endpoint} - ${r.error || 'Invalid response'}`));
    
    console.log('\\nHTML responses (likely routing issues):');
    htmlResponses.forEach(r => console.log(`  🔥 ${r.endpoint} - Serving HTML instead of JSON`));
  });

  test('5. Browser DevTools Console Analysis', async () => {
    console.log('\\n=== BROWSER CONSOLE ANALYSIS ===');
    
    // Navigate through all pages again to capture all console errors
    const pages = ['/', '/channels', '/streams', '/epg', '/logs', '/settings'];
    
    for (const pagePath of pages) {
      await page.goto(`http://localhost:8080${pagePath}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000); // Allow time for async operations
    }

    // Final console error summary
    console.log(`\\nTotal Console Errors: ${consoleErrors.length}`);
    consoleErrors.forEach((error, index) => {
      console.log(`\\n${index + 1}. ${error.url}`);
      console.log(`   Time: ${error.timestamp}`);
      console.log(`   Error: ${error.message}`);
    });

    console.log(`\\nTotal Network Errors: ${networkErrors.length}`);
    networkErrors.forEach((error, index) => {
      console.log(`\\n${index + 1}. ${error.url}`);
      console.log(`   Status: ${error.status} ${error.statusText}`);
      console.log(`   Time: ${error.timestamp}`);
    });
  });

  test('6. Network Tab Analysis', async () => {
    console.log('\\n=== NETWORK TAB ANALYSIS ===');
    
    // Navigate to EPG page and monitor network requests
    const requests = [];
    const responses = [];

    page.on('request', request => {
      if (request.url().includes('/api/') || request.url().includes('.json')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          timestamp: new Date().toISOString()
        });
      }
    });

    page.on('response', response => {
      if (response.url().includes('/api/') || response.url().includes('.json')) {
        responses.push({
          url: response.url(),
          status: response.status(),
          contentType: response.headers()['content-type'],
          timestamp: new Date().toISOString()
        });
      }
    });

    // Navigate to EPG page to trigger the problematic API calls
    await page.goto('http://localhost:8080/epg');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Save network analysis
    const networkAnalysis = {
      requests,
      responses,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(screenshotsDir, 'network-analysis.json'),
      JSON.stringify(networkAnalysis, null, 2)
    );

    console.log(`\\nAPI Requests captured: ${requests.length}`);
    requests.forEach(req => {
      console.log(`  ${req.method} ${req.url}`);
    });

    console.log(`\\nAPI Responses captured: ${responses.length}`);
    responses.forEach(res => {
      console.log(`  ${res.status} ${res.url} (${res.contentType})`);
    });
  });
});