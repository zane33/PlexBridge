const { test, expect } = require('@playwright/test');

test.describe('EPG Category Dropdown Investigation', () => {
  test('Test Plex Category dropdown options', async ({ page }) => {
    console.log('=== EPG CATEGORY DROPDOWN TEST ===');
    
    // Navigate to EPG Manager
    await page.goto('http://192.168.4.56:3000');
    await page.waitForLoadState('networkidle');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    
    // Click Add Source button
    await page.click('button:has-text("Add Source")');
    await page.waitForTimeout(1000);
    
    // Take screenshot before clicking dropdown
    await page.screenshot({ 
      path: 'tests/screenshots/epg-category-dropdown-closed.png',
      fullPage: true 
    });
    
    // Click on Plex Category dropdown
    const categoryDropdown = page.locator('.MuiSelect-select:has-text("Plex Category")');
    await categoryDropdown.click();
    await page.waitForTimeout(500);
    
    // Take screenshot with dropdown open
    await page.screenshot({ 
      path: 'tests/screenshots/epg-category-dropdown-open.png',
      fullPage: true 
    });
    
    // Get all dropdown options
    const options = await page.locator('.MuiMenuItem-root').allTextContents();
    console.log('Available category options:', options);
    
    // Test selecting different options
    for (let i = 0; i < options.length && i < 5; i++) { // Test first 5 options
      const option = options[i];
      console.log(`Testing option: ${option}`);
      
      // Click the option
      await page.locator('.MuiMenuItem-root').nth(i).click();
      await page.waitForTimeout(300);
      
      // Take screenshot with option selected
      await page.screenshot({ 
        path: `tests/screenshots/epg-category-option-${i}-${option.replace(/\s+/g, '-')}.png`,
        fullPage: true 
      });
      
      // Verify the selection
      const selectedText = await categoryDropdown.textContent();
      console.log(`Selected text: ${selectedText}`);
      
      // Re-open dropdown for next iteration (if not last)
      if (i < options.length - 1) {
        await categoryDropdown.click();
        await page.waitForTimeout(300);
      }
    }
    
    console.log('=== EPG CATEGORY DROPDOWN TEST COMPLETE ===');
  });
});