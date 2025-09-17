const { test, expect } = require('@playwright/test');

test.describe('FFmpeg Profile Editor Testing', () => {
  test('should test profile editor and Apply to all functionality', async ({ page }) => {
    // Navigate to FFmpeg Profiles
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    await page.click('text="FFmpeg Profiles"');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/editor-01-profiles-page.png',
      fullPage: true
    });

    // Try to access the profile editor by clicking the gear icon on Default Profile
    console.log('Looking for gear/settings icon on Default Profile...');

    // Try different selectors for the gear icon
    const gearIcon = page.locator('[class*="card"]:has-text("Default Profile")').locator('button').last();
    const gearCount = await gearIcon.count();
    console.log(`Found ${gearCount} button(s) on Default Profile card`);

    if (gearCount > 0) {
      console.log('Clicking gear icon on Default Profile');
      await gearIcon.click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/editor-02-after-gear-click.png',
        fullPage: true
      });

      // Look for profile editor dialog or menu
      const dialog = page.locator('[role="dialog"]').or(page.locator('.MuiDialog-root')).or(page.locator('[class*="modal"]'));
      const dialogCount = await dialog.count();
      console.log(`Found ${dialogCount} dialog(s) after clicking gear`);

      if (dialogCount > 0) {
        await page.screenshot({
          path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/editor-03-profile-editor-dialog.png',
          fullPage: true
        });

        // Look for Apply to all buttons
        const applyToAllButtons = page.locator('button:has-text("Apply to all")').or(
          page.locator('button:has-text("Apply All")')
        );
        const applyToAllCount = await applyToAllButtons.count();
        console.log(`Found ${applyToAllCount} "Apply to all" button(s) in editor`);

        // Check for FFmpeg arguments in the editor
        const textareas = page.locator('textarea');
        const textareaCount = await textareas.count();
        console.log(`Found ${textareaCount} textarea(s) in editor`);

        for (let i = 0; i < textareaCount; i++) {
          const value = await textareas.nth(i).inputValue();
          if (value.includes('-hide_banner') || value.includes('-c:v copy') || value.includes('pipe:1')) {
            console.log(`\nFFmpeg arguments in textarea ${i}:`);
            console.log(value);

            // Verify key components
            console.log('Key components check:');
            console.log(`  -hide_banner: ${value.includes('-hide_banner')}`);
            console.log(`  -loglevel error: ${value.includes('-loglevel error')}`);
            console.log(`  -c:v copy: ${value.includes('-c:v copy')}`);
            console.log(`  -c:a copy: ${value.includes('-c:a copy')}`);
            console.log(`  pipe:1: ${value.includes('pipe:1')}`);
            console.log(`  -reconnect 1: ${value.includes('-reconnect 1')}`);
            console.log(`  -mpegts_copyts 1: ${value.includes('-mpegts_copyts 1')}`);
            console.log(`  -max_muxing_queue_size 9999: ${value.includes('-max_muxing_queue_size 9999')}`);
          }
        }

        await page.screenshot({
          path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/editor-04-ffmpeg-args-visible.png',
          fullPage: true
        });
      }
    }

    // Also try clicking on other profile cards to see their editors
    const profileCards = ['Maximum Compatibility', 'Optimized Streaming'];

    for (const profileName of profileCards) {
      console.log(`\nTesting ${profileName} profile...`);

      const profileGear = page.locator(`[class*="card"]:has-text("${profileName}")`).locator('button').last();
      const profileGearCount = await profileGear.count();

      if (profileGearCount > 0) {
        console.log(`Clicking gear on ${profileName}`);
        await profileGear.click();
        await page.waitForTimeout(2000);

        await page.screenshot({
          path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/editor-05-${profileName.toLowerCase().replace(' ', '-')}-editor.png`,
          fullPage: true
        });

        // Check for Apply to all buttons in this profile editor
        const applyButtons = page.locator('button:has-text("Apply to all")');
        const applyCount = await applyButtons.count();
        console.log(`"Apply to all" buttons in ${profileName}: ${applyCount}`);

        // Close the dialog if open
        const closeButton = page.locator('button:has-text("Cancel")').or(page.locator('button:has-text("Close")'));
        if (await closeButton.count() > 0) {
          await closeButton.first().click();
          await page.waitForTimeout(1000);
        }
      }
    }

    // Test the TEST profile card to see if it has editor capabilities
    console.log('\nTesting TEST profile...');
    const testGear = page.locator('[class*="card"]:has-text("TEST")').locator('button').last();
    const testGearCount = await testGear.count();

    if (testGearCount > 0) {
      console.log('Clicking gear on TEST profile');
      await testGear.click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/editor-06-test-profile-editor.png',
        fullPage: true
      });
    }

    // Final screenshot
    await page.screenshot({
      path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/editor-07-final-state.png',
      fullPage: true
    });
  });
});