const { test, expect } = require('@playwright/test');

test.describe('Backup Import - Final Test', () => {
  test('should successfully import backup file end-to-end', async ({ page }) => {
    console.log('🧪 Starting backup import end-to-end test...');

    // Navigate to the application
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Take screenshot of initial state
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/backup-import-final-01-homepage.png' });

    // Navigate to the backup page
    await page.click('[data-testid="nav-backup"]');
    await page.waitForSelector('[data-testid="backup-page"]');
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/backup-import-final-02-backup-page.png' });

    // Click Import Backup button
    await page.click('[data-testid="import-backup-button"]');
    await page.waitForSelector('[data-testid="import-dialog"]');
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/backup-import-final-03-import-dialog.png' });

    // Create test backup file content
    const backupContent = {
      "version": "2.1.0",
      "timestamp": "2025-09-17T22:15:00.000Z",
      "includesSettings": true,
      "includesPasswords": false,
      "includesEpgData": false,
      "includesLogs": false,
      "includesFFmpegProfiles": true,
      "data": {
        "channels": [
          {
            "id": "test-import-channel-1",
            "name": "Test Import Channel",
            "number": 1000,
            "enabled": 1,
            "logo": "https://example.com/logo.png",
            "epg_id": "test.import.channel",
            "created_at": "2025-09-17T22:15:00.000Z",
            "updated_at": "2025-09-17T22:15:00.000Z"
          }
        ],
        "streams": [
          {
            "id": "test-import-stream-1",
            "channel_id": "test-import-channel-1",
            "name": "Test Import Stream",
            "url": "https://test-import.example.com/stream.m3u8",
            "type": "hls",
            "backup_urls": [],
            "auth_username": null,
            "auth_password": null,
            "headers": {},
            "protocol_options": {},
            "enabled": 1,
            "created_at": "2025-09-17T22:15:00.000Z",
            "updated_at": "2025-09-17T22:15:00.000Z"
          }
        ],
        "epgSources": [
          {
            "id": "test-import-epg-1",
            "name": "Test Import EPG",
            "url": "https://test-import.example.com/epg.xml",
            "refresh_interval": "2h",
            "enabled": 1,
            "last_refresh": null,
            "created_at": "2025-09-17T22:15:00.000Z",
            "updated_at": "2025-09-17T22:15:00.000Z",
            "last_error": null,
            "last_success": null,
            "category": "News"
          }
        ],
        "settings": {
          "test.import.setting": "test_import_value"
        },
        "ffmpegProfiles": [
          {
            "id": "test-import-profile-1",
            "name": "Test Import Profile",
            "description": "Test profile for import",
            "is_default": false,
            "is_system": false,
            "created_at": "2025-09-17T22:15:00.000Z",
            "updated_at": "2025-09-17T22:15:00.000Z",
            "clients": {
              "web_browser": {
                "ffmpeg_args": "-c:v copy -c:a copy",
                "hls_args": "-hls_time 10"
              }
            }
          }
        ]
      },
      "metadata": {
        "totalChannels": 1,
        "totalStreams": 1,
        "totalEpgSources": 1,
        "totalSettings": 1,
        "totalFFmpegProfiles": 1,
        "totalEpgChannels": 0,
        "totalEpgPrograms": 0,
        "totalLogs": 0,
        "backupSizeMB": 0.01
      }
    };

    // Upload the backup file using file input
    const fileContent = JSON.stringify(backupContent, null, 2);
    const dataTransfer = await page.evaluateHandle((data) => {
      const dt = new DataTransfer();
      const file = new File([data], 'test-backup.json', { type: 'application/json' });
      dt.items.add(file);
      return dt;
    }, fileContent);

    await page.locator('#backup-file-input').setInputFiles([{
      name: 'test-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(fileContent)
    }]);

    // Wait for validation to complete
    await page.waitForSelector('[data-testid="validation-results"]', { timeout: 10000 });
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/backup-import-final-04-validation-complete.png' });

    // Verify validation shows success
    const validationResult = await page.locator('[data-testid="validation-success"]');
    await expect(validationResult).toBeVisible();

    // Verify import options are visible
    const importOptions = await page.locator('[data-testid="import-options"]');
    await expect(importOptions).toBeVisible();

    // Configure import options (keep defaults)
    // The channels, streams, epgSources, settings, ffmpegProfiles should be checked by default

    // Click import button
    const importButton = await page.locator('[data-testid="import-button"]');
    await expect(importButton).toBeVisible();
    await expect(importButton).toBeEnabled();

    // Listen for network requests to verify API call
    const importRequest = page.waitForResponse(response =>
      response.url().includes('/api/backup/import') && response.request().method() === 'POST'
    );

    await importButton.click();

    // Wait for import request to complete
    const response = await importRequest;
    console.log('📡 Import API Response Status:', response.status());

    // Verify successful response
    expect(response.status()).toBe(200);

    // Wait for import completion message
    await page.waitForSelector('[data-testid="import-success"]', { timeout: 15000 });
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/backup-import-final-05-import-complete.png' });

    // Verify success message is displayed
    const successMessage = await page.locator('[data-testid="import-success"]');
    await expect(successMessage).toBeVisible();

    // Verify import results are displayed
    const importResults = await page.locator('[data-testid="import-results"]');
    await expect(importResults).toBeVisible();

    // Close the import dialog
    await page.click('[data-testid="close-import-dialog"]');

    // Verify the imported data by navigating to channels page
    await page.click('[data-testid="nav-channels"]');
    await page.waitForSelector('[data-testid="channels-table"]');
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/backup-import-final-06-channels-page.png' });

    // Verify the imported channel appears in the table
    const importedChannel = await page.locator('table tbody tr:has-text("Test Import Channel")');
    await expect(importedChannel).toBeVisible();

    // Navigate to streams page and verify imported stream
    await page.click('[data-testid="nav-streams"]');
    await page.waitForSelector('[data-testid="streams-table"]');
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/backup-import-final-07-streams-page.png' });

    const importedStream = await page.locator('table tbody tr:has-text("Test Import Stream")');
    await expect(importedStream).toBeVisible();

    // Navigate to EPG page and verify imported EPG source
    await page.click('[data-testid="nav-epg"]');
    await page.waitForSelector('[data-testid="epg-sources-table"]');
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/backup-import-final-08-epg-page.png' });

    const importedEpgSource = await page.locator('table tbody tr:has-text("Test Import EPG")');
    await expect(importedEpgSource).toBeVisible();

    console.log('✅ Backup import end-to-end test completed successfully!');
  });

  test('should handle backup import validation errors gracefully', async ({ page }) => {
    console.log('🧪 Testing backup import error handling...');

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Navigate to backup page
    await page.click('[data-testid="nav-backup"]');
    await page.click('[data-testid="import-backup-button"]');
    await page.waitForSelector('[data-testid="import-dialog"]');

    // Upload invalid backup file
    const invalidBackupContent = {
      "invalid": "backup",
      "missing": "required_fields"
    };

    const fileContent = JSON.stringify(invalidBackupContent, null, 2);
    await page.locator('#backup-file-input').setInputFiles([{
      name: 'invalid-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(fileContent)
    }]);

    // Wait for validation to complete
    await page.waitForSelector('[data-testid="validation-results"]', { timeout: 10000 });
    await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/backup-import-final-09-validation-error.png' });

    // Verify validation shows error
    const validationError = await page.locator('[data-testid="validation-error"]');
    await expect(validationError).toBeVisible();

    // Verify import button is disabled for invalid backup
    const importButton = await page.locator('[data-testid="import-button"]');
    await expect(importButton).not.toBeVisible(); // Should not be visible for invalid backup

    console.log('✅ Error handling test completed successfully!');
  });
});