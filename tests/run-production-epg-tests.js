#!/usr/bin/env node

/**
 * Production EPG Test Runner
 * Executes comprehensive EPG tests against production at 192.168.3.148:3000
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const PRODUCTION_URL = 'http://192.168.3.148:3000';
const TEST_ENV = 'production';

// Test files to run
const testFiles = [
  'epg-production-comprehensive.spec.js',
  'epg-freeviewnew-specific.spec.js'
];

console.log('🚀 Starting Production EPG Test Suite');
console.log(`📍 Target: ${PRODUCTION_URL}`);
console.log(`📅 Time: ${new Date().toISOString()}`);
console.log('=' .repeat(60));

// Ensure screenshots directory exists
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
  console.log('📁 Created screenshots directory');
}

// Set environment variables for production testing
process.env.TEST_ENV = TEST_ENV;
process.env.BASE_URL = PRODUCTION_URL;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

for (const testFile of testFiles) {
  const testPath = path.join(__dirname, 'e2e', testFile);

  if (!fs.existsSync(testPath)) {
    console.log(`❌ Test file not found: ${testFile}`);
    continue;
  }

  console.log(`\n🧪 Running: ${testFile}`);
  console.log('-'.repeat(40));

  try {
    // Run the specific test file
    const command = `npx playwright test ${testPath} --project=chromium --reporter=line`;

    console.log(`📝 Command: ${command}`);

    const output = execSync(command, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        TEST_ENV: TEST_ENV,
        BASE_URL: PRODUCTION_URL
      }
    });

    console.log('✅ Test completed successfully');
    console.log('📊 Output:');
    console.log(output);

    // Parse test results from output
    const passMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);

    if (passMatch) {
      const passed = parseInt(passMatch[1]);
      passedTests += passed;
      totalTests += passed;
      console.log(`   ✅ Passed: ${passed}`);
    }

    if (failMatch) {
      const failed = parseInt(failMatch[1]);
      failedTests += failed;
      totalTests += failed;
      console.log(`   ❌ Failed: ${failed}`);
    }

  } catch (error) {
    console.log(`❌ Test execution failed: ${error.message}`);

    // Still try to extract results from error output
    if (error.stdout) {
      console.log('📊 Error Output:');
      console.log(error.stdout);
    }

    failedTests++;
    totalTests++;
  }
}

// Generate test summary
console.log('\n' + '='.repeat(60));
console.log('📊 PRODUCTION EPG TEST SUMMARY');
console.log('='.repeat(60));
console.log(`📍 Target Environment: ${PRODUCTION_URL}`);
console.log(`📅 Completed: ${new Date().toISOString()}`);
console.log(`🧪 Total Tests: ${totalTests}`);
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`📈 Success Rate: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);

// List generated screenshots
console.log('\n📸 Generated Screenshots:');
try {
  const screenshots = fs.readdirSync(screenshotsDir)
    .filter(file => file.startsWith('epg-prod-') || file.startsWith('freeview-'))
    .sort();

  screenshots.forEach(screenshot => {
    const filepath = path.join(screenshotsDir, screenshot);
    const stats = fs.statSync(filepath);
    console.log(`   📷 ${screenshot} (${Math.round(stats.size / 1024)}KB)`);
  });

  if (screenshots.length === 0) {
    console.log('   ⚠️ No EPG screenshots found');
  }
} catch (error) {
  console.log(`   ❌ Error reading screenshots: ${error.message}`);
}

// Provide next steps
console.log('\n🎯 NEXT STEPS:');
console.log('1. Review generated screenshots for visual verification');
console.log('2. Check console output for specific error details');
console.log('3. Verify FreeviewNEW source functionality');
console.log('4. Test channel association mappings');

if (failedTests > 0) {
  console.log('\n⚠️ FAILURES DETECTED:');
  console.log('- Review test output for specific failure details');
  console.log('- Check screenshot evidence of interface issues');
  console.log('- Verify production system accessibility');
  console.log('- Consider running individual tests for detailed analysis');
}

// Exit with appropriate code
process.exit(failedTests > 0 ? 1 : 0);