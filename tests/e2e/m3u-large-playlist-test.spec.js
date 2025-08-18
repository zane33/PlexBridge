const { test, expect } = require('@playwright/test');

test.describe('M3U Large Playlist Test - Legacy Parser Fix Verification', () => {
  test('should verify legacy parser fix with large IPTV.org playlist', async ({ page }) => {
    console.log('🧪 Testing M3U import with large IPTV.org playlist...');
    
    let consoleLogs = [];
    
    // Capture console logs
    page.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
    });
    
    // Navigate to the application
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Navigate to Stream Manager
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Click Import M3U button
    await page.click('[data-testid="import-m3u-button"]');
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Use the large IPTV.org playlist
    const testM3UUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    console.log(`Using large playlist: ${testM3UUrl}`);
    
    const urlInput = page.locator('[data-testid="import-dialog"]')
      .locator('[data-testid="import-url-input"]')
      .locator('input');
    
    await urlInput.fill(testM3UUrl);
    
    await page.screenshot({ 
      path: 'test-results/large-playlist-url-filled.png',
      fullPage: true 
    });
    
    // Click Parse Channels
    await page.click('[data-testid="parse-channels-button"]');
    
    console.log('🔄 Parsing large playlist (this will take longer)...');
    
    await page.screenshot({ 
      path: 'test-results/large-playlist-parsing-started.png',
      fullPage: true 
    });
    
    // Wait for parsing completion - look for the import button to show channel count
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes for large playlist
    let foundResults = false;
    let finalChannelCount = 0;
    
    while (attempts < maxAttempts && !foundResults) {
      attempts++;
      
      // Check if import button shows a channel count
      const importButton = page.locator('[data-testid="import-selected-button"]');
      if (await importButton.isVisible()) {
        const buttonText = await importButton.textContent();
        const match = buttonText.match(/Import (\\d+) Selected/);
        
        if (match && parseInt(match[1]) > 0) {
          finalChannelCount = parseInt(match[1]);
          console.log(`✅ SUCCESS: Found ${finalChannelCount} channels after ${attempts} seconds!`);
          foundResults = true;
          break;
        }
      }
      
      // Check for error messages
      const errorCount = await page.locator('text=/error|failed|invalid/i').count();
      if (errorCount > 0) {
        const errorText = await page.locator('text=/error|failed|invalid/i').allTextContents();
        console.log(`❌ Error after ${attempts} seconds: ${errorText.join(' | ')}`);
        break;
      }
      
      // Log progress every 10 seconds
      if (attempts % 10 === 0) {
        console.log(`... still parsing after ${attempts} seconds`);
        await page.screenshot({ 
          path: `test-results/large-playlist-progress-${attempts}s.png`,
          fullPage: true 
        });
      }
      
      await page.waitForTimeout(1000);
    }
    
    await page.screenshot({ 
      path: 'test-results/large-playlist-final-result.png',
      fullPage: true 
    });
    
    if (foundResults) {
      console.log(`🎉 LARGE PLAYLIST SUCCESS: ${finalChannelCount} channels parsed and ready for import!`);
      console.log('✅ Legacy parser fix working perfectly with large playlists!');
      
      // Verify the form didn't reset
      const urlValue = await urlInput.inputValue();
      expect(urlValue).toBe(testM3UUrl);
      console.log('✅ Form persistence working - URL preserved after parsing large playlist');
      
      // Check if search and filter controls are available
      const searchInput = page.locator('input[placeholder*="Search"]');
      const filterDropdown = page.locator('text="Filter by Group"');
      
      if (await searchInput.isVisible()) {
        console.log('✅ Search functionality available');
      }
      
      if (await filterDropdown.isVisible()) {
        console.log('✅ Group filtering functionality available');
      }
      
      // Test search functionality if available
      if (await searchInput.isVisible()) {
        await searchInput.fill('news');
        await page.waitForTimeout(1000);
        
        // Check if import button count changed (filtered)
        const filteredButtonText = await importButton.textContent();
        console.log(`Search result: ${filteredButtonText}`);
        
        // Clear search
        await searchInput.fill('');
        await page.waitForTimeout(1000);
      }
      
    } else {
      console.log(`❌ LARGE PLAYLIST FAILED: No channels found after ${attempts} seconds`);
      console.log('❌ This could indicate an issue with large playlist processing');
    }
    
    // Print relevant console logs related to parsing
    console.log('\\n📋 Parsing-related Console Logs:');
    const parsingLogs = consoleLogs.filter(log => 
      log.includes('parser') || 
      log.includes('channels') || 
      log.includes('onComplete') || 
      log.includes('Setting final') ||
      log.includes('cache')
    );
    
    parsingLogs.forEach((log, i) => console.log(`  ${i+1}: ${log}`));
    
    // Final assertion
    expect(foundResults).toBe(true);
    expect(finalChannelCount).toBeGreaterThan(0);
  });
});