const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testEPGSpecific() {
  console.log('Testing EPG Manager Program Guide tab specifically...');
  
  const screenshotsDir = path.join(__dirname, 'test-screenshots');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  page.on('console', msg => console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text()));

  try {
    console.log('1. Loading application and navigating to EPG Manager...');
    await page.goto('http://localhost:8080');
    await page.waitForTimeout(2000);
    
    await page.click('text=EPG');
    await page.waitForSelector('text=EPG Sources');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'epg-analysis-01-sources-tab.png'),
      fullPage: true 
    });
    console.log('✓ EPG Sources tab screenshot captured');

    console.log('2. Clicking Program Guide tab...');
    await page.click('text=Program Guide');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'epg-analysis-02-program-guide-tab.png'),
      fullPage: true 
    });
    console.log('✓ Program Guide tab screenshot captured');

    console.log('3. Checking for "No program data available" message...');
    const noDataMessage = await page.locator('text=No program data available').count();
    console.log(`✓ "No program data available" message found: ${noDataMessage > 0}`);

    console.log('4. Testing API endpoints directly from browser...');
    
    const apiResults = await page.evaluate(async () => {
      const results = {};
      
      try {
        const epgResponse = await fetch('/api/epg');
        results.epg = {
          status: epgResponse.status,
          data: await epgResponse.json()
        };
      } catch (e) {
        results.epg = { error: e.message };
      }
      
      try {
        const sourcesResponse = await fetch('/api/epg/sources');
        results.sources = {
          status: sourcesResponse.status,
          data: await sourcesResponse.json()
        };
      } catch (e) {
        results.sources = { error: e.message };
      }
      
      try {
        const programsResponse = await fetch('/api/epg/programs');
        results.programs = {
          status: programsResponse.status,
          data: await programsResponse.json()
        };
      } catch (e) {
        results.programs = { error: e.message };
      }
      
      return results;
    });
    
    console.log('✓ API Results from browser:');
    console.log(JSON.stringify(apiResults, null, 2));
    
    // Save API results
    fs.writeFileSync(
      path.join(screenshotsDir, 'epg-api-analysis.json'), 
      JSON.stringify(apiResults, null, 2)
    );

    console.log('5. Analyzing frontend expectations...');
    
    const frontendAnalysis = await page.evaluate(() => {
      // Check if EPG Manager component exists and analyze its state
      const epgManagerText = document.body.textContent;
      
      return {
        hasNoDataMessage: epgManagerText.includes('No program data available'),
        hasProgramGuideTab: epgManagerText.includes('Program Guide'),
        hasEPGSourcesTab: epgManagerText.includes('EPG Sources'),
        pageTitle: document.title,
        currentURL: window.location.href
      };
    });
    
    console.log('✓ Frontend Analysis:');
    console.log(JSON.stringify(frontendAnalysis, null, 2));

    console.log('\n=== ISSUE ANALYSIS ===');
    console.log('1. Backend /api/epg returns:', apiResults.epg?.data);
    console.log('2. Frontend expects: response.data.programs (from EPGManager.js line 232)');
    console.log('3. Backend structure: { start, end, programs: [] }');
    console.log('4. Frontend access: response.data.programs');
    console.log('5. Issue: Frontend tries to access response.data.programs but gets response.data.data.programs');
    console.log('6. Root cause: Data structure mismatch between API response and frontend expectation');

  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'epg-analysis-error.png'),
      fullPage: true 
    });
  } finally {
    await browser.close();
  }
}

testEPGSpecific().catch(console.error);