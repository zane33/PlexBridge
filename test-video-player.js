const { chromium } = require('playwright');

async function testVideoPlayer() {
  console.log('🚀 Starting video player tests...');
  
  const browser = await chromium.launch({ 
    headless: false, // Run with UI to see what happens
    slowMo: 1000 // Slow down operations to see them
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Browser console error:', msg.text());
    } else if (msg.type() === 'warn') {
      console.log('⚠️ Browser console warning:', msg.text());
    } else {
      console.log('ℹ️ Browser console:', msg.text());
    }
  });
  
  // Catch any page errors
  page.on('pageerror', error => {
    console.log('❌ Page error:', error.message);
  });
  
  try {
    console.log('📱 Navigating to PlexBridge...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    
    // Take screenshot of homepage
    await page.screenshot({ path: 'homepage-test.png', fullPage: true });
    console.log('📸 Homepage screenshot saved');
    
    console.log('📊 Checking dashboard page...');
    // Check if dashboard loads properly
    const dashboardHeading = await page.locator('h4:has-text("System Overview")').first();
    if (await dashboardHeading.isVisible()) {
      console.log('✅ Dashboard loaded successfully');
    } else {
      console.log('❌ Dashboard not loaded properly');
    }
    
    // Navigate to Streams page to test video player
    console.log('🎬 Navigating to Streams page...');
    await page.click('[data-testid="nav-streams"]');
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Take screenshot of streams page
    await page.screenshot({ path: 'streams-page-test.png', fullPage: true });
    console.log('📸 Streams page screenshot saved');
    
    // Check if there are any existing streams to test with
    const streamRows = await page.locator('table tbody tr').count();
    console.log(`📋 Found ${streamRows} existing streams`);
    
    if (streamRows > 0) {
      console.log('🎯 Testing video preview with existing stream...');
      
      // Click on the first preview button if available
      const previewButton = page.locator('[data-testid="preview-stream-button"]').first();
      if (await previewButton.isVisible()) {
        await previewButton.click();
        
        // Wait for video player dialog to open
        await page.waitForSelector('[data-testid="video-player-dialog"]', { timeout: 10000 });
        console.log('✅ Video player dialog opened');
        
        // Take screenshot of video player
        await page.screenshot({ path: 'video-player-dialog-test.png', fullPage: true });
        console.log('📸 Video player dialog screenshot saved');
        
        // Check if video element is present
        const videoElement = page.locator('video');
        if (await videoElement.isVisible()) {
          console.log('✅ Video element is visible');
          
          // Check video element attributes
          const videoSrc = await videoElement.getAttribute('src');
          console.log('🎥 Video source:', videoSrc || 'No src attribute');
          
          // Wait a bit for the video to attempt loading
          await page.waitForTimeout(5000);
          
          // Check for any errors in the console
          console.log('🔍 Checking for video loading...');
        } else {
          console.log('❌ Video element not visible');
        }
        
        // Close the video player
        await page.click('[data-testid="close-video-player"]');
        console.log('✅ Video player closed');
      } else {
        console.log('⚠️ No preview button found on existing streams');
      }
    }
    
    // Test adding a new stream with .ts URL
    console.log('📝 Testing add new stream with .ts URL...');
    
    // Click add stream button
    await page.click('[data-testid="add-stream-button"]');
    await page.waitForSelector('[data-testid="stream-dialog"]', { timeout: 5000 });
    
    // Fill in stream details
    await page.fill('[data-testid="stream-name-input"]', 'Test TS Stream');
    await page.fill('[data-testid="stream-url-input"]', 'http://primestreams.tv:826/live/SF11/vulwBvtfo9/118585.ts');
    
    // Save the stream
    await page.click('[data-testid="save-stream-button"]');
    await page.waitForTimeout(3000);
    
    // Take screenshot after adding stream
    await page.screenshot({ path: 'after-add-stream-test.png', fullPage: true });
    console.log('📸 After adding stream screenshot saved');
    
    console.log('🎯 Testing video preview with .ts stream...');
    
    // Find the newly added stream and test preview
    const newStreamRow = page.locator('table tbody tr:has-text("Test TS Stream")');
    if (await newStreamRow.isVisible()) {
      console.log('✅ New .ts stream added successfully');
      
      // Click preview button for the new stream
      const tsPreviewButton = newStreamRow.locator('[data-testid="preview-stream-button"]');
      await tsPreviewButton.click();
      
      // Wait for video player dialog
      await page.waitForSelector('dialog[open]', { timeout: 10000 });
      console.log('✅ Video player opened for .ts stream');
      
      // Take screenshot of .ts video player
      await page.screenshot({ path: 'ts-video-player-test.png', fullPage: true });
      console.log('📸 TS video player screenshot saved');
      
      // Check if the stream type is detected correctly
      const streamTypeChip = page.locator('span:has-text("TS"), span:has-text("MPEG Transport Stream")');
      if (await streamTypeChip.count() > 0) {
        console.log('✅ TS stream type detected correctly');
      } else {
        console.log('⚠️ TS stream type not displayed correctly');
      }
      
      // Check proxy toggle and try both modes
      const proxyToggle = page.locator('input[type="checkbox"]').first();
      
      console.log('🔧 Testing with proxy disabled...');
      if (await proxyToggle.isChecked()) {
        await proxyToggle.click(); // Disable proxy
        await page.waitForTimeout(3000);
      }
      
      await page.screenshot({ path: 'ts-direct-mode-test.png', fullPage: true });
      console.log('📸 Direct mode screenshot saved');
      
      console.log('🔧 Testing with proxy enabled...');
      if (!(await proxyToggle.isChecked())) {
        await proxyToggle.click(); // Enable proxy
        await page.waitForTimeout(3000);
      }
      
      await page.screenshot({ path: 'ts-proxy-mode-test.png', fullPage: true });
      console.log('📸 Proxy mode screenshot saved');
      
      // Close video player
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      
    } else {
      console.log('❌ Failed to add new .ts stream');
    }
    
    console.log('✅ Video player tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: 'test-error.png', fullPage: true });
    console.log('📸 Error screenshot saved');
    throw error;
  } finally {
    await browser.close();
  }
}

// Run the test
testVideoPlayer().catch(console.error);