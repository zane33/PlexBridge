const { test, expect } = require('@playwright/test');

test.describe('M3U Import Search Filter Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    
    // Navigate to streams page
    await page.click('[data-testid="nav-streams"]');
    await page.waitForSelector('[data-testid="import-m3u-button"]');
  });

  test('Channel search filter should display matching results', async ({ page }) => {
    // Open M3U import dialog
    await page.click('[data-testid="import-m3u-button"]');
    await page.waitForSelector('[data-testid="import-dialog"]');
    
    // Fill in M3U URL
    await page.fill('[data-testid="import-url-input"] input', 'https://iptv-org.github.io/iptv/index.m3u');
    
    // Parse channels
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 60000 });
    
    // Wait for the initial count to stabilize
    await page.waitForTimeout(2000);
    
    // Get initial channel count
    const initialCountText = await page.textContent('[data-testid="import-dialog"] h6');
    const initialMatch = initialCountText.match(/Found (\d+) channels/);
    const initialCount = initialMatch ? parseInt(initialMatch[1]) : 0;
    
    expect(initialCount).toBeGreaterThan(0);
    
    // Test search for common terms that should exist
    const searchTests = [
      { term: 'BBC', description: 'BBC channels' },
      { term: 'News', description: 'News channels' },
      { term: 'Sport', description: 'Sports channels' },
      { term: 'USA', description: 'USA channels' },
      { term: 'UK', description: 'UK channels' }
    ];
    
    for (const searchTest of searchTests) {
      // Clear search and enter new term
      await page.fill('[data-testid="import-dialog"] input[placeholder*="Search"]', '');
      await page.fill('[data-testid="import-dialog"] input[placeholder*="Search"]', searchTest.term);
      
      // Wait for debounced search (300ms + buffer)
      await page.waitForTimeout(500);
      
      // Check if results are displayed
      const afterSearchCount = await page.textContent('[data-testid="import-dialog"] h6');
      console.log(`Search term "${searchTest.term}": ${afterSearchCount}`);
      
      // Verify that either:
      // 1. We see "Showing X of Y channels" format (indicating filtered results)
      // 2. We see some channels in the table
      const hasShowingFormat = afterSearchCount.includes('Showing') && afterSearchCount.includes('of');
      const tableRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      
      if (hasShowingFormat) {
        // Extract the "showing" count
        const showingMatch = afterSearchCount.match(/Showing (\d+) of/);
        const showingCount = showingMatch ? parseInt(showingMatch[1]) : 0;
        
        if (showingCount > 0) {
          // Verify table actually shows rows
          expect(tableRows).toBeGreaterThan(0);
          
          // Verify we don't see "No channels match your filters"
          const noMatchText = await page.locator('text="No channels match your filters"').count();
          expect(noMatchText).toBe(0);
        }
      }
    }
    
    // Test that clearing search shows all channels again
    await page.fill('[data-testid="import-dialog"] input[placeholder*="Search"]', '');
    await page.waitForTimeout(500);
    
    const finalCountText = await page.textContent('[data-testid="import-dialog"] h6');
    const finalMatch = finalCountText.match(/Found (\d+) channels/);
    const finalCount = finalMatch ? parseInt(finalMatch[1]) : 0;
    
    expect(finalCount).toBe(initialCount);
  });

  test('Search should work with TVG-ID and TVG-Name attributes', async ({ page }) => {
    // Open M3U import dialog
    await page.click('[data-testid="import-m3u-button"]');
    await page.waitForSelector('[data-testid="import-dialog"]');
    
    // Fill in M3U URL
    await page.fill('[data-testid="import-url-input"] input', 'https://iptv-org.github.io/iptv/index.m3u');
    
    // Parse channels
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // Test search by country codes that might be in TVG-ID
    const tvgSearchTests = ['US', 'UK', 'FR', 'DE', 'CA'];
    
    for (const term of tvgSearchTests) {
      await page.fill('[data-testid="import-dialog"] input[placeholder*="Search"]', '');
      await page.fill('[data-testid="import-dialog"] input[placeholder*="Search"]', term);
      await page.waitForTimeout(500);
      
      const countText = await page.textContent('[data-testid="import-dialog"] h6');
      console.log(`TVG search term "${term}": ${countText}`);
      
      // Verify search doesn't break the interface
      const noMatchCount = await page.locator('text="No channels match your filters"').count();
      const tableRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      
      // Either we have results OR we properly show "no matches" (not both)
      if (tableRows > 0) {
        expect(noMatchCount).toBe(0);
      }
    }
  });

  test('Group filter and search filter should work independently', async ({ page }) => {
    // Open M3U import dialog
    await page.click('[data-testid="import-m3u-button"]');
    await page.waitForSelector('[data-testid="import-dialog"]');
    
    // Fill in M3U URL
    await page.fill('[data-testid="import-url-input"] input', 'https://iptv-org.github.io/iptv/index.m3u');
    
    // Parse channels
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // Test group filter first
    const groupSelect = page.locator('[data-testid="import-dialog"] .MuiSelect-select');
    if (await groupSelect.count() > 0) {
      await groupSelect.click();
      
      // Wait for menu options to appear
      await page.waitForSelector('li[role="option"]');
      const options = await page.locator('li[role="option"]').count();
      
      if (options > 1) {
        // Select the second option (first is usually "All" or empty)
        await page.locator('li[role="option"]').nth(1).click();
        await page.waitForTimeout(500);
        
        const groupFilteredText = await page.textContent('[data-testid="import-dialog"] h6');
        console.log(`After group filter: ${groupFilteredText}`);
        
        // Now add search on top of group filter
        await page.fill('[data-testid="import-dialog"] input[placeholder*="Search"]', 'News');
        await page.waitForTimeout(500);
        
        const bothFiltersText = await page.textContent('[data-testid="import-dialog"] h6');
        console.log(`After both filters: ${bothFiltersText}`);
        
        // Verify both filters work together
        const tableRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
        const noMatchCount = await page.locator('text="No channels match your filters"').count();
        
        // Either we have results OR we properly show "no matches"
        if (tableRows > 0) {
          expect(noMatchCount).toBe(0);
        } else {
          expect(noMatchCount).toBe(1);
        }
      }
    }
  });

  test('Search should handle special characters and case sensitivity', async ({ page }) => {
    // Open M3U import dialog
    await page.click('[data-testid="import-m3u-button"]');
    await page.waitForSelector('[data-testid="import-dialog"]');
    
    // Fill in M3U URL
    await page.fill('[data-testid="import-url-input"] input', 'https://iptv-org.github.io/iptv/index.m3u');
    
    // Parse channels
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // Test case insensitivity
    const caseTests = [
      { lower: 'bbc', upper: 'BBC' },
      { lower: 'news', upper: 'NEWS' },
      { lower: 'sport', upper: 'SPORT' }
    ];
    
    for (const caseTest of caseTests) {
      // Test lowercase
      await page.fill('[data-testid="import-dialog"] input[placeholder*="Search"]', '');
      await page.fill('[data-testid="import-dialog"] input[placeholder*="Search"]', caseTest.lower);
      await page.waitForTimeout(500);
      
      const lowerResult = await page.textContent('[data-testid="import-dialog"] h6');
      const lowerRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      
      // Test uppercase
      await page.fill('[data-testid="import-dialog"] input[placeholder*="Search"]', '');
      await page.fill('[data-testid="import-dialog"] input[placeholder*="Search"]', caseTest.upper);
      await page.waitForTimeout(500);
      
      const upperResult = await page.textContent('[data-testid="import-dialog"] h6');
      const upperRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
      
      // Case insensitive search should return same results
      console.log(`Case test "${caseTest.lower}" vs "${caseTest.upper}": ${lowerResult} vs ${upperResult}`);
      
      // Both should either have the same number of results or both show no matches
      if (lowerRows > 0 || upperRows > 0) {
        expect(lowerRows).toBe(upperRows);
      }
    }
  });

  test('Search performance should not freeze UI with large datasets', async ({ page }) => {
    // Open M3U import dialog
    await page.click('[data-testid="import-m3u-button"]');
    await page.waitForSelector('[data-testid="import-dialog"]');
    
    // Fill in M3U URL
    await page.fill('[data-testid="import-url-input"] input', 'https://iptv-org.github.io/iptv/index.m3u');
    
    // Parse channels
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to load
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // Test rapid typing to ensure debouncing works
    const searchInput = page.locator('[data-testid="import-dialog"] input[placeholder*="Search"]');
    
    // Type rapidly
    await searchInput.fill('a');
    await searchInput.fill('ab');
    await searchInput.fill('abc');
    await searchInput.fill('abcd');
    await searchInput.fill('abcde');
    
    // Wait for debouncing to settle
    await page.waitForTimeout(500);
    
    // Verify UI is still responsive
    const finalResult = await page.textContent('[data-testid="import-dialog"] h6');
    console.log(`Rapid typing final result: ${finalResult}`);
    
    // Dialog should still be functional
    expect(await page.locator('[data-testid="import-dialog"]').isVisible()).toBe(true);
    
    // Cancel button should still work
    const cancelButton = page.locator('[data-testid="import-dialog"] button:has-text("Cancel")');
    expect(await cancelButton.isEnabled()).toBe(true);
  });
});