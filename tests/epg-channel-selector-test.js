const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'epg-selector-screenshots');

async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.log('Directory already exists or error creating:', error.message);
  }
}

async function testEPGChannelSelector() {
  console.log('Starting EPG Channel Selector comprehensive test...\n');
  await ensureDir(screenshotsDir);
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const testResults = {
    timestamp: new Date().toISOString(),
    tests: [],
    issues: [],
    summary: ''
  };

  try {
    // Test Desktop View (1920x1080)
    console.log('=== TESTING DESKTOP VIEW (1920x1080) ===\n');
    const desktopContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const desktopPage = await desktopContext.newPage();
    
    // Navigate to application
    console.log('1. Navigating to PlexBridge application...');
    await desktopPage.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await desktopPage.screenshot({ 
      path: path.join(screenshotsDir, '01-desktop-homepage.png'),
      fullPage: true 
    });
    testResults.tests.push({ name: 'Desktop Homepage Load', status: 'success' });
    
    // Navigate to EPG Manager
    console.log('2. Navigating to EPG Manager...');
    await desktopPage.click('[data-testid="nav-epg"]');
    await desktopPage.waitForTimeout(2000);
    await desktopPage.screenshot({ 
      path: path.join(screenshotsDir, '02-desktop-epg-manager.png'),
      fullPage: true 
    });
    testResults.tests.push({ name: 'Navigate to EPG Manager', status: 'success' });
    
    // Click on Program Guide tab
    console.log('3. Clicking on Program Guide tab...');
    const programGuideTab = await desktopPage.locator('button[role="tab"]:has-text("Program Guide")');
    await programGuideTab.click();
    await desktopPage.waitForTimeout(2000);
    await desktopPage.screenshot({ 
      path: path.join(screenshotsDir, '03-desktop-program-guide-tab.png'),
      fullPage: true 
    });
    testResults.tests.push({ name: 'Open Program Guide Tab', status: 'success' });
    
    // Check for channel selector
    console.log('4. Verifying channel selector presence...');
    const channelSelector = await desktopPage.locator('[data-testid="channel-selector"]');
    const selectorExists = await channelSelector.count() > 0;
    
    if (selectorExists) {
      console.log('   ✓ Channel selector found');
      testResults.tests.push({ name: 'Channel Selector Presence', status: 'success' });
      
      // Take screenshot of selector
      await desktopPage.screenshot({ 
        path: path.join(screenshotsDir, '04-desktop-channel-selector.png'),
        fullPage: true 
      });
      
      // Check default value
      const selectorValue = await channelSelector.inputValue();
      console.log(`   Current selector value: "${selectorValue}"`);
      if (selectorValue === 'all' || selectorValue === '') {
        testResults.tests.push({ name: 'Default "All Channels" Selection', status: 'success' });
      } else {
        testResults.issues.push('Default selection is not "All Channels"');
      }
      
      // Open dropdown and capture options
      console.log('5. Opening channel dropdown...');
      await channelSelector.click();
      await desktopPage.waitForTimeout(1000);
      await desktopPage.screenshot({ 
        path: path.join(screenshotsDir, '05-desktop-dropdown-open.png'),
        fullPage: true 
      });
      
      // Get dropdown options
      const options = await desktopPage.locator('li[role="option"]').allTextContents();
      console.log(`   Found ${options.length} channel options:`, options.slice(0, 5));
      testResults.tests.push({ 
        name: 'Dropdown Options Available', 
        status: 'success',
        details: `${options.length} channels found`
      });
      
      // Select a specific channel if available
      if (options.length > 1) {
        console.log('6. Selecting a specific channel...');
        const firstChannel = await desktopPage.locator('li[role="option"]').nth(1);
        await firstChannel.click();
        await desktopPage.waitForTimeout(2000);
        
        await desktopPage.screenshot({ 
          path: path.join(screenshotsDir, '06-desktop-channel-selected.png'),
          fullPage: true 
        });
        
        // Check for channel info alert
        const alertExists = await desktopPage.locator('.MuiAlert-root').count() > 0;
        if (alertExists) {
          console.log('   ✓ Channel info alert displayed');
          testResults.tests.push({ name: 'Channel Info Alert Display', status: 'success' });
        }
        
        // Monitor network request for API call
        console.log('7. Monitoring API calls...');
        desktopPage.on('request', request => {
          if (request.url().includes('/api/epg')) {
            console.log(`   API Request: ${request.url()}`);
            const url = new URL(request.url());
            if (url.searchParams.has('channel_id')) {
              console.log(`   ✓ channel_id parameter: ${url.searchParams.get('channel_id')}`);
              testResults.tests.push({ 
                name: 'API Call with channel_id', 
                status: 'success',
                details: `channel_id=${url.searchParams.get('channel_id')}`
              });
            }
          }
        });
        
        // Change selection to trigger API call
        await channelSelector.click();
        await desktopPage.waitForTimeout(1000);
        const allChannelsOption = await desktopPage.locator('li[role="option"]:has-text("All Channels")');
        if (await allChannelsOption.count() > 0) {
          await allChannelsOption.click();
          await desktopPage.waitForTimeout(2000);
          await desktopPage.screenshot({ 
            path: path.join(screenshotsDir, '07-desktop-all-channels-reselected.png'),
            fullPage: true 
          });
        }
      }
      
    } else {
      console.log('   ✗ Channel selector NOT found');
      testResults.issues.push('Channel selector not found on Program Guide tab');
      testResults.tests.push({ name: 'Channel Selector Presence', status: 'failed' });
      
      // Take screenshot of current state
      await desktopPage.screenshot({ 
        path: path.join(screenshotsDir, '04-desktop-no-selector-found.png'),
        fullPage: true 
      });
    }
    
    // Check for JavaScript errors
    const consoleMessages = [];
    desktopPage.on('console', msg => {
      if (msg.type() === 'error') {
        consoleMessages.push(msg.text());
      }
    });
    
    await desktopPage.waitForTimeout(1000);
    if (consoleMessages.length > 0) {
      console.log('\n   JavaScript errors detected:', consoleMessages);
      testResults.issues.push(`JavaScript errors: ${consoleMessages.join(', ')}`);
    } else {
      console.log('\n   ✓ No JavaScript errors detected');
      testResults.tests.push({ name: 'No JavaScript Errors (Desktop)', status: 'success' });
    }
    
    await desktopContext.close();
    
    // Test Mobile View (375x667)
    console.log('\n=== TESTING MOBILE VIEW (375x667) ===\n');
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
    });
    const mobilePage = await mobileContext.newPage();
    
    // Navigate to application
    console.log('8. Testing mobile responsive view...');
    await mobilePage.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await mobilePage.screenshot({ 
      path: path.join(screenshotsDir, '08-mobile-homepage.png'),
      fullPage: true 
    });
    
    // Open mobile menu
    console.log('9. Opening mobile menu...');
    const menuButton = await mobilePage.locator('[aria-label="menu"]');
    if (await menuButton.count() > 0) {
      await menuButton.click();
      await mobilePage.waitForTimeout(1000);
      await mobilePage.screenshot({ 
        path: path.join(screenshotsDir, '09-mobile-menu-open.png'),
        fullPage: true 
      });
      
      // Navigate to EPG
      await mobilePage.click('[data-testid="nav-epg"]');
      await mobilePage.waitForTimeout(2000);
      await mobilePage.screenshot({ 
        path: path.join(screenshotsDir, '10-mobile-epg-manager.png'),
        fullPage: true 
      });
      
      // Click Program Guide tab
      const mobileProgGuideTab = await mobilePage.locator('button[role="tab"]:has-text("Program Guide")');
      await mobileProgGuideTab.click();
      await mobilePage.waitForTimeout(2000);
      await mobilePage.screenshot({ 
        path: path.join(screenshotsDir, '11-mobile-program-guide.png'),
        fullPage: true 
      });
      
      // Check channel selector on mobile
      const mobileSelectorExists = await mobilePage.locator('[data-testid="channel-selector"]').count() > 0;
      if (mobileSelectorExists) {
        console.log('   ✓ Channel selector works on mobile');
        testResults.tests.push({ name: 'Mobile Channel Selector', status: 'success' });
        
        // Test mobile dropdown
        await mobilePage.locator('[data-testid="channel-selector"]').click();
        await mobilePage.waitForTimeout(1000);
        await mobilePage.screenshot({ 
          path: path.join(screenshotsDir, '12-mobile-dropdown.png'),
          fullPage: true 
        });
      } else {
        console.log('   ✗ Channel selector not found on mobile');
        testResults.issues.push('Channel selector not found on mobile view');
        testResults.tests.push({ name: 'Mobile Channel Selector', status: 'failed' });
      }
    }
    
    await mobileContext.close();
    
  } catch (error) {
    console.error('Test error:', error);
    testResults.issues.push(`Test execution error: ${error.message}`);
  } finally {
    await browser.close();
  }
  
  // Generate test summary
  console.log('\n=== TEST SUMMARY ===\n');
  const successCount = testResults.tests.filter(t => t.status === 'success').length;
  const failCount = testResults.tests.filter(t => t.status === 'failed').length;
  
  console.log(`Tests Passed: ${successCount}/${testResults.tests.length}`);
  console.log(`Tests Failed: ${failCount}/${testResults.tests.length}`);
  
  if (testResults.issues.length > 0) {
    console.log('\nIssues Found:');
    testResults.issues.forEach((issue, idx) => {
      console.log(`  ${idx + 1}. ${issue}`);
    });
  } else {
    console.log('\n✓ No issues found!');
  }
  
  console.log('\nTest Results:');
  testResults.tests.forEach(test => {
    const icon = test.status === 'success' ? '✓' : '✗';
    const details = test.details ? ` (${test.details})` : '';
    console.log(`  ${icon} ${test.name}${details}`);
  });
  
  // Save test report
  const reportPath = path.join(screenshotsDir, 'test-report.json');
  await fs.writeFile(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\nTest report saved to: ${reportPath}`);
  console.log(`Screenshots saved to: ${screenshotsDir}`);
  
  return testResults;
}

// Run the test
testEPGChannelSelector().catch(console.error);