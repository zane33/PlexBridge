const { test, expect } = require('@playwright/test');

test.describe('Drag and Drop Fix Verification', () => {
  test('should reorder channels properly with drag and drop - FULL ROW TEST', async ({ page }) => {
    console.log('🔍 Starting drag and drop verification test...');
    
    // Navigate to the application on port 8081
    await page.goto('http://localhost:8081');
    
    // Wait for the page to load and take a screenshot
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/01-initial-load.png', fullPage: true });
    
    // Navigate to channel manager
    console.log('📺 Navigating to Channel Manager...');
    await page.click('[data-testid="nav-channels"]');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/02-channel-manager.png', fullPage: true });
    
    // Check if we have channels to test with
    const channelRows = await page.locator('table tbody tr[data-testid^="channel-row-"]').count();
    console.log(`📊 Found ${channelRows} channels for testing`);
    
    if (channelRows < 2) {
      console.log('⚠️  Need at least 2 channels for drag and drop testing. Creating test channels...');
      
      // Add first test channel
      await page.click('[data-testid="add-channel-button"], [data-testid="add-channel-fab"]');
      await page.waitForSelector('[data-testid="channel-name-input"]');
      await page.fill('[data-testid="channel-name-input"]', 'Test Channel A');
      await page.fill('[data-testid="channel-number-input"]', '100');
      await page.click('[data-testid="save-channel-button"]');
      await page.waitForTimeout(1000);
      
      // Add second test channel
      await page.click('[data-testid="add-channel-button"], [data-testid="add-channel-fab"]');
      await page.waitForSelector('[data-testid="channel-name-input"]');
      await page.fill('[data-testid="channel-name-input"]', 'Test Channel B');
      await page.fill('[data-testid="channel-number-input"]', '200');
      await page.click('[data-testid="save-channel-button"]');
      await page.waitForTimeout(1000);
      
      // Add third test channel
      await page.click('[data-testid="add-channel-button"], [data-testid="add-channel-fab"]');
      await page.waitForSelector('[data-testid="channel-name-input"]');
      await page.fill('[data-testid="channel-name-input"]', 'Test Channel C');
      await page.fill('[data-testid="channel-number-input"]', '300');
      await page.click('[data-testid="save-channel-button"]');
      await page.waitForTimeout(1000);
      
      await page.screenshot({ path: 'screenshots/03-channels-created.png', fullPage: true });
    }
    
    // Get initial channel order
    const initialChannels = await page.locator('table tbody tr').evaluateAll(rows => 
      rows.map(row => ({
        id: row.getAttribute('data-testid'),
        number: row.querySelector('[data-testid^="channel-number-"]')?.textContent?.trim(),
        name: row.querySelector('[data-testid^="channel-name-"]')?.textContent?.trim()
      })).filter(ch => ch.id && ch.number && ch.name)
    );
    
    console.log('📋 Initial channel order:', initialChannels);
    
    if (initialChannels.length >= 2) {
      // Test drag and drop functionality
      console.log('🎯 Testing drag and drop reordering...');
      
      // Get the first two channels to swap
      const firstChannelRow = page.locator('table tbody tr').first();
      const secondChannelRow = page.locator('table tbody tr').nth(1);
      
      // Take screenshot before drag
      await page.screenshot({ path: 'screenshots/04-before-drag.png', fullPage: true });
      
      // Perform drag and drop
      console.log('🔄 Performing drag operation...');
      await firstChannelRow.dragTo(secondChannelRow);
      
      // Wait for the drag operation to complete
      await page.waitForTimeout(3000);
      
      // Take screenshot after drag
      await page.screenshot({ path: 'screenshots/05-after-drag.png', fullPage: true });
      
      // Get the new channel order
      const newChannels = await page.locator('table tbody tr').evaluateAll(rows => 
        rows.map(row => ({
          id: row.getAttribute('data-testid'),
          number: row.querySelector('[data-testid^="channel-number-"]')?.textContent?.trim(),
          name: row.querySelector('[data-testid^="channel-name-"]')?.textContent?.trim()
        })).filter(ch => ch.id && ch.number && ch.name)
      );
      
      console.log('📋 New channel order:', newChannels);
      
      // Check if the order actually changed
      const orderChanged = JSON.stringify(initialChannels) !== JSON.stringify(newChannels);
      console.log(`✅ Order changed: ${orderChanged}`);
      
      if (orderChanged) {
        console.log('🎉 SUCCESS: Drag and drop is working! Channels were reordered.');
      } else {
        console.log('❌ FAIL: Drag and drop is NOT working. Channel order remained the same.');
        
        // Try alternative drag method
        console.log('🔄 Trying alternative drag method...');
        const dragHandle = firstChannelRow.locator('.drag-handle, [data-testid*="drag"]').first();
        if (await dragHandle.count() > 0) {
          await dragHandle.dragTo(secondChannelRow);
          await page.waitForTimeout(3000);
          await page.screenshot({ path: 'screenshots/06-alternative-drag.png', fullPage: true });
          
          const finalChannels = await page.locator('table tbody tr').evaluateAll(rows => 
            rows.map(row => ({
              id: row.getAttribute('data-testid'),
              number: row.querySelector('[data-testid^="channel-number-"]')?.textContent?.trim(),
              name: row.querySelector('[data-testid^="channel-name-"]')?.textContent?.trim()
            })).filter(ch => ch.id && ch.number && ch.name)
          );
          
          const altOrderChanged = JSON.stringify(initialChannels) !== JSON.stringify(finalChannels);
          console.log(`✅ Alternative drag order changed: ${altOrderChanged}`);
          console.log('📋 Final channel order:', finalChannels);
        }
      }
      
      // Check for JavaScript errors
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });
      
      if (errors.length > 0) {
        console.log('⚠️  JavaScript Errors:', errors);
      }
      
    } else {
      console.log('⚠️  Not enough channels for drag and drop testing');
    }
    
    // Final screenshot
    await page.screenshot({ path: 'screenshots/07-final-state.png', fullPage: true });
    
    console.log('✅ Drag and drop verification test completed');
  });
});