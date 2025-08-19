const { test, expect } = require('@playwright/test');

test('Simple API Endpoint Test', async ({ page }) => {
  console.log('\n🔍 Testing API endpoints with Playwright...\n');
  
  const endpoints = [
    '/health',
    '/api/channels', 
    '/api/streams',
    '/api/settings',
    '/api/metrics'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await page.request.get(`http://localhost:8080${endpoint}`);
      const status = response.status();
      const contentType = response.headers()['content-type'] || '';
      const body = await response.text();
      
      console.log(`Endpoint: ${endpoint}`);
      console.log(`Status: ${status}`);
      console.log(`Content-Type: ${contentType}`);
      console.log(`Body (first 200 chars): ${body.substring(0, 200)}`);
      console.log('---');
      
      if (contentType.includes('application/json')) {
        const json = JSON.parse(body);
        console.log(`✅ ${endpoint} - Valid JSON response`);
      } else {
        console.log(`❌ ${endpoint} - Not JSON (${contentType})`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint} - Error: ${error.message}`);
    }
    console.log('');
  }
});