const { test, expect } = require('@playwright/test');

test('Debug drag and drop', async ({ page }) => {
  console.log('🔧 Debugging drag and drop...');
  
  // Listen for console messages and errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Browser Error:', msg.text());
    } else if (msg.text().includes('dnd') || msg.text().includes('drag')) {
      console.log('🔧 Drag/DnD Message:', msg.text());
    }
  });
  
  page.on('pageerror', error => {
    console.log('❌ Page Error:', error.message);
  });
  
  await page.goto('http://localhost:8081');
  await page.waitForLoadState('networkidle');
  await page.click('[data-testid="nav-channels"]');
  await page.waitForTimeout(2000);
  
  // Check if rows have proper attributes and event listeners
  const rowInfo = await page.locator('table tbody tr').first().evaluate(row => {
    const computed = window.getComputedStyle(row);
    return {
      cursor: computed.cursor,
      draggable: row.draggable,
      hasListeners: {
        dragstart: row.ondragstart !== null,
        dragover: row.ondragover !== null,
        drop: row.ondrop !== null,
      },
      attributes: {
        'data-dnd-kit-draggable': row.getAttribute('data-dnd-kit-draggable'),
        'aria-describedby': row.getAttribute('aria-describedby'),
        role: row.getAttribute('role'),
      },
      classList: Array.from(row.classList),
    };
  });
  
  console.log('📊 Row debug info:', JSON.stringify(rowInfo, null, 2));
  
  // Try to trigger drag events directly
  const firstRow = page.locator('table tbody tr').first();
  
  console.log('🎯 Testing manual drag events...');
  
  // Dispatch dragstart event
  const dragResult = await firstRow.evaluate(row => {
    const event = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
    });
    const dispatched = row.dispatchEvent(event);
    return { dispatched, defaultPrevented: event.defaultPrevented };
  });
  
  console.log('🎯 Drag event result:', dragResult);
  
  // Check DndKit context
  const dndKitInfo = await page.evaluate(() => {
    return {
      hasDndContext: !!document.querySelector('[data-dnd-kit-context="true"]'),
      sortableItems: Array.from(document.querySelectorAll('[data-dnd-kit-draggable]')).length,
    };
  });
  
  console.log('🔧 DndKit info:', dndKitInfo);
});