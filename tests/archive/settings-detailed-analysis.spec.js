const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const screenshotsDir = path.join(__dirname, 'screenshots-settings-analysis');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

test.use({
  viewport: { width: 1920, height: 1080 },
  video: 'on',
  trace: 'on',
});

test.describe('Detailed Settings Analysis', () => {
  test('should expand streaming section and verify all settings', async ({ page }) => {
    console.log('🔍 Detailed analysis of Settings page streaming section...\n');
    
    // Navigate to Settings
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.click('text="Settings"');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-settings-initial.png'),
      fullPage: true 
    });
    console.log('📸 Screenshot: Initial settings page');
    
    // Find and click the Streaming section to expand it
    const streamingSection = page.locator('text="Streaming"').first();
    if (await streamingSection.isVisible()) {
      await streamingSection.click();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: path.join(screenshotsDir, '02-streaming-expanded.png'),
        fullPage: true 
      });
      console.log('📸 Screenshot: Streaming section expanded');
      
      // Look for all sliders
      const sliders = await page.locator('.MuiSlider-root').all();
      console.log(`✓ Found ${sliders.length} sliders in streaming section`);
      
      // Look for text content to identify settings
      const streamingText = await page.locator('[class*="MuiAccordion"], [class*="Card"]').filter({ hasText: 'Streaming' }).textContent();
      console.log('Streaming section text content:', streamingText.substring(0, 500));
      
      // Check for specific labels
      const maxConcurrentLabels = await page.locator('text=/Maximum.*Concurrent|Max.*Concurrent/i').count();
      const perChannelLabels = await page.locator('text=/Per Channel|Channel.*Limit/i').count();
      
      console.log(`✓ "Maximum Concurrent" labels: ${maxConcurrentLabels}`);
      console.log(`✓ "Per Channel" labels: ${perChannelLabels}`);
      
      // Try to interact with sliders
      for (let i = 0; i < Math.min(sliders.length, 4); i++) {
        const slider = sliders[i];
        try {
          // Get slider value before
          const beforeValue = await slider.getAttribute('aria-valuenow') || '0';
          console.log(`Slider ${i + 1} current value: ${beforeValue}`);
          
          // Click and modify
          await slider.click();
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(500);
          
          // Get slider value after
          const afterValue = await slider.getAttribute('aria-valuenow') || '0';
          console.log(`Slider ${i + 1} new value: ${afterValue}`);
          
          await page.screenshot({ 
            path: path.join(screenshotsDir, `03-slider-${i + 1}-modified.png`),
            fullPage: true 
          });
          console.log(`📸 Screenshot: Slider ${i + 1} modified`);
          
        } catch (error) {
          console.log(`⚠️ Could not interact with slider ${i + 1}: ${error.message}`);
        }
      }
      
      // Try to save settings
      const saveButton = page.locator('button:has-text("Save Settings")');
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await page.waitForTimeout(2000);
        
        await page.screenshot({ 
          path: path.join(screenshotsDir, '04-after-save.png'),
          fullPage: true 
        });
        console.log('📸 Screenshot: After save attempt');
        
        // Check for success notification
        const successNotification = await page.locator('text=/Saved|Success|Updated/i').isVisible({ timeout: 3000 }).catch(() => false);
        if (successNotification) {
          console.log('✅ Settings saved successfully');
        } else {
          console.log('⚠️ No success notification visible');
        }
      } else {
        console.log('⚠️ Save Settings button not found');
      }
      
    } else {
      console.log('❌ Streaming section not found');
    }
    
    // Try expanding other sections to see full settings
    const sections = ['Transcoding', 'Caching', 'Device Information', 'Network'];
    
    for (const sectionName of sections) {
      try {
        const section = page.locator(`text="${sectionName}"`).first();
        if (await section.isVisible()) {
          await section.click();
          await page.waitForTimeout(1000);
          
          await page.screenshot({ 
            path: path.join(screenshotsDir, `05-${sectionName.toLowerCase()}-expanded.png`),
            fullPage: true 
          });
          console.log(`📸 Screenshot: ${sectionName} section expanded`);
        }
      } catch (error) {
        console.log(`⚠️ Could not expand ${sectionName} section: ${error.message}`);
      }
    }
    
    // Final complete settings page
    await page.screenshot({ 
      path: path.join(screenshotsDir, '06-settings-complete.png'),
      fullPage: true 
    });
    console.log('📸 Screenshot: Complete settings page');
    
    console.log('\n🎯 Settings analysis complete!');
    console.log(`📁 Screenshots saved to: ${screenshotsDir}`);
  });
});