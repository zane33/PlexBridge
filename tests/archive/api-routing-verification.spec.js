const { test, expect } = require('@playwright/test');

test.describe('API Routing Verification', () => {
  test('verify API endpoints return JSON after routing fix', async ({ page }) => {
    const endpoints = [
      { url: 'http://localhost:8080/health', name: 'Health Check' },
      { url: 'http://localhost:8080/api/health', name: 'API Health' },
      { url: 'http://localhost:8080/api/channels', name: 'Channels API' },
      { url: 'http://localhost:8080/api/streams', name: 'Streams API' }
    ];

    console.log('\n=== API ROUTING VERIFICATION ===\n');
    const results = [];

    for (const endpoint of endpoints) {
      try {
        // Navigate to the endpoint
        const response = await page.goto(endpoint.url, { 
          waitUntil: 'networkidle',
          timeout: 10000 
        });
        
        // Get the response headers
        const contentType = response.headers()['content-type'] || '';
        
        // Get the response body
        const bodyText = await page.content();
        
        // Check if response is JSON or HTML
        const isJSON = contentType.includes('application/json');
        const isHTML = contentType.includes('text/html') || bodyText.includes('<!DOCTYPE html>');
        
        // Try to parse as JSON to verify
        let jsonValid = false;
        let jsonData = null;
        if (isJSON || (!isHTML && bodyText.includes('{') && bodyText.includes('}'))) {
          try {
            // Extract JSON from page content
            const textContent = await page.evaluate(() => document.body.textContent);
            jsonData = JSON.parse(textContent);
            jsonValid = true;
          } catch (e) {
            // Not valid JSON
          }
        }
        
        const status = response.status();
        const result = {
          endpoint: endpoint.name,
          url: endpoint.url,
          status: status,
          contentType: contentType,
          isJSON: jsonValid,
          isHTML: isHTML,
          verdict: jsonValid ? '✅ JSON' : '❌ HTML'
        };
        
        results.push(result);
        
        console.log(`${result.verdict} ${endpoint.name}`);
        console.log(`  URL: ${endpoint.url}`);
        console.log(`  Status: ${status}`);
        console.log(`  Content-Type: ${contentType}`);
        if (jsonValid && jsonData) {
          console.log(`  JSON Data: ${JSON.stringify(jsonData).substring(0, 100)}...`);
        }
        console.log('');
        
        // Take screenshot for documentation
        await page.screenshot({ 
          path: `tests/screenshots/api-routing/${endpoint.name.replace(/\s+/g, '-').toLowerCase()}.png`,
          fullPage: true 
        });
        
      } catch (error) {
        console.log(`❌ ERROR - ${endpoint.name}`);
        console.log(`  URL: ${endpoint.url}`);
        console.log(`  Error: ${error.message}`);
        console.log('');
        
        results.push({
          endpoint: endpoint.name,
          url: endpoint.url,
          status: 'ERROR',
          error: error.message,
          verdict: '❌ ERROR'
        });
      }
    }
    
    // Check browser console for errors
    const consoleMessages = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleMessages.push(msg.text());
      }
    });
    
    // Navigate to main page to check for console errors
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Summary
    console.log('\n=== SUMMARY ===\n');
    const workingEndpoints = results.filter(r => r.isJSON).length;
    const brokenEndpoints = results.filter(r => !r.isJSON).length;
    
    console.log(`Working Endpoints (JSON): ${workingEndpoints}/${results.length}`);
    console.log(`Broken Endpoints (HTML/Error): ${brokenEndpoints}/${results.length}`);
    
    if (consoleMessages.length > 0) {
      console.log('\nBrowser Console Errors:');
      consoleMessages.forEach(msg => console.log(`  - ${msg}`));
    }
    
    console.log('\nDetailed Results:');
    results.forEach(r => {
      console.log(`  ${r.verdict} ${r.endpoint}: ${r.status === 'ERROR' ? r.error : `Status ${r.status}, ${r.contentType}`}`);
    });
    
    // Test assertions
    results.forEach(r => {
      if (r.status !== 'ERROR') {
        expect(r.isJSON, `${r.endpoint} should return JSON, not HTML`).toBe(true);
      }
    });
  });
});