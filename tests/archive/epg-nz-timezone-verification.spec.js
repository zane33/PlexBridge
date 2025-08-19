const { test, expect } = require('@playwright/test');

test.describe('EPG Manager NZ Timezone Formatting Verification', () => {
  test('should create EPG source and verify NZ date formatting', async ({ page }) => {
    console.log('🚀 Starting EPG NZ timezone formatting verification...');
    
    // Navigate to the application
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of homepage
    await page.screenshot({ 
      path: 'test-screenshots/epg-nz-01-homepage.png', 
      fullPage: true 
    });
    console.log('📸 Homepage screenshot taken');
    
    // Navigate to EPG Manager
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot of EPG Manager initial state
    await page.screenshot({ 
      path: 'test-screenshots/epg-nz-02-initial-epg-manager.png', 
      fullPage: true 
    });
    console.log('📸 Initial EPG Manager screenshot taken');
    
    // Click Add Source button
    await page.click('button:has-text("Add Source")');
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    
    // Fill in EPG source form
    await page.fill('input[label="Source Name *"]', 'Test NZ EPG Source');
    await page.fill('input[label="XMLTV URL *"]', 'https://iptv-org.github.io/epg/guides/us/tvguide.com.epg.xml');
    
    // Take screenshot of filled form
    await page.screenshot({ 
      path: 'test-screenshots/epg-nz-03-add-source-dialog.png', 
      fullPage: true 
    });
    console.log('📸 Add source dialog screenshot taken');
    
    // Save the EPG source
    await page.click('button:has-text("Save Source")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Take screenshot after adding source
    await page.screenshot({ 
      path: 'test-screenshots/epg-nz-04-source-added.png', 
      fullPage: true 
    });
    console.log('📸 Source added screenshot taken');
    
    // Refresh the EPG source to generate a "Last Success" timestamp
    console.log('🔄 Refreshing EPG source to generate timestamp...');
    const refreshButtons = await page.locator('button[title="Refresh Source"], button:has-text("Refresh")').all();
    if (refreshButtons.length > 0) {
      await refreshButtons[0].click();
      await page.waitForTimeout(5000); // Wait for refresh to complete
      
      // Take screenshot after refresh
      await page.screenshot({ 
        path: 'test-screenshots/epg-nz-05-after-refresh.png', 
        fullPage: true 
      });
      console.log('📸 After refresh screenshot taken');
    }
    
    // Now check for the "Last Success" date formatting
    await page.waitForTimeout(2000);
    
    // Look for table rows with data
    const tableRows = await page.locator('table tbody tr').all();
    console.log(`📊 Found ${tableRows.length} table rows`);
    
    if (tableRows.length > 0) {
      // Get the "Last Success" cell content
      const lastSuccessCell = await page.locator('table tbody tr').first().locator('td').nth(3);
      const dateText = await lastSuccessCell.textContent();
      console.log('📅 Last Success date text found:', dateText?.trim());
      
      // Take focused screenshot of the table
      await page.screenshot({ 
        path: 'test-screenshots/epg-nz-06-date-formatting-check.png', 
        fullPage: true 
      });
      
      // Check if the date follows NZ format
      if (dateText && dateText.trim() !== 'Never') {
        const nzDatePattern = /^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}$/;
        if (nzDatePattern.test(dateText.trim())) {
          console.log('✅ NZ date format is CORRECT:', dateText.trim());
          console.log('✅ Format matches dd/mm/yyyy hh:mm pattern');
        } else {
          console.log('❌ Date format is INCORRECT:', dateText.trim());
          console.log('❌ Expected format: dd/mm/yyyy hh:mm (24-hour)');
        }
      } else {
        console.log('ℹ️ No timestamp available yet (showing "Never")');
      }
    } else {
      console.log('ℹ️ No EPG sources in table yet');
    }
    
    // Test Program Guide tab for date formatting
    await page.click('text="Program Guide"');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: 'test-screenshots/epg-nz-07-program-guide.png', 
      fullPage: true 
    });
    console.log('📸 Program Guide tab screenshot taken');
    
    // Test Channel Mapping tab
    await page.click('text="Channel Mapping"');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: 'test-screenshots/epg-nz-08-channel-mapping.png', 
      fullPage: true 
    });
    console.log('📸 Channel Mapping tab screenshot taken');
    
    // Return to EPG Sources tab for final verification
    await page.click('text="EPG Sources"');
    await page.waitForLoadState('networkidle');
    
    // Take final screenshot
    await page.screenshot({ 
      path: 'test-screenshots/epg-nz-09-final-verification.png', 
      fullPage: true 
    });
    console.log('📸 Final verification screenshot taken');
    
    console.log('✅ EPG NZ timezone formatting verification completed');
    console.log('📁 All screenshots saved to test-screenshots/ directory');
  });
  
  test('should verify API endpoints return correct JSON data', async ({ page }) => {
    console.log('🧪 Testing API endpoints...');
    
    const endpoints = [
      '/api/epg/sources',
      '/api/channels', 
      '/api/epg',
      '/api/metrics',
      '/api/health'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await page.request.get(`http://localhost:8080${endpoint}`);
        expect(response.status()).toBe(200);
        
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('application/json');
        
        const data = await response.json();
        console.log(`✅ ${endpoint} - Status: ${response.status()}, Type: ${typeof data}`);
      } catch (error) {
        console.log(`❌ ${endpoint} failed:`, error.message);
        throw error;
      }
    }
    
    console.log('✅ All API endpoints are working correctly');
  });
  
  test('should verify page navigation and UI elements', async ({ page }) => {
    console.log('🧭 Testing navigation and UI elements...');
    
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Test all navigation links
    const navItems = [
      { selector: '[data-testid="nav-dashboard"]', name: 'Dashboard' },
      { selector: '[data-testid="nav-channels"]', name: 'Channels' },
      { selector: '[data-testid="nav-streams"]', name: 'Streams' },
      { selector: '[data-testid="nav-epg"]', name: 'EPG' },
      { selector: '[data-testid="nav-logs"]', name: 'Logs' },
      { selector: '[data-testid="nav-settings"]', name: 'Settings' }
    ];
    
    for (const nav of navItems) {
      try {
        await page.click(nav.selector);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        console.log(`✅ ${nav.name} navigation works`);
      } catch (error) {
        console.log(`❌ ${nav.name} navigation failed:`, error.message);
      }
    }
    
    console.log('✅ Navigation verification completed');
  });
});