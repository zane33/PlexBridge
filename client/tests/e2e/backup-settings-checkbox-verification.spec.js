const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Backup Export Dialog - Settings Checkbox Verification', () => {
  test('Verify "Include Application Settings" checkbox is visible after rebuild', async ({ page }) => {
    console.log('\n=== BACKUP SETTINGS CHECKBOX VERIFICATION TEST ===\n');
    
    // Create screenshots directory if it doesn't exist
    const screenshotsDir = path.join(__dirname, '../screenshots/backup-verification');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    // Step 1: Navigate to the application
    console.log('Step 1: Navigating to localhost:3000...');
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Wait for the application to fully load
    await page.waitForTimeout(2000);
    
    // Take initial screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, '01-homepage.png'),
      fullPage: true
    });
    console.log('✓ Homepage loaded and screenshot captured');
    
    // Step 2: Navigate to Backup Manager
    console.log('\nStep 2: Navigating to Backup Manager...');
    
    // Try to find the backup navigation link - check both desktop and mobile
    const backupNavSelector = '[data-testid="nav-backup"], a[href="/backup"], button:has-text("Backup")';
    
    // Check if we need to open mobile menu first
    const isMobile = await page.viewportSize().width < 768;
    if (isMobile) {
      const mobileMenuButton = await page.locator('[data-testid="mobile-menu-button"], [aria-label="menu"]').first();
      if (await mobileMenuButton.isVisible()) {
        await mobileMenuButton.click();
        await page.waitForTimeout(500);
        console.log('✓ Mobile menu opened');
      }
    }
    
    // Look for backup navigation
    let backupNav = await page.locator(backupNavSelector).first();
    
    if (await backupNav.isVisible()) {
      await backupNav.click();
      console.log('✓ Clicked on Backup navigation');
    } else {
      // If not found in navigation, check if we're already on a page with backup options
      console.log('! Backup navigation not found, checking current page for backup functionality...');
    }
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Take screenshot of backup page
    await page.screenshot({
      path: path.join(screenshotsDir, '02-backup-page.png'),
      fullPage: true
    });
    console.log('✓ Backup page screenshot captured');
    
    // Step 3: Open Export Backup Dialog
    console.log('\nStep 3: Opening Export Backup Dialog...');
    
    // Look for export button with various possible selectors
    const exportButtonSelectors = [
      '[data-testid="export-backup-button"]',
      'button:has-text("Create Backup")',
      'button:has-text("Export Backup")',
      'button:has-text("Export")',
      '[aria-label="Export backup"]',
      '.MuiButton-root:has-text("Create Backup")',
      '.MuiButton-root:has-text("Export")'
    ];
    
    let exportButton = null;
    for (const selector of exportButtonSelectors) {
      const button = await page.locator(selector).first();
      if (await button.isVisible()) {
        exportButton = button;
        console.log(`✓ Found export button with selector: ${selector}`);
        break;
      }
    }
    
    if (!exportButton) {
      console.log('! Export button not found on main page');
      await page.screenshot({
        path: path.join(screenshotsDir, '03-no-export-button.png'),
        fullPage: true
      });
      throw new Error('Export backup button not found');
    }
    
    // Click the export button
    await exportButton.click();
    console.log('✓ Clicked Create Backup button');
    
    // Wait for dialog to appear
    await page.waitForTimeout(1500);
    
    // Step 4: Take screenshot of the complete dialog
    console.log('\nStep 4: Capturing Export Dialog Screenshot...');
    
    // Look for the dialog container
    const dialogSelectors = [
      '[data-testid="export-dialog"]',
      '.MuiDialog-root',
      '[role="dialog"]',
      '.MuiDialog-paper'
    ];
    
    let dialogElement = null;
    for (const selector of dialogSelectors) {
      const element = await page.locator(selector).first();
      if (await element.isVisible()) {
        dialogElement = element;
        console.log(`✓ Found dialog with selector: ${selector}`);
        break;
      }
    }
    
    if (!dialogElement) {
      await page.screenshot({
        path: path.join(screenshotsDir, '04-no-dialog.png'),
        fullPage: true
      });
      throw new Error('Export dialog not found');
    }
    
    // Take full page screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, '05-export-dialog-full.png'),
      fullPage: true
    });
    
    // Take focused screenshot of just the dialog
    await dialogElement.screenshot({
      path: path.join(screenshotsDir, '06-export-dialog-focused.png')
    });
    console.log('✓ Export dialog screenshots captured');
    
    // Step 5: Find and verify "Include Application Settings" checkbox
    console.log('\nStep 5: Verifying "Include Application Settings" checkbox...');
    
    // Look for the settings checkbox with various selectors
    const settingsCheckboxSelectors = [
      'input[type="checkbox"][name="includeSettings"]',
      'label:has-text("Include Application Settings") input[type="checkbox"]',
      'text="Include Application Settings" >> xpath=../input[@type="checkbox"]',
      'text="Include Application Settings" >> xpath=../..//input[@type="checkbox"]',
      ':text("Application Settings") >> xpath=../..//input[@type="checkbox"]'
    ];
    
    let settingsCheckbox = null;
    let settingsCheckboxFound = false;
    
    for (const selector of settingsCheckboxSelectors) {
      try {
        const checkbox = await page.locator(selector).first();
        if (await checkbox.count() > 0) {
          settingsCheckbox = checkbox;
          settingsCheckboxFound = true;
          console.log(`✓ Found settings checkbox with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!settingsCheckboxFound) {
      console.log('✗ "Include Application Settings" checkbox NOT FOUND');
      console.log('  This indicates the rebuild may not have resolved the issue.');
    } else {
      console.log('✓ "Include Application Settings" checkbox IS PRESENT!');
      console.log('  The rebuild successfully added the missing checkbox.');
    }
    
    // Step 6: Count and list ALL checkboxes
    console.log('\nStep 6: Counting all checkboxes in the dialog...');
    
    const allCheckboxes = await dialogElement.locator('input[type="checkbox"]').all();
    console.log(`\nTotal checkboxes found: ${allCheckboxes.length}`);
    
    const checkboxDetails = [];
    for (let i = 0; i < allCheckboxes.length; i++) {
      const checkbox = allCheckboxes[i];
      
      // Try to get the label text
      let labelText = '';
      
      // Method 1: Check for associated label
      const checkboxId = await checkbox.getAttribute('id');
      if (checkboxId) {
        const label = await page.locator(`label[for="${checkboxId}"]`).first();
        if (await label.count() > 0) {
          labelText = await label.textContent();
        }
      }
      
      // Method 2: Check for parent label
      if (!labelText) {
        const parentLabel = await checkbox.locator('xpath=ancestor::label').first();
        if (await parentLabel.count() > 0) {
          labelText = await parentLabel.textContent();
        }
      }
      
      // Method 3: Check for nearby text
      if (!labelText) {
        const nearbyText = await checkbox.locator('xpath=following-sibling::text() | preceding-sibling::text()').first();
        if (await nearbyText.count() > 0) {
          labelText = await nearbyText.textContent();
        }
      }
      
      // Method 4: Check name attribute
      const checkboxName = await checkbox.getAttribute('name') || 'unnamed';
      
      // Get checkbox state
      const isChecked = await checkbox.isChecked();
      const isDisabled = await checkbox.isDisabled();
      
      checkboxDetails.push({
        index: i + 1,
        name: checkboxName,
        label: labelText.trim() || 'No label found',
        checked: isChecked,
        disabled: isDisabled
      });
    }
    
    console.log('\nCheckbox Details:');
    console.log('─'.repeat(80));
    checkboxDetails.forEach(cb => {
      console.log(`  ${cb.index}. ${cb.label}`);
      console.log(`     - Name: ${cb.name}`);
      console.log(`     - Checked: ${cb.checked}`);
      console.log(`     - Disabled: ${cb.disabled}`);
    });
    console.log('─'.repeat(80));
    
    // Step 7: Check default state of settings checkbox
    if (settingsCheckboxFound) {
      console.log('\nStep 7: Checking default state of settings checkbox...');
      
      const isChecked = await settingsCheckbox.isChecked();
      const isDisabled = await settingsCheckbox.isDisabled();
      
      console.log(`  - Initial state: ${isChecked ? 'CHECKED' : 'UNCHECKED'}`);
      console.log(`  - Expected: UNCHECKED (default should be false)`);
      console.log(`  - Disabled: ${isDisabled ? 'YES' : 'NO'}`);
      
      if (!isChecked) {
        console.log('  ✓ Checkbox correctly defaults to unchecked');
      } else {
        console.log('  ! Checkbox is checked by default (unexpected)');
      }
      
      // Step 8: Try toggling the checkbox
      console.log('\nStep 8: Testing checkbox toggle functionality...');
      
      if (!isDisabled) {
        // Click to check
        await settingsCheckbox.click();
        await page.waitForTimeout(500);
        
        const afterFirstClick = await settingsCheckbox.isChecked();
        console.log(`  After first click: ${afterFirstClick ? 'CHECKED' : 'UNCHECKED'}`);
        
        // Take screenshot with checkbox checked
        await dialogElement.screenshot({
          path: path.join(screenshotsDir, '07-checkbox-checked.png')
        });
        
        // Click to uncheck
        await settingsCheckbox.click();
        await page.waitForTimeout(500);
        
        const afterSecondClick = await settingsCheckbox.isChecked();
        console.log(`  After second click: ${afterSecondClick ? 'CHECKED' : 'UNCHECKED'}`);
        
        // Take screenshot with checkbox unchecked
        await dialogElement.screenshot({
          path: path.join(screenshotsDir, '08-checkbox-unchecked.png')
        });
        
        if (afterFirstClick === true && afterSecondClick === false) {
          console.log('  ✓ Checkbox toggle works correctly!');
        } else {
          console.log('  ! Checkbox toggle behavior unexpected');
        }
      } else {
        console.log('  ! Checkbox is disabled, cannot test toggle');
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    
    if (settingsCheckboxFound) {
      console.log('✅ SUCCESS: "Include Application Settings" checkbox is NOW VISIBLE!');
      console.log('   The frontend rebuild has successfully resolved the issue.');
      console.log(`   Total checkboxes in dialog: ${allCheckboxes.length}`);
      
      // List all checkbox labels found
      console.log('\n   Checkboxes found:');
      checkboxDetails.forEach(cb => {
        if (cb.label !== 'No label found') {
          console.log(`   • ${cb.label}`);
        }
      });
    } else {
      console.log('❌ FAILURE: "Include Application Settings" checkbox is STILL MISSING');
      console.log('   The rebuild did not resolve the issue.');
      console.log(`   Only ${allCheckboxes.length} checkbox(es) found in the dialog.`);
      
      if (allCheckboxes.length > 0) {
        console.log('\n   Checkboxes that were found:');
        checkboxDetails.forEach(cb => {
          if (cb.label !== 'No label found') {
            console.log(`   • ${cb.label}`);
          }
        });
      }
    }
    
    console.log('\nScreenshots saved to:', screenshotsDir);
    console.log('='.repeat(80));
    
    // Assert for test pass/fail
    expect(settingsCheckboxFound).toBe(true);
  });
});