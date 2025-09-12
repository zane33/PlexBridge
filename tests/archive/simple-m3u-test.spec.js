const { test, expect } = require('@playwright/test');

test('Simple M3U Import Debug Test', async ({ page }) => {
  test.setTimeout(60000); // 1 minute

  // Capture all console messages
  page.on('console', (msg) => {
    console.log(`[BROWSER] ${msg.text()}`);
  });

  page.on('pageerror', (error) => {
    console.log(`[ERROR] ${error.message}`);
  });

  // Navigate to PlexBridge
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Navigate to Stream Manager
  await page.click('[data-testid="nav-streams"]');
  await page.waitForLoadState('networkidle');

  // Open M3U Import Dialog
  await page.click('[data-testid="import-m3u-button"]');
  await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible({ timeout: 10000 });

  // Enter M3U URL
  const testM3uUrl = 'https://iptv-org.github.io/iptv/index.m3u';
  const urlInput = page.locator('[data-testid="import-dialog"] [data-testid="import-url-input"] input');
  await urlInput.fill(testM3uUrl);

  // Start parsing
  console.log('Starting M3U parsing...');
  await page.click('[data-testid="parse-channels-button"]');

  // Wait for completion or timeout
  await page.waitForTimeout(30000); // 30 seconds

  // Check final state
  const channelRows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
  console.log(`Final result: ${channelRows} channels found`);

  if (channelRows > 0) {
    console.log('SUCCESS: Channels appeared!');
  } else {
    console.log('FAILED: No channels appeared');
  }
});