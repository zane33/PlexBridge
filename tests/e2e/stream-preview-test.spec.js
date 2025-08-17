const { test, expect } = require('@playwright/test');

test.describe('Stream Preview Issue Test', () => {
  
  test('Test stream preview with m3u8 URL', async ({ page }) => {
    console.log('Testing stream preview functionality...');
    
    // Test the stream validation API directly first
    const testUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    
    console.log('1. Testing stream validation API...');
    const validateResponse = await page.request.post('http://localhost:8080/streams/validate', {
      data: {
        url: testUrl,
        type: 'hls'
      }
    });
    
    console.log(`Validation response status: ${validateResponse.status()}`);
    const validateData = await validateResponse.json();
    console.log('Validation response:', validateData);
    
    // Test stream preview API
    console.log('2. Testing stream preview API...');
    const previewResponse = await page.request.get(`http://localhost:8080/streams/preview/test-stream`);
    console.log(`Preview response status: ${previewResponse.status()}`);
    
    if (previewResponse.status() === 500) {
      const errorData = await previewResponse.json();
      console.log('Preview error:', errorData);
      
      // Check if it's a helpful error message
      expect(errorData.error).toBeTruthy();
      if (errorData.error.includes('FFmpeg') || errorData.error.includes('Preview failed')) {
        console.log('✅ Enhanced error message detected');
      }
    }
    
    // Test the health and settings endpoints
    console.log('3. Testing other critical endpoints...');
    
    const healthResponse = await page.request.get('http://localhost:8080/health');
    expect(healthResponse.status()).toBe(200);
    console.log('✅ Health endpoint working');
    
    const settingsResponse = await page.request.get('http://localhost:8080/api/settings');
    expect(settingsResponse.status()).toBe(200);
    const settings = await settingsResponse.json();
    console.log(`Current max streams setting: ${settings.plexlive?.streaming?.maxConcurrentStreams || 'unknown'}`);
    
    // Test metrics endpoint
    const metricsResponse = await page.request.get('http://localhost:8080/api/metrics');
    expect(metricsResponse.status()).toBe(200);
    const metrics = await metricsResponse.json();
    console.log(`Metrics max streams: ${metrics.streams?.maximum || 'unknown'}`);
    
    // Verify metrics uses actual settings value
    if (settings.plexlive?.streaming?.maxConcurrentStreams && metrics.streams?.maximum) {
      expect(metrics.streams.maximum).toBe(settings.plexlive.streaming.maxConcurrentStreams);
      console.log('✅ Dashboard metrics using actual settings values');
    }
    
    console.log('Stream preview test completed');
  });

  test('Test settings update and real-time metrics refresh', async ({ page }) => {
    console.log('Testing settings update functionality...');
    
    // Get current settings
    const currentResponse = await page.request.get('http://localhost:8080/api/settings');
    const currentSettings = await currentResponse.json();
    const originalValue = currentSettings.plexlive?.streaming?.maxConcurrentStreams || 10;
    
    console.log(`Original max streams: ${originalValue}`);
    
    // Update settings
    const newValue = originalValue === 10 ? 20 : 10;
    const updateResponse = await page.request.put('http://localhost:8080/api/settings', {
      data: {
        plexlive: {
          streaming: {
            maxConcurrentStreams: newValue
          }
        }
      }
    });
    
    expect(updateResponse.status()).toBe(200);
    console.log(`Updated max streams to: ${newValue}`);
    
    // Verify metrics reflect the change
    await page.waitForTimeout(1000); // Allow for real-time update
    
    const metricsResponse = await page.request.get('http://localhost:8080/api/metrics');
    const metrics = await metricsResponse.json();
    
    expect(metrics.streams.maximum).toBe(newValue);
    console.log('✅ Real-time metrics update working correctly');
    
    // Restore original value
    await page.request.put('http://localhost:8080/api/settings', {
      data: {
        plexlive: {
          streaming: {
            maxConcurrentStreams: originalValue
          }
        }
      }
    });
    
    console.log(`Restored original value: ${originalValue}`);
  });

  test('Test EPG debug endpoint', async ({ page }) => {
    console.log('Testing EPG debug functionality...');
    
    const debugResponse = await page.request.get('http://localhost:8080/api/debug/epg');
    expect(debugResponse.status()).toBe(200);
    
    const debugData = await debugResponse.json();
    console.log('EPG Debug Info:', {
      sources: debugData.sources?.length || 0,
      programs: debugData.programs?.total || 0,
      channels: debugData.channelMappings?.total || 0
    });
    
    expect(debugData).toHaveProperty('sources');
    expect(debugData).toHaveProperty('programs');
    expect(debugData).toHaveProperty('channelMappings');
    
    console.log('✅ EPG debug endpoint working correctly');
  });
});