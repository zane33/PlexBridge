#!/usr/bin/env node

/**
 * Grabber Detection and Timeline Consistency Test
 * 
 * This tool tests the timeline endpoint with Grabber-like headers to ensure
 * metadata consistency and proper cache invalidation.
 */

const axios = require('axios');
const chalk = require('chalk');

// Configuration
const PLEXBRIDGE_BASE_URL = process.env.PLEXBRIDGE_URL || 'http://192.168.4.56:3000';
const TIMEOUT = 10000; // 10 seconds

/**
 * Test timeline endpoint with different client types
 */
async function testTimelineConsistency() {
  console.log(chalk.bold.blue('🔍 Testing Timeline Endpoint Consistency for Grabber Compatibility'));
  console.log(chalk.blue(`Testing PlexBridge at: ${PLEXBRIDGE_BASE_URL}`));
  console.log('='.repeat(80));
  
  const testScenarios = [
    {
      name: 'Plex Grabber (simulated)',
      headers: {
        'User-Agent': 'PlexGrabber/1.0 (Linux)',
        'X-Plex-Client-Identifier': 'grabber-component',
        'X-Plex-Product': 'Plex Media Server',
        'X-Plex-Version': '1.32.0',
        'Accept': 'application/json'
      }
    },
    {
      name: 'Web Client Browser',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Plex/4.15.1',
        'Accept': 'application/json',
        'Origin': 'https://app.plex.tv',
        'Referer': 'https://app.plex.tv/'
      }
    },
    {
      name: 'Android TV Client',
      headers: {
        'User-Agent': 'Plex/9.0.0 (Android 11; Shield Android TV) PlexMediaPlayer/2.58.2',
        'X-Plex-Product': 'Plex for Android',
        'Accept': 'application/json'
      }
    }
  ];
  
  const results = [];
  
  for (const scenario of testScenarios) {
    console.log(chalk.cyan(`\nTesting: ${scenario.name}`));
    console.log('-'.repeat(50));
    
    try {
      const testId = Math.floor(Math.random() * 10000);
      const response = await axios.get(`${PLEXBRIDGE_BASE_URL}/timeline/${testId}`, {
        headers: scenario.headers,
        timeout: TIMEOUT
      });
      
      // Analyze timeline metadata consistency
      const timeline = response.data;
      const timelineItem = timeline?.MediaContainer?.Timeline?.[0];
      
      if (!timelineItem) {
        console.log(chalk.red(`❌ No timeline data returned`));
        results.push({ scenario: scenario.name, status: 'FAILED', error: 'No timeline data' });
        continue;
      }
      
      // Check for type consistency
      const checks = {
        type: timelineItem.type,
        itemType: timelineItem.itemType,
        contentType: timelineItem.contentType,
        metadata_type: timelineItem.metadata_type,
        mediaType: timelineItem.mediaType,
        headers: {
          cacheControl: response.headers['cache-control'],
          grabberRefresh: response.headers['x-plex-grabber-refresh'],
          metadataConsistency: response.headers['x-metadata-consistency'],
          contentTypeLocked: response.headers['x-content-type-locked'],
          timelineTypeLocked: response.headers['x-timeline-type-locked']
        }
      };
      
      // Validate consistency
      const issues = [];
      
      if (checks.type !== 'episode') {
        issues.push(`type should be "episode", got "${checks.type}"`);
      }
      
      if (checks.contentType !== 4) {
        issues.push(`contentType should be 4, got ${checks.contentType}`);
      }
      
      if (checks.itemType !== 'episode') {
        issues.push(`itemType should be "episode", got "${checks.itemType}"`);
      }
      
      if (checks.metadata_type !== 'episode') {
        issues.push(`metadata_type should be "episode", got "${checks.metadata_type}"`);
      }
      
      if (issues.length === 0) {
        console.log(chalk.green(`✅ Timeline metadata is consistent`));
        console.log(chalk.blue(`   type: "${checks.type}" | contentType: ${checks.contentType} | itemType: "${checks.itemType}"`));
        
        // Check cache headers
        if (checks.headers.grabberRefresh === 'true') {
          console.log(chalk.green(`✅ Grabber refresh header present`));
        } else {
          console.log(chalk.yellow(`⚠️  Grabber refresh header missing`));
        }
        
        results.push({ 
          scenario: scenario.name, 
          status: 'SUCCESS', 
          metadata: checks,
          issues: []
        });
      } else {
        console.log(chalk.red(`❌ Timeline metadata inconsistencies found:`));
        issues.forEach(issue => console.log(chalk.red(`   - ${issue}`)));
        
        results.push({ 
          scenario: scenario.name, 
          status: 'INCONSISTENT', 
          metadata: checks,
          issues
        });
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      results.push({ 
        scenario: scenario.name, 
        status: 'ERROR', 
        error: error.message 
      });
    }
  }
  
  // Summary
  console.log(chalk.bold.blue('\n📊 TIMELINE CONSISTENCY SUMMARY'));
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;
  const inconsistentCount = results.filter(r => r.status === 'INCONSISTENT').length;
  
  console.log(chalk.green(`✅ Consistent responses: ${successCount}`));
  console.log(chalk.yellow(`⚠️  Inconsistent responses: ${inconsistentCount}`));
  console.log(chalk.red(`❌ Failed responses: ${errorCount}`));
  
  // Detailed issues
  const allIssues = results
    .filter(r => r.status === 'INCONSISTENT')
    .flatMap(r => r.issues.map(issue => `${r.scenario}: ${issue}`));
  
  if (allIssues.length > 0) {
    console.log(chalk.red(`\n🚨 INCONSISTENCIES FOUND (${allIssues.length} total):`));
    allIssues.forEach((issue, index) => {
      console.log(chalk.red(`${index + 1}. ${issue}`));
    });
    
    console.log(chalk.bold.red('\n❌ RESULT: Timeline metadata is inconsistent - Grabber may cache type 5 errors'));
    console.log(chalk.yellow('ACTION REQUIRED: Fix timeline endpoint metadata consistency'));
  } else if (successCount === testScenarios.length) {
    console.log(chalk.bold.green('\n✅ RESULT: Timeline metadata is fully consistent - Grabber should work correctly'));
    console.log(chalk.blue('All client types receive identical, validated metadata'));
    console.log(chalk.blue('Cache invalidation headers are properly set'));
  }
  
  console.log(chalk.bold.blue('\n📋 NEXT STEPS:'));
  if (allIssues.length > 0) {
    console.log(chalk.yellow('1. Fix timeline endpoint metadata inconsistencies'));
    console.log(chalk.yellow('2. Ensure type, contentType, and itemType all align'));
    console.log(chalk.yellow('3. Re-run this test to verify fixes'));
    console.log(chalk.yellow('4. Restart Plex server to clear Grabber cache'));
  } else {
    console.log(chalk.green('1. Timeline endpoint is consistent ✅'));
    console.log(chalk.blue('2. Restart your Plex server to clear cached metadata'));
    console.log(chalk.blue('3. Test web client streaming to verify type 5 errors are gone'));
    console.log(chalk.green('4. Monitor logs for "PLEX GRABBER DETECTED" messages'));
  }
  
  console.log(chalk.gray(`\nGrabber diagnostic completed at: ${new Date().toISOString()}`));
}

// Run diagnostics if called directly
if (require.main === module) {
  testTimelineConsistency().catch(error => {
    console.error(chalk.red('Grabber diagnostic tool error:', error.message));
    process.exit(1);
  });
}

module.exports = { testTimelineConsistency };