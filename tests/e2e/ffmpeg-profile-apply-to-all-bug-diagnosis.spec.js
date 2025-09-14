const { test, expect } = require('@playwright/test');

test.describe('FFmpeg Profile Apply to All Bug Diagnosis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Critical Bug: Apply to All causing data loss', async ({ page }) => {
    // Step 1: Navigate to FFmpeg profiles section
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('text="FFmpeg Profiles"');
    await page.click('text="FFmpeg Profiles"');

    // Wait for profiles to load
    await page.waitForSelector('[data-testid="add-profile-button"]', { timeout: 10000 });

    // Step 2: Create a test profile with multiple client configurations
    await page.click('[data-testid="add-profile-button"]');
    await page.waitForSelector('[data-testid="profile-dialog"]');

    // Fill basic profile information
    await page.fill('[data-testid="profile-name-input"]', 'Test Data Loss Profile');
    await page.fill('[data-testid="profile-description-input"]', 'Testing Apply to All bug');

    // Add multiple client configurations with different settings
    const clientTypes = [
      { type: 'web_browser', label: 'Web Browser' },
      { type: 'android_mobile', label: 'Android Mobile' },
      { type: 'android_tv', label: 'Android TV' },
      { type: 'ios_mobile', label: 'iOS Mobile' },
      { type: 'apple_tv', label: 'Apple TV' }
    ];

    // Add all client types with unique configurations
    for (let i = 0; i < clientTypes.length; i++) {
      const client = clientTypes[i];

      // Add client type
      await page.click('[data-testid="add-client-type-select"]');
      await page.click(`[data-value="${client.type}"]`);

      // Configure unique FFmpeg args for this client
      const clientSection = page.locator(`[data-testid="client-config-${client.type}"]`);
      await clientSection.locator('[data-testid="ffmpeg-args-input"]').fill(
        `-hide_banner -loglevel error -i [URL] -c:v copy -c:a copy -f mpegts pipe:1 # ${client.label} config`
      );
      await clientSection.locator('[data-testid="hls-args-input"]').fill(
        `-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto # ${client.label} HLS`
      );
    }

    // Save the profile with all configurations
    await page.click('[data-testid="save-profile-button"]');
    await page.waitForSelector('[data-testid="profile-dialog"]', { state: 'hidden' });

    // Step 3: Verify all client configurations were saved
    await page.reload();
    await page.waitForSelector('text="Test Data Loss Profile"');

    // Find and edit the profile
    const profileCard = page.locator('text="Test Data Loss Profile"').locator('..').locator('..');
    await profileCard.locator('[data-testid="edit-profile-button"]').click();
    await page.waitForSelector('[data-testid="profile-dialog"]');

    // Verify all 5 client configurations exist
    const clientConfigSections = await page.locator('[data-testid^="client-config-"]').count();
    console.log(`Before Apply to All: Found ${clientConfigSections} client configurations`);

    // Capture the current state of all client configurations
    const beforeState = {};
    for (const client of clientTypes) {
      const clientSection = page.locator(`[data-testid="client-config-${client.type}"]`);
      if (await clientSection.count() > 0) {
        const ffmpegArgs = await clientSection.locator('[data-testid="ffmpeg-args-input"]').inputValue();
        const hlsArgs = await clientSection.locator('[data-testid="hls-args-input"]').inputValue();
        beforeState[client.type] = { ffmpegArgs, hlsArgs };
        console.log(`BEFORE - ${client.label}: FFmpeg="${ffmpegArgs.substring(0, 50)}...", HLS="${hlsArgs.substring(0, 30)}..."`);
      }
    }

    // Step 4: Use "Apply to All" from web_browser configuration
    const webBrowserSection = page.locator('[data-testid="client-config-web_browser"]');

    // Modify web browser configuration first
    await webBrowserSection.locator('[data-testid="ffmpeg-args-input"]').fill(
      '-hide_banner -loglevel error -i [URL] -c:v libx264 -c:a aac -f mpegts pipe:1 # APPLIED TO ALL'
    );
    await webBrowserSection.locator('[data-testid="hls-args-input"]').fill(
      '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto # APPLIED TO ALL'
    );

    // Click "Apply to All" button
    await webBrowserSection.locator('[data-testid="apply-to-all-button"]').click();

    // Confirm in the dialog
    await page.waitForSelector('[data-testid="apply-to-all-confirm-dialog"]');
    await page.click('[data-testid="confirm-apply-to-all-button"]');
    await page.waitForSelector('[data-testid="apply-to-all-confirm-dialog"]', { state: 'hidden' });

    // Step 5: Verify UI shows applied settings to all clients (this should work)
    console.log('\nAFTER Apply to All - UI State:');
    for (const client of clientTypes) {
      const clientSection = page.locator(`[data-testid="client-config-${client.type}"]`);
      if (await clientSection.count() > 0) {
        const ffmpegArgs = await clientSection.locator('[data-testid="ffmpeg-args-input"]').inputValue();
        const hlsArgs = await clientSection.locator('[data-testid="hls-args-input"]').inputValue();
        console.log(`AFTER UI - ${client.label}: FFmpeg="${ffmpegArgs.substring(0, 50)}...", HLS="${hlsArgs.substring(0, 30)}..."`);

        // Verify UI shows the applied settings
        expect(ffmpegArgs).toContain('APPLIED TO ALL');
        expect(hlsArgs).toContain('APPLIED TO ALL');
      }
    }

    // Step 6: Save the profile (this is where the bug likely occurs)
    await page.click('[data-testid="save-profile-button"]');
    await page.waitForSelector('[data-testid="profile-dialog"]', { state: 'hidden' });

    // Wait for save to complete
    await page.waitForTimeout(2000);

    // Step 7: Verify data integrity by reopening the profile
    await page.reload();
    await page.waitForSelector('text="Test Data Loss Profile"');

    const profileCardAfterSave = page.locator('text="Test Data Loss Profile"').locator('..').locator('..');
    await profileCardAfterSave.locator('[data-testid="edit-profile-button"]').click();
    await page.waitForSelector('[data-testid="profile-dialog"]');

    // Step 8: CHECK FOR DATA LOSS - Count remaining client configurations
    const clientConfigSectionsAfter = await page.locator('[data-testid^="client-config-"]').count();
    console.log(`\nAfter database save: Found ${clientConfigSectionsAfter} client configurations`);

    // This is where the bug manifests - configurations are lost
    if (clientConfigSectionsAfter < clientConfigSections) {
      console.log(`🚨 BUG CONFIRMED: Lost ${clientConfigSections - clientConfigSectionsAfter} client configurations!`);
    }

    // Capture the post-save state
    console.log('\nAFTER Database Save - Actual State:');
    const afterState = {};
    for (const client of clientTypes) {
      const clientSection = page.locator(`[data-testid="client-config-${client.type}"]`);
      if (await clientSection.count() > 0) {
        const ffmpegArgs = await clientSection.locator('[data-testid="ffmpeg-args-input"]').inputValue();
        const hlsArgs = await clientSection.locator('[data-testid="hls-args-input"]').inputValue();
        afterState[client.type] = { ffmpegArgs, hlsArgs };
        console.log(`AFTER DB - ${client.label}: FFmpeg="${ffmpegArgs.substring(0, 50)}...", HLS="${hlsArgs.substring(0, 30)}..."`);
      } else {
        console.log(`AFTER DB - ${client.label}: ❌ CONFIGURATION LOST!`);
      }
    }

    // Step 9: Document the bug details
    console.log('\n=== BUG ANALYSIS ===');
    console.log(`Expected configurations: ${clientTypes.length}`);
    console.log(`Configurations before Apply to All: ${clientConfigSections}`);
    console.log(`Configurations after database save: ${clientConfigSectionsAfter}`);
    console.log(`Data loss: ${clientConfigSections > clientConfigSectionsAfter ? 'YES' : 'NO'}`);

    // The test should fail if we lose configurations
    expect(clientConfigSectionsAfter).toBe(clientConfigSections);

    // All configurations should contain the applied settings
    for (const client of clientTypes) {
      if (afterState[client.type]) {
        expect(afterState[client.type].ffmpegArgs).toContain('APPLIED TO ALL');
        expect(afterState[client.type].hlsArgs).toContain('APPLIED TO ALL');
      } else {
        throw new Error(`Configuration for ${client.label} was lost during Apply to All operation`);
      }
    }
  });

  test('Reproduce exact user scenario', async ({ page }) => {
    // Navigate to FFmpeg profiles
    await page.click('[data-testid="nav-settings"]');
    await page.click('text="FFmpeg Profiles"');
    await page.waitForSelector('[data-testid="add-profile-button"]');

    // Create profile as user described
    await page.click('[data-testid="add-profile-button"]');
    await page.waitForSelector('[data-testid="profile-dialog"]');

    await page.fill('[data-testid="profile-name-input"]', 'User Scenario Profile');

    // Add multiple client types
    const clientTypes = ['web_browser', 'android_mobile', 'android_tv'];

    for (const clientType of clientTypes) {
      await page.click('[data-testid="add-client-type-select"]');
      await page.click(`[data-value="${clientType}"]`);
    }

    // Configure different settings for each
    for (let i = 0; i < clientTypes.length; i++) {
      const clientType = clientTypes[i];
      const clientSection = page.locator(`[data-testid="client-config-${clientType}"]`);

      await clientSection.locator('[data-testid="ffmpeg-args-input"]').fill(
        `-hide_banner -loglevel error -i [URL] -preset ultrafast -c:v copy -c:a copy -f mpegts pipe:1 # Original ${clientType}`
      );
    }

    // Save initial profile
    await page.click('[data-testid="save-profile-button"]');
    await page.waitForSelector('[data-testid="profile-dialog"]', { state: 'hidden' });

    // Reopen for editing
    await page.reload();
    const profileCard = page.locator('text="User Scenario Profile"').locator('..').locator('..');
    await profileCard.locator('[data-testid="edit-profile-button"]').click();
    await page.waitForSelector('[data-testid="profile-dialog"]');

    // User clicks "Apply to All" on web_browser
    const webBrowserSection = page.locator('[data-testid="client-config-web_browser"]');
    await webBrowserSection.locator('[data-testid="apply-to-all-button"]').click();
    await page.waitForSelector('[data-testid="apply-to-all-confirm-dialog"]');
    await page.click('[data-testid="confirm-apply-to-all-button"]');

    // User clicks "Update Profile"
    await page.click('[data-testid="save-profile-button"]');
    await page.waitForSelector('[data-testid="profile-dialog"]', { state: 'hidden' });

    // User reopens profile - this is where they discover the data loss
    await page.reload();
    const profileCardAfter = page.locator('text="User Scenario Profile"').locator('..').locator('..');
    await profileCardAfter.locator('[data-testid="edit-profile-button"]').click();
    await page.waitForSelector('[data-testid="profile-dialog"]');

    // Check how many configurations remain
    const remainingConfigs = await page.locator('[data-testid^="client-config-"]').count();
    console.log(`User scenario result: ${remainingConfigs} configurations remain`);

    // User expects 3 configurations, likely finds only 1 (web_browser)
    expect(remainingConfigs).toBe(3); // This will likely fail, proving the bug
  });
});