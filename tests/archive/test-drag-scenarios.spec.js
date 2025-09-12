const { test, expect } = require('@playwright/test');

test.describe('Drag and Drop Comprehensive Testing', () => {
  test('should test different drag scenarios', async ({ page }) => {
    console.log('🔍 Testing comprehensive drag scenarios...');
    
    // Navigate to the application
    await page.goto('http://localhost:8081');
    await page.waitForLoadState('networkidle');
    
    // Navigate to channel manager
    await page.click('[data-testid="nav-channels"]');
    await page.waitForTimeout(2000);
    
    // Get initial state
    const initialChannels = await page.locator('table tbody tr').evaluateAll(rows => 
      rows.map(row => ({
        id: row.getAttribute('data-testid'),
        number: row.querySelector('[data-testid^="channel-number-"]')?.textContent?.trim(),
        name: row.querySelector('[data-testid^="channel-name-"]')?.textContent?.trim()
      })).filter(ch => ch.id && ch.number && ch.name)
    );
    
    console.log('📋 Initial channel order:', initialChannels);
    
    if (initialChannels.length >= 2) {
      const firstRow = page.locator('table tbody tr').first();
      const secondRow = page.locator('table tbody tr').nth(1);
      
      // TEST 1: Try dragging from the name/content area (should work now)
      console.log('🎯 TEST 1: Dragging from channel name area...');
      await page.screenshot({ path: 'screenshots/test1-before.png', fullPage: true });
      
      // Click and hold on the channel name area
      const nameCell = firstRow.locator('[data-testid^=\"channel-name-\"]');
      await nameCell.hover();
      
      // Try a more manual drag approach
      const nameBox = await nameCell.boundingBox();
      const targetBox = await secondRow.boundingBox();
      
      if (nameBox && targetBox) {
        // Start drag
        await page.mouse.move(nameBox.x + nameBox.width / 2, nameBox.y + nameBox.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(100);
        
        // Move to target
        await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
        await page.waitForTimeout(200);
        
        // Drop
        await page.mouse.up();
        await page.waitForTimeout(2000);
        
        await page.screenshot({ path: 'screenshots/test1-after.png', fullPage: true });
        
        // Check result
        const result1 = await page.locator('table tbody tr').evaluateAll(rows => 
          rows.map(row => ({
            number: row.querySelector('[data-testid^=\"channel-number-\"]')?.textContent?.trim(),
            name: row.querySelector('[data-testid^=\"channel-name-\"]')?.textContent?.trim()
          })).filter(ch => ch.number && ch.name)
        );
        
        console.log('📋 After TEST 1:', result1);
        const test1Success = JSON.stringify(initialChannels.map(ch => ({number: ch.number, name: ch.name}))) !== JSON.stringify(result1);
        console.log(`✅ TEST 1 Success: ${test1Success}`);
      }
      
      // Reset for next test
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.click('[data-testid=\"nav-channels\"]');
      await page.waitForTimeout(2000);
      
      // TEST 2: Try dragging from the drag handle (should definitely work)
      console.log('🎯 TEST 2: Dragging from drag handle...');
      await page.screenshot({ path: 'screenshots/test2-before.png', fullPage: true });
      
      const dragHandle = page.locator('table tbody tr').first().locator('.drag-handle').first();
      const targetRow = page.locator('table tbody tr').nth(1);
      
      if (await dragHandle.count() > 0) {
        const handleBox = await dragHandle.boundingBox();
        const targetBox = await targetRow.boundingBox();
        
        if (handleBox && targetBox) {
          await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(100);
          
          await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
          await page.waitForTimeout(200);
          
          await page.mouse.up();
          await page.waitForTimeout(2000);
          
          await page.screenshot({ path: 'screenshots/test2-after.png', fullPage: true });
          
          const result2 = await page.locator('table tbody tr').evaluateAll(rows => 
            rows.map(row => ({
              number: row.querySelector('[data-testid^=\"channel-number-\"]')?.textContent?.trim(),
              name: row.querySelector('[data-testid^=\"channel-name-\"]')?.textContent?.trim()
            })).filter(ch => ch.number && ch.name)
          );
          
          console.log('📋 After TEST 2:', result2);
          const test2Success = JSON.stringify(initialChannels.map(ch => ({number: ch.number, name: ch.name}))) !== JSON.stringify(result2);
          console.log(`✅ TEST 2 Success: ${test2Success}`);
        }
      }
      
      // TEST 3: Check if cursor changes to grab when hovering over row
      console.log('🎯 TEST 3: Checking cursor behavior...');
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.click('[data-testid=\"nav-channels\"]');
      await page.waitForTimeout(2000);
      
      await page.screenshot({ path: 'screenshots/test3-cursor-check.png', fullPage: true });
      
      // Hover over first row and check computed styles
      const testRow = page.locator('table tbody tr').first();
      await testRow.hover();
      
      const cursor = await testRow.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return computed.cursor;
      });
      
      console.log(`🖱️  Row cursor style: ${cursor}`);
      console.log(`✅ TEST 3 - Row is draggable: ${cursor === 'grab' || cursor === 'move'}`);
      
    } else {
      console.log('⚠️  Not enough channels for testing');
    }
    
    console.log('✅ Comprehensive drag testing completed');
  });
});