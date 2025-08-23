const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Create verification screenshots directory
const screenshotsDir = path.join(__dirname, 'transcoding-verification');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function verifyTranscodingIssue() {
  console.log('🔍 VERIFYING TRANSCODING ISSUE\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  // Monitor network for transcoding parameters
  const networkLogs = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/streams/preview/')) {
      networkLogs.push({
        url: url,
        hasTranscode: url.includes('transcode=true'),
        timestamp: new Date().toISOString()
      });
      console.log(`📡 STREAM REQUEST: ${url}`);
      console.log(`🔄 Has transcode=true: ${url.includes('transcode=true') ? '✅ YES' : '❌ NO'}`);
    }
  });

  try {
    console.log('1️⃣ Loading application and navigating to streams...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Click first preview button
    const firstRow = page.locator('table tbody tr').first();
    const previewButton = firstRow.locator('td').last().locator('button').nth(1);
    await previewButton.click();
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-initial-state.png'),
      fullPage: true 
    });

    console.log('\n2️⃣ TESTING CURRENT BEHAVIOR:');
    
    // Check proxy toggle state
    const proxyToggle = page.locator('input[type="checkbox"]').first();
    const isProxyEnabled = await proxyToggle.isChecked();
    console.log(`📍 Proxy enabled: ${isProxyEnabled}`);
    
    // Check if transcoding section is visible
    const transcodingSectionVisible = await page.locator('text=Video Transcoding').isVisible();
    console.log(`📍 Transcoding section visible: ${transcodingSectionVisible}`);
    
    console.log('\n3️⃣ TESTING PROXY OFF (CURRENT BROKEN STATE):');
    
    if (isProxyEnabled) {
      // Turn off proxy to demonstrate the issue
      await proxyToggle.click();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: path.join(screenshotsDir, '02-proxy-disabled.png'),
        fullPage: true 
      });
      
      // Check if transcoding section disappeared
      const transcodingVisibleAfter = await page.locator('text=Video Transcoding').isVisible();
      console.log(`📍 Transcoding section visible after proxy disabled: ${transcodingVisibleAfter}`);
      
      // Check video src
      const videoSrc = await page.locator('video').getAttribute('src');
      console.log(`📍 Video src with proxy OFF: ${videoSrc}`);
      console.log(`📍 Contains transcode=true: ${videoSrc && videoSrc.includes('transcode=true') ? '✅ YES' : '❌ NO'}`);
    }
    
    console.log('\n4️⃣ TESTING PROXY ON:');
    
    // Turn proxy back on
    await proxyToggle.click();
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '03-proxy-enabled.png'),
      fullPage: true 
    });
    
    // Check transcoding section
    const transcodingVisibleWithProxy = await page.locator('text=Video Transcoding').isVisible();
    console.log(`📍 Transcoding section visible with proxy ON: ${transcodingVisibleWithProxy}`);
    
    if (transcodingVisibleWithProxy) {
      // Check transcoding toggle state
      const transcodingToggle = page.locator('input[type="checkbox"]').nth(1);
      const isTranscodingChecked = await transcodingToggle.isChecked();
      const isTranscodingDisabled = await transcodingToggle.isDisabled();
      
      console.log(`📍 Transcoding toggle checked: ${isTranscodingChecked}`);
      console.log(`📍 Transcoding toggle disabled: ${isTranscodingDisabled}`);
      
      // Check video src
      const videoSrcWithProxy = await page.locator('video').getAttribute('src');
      console.log(`📍 Video src with proxy ON: ${videoSrcWithProxy}`);
      console.log(`📍 Contains transcode=true: ${videoSrcWithProxy && videoSrcWithProxy.includes('transcode=true') ? '✅ YES' : '❌ NO'}`);
    }
    
    console.log('\n5️⃣ ISSUE ANALYSIS:');
    console.log('==================');
    
    console.log('🔍 IDENTIFIED PROBLEMS:');
    console.log('1. Transcoding UI is hidden when proxy is disabled');
    console.log('2. Without proxy, users get NO indication that transcoding should be forced');
    console.log('3. Video URLs don\'t include transcoding when proxy is off');
    console.log('4. This defeats the purpose of "always enabled" transcoding');
    
    console.log('\n💡 REQUIRED FIXES:');
    console.log('1. Remove Fade wrapper around transcoding toggle');
    console.log('2. Always show transcoding toggle as disabled and checked');
    console.log('3. Force transcoding in getStreamUrl() regardless of proxy state');
    console.log('4. Update help text to clearly indicate transcoding is always on');
    
    console.log('\n📊 NETWORK REQUESTS SUMMARY:');
    console.log(`Total stream requests: ${networkLogs.length}`);
    const transcodedRequests = networkLogs.filter(log => log.hasTranscode);
    console.log(`Transcoded requests: ${transcodedRequests.length}`);
    
    networkLogs.forEach((log, index) => {
      console.log(`  ${index + 1}. ${log.hasTranscode ? '✅' : '❌'} ${log.url}`);
    });

  } catch (error) {
    console.error('❌ Verification failed:', error);
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'error.png'),
      fullPage: true 
    });
  } finally {
    console.log(`\n📸 Verification screenshots saved to: ${screenshotsDir}`);
    await browser.close();
  }
}

// Run the verification
verifyTranscodingIssue().catch(console.error);