const { test, expect } = require('@playwright/test');

test.describe('EPG Category Options Investigation', () => {
  test('Extract all Plex Category dropdown options', async ({ page }) => {
    console.log('=== EPG CATEGORY OPTIONS INVESTIGATION ===');
    
    // Navigate to EPG Manager
    await page.goto('http://192.168.4.56:3000');
    await page.waitForLoadState('networkidle');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    
    // Click Add Source button
    await page.click('button:has-text("Add Source")');
    await page.waitForTimeout(1000);
    
    console.log('Dialog opened, targeting Plex Category dropdown...');
    
    // Target specifically the second dropdown (Plex Category) - nth(1)
    const categoryDropdown = page.locator('.MuiSelect-select[aria-expanded="false"]').nth(1);
    
    // Click the Plex Category dropdown
    await categoryDropdown.click();
    await page.waitForTimeout(1000);
    
    // Take screenshot with dropdown open
    await page.screenshot({ 
      path: 'tests/screenshots/epg-category-final-dropdown-open.png',
      fullPage: true 
    });
    
    // Get all dropdown options
    const menuItems = page.locator('.MuiMenuItem-root');
    const itemCount = await menuItems.count();
    console.log(`Found ${itemCount} category options`);
    
    const allOptions = [];
    for (let i = 0; i < itemCount; i++) {
      const text = await menuItems.nth(i).textContent();
      allOptions.push(text?.trim());
      console.log(`Category Option ${i + 1}: "${text?.trim()}"`);
    }
    
    console.log('\n=== ALL AVAILABLE CATEGORY OPTIONS ===');
    allOptions.forEach((option, index) => {
      console.log(`${index + 1}. ${option}`);
    });
    
    // Test selecting a few key options to verify they work
    const testOptions = [0, 1, 2]; // Test first 3 options
    
    for (const optionIndex of testOptions) {
      if (optionIndex < itemCount) {
        const optionText = allOptions[optionIndex];
        console.log(`\nTesting selection of option ${optionIndex + 1}: "${optionText}"`);
        
        // Click the option
        await menuItems.nth(optionIndex).click();
        await page.waitForTimeout(500);
        
        // Take screenshot with option selected
        await page.screenshot({ 
          path: `tests/screenshots/epg-category-option-${optionIndex + 1}-selected.png`,
          fullPage: true 
        });
        
        // Verify the selection
        const displayedValue = await categoryDropdown.textContent();
        console.log(`Displayed value after selection: "${displayedValue?.trim()}"`);
        
        // Re-open dropdown for next iteration (if not last)
        if (optionIndex !== testOptions[testOptions.length - 1]) {
          await categoryDropdown.click();
          await page.waitForTimeout(500);
        }
      }
    }
    
    console.log('\n=== CATEGORY OPTIONS INVESTIGATION COMPLETE ===');
  });
  
  test('Test editing existing EPG source categories', async ({ page }) => {
    console.log('=== TESTING EDIT EPG SOURCE CATEGORIES ===');
    
    // Navigate to EPG Manager
    await page.goto('http://192.168.4.56:3000');
    await page.waitForLoadState('networkidle');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    
    // Look for edit buttons in the table
    const editButtons = page.locator('button[aria-label*="edit"], button:has-text("Edit"), svg[data-testid="EditIcon"]').first();
    
    if (await editButtons.isVisible()) {
      console.log('Found edit button, clicking...');
      await editButtons.click();
      await page.waitForTimeout(1000);
      
      // Take screenshot of edit dialog
      await page.screenshot({ 
        path: 'tests/screenshots/epg-edit-dialog-categories.png',
        fullPage: true 
      });
      
      // Check for category dropdown in edit mode
      const editCategoryDropdown = page.locator('.MuiSelect-select').last();
      
      if (await editCategoryDropdown.isVisible()) {
        console.log('Found category dropdown in edit dialog');
        
        await editCategoryDropdown.click();
        await page.waitForTimeout(500);
        
        // Get options in edit mode
        const editMenuItems = page.locator('.MuiMenuItem-root');
        const editItemCount = await editMenuItems.count();
        console.log(`Edit dialog has ${editItemCount} category options`);
        
        for (let i = 0; i < editItemCount && i < 5; i++) {
          const text = await editMenuItems.nth(i).textContent();
          console.log(`Edit Option ${i + 1}: "${text?.trim()}"`);
        }
        
        // Take screenshot with edit dropdown open
        await page.screenshot({ 
          path: 'tests/screenshots/epg-edit-category-dropdown-open.png',
          fullPage: true 
        });
        
        // Close dropdown
        await page.keyboard.press('Escape');
      } else {
        console.log('No category dropdown found in edit dialog');
      }
      
      // Close edit dialog
      await page.keyboard.press('Escape');
    } else {
      console.log('No edit buttons found in EPG sources table');
    }
    
    console.log('=== EDIT EPG SOURCE CATEGORIES TEST COMPLETE ===');
  });
});