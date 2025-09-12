const { test, expect } = require('@playwright/test');

test.describe('EPG Category Detailed Investigation', () => {
  test('Detailed analysis of Plex Category dropdown', async ({ page }) => {
    console.log('=== EPG CATEGORY DETAILED INVESTIGATION ===');
    
    // Navigate to EPG Manager
    await page.goto('http://192.168.4.56:3000');
    await page.waitForLoadState('networkidle');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    
    // Click Add Source button
    await page.click('button:has-text("Add Source")');
    await page.waitForTimeout(1000);
    
    // Take screenshot of dialog
    await page.screenshot({ 
      path: 'tests/screenshots/epg-category-dialog-analysis.png',
      fullPage: true 
    });
    
    console.log('Dialog opened, analyzing Plex Category field...');
    
    // Try different selectors to find the dropdown
    const selectors = [
      '.MuiSelect-root [role="combobox"]',
      '.MuiSelect-select[aria-expanded="false"]',
      'div:has-text("Plex Category") .MuiSelect-root',
      '[aria-labelledby]:has-text("Plex Category")',
      '.MuiFormControl-root:has([for*="category"]) .MuiSelect-select'
    ];
    
    let dropdownFound = false;
    let workingSelector = '';
    
    for (const selector of selectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        console.log(`Found dropdown with selector: ${selector}`);
        workingSelector = selector;
        dropdownFound = true;
        break;
      }
    }
    
    if (dropdownFound) {
      console.log(`Using selector: ${workingSelector}`);
      
      // Click the dropdown
      await page.locator(workingSelector).click();
      await page.waitForTimeout(1000);
      
      // Take screenshot with dropdown open
      await page.screenshot({ 
        path: 'tests/screenshots/epg-category-dropdown-opened.png',
        fullPage: true 
      });
      
      // Get all dropdown options
      const menuItems = page.locator('.MuiMenuItem-root');
      const itemCount = await menuItems.count();
      console.log(`Found ${itemCount} menu items`);
      
      const options = [];
      for (let i = 0; i < itemCount; i++) {
        const text = await menuItems.nth(i).textContent();
        options.push(text);
        console.log(`Option ${i}: ${text}`);
      }
      
      console.log('All category options:', options);
      
      // Test selecting each option
      for (let i = 0; i < itemCount && i < 6; i++) { // Test up to 6 options
        const optionText = options[i];
        console.log(`Testing selection of: ${optionText}`);
        
        // Click the option
        await menuItems.nth(i).click();
        await page.waitForTimeout(500);
        
        // Take screenshot with option selected
        await page.screenshot({ 
          path: `tests/screenshots/epg-category-selected-${i}-${optionText.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
          fullPage: true 
        });
        
        // Verify selection by checking the displayed value
        const selectedValue = await page.locator(workingSelector).textContent();
        console.log(`Selected value displayed: ${selectedValue}`);
        
        // Re-open dropdown for next iteration (if not last)
        if (i < itemCount - 1) {
          await page.locator(workingSelector).click();
          await page.waitForTimeout(500);
        }
      }
    } else {
      console.log('Dropdown not found with any selector. Analyzing form structure...');
      
      // Analyze the form structure
      const formElements = await page.locator('form input, form select, form [role="combobox"]').count();
      console.log(`Form contains ${formElements} form elements`);
      
      for (let i = 0; i < formElements; i++) {
        const element = page.locator('form input, form select, form [role="combobox"]').nth(i);
        const tagName = await element.evaluate(el => el.tagName.toLowerCase());
        const type = await element.getAttribute('type') || 'no-type';
        const name = await element.getAttribute('name') || 'no-name';
        const placeholder = await element.getAttribute('placeholder') || 'no-placeholder';
        const ariaLabel = await element.getAttribute('aria-label') || 'no-aria-label';
        
        console.log(`Form element ${i}: ${tagName}, type: ${type}, name: ${name}, placeholder: ${placeholder}, aria-label: ${ariaLabel}`);
      }
      
      // Look for any element containing "category"
      const categoryElements = await page.locator('*:has-text("Category")').count();
      console.log(`Found ${categoryElements} elements containing "Category"`);
      
      for (let i = 0; i < categoryElements && i < 3; i++) {
        const element = page.locator('*:has-text("Category")').nth(i);
        const tagName = await element.evaluate(el => el.tagName.toLowerCase());
        const text = await element.textContent();
        console.log(`Category element ${i}: ${tagName} - "${text}"`);
      }
    }
    
    console.log('=== EPG CATEGORY DETAILED INVESTIGATION COMPLETE ===');
  });
});