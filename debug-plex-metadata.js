#!/usr/bin/env node

/**
 * Plex Metadata Diagnostic Tool
 * 
 * This tool tests all PlexBridge endpoints to ensure no type 5 metadata is being sent.
 * Run this before and after Plex server restart to verify fixes.
 */

const axios = require('axios');
const chalk = require('chalk'); // For colored output

// Configuration
const PLEXBRIDGE_BASE_URL = process.env.PLEXBRIDGE_URL || 'http://192.168.4.56:3000';
const TIMEOUT = 10000; // 10 seconds

// Test endpoints that Plex accesses
const PLEX_ENDPOINTS = [
  '/discover.json',
  '/lineup.json', 
  '/lineup_status.json',
  '/device.xml',
  '/library/metadata/1',
  '/timeline/1',
  '/consumer/test-session/start'
];

/**
 * Check for type 5 issues in response data
 */
function checkForType5Issues(data, endpoint) {
  const issues = [];
  
  function deepCheck(obj, path = '') {
    if (typeof obj !== 'object' || obj === null) return;
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => deepCheck(item, `${path}[${index}]`));
      return;
    }
    
    // Check for type 5 issues
    Object.keys(obj).forEach(key => {
      const fullPath = path ? `${path}.${key}` : key;
      const value = obj[key];
      
      // Check for various type 5 patterns
      if (key.toLowerCase().includes('type') && (value === 5 || value === '5')) {
        issues.push({
          endpoint,
          path: fullPath,
          key,
          value,
          severity: 'CRITICAL',
          message: `Found type 5 in ${key}`
        });
      }
      
      if (key.toLowerCase().includes('contenttype') && (value === 5 || value === '5')) {
        issues.push({
          endpoint,
          path: fullPath, 
          key,
          value,
          severity: 'CRITICAL',
          message: `Found contentType 5 in ${key}`
        });
      }
      
      if (key.toLowerCase().includes('mediatype') && (value === '5' || value === 'trailer')) {
        issues.push({
          endpoint,
          path: fullPath,
          key,
          value, 
          severity: 'WARNING',
          message: `Found invalid mediaType in ${key}`
        });
      }
      
      // Recurse into nested objects
      if (typeof value === 'object' && value !== null) {
        deepCheck(value, fullPath);
      }
    });
  }
  
  deepCheck(data);
  return issues;
}

/**
 * Test a single endpoint with different client types
 */
async function testEndpoint(endpoint, clientType = 'diagnostic') {
  try {
    const clientHeaders = {
      'diagnostic': {
        'User-Agent': 'PlexBridge-Diagnostic-Tool/1.0',
        'Accept': 'application/json, application/xml'
      },
      'web': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Plex/4.15.1',
        'Accept': 'application/json, text/html',
        'origin': 'https://app.plex.tv',
        'referer': 'https://app.plex.tv/desktop',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'cors'
      },
      'android-tv': {
        'User-Agent': 'Plex/9.0.0 (Android 11; Shield Android TV) PlexMediaPlayer/2.58.2',
        'Accept': 'application/json'
      }
    };
    
    const headers = clientHeaders[clientType] || clientHeaders.diagnostic;
    console.log(chalk.blue(`Testing: ${endpoint} (${clientType} client)`));
    
    const response = await axios.get(`${PLEXBRIDGE_BASE_URL}${endpoint}`, {
      timeout: TIMEOUT,
      headers
    });
    
    const issues = checkForType5Issues(response.data, endpoint);
    
    if (issues.length === 0) {
      console.log(chalk.green(`✅ ${endpoint} - No type 5 issues found`));
      return { endpoint, status: 'OK', issues: [] };
    } else {
      console.log(chalk.red(`❌ ${endpoint} - Found ${issues.length} issues:`));
      issues.forEach(issue => {
        const color = issue.severity === 'CRITICAL' ? chalk.red : chalk.yellow;
        console.log(color(`   ${issue.severity}: ${issue.message} at ${issue.path}`));
      });
      return { endpoint, status: 'ISSUES', issues };
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ ${endpoint} - Error: ${error.message}`));
    return { endpoint, status: 'ERROR', error: error.message };
  }
}

/**
 * Main diagnostic function
 */
async function runDiagnostics() {
  console.log(chalk.bold.blue('🔍 PlexBridge Metadata Type 5 Diagnostic Tool'));
  console.log(chalk.blue(`Testing PlexBridge at: ${PLEXBRIDGE_BASE_URL}`));
  console.log(chalk.blue(`Timeout: ${TIMEOUT}ms\n`));
  
  const results = [];
  
  // Test with web client headers (most important for type 5 issues)
  console.log(chalk.bold.yellow('Testing with WEB CLIENT headers (Chrome + Plex Web):'));
  console.log('='.repeat(60));
  
  for (const endpoint of PLEX_ENDPOINTS) {
    const result = await testEndpoint(endpoint, 'web');
    result.clientType = 'web';
    results.push(result);
    console.log(); // Empty line for readability
  }
  
  console.log(chalk.bold.cyan('\nTesting with ANDROID TV headers:'));
  console.log('='.repeat(40));
  
  for (const endpoint of PLEX_ENDPOINTS) {
    const result = await testEndpoint(endpoint, 'android-tv');
    result.clientType = 'android-tv';
    results.push(result);
    console.log(); // Empty line for readability
  }
  
  // Summary
  console.log(chalk.bold.blue('📊 DIAGNOSTIC SUMMARY'));
  console.log('='.repeat(50));
  
  const okCount = results.filter(r => r.status === 'OK').length;
  const issueCount = results.filter(r => r.status === 'ISSUES').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;
  
  console.log(chalk.green(`✅ Endpoints OK: ${okCount}`));
  console.log(chalk.red(`❌ Endpoints with Type 5 Issues: ${issueCount}`));
  console.log(chalk.yellow(`⚠️  Endpoints with Errors: ${errorCount}`));
  
  // Detailed issue summary
  const allIssues = results
    .filter(r => r.status === 'ISSUES')
    .flatMap(r => r.issues);
  
  if (allIssues.length > 0) {
    console.log(chalk.red(`\n🚨 CRITICAL ISSUES FOUND (${allIssues.length} total):`));
    allIssues.forEach((issue, index) => {
      console.log(chalk.red(`${index + 1}. ${issue.endpoint}: ${issue.message}`));
    });
    
    console.log(chalk.bold.red('\n❌ RESULT: Type 5 metadata detected - Plex crashes likely'));
    console.log(chalk.yellow('ACTION REQUIRED: Fix metadata issues and restart PlexBridge'));
  } else {
    console.log(chalk.bold.green('\n✅ RESULT: No type 5 metadata detected - PlexBridge is clean'));
    console.log(chalk.blue('If you still see Plex type 5 errors, restart your Plex server to clear cache'));
  }
  
  // Instructions
  console.log(chalk.bold.blue('\n📋 NEXT STEPS:'));
  if (allIssues.length > 0) {
    console.log(chalk.yellow('1. Fix the type 5 issues shown above'));
    console.log(chalk.yellow('2. Restart PlexBridge: docker-compose restart plextv'));
    console.log(chalk.yellow('3. Re-run this diagnostic: node debug-plex-metadata.js'));
    console.log(chalk.yellow('4. Once clean, restart your Plex server'));
  } else {
    console.log(chalk.green('1. PlexBridge metadata is clean ✅'));
    console.log(chalk.blue('2. Restart your Plex server to clear cached metadata'));
    console.log(chalk.blue('3. Remove and re-add PlexBridge in Plex Live TV settings'));
    console.log(chalk.blue('4. Run a new channel scan in Plex'));
    console.log(chalk.green('5. Type 5 errors should be eliminated ✅'));
  }
  
  console.log(chalk.gray(`\nDiagnostic completed at: ${new Date().toISOString()}`));
}

// Run diagnostics if called directly
if (require.main === module) {
  runDiagnostics().catch(error => {
    console.error(chalk.red('Diagnostic tool error:', error.message));
    process.exit(1);
  });
}

module.exports = { runDiagnostics, testEndpoint, checkForType5Issues };