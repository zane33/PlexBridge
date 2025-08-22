const { test, expect } = require('@playwright/test');

test.describe('Backup Export Dialog Verification', () => {
  test('Verify Include Application Settings checkbox in export dialog', async ({ page }) => {
    console.log('\n=== Starting Backup Export Dialog Verification Test ===\n');

    // Step 1: Navigate to localhost:3000
    console.log('Step 1: Navigating to localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Take initial screenshot
    await page.screenshot({ 
      path: 'tests/screenshots/export-dialog-01-homepage.png', 
      fullPage: true 
    });
    console.log('Screenshot saved: export-dialog-01-homepage.png');

    // Step 2: Navigate to backup manager
    console.log('\nStep 2: Navigating to backup manager...');
    
    // Check if mobile layout
    const isMobileLayout = await page.locator('[data-testid="mobile-menu-button"]').isVisible();
    console.log(`Layout detected: ${isMobileLayout ? 'Mobile' : 'Desktop'}`);
    
    if (isMobileLayout) {
      console.log('Opening mobile menu...');
      await page.click('[data-testid="mobile-menu-button"]');
      await page.waitForTimeout(500);
    }
    
    // Look for backup navigation item (try different selector patterns)
    let backupNavFound = false;
    const backupSelectors = [
      '[data-testid="nav-backup"]',
      'text="Backup"',
      'a[href*="backup"]',
      '*[role="button"]:has-text("Backup")',
    ];
    
    for (const selector of backupSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible()) {
          console.log(`✓ Found backup navigation with selector: ${selector}`);
          await element.click();
          backupNavFound = true;
          break;
        }
      } catch (error) {
        console.log(`Selector ${selector} not found: ${error.message}`);
      }
    }
    
    if (!backupNavFound) {
      // Try navigating directly to backup URL
      console.log('Backup navigation not found, trying direct URL navigation...');
      await page.goto('http://localhost:3000/backup', { waitUntil: 'networkidle' });
    }
    
    await page.waitForLoadState('networkidle');
    
    // Take screenshot after navigation
    await page.screenshot({ 
      path: 'tests/screenshots/export-dialog-02-backup-page.png', 
      fullPage: true 
    });
    console.log('Screenshot saved: export-dialog-02-backup-page.png');

    // Step 3: Open the export backup dialog
    console.log('\nStep 3: Opening export backup dialog...');
    
    // Look for Create Backup button using multiple selector patterns
    const createBackupSelectors = [
      'button:has-text("Create Backup")',
      '[data-testid="create-backup-button"]',
      'button:has-text("Export")',
      'button[aria-label*="Export"]',
      'button[aria-label*="Backup"]'
    ];
    
    let exportButtonFound = false;
    for (const selector of createBackupSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible()) {
          console.log(`✓ Found create backup button with selector: ${selector}`);
          await element.click();
          exportButtonFound = true;
          break;
        }
      } catch (error) {
        console.log(`Selector ${selector} not found: ${error.message}`);
      }
    }
    
    if (!exportButtonFound) {
      throw new Error('Could not find Create Backup button');
    }
    
    // Wait for dialog to open
    await page.waitForTimeout(2000);
    
    // Step 4: Take screenshot of the dialog
    console.log('\nStep 4: Taking screenshot of export dialog...');
    await page.screenshot({ 
      path: 'tests/screenshots/export-dialog-03-dialog-opened.png', 
      fullPage: true 
    });
    console.log('Screenshot saved: export-dialog-03-dialog-opened.png');

    // Step 5: Check for the dialog and verify it's visible
    console.log('\nStep 5: Verifying export dialog is visible...');
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    console.log('✓ Export dialog is visible');

    // Step 6: Count and list all checkboxes in the dialog
    console.log('\nStep 6: Analyzing checkboxes in the dialog...');
    
    // Find all checkboxes within the dialog
    const checkboxes = dialog.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    console.log(`Found ${checkboxCount} checkboxes in the dialog`);
    
    const checkboxDetails = [];
    
    for (let i = 0; i < checkboxCount; i++) {
      const checkbox = checkboxes.nth(i);
      
      // Get the checkbox's associated label text
      const checkboxId = await checkbox.getAttribute('id');
      const checkboxName = await checkbox.getAttribute('name');
      const isChecked = await checkbox.isChecked();
      
      // Find associated label text (try multiple methods)
      let labelText = '';
      
      // Method 1: Find label by 'for' attribute
      if (checkboxId) {
        const label = dialog.locator(`label[for="${checkboxId}"]`);
        if (await label.count() > 0) {
          labelText = await label.textContent();
        }
      }
      
      // Method 2: Find parent FormControlLabel and get its text
      if (!labelText) {
        const parentLabel = checkbox.locator('xpath=ancestor::*[contains(@class, "MuiFormControlLabel")]').first();
        if (await parentLabel.count() > 0) {
          labelText = await parentLabel.textContent();
        }
      }
      
      // Method 3: Get text from nearest text node
      if (!labelText) {
        const nearestText = checkbox.locator('xpath=following-sibling::*[1]');
        if (await nearestText.count() > 0) {
          labelText = await nearestText.textContent();
        }
      }
      
      checkboxDetails.push({
        index: i + 1,
        id: checkboxId,
        name: checkboxName,
        checked: isChecked,
        labelText: labelText?.trim() || 'No label found'
      });
      
      console.log(`Checkbox ${i + 1}:`);
      console.log(`  - ID: ${checkboxId || 'No ID'}`);
      console.log(`  - Name: ${checkboxName || 'No name'}`);
      console.log(`  - Checked: ${isChecked}`);
      console.log(`  - Label: ${labelText?.trim() || 'No label found'}`);
    }

    // Step 7: Specifically check for "Include Application Settings" checkbox
    console.log('\nStep 7: Checking for "Include Application Settings" checkbox...');
    
    let settingsCheckboxFound = false;
    let settingsCheckboxDetails = null;
    
    // Look for the specific checkbox using various patterns
    const settingsCheckboxSelectors = [
      'input[type="checkbox"] + * :text("Include Application Settings")',
      '*:has-text("Include Application Settings") input[type="checkbox"]',
      'label:has-text("Include Application Settings") input[type="checkbox"]',
      '[data-testid*="settings"] input[type="checkbox"]',
      'input[type="checkbox"][name*="settings"]',
      'input[type="checkbox"][id*="settings"]'
    ];
    
    for (const selector of settingsCheckboxSelectors) {
      try {
        const element = dialog.locator(selector).first();
        if (await element.count() > 0 && await element.isVisible()) {
          console.log(`✓ Found settings checkbox with selector: ${selector}`);
          settingsCheckboxFound = true;
          settingsCheckboxDetails = {
            selector: selector,
            isChecked: await element.isChecked(),
            isVisible: await element.isVisible(),
            isEnabled: await element.isEnabled()
          };
          break;
        }
      } catch (error) {
        console.log(`Selector ${selector} not found: ${error.message}`);
      }
    }
    
    // Alternative approach: search through all checkboxes for the one with "settings" in the label
    if (!settingsCheckboxFound) {
      console.log('Direct selector search failed, checking checkbox labels...');
      for (const checkbox of checkboxDetails) {
        if (checkbox.labelText.toLowerCase().includes('application settings') || 
            checkbox.labelText.toLowerCase().includes('include application settings')) {
          settingsCheckboxFound = true;
          settingsCheckboxDetails = {
            fromList: true,
            index: checkbox.index,
            labelText: checkbox.labelText,
            isChecked: checkbox.checked
          };
          console.log(`✓ Found settings checkbox in list at index ${checkbox.index}`);
          break;
        }
      }
    }

    // Step 8: Take a detailed screenshot highlighting the Optional Data section
    console.log('\nStep 8: Taking detailed screenshot of Optional Data section...');
    
    // Look for "Optional Data" section
    const optionalDataSection = dialog.locator('text="Optional Data"');
    if (await optionalDataSection.count() > 0) {
      console.log('✓ Found Optional Data section');
      
      // Scroll the section into view if needed
      await optionalDataSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }
    
    await page.screenshot({ 
      path: 'tests/screenshots/export-dialog-04-optional-data-section.png', 
      fullPage: true 
    });
    console.log('Screenshot saved: export-dialog-04-optional-data-section.png');

    // Step 9: Create comprehensive test summary
    console.log('\nStep 9: Creating test summary...');
    
    const testSummary = {
      timestamp: new Date().toISOString(),
      testResults: {
        dialogOpened: await dialog.isVisible(),
        totalCheckboxes: checkboxCount,
        settingsCheckboxFound: settingsCheckboxFound,
        settingsCheckboxDetails: settingsCheckboxDetails,
        allCheckboxes: checkboxDetails
      },
      screenshots: [
        'export-dialog-01-homepage.png',
        'export-dialog-02-backup-page.png', 
        'export-dialog-03-dialog-opened.png',
        'export-dialog-04-optional-data-section.png'
      ]
    };

    console.log('\n=== EXPORT DIALOG VERIFICATION TEST SUMMARY ===');
    console.log(JSON.stringify(testSummary, null, 2));

    // Step 10: Assertions and final verification
    console.log('\nStep 10: Final verification and assertions...');
    
    // Core assertions
    expect(testSummary.testResults.dialogOpened).toBe(true);
    expect(testSummary.testResults.totalCheckboxes).toBeGreaterThan(0);
    
    if (settingsCheckboxFound) {
      console.log('\n✅ SUCCESS: "Include Application Settings" checkbox was found!');
      console.log('Checkbox details:', settingsCheckboxDetails);
    } else {
      console.log('\n❌ ISSUE: "Include Application Settings" checkbox was NOT found!');
      console.log('This indicates the frontend rebuild may not have resolved the issue.');
    }
    
    console.log('\n📊 Checkbox Summary:');
    console.log(`  Total checkboxes found: ${checkboxCount}`);
    console.log(`  Settings checkbox present: ${settingsCheckboxFound ? 'YES' : 'NO'}`);
    
    console.log('\n📋 All Checkboxes Found:');
    checkboxDetails.forEach((checkbox, index) => {
      console.log(`  ${index + 1}. ${checkbox.labelText} ${checkbox.checked ? '(checked)' : '(unchecked)'}`);
    });
    
    // Close the dialog
    console.log('\nClosing dialog...');
    const cancelButton = dialog.locator('button:has-text("Cancel")').first();
    if (await cancelButton.isVisible()) {
      await cancelButton.click();
    } else {
      await page.keyboard.press('Escape');
    }
    
    await page.waitForTimeout(1000);
    
    console.log('\n✅ Backup Export Dialog Verification Test Completed!\n');
    
    // Final assertion to ensure we found the settings checkbox
    expect(settingsCheckboxFound).toBe(true);
  });
});