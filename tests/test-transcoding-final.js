const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'transcoding-final-test');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function testTranscodingState() {
  console.log('🔍 FINAL TRANSCODING VALIDATION TEST\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  // Monitor network for transcoding
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
    console.log('1️⃣ Loading Application and Opening Stream Preview...');
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    
    // Click first preview button
    const firstRow = page.locator('table tbody tr').first();
    const previewButton = firstRow.locator('td').last().locator('button').nth(1);
    await previewButton.click();
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-stream-preview-opened.png'),
      fullPage: true 
    });

    console.log('\n2️⃣ Analyzing Transcoding Toggle State...');
    
    // Find the transcoding toggle
    const transcodingToggle = page.locator('input[type="checkbox"]').filter({
      has: page.locator('text=Video Transcoding')
    }).or(
      page.locator('input[type="checkbox"]').filter({
        hasText: /transcod/i
      })
    ).first();
    
    // Alternative: look for any checkbox near transcoding text
    const transcodingSection = page.locator('text=Video Transcoding').locator('xpath=../..'); 
    const nearbyCheckbox = transcodingSection.locator('input[type="checkbox"]').first();
    
    let isChecked = false;
    let isDisabled = false;
    
    try {
      if (await nearbyCheckbox.isVisible()) {
        isChecked = await nearbyCheckbox.isChecked();
        isDisabled = await nearbyCheckbox.isDisabled();
        console.log(`🔄 Transcoding Toggle Found - Checked: ${isChecked}, Disabled: ${isDisabled}`);
      } else {
        console.log('⚠️ Could not locate transcoding toggle');
      }
    } catch (error) {
      console.log('⚠️ Error checking transcoding toggle:', error.message);
    }

    console.log('\n3️⃣ Checking Help Text...');
    
    // Look for "Always enabled" text
    const helpTexts = await page.locator('text*="Always enabled"').all();
    console.log(`Found ${helpTexts.length} "Always enabled" text elements`);
    
    for (let i = 0; i < helpTexts.length; i++) {
      const text = await helpTexts[i].textContent();
      console.log(`  Help text ${i + 1}: "${text}"`);
    }

    console.log('\n4️⃣ Testing Video URL Generation...');
    
    // Check if enabling transcoding changes the URL
    if (!isDisabled && !isChecked) {
      console.log('🔄 Attempting to enable transcoding...');
      try {
        await nearbyCheckbox.click();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: path.join(screenshotsDir, '02-transcoding-enabled.png'),
          fullPage: true 
        });
        
        // Check if URL updated
        const videoElement = page.locator('video').first();
        const videoSrc = await videoElement.getAttribute('src');
        console.log(`🎥 Video src after enabling: ${videoSrc}`);
        
      } catch (error) {
        console.log('❌ Could not toggle transcoding:', error.message);
      }
    }

    console.log('\n5️⃣ Current Implementation Analysis...');
    
    // Get the current video src
    const videoElement = page.locator('video').first();
    const currentSrc = await videoElement.getAttribute('src');
    console.log(`🎥 Current video src: ${currentSrc}`);
    
    // Check the stream URL displayed in UI
    const streamUrlText = await page.locator('text*="Stream URL:"').locator('xpath=following-sibling::*').first().textContent().catch(() => 'Not found');
    console.log(`📄 Displayed stream URL: ${streamUrlText}`);

    console.log('\n6️⃣ Expected vs Actual Behavior...');
    console.log('📋 EXPECTED (after fixes):');
    console.log('   - Transcoding toggle should be DISABLED and CHECKED');
    console.log('   - Help text should show "Always enabled for browser compatibility"');
    console.log('   - Video URLs should ALWAYS include "?transcode=true"');
    console.log('   - Network requests should automatically use transcoded endpoints');
    
    console.log('\n📋 ACTUAL (current state):');
    console.log(`   - Transcoding toggle DISABLED: ${isDisabled ? '✅ YES' : '❌ NO'}`);
    console.log(`   - Transcoding toggle CHECKED: ${isChecked ? '✅ YES' : '❌ NO'}`);
    console.log(`   - Help text present: ${helpTexts.length > 0 ? '✅ YES' : '❌ NO'}`);
    console.log(`   - Video src includes transcode: ${currentSrc && currentSrc.includes('transcode=true') ? '✅ YES' : '❌ NO'}`);
    
    const transcodedRequests = networkLogs.filter(log => log.hasTranscode);
    console.log(`   - Network requests transcoded: ${transcodedRequests.length}/${networkLogs.length}`);

    console.log('\n📊 FINAL VERDICT:');
    if (isDisabled && isChecked && transcodedRequests.length > 0) {
      console.log('🎉 SUCCESS: Transcoding fixes are working correctly!');
    } else {
      console.log('❌ ISSUE: Transcoding fixes are NOT fully implemented');
      console.log('🔧 Action needed: Check the VideoPlayer component implementation');
    }

    await page.screenshot({ 
      path: path.join(screenshotsDir, '03-final-analysis.png'),
      fullPage: true 
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'error.png'),
      fullPage: true 
    });
  } finally {
    console.log(`\n📸 Screenshots saved to: ${screenshotsDir}`);
    await browser.close();
  }
}

// Run the test
testTranscodingState().catch(console.error);