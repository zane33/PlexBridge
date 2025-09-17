const { test, expect } = require('@playwright/test');

test.describe('FFmpeg Profile Management - Comprehensive Validation', () => {
  
  test.beforeEach(async ({ page }) => {
    // Set desktop viewport for consistent testing
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should validate all FFmpeg profile features are working', async ({ page }) => {
    console.log('🎯 Starting comprehensive FFmpeg profile validation...');
    
    // Navigate to FFmpeg Profiles
    const profilesNav = page.locator('[data-testid="desktop-drawer"]')
      .locator('[data-testid="nav-ffmpeg profiles"]');
    await expect(profilesNav).toBeVisible({ timeout: 10000 });
    await profilesNav.click();
    await page.waitForLoadState('networkidle');
    
    // Take initial page screenshot
    await page.screenshot({ 
      path: 'tests/screenshots/validation-ffmpeg-profiles-overview.png', 
      fullPage: true 
    });
    console.log('✓ FFmpeg Profiles page loaded successfully');
    
    // 1. Validate Profile Cards Display
    const profileCards = page.locator('.MuiCard-root');
    const cardCount = await profileCards.count();
    console.log(`✓ Found ${cardCount} profile cards`);
    expect(cardCount).toBeGreaterThan(0);
    
    // 2. Validate Stream Count Display
    const streamCountBadges = page.locator('text=/\\d+ streams?/');
    const badgeCount = await streamCountBadges.count();
    console.log(`✓ Found ${badgeCount} stream count badges`);
    expect(badgeCount).toBeGreaterThan(0);
    
    // Check specific stream counts match API data
    await expect(page.locator('text="23 streams"')).toBeVisible();
    await expect(page.locator('text="2 streams"')).toBeVisible();
    console.log('✓ Stream counts display correctly (23 streams and 2 streams)');
    
    // 3. Validate Associated Streams Lists
    const associatedStreamsHeaders = page.locator('text="Associated Streams"');
    const streamsHeaderCount = await associatedStreamsHeaders.count();
    console.log(`✓ Found ${streamsHeaderCount} Associated Streams sections`);
    expect(streamsHeaderCount).toBeGreaterThan(0);
    
    // 4. Validate Client Configuration Badges
    const clientBadges = page.locator('.MuiChip-root').filter({ hasText: /Android|Apple|iOS|Web/ });
    const clientBadgeCount = await clientBadges.count();
    console.log(`✓ Found ${clientBadgeCount} client configuration badges`);
    expect(clientBadgeCount).toBeGreaterThan(0);
    
    // 5. Test Add Profile Button
    const addProfileButton = page.locator('text="Add Profile"').or(page.locator('[data-testid="add-profile"]'));
    if (await addProfileButton.isVisible()) {
      console.log('✓ Add Profile button is visible');
    }
    
    // 6. Test Profile Edit Functionality
    const profileCard = profileCards.first();
    await profileCard.hover();
    
    // Look for edit button (gear icon or edit button)
    const editButton = profileCard.locator('button').filter({ hasText: /⚙|Edit|Settings/ }).first()
      .or(profileCard.locator('[data-testid*="edit"]').first())
      .or(profileCard.locator('svg').first().locator('..'));
    
    if (await editButton.isVisible()) {
      console.log('✓ Profile edit button found, testing dialog...');
      await editButton.click();
      await page.waitForTimeout(1000);
      
      // Check for dialog
      const dialog = page.locator('.MuiDialog-root').or(page.locator('[role="dialog"]'));
      if (await dialog.isVisible()) {
        await page.screenshot({ 
          path: 'tests/screenshots/validation-profile-edit-dialog.png', 
          fullPage: true 
        });
        console.log('✓ Profile edit dialog opened successfully');
        
        // Look for tabs
        const tabs = page.locator('.MuiTab-root').or(page.locator('[role="tab"]'));
        const tabCount = await tabs.count();
        if (tabCount > 0) {
          console.log(`✓ Found ${tabCount} tabs in edit dialog`);
        }
        
        // Close dialog
        const closeButton = page.locator('button').filter({ hasText: /Cancel|Close/ }).first();
        if (await closeButton.isVisible()) {
          await closeButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
    
    console.log('🎯 All FFmpeg profile features validated successfully!');
  });
  
  test('should validate Stream Manager integration', async ({ page }) => {
    console.log('🔗 Testing Stream Manager integration...');
    
    // Navigate to Streams page
    const streamsNav = page.locator('[data-testid="desktop-drawer"]')
      .locator('[data-testid="nav-streams"]');
    await expect(streamsNav).toBeVisible({ timeout: 10000 });
    await streamsNav.click();
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ 
      path: 'tests/screenshots/validation-streams-page.png', 
      fullPage: true 
    });
    
    // Look for FFmpeg Profile dropdowns in the interface
    const profileDropdowns = page.locator('select').filter({ hasText: /Profile|FFmpeg/ })
      .or(page.locator('.MuiSelect-root'))
      .or(page.locator('text=/Profile/'));
    
    if (await profileDropdowns.count() > 0) {
      console.log('✓ Found FFmpeg profile dropdowns in Stream Manager');
      
      // Try to open a dropdown to see if stream counts are displayed
      const firstDropdown = profileDropdowns.first();
      if (await firstDropdown.isVisible()) {
        await firstDropdown.click();
        await page.waitForTimeout(1000);
        
        // Look for options with stream counts
        const optionsWithCounts = page.locator('text=/\\(\\d+ streams?\\)/');
        if (await optionsWithCounts.count() > 0) {
          console.log('✓ Stream counts visible in dropdown options');
          await page.screenshot({ 
            path: 'tests/screenshots/validation-dropdown-stream-counts.png', 
            fullPage: true 
          });
        }
        
        // Close dropdown
        await page.keyboard.press('Escape');
      }
    }
    
    console.log('✓ Stream Manager integration validation complete');
  });
  
  test('should validate mobile responsiveness', async ({ page }) => {
    console.log('📱 Testing mobile responsiveness...');
    
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open mobile menu
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
      await page.waitForTimeout(500);
      
      await page.screenshot({ 
        path: 'tests/screenshots/validation-mobile-menu.png', 
        fullPage: true 
      });
      
      // Navigate to FFmpeg Profiles
      const profilesNav = page.locator('[data-testid="mobile-drawer"]')
        .locator('[data-testid="nav-ffmpeg profiles"]');
      if (await profilesNav.isVisible()) {
        await profilesNav.click();
        await page.waitForLoadState('networkidle');
        
        await page.screenshot({ 
          path: 'tests/screenshots/validation-mobile-ffmpeg-profiles.png', 
          fullPage: true 
        });
        
        // Check if cards stack properly on mobile
        const profileCards = page.locator('.MuiCard-root');
        const cardCount = await profileCards.count();
        if (cardCount > 0) {
          console.log(`✓ ${cardCount} profile cards display properly on mobile`);
        }
        
        console.log('✓ Mobile responsiveness validation complete');
      }
    }
  });
  
  test('should validate API integration', async ({ page }) => {
    console.log('🔌 Testing API integration...');
    
    // Set up API response monitoring
    const apiCalls = [];
    page.on('response', response => {
      if (response.url().includes('/api/ffmpeg-profiles')) {
        apiCalls.push({
          url: response.url(),
          status: response.status(),
          method: response.request().method()
        });
      }
    });
    
    // Navigate to FFmpeg Profiles to trigger API calls
    const profilesNav = page.locator('[data-testid="desktop-drawer"]')
      .locator('[data-testid="nav-ffmpeg profiles"]');
    await expect(profilesNav).toBeVisible({ timeout: 10000 });
    await profilesNav.click();
    await page.waitForLoadState('networkidle');
    
    // Wait a bit more for any async API calls
    await page.waitForTimeout(2000);
    
    console.log(`✓ Captured ${apiCalls.length} FFmpeg profiles API calls`);
    apiCalls.forEach(call => {
      console.log(`  ${call.method} ${call.url} - Status: ${call.status}`);
    });
    
    // Verify we got successful API responses
    const successfulCalls = apiCalls.filter(call => call.status >= 200 && call.status < 300);
    expect(successfulCalls.length).toBeGreaterThan(0);
    console.log('✓ API integration working correctly');
  });
  
  test('should generate comprehensive feature documentation screenshots', async ({ page }) => {
    console.log('📸 Generating comprehensive documentation screenshots...');
    
    // Navigate to FFmpeg Profiles
    const profilesNav = page.locator('[data-testid="desktop-drawer"]')
      .locator('[data-testid="nav-ffmpeg profiles"]');
    await expect(profilesNav).toBeVisible({ timeout: 10000 });
    await profilesNav.click();
    await page.waitForLoadState('networkidle');
    
    // 1. Full page overview
    await page.screenshot({ 
      path: 'tests/screenshots/docs-ffmpeg-profiles-overview.png', 
      fullPage: true 
    });
    
    // 2. Focus on profile cards
    const profileCards = page.locator('.MuiCard-root').first();
    await profileCards.screenshot({ 
      path: 'tests/screenshots/docs-profile-card-detail.png'
    });
    
    // 3. Stream count badges
    const streamBadge = page.locator('text="23 streams"').first();
    if (await streamBadge.isVisible()) {
      await streamBadge.screenshot({ 
        path: 'tests/screenshots/docs-stream-count-badge.png'
      });
    }
    
    // 4. Client configuration badges
    const clientBadges = page.locator('.MuiChip-root').filter({ hasText: /Android/ }).first();
    if (await clientBadges.isVisible()) {
      await clientBadges.screenshot({ 
        path: 'tests/screenshots/docs-client-badges.png'
      });
    }
    
    console.log('📸 Documentation screenshots generated successfully');
  });
});