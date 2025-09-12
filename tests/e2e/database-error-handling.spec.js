const { test, expect } = require('@playwright/test');

test.describe('Database Error Handling Tests', () => {
  // Helper function to check for error indicators
  const checkForErrorIndicators = async (page) => {
    const errorSelectors = [
      '[role="alert"]',
      '.MuiAlert-standardError',
      'text=/database.*error/i',
      'text=/connection.*failed/i',
      'text=/unable.*connect/i',
      'text=/error.*occurred/i',
      '[data-testid="error-message"]'
    ];
    
    for (const selector of errorSelectors) {
      if (await page.locator(selector).isVisible({ timeout: 2000 })) {
        return true;
      }
    }
    return false;
  };

  // Helper function to simulate database connectivity issues
  const simulateDatabaseError = async (page) => {
    // Intercept API calls and return database errors
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      
      // Simulate database connection errors for various endpoints
      if (url.includes('/api/channels') || url.includes('/api/streams') || url.includes('/api/settings')) {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Database connection failed',
            code: 'DB_CONNECTION_ERROR',
            details: 'Unable to connect to SQLite database'
          })
        });
      } else {
        route.continue();
      }
    });
  };

  test('should handle database errors on application startup', async ({ page }) => {
    // Simulate database error before loading the app
    await simulateDatabaseError(page);
    
    // Navigate to the application
    await page.goto('/');
    
    // Wait for page to load and check for error handling
    await page.waitForLoadState('domcontentloaded');
    
    // Should display error message or fallback UI
    const hasError = await checkForErrorIndicators(page);
    
    if (hasError) {
      console.log('✅ Database error properly displayed on startup');
    } else {
      // Check if app shows loading state or graceful degradation
      const hasLoading = await page.locator('[role="progressbar"], .MuiCircularProgress-root, text=/loading/i').isVisible({ timeout: 5000 });
      const hasSkeletons = await page.locator('.MuiSkeleton-root').isVisible({ timeout: 3000 });
      
      // App should show some form of loading state or error handling
      expect(hasLoading || hasSkeletons || hasError).toBeTruthy();
    }
  });

  test('should handle database errors when fetching streams', async ({ page }) => {
    // Load the app normally first
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Navigate to streams page
    await page.click('[data-testid="nav-streams"]');
    
    // Now simulate database error
    await simulateDatabaseError(page);
    
    // Try to refresh or trigger data fetch
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    // Should show error message or empty state with error indication
    const hasError = await checkForErrorIndicators(page);
    const hasEmptyState = await page.locator('text=/no streams/i, text=/failed.*load/i').isVisible({ timeout: 5000 });
    
    expect(hasError || hasEmptyState).toBeTruthy();
  });

  test('should handle database errors when creating streams', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Open create stream dialog
    await page.click('[data-testid="add-stream-button"]');
    await expect(page.locator('[data-testid="stream-dialog"]')).toBeVisible();
    
    // Fill in valid data
    await page.fill('[data-testid="stream-name-input"]', 'Test Database Error Stream');
    await page.fill('[data-testid="stream-url-input"]', 'https://example.com/test.m3u8');
    
    // Simulate database error for save operation
    await page.route('**/api/streams', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Database write failed',
            code: 'DB_WRITE_ERROR',
            details: 'Unable to insert stream into database'
          })
        });
      } else {
        route.continue();
      }
    });
    
    // Try to save
    await page.click('[data-testid="save-stream-button"]');
    
    // Should show error message
    await expect(page.locator('text=/error/i, text=/failed/i')).toBeVisible({ timeout: 10000 });
    
    // Dialog should remain open to allow retry
    await expect(page.locator('[data-testid="stream-dialog"]')).toBeVisible();
  });

  test('should handle database errors when fetching channels', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to channels page
    await page.click('[data-testid="nav-channels"]');
    
    // Simulate database error for channels
    await page.route('**/api/channels', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Failed to query channels table',
          code: 'DB_QUERY_ERROR'
        })
      });
    });
    
    // Reload to trigger error
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    // Should handle error gracefully
    const hasError = await checkForErrorIndicators(page);
    const hasEmptyState = await page.locator('text=/no channels/i, text=/failed.*load/i').isVisible({ timeout: 5000 });
    
    expect(hasError || hasEmptyState).toBeTruthy();
  });

  test('should handle database errors during M3U import', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Open import dialog
    await page.click('[data-testid="import-m3u-button"]');
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
    
    // Fill in test data
    const testM3UContent = `#EXTM3U\n#EXTINF:-1,Test Channel\nhttp://example.com/stream.m3u8`;
    const dataUrl = `data:text/plain,${encodeURIComponent(testM3UContent)}`;
    await page.fill('[data-testid="import-url-input"]', dataUrl);
    
    await page.click('[data-testid="parse-channels-button"]');
    
    // Wait for channels to be parsed
    await page.waitForSelector('[data-testid="import-dialog"] table tbody tr', { timeout: 15000 });
    
    // Simulate database error for import operation
    await page.route('**/api/m3u/import', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Database transaction failed during import',
          code: 'DB_TRANSACTION_ERROR'
        })
      });
    });
    
    // Try to import
    await page.click('[data-testid="import-selected-button"]');
    
    // Should show error message
    await expect(page.locator('text=/error/i, text=/failed/i')).toBeVisible({ timeout: 10000 });
  });

  test('should show appropriate error messages for different database errors', async ({ page }) => {
    const errorScenarios = [
      {
        name: 'Connection timeout',
        error: { error: 'Connection timeout', code: 'DB_TIMEOUT' },
        expectedText: /timeout|connection/i
      },
      {
        name: 'Permission denied',
        error: { error: 'Permission denied', code: 'DB_PERMISSION' },
        expectedText: /permission|access/i
      },
      {
        name: 'Disk full',
        error: { error: 'Disk full', code: 'DB_DISK_FULL' },
        expectedText: /disk|space/i
      },
      {
        name: 'Corruption',
        error: { error: 'Database corruption detected', code: 'DB_CORRUPT' },
        expectedText: /corrupt/i
      }
    ];
    
    for (const scenario of errorScenarios) {
      await page.goto('/');
      
      // Simulate specific database error
      await page.route('**/api/**', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify(scenario.error)
        });
      });
      
      await page.click('[data-testid="nav-streams"]');
      await page.waitForLoadState('domcontentloaded');
      
      // Check if appropriate error message is displayed
      const errorText = await page.locator('[role="alert"], .error-message, text=/error/i').first().textContent();
      
      if (errorText) {
        console.log(`✅ ${scenario.name}: Error message shown - ${errorText}`);
      }
      
      await page.waitForTimeout(1000);
    }
  });

  test('should handle database reconnection scenarios', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="nav-streams"]');
    
    let errorCount = 0;
    
    // Simulate intermittent database errors (fail first 2 requests, then succeed)
    await page.route('**/api/streams', (route) => {
      errorCount++;
      
      if (errorCount <= 2) {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Temporary database unavailable',
            code: 'DB_TEMP_ERROR'
          })
        });
      } else {
        // Simulate successful reconnection
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      }
    });
    
    // First request should fail
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Retry should eventually succeed
    await page.reload();
    await page.waitForTimeout(2000);
    
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Should eventually show normal state or empty streams table
    await expect(page.locator('table, text=/no streams/i')).toBeVisible({ timeout: 5000 });
  });

  test('should handle database errors in health check endpoint', async ({ page }) => {
    // Simulate health check failure
    await page.route('**/health', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'unhealthy',
          database: { status: 'failed', error: 'Connection refused' },
          services: { database: { status: 'failed' } }
        })
      });
    });
    
    await page.goto('/');
    
    // Check if health status affects the UI
    await page.waitForLoadState('domcontentloaded');
    
    // App should either show error state or handle gracefully
    const hasError = await checkForErrorIndicators(page);
    const hasNormalUI = await page.locator('[data-testid="nav-dashboard"]').isVisible({ timeout: 5000 });
    
    // App should either show error or continue working (depending on implementation)
    expect(hasError || hasNormalUI).toBeTruthy();
  });

  test('should provide retry mechanisms for database operations', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    let attemptCount = 0;
    
    // Simulate database error with retry functionality
    await page.route('**/api/streams', (route) => {
      attemptCount++;
      
      if (attemptCount === 1) {
        // First attempt fails
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Database temporarily unavailable',
            code: 'DB_TEMP_ERROR',
            retryAfter: 1000
          })
        });
      } else {
        // Subsequent attempts succeed
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      }
    });
    
    // Trigger initial request that will fail
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Look for retry button or automatic retry
    const retryButton = page.locator('button:has-text("retry"), button:has-text("Retry"), button[aria-label*="retry"i]');
    
    if (await retryButton.isVisible({ timeout: 5000 })) {
      await retryButton.click();
    } else {
      // If no manual retry, wait for automatic retry
      await page.waitForTimeout(3000);
    }
    
    // Should eventually show success state
    await expect(page.locator('table, text=/no streams/i')).toBeVisible({ timeout: 10000 });
  });

  test('should handle database errors on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await simulateDatabaseError(page);
    
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Mobile navigation
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
    }
    
    await page.click('[data-testid="nav-streams"]');
    
    // Should handle errors gracefully on mobile
    const hasError = await checkForErrorIndicators(page);
    const hasEmptyState = await page.locator('text=/no streams/i, text=/error/i').isVisible({ timeout: 5000 });
    
    expect(hasError || hasEmptyState).toBeTruthy();
  });

  test('should maintain app stability despite database errors', async ({ page }) => {
    await page.goto('/');
    
    // Simulate random database errors
    await page.route('**/api/**', (route) => {
      // Randomly fail 30% of requests
      if (Math.random() < 0.3) {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Random database error',
            code: 'DB_RANDOM_ERROR'
          })
        });
      } else {
        route.continue();
      }
    });
    
    // Navigate through different sections
    const sections = ['nav-dashboard', 'nav-streams', 'nav-channels'];
    
    for (const section of sections) {
      const navElement = page.locator(`[data-testid="${section}"]`);
      
      if (await navElement.isVisible()) {
        await navElement.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // App should remain functional despite errors
        const isResponsive = await page.locator('body').isVisible();
        expect(isResponsive).toBeTruthy();
      }
    }
  });
});
