const { test, expect } = require('@playwright/test');

test.describe('EPG Manager Category Investigation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the EPG Manager
    await page.goto('http://192.168.4.56:3000');
    
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle');
    
    // Navigate to EPG section
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
  });

  test('EPG Manager comprehensive investigation', async ({ page }) => {
    console.log('=== EPG MANAGER CATEGORY INVESTIGATION ===');
    
    // 1. Take initial screenshot of EPG Manager page
    await page.screenshot({ 
      path: 'tests/screenshots/epg-investigation-initial.png',
      fullPage: true 
    });
    console.log('Screenshot taken: EPG Manager initial view');
    
    // 2. Check if EPG Sources table exists and analyze structure
    const epgTable = page.locator('table').first();
    if (await epgTable.isVisible()) {
      console.log('EPG Sources table found');
      
      // Get table headers to check for Category column
      const headers = await page.locator('table thead th').allTextContents();
      console.log('Table headers:', headers);
      
      // Get all table rows to check EPG sources
      const rows = await page.locator('table tbody tr').count();
      console.log('Number of EPG sources:', rows);
      
      // For each row, get the data
      for (let i = 0; i < rows && i < 5; i++) { // Limit to first 5 for investigation
        const row = page.locator('table tbody tr').nth(i);
        const cells = await row.locator('td').allTextContents();
        console.log(`Row ${i + 1}:`, cells);
      }
    } else {
      console.log('EPG Sources table not found or not visible');
    }
    
    // 3. Check API endpoint for EPG sources
    const apiResponse = await page.request.get('http://192.168.4.56:3000/api/epg/sources');
    const epgSources = await apiResponse.json();
    console.log('API Response - EPG Sources:', epgSources);
    
    // 4. Test Add EPG Source dialog
    console.log('Testing Add EPG Source dialog...');
    
    // Look for add button (try multiple selectors)
    const addButton = page.locator('[data-testid="add-epg-source-button"]');
    const addButtonGeneric = page.locator('button:has-text("Add"), button:has-text("Add EPG"), button:has-text("Add Source")');
    const fabButton = page.locator('[data-testid="add-epg-fab"]');
    
    let addButtonFound = false;
    
    if (await addButton.isVisible()) {
      await addButton.click();
      addButtonFound = true;
      console.log('Clicked Add EPG Source button (data-testid)');
    } else if (await addButtonGeneric.first().isVisible()) {
      await addButtonGeneric.first().click();
      addButtonFound = true;
      console.log('Clicked Add button (generic selector)');
    } else if (await fabButton.isVisible()) {
      await fabButton.click();
      addButtonFound = true;
      console.log('Clicked Add EPG FAB button');
    } else {
      console.log('No Add button found - checking page content...');
      const pageContent = await page.textContent('body');
      console.log('Page contains "Add":', pageContent.includes('Add'));
      console.log('Page contains "EPG":', pageContent.includes('EPG'));
    }
    
    if (addButtonFound) {
      // Wait for dialog to open
      await page.waitForTimeout(1000);
      
      // Take screenshot of dialog
      await page.screenshot({ 
        path: 'tests/screenshots/epg-add-dialog.png',
        fullPage: true 
      });
      console.log('Screenshot taken: Add EPG Source dialog');
      
      // Check for category dropdown in dialog
      const categoryDropdown = page.locator('[data-testid="category-select"]');
      const categorySelect = page.locator('select[name*="category"], select[id*="category"]');
      const materialUISelect = page.locator('.MuiSelect-root:has([aria-label*="category"]), .MuiSelect-root:has([name*="category"])');
      
      if (await categoryDropdown.isVisible()) {
        console.log('Category dropdown found (data-testid)');
        await categoryDropdown.click();
        const options = await page.locator('.MuiMenuItem-root').allTextContents();
        console.log('Category options:', options);
      } else if (await categorySelect.isVisible()) {
        console.log('Category select found (name/id selector)');
        const options = await categorySelect.locator('option').allTextContents();
        console.log('Category options:', options);
      } else if (await materialUISelect.isVisible()) {
        console.log('Category select found (Material-UI)');
        await materialUISelect.click();
        await page.waitForTimeout(500);
        const options = await page.locator('.MuiMenuItem-root').allTextContents();
        console.log('Category options:', options);
      } else {
        console.log('No category dropdown found in dialog');
        
        // Check all form elements in dialog
        const formElements = await page.locator('dialog input, dialog select, dialog textarea').count();
        console.log('Form elements in dialog:', formElements);
        
        if (formElements > 0) {
          for (let i = 0; i < formElements; i++) {
            const element = page.locator('dialog input, dialog select, dialog textarea').nth(i);
            const tagName = await element.evaluate(el => el.tagName);
            const name = await element.getAttribute('name') || 'no-name';
            const placeholder = await element.getAttribute('placeholder') || 'no-placeholder';
            console.log(`Form element ${i}: ${tagName}, name: ${name}, placeholder: ${placeholder}`);
          }
        }
      }
      
      // Close dialog
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // 5. Test editing existing EPG source if any exist
    console.log('Testing Edit EPG Source...');
    
    const editButtons = page.locator('[data-testid="edit-epg-button"], button:has-text("Edit")');
    const editButtonCount = await editButtons.count();
    
    if (editButtonCount > 0) {
      await editButtons.first().click();
      await page.waitForTimeout(1000);
      
      // Take screenshot of edit dialog
      await page.screenshot({ 
        path: 'tests/screenshots/epg-edit-dialog.png',
        fullPage: true 
      });
      console.log('Screenshot taken: Edit EPG Source dialog');
      
      // Check for category dropdown in edit dialog
      const editCategoryDropdown = page.locator('[data-testid="category-select"]');
      const editCategorySelect = page.locator('select[name*="category"], select[id*="category"]');
      
      if (await editCategoryDropdown.isVisible()) {
        console.log('Category dropdown found in edit dialog');
        await editCategoryDropdown.click();
        const options = await page.locator('.MuiMenuItem-root').allTextContents();
        console.log('Edit dialog category options:', options);
      } else if (await editCategorySelect.isVisible()) {
        console.log('Category select found in edit dialog');
        const options = await editCategorySelect.locator('option').allTextContents();
        console.log('Edit dialog category options:', options);
      } else {
        console.log('No category dropdown found in edit dialog');
      }
      
      // Close dialog
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      console.log('No edit buttons found');
    }
    
    // 6. Take final screenshot
    await page.screenshot({ 
      path: 'tests/screenshots/epg-investigation-final.png',
      fullPage: true 
    });
    console.log('Screenshot taken: EPG Manager final view');
    
    console.log('=== EPG INVESTIGATION COMPLETE ===');
  });
  
  test('Mobile viewport EPG investigation', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    console.log('=== MOBILE EPG INVESTIGATION ===');
    
    // Take mobile screenshot
    await page.screenshot({ 
      path: 'tests/screenshots/epg-mobile-view.png',
      fullPage: true 
    });
    console.log('Screenshot taken: EPG Manager mobile view');
    
    // Check if mobile menu needs to be opened
    const mobileMenu = page.locator('[data-testid="mobile-menu-button"]');
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
      await page.waitForTimeout(500);
    }
    
    // Navigate to EPG
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ 
      path: 'tests/screenshots/epg-mobile-content.png',
      fullPage: true 
    });
    console.log('Screenshot taken: EPG Manager mobile content');
    
    console.log('=== MOBILE EPG INVESTIGATION COMPLETE ===');
  });
});