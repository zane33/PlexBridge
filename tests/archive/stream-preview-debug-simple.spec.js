const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Debug - Simple', () => {
  const testStreamUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const testStreamName = 'Test HLS Stream';

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Basic navigation and dialog opening', async ({ page }) => {
    console.log('Step 1: Check if homepage loads');
    await expect(page.locator('h1, h2, h3')).toBeVisible({ timeout: 10000 });

    console.log('Step 2: Navigate to Streams');
    // Wait for navigation to be available
    await page.waitForSelector('[data-testid="nav-streams"]', { timeout: 10000 });
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    console.log('Step 3: Check if Stream Manager page loads');
    await expect(page.locator('text="Stream Manager"')).toBeVisible({ timeout: 10000 });

    console.log('Step 4: Open Add Stream dialog');
    await page.waitForSelector('[data-testid="add-stream-button"]', { timeout: 10000 });
    await page.click('[data-testid="add-stream-button"]');
    
    console.log('Step 5: Check if dialog opens');
    await page.waitForSelector('.MuiDialog-root', { timeout: 10000 });
    const dialogVisible = await page.locator('.MuiDialog-root').isVisible();
    expect(dialogVisible).toBe(true);

    console.log('Step 6: Check if input fields are present');
    await expect(page.locator('[data-testid="stream-name-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="stream-url-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="save-stream-button"]')).toBeVisible();

    console.log('Step 7: Fill basic stream details');
    await page.fill('[data-testid="stream-name-input"] input', testStreamName);
    await page.fill('[data-testid="stream-url-input"] input', testStreamUrl);

    console.log('Step 8: Select a channel');
    // Wait for channels to load and select the first one
    await page.waitForTimeout(1000); // Give time for channels to load
    await page.click('.MuiFormControl-root:has(.MuiInputLabel-root:text("Channel")) .MuiSelect-select');
    await page.waitForSelector('.MuiMenuItem-root', { timeout: 5000 });
    await page.click('.MuiMenuItem-root:first-child');

    console.log('Step 9: Check if save button is enabled');
    const saveButton = page.locator('[data-testid="save-stream-button"]');
    await expect(saveButton).toBeEnabled();

    console.log('Test completed successfully - basic workflow is functional');
  });

  test('Test save stream action', async ({ page }) => {
    console.log('Navigate to streams and open dialog');
    await page.waitForSelector('[data-testid="nav-streams"]', { timeout: 10000 });
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    await page.waitForSelector('[data-testid="add-stream-button"]', { timeout: 10000 });
    await page.click('[data-testid="add-stream-button"]');
    await page.waitForSelector('.MuiDialog-root', { timeout: 10000 });

    console.log('Fill form and attempt save');
    await page.fill('[data-testid="stream-name-input"] input', testStreamName);
    await page.fill('[data-testid="stream-url-input"] input', testStreamUrl);
    
    console.log('Select a channel');
    await page.waitForTimeout(1000); // Give time for channels to load
    await page.click('.MuiFormControl-root:has(.MuiInputLabel-root:text("Channel")) .MuiSelect-select');
    await page.waitForSelector('.MuiMenuItem-root', { timeout: 5000 });
    await page.click('.MuiMenuItem-root:first-child');

    // Listen for network requests
    page.on('response', response => {
      console.log(`Response: ${response.status()} ${response.url()}`);
    });

    console.log('Click save button');
    await page.click('[data-testid="save-stream-button"]');
    
    // Wait for either success (dialog closes) or error
    try {
      await page.waitForFunction(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        return !dialog || getComputedStyle(dialog).display === 'none';
      }, { timeout: 15000 });
      console.log('Dialog closed - save likely succeeded');
    } catch (error) {
      console.log('Dialog did not close - checking for errors or loading state');
      
      // Check if save button is still in loading state
      const saveButtonText = await page.locator('[data-testid="save-stream-button"]').textContent();
      console.log(`Save button text: ${saveButtonText}`);
      
      // Check for any error messages
      const errorElements = await page.locator('.MuiAlert-root, .error, [data-testid*="error"]').count();
      console.log(`Error elements found: ${errorElements}`);
    }
  });
});