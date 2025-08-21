const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Create simple test screenshots directory
const screenshotsDir = path.join(__dirname, 'transcoding-simple-test');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function testTranscodingSimple() {
  console.log('🔍 SIMPLE TRANSCODING VERIFICATION TEST\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  // Monitor all transcoding-related network requests
  const networkLogs = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/streams/preview/') || url.includes('transcode')) {
      networkLogs.push({
        url: url,
        method: request.method(),
        hasTranscode: url.includes('transcode=true'),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Monitor console for transcoding messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('ALWAYS-TRANSCODED') || text.includes('transcode') || text.includes('proxy URL')) {
      console.log(`📡 CONSOLE: ${text}`);
    }
  });

  try {
    console.log('1️⃣ Loading PlexBridge and navigating to streams...');
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    console.log('\n2️⃣ Opening first stream preview...');
    const firstRow = page.locator('table tbody tr').first();
    const streamName = await firstRow.locator('td').nth(1).textContent();
    console.log(`Testing stream: ${streamName}`);
    
    // Click preview button
    const previewButton = firstRow.locator('td').last().locator('button').nth(1);
    await previewButton.click();
    
    // Wait for dialog and video initialization
    await page.waitForSelector('[data-testid="video-player-dialog"]', { timeout: 10000 });
    await page.waitForTimeout(3000); // Let video initialize
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-dialog-opened.png'),
      fullPage: true 
    });

    console.log('\n3️⃣ Checking transcoding UI state...');
    
    // Check if Video Transcoding section is visible
    const transcodingVisible = await page.locator('text=Video Transcoding').isVisible();
    console.log(`✅ Video Transcoding section visible: ${transcodingVisible}`);
    
    // Check proxy toggle state
    const proxyCheckbox = page.locator('input[type="checkbox"]').first();
    const proxyEnabled = await proxyCheckbox.isChecked();
    console.log(`📍 Proxy enabled: ${proxyEnabled}`);
    
    // Look for transcoding checkbox (should be the second one when proxy is on)
    const checkboxes = await page.locator('input[type="checkbox"]').all();
    console.log(`Found ${checkboxes.length} checkboxes total`);
    
    let transcodingChecked = false;
    let transcodingDisabled = false;
    if (checkboxes.length >= 2) {
      transcodingChecked = await checkboxes[1].isChecked();
      transcodingDisabled = await checkboxes[1].isDisabled();
    }
    
    console.log(`✅ Transcoding toggle checked: ${transcodingChecked}`);
    console.log(`✅ Transcoding toggle disabled: ${transcodingDisabled}`);

    console.log('\n4️⃣ Analyzing actual video URL...');
    
    // Get the stream URL from the UI display
    const streamUrlDisplay = await page.locator('text*="Stream URL:"').locator('xpath=following-sibling::*').first().textContent().catch(() => 'Not found');
    console.log(`📍 UI Display URL: ${streamUrlDisplay}`);
    
    // Try to get video src attribute
    await page.waitForSelector('video', { timeout: 5000 });
    const videoSrc = await page.locator('video').getAttribute('src').catch(() => null);
    console.log(`📍 Video src attribute: ${videoSrc}`);
    
    // Check if URL includes transcoding parameter
    const displayHasTranscode = streamUrlDisplay && streamUrlDisplay.includes('transcode=true');
    const videoHasTranscode = videoSrc && videoSrc.includes('transcode=true');
    
    console.log(`✅ UI display URL has transcode=true: ${displayHasTranscode}`);
    console.log(`✅ Video src has transcode=true: ${videoHasTranscode}`);

    console.log('\n5️⃣ Testing proxy toggle independence...');
    
    // Test with proxy OFF
    if (proxyEnabled) {
      console.log('🔄 Testing with proxy OFF...');
      await proxyCheckbox.click({ force: true });
      await page.waitForTimeout(2000);
      
      // Check if transcoding is still visible
      const transcodingStillVisible = await page.locator('text=Video Transcoding').isVisible();
      console.log(`✅ Transcoding still visible with proxy OFF: ${transcodingStillVisible}`);
      
      await page.screenshot({ 
        path: path.join(screenshotsDir, '02-proxy-off.png'),
        fullPage: true 
      });
    }
    
    // Test with proxy ON
    console.log('🔄 Testing with proxy ON...');
    await proxyCheckbox.click({ force: true });
    await page.waitForTimeout(2000);
    
    const transcodingVisibleProxyOn = await page.locator('text=Video Transcoding').isVisible();
    console.log(`✅ Transcoding visible with proxy ON: ${transcodingVisibleProxyOn}`);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '03-proxy-on.png'),
      fullPage: true 
    });

    console.log('\n6️⃣ Network request analysis...');
    console.log('==============================');
    
    console.log(`📊 Total network requests monitored: ${networkLogs.length}`);
    
    const transcodedRequests = networkLogs.filter(log => log.hasTranscode);
    console.log(`📊 Requests with transcode=true: ${transcodedRequests.length}`);
    
    if (networkLogs.length > 0) {
      console.log('\n📋 All monitored requests:');
      networkLogs.forEach((log, index) => {
        console.log(`  ${index + 1}. ${log.hasTranscode ? '✅' : '❌'} ${log.method} ${log.url}`);
      });
    } else {
      console.log('⚠️ No network requests captured - may need to wait longer or check selectors');
    }

    console.log('\n🎯 FINAL ASSESSMENT:');
    console.log('====================');
    
    const fixes = [
      { name: 'Transcoding UI Always Visible', working: transcodingVisible },
      { name: 'Transcoding Toggle Checked', working: transcodingChecked },
      { name: 'Transcoding Toggle Disabled', working: transcodingDisabled },
      { name: 'Network Requests Include Transcoding', working: transcodedRequests.length > 0 },
      { name: 'Video Element Present', working: videoSrc !== null }
    ];
    
    fixes.forEach(fix => {
      console.log(`${fix.working ? '✅' : '❌'} ${fix.name}`);
    });
    
    const workingFixes = fixes.filter(fix => fix.working).length;
    const successRate = Math.round((workingFixes / fixes.length) * 100);
    
    console.log(`\n📊 Success Rate: ${workingFixes}/${fixes.length} (${successRate}%)`);
    
    if (workingFixes >= 4) {
      console.log('\n🎉 SUCCESS: Transcoding fixes are working!');
      console.log('🔧 Audio-only video issue should be resolved.');
    } else {
      console.log('\n⚠️ Some transcoding features need attention.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'error.png'),
      fullPage: true 
    });
  } finally {
    console.log(`\n📸 Test screenshots saved to: ${screenshotsDir}`);
    await browser.close();
  }
}

// Run the simple test
testTranscodingSimple().catch(console.error);