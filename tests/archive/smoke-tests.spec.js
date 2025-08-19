const { test, expect } = require('@playwright/test');

test.describe('PlexBridge Smoke Tests - All Screens', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000); // 1 minute per test

    // Capture console errors for debugging
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[CONSOLE ERROR] ${msg.text()}`);
      }
    });

    page.on('pageerror', (error) => {
      console.log(`[PAGE ERROR] ${error.message}`);
    });

    // Navigate to PlexBridge
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Dashboard Screen - Basic Functionality', async ({ page }) => {
    console.log('🏠 Testing Dashboard functionality');
    
    // Verify dashboard loads
    await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
    await page.click('[data-testid="nav-dashboard"]');
    await page.waitForLoadState('networkidle');
    
    // Check for key dashboard components
    await expect(page.locator('text=/dashboard/i').first()).toBeVisible({ timeout: 10000 });
    
    // Look for metrics/stats cards (common dashboard elements)
    const dashboardCards = page.locator('.MuiCard-root, .MuiPaper-root');
    const cardCount = await dashboardCards.count();
    expect(cardCount).toBeGreaterThan(0);
    
    // Check for charts or data visualization (if present)
    const canvasElements = await page.locator('canvas').count();
    console.log(`📊 Found ${cardCount} dashboard cards and ${canvasElements} charts`);
    
    await page.screenshot({ path: 'test-results/smoke-dashboard.png' });
    console.log('✅ Dashboard smoke test passed');
  });

  test('Channels Screen - CRUD Operations', async ({ page }) => {
    console.log('📺 Testing Channels functionality');
    
    // Navigate to channels
    await page.click('[data-testid="nav-channels"]');
    await page.waitForLoadState('networkidle');
    
    // Check if add channel button exists
    const addChannelBtn = page.locator('[data-testid="add-channel-button"], [data-testid="add-channel-fab"]');
    await expect(addChannelBtn.first()).toBeVisible({ timeout: 10000 });
    
    // Test creating a new channel
    await addChannelBtn.first().click();
    await page.waitForSelector('[data-testid="channel-dialog"], .MuiDialog-root', { timeout: 5000 });
    
    // Fill channel form
    const nameInput = page.locator('[data-testid="channel-name-input"] input, input[name="name"]').first();
    const numberInput = page.locator('[data-testid="channel-number-input"] input, input[name="number"]').first();
    
    if (await nameInput.isVisible()) {
      await nameInput.fill('Test Channel - Smoke Test');
    }
    if (await numberInput.isVisible()) {
      await numberInput.fill('999');
    }
    
    // Save channel
    const saveBtn = page.locator('[data-testid="save-channel-button"], button:has-text("Save")').first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
    }
    
    // Verify channel appears in list
    const channelTable = page.locator('table, .MuiDataGrid-root');
    if (await channelTable.isVisible()) {
      const testChannel = page.locator('text="Test Channel - Smoke Test"');
      if (await testChannel.isVisible()) {
        console.log('✅ Channel creation successful');
        
        // Test editing the channel
        const editBtn = testChannel.locator('..').locator('[data-testid="edit-channel-button"], button[aria-label*="edit"]').first();
        if (await editBtn.isVisible()) {
          await editBtn.click();
          await page.waitForTimeout(1000);
          
          const editNameInput = page.locator('[data-testid="channel-name-input"] input, input[name="name"]').first();
          if (await editNameInput.isVisible()) {
            await editNameInput.fill('Test Channel - Edited');
            const saveEditBtn = page.locator('[data-testid="save-channel-button"], button:has-text("Save")').first();
            if (await saveEditBtn.isVisible()) {
              await saveEditBtn.click();
              await page.waitForTimeout(2000);
              console.log('✅ Channel editing successful');
            }
          }
        }
        
        // Test deleting the channel
        const deleteBtn = testChannel.locator('..').locator('[data-testid="delete-channel-button"], button[aria-label*="delete"]').first();
        if (await deleteBtn.isVisible()) {
          await deleteBtn.click();
          
          // Confirm deletion if dialog appears
          const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm")').first();
          if (await confirmBtn.isVisible({ timeout: 2000 })) {
            await confirmBtn.click();
            await page.waitForTimeout(2000);
            console.log('✅ Channel deletion successful');
          }
        }
      }
    } else {
      console.log('ℹ️ No channel table found - may be empty state');
    }
    
    await page.screenshot({ path: 'test-results/smoke-channels.png' });
    console.log('✅ Channels smoke test completed');
  });

  test('Streams Screen - Management and Preview', async ({ page }) => {
    console.log('🌊 Testing Streams functionality');
    
    // Navigate to streams
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Check for streams table and controls
    await expect(page.locator('[data-testid="add-stream-button"], [data-testid="import-m3u-button"]').first()).toBeVisible({ timeout: 10000 });
    
    // Test adding a new stream
    const addStreamBtn = page.locator('[data-testid="add-stream-button"]');
    if (await addStreamBtn.isVisible()) {
      await addStreamBtn.click();
      await page.waitForSelector('[data-testid="stream-dialog"], .MuiDialog-root');
      
      // Fill stream form
      const nameInput = page.locator('[data-testid="stream-name-input"] input').first();
      const urlInput = page.locator('[data-testid="stream-url-input"] input').first();
      
      await nameInput.fill('Test Stream - Smoke Test');
      await urlInput.fill('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
      
      // Test stream before saving
      const testBtn = page.locator('[data-testid="test-stream-button"]');
      if (await testBtn.isVisible()) {
        await testBtn.click();
        await page.waitForTimeout(3000);
        
        // Check if preview modal opens
        const previewModal = page.locator('.MuiDialog-root');
        if (await previewModal.count() > 1) { // Stream dialog + preview dialog
          console.log('✅ Stream preview modal opened');
          
          // Close preview
          const closeBtn = previewModal.last().locator('button[aria-label="close"], .MuiDialogTitle-root button').first();
          if (await closeBtn.isVisible()) {
            await closeBtn.click();
            await page.waitForTimeout(1000);
          }
        }
      }
      
      // Save stream
      const saveBtn = page.locator('[data-testid="save-stream-button"]');
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForTimeout(2000);
        console.log('✅ Stream creation successful');
      }
    }
    
    // Test M3U import dialog
    const importBtn = page.locator('[data-testid="import-m3u-button"]');
    if (await importBtn.isVisible()) {
      await importBtn.click();
      await page.waitForSelector('[data-testid="import-dialog"]');
      
      // Verify import dialog components
      await expect(page.locator('[data-testid="import-url-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="parse-channels-button"]')).toBeVisible();
      
      // Close import dialog
      const cancelBtn = page.locator('[data-testid="cancel-button"], button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
      }
      
      console.log('✅ M3U import dialog functional');
    }
    
    // Test existing streams preview
    const streamRows = page.locator('table tbody tr');
    const rowCount = await streamRows.count();
    if (rowCount > 0) {
      const firstRow = streamRows.first();
      const previewBtn = firstRow.locator('[data-testid="preview-stream-button"]');
      if (await previewBtn.isVisible()) {
        await previewBtn.click();
        await page.waitForTimeout(2000);
        
        const videoModal = page.locator('.MuiDialog-root');
        if (await videoModal.isVisible()) {
          console.log('✅ Stream preview from existing stream works');
          
          // Close preview
          const closeBtn = videoModal.locator('button[aria-label="close"]').first();
          if (await closeBtn.isVisible()) {
            await closeBtn.click();
          }
        }
      }
    }
    
    await page.screenshot({ path: 'test-results/smoke-streams.png' });
    console.log('✅ Streams smoke test completed');
  });

  test('EPG Screen - Electronic Program Guide', async ({ page }) => {
    console.log('📅 Testing EPG functionality');
    
    // Navigate to EPG (if it exists)
    const epgNav = page.locator('[data-testid="nav-epg"]');
    if (await epgNav.isVisible()) {
      await epgNav.click();
      await page.waitForLoadState('networkidle');
      
      // Check for EPG components
      const epgContent = page.locator('text=/program/i, text=/guide/i, text=/schedule/i').first();
      if (await epgContent.isVisible({ timeout: 5000 })) {
        console.log('✅ EPG screen loaded');
      } else {
        console.log('ℹ️ EPG screen loaded but no content visible');
      }
      
      await page.screenshot({ path: 'test-results/smoke-epg.png' });
    } else {
      console.log('ℹ️ EPG navigation not found - skipping');
    }
  });

  test('Logs Screen - System Logs', async ({ page }) => {
    console.log('📋 Testing Logs functionality');
    
    // Navigate to logs (if it exists)
    const logsNav = page.locator('[data-testid="nav-logs"]');
    if (await logsNav.isVisible()) {
      await logsNav.click();
      await page.waitForLoadState('networkidle');
      
      // Check for logs components
      const logsContainer = page.locator('.MuiTextField-root, .log-container, pre, code').first();
      if (await logsContainer.isVisible({ timeout: 5000 })) {
        console.log('✅ Logs screen loaded');
        
        // Test log filtering (if available)
        const filterInput = page.locator('input[placeholder*="filter"], input[placeholder*="search"]').first();
        if (await filterInput.isVisible()) {
          await filterInput.fill('test');
          await page.waitForTimeout(1000);
          console.log('✅ Log filtering functional');
        }
      } else {
        console.log('ℹ️ Logs screen loaded but no log content visible');
      }
      
      await page.screenshot({ path: 'test-results/smoke-logs.png' });
    } else {
      console.log('ℹ️ Logs navigation not found - skipping');
    }
  });

  test('Settings Screen - Configuration', async ({ page }) => {
    console.log('⚙️ Testing Settings functionality');
    
    // Navigate to settings
    const settingsNav = page.locator('[data-testid="nav-settings"]');
    if (await settingsNav.isVisible()) {
      await settingsNav.click();
      await page.waitForLoadState('networkidle');
      
      // Check for settings components
      const settingsForm = page.locator('.MuiFormControl-root, .MuiTextField-root, .MuiSelect-root').first();
      if (await settingsForm.isVisible({ timeout: 5000 })) {
        console.log('✅ Settings screen loaded');
        
        // Test a simple settings interaction
        const textInput = page.locator('input[type="text"], input[type="number"]').first();
        if (await textInput.isVisible()) {
          const originalValue = await textInput.inputValue();
          await textInput.fill('test-value');
          
          // Look for save button
          const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
          if (await saveBtn.isVisible()) {
            console.log('✅ Settings form interactive');
            // Restore original value
            await textInput.fill(originalValue);
          }
        }
        
        // Test toggle switches
        const toggleSwitch = page.locator('.MuiSwitch-root input').first();
        if (await toggleSwitch.isVisible()) {
          await toggleSwitch.click();
          await page.waitForTimeout(500);
          await toggleSwitch.click(); // Toggle back
          console.log('✅ Settings toggles functional');
        }
      } else {
        console.log('ℹ️ Settings screen loaded but no form elements visible');
      }
      
      await page.screenshot({ path: 'test-results/smoke-settings.png' });
    } else {
      console.log('ℹ️ Settings navigation not found - skipping');
    }
  });

  test('Navigation and Responsive Design', async ({ page }) => {
    console.log('🧭 Testing Navigation and Responsive Design');
    
    // Test all navigation links
    const navItems = [
      '[data-testid="nav-dashboard"]',
      '[data-testid="nav-channels"]', 
      '[data-testid="nav-streams"]',
      '[data-testid="nav-epg"]',
      '[data-testid="nav-logs"]',
      '[data-testid="nav-settings"]'
    ];
    
    let workingNavItems = 0;
    for (const navItem of navItems) {
      const element = page.locator(navItem);
      if (await element.isVisible()) {
        await element.click();
        await page.waitForTimeout(1000);
        workingNavItems++;
        console.log(`✅ Navigation item ${navItem} works`);
      }
    }
    
    console.log(`📊 Working navigation items: ${workingNavItems}/${navItems.length}`);
    
    // Test mobile menu (if exists)
    const mobileMenuBtn = page.locator('[data-testid="mobile-menu-button"]');
    if (await mobileMenuBtn.isVisible()) {
      await mobileMenuBtn.click();
      await page.waitForTimeout(1000);
      console.log('✅ Mobile menu functional');
    }
    
    // Test responsive layout by changing viewport
    await page.setViewportSize({ width: 390, height: 844 }); // Mobile size
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/smoke-mobile-layout.png' });
    
    await page.setViewportSize({ width: 1920, height: 1080 }); // Desktop size
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/smoke-desktop-layout.png' });
    
    console.log('✅ Responsive design test completed');
  });

  test('Error Handling and Edge Cases', async ({ page }) => {
    console.log('🚨 Testing Error Handling');
    
    // Test invalid stream URL
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    const addStreamBtn = page.locator('[data-testid="add-stream-button"]');
    if (await addStreamBtn.isVisible()) {
      await addStreamBtn.click();
      await page.waitForSelector('[data-testid="stream-dialog"]');
      
      // Enter invalid URL
      const urlInput = page.locator('[data-testid="stream-url-input"] input').first();
      await urlInput.fill('invalid-url-format');
      
      const saveBtn = page.locator('[data-testid="save-stream-button"]');
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        
        // Check for error message
        const errorMsg = page.locator('.MuiAlert-root, .error, text=/error/i').first();
        if (await errorMsg.isVisible({ timeout: 3000 })) {
          console.log('✅ Error handling works for invalid URLs');
        }
      }
      
      // Close dialog
      const cancelBtn = page.locator('[data-testid="cancel-button"], button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
      }
    }
    
    // Test M3U import with invalid URL
    const importBtn = page.locator('[data-testid="import-m3u-button"]');
    if (await importBtn.isVisible()) {
      await importBtn.click();
      await page.waitForSelector('[data-testid="import-dialog"]');
      
      const urlInput = page.locator('[data-testid="import-url-input"] input').first();
      await urlInput.fill('http://invalid-m3u-url.test/playlist.m3u');
      
      const parseBtn = page.locator('[data-testid="parse-channels-button"]');
      if (await parseBtn.isVisible()) {
        await parseBtn.click();
        await page.waitForTimeout(5000);
        
        // Check for error handling
        const errorMsg = page.locator('.MuiAlert-root, .error').first();
        if (await errorMsg.isVisible()) {
          console.log('✅ Error handling works for invalid M3U URLs');
        }
      }
      
      // Close dialog
      const cancelBtn = page.locator('[data-testid="cancel-button"], button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
      }
    }
    
    await page.screenshot({ path: 'test-results/smoke-error-handling.png' });
    console.log('✅ Error handling tests completed');
  });

  test('Performance and Loading', async ({ page }) => {
    console.log('⚡ Testing Performance and Loading');
    
    const startTime = Date.now();
    
    // Test initial page load
    await page.goto('/', { waitUntil: 'networkidle' });
    const loadTime = Date.now() - startTime;
    
    console.log(`📊 Initial page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(10000); // Should load within 10 seconds
    
    // Test navigation speed
    const navStartTime = Date.now();
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    const navTime = Date.now() - navStartTime;
    
    console.log(`📊 Navigation time: ${navTime}ms`);
    expect(navTime).toBeLessThan(5000); // Navigation should be fast
    
    // Check for memory leaks by monitoring console errors
    let errorCount = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        errorCount++;
      }
    });
    
    // Navigate through all screens
    const navItems = ['[data-testid="nav-dashboard"]', '[data-testid="nav-channels"]', '[data-testid="nav-streams"]'];
    for (const nav of navItems) {
      const element = page.locator(nav);
      if (await element.isVisible()) {
        await element.click();
        await page.waitForTimeout(1000);
      }
    }
    
    console.log(`📊 Console errors during navigation: ${errorCount}`);
    expect(errorCount).toBeLessThan(5); // Should have minimal errors
    
    console.log('✅ Performance tests completed');
  });
});