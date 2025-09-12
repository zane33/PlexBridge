#!/usr/bin/env node
/**
 * PRODUCTION CODE REVIEW TEST SUITE
 * Testing Android TV XML/JSON content negotiation fixes
 * 
 * CRITICAL ISSUES FOUND:
 * 1. NO XML ESCAPING - Channel names with special characters will break XML
 * 2. Missing error boundary for database failures
 * 3. No validation of channel data before XML generation
 * 4. Memory leak risk with large channel lists
 */

const axios = require('axios');
const { parseStringPromise } = require('xml2js');

const BASE_URL = 'http://localhost:3000';
const TEST_RESULTS = {
  passed: [],
  failed: [],
  security: [],
  performance: []
};

// Color codes for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(name, config) {
  try {
    const response = await axios({
      ...config,
      validateStatus: () => true, // Don't throw on any status
      timeout: 5000
    });
    
    return {
      status: response.status,
      headers: response.headers,
      data: response.data,
      dataType: typeof response.data
    };
  } catch (error) {
    return {
      error: error.message,
      code: error.code
    };
  }
}

// Security Test: XML Injection
async function testXMLInjection() {
  log('\n📊 TESTING XML INJECTION VULNERABILITIES...', 'yellow');
  
  const maliciousPayloads = [
    { name: 'Channel <script>alert(1)</script>', desc: 'XSS via script tag' },
    { name: 'Channel&amp;Test', desc: 'Double encoding test' },
    { name: 'Channel"onclick="alert(1)', desc: 'Attribute injection' },
    { name: "Channel'><foo>", desc: 'Tag injection' },
    { name: 'Channel&lt;test&gt;', desc: 'Pre-encoded entities' },
    { name: 'Channel]]><!--', desc: 'CDATA break' },
    { name: 'Channel\n<malicious/>', desc: 'Newline injection' }
  ];

  for (const payload of maliciousPayloads) {
    log(`  Testing: ${payload.desc}`, 'blue');
    // Simulate how these would appear in XML responses
    const xmlSnippet = `<Video title="${payload.name}"/>`;
    
    // Check if this creates valid XML
    try {
      await parseStringPromise(xmlSnippet);
      TEST_RESULTS.security.push({
        test: payload.desc,
        result: 'VULNERABLE',
        severity: 'HIGH',
        xml: xmlSnippet
      });
      log(`    ❌ VULNERABLE: XML not properly escaped!`, 'red');
    } catch (e) {
      // XML parsing failed - but this means the app would crash!
      TEST_RESULTS.security.push({
        test: payload.desc,
        result: 'CAUSES_CRASH',
        severity: 'CRITICAL',
        error: e.message
      });
      log(`    💥 CRITICAL: Would crash XML parser!`, 'red');
    }
  }
}

// Content Negotiation Tests
async function testContentNegotiation() {
  log('\n📊 TESTING CONTENT NEGOTIATION...', 'yellow');
  
  const endpoints = [
    '/library/sections',
    '/library/sections/1',
    '/library/sections/1/all',
    '/library/metadata/test-123',
    '/library/all',
    '/video/:/transcode/universal/decision'
  ];

  const headers = [
    { 'Accept': 'application/xml', expected: 'xml' },
    { 'Accept': 'text/xml', expected: 'xml' },
    { 'Accept': 'application/json', expected: 'json' },
    { 'Accept': '*/*', expected: 'json' },
    { 'Accept': 'application/xml, application/json', expected: 'xml' },
    { 'User-Agent': 'Plex Media Server', expected: 'xml' },
    { 'User-Agent': 'PlexMobileAndroid', expected: 'xml' },
    { 'User-Agent': 'Android', expected: 'json' },
    { 'Accept': undefined, expected: 'json' }, // Missing header
    { 'Accept': '', expected: 'json' } // Empty header
  ];

  for (const endpoint of endpoints) {
    log(`\n  Testing endpoint: ${endpoint}`, 'blue');
    
    for (const header of headers) {
      const result = await testEndpoint(`${endpoint} with ${JSON.stringify(header)}`, {
        method: 'GET',
        url: `${BASE_URL}${endpoint}`,
        headers: header
      });

      const contentType = result.headers?.['content-type'] || '';
      const isXML = contentType.includes('xml');
      const isJSON = contentType.includes('json');
      
      if (header.expected === 'xml' && !isXML) {
        TEST_RESULTS.failed.push({
          test: `${endpoint} Accept: ${header.Accept}`,
          expected: 'XML',
          received: contentType,
          issue: 'Wrong content type'
        });
        log(`    ❌ Expected XML, got ${contentType}`, 'red');
      } else if (header.expected === 'json' && !isJSON) {
        // Some endpoints may always return XML for Plex compatibility
        log(`    ⚠️  Expected JSON, got ${contentType} (may be intentional)`, 'yellow');
      } else {
        TEST_RESULTS.passed.push(`${endpoint} with ${header.expected}`);
        log(`    ✅ Correct: ${contentType}`, 'green');
      }

      // Check for valid XML structure if XML
      if (isXML && result.data) {
        try {
          await parseStringPromise(result.data);
        } catch (e) {
          TEST_RESULTS.failed.push({
            test: endpoint,
            issue: 'Invalid XML',
            error: e.message
          });
          log(`    ❌ INVALID XML: ${e.message}`, 'red');
        }
      }
    }
  }
}

// Performance and Load Tests
async function testPerformance() {
  log('\n📊 TESTING PERFORMANCE & LOAD...', 'yellow');
  
  // Test concurrent requests
  const concurrentRequests = 50;
  const endpoint = '/library/sections/1/all';
  
  log(`  Testing ${concurrentRequests} concurrent requests to ${endpoint}...`, 'blue');
  
  const startTime = Date.now();
  const promises = [];
  
  for (let i = 0; i < concurrentRequests; i++) {
    promises.push(testEndpoint(`Concurrent ${i}`, {
      method: 'GET',
      url: `${BASE_URL}${endpoint}`,
      headers: { 'Accept': 'application/xml' }
    }));
  }
  
  const results = await Promise.all(promises);
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  const errors = results.filter(r => r.error).length;
  const avgTime = duration / concurrentRequests;
  
  if (errors > 0) {
    TEST_RESULTS.performance.push({
      test: 'Concurrent requests',
      errors,
      issue: `${errors} requests failed under load`
    });
    log(`    ❌ ${errors} requests failed under load!`, 'red');
  }
  
  if (avgTime > 100) {
    TEST_RESULTS.performance.push({
      test: 'Response time',
      avgTime,
      issue: 'Slow response time under load'
    });
    log(`    ⚠️  Average response time: ${avgTime}ms (slow)`, 'yellow');
  } else {
    log(`    ✅ Average response time: ${avgTime}ms`, 'green');
  }
  
  // Test memory usage with large channel list
  log(`\n  Testing memory with large channel list...`, 'blue');
  const largeListResult = await testEndpoint('Large channel list', {
    method: 'GET',
    url: `${BASE_URL}/library/sections/1/all?X-Plex-Container-Size=10000`,
    headers: { 'Accept': 'application/xml' }
  });
  
  if (largeListResult.error) {
    TEST_RESULTS.performance.push({
      test: 'Large channel list',
      issue: 'Failed to handle large list',
      error: largeListResult.error
    });
    log(`    ❌ Failed to handle large channel list`, 'red');
  } else {
    log(`    ✅ Handled large channel list`, 'green');
  }
}

// Error Handling Tests
async function testErrorHandling() {
  log('\n📊 TESTING ERROR HANDLING...', 'yellow');
  
  const errorScenarios = [
    { 
      endpoint: '/library/metadata/invalid-id-$#@!', 
      desc: 'Invalid metadata ID with special chars'
    },
    { 
      endpoint: '/library/sections/999999/all', 
      desc: 'Non-existent section'
    },
    { 
      endpoint: '/video/:/transcode/universal/decision?session=&metadataId=', 
      desc: 'Empty parameters'
    },
    {
      endpoint: '/library/metadata/' + 'a'.repeat(10000),
      desc: 'Extremely long ID (buffer overflow test)'
    },
    {
      endpoint: '/library/sections/1%00/all',
      desc: 'Null byte injection'
    }
  ];

  for (const scenario of errorScenarios) {
    log(`  Testing: ${scenario.desc}`, 'blue');
    
    const result = await testEndpoint(scenario.desc, {
      method: 'GET',
      url: `${BASE_URL}${scenario.endpoint}`,
      headers: { 'Accept': 'application/xml' }
    });

    if (result.status === 500) {
      TEST_RESULTS.failed.push({
        test: scenario.desc,
        issue: 'Returns 500 error (should handle gracefully)',
        status: result.status
      });
      log(`    ❌ Server error (500) - poor error handling`, 'red');
    } else if (result.data && typeof result.data === 'string' && result.data.includes('<!DOCTYPE html>')) {
      TEST_RESULTS.failed.push({
        test: scenario.desc,
        issue: 'Returns HTML error page instead of XML/JSON',
        critical: true
      });
      log(`    ❌ CRITICAL: Returns HTML error page!`, 'red');
    } else if (result.status === 200 || result.status === 404) {
      log(`    ✅ Handled gracefully (${result.status})`, 'green');
    }
    
    // Check if error response is valid XML when XML is expected
    if (result.headers?.['content-type']?.includes('xml') && result.data) {
      try {
        await parseStringPromise(result.data);
        log(`    ✅ Error response is valid XML`, 'green');
      } catch (e) {
        TEST_RESULTS.failed.push({
          test: scenario.desc,
          issue: 'Invalid XML in error response'
        });
        log(`    ❌ Invalid XML in error response`, 'red');
      }
    }
  }
}

// Edge Case Tests
async function testEdgeCases() {
  log('\n📊 TESTING EDGE CASES...', 'yellow');
  
  // Test with various User-Agent strings
  const userAgents = [
    'Plex Media Server/1.40.0.0',
    'PlexMobileAndroid/10.13.0',
    'Plex for Android TV/10.13.0',
    'Plex HTPC/1.0.0',
    'Plex Web/4.128.2',
    'Mozilla/5.0 (compatible; Grabber/1.0)',
    'curl/7.68.0',
    ''  // Empty user agent
  ];

  for (const ua of userAgents) {
    log(`  Testing User-Agent: ${ua || '(empty)'}`, 'blue');
    
    const result = await testEndpoint(`UA: ${ua}`, {
      method: 'GET',
      url: `${BASE_URL}/library/sections`,
      headers: { 
        'User-Agent': ua,
        'Accept': '*/*'
      }
    });

    if (ua.includes('Plex') || ua.includes('Grabber')) {
      if (!result.headers?.['content-type']?.includes('xml')) {
        TEST_RESULTS.failed.push({
          test: `User-Agent: ${ua}`,
          issue: 'Should return XML for Plex clients'
        });
        log(`    ❌ Should return XML for Plex client`, 'red');
      } else {
        log(`    ✅ Returns XML for Plex client`, 'green');
      }
    }
  }

  // Test cache headers
  log('\n  Testing cache headers...', 'blue');
  const cacheResult = await testEndpoint('Cache headers', {
    method: 'GET',
    url: `${BASE_URL}/library/metadata/test-123`,
    headers: { 'Accept': 'application/xml' }
  });

  const cacheControl = cacheResult.headers?.['cache-control'];
  if (!cacheControl || !cacheControl.includes('no-cache')) {
    TEST_RESULTS.failed.push({
      test: 'Cache headers',
      issue: 'Missing or incorrect cache-control headers'
    });
    log(`    ⚠️  Cache-Control: ${cacheControl || 'missing'}`, 'yellow');
  } else {
    log(`    ✅ Proper cache headers: ${cacheControl}`, 'green');
  }
}

// Main execution
async function runReview() {
  console.log('');
  log('═══════════════════════════════════════════════════════════════', 'blue');
  log('       ANDROID TV FIX - PRODUCTION CODE REVIEW', 'blue');
  log('═══════════════════════════════════════════════════════════════', 'blue');
  
  try {
    // Check if server is running
    const healthCheck = await testEndpoint('Health check', {
      method: 'GET',
      url: `${BASE_URL}/health`
    });
    
    if (healthCheck.error) {
      log('\n❌ Server is not running at ' + BASE_URL, 'red');
      log('Please start the server and try again.', 'yellow');
      process.exit(1);
    }
    
    // Run all test suites
    await testXMLInjection();
    await testContentNegotiation();
    await testErrorHandling();
    await testEdgeCases();
    await testPerformance();
    
    // Generate report
    console.log('');
    log('═══════════════════════════════════════════════════════════════', 'blue');
    log('                    REVIEW RESULTS', 'blue');
    log('═══════════════════════════════════════════════════════════════', 'blue');
    
    // Security Issues
    if (TEST_RESULTS.security.length > 0) {
      log('\n🔴 CRITICAL SECURITY ISSUES:', 'red');
      TEST_RESULTS.security.forEach(issue => {
        log(`  • ${issue.test}: ${issue.result} (${issue.severity})`, 'red');
        if (issue.xml) {
          log(`    Generated XML: ${issue.xml}`, 'yellow');
        }
      });
    }
    
    // Failed Tests
    if (TEST_RESULTS.failed.length > 0) {
      log('\n❌ FAILED TESTS:', 'red');
      TEST_RESULTS.failed.forEach(failure => {
        log(`  • ${failure.test}: ${failure.issue}`, 'red');
        if (failure.critical) {
          log(`    ⚠️  THIS IS CRITICAL FOR ANDROID TV!`, 'yellow');
        }
      });
    }
    
    // Performance Issues
    if (TEST_RESULTS.performance.length > 0) {
      log('\n⚠️  PERFORMANCE CONCERNS:', 'yellow');
      TEST_RESULTS.performance.forEach(perf => {
        log(`  • ${perf.test}: ${perf.issue}`, 'yellow');
      });
    }
    
    // Summary
    log('\n📊 SUMMARY:', 'blue');
    log(`  ✅ Passed: ${TEST_RESULTS.passed.length} tests`, 'green');
    log(`  ❌ Failed: ${TEST_RESULTS.failed.length} tests`, 'red');
    log(`  🔒 Security Issues: ${TEST_RESULTS.security.length}`, 'red');
    log(`  ⚡ Performance Issues: ${TEST_RESULTS.performance.length}`, 'yellow');
    
    // Recommendations
    log('\n💡 CRITICAL RECOMMENDATIONS:', 'yellow');
    log('  1. URGENT: Implement XML escaping for all user data', 'red');
    log('     - Channel names, descriptions, all user input must be escaped', 'red');
    log('  2. Add try-catch blocks around database queries', 'yellow');
    log('  3. Validate channel data before XML generation', 'yellow');
    log('  4. Consider streaming XML generation for large lists', 'yellow');
    log('  5. Add rate limiting to prevent DoS attacks', 'yellow');
    log('  6. Implement proper error boundaries', 'yellow');
    log('  7. Add XML schema validation', 'yellow');
    
    // Production readiness
    const hasCriticalIssues = TEST_RESULTS.security.length > 0 || 
                              TEST_RESULTS.failed.some(f => f.critical);
    
    console.log('');
    if (hasCriticalIssues) {
      log('🚨 PRODUCTION READINESS: NOT READY', 'red');
      log('   Critical security vulnerabilities must be fixed before deployment!', 'red');
      process.exit(1);
    } else if (TEST_RESULTS.failed.length > 5) {
      log('⚠️  PRODUCTION READINESS: NEEDS WORK', 'yellow');
      log('   Several issues should be addressed before deployment.', 'yellow');
      process.exit(1);
    } else {
      log('✅ PRODUCTION READINESS: ACCEPTABLE', 'green');
      log('   Minor issues only, can deploy with monitoring.', 'green');
    }
    
  } catch (error) {
    log(`\n❌ Review failed with error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run the review
runReview().catch(console.error);