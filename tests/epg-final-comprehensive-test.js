const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'epg-final-test-screenshots');

async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.log('Directory already exists or error creating:', error.message);
  }
}

async function comprehensiveEPGTest() {
  console.log('=== FINAL COMPREHENSIVE EPG CHANNEL SELECTOR TEST ===\n');
  await ensureDir(screenshotsDir);
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const testResults = {
    timestamp: new Date().toISOString(),
    tests: [],
    issues: [],
    apiRequests: [],
    consoleErrors: [],
    screenshots: [],
    summary: ''
  };

  try {
    // ===== DESKTOP TESTING (1920x1080) =====
    console.log('🖥️  TESTING DESKTOP VIEW (1920x1080)\n');
    
    const desktopContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const desktopPage = await desktopContext.newPage();
    
    // Monitor console errors
    desktopPage.on('console', msg => {
      if (msg.type() === 'error') {
        testResults.consoleErrors.push(`Desktop: ${msg.text()}`);
        console.log('❌ Console Error:', msg.text());
      }
    });
    
    // Monitor API requests
    desktopPage.on('request', request => {
      if (request.url().includes('/api/')) {
        testResults.apiRequests.push({
          device: 'desktop',
          method: request.method(),
          url: request.url(),
          timestamp: new Date().toISOString()
        });
        console.log(`📡 API Request: ${request.method()} ${request.url()}`);
      }
    });
    
    // 1. Navigate to Homepage
    console.log('1. 🏠 Loading PlexBridge Homepage...');
    await desktopPage.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await desktopPage.screenshot({ 
      path: path.join(screenshotsDir, '01-desktop-homepage.png'),
      fullPage: true 
    });
    testResults.screenshots.push('01-desktop-homepage.png');
    
    const pageTitle = await desktopPage.title();
    console.log(`   Page Title: "${pageTitle}"`);
    
    if (pageTitle.includes('PlexBridge') || await desktopPage.locator('nav').count() > 0) {
      testResults.tests.push({ name: 'Desktop Homepage Load', status: 'success' });
      console.log('   ✅ Homepage loaded successfully');
    } else {
      testResults.tests.push({ name: 'Desktop Homepage Load', status: 'failed' });
      testResults.issues.push('Homepage did not load properly on desktop');
      console.log('   ❌ Homepage failed to load');
    }
    
    // 2. Navigate to EPG Manager
    console.log('\n2. 📺 Navigating to EPG Manager...');
    
    // Try multiple selectors for EPG navigation
    const epgNavSelectors = [
      '[data-testid="nav-epg"]',
      'a[href*="/epg"]',
      'nav a:has-text("EPG")',
      '.MuiTab-root:has-text("EPG")',
      'button:has-text("EPG")'
    ];
    
    let epgNavFound = false;
    for (const selector of epgNavSelectors) {
      const element = await desktopPage.locator(selector).first();
      if (await element.count() > 0) {
        await element.click();
        epgNavFound = true;
        console.log(`   ✅ Found EPG navigation using: ${selector}`);
        break;
      }
    }
    
    if (!epgNavFound) {
      console.log('   ❌ EPG navigation not found');
      testResults.tests.push({ name: 'Navigate to EPG Manager', status: 'failed' });
      testResults.issues.push('EPG navigation element not found');
      
      // List available navigation
      const allNavElements = await desktopPage.locator('nav a, nav button').allTextContents();
      console.log('   Available navigation:', allNavElements);
    } else {
      testResults.tests.push({ name: 'Navigate to EPG Manager', status: 'success' });
    }
    
    await desktopPage.waitForTimeout(2000);
    await desktopPage.screenshot({ 
      path: path.join(screenshotsDir, '02-desktop-epg-manager.png'),
      fullPage: true 
    });
    testResults.screenshots.push('02-desktop-epg-manager.png');
    
    // 3. Open Program Guide Tab
    console.log('\n3. 📋 Opening Program Guide Tab...');
    const programGuideTab = await desktopPage.locator('button[role="tab"]:has-text("Program Guide")');
    
    if (await programGuideTab.count() > 0) {
      await programGuideTab.click();
      await desktopPage.waitForTimeout(2000);
      console.log('   ✅ Program Guide tab found and clicked');
      testResults.tests.push({ name: 'Open Program Guide Tab', status: 'success' });
    } else {
      console.log('   ❌ Program Guide tab not found');
      testResults.tests.push({ name: 'Open Program Guide Tab', status: 'failed' });
      testResults.issues.push('Program Guide tab not found');
      
      // List available tabs
      const availableTabs = await desktopPage.locator('button[role="tab"]').allTextContents();
      console.log('   Available tabs:', availableTabs);
    }
    
    await desktopPage.screenshot({ 
      path: path.join(screenshotsDir, '03-desktop-program-guide.png'),
      fullPage: true 
    });
    testResults.screenshots.push('03-desktop-program-guide.png');
    
    // 4. Verify Channel Selector Presence
    console.log('\n4. 🔍 Verifying Channel Selector...');
    const channelSelector = await desktopPage.locator('[data-testid="channel-selector"]');
    const selectorExists = await channelSelector.count() > 0;
    
    if (selectorExists) {
      console.log('   ✅ Channel selector found!');
      testResults.tests.push({ name: 'Channel Selector Presence', status: 'success' });
      
      // Check default value
      const currentValue = await channelSelector.inputValue();
      console.log(`   Current value: "${currentValue}"`);
      
      if (currentValue === 'all' || currentValue === '') {
        testResults.tests.push({ name: 'Default "All Channels" Selection', status: 'success' });
        console.log('   ✅ Default "All Channels" selection correct');
      } else {
        testResults.tests.push({ name: 'Default "All Channels" Selection', status: 'failed' });
        testResults.issues.push(`Default selection is "${currentValue}" instead of "all"`);
      }
      
    } else {
      console.log('   ❌ Channel selector NOT found');
      testResults.tests.push({ name: 'Channel Selector Presence', status: 'failed' });
      testResults.issues.push('Channel selector with data-testid="channel-selector" not found');
      
      // Look for any select elements
      const anySelects = await desktopPage.locator('select, .MuiSelect-root').count();
      console.log(`   Found ${anySelects} select elements on page`);
    }
    
    await desktopPage.screenshot({ 
      path: path.join(screenshotsDir, '04-desktop-channel-selector.png'),
      fullPage: true 
    });
    testResults.screenshots.push('04-desktop-channel-selector.png');
    
    // 5. Test Channel Selector Functionality
    if (selectorExists) {
      console.log('\n5. ⚙️  Testing Channel Selector Functionality...');
      
      // Open dropdown
      await channelSelector.click();
      await desktopPage.waitForTimeout(1000);
      
      await desktopPage.screenshot({ 
        path: path.join(screenshotsDir, '05-desktop-dropdown-open.png'),
        fullPage: true 
      });
      testResults.screenshots.push('05-desktop-dropdown-open.png');
      
      // Get dropdown options
      const options = await desktopPage.locator('li[role="option"]').allTextContents();
      console.log(`   Found ${options.length} channel options`);
      console.log(`   Options: ${options.slice(0, 5).join(', ')}${options.length > 5 ? '...' : ''}`);
      
      if (options.length > 0) {
        testResults.tests.push({ 
          name: 'Channel Options Available', 
          status: 'success',
          details: `${options.length} options found`
        });
        
        // Test selecting a specific channel
        if (options.length > 1) {
          console.log('\n6. 📺 Testing Channel Selection...');
          
          // Select first non-"All Channels" option
          const specificChannelOption = await desktopPage.locator('li[role="option"]').nth(1);
          const channelText = await specificChannelOption.textContent();
          await specificChannelOption.click();
          await desktopPage.waitForTimeout(2000);
          
          console.log(`   Selected channel: "${channelText}"`);
          
          await desktopPage.screenshot({ 
            path: path.join(screenshotsDir, '06-desktop-channel-selected.png'),
            fullPage: true 
          });
          testResults.screenshots.push('06-desktop-channel-selected.png');
          
          // Check for channel info alert
          const alertExists = await desktopPage.locator('.MuiAlert-root').count() > 0;
          if (alertExists) {
            const alertText = await desktopPage.locator('.MuiAlert-root').textContent();
            console.log(`   ✅ Channel info alert displayed: "${alertText}"`);
            testResults.tests.push({ name: 'Channel Info Alert Display', status: 'success' });
          } else {
            console.log('   ❌ No channel info alert displayed');
            testResults.tests.push({ name: 'Channel Info Alert Display', status: 'failed' });
          }
          
          // Test switching back to "All Channels"
          await channelSelector.click();
          await desktopPage.waitForTimeout(1000);
          
          const allChannelsOption = await desktopPage.locator('li[role="option"]:has-text("All Channels")');
          if (await allChannelsOption.count() > 0) {
            await allChannelsOption.click();
            await desktopPage.waitForTimeout(2000);
            console.log('   ✅ Successfully switched back to "All Channels"');
            testResults.tests.push({ name: 'Switch to All Channels', status: 'success' });
          }
          
          await desktopPage.screenshot({ 
            path: path.join(screenshotsDir, '07-desktop-all-channels.png'),
            fullPage: true 
          });
          testResults.screenshots.push('07-desktop-all-channels.png');
        }
        
      } else {
        testResults.tests.push({ name: 'Channel Options Available', status: 'failed' });
        testResults.issues.push('No channel options found in dropdown');
      }
    }
    
    await desktopContext.close();
    
    // ===== MOBILE TESTING (375x667) =====
    console.log('\n📱 TESTING MOBILE VIEW (375x667)\n');
    
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
    });
    const mobilePage = await mobileContext.newPage();
    
    // Monitor mobile console errors
    mobilePage.on('console', msg => {
      if (msg.type() === 'error') {
        testResults.consoleErrors.push(`Mobile: ${msg.text()}`);
        console.log('❌ Mobile Console Error:', msg.text());
      }
    });
    
    // 7. Mobile Homepage
    console.log('7. 📱 Loading Mobile Homepage...');
    await mobilePage.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    
    await mobilePage.screenshot({ 
      path: path.join(screenshotsDir, '08-mobile-homepage.png'),
      fullPage: true 
    });
    testResults.screenshots.push('08-mobile-homepage.png');
    
    // 8. Mobile Navigation
    console.log('\n8. 🍔 Testing Mobile Navigation...');
    
    // Look for mobile menu button
    const mobileMenuSelectors = [
      '[aria-label="menu"]',
      'button[aria-label="Open drawer"]',
      '.MuiIconButton-root:has(svg[data-testid="MenuIcon"])'
    ];
    
    let mobileMenuFound = false;
    for (const selector of mobileMenuSelectors) {
      const menuBtn = await mobilePage.locator(selector);
      if (await menuBtn.count() > 0) {
        await menuBtn.click();
        mobileMenuFound = true;
        console.log(`   ✅ Mobile menu opened using: ${selector}`);
        break;
      }
    }
    
    if (mobileMenuFound) {
      await mobilePage.waitForTimeout(1000);
      
      await mobilePage.screenshot({ 
        path: path.join(screenshotsDir, '09-mobile-menu-open.png'),
        fullPage: true 
      });
      testResults.screenshots.push('09-mobile-menu-open.png');
      
      // Navigate to EPG
      const mobileEPGNav = await mobilePage.locator('[data-testid="nav-epg"]');
      if (await mobileEPGNav.count() > 0) {
        await mobileEPGNav.click();
        await mobilePage.waitForTimeout(2000);
        console.log('   ✅ Navigated to EPG on mobile');
        testResults.tests.push({ name: 'Mobile EPG Navigation', status: 'success' });
      } else {
        console.log('   ❌ EPG navigation not found in mobile menu');
        testResults.tests.push({ name: 'Mobile EPG Navigation', status: 'failed' });
      }
    } else {
      console.log('   ❌ Mobile menu button not found');
      testResults.tests.push({ name: 'Mobile Menu Access', status: 'failed' });
    }
    
    await mobilePage.screenshot({ 
      path: path.join(screenshotsDir, '10-mobile-epg-page.png'),
      fullPage: true 
    });
    testResults.screenshots.push('10-mobile-epg-page.png');
    
    // 9. Mobile Program Guide Tab
    console.log('\n9. 📋 Testing Mobile Program Guide...');
    const mobileProgramGuideTab = await mobilePage.locator('button[role="tab"]:has-text("Program Guide")');
    
    if (await mobileProgramGuideTab.count() > 0) {
      await mobileProgramGuideTab.click();
      await mobilePage.waitForTimeout(2000);
      console.log('   ✅ Mobile Program Guide tab clicked');
      testResults.tests.push({ name: 'Mobile Program Guide Tab', status: 'success' });
    } else {
      console.log('   ❌ Mobile Program Guide tab not found');
      testResults.tests.push({ name: 'Mobile Program Guide Tab', status: 'failed' });
    }
    
    await mobilePage.screenshot({ 
      path: path.join(screenshotsDir, '11-mobile-program-guide.png'),
      fullPage: true 
    });
    testResults.screenshots.push('11-mobile-program-guide.png');
    
    // 10. Mobile Channel Selector
    console.log('\n10. 📱 Testing Mobile Channel Selector...');
    const mobileChannelSelector = await mobilePage.locator('[data-testid="channel-selector"]');
    
    if (await mobileChannelSelector.count() > 0) {
      console.log('   ✅ Mobile channel selector found');
      testResults.tests.push({ name: 'Mobile Channel Selector', status: 'success' });
      
      // Test mobile dropdown
      await mobileChannelSelector.click();
      await mobilePage.waitForTimeout(1000);
      
      await mobilePage.screenshot({ 
        path: path.join(screenshotsDir, '12-mobile-dropdown.png'),
        fullPage: true 
      });
      testResults.screenshots.push('12-mobile-dropdown.png');
      
      const mobileOptions = await mobilePage.locator('li[role="option"]').allTextContents();
      console.log(`   Mobile dropdown has ${mobileOptions.length} options`);
      
    } else {
      console.log('   ❌ Mobile channel selector not found');
      testResults.tests.push({ name: 'Mobile Channel Selector', status: 'failed' });
      testResults.issues.push('Channel selector not responsive on mobile');
    }
    
    await mobileContext.close();
    
  } catch (error) {
    console.error('❌ Test execution error:', error);
    testResults.issues.push(`Test execution error: ${error.message}`);
  } finally {
    await browser.close();
  }
  
  // ===== GENERATE TEST SUMMARY =====
  console.log('\n' + '='.repeat(50));
  console.log('📊 FINAL TEST SUMMARY');
  console.log('='.repeat(50));
  
  const successCount = testResults.tests.filter(t => t.status === 'success').length;
  const failCount = testResults.tests.filter(t => t.status === 'failed').length;
  
  console.log(`\n✅ Tests Passed: ${successCount}/${testResults.tests.length}`);
  console.log(`❌ Tests Failed: ${failCount}/${testResults.tests.length}`);
  console.log(`📡 API Requests Monitored: ${testResults.apiRequests.length}`);
  console.log(`🖼️  Screenshots Captured: ${testResults.screenshots.length}`);
  console.log(`⚠️  Console Errors: ${testResults.consoleErrors.length}`);
  
  if (testResults.issues.length > 0) {
    console.log('\n🚨 ISSUES FOUND:');
    testResults.issues.forEach((issue, idx) => {
      console.log(`   ${idx + 1}. ${issue}`);
    });
  } else {
    console.log('\n🎉 NO ISSUES FOUND!');
  }
  
  console.log('\n📋 DETAILED TEST RESULTS:');
  testResults.tests.forEach(test => {
    const icon = test.status === 'success' ? '✅' : '❌';
    const details = test.details ? ` (${test.details})` : '';
    console.log(`   ${icon} ${test.name}${details}`);
  });
  
  if (testResults.apiRequests.length > 0) {
    console.log('\n📡 API REQUESTS CAPTURED:');
    testResults.apiRequests.forEach(req => {
      console.log(`   ${req.device}: ${req.method} ${req.url}`);
    });
  }
  
  if (testResults.consoleErrors.length > 0) {
    console.log('\n⚠️  CONSOLE ERRORS:');
    testResults.consoleErrors.forEach(error => {
      console.log(`   • ${error}`);
    });
  }
  
  // Overall assessment
  const overallSuccess = failCount === 0 && testResults.issues.length === 0;
  testResults.summary = overallSuccess ? 
    'EPG Channel Selector feature is working correctly' : 
    'EPG Channel Selector has issues that need attention';
  
  console.log(`\n🎯 OVERALL ASSESSMENT: ${testResults.summary}`);
  
  // Save comprehensive test report
  const reportPath = path.join(screenshotsDir, 'comprehensive-test-report.json');
  await fs.writeFile(reportPath, JSON.stringify(testResults, null, 2));
  
  console.log(`\n📁 Test report saved to: ${reportPath}`);
  console.log(`📁 Screenshots saved to: ${screenshotsDir}`);
  
  return testResults;
}

// Run the comprehensive test
comprehensiveEPGTest().catch(console.error);