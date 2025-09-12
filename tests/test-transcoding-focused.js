const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'transcoding-test-results');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function testTranscodingFixes() {
  console.log('🎬 Testing Transcoding Fixes - Focused Test...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  // Enable console logging
  let jsErrors = [];
  page.on('console', msg => {
    const type = msg.type();
    console.log(`Console ${type}: ${msg.text()}`);
    if (type === 'error') {
      jsErrors.push(msg.text());
    }
  });
  
  // Monitor network requests for transcoding
  const networkLogs = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/streams/preview/') || url.includes('/api/streams')) {
      networkLogs.push({
        url: url,
        method: request.method(),
        hasTranscodeParam: url.includes('transcode=true'),
        timestamp: new Date().toISOString()
      });
      console.log(`📡 REQUEST: ${request.method()} ${url}`);
    }
  });
  
  page.on('response', response => {
    const url = response.url();
    if (url.includes('/streams/preview/')) {
      const contentType = response.headers()['content-type'] || 'unknown';
      console.log(`📥 RESPONSE: ${response.status()} - ${url}`);
      console.log(`📄 Content-Type: ${contentType}`);
      
      if (contentType.includes('video/mp4')) {
        console.log('✅ TRANSCODED: Received MP4 video stream');
      } else if (contentType.includes('application/vnd.apple.mpegurl')) {
        console.log('⚠️ HLS: Received M3U8 playlist (not transcoded)');
      }
    }
  });

  try {
    console.log('1️⃣ Loading PlexBridge Application...');
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotsDir, '01-app-loaded.png'), fullPage: true });
    console.log('✅ App loaded');

    console.log('\n2️⃣ Navigating to Streams...');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotsDir, '02-streams-page.png'), fullPage: true });
    console.log('✅ Streams page loaded');

    console.log('\n3️⃣ Locating Preview Buttons...');
    // Look for the preview/eye button in the actions column
    const previewButtons = await page.locator('button[aria-label*="preview"], button[title*="preview"], button:has-text("👁"), .MuiIconButton-root').all();
    console.log(`Found ${previewButtons.length} potential preview buttons`);
    
    // Take screenshot to analyze the buttons
    await page.screenshot({ path: path.join(screenshotsDir, '03-analyzing-buttons.png'), fullPage: true });

    console.log('\n4️⃣ Testing Stream Preview...');
    // Try to click the first preview button in the actions column
    const firstRow = page.locator('table tbody tr').first();
    const actionsCell = firstRow.locator('td').last(); // Actions column should be last
    
    // Look for eye/preview icon button
    const previewButton = actionsCell.locator('button').nth(1); // Second button should be preview (after edit)
    
    await previewButton.click();
    console.log('🔍 Clicked preview button...');
    
    // Wait a bit for dialog to appear
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, '04-after-preview-click.png'), fullPage: true });

    console.log('\n5️⃣ Looking for Video Player Dialog...');
    // Check for various possible dialog selectors
    const dialogSelectors = [
      '.MuiDialog-root',
      '[role="dialog"]',
      '.MuiModal-root',
      'div[data-testid*="dialog"]',
      'div[aria-modal="true"]'
    ];
    
    let dialogFound = false;
    for (const selector of dialogSelectors) {
      const dialog = page.locator(selector);
      if (await dialog.isVisible()) {
        console.log(`✅ Found dialog with selector: ${selector}`);
        dialogFound = true;
        break;
      }
    }
    
    if (!dialogFound) {
      console.log('⚠️ No dialog found, checking for inline video player...');
      // Maybe the video opens inline or in a different way
    }

    await page.screenshot({ path: path.join(screenshotsDir, '05-dialog-search.png'), fullPage: true });

    console.log('\n6️⃣ Searching for Video Elements...');
    // Look for video elements anywhere on the page
    const videos = await page.locator('video').all();
    console.log(`Found ${videos.length} video elements`);
    
    if (videos.length > 0) {
      const video = videos[0];
      const src = await video.getAttribute('src');
      console.log(`🎥 Video src: ${src}`);
      
      if (src && src.includes('transcode=true')) {
        console.log('✅ TRANSCODING: Video URL includes transcode=true');
      } else {
        console.log('❌ TRANSCODING: Video URL missing transcode=true');
      }
    }

    console.log('\n7️⃣ Testing Transcoding UI Controls...');
    // Look for transcoding-related UI elements
    const transcodingElements = await page.locator('text*="transcod"').all();
    console.log(`Found ${transcodingElements.length} transcoding-related elements`);
    
    for (let i = 0; i < transcodingElements.length; i++) {
      const text = await transcodingElements[i].textContent();
      console.log(`  - Element ${i + 1}: "${text}"`);
    }

    // Look for switches/checkboxes related to transcoding
    const switches = await page.locator('input[type="checkbox"], .MuiSwitch-root').all();
    console.log(`Found ${switches.length} switches/checkboxes`);

    await page.screenshot({ path: path.join(screenshotsDir, '06-transcoding-ui.png'), fullPage: true });

    console.log('\n8️⃣ Network Analysis...');
    console.log('📊 Network Request Summary:');
    console.log(`Total requests monitored: ${networkLogs.length}`);
    
    const transcodedRequests = networkLogs.filter(log => log.hasTranscodeParam);
    console.log(`Requests with transcode=true: ${transcodedRequests.length}`);
    
    networkLogs.forEach((log, index) => {
      console.log(`  ${index + 1}. ${log.method} ${log.url}`);
      console.log(`     Transcoded: ${log.hasTranscodeParam ? '✅ Yes' : '❌ No'}`);
    });

    console.log('\n9️⃣ JavaScript Error Analysis...');
    console.log(`JavaScript errors detected: ${jsErrors.length}`);
    if (jsErrors.length > 0) {
      jsErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    } else {
      console.log('✅ No JavaScript errors detected');
    }

    console.log('\n🔟 Final Status Check...');
    await page.screenshot({ path: path.join(screenshotsDir, '07-final-state.png'), fullPage: true });

    // Test different streams
    console.log('\n1️⃣1️⃣ Testing Multiple Streams...');
    for (let i = 0; i < Math.min(3, 10); i++) {
      console.log(`Testing stream ${i + 1}...`);
      const row = page.locator('table tbody tr').nth(i);
      const streamName = await row.locator('td').nth(1).textContent(); // Name column
      console.log(`Stream: ${streamName}`);
      
      // Try clicking preview on this row
      try {
        const previewBtn = row.locator('td').last().locator('button').nth(1);
        await previewBtn.click();
        await page.waitForTimeout(1000);
        
        // Check for video elements
        const videoCount = await page.locator('video').count();
        console.log(`  Video elements: ${videoCount}`);
        
        await page.screenshot({ 
          path: path.join(screenshotsDir, `08-stream-${i + 1}-test.png`), 
          fullPage: true 
        });
        
        // Close any open dialogs
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        
      } catch (error) {
        console.log(`  Error testing stream ${i + 1}: ${error.message}`);
      }
    }

    console.log('\n📊 TRANSCODING TEST RESULTS:');
    console.log('================================');
    console.log(`✅ Application loads: Yes`);
    console.log(`✅ Streams page accessible: Yes`);
    console.log(`✅ Preview buttons found: ${previewButtons.length > 0 ? 'Yes' : 'No'}`);
    console.log(`✅ Video elements detected: ${videos.length > 0 ? 'Yes' : 'No'}`);
    console.log(`✅ Transcoded requests: ${transcodedRequests.length}`);
    console.log(`✅ JavaScript errors: ${jsErrors.length}`);
    
    if (transcodedRequests.length > 0) {
      console.log('🎉 TRANSCODING WORKING: Requests include transcode=true parameter');
    } else {
      console.log('⚠️ TRANSCODING ISSUE: No transcoded requests detected');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'error-state.png'),
      fullPage: true 
    });
  } finally {
    console.log(`\n📸 Screenshots saved to: ${screenshotsDir}`);
    await browser.close();
  }
}

// Run the test
testTranscodingFixes().catch(console.error);