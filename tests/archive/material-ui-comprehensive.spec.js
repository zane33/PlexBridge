const { test, expect } = require('@playwright/test');

test.describe('Material-UI Components - Comprehensive Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle Material-UI dialogs correctly', async ({ page }) => {
    // Test stream dialog
    await page.click('[data-testid="nav-streams"]');
    await page.click('[data-testid="add-stream-button"]');
    
    // Dialog should be visible with proper Material-UI structure
    const dialog = page.locator('[data-testid="stream-dialog"]');
    await expect(dialog).toBeVisible();
    
    // Check Material-UI dialog structure
    await expect(dialog.locator('.MuiDialog-paper')).toBeVisible();
    await expect(dialog.locator('.MuiDialogTitle-root')).toBeVisible();
    await expect(dialog.locator('.MuiDialogContent-root')).toBeVisible();
    await expect(dialog.locator('.MuiDialogActions-root')).toBeVisible();
    
    // Test dialog backdrop click behavior
    await page.click('.MuiBackdrop-root', { position: { x: 10, y: 10 } });
    
    // Dialog should remain open during operations (backdrop click disabled)
    await expect(dialog).toBeVisible();
    
    // Close with cancel button
    await page.click('[data-testid="cancel-stream-button"]');
    await expect(dialog).not.toBeVisible();
  });

  test('should handle Material-UI pagination correctly', async ({ page }) => {
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Check if pagination is present
    const pagination = page.locator('.MuiTablePagination-root');
    
    if (await pagination.isVisible({ timeout: 5000 })) {
      // Test rows per page selector
      const rowsPerPageSelect = pagination.locator('.MuiTablePagination-select');
      await expect(rowsPerPageSelect).toBeVisible();
      
      // Click rows per page dropdown
      await rowsPerPageSelect.click();
      
      // Should show Material-UI menu with options
      await expect(page.locator('.MuiMenu-root')).toBeVisible();
      
      // Select 25 rows per page if available
      const option25 = page.locator('li[data-value="25"]');
      if (await option25.isVisible()) {
        await option25.click();
        await page.waitForTimeout(1000);
        
        // Verify selection
        const selectValue = await rowsPerPageSelect.textContent();
        expect(selectValue).toBe('25');
      } else {
        // Close menu if option not available
        await page.keyboard.press('Escape');
      }
      
      // Test pagination navigation buttons
      const toolbar = pagination.locator('.MuiTablePagination-toolbar');
      await expect(toolbar).toBeVisible();
      
      const nextButton = pagination.locator('.MuiTablePagination-actions button[aria-label="Go to next page"]');
      const prevButton = pagination.locator('.MuiTablePagination-actions button[aria-label="Go to previous page"]');
      
      await expect(nextButton).toBeVisible();
      await expect(prevButton).toBeVisible();
      
      // Test navigation if enabled
      if (await nextButton.isEnabled()) {
        await nextButton.click();
        await page.waitForTimeout(1000);
        
        // Should enable previous button
        await expect(prevButton).toBeEnabled();
        
        // Go back
        await prevButton.click();
      }
    } else {
      console.log('No pagination present - likely empty or small dataset');
    }
  });

  test('should handle Material-UI form controls correctly', async ({ page }) => {
    await page.click('[data-testid="nav-streams"]');
    await page.click('[data-testid="add-stream-button"]');
    
    // Test TextField components
    const nameField = page.locator('[data-testid="stream-name-input"]');
    const urlField = page.locator('[data-testid="stream-url-input"]');
    
    // Check Material-UI TextField structure
    await expect(nameField.locator('input')).toBeVisible();
    await expect(urlField.locator('input')).toBeVisible();
    
    // Test field validation states
    await nameField.fill('');
    await urlField.fill('');
    
    // Try to save to trigger validation
    await page.click('[data-testid="save-stream-button"]');
    
    // Should show Material-UI error states
    const nameFieldContainer = nameField.locator('..');
    const urlFieldContainer = urlField.locator('..');
    
    // Check for error class or helper text
    await expect(nameFieldContainer.locator('.Mui-error, .MuiFormHelperText-root')).toBeVisible();
    await expect(urlFieldContainer.locator('.Mui-error, .MuiFormHelperText-root')).toBeVisible();
    
    // Fill valid data and verify error states clear
    await nameField.fill('Test Stream');
    await urlField.fill('https://example.com/test.m3u8');
    
    // Error states should clear
    await page.waitForTimeout(500);
    
    await page.click('[data-testid="cancel-stream-button"]');
  });

  test('should handle Material-UI Select components correctly', async ({ page }) => {
    await page.click('[data-testid="nav-streams"]');
    await page.click('[data-testid="add-stream-button"]');
    
    // Find Select components
    const typeSelect = page.locator('.MuiSelect-root').first();
    
    if (await typeSelect.isVisible()) {
      // Click to open select
      await typeSelect.click();
      
      // Should open Material-UI menu
      await expect(page.locator('.MuiMenu-root')).toBeVisible();
      
      // Check menu items
      const menuItems = page.locator('.MuiMenuItem-root');
      const itemCount = await menuItems.count();
      expect(itemCount).toBeGreaterThan(0);
      
      // Select first item
      await menuItems.first().click();
      
      // Menu should close
      await expect(page.locator('.MuiMenu-root')).not.toBeVisible();
      
      // Value should be selected
      const selectedValue = await typeSelect.textContent();
      expect(selectedValue.trim()).toBeTruthy();
    }
    
    await page.click('[data-testid="cancel-stream-button"]');
  });

  test('should handle Material-UI Switches correctly', async ({ page }) => {
    await page.click('[data-testid="nav-streams"]');
    await page.click('[data-testid="add-stream-button"]');
    
    // Find Switch components
    const switchElements = page.locator('.MuiSwitch-root');
    const switchCount = await switchElements.count();
    
    if (switchCount > 0) {
      for (let i = 0; i < switchCount; i++) {
        const switchElement = switchElements.nth(i);
        const input = switchElement.locator('input');
        
        // Check initial state
        const initialState = await input.isChecked();
        
        // Click to toggle
        await switchElement.click();
        await page.waitForTimeout(200);
        
        // Verify state changed
        const newState = await input.isChecked();
        expect(newState).not.toBe(initialState);
        
        // Toggle back
        await switchElement.click();
        await page.waitForTimeout(200);
        
        // Should return to original state
        const finalState = await input.isChecked();
        expect(finalState).toBe(initialState);
      }
    }
    
    await page.click('[data-testid="cancel-stream-button"]');
  });

  test('should handle Material-UI Checkboxes correctly', async ({ page }) => {
    await page.click('[data-testid="nav-streams"]');
    
    // Wait for streams table
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    // Find checkbox components in table
    const headerCheckbox = page.locator('thead .MuiCheckbox-root input');
    const rowCheckboxes = page.locator('tbody .MuiCheckbox-root input');
    
    if (await headerCheckbox.isVisible()) {
      // Test header checkbox (select all)
      const initialState = await headerCheckbox.isChecked();
      
      await headerCheckbox.click();
      await page.waitForTimeout(500);
      
      // All row checkboxes should match header state
      const rowCount = await rowCheckboxes.count();
      if (rowCount > 0) {
        for (let i = 0; i < rowCount; i++) {
          const rowCheckbox = rowCheckboxes.nth(i);
          const rowState = await rowCheckbox.isChecked();
          expect(rowState).not.toBe(initialState);
        }
      }
      
      // Test individual checkbox
      if (rowCount > 0) {
        const firstRowCheckbox = rowCheckboxes.first();
        await firstRowCheckbox.click();
        await page.waitForTimeout(200);
        
        // Header should show indeterminate state if partially selected
        const headerParent = headerCheckbox.locator('..');
        // Material-UI uses .MuiCheckbox-indeterminate class
        // or aria-checked="mixed" for indeterminate state
      }
    }
  });

  test('should handle Material-UI Snackbar notifications correctly', async ({ page }) => {
    await page.click('[data-testid="nav-streams"]');
    await page.click('[data-testid="add-stream-button"]');
    
    // Fill valid data
    await page.fill('[data-testid="stream-name-input"]', 'Test Notification');
    await page.fill('[data-testid="stream-url-input"]', 'https://example.com/test.m3u8');
    
    // Select a channel if available
    const channelSelect = page.locator('[role="combobox"]:near(text="Channel")');
    if (await channelSelect.isVisible()) {
      await channelSelect.click();
      const firstOption = page.locator('li[role="option"]').first();
      if (await firstOption.isVisible()) {
        await firstOption.click();
      }
    }
    
    // Save to trigger notification
    await page.click('[data-testid="save-stream-button"]');
    
    // Should show Material-UI Snackbar
    const snackbar = page.locator('.MuiSnackbar-root, .SnackbarContainer-root');
    if (await snackbar.isVisible({ timeout: 5000 })) {
      // Check snackbar content
      await expect(snackbar).toContainText(/success|created|error/i);
      
      // Test snackbar auto-hide or manual close
      const closeButton = snackbar.locator('button[aria-label*="close"i]');
      if (await closeButton.isVisible()) {
        await closeButton.click();
        await expect(snackbar).not.toBeVisible();
      } else {
        // Wait for auto-hide
        await expect(snackbar).not.toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('should handle Material-UI Accordion components correctly', async ({ page }) => {
    await page.click('[data-testid="nav-streams"]');
    await page.click('[data-testid="add-stream-button"]');
    
    // Find Accordion components
    const accordions = page.locator('.MuiAccordion-root');
    const accordionCount = await accordions.count();
    
    if (accordionCount > 0) {
      for (let i = 0; i < accordionCount; i++) {
        const accordion = accordions.nth(i);
        const summary = accordion.locator('.MuiAccordionSummary-root');
        const details = accordion.locator('.MuiAccordionDetails-root');
        
        // Check initial state (usually collapsed)
        const initialExpanded = await accordion.getAttribute('aria-expanded');
        
        // Click to expand/collapse
        await summary.click();
        await page.waitForTimeout(300); // Animation time
        
        // Check if state changed
        const newExpanded = await accordion.getAttribute('aria-expanded');
        expect(newExpanded).not.toBe(initialExpanded);
        
        // If expanded, details should be visible
        if (newExpanded === 'true') {
          await expect(details).toBeVisible();
        }
        
        // Click again to toggle back
        await summary.click();
        await page.waitForTimeout(300);
        
        const finalExpanded = await accordion.getAttribute('aria-expanded');
        expect(finalExpanded).toBe(initialExpanded);
      }
    }
    
    await page.click('[data-testid="cancel-stream-button"]');
  });

  test('should handle Material-UI Table components correctly', async ({ page }) => {
    await page.click('[data-testid="nav-streams"]');
    
    // Wait for table to load
    await page.waitForSelector('.MuiTable-root', { timeout: 10000 });
    
    const table = page.locator('.MuiTable-root');
    await expect(table).toBeVisible();
    
    // Check Material-UI table structure
    await expect(table.locator('.MuiTableHead-root')).toBeVisible();
    const tableBody = table.locator('.MuiTableBody-root');
    
    if (await tableBody.isVisible()) {
      const rows = tableBody.locator('.MuiTableRow-root');
      const rowCount = await rows.count();
      
      if (rowCount > 0) {
        // Test table row interactions
        const firstRow = rows.first();
        
        // Hover should add hover class
        await firstRow.hover();
        
        // Test table cell interactions
        const cells = firstRow.locator('.MuiTableCell-root');
        const cellCount = await cells.count();
        expect(cellCount).toBeGreaterThan(0);
        
        // Check for action buttons in cells
        const actionButtons = firstRow.locator('button');
        const buttonCount = await actionButtons.count();
        
        if (buttonCount > 0) {
          // Test tooltip on action buttons
          const firstButton = actionButtons.first();
          await firstButton.hover();
          
          // Material-UI tooltip should appear
          const tooltip = page.locator('.MuiTooltip-tooltip');
          if (await tooltip.isVisible({ timeout: 2000 })) {
            const tooltipText = await tooltip.textContent();
            expect(tooltipText.trim()).toBeTruthy();
          }
        }
      }
    }
  });

  test('should handle Material-UI responsive design correctly', async ({ page }) => {
    // Test desktop view
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Navigation should be in sidebar
    const desktopNav = page.locator('[data-testid="nav-dashboard"]');
    await expect(desktopNav).toBeVisible();
    
    // Test tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    
    // Navigation should still be visible or in drawer
    const tabletNav = page.locator('[data-testid="nav-dashboard"], [data-testid="mobile-menu-button"]');
    await expect(tabletNav).toBeVisible();
    
    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    // Should show mobile menu button
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
      
      // Mobile drawer should open
      const drawer = page.locator('.MuiDrawer-root');
      await expect(drawer).toBeVisible();
      
      // Navigation items should be in drawer
      await expect(drawer.locator('[data-testid="nav-dashboard"]')).toBeVisible();
      
      // Close drawer by clicking outside or close button
      await page.click('body', { position: { x: 300, y: 300 } });
    }
  });

  test('should handle Material-UI theming correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check if theme colors are applied
    const primaryElements = page.locator('.MuiButton-containedPrimary, .MuiChip-colorPrimary');
    
    if (await primaryElements.first().isVisible({ timeout: 5000 })) {
      const primaryElement = primaryElements.first();
      
      // Check computed styles
      const backgroundColor = await primaryElement.evaluate(el => 
        window.getComputedStyle(el).backgroundColor
      );
      
      // Should have a color (not transparent)
      expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(backgroundColor).not.toBe('transparent');
    }
    
    // Check for consistent spacing using Material-UI theme
    const buttons = page.locator('.MuiButton-root');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 1) {
      // Buttons should have consistent styling
      const firstButton = buttons.first();
      const secondButton = buttons.nth(1);
      
      const firstPadding = await firstButton.evaluate(el => 
        window.getComputedStyle(el).padding
      );
      const secondPadding = await secondButton.evaluate(el => 
        window.getComputedStyle(el).padding
      );
      
      // Same button variants should have same padding
      const firstVariant = await firstButton.getAttribute('class');
      const secondVariant = await secondButton.getAttribute('class');
      
      if (firstVariant === secondVariant) {
        expect(firstPadding).toBe(secondPadding);
      }
    }
  });

  test('should handle Material-UI focus management correctly', async ({ page }) => {
    await page.click('[data-testid="nav-streams"]');
    await page.click('[data-testid="add-stream-button"]');
    
    // Dialog should focus on first focusable element
    const dialog = page.locator('[data-testid="stream-dialog"]');
    await expect(dialog).toBeVisible();
    
    // First input should be focused
    const firstInput = dialog.locator('input').first();
    await expect(firstInput).toBeFocused();
    
    // Test tab navigation
    await page.keyboard.press('Tab');
    
    // Should move to next focusable element
    const focusedElement = page.locator(':focus');
    const focusedTag = await focusedElement.evaluate(el => el.tagName);
    expect(['INPUT', 'BUTTON', 'SELECT'].includes(focusedTag)).toBeTruthy();
    
    // Test escape to close
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    
    // Focus should return to trigger button
    const addButton = page.locator('[data-testid="add-stream-button"]');
    await expect(addButton).toBeFocused();
  });

  test('should handle Material-UI loading states correctly', async ({ page }) => {
    await page.click('[data-testid="nav-streams"]');
    
    // Look for loading indicators
    const loadingIndicators = [
      '.MuiCircularProgress-root',
      '.MuiLinearProgress-root', 
      '.MuiSkeleton-root',
      '[role="progressbar"]'
    ];
    
    let foundLoading = false;
    for (const selector of loadingIndicators) {
      if (await page.locator(selector).isVisible({ timeout: 2000 })) {
        foundLoading = true;
        console.log(`Found loading indicator: ${selector}`);
        break;
      }
    }
    
    // If found loading state, wait for it to complete
    if (foundLoading) {
      // Wait for loading to complete (with timeout)
      await page.waitForFunction(() => {
        const indicators = document.querySelectorAll('.MuiCircularProgress-root, .MuiLinearProgress-root, .MuiSkeleton-root');
        return indicators.length === 0;
      }, { timeout: 30000 });
    }
    
    // Content should be loaded
    await expect(page.locator('table, text=/no streams/i')).toBeVisible();
  });
});
