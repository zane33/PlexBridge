// Test video player in browser
const { chromium } = require('playwright');
const path = require('path');

async function testVideoPlayerStandalone() {
    console.log('Starting standalone video player test...');
    
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    // Enable console logging
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Using proxy URL') || text.includes('infinite') || text.includes('initializePlayer called')) {
            console.log(`CONSOLE ${msg.type()}: ${text}`);
        }
    });

    try {
        const filePath = path.join(__dirname, 'test-video-player-standalone.html');
        console.log('Opening test file:', filePath);
        
        await page.goto(`file://${filePath}`);
        await page.waitForLoadState('networkidle');
        
        console.log('Taking initial screenshot...');
        await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/standalone-initial.png', fullPage: true });
        
        // Test HLS stream
        console.log('Testing HLS stream...');
        await page.click('text="Test HLS Test Stream (Apple)"');
        await page.waitForTimeout(3000); // Wait to see if loops occur
        
        console.log('Taking HLS test screenshot...');
        await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/standalone-hls-test.png', fullPage: true });
        
        // Check if video element exists and has content
        const video = await page.locator('video').first();
        const videoCount = await page.locator('video').count();
        console.log(`Found ${videoCount} video elements`);
        
        if (videoCount > 0) {
            const videoSrc = await video.getAttribute('src');
            console.log('Video src:', videoSrc);
            
            const videoReady = await video.evaluate(v => v.readyState >= 2);
            console.log('Video ready state >= 2:', videoReady);
        }
        
        // Test MP4 stream
        console.log('Testing MP4 stream...');
        await page.click('text="Test Big Buck Bunny MP4"');
        await page.waitForTimeout(3000);
        
        console.log('Taking MP4 test screenshot...');
        await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/standalone-mp4-test.png', fullPage: true });
        
        // Clear and final check
        console.log('Clearing player...');
        await page.click('text="Clear"');
        await page.waitForTimeout(1000);
        
        console.log('Taking final screenshot...');
        await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/standalone-final.png', fullPage: true });
        
        console.log('Test completed successfully!');

    } catch (error) {
        console.error('Test error:', error);
        await page.screenshot({ path: '/mnt/c/Users/ZaneT/SFF/PlexBridge/test-screenshots/standalone-error.png', fullPage: true });
    } finally {
        await browser.close();
        console.log('Standalone video player test completed');
    }
}

testVideoPlayerStandalone();