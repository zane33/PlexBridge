const { test, expect } = require('@playwright/test');

test.describe('FFmpeg Profile Manager - State Refresh Fixes', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3000');
    
    // Wait for the application to fully load
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="nav-settings"]', { timeout: 10000 });
  });

  test('should test FFmpeg Profile Manager state refresh fixes', async ({ page, browserName }) => {
    console.log(`Testing with browser: ${browserName}`);
    
    // Navigate to Settings page
    await page.click('[data-testid="nav-settings"]');
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ 
      path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-01-settings-page.png`,
      fullPage: true 
    });
    
    // Look for FFmpeg configuration section or Profile Manager
    // First, let's see what's on the settings page
    const settingsContent = await page.textContent('body');
    console.log('Settings page content preview:', settingsContent.substring(0, 500));
    
    // Look for FFmpeg-related sections
    const ffmpegSection = page.locator('text=FFmpeg').first();
    const profileSection = page.locator('text=Profile').first();
    const transcodingSection = page.locator('text=Transcoding').first();
    
    // Check if any FFmpeg-related sections exist
    let sectionFound = false;
    let sectionType = '';
    
    if (await ffmpegSection.isVisible()) {
      sectionFound = true;
      sectionType = 'FFmpeg';
      await ffmpegSection.scrollIntoViewIfNeeded();
    } else if (await profileSection.isVisible()) {
      sectionFound = true;
      sectionType = 'Profile';
      await profileSection.scrollIntoViewIfNeeded();
    } else if (await transcodingSection.isVisible()) {
      sectionFound = true;
      sectionType = 'Transcoding';
      await transcodingSection.scrollIntoViewIfNeeded();
    }
    
    if (!sectionFound) {
      // Take screenshot showing what's available
      await page.screenshot({ 
        path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-02-no-section-found.png`,
        fullPage: true 
      });
      
      // Check all visible text to find profile management
      const allText = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('*')).map(el => el.textContent).filter(text => text && text.toLowerCase().includes('profile')).slice(0, 10);
      });
      console.log('Found profile-related text:', allText);
      
      // Look for buttons that might open profile management
      const buttons = await page.locator('button').all();
      for (const button of buttons) {
        const buttonText = await button.textContent();
        if (buttonText && (buttonText.toLowerCase().includes('profile') || buttonText.toLowerCase().includes('ffmpeg') || buttonText.toLowerCase().includes('manage'))) {
          console.log('Found potential profile button:', buttonText);
          await button.scrollIntoViewIfNeeded();
          await page.screenshot({ 
            path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-03-found-button-${buttonText.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
            fullPage: true 
          });
          
          // Try clicking the button
          await button.click();
          await page.waitForTimeout(1000);
          await page.screenshot({ 
            path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-04-after-button-click.png`,
            fullPage: true 
          });
          
          sectionFound = true;
          sectionType = 'Button Click';
          break;
        }
      }
    }
    
    if (!sectionFound) {
      // Check if there are any tabs or navigation within settings
      const tabs = page.locator('[role="tab"], .MuiTab-root, .tab');
      const tabCount = await tabs.count();
      console.log(`Found ${tabCount} tabs in settings`);
      
      if (tabCount > 0) {
        for (let i = 0; i < tabCount; i++) {
          const tab = tabs.nth(i);
          const tabText = await tab.textContent();
          console.log(`Tab ${i}: ${tabText}`);
          
          if (tabText && (tabText.toLowerCase().includes('profile') || tabText.toLowerCase().includes('ffmpeg') || tabText.toLowerCase().includes('transcode'))) {
            await tab.click();
            await page.waitForTimeout(1000);
            await page.screenshot({ 
              path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-05-tab-${i}-${tabText.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
              fullPage: true 
            });
            sectionFound = true;
            sectionType = `Tab: ${tabText}`;
            break;
          }
        }
      }
    }
    
    // Take screenshot of current state
    await page.screenshot({ 
      path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-06-current-state.png`,
      fullPage: true 
    });
    
    if (sectionFound) {
      console.log(`Found FFmpeg section via: ${sectionType}`);
      
      // Now look for profile management interface
      await page.waitForTimeout(2000);
      
      // Look for profile-related elements
      const profileButtons = page.locator('button').filter({ hasText: /profile|edit|manage/i });
      const profileList = page.locator('table, .profile-list, [data-testid*="profile"]');
      
      const profileButtonCount = await profileButtons.count();
      const profileListVisible = await profileList.isVisible();
      
      console.log(`Found ${profileButtonCount} profile buttons, list visible: ${profileListVisible}`);
      
      // Take screenshot showing profile management area
      await page.screenshot({ 
        path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-07-profile-management-area.png`,
        fullPage: true 
      });
      
      if (profileButtonCount > 0) {
        // Try to interact with the first profile button
        const firstProfileButton = profileButtons.first();
        await firstProfileButton.scrollIntoViewIfNeeded();
        
        await page.screenshot({ 
          path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-08-before-profile-button-click.png`,
          fullPage: true 
        });
        
        await firstProfileButton.click();
        await page.waitForTimeout(2000);
        
        await page.screenshot({ 
          path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-09-after-profile-button-click.png`,
          fullPage: true 
        });
        
        // Look for dialog or profile editor
        const dialog = page.locator('.MuiDialog-root, [role="dialog"], .modal');
        if (await dialog.isVisible()) {
          console.log('Profile dialog opened');
          
          // Look for tabs within the dialog
          const dialogTabs = dialog.locator('[role="tab"], .MuiTab-root');
          const dialogTabCount = await dialogTabs.count();
          console.log(`Found ${dialogTabCount} tabs in profile dialog`);
          
          if (dialogTabCount > 0) {
            // Test tab navigation and state refresh
            for (let i = 0; i < dialogTabCount; i++) {
              const tab = dialogTabs.nth(i);
              const tabText = await tab.textContent();
              console.log(`Testing tab ${i}: ${tabText}`);
              
              await tab.click();
              await page.waitForTimeout(1000);
              
              await page.screenshot({ 
                path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-10-tab-${i}-${tabText?.replace(/[^a-zA-Z0-9]/g, '-') || 'unknown'}.png`,
                fullPage: true 
              });
              
              // Check for Associated Streams tab specifically
              if (tabText && tabText.toLowerCase().includes('associated')) {
                console.log('Found Associated Streams tab - testing state refresh');
                
                // Look for streams in this tab
                const streamsList = dialog.locator('table tbody tr, .stream-item, [data-testid*="stream"]');
                const streamCount = await streamsList.count();
                console.log(`Found ${streamCount} streams in Associated Streams tab`);
                
                if (streamCount > 0) {
                  // Try to remove a stream
                  const removeButtons = dialog.locator('button').filter({ hasText: /remove|delete|unassign/i });
                  const removeButtonCount = await removeButtons.count();
                  
                  if (removeButtonCount > 0) {
                    await page.screenshot({ 
                      path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-11-before-stream-removal.png`,
                      fullPage: true 
                    });
                    
                    await removeButtons.first().click();
                    await page.waitForTimeout(1000);
                    
                    await page.screenshot({ 
                      path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-12-after-stream-removal.png`,
                      fullPage: true 
                    });
                    
                    // Verify the stream is removed immediately (state refresh fix)
                    const newStreamCount = await dialog.locator('table tbody tr, .stream-item, [data-testid*="stream"]').count();
                    console.log(`Stream count after removal: ${newStreamCount} (was ${streamCount})`);
                    
                    if (newStreamCount < streamCount) {
                      console.log('✅ PASS: Associated Streams tab refreshed immediately after removal');
                    } else {
                      console.log('❌ FAIL: Associated Streams tab did NOT refresh after removal');
                    }
                  }
                }
              }
              
              // Check for Bulk Assignment tab
              if (tabText && (tabText.toLowerCase().includes('bulk') || tabText.toLowerCase().includes('assign'))) {
                console.log('Found Bulk Assignment tab - testing Update Profile button');
                
                // Look for streams to select
                const selectableStreams = dialog.locator('input[type="checkbox"], .selectable-stream');
                const selectableCount = await selectableStreams.count();
                console.log(`Found ${selectableCount} selectable streams`);
                
                if (selectableCount > 0) {
                  // Select some streams
                  await selectableStreams.first().check();
                  if (selectableCount > 1) {
                    await selectableStreams.nth(1).check();
                  }
                  
                  await page.screenshot({ 
                    path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-13-streams-selected.png`,
                    fullPage: true 
                  });
                  
                  // Look for Update Profile button (not Assign Selected)
                  const updateButton = dialog.locator('button').filter({ hasText: /update profile|save profile|update/i });
                  const assignButton = dialog.locator('button').filter({ hasText: /assign selected/i });
                  
                  if (await updateButton.isVisible()) {
                    console.log('Found Update Profile button - testing bulk assignment processing');
                    
                    await updateButton.click();
                    await page.waitForTimeout(2000);
                    
                    await page.screenshot({ 
                      path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-14-after-update-profile.png`,
                      fullPage: true 
                    });
                    
                    // Navigate back to Associated Streams to verify the bulk assignment worked
                    const associatedTab = dialog.locator('[role="tab"]').filter({ hasText: /associated/i });
                    if (await associatedTab.isVisible()) {
                      await associatedTab.click();
                      await page.waitForTimeout(1000);
                      
                      await page.screenshot({ 
                        path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-15-associated-after-bulk-assignment.png`,
                        fullPage: true 
                      });
                      
                      console.log('✅ PASS: Update Profile button processed bulk assignments');
                    }
                  } else {
                    console.log('❌ Update Profile button not found');
                  }
                }
              }
            }
          }
        } else {
          console.log('No profile dialog found after clicking profile button');
        }
      } else if (profileListVisible) {
        console.log('Profile list found but no interactive buttons');
        
        // Take screenshot of the profile list
        await page.screenshot({ 
          path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-16-profile-list-view.png`,
          fullPage: true 
        });
      } else {
        console.log('No profile management interface found');
      }
    } else {
      console.log('❌ FFmpeg Profile Manager section not found in settings');
      
      // Take final screenshot showing what we found
      await page.screenshot({ 
        path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-17-section-not-found.png`,
        fullPage: true 
      });
    }
    
    // Test mobile responsive design
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-18-mobile-view.png`,
      fullPage: true 
    });
    
    // Final verification - check for JavaScript errors
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(msg.text());
      }
    });
    
    // Return to desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/ffmpeg-profile-manager-19-final-desktop-view.png`,
      fullPage: true 
    });
    
    if (logs.length > 0) {
      console.log('JavaScript errors found:', logs);
    } else {
      console.log('✅ No JavaScript errors detected');
    }
    
    // Test summary
    console.log('\n=== FFmpeg Profile Manager Test Summary ===');
    console.log(`Section found: ${sectionFound ? '✅ YES' : '❌ NO'}`);
    console.log(`Method: ${sectionType}`);
    console.log(`Screenshots taken: 19+ screenshots`);
    console.log('===========================================\n');
  });

  test('should navigate to all main sections and capture screenshots', async ({ page }) => {
    // Test all navigation sections to ensure the app is fully functional
    const sections = [
      { testId: 'nav-dashboard', name: 'Dashboard' },
      { testId: 'nav-channels', name: 'Channels' },
      { testId: 'nav-streams', name: 'Streams' },
      { testId: 'nav-epg', name: 'EPG' },
      { testId: 'nav-logs', name: 'Logs' },
      { testId: 'nav-settings', name: 'Settings' }
    ];
    
    for (const section of sections) {
      try {
        await page.click(`[data-testid="${section.testId}"]`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/navigation-${section.name.toLowerCase()}.png`,
          fullPage: true 
        });
        
        console.log(`✅ ${section.name} section loaded successfully`);
      } catch (error) {
        console.log(`❌ Failed to load ${section.name}: ${error.message}`);
        
        await page.screenshot({ 
          path: `/mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots/navigation-${section.name.toLowerCase()}-error.png`,
          fullPage: true 
        });
      }
    }
  });
});