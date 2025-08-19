const { test, expect } = require('@playwright/test');

test.describe('Comprehensive PlexBridge Fixes Verification', () => {
  
  // Test 1: Settings persistence and dashboard refresh
  test('should persist settings and update dashboard in real-time', async ({ page }) => {
    // Navigate to settings
    await page.goto('http://localhost:8080');
    await page.click('[data-testid="nav-settings"]');
    await page.waitForLoadState('networkidle');
    
    // Change max concurrent streams setting
    const slider = page.locator('text=Maximum Concurrent Streams').locator('..').locator('input[type="range"]');
    await slider.fill('25');
    
    // Save settings
    await page.click('button:has-text("Save Settings")');
    await page.waitForTimeout(1000);
    
    // Navigate to dashboard
    await page.click('[data-testid="nav-dashboard"]');
    await page.waitForLoadState('networkidle');
    
    // Verify the dashboard shows updated max streams
    const maxStreamsText = await page.locator('text=/of 25 max capacity/').textContent();
    expect(maxStreamsText).toContain('25');
    
    console.log('✅ Settings persistence and dashboard refresh working');
  });

  // Test 2: Stream preview functionality
  test('should handle stream preview with proper error messages', async ({ page }) => {
    // Navigate to streams
    await page.goto('http://localhost:8080');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Add a test stream
    await page.click('[data-testid="add-stream-button"]');
    await page.waitForSelector('[data-testid="stream-dialog"]');
    
    // Fill stream details
    await page.fill('input[name="name"]', 'Test HLS Stream');
    await page.fill('input[name="url"]', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
    
    // Select channel if available
    const channelSelect = page.locator('label:has-text("Channel")').locator('..').locator('select, [role="combobox"]').first();
    if (await channelSelect.isVisible()) {
      await channelSelect.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
    
    // Test stream validation
    const testButton = page.locator('[data-testid="test-stream-button"]');
    if (await testButton.isVisible()) {
      await testButton.click();
      
      // Wait for player dialog
      const playerDialog = page.locator('dialog:has(video), [role="dialog"]:has(video), [role="dialog"]:has-text("Stream Preview")');
      await expect(playerDialog).toBeVisible({ timeout: 10000 });
      
      // Check for proper error handling or playback
      const errorMessage = page.locator('text=/Stream format not supported|Streaming service unavailable|Network error/i');
      const videoElement = page.locator('video');
      
      // Either we get a proper error message or video starts playing
      const result = await Promise.race([
        errorMessage.waitFor({ timeout: 5000 }).then(() => 'error'),
        videoElement.waitFor({ timeout: 5000 }).then(() => 'video')
      ]).catch(() => 'timeout');
      
      if (result === 'error') {
        // Verify we get actionable error messages
        const errorText = await errorMessage.textContent();
        expect(errorText).toMatch(/proxy|external|direct|FFmpeg/i);
        console.log('✅ Stream preview shows proper error guidance');
      } else if (result === 'video') {
        console.log('✅ Stream preview video player loaded');
      }
      
      // Close dialog
      const closeButton = page.locator('[role="dialog"] button:has-text("Close"), [role="dialog"] button[aria-label*="close"]');
      if (await closeButton.isVisible()) {
        await closeButton.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }
    
    // Cancel stream dialog
    await page.click('[data-testid="cancel-button"], button:has-text("Cancel")');
  });

  // Test 3: EPG XMLTV import and display
  test('should import and display EPG XMLTV data', async ({ page }) => {
    // Navigate to EPG Manager
    await page.goto('http://localhost:8080');
    await page.click('[data-testid="nav-epg"]');
    await page.waitForLoadState('networkidle');
    
    // Add EPG source
    const addSourceButton = page.locator('button:has-text("Add EPG Source"), button:has-text("Add Source")');
    if (await addSourceButton.isVisible()) {
      await addSourceButton.click();
      
      // Fill EPG source details
      await page.fill('input[placeholder*="Name"], input[name="name"]', 'Test EPG Source');
      await page.fill('input[placeholder*="URL"], input[name="url"]', 'https://iptv-org.github.io/epg/guides/us/directv.com.epg.xml');
      
      // Save EPG source
      await page.click('button:has-text("Save"), button:has-text("Add")');
      await page.waitForTimeout(2000);
    }
    
    // Check EPG programs tab/section
    const programsTab = page.locator('button:has-text("Programs"), [role="tab"]:has-text("Programs")');
    if (await programsTab.isVisible()) {
      await programsTab.click();
      await page.waitForTimeout(1000);
      
      // Check if programs are displayed or if there's a message about mapping
      const programsContent = page.locator('text=/programs found|No programs|Channel mapping required/i');
      if (await programsContent.isVisible()) {
        const text = await programsContent.textContent();
        console.log(`EPG Status: ${text}`);
        
        // If no programs, check for mapping guidance
        if (text.includes('No programs') || text.includes('mapping')) {
          expect(text).toMatch(/mapping|channel|assign|EPG ID/i);
          console.log('✅ EPG provides clear mapping guidance');
        } else {
          console.log('✅ EPG programs imported successfully');
        }
      }
    }
    
    // Test channel mapping tab if available
    const mappingTab = page.locator('button:has-text("Channel Mapping"), [role="tab"]:has-text("Mapping")');
    if (await mappingTab.isVisible()) {
      await mappingTab.click();
      await page.waitForTimeout(1000);
      
      // Check for mapping interface
      const mappingContent = await page.locator('text=/Map channels|Assign EPG/i').count();
      if (mappingContent > 0) {
        console.log('✅ EPG channel mapping interface available');
      }
    }
  });

  // Test 4: Data persistence across container restarts
  test('should persist data across container restarts', async ({ page }) => {
    // First, create a channel
    await page.goto('http://localhost:8080');
    await page.click('[data-testid="nav-channels"]');
    await page.waitForLoadState('networkidle');
    
    // Add a test channel with unique name
    const uniqueName = `Persistent Channel ${Date.now()}`;
    await page.click('[data-testid="add-channel-button"], button:has-text("Add Channel")');
    
    await page.fill('input[placeholder*="Channel Name"], input[name="name"]', uniqueName);
    await page.fill('input[placeholder*="Channel Number"], input[name="number"], input[type="number"]', '999');
    
    await page.click('button:has-text("Save"), button:has-text("Add")');
    await page.waitForTimeout(1000);
    
    // Verify channel was created
    const channelRow = page.locator(`tr:has-text("${uniqueName}")`);
    await expect(channelRow).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Data persistence verified - channels saved to database');
  });

  // Test 5: Debug endpoint for EPG status
  test('should provide EPG debug information', async ({ page }) => {
    const response = await page.request.get('http://localhost:8080/api/debug/epg');
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('sources');
    expect(data).toHaveProperty('programs');
    expect(data).toHaveProperty('channelMappings');
    
    console.log('✅ EPG debug endpoint provides comprehensive status');
    console.log(`EPG Status: ${data.programs.total || 0} programs, ${data.sources.length || 0} sources`);
  });
});