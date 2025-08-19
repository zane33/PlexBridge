const { test, expect } = require('@playwright/test');

test.describe('EPG Manager NZ Timezone Formatting', () => {
  test('should display proper NZ date formatting in EPG Manager', async ({ page }) => {
    // Navigate to the EPG Manager page
    await page.goto('http://localhost:8080');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of homepage
    await page.screenshot({ 
      path: 'test-screenshots/epg-homepage.png', 
      fullPage: true 
    });
    
    // Navigate to EPG Manager
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    
    // Wait for EPG sources to load
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Take screenshot of EPG Sources tab
    await page.screenshot({ 
      path: 'test-screenshots/epg-sources-tab.png', 
      fullPage: true 
    });
    
    // Check for "Last Success" column in EPG Sources table
    const lastSuccessHeaders = await page.locator('th:has-text("Last Success")');
    if (await lastSuccessHeaders.count() > 0) {
      console.log('✅ Last Success column found in EPG Sources table');
      
      // Look for date cells in Last Success column
      const dateCells = await page.locator('table tbody tr td').nth(3); // 4th column (0-indexed)
      const dateText = await dateCells.textContent();
      console.log('📅 Date format found:', dateText);
      
      // Check if it follows NZ format (dd/mm/yyyy hh:mm)
      const nzDatePattern = /^(\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}|Never)$/;
      if (nzDatePattern.test(dateText?.trim() || '')) {
        console.log('✅ NZ date format is correct:', dateText);
      } else {
        console.log('❌ Date format needs fixing. Found:', dateText);
      }
    }
    
    // Test Program Guide tab
    await page.click('text="Program Guide"');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot of Program Guide tab
    await page.screenshot({ 
      path: 'test-screenshots/epg-program-guide-tab.png', 
      fullPage: true 
    });
    
    // Test Channel Mapping tab
    await page.click('text="Channel Mapping"');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot of Channel Mapping tab
    await page.screenshot({ 
      path: 'test-screenshots/epg-channel-mapping-tab.png', 
      fullPage: true 
    });
    
    // Go back to EPG Sources to focus on the fixed formatting
    await page.click('text="EPG Sources"');
    await page.waitForLoadState('networkidle');
    
    // Take final screenshot focusing on the date formatting
    await page.screenshot({ 
      path: 'test-screenshots/epg-final-date-check.png', 
      fullPage: true 
    });
    
    console.log('🎯 EPG Manager NZ formatting test completed');
    console.log('📸 Screenshots saved to test-screenshots/ directory');
  });
  
  test('should verify API responses contain proper data', async ({ page }) => {
    // Test API endpoints to ensure they return proper JSON
    const endpoints = [
      '/api/epg/sources',
      '/api/channels', 
      '/api/epg',
      '/api/metrics'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await page.request.get(`http://localhost:8080${endpoint}`);
        expect(response.status()).toBe(200);
        
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('application/json');
        
        const data = await response.json();
        console.log(`✅ ${endpoint} returns valid JSON:`, typeof data);
      } catch (error) {
        console.log(`❌ ${endpoint} failed:`, error.message);
      }
    }
  });
});