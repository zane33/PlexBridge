const { test, expect } = require('@playwright/test');

// Helper function to take detailed screenshots
async function takeDetailedScreenshot(page, name, testInfo) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot saved: ${name}`);
  return screenshotPath;
}

test.describe('PlexBridge Issue Analysis', () => {
  test.setTimeout(120000);

  test('Detailed maxConcurrentStreams Investigation', async ({ page }, testInfo) => {
    console.log('\n🔍 INVESTIGATING maxConcurrentStreams ISSUE\n');
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:8080/');
    await page.waitForTimeout(3000);
    
    // 1. Dashboard Analysis
    console.log('📊 DASHBOARD ANALYSIS:');
    await takeDetailedScreenshot(page, '01-dashboard-full', testInfo);
    
    // Check the Active Streams widget specifically
    const activeStreamsWidget = await page.locator('.MuiCard-root:has-text("ACTIVE STREAMS")').first();
    if (await activeStreamsWidget.isVisible()) {
      const widgetText = await activeStreamsWidget.textContent();
      console.log(`Active Streams Widget Text: "${widgetText}"`);
      
      // Look for the "of X max capacity" text
      const maxCapacityMatch = widgetText.match(/of (\d+) max capacity/);
      if (maxCapacityMatch) {
        const maxCapacity = maxCapacityMatch[1];
        console.log(`❌ FOUND ISSUE: Dashboard shows max capacity of ${maxCapacity} instead of 15!`);
      }
    }
    
    // 2. API Response Analysis
    console.log('\n🌐 API RESPONSE ANALYSIS:');
    const settingsResponse = await page.request.get('http://localhost:8080/api/settings');
    const settingsData = await settingsResponse.json();
    
    console.log(`API maxConcurrentStreams value: ${settingsData.streaming?.maxConcurrentStreams}`);
    console.log(`API nested maxConcurrentStreams: ${settingsData['streaming.maxConcurrentStreams']}`);
    console.log(`API plexlive maxConcurrentStreams: ${settingsData['plexlive.streaming.maxConcurrentStreams']}`);
    
    // 3. Settings Page Deep Dive
    console.log('\n⚙️ SETTINGS PAGE ANALYSIS:');
    await page.click('[data-testid="nav-settings"], a:has-text("Settings")');
    await page.waitForTimeout(2000);
    
    await takeDetailedScreenshot(page, '02-settings-initial', testInfo);
    
    // Expand the Streaming section
    const streamingSection = await page.locator('text="Streaming"').first();
    await streamingSection.click();
    await page.waitForTimeout(1000);
    
    await takeDetailedScreenshot(page, '03-settings-streaming-expanded', testInfo);
    
    // Look for maxConcurrentStreams input field
    const maxStreamsInputs = await page.locator('input[type="number"], input[name*="concurrent"], input[id*="concurrent"], input[value*="5"], input[value*="15"]').all();
    
    console.log(`Found ${maxStreamsInputs.length} potential maxConcurrentStreams input fields`);
    
    for (let i = 0; i < maxStreamsInputs.length; i++) {
      const input = maxStreamsInputs[i];
      const value = await input.inputValue();
      const name = await input.getAttribute('name') || '';
      const id = await input.getAttribute('id') || '';
      const placeholder = await input.getAttribute('placeholder') || '';
      
      console.log(`Input ${i + 1}: value="${value}", name="${name}", id="${id}", placeholder="${placeholder}"`);
      
      // Highlight this input in a screenshot
      await input.highlight();
      await takeDetailedScreenshot(page, `04-input-${i + 1}-highlighted`, testInfo);
    }
    
    // Look for any text containing "5" or "15" in the streaming section
    const streamingContent = await page.locator('.MuiCollapse-entered, .MuiAccordionDetails-root').first();
    if (await streamingContent.isVisible()) {
      const content = await streamingContent.textContent();
      console.log('\nStreaming section content preview:');
      console.log(content.substring(0, 500) + '...');
      
      // Look for specific patterns
      const patterns = [/concurrent.*?(\d+)/gi, /stream.*?(\d+)/gi, /limit.*?(\d+)/gi, /max.*?(\d+)/gi];
      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) {
          console.log(`Pattern "${pattern.source}" matches:`, matches);
        }
      }
    }
    
    // 4. Test settings modification
    console.log('\n📝 TESTING SETTINGS MODIFICATION:');
    
    // Try to find and modify the setting
    const possibleInputs = await page.locator('input[type="number"]').all();
    for (const input of possibleInputs) {
      const currentValue = await input.inputValue();
      if (currentValue === '5') {
        console.log(`Found input with value "5", attempting to change to "15"`);
        
        await input.highlight();
        await takeDetailedScreenshot(page, '05-before-change', testInfo);
        
        await input.fill('15');
        await page.waitForTimeout(500);
        
        await takeDetailedScreenshot(page, '06-after-change', testInfo);
        
        // Try to save
        const saveButton = await page.locator('button:has-text("Save"), [data-testid="save-settings"]').first();
        if (await saveButton.isVisible()) {
          await saveButton.click();
          await page.waitForTimeout(2000);
          
          await takeDetailedScreenshot(page, '07-after-save', testInfo);
          
          // Check for any alerts or messages
          const alerts = await page.locator('.MuiAlert-root, .MuiSnackbar-root, [role="alert"]').all();
          for (const alert of alerts) {
            const alertText = await alert.textContent();
            console.log(`Alert/Message: "${alertText}"`);
          }
        }
        break;
      }
    }
    
    // 5. Verify persistence by reloading
    console.log('\n🔄 TESTING PERSISTENCE:');
    await page.reload();
    await page.waitForTimeout(3000);
    
    await takeDetailedScreenshot(page, '08-after-reload', testInfo);
    
    // Check API again
    const newSettingsResponse = await page.request.get('http://localhost:8080/api/settings');
    const newSettingsData = await newSettingsResponse.json();
    console.log(`After reload - API maxConcurrentStreams: ${newSettingsData.streaming?.maxConcurrentStreams}`);
    
    // 6. Dashboard verification
    await page.goto('http://localhost:8080/');
    await page.waitForTimeout(3000);
    
    await takeDetailedScreenshot(page, '09-dashboard-after-changes', testInfo);
    
    const updatedActiveStreamsWidget = await page.locator('.MuiCard-root:has-text("ACTIVE STREAMS")').first();
    if (await updatedActiveStreamsWidget.isVisible()) {
      const updatedWidgetText = await updatedActiveStreamsWidget.textContent();
      console.log(`Updated Active Streams Widget Text: "${updatedWidgetText}"`);
      
      const updatedMaxCapacityMatch = updatedWidgetText.match(/of (\d+) max capacity/);
      if (updatedMaxCapacityMatch) {
        const updatedMaxCapacity = updatedMaxCapacityMatch[1];
        if (updatedMaxCapacity === '15') {
          console.log('✅ SUCCESS: Dashboard now shows correct max capacity of 15!');
        } else {
          console.log(`❌ STILL BROKEN: Dashboard still shows max capacity of ${updatedMaxCapacity}`);
        }
      }
    }
  });

  test('M3U Import Dialog Investigation', async ({ page }, testInfo) => {
    console.log('\n🔍 INVESTIGATING M3U IMPORT DIALOG ISSUE\n');
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:8080/');
    await page.waitForTimeout(2000);
    
    // Navigate to Streams
    await page.click('[data-testid="nav-streams"], a:has-text("Streams")');
    await page.waitForTimeout(2000);
    
    await takeDetailedScreenshot(page, '01-streams-page', testInfo);
    
    // Try to open M3U import dialog
    const importButtons = await page.locator('button:has-text("Import"), button:has-text("M3U"), [data-testid="import-m3u-button"]').all();
    console.log(`Found ${importButtons.length} potential import buttons`);
    
    for (let i = 0; i < importButtons.length; i++) {
      const button = importButtons[i];
      const buttonText = await button.textContent();
      console.log(`Button ${i + 1}: "${buttonText}"`);
      
      if (buttonText.toLowerCase().includes('import') || buttonText.toLowerCase().includes('m3u')) {
        await button.highlight();
        await takeDetailedScreenshot(page, `02-import-button-${i + 1}`, testInfo);
        
        await button.click();
        await page.waitForTimeout(2000);
        
        await takeDetailedScreenshot(page, `03-after-button-${i + 1}-click`, testInfo);
        
        // Look for dialog
        const dialogs = await page.locator('.MuiDialog-root, [role="dialog"], .MuiModal-root').all();
        console.log(`Found ${dialogs.length} dialogs after clicking button ${i + 1}`);
        
        if (dialogs.length > 0) {
          const dialog = dialogs[0];
          const dialogText = await dialog.textContent();
          console.log(`Dialog content preview: "${dialogText.substring(0, 200)}..."`);
          
          // Look for URL input field
          const urlInputs = await dialog.locator('input, textarea').all();
          console.log(`Found ${urlInputs.length} input fields in dialog`);
          
          for (let j = 0; j < urlInputs.length; j++) {
            const input = urlInputs[j];
            const placeholder = await input.getAttribute('placeholder') || '';
            const type = await input.getAttribute('type') || '';
            const name = await input.getAttribute('name') || '';
            
            console.log(`  Input ${j + 1}: type="${type}", name="${name}", placeholder="${placeholder}"`);
            
            await input.highlight();
            await takeDetailedScreenshot(page, `04-input-${j + 1}-in-dialog`, testInfo);
            
            // Try to find the actual input element inside the Material-UI component
            const actualInput = await input.locator('input').first();
            if (await actualInput.isVisible()) {
              console.log(`  Found nested input element`);
              await actualInput.highlight();
              await takeDetailedScreenshot(page, `05-nested-input-${j + 1}`, testInfo);
              
              try {
                await actualInput.fill('https://test.example.com/test.m3u');
                await takeDetailedScreenshot(page, `06-input-filled-${j + 1}`, testInfo);
                console.log(`✅ Successfully filled input ${j + 1}`);
              } catch (error) {
                console.log(`❌ Failed to fill input ${j + 1}: ${error.message}`);
              }
            }
          }
          
          // Close dialog if it's open
          const closeButtons = await dialog.locator('button[aria-label="close"], button:has-text("Cancel"), button:has-text("Close")').all();
          if (closeButtons.length > 0) {
            await closeButtons[0].click();
            await page.waitForTimeout(1000);
          }
        }
        break;
      }
    }
  });

  test('Console Errors and Network Analysis', async ({ page }, testInfo) => {
    console.log('\n🔍 MONITORING CONSOLE ERRORS AND NETWORK\n');
    
    const consoleErrors = [];
    const networkFailures = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          text: msg.text(),
          location: msg.location()
        });
        console.log(`🚨 Console Error: ${msg.text()}`);
      }
    });
    
    page.on('response', response => {
      if (!response.ok()) {
        networkFailures.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        });
        console.log(`🌐 Network Error: ${response.status()} ${response.url()}`);
      }
    });
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Test all major pages
    const pages = [
      { path: '/', name: 'Dashboard' },
      { path: '/channels', name: 'Channels' },
      { path: '/streams', name: 'Streams' },
      { path: '/epg', name: 'EPG' },
      { path: '/logs', name: 'Logs' },
      { path: '/settings', name: 'Settings' }
    ];
    
    for (const pageDef of pages) {
      console.log(`\n📄 Testing ${pageDef.name} page...`);
      
      await page.goto(`http://localhost:8080${pageDef.path}`);
      await page.waitForTimeout(3000);
      
      await takeDetailedScreenshot(page, `${pageDef.name.toLowerCase()}-page`, testInfo);
      
      // Wait a bit more to catch any delayed errors
      await page.waitForTimeout(2000);
    }
    
    // Summary
    console.log('\n📋 FINAL ERROR SUMMARY:');
    console.log(`Console Errors: ${consoleErrors.length}`);
    console.log(`Network Failures: ${networkFailures.length}`);
    
    if (consoleErrors.length === 0 && networkFailures.length === 0) {
      console.log('✅ No JavaScript or network errors detected!');
    } else {
      if (consoleErrors.length > 0) {
        console.log('\n🚨 CONSOLE ERRORS:');
        consoleErrors.forEach((error, i) => {
          console.log(`  ${i + 1}. ${error.text}`);
          if (error.location?.url) {
            console.log(`     at ${error.location.url}:${error.location.lineNumber}`);
          }
        });
      }
      
      if (networkFailures.length > 0) {
        console.log('\n🌐 NETWORK FAILURES:');
        networkFailures.forEach((failure, i) => {
          console.log(`  ${i + 1}. ${failure.status} ${failure.statusText} - ${failure.url}`);
        });
      }
    }
  });
});