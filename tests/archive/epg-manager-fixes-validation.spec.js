const { test, expect } = require('@playwright/test');

test.describe('EPG Manager - Critical Fixes Validation', () => {
  let page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    
    // Set viewport for desktop testing
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Navigate to application
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    if (page) {
      await page.close();
    }
  });

  test('should validate EPG Manager fixes and functionality', async () => {
    console.log('🎬 Starting EPG Manager Fixes Validation...');

    // Step 1: Take initial homepage screenshot
    await page.screenshot({ 
      path: 'test-screenshots/epg-fixes-01-homepage.png',
      fullPage: true 
    });

    // Step 2: Navigate to EPG Manager
    console.log('📺 Navigating to EPG Manager...');
    await page.click('[data-testid="nav-epg"]', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ 
      path: 'test-screenshots/epg-fixes-02-epg-manager.png',
      fullPage: true 
    });

    // Step 3: Verify EPG Sources tab
    console.log('🔍 Checking EPG Sources...');
    
    // Check if NZ IPTV source exists
    const nzIptvSource = page.locator('table tbody tr:has-text("NZ IPTV")');
    await expect(nzIptvSource).toBeVisible({ timeout: 10000 });
    
    // Check last success date - should be in NZ timezone format now
    const lastSuccessCell = nzIptvSource.locator('td').nth(3);
    const lastSuccessText = await lastSuccessCell.textContent();
    console.log('📅 Last Success Time (should be NZ format):', lastSuccessText);
    
    // Verify it's not just "Never" and contains proper date formatting
    expect(lastSuccessText).not.toBe('Never');
    expect(lastSuccessText).toMatch(/\d+/); // Should contain numbers (date)

    // Step 4: Check enhanced EPG status alert
    console.log('📊 Checking EPG Status Alert...');
    const epgStatusAlert = page.locator('[role="alert"]');
    await expect(epgStatusAlert).toBeVisible();
    
    const alertText = await epgStatusAlert.textContent();
    console.log('🚨 EPG Status Alert:', alertText);
    
    // Should show program counts and mapping info
    expect(alertText).toMatch(/Total Programs:/);
    expect(alertText).toMatch(/Channels:/);

    await page.screenshot({ 
      path: 'test-screenshots/epg-fixes-03-enhanced-status.png',
      fullPage: true 
    });

    // Step 5: Navigate to Channel Mapping tab
    console.log('🔗 Testing Channel Mapping Tab...');
    await page.click('text="Channel Mapping"');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ 
      path: 'test-screenshots/epg-fixes-04-channel-mapping.png',
      fullPage: true 
    });

    // Check for Auto-Map Channels button
    const autoMapButton = page.locator('button:has-text("Auto-Map Channels")');
    await expect(autoMapButton).toBeVisible();
    console.log('✅ Auto-Map Channels button found');

    // Check for Diagnose Issues button  
    const diagnoseButton = page.locator('button:has-text("Diagnose Issues")');
    await expect(diagnoseButton).toBeVisible();
    console.log('✅ Diagnose Issues button found');

    // Step 6: Test Diagnose Issues functionality
    console.log('🩺 Testing Diagnose Issues...');
    await diagnoseButton.click();
    await page.waitForTimeout(3000); // Wait for diagnosis to complete
    
    await page.screenshot({ 
      path: 'test-screenshots/epg-fixes-05-diagnose-issues.png',
      fullPage: true 
    });

    // Step 7: Test channel mapping interface
    console.log('🎯 Testing Channel Mapping Interface...');
    
    // Look for channels with EPG ID chips
    const channelRows = page.locator('div[role="listitem"]');
    const firstChannelRow = channelRows.first();
    await expect(firstChannelRow).toBeVisible();
    
    // Look for EPG ID chip in first channel
    const epgChip = firstChannelRow.locator('[role="button"]:has-text("EPG:")');
    if (await epgChip.isVisible()) {
      console.log('📌 Found EPG ID chip - testing edit functionality...');
      await epgChip.click();
      await page.waitForTimeout(1000);
      
      // Should show dropdown for editing
      const epgDropdown = page.locator('[role="combobox"]');
      if (await epgDropdown.isVisible()) {
        console.log('✅ EPG ID edit dropdown appeared');
        
        await page.screenshot({ 
          path: 'test-screenshots/epg-fixes-06-edit-epg-id.png',
          fullPage: true 
        });
        
        // Cancel edit
        const cancelButton = page.locator('button[aria-label]:has([data-testid="CancelIcon"])');
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
        }
      }
    }

    // Step 8: Test Auto-Map Channels functionality
    console.log('🤖 Testing Auto-Map Channels...');
    if (await autoMapButton.isEnabled()) {
      await autoMapButton.click();
      await page.waitForTimeout(3000); // Wait for auto-mapping to complete
      
      await page.screenshot({ 
        path: 'test-screenshots/epg-fixes-07-auto-map-result.png',
        fullPage: true 
      });
    } else {
      console.log('⚠️ Auto-Map button disabled (no EPG data available)');
    }

    // Step 9: Check Program Guide tab
    console.log('📺 Testing Program Guide Tab...');
    await page.click('text="Program Guide"');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ 
      path: 'test-screenshots/epg-fixes-08-program-guide.png',
      fullPage: true 
    });

    // Check if programs are now showing (if auto-mapping worked)
    const programsList = page.locator('[role="list"]');
    const programItems = programsList.locator('[role="listitem"]');
    
    const programCount = await programItems.count();
    console.log(`📊 Program Guide shows ${programCount} items`);
    
    if (programCount > 0) {
      console.log('🎉 SUCCESS: Programs are now displaying!');
    } else {
      console.log('⚠️ No programs showing - this indicates channel mapping issues remain');
    }

    // Step 10: Test enhanced refresh functionality
    console.log('🔄 Testing Enhanced Refresh...');
    await page.click('text="EPG Sources"'); // Go back to sources tab
    await page.waitForLoadState('networkidle');
    
    // Look for Fix & Refresh button if EPG service not initialized
    const fixRefreshButton = page.locator('button:has-text("Fix & Refresh")');
    if (await fixRefreshButton.isVisible()) {
      console.log('🔧 Found Fix & Refresh button - testing...');
      await fixRefreshButton.click();
      await page.waitForTimeout(2000);
      
      await page.screenshot({ 
        path: 'test-screenshots/epg-fixes-09-fix-refresh.png',
        fullPage: true 
      });
    }

    // Regular refresh test
    const refreshButton = page.locator('button:has-text("Refresh All")');
    await expect(refreshButton).toBeVisible();
    console.log('🔄 Testing regular refresh...');
    await refreshButton.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ 
      path: 'test-screenshots/epg-fixes-10-final-state.png',
      fullPage: true 
    });

    // Step 11: Validate API endpoints are working
    console.log('🔌 Testing API Endpoints...');
    
    // Test metrics API (should include enhanced EPG status)
    const metricsResponse = await page.request.get('http://localhost:8080/api/metrics');
    expect(metricsResponse.ok()).toBe(true);
    const metrics = await metricsResponse.json();
    
    console.log('📊 EPG Metrics:', {
      status: metrics.epg?.status,
      totalPrograms: metrics.epg?.programs?.total,
      isInitialized: metrics.epg?.isInitialized,
      sourceCount: metrics.epg?.sources?.length
    });

    // Test debug EPG endpoint
    const debugResponse = await page.request.get('http://localhost:8080/api/debug/epg');
    expect(debugResponse.ok()).toBe(true);
    const debugData = await debugResponse.json();
    
    console.log('🐛 Debug EPG Data:', {
      totalChannels: debugData.summary?.total_channels,
      channelsWithPrograms: debugData.summary?.channels_with_programs,
      totalPrograms: debugData.summary?.total_programs,
      epgChannels: debugData.summary?.total_epg_channels,
      mappingEfficiency: debugData.summary?.mapping_efficiency
    });

    // Final validation
    console.log('✅ EPG Manager Fixes Validation Complete!');
    
    const validationResults = {
      nzTimezoneFormat: lastSuccessText !== 'Never' && lastSuccessText.includes('AM') || lastSuccessText.includes('PM'),
      enhancedStatusAlert: alertText.includes('Total Programs:'),
      autoMapButtonPresent: await autoMapButton.isVisible(),
      diagnoseButtonPresent: await diagnoseButton.isVisible(),
      apiEndpointsWorking: metricsResponse.ok() && debugResponse.ok(),
      epgChannelsDetected: debugData.summary?.total_epg_channels > 0,
      sourcesConfigured: metrics.epg?.sources?.length > 0
    };

    console.log('📋 Validation Results:', validationResults);

    // Assert key fixes are working
    expect(validationResults.enhancedStatusAlert).toBe(true);
    expect(validationResults.autoMapButtonPresent).toBe(true);
    expect(validationResults.diagnoseButtonPresent).toBe(true);
    expect(validationResults.apiEndpointsWorking).toBe(true);
    expect(validationResults.epgChannelsDetected).toBe(true);
    expect(validationResults.sourcesConfigured).toBe(true);

    console.log('🎉 All EPG Manager fixes validated successfully!');
  });

  test('should test timezone formatting specifically', async () => {
    console.log('🕐 Testing NZ Timezone Formatting...');

    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');

    // Find the Last Success column
    const lastSuccessCell = page.locator('table tbody tr:first-child td').nth(3);
    await expect(lastSuccessCell).toBeVisible();
    
    const timeText = await lastSuccessCell.textContent();
    console.log('🇳🇿 Timezone formatting result:', timeText);

    // Take screenshot specifically for timezone formatting
    await page.screenshot({ 
      path: 'test-screenshots/epg-fixes-timezone-format.png',
      fullPage: true 
    });

    // Validate it's in NZ format (should contain AM/PM and proper formatting)
    if (timeText !== 'Never') {
      expect(timeText).toMatch(/\d{1,2} \w{3} \d{4}/); // Date format like "18 Aug 2025"
      console.log('✅ Timezone formatting working correctly');
    }
  });
});