#!/usr/bin/env node

/**
 * EPG Refresh Diagnostic Script
 *
 * This script verifies that EPG refresh scheduling is working correctly
 * and can trigger manual refreshes for testing.
 *
 * Usage:
 *   node scripts/test-epg-refresh.js [sourceId]
 *
 * If sourceId is provided, triggers a manual refresh for that source.
 * Otherwise, displays all scheduled EPG jobs and their next execution times.
 */

const path = require('path');
const database = require('../server/services/database');
const epgService = require('../server/services/epgService');
const logger = require('../server/utils/logger');

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('EPG REFRESH DIAGNOSTIC TOOL');
    console.log('='.repeat(80));
    console.log('');

    // Initialize database
    console.log('Initializing database...');
    await database.initialize();
    console.log('✅ Database initialized');
    console.log('');

    // Initialize EPG service
    console.log('Initializing EPG service...');
    await epgService.initialize();
    console.log('✅ EPG service initialized');
    console.log('');

    // Get command line arguments
    const sourceId = process.argv[2];

    if (sourceId) {
      // Manual refresh mode
      console.log('='.repeat(80));
      console.log(`TRIGGERING MANUAL REFRESH FOR SOURCE: ${sourceId}`);
      console.log('='.repeat(80));
      console.log('');

      // Get source details
      const source = await database.get('SELECT * FROM epg_sources WHERE id = ?', [sourceId]);

      if (!source) {
        console.error(`❌ ERROR: EPG source '${sourceId}' not found`);
        process.exit(1);
      }

      console.log('Source Details:');
      console.log(`  ID: ${source.id}`);
      console.log(`  Name: ${source.name}`);
      console.log(`  URL: ${source.url}`);
      console.log(`  Enabled: ${source.enabled ? 'Yes' : 'No'}`);
      console.log(`  Refresh Interval: ${source.refresh_interval}`);
      console.log(`  Last Refresh: ${source.last_refresh || 'Never'}`);
      console.log(`  Last Success: ${source.last_success || 'Never'}`);
      console.log(`  Last Error: ${source.last_error || 'None'}`);
      console.log('');

      console.log('Starting refresh...');
      const startTime = Date.now();

      try {
        const result = await epgService.refreshSource(sourceId);
        const duration = Date.now() - startTime;

        console.log('');
        console.log('✅ REFRESH COMPLETED SUCCESSFULLY');
        console.log(`  Duration: ${duration}ms`);
        console.log('  Result:', JSON.stringify(result, null, 2));
      } catch (refreshError) {
        console.error('');
        console.error('❌ REFRESH FAILED');
        console.error(`  Error: ${refreshError.message}`);
        console.error(`  Stack: ${refreshError.stack}`);
        process.exit(1);
      }
    } else {
      // Diagnostic mode - show all jobs
      console.log('='.repeat(80));
      console.log('EPG JOB STATUS');
      console.log('='.repeat(80));
      console.log('');

      // Get all EPG sources
      const sources = await database.all('SELECT * FROM epg_sources');

      if (sources.length === 0) {
        console.log('No EPG sources configured.');
        console.log('');
        console.log('To add an EPG source, use the web interface or API:');
        console.log('  POST /api/epg-sources');
        process.exit(0);
      }

      console.log(`Found ${sources.length} EPG source(s):`);
      console.log('');

      // Get active jobs status
      const activeJobs = epgService.getActiveJobs();

      for (const source of sources) {
        const hasJob = activeJobs.jobs.some(job => job.sourceId === source.id);
        const jobInfo = activeJobs.jobs.find(job => job.sourceId === source.id);

        // Calculate cron expression and next run
        const interval = epgService.parseInterval(source.refresh_interval);
        const cronExpression = epgService.intervalToCron(interval, source.id);
        const nextRun = epgService.getNextCronExecution(cronExpression);
        const minutesUntilNext = nextRun ? Math.round((nextRun - new Date()) / 60000) : null;

        console.log('-'.repeat(80));
        console.log(`Source: ${source.name} (${source.id})`);
        console.log(`  URL: ${source.url}`);
        console.log(`  Enabled: ${source.enabled ? '✅ Yes' : '❌ No'}`);
        console.log(`  Refresh Interval: ${source.refresh_interval}`);
        console.log(`  Cron Expression: ${cronExpression}`);
        console.log(`  Job Scheduled: ${hasJob ? '✅ Yes' : '❌ No'}`);

        if (jobInfo) {
          console.log(`  Job Running: ${jobInfo.isRunning ? '🔄 Yes' : '⏸️  No'}`);
        }

        if (nextRun) {
          console.log(`  Next Execution: ${nextRun.toISOString()}`);
          console.log(`  Minutes Until Next: ${minutesUntilNext} minutes`);
        } else {
          console.log(`  Next Execution: ⚠️  Unable to calculate`);
        }

        console.log(`  Last Refresh: ${source.last_refresh || 'Never'}`);
        console.log(`  Last Success: ${source.last_success || 'Never'}`);

        if (source.last_error) {
          console.log(`  Last Error: ⚠️  ${source.last_error}`);
        } else {
          console.log(`  Last Error: None`);
        }

        // Get program count for this source
        const programCount = await database.get(`
          SELECT COUNT(*) as count
          FROM epg_programs
          WHERE channel_id IN (
            SELECT epg_id FROM epg_channels WHERE source_id = ?
          )
        `, [source.id]);

        console.log(`  Programs Stored: ${programCount?.count || 0}`);
        console.log('');
      }

      console.log('='.repeat(80));
      console.log('OVERALL STATUS');
      console.log('='.repeat(80));
      console.log(`  EPG Service Initialized: ${epgService.isInitialized ? '✅ Yes' : '❌ No'}`);
      console.log(`  Total Sources: ${sources.length}`);
      console.log(`  Enabled Sources: ${sources.filter(s => s.enabled).length}`);
      console.log(`  Scheduled Jobs: ${activeJobs.totalJobs}`);
      console.log(`  Running Jobs: ${activeJobs.jobs.filter(j => j.isRunning).length}`);
      console.log('');

      // Check for issues
      const issues = [];

      if (!epgService.isInitialized) {
        issues.push('EPG service is not initialized');
      }

      if (sources.filter(s => s.enabled).length !== activeJobs.totalJobs) {
        issues.push(`Mismatch: ${sources.filter(s => s.enabled).length} enabled sources but ${activeJobs.totalJobs} scheduled jobs`);
      }

      const sourcesWithErrors = sources.filter(s => s.last_error);
      if (sourcesWithErrors.length > 0) {
        issues.push(`${sourcesWithErrors.length} source(s) have errors`);
      }

      const neverRefreshed = sources.filter(s => s.enabled && !s.last_success);
      if (neverRefreshed.length > 0) {
        issues.push(`${neverRefreshed.length} enabled source(s) have never been successfully refreshed`);
      }

      if (issues.length > 0) {
        console.log('⚠️  ISSUES DETECTED:');
        issues.forEach((issue, index) => {
          console.log(`  ${index + 1}. ${issue}`);
        });
        console.log('');
      } else {
        console.log('✅ No issues detected. EPG refresh system appears to be working correctly.');
        console.log('');
      }

      // Provide usage hints
      console.log('='.repeat(80));
      console.log('USAGE HINTS');
      console.log('='.repeat(80));
      console.log('To manually trigger a refresh for a specific source:');
      console.log(`  node scripts/test-epg-refresh.js <sourceId>`);
      console.log('');
      console.log('To trigger via API:');
      console.log(`  curl -X POST http://localhost:8080/api/epg/force-refresh/<sourceId>`);
      console.log('');
      console.log('To view EPG debug info via API:');
      console.log('  curl http://localhost:8080/epg/debug/jobs');
      console.log('');
    }

    // Clean shutdown
    await database.close();
    console.log('✅ Diagnostic complete');
    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ CRITICAL ERROR');
    console.error(`  Message: ${error.message}`);
    console.error(`  Stack: ${error.stack}`);
    process.exit(1);
  }
}

// Run the diagnostic
main();
