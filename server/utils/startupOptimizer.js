/**
 * Startup Optimizer for PlexBridge
 * Initializes performance optimizations to prevent Android TV issues
 */

const logger = require('./logger');
const { optimizeDatabase } = require('./dbOptimization');
const { preloadCache } = require('./performanceOptimizer');
const { getChannelMetadataCache } = require('./channelSwitchingFix');

/**
 * Runs all startup optimizations
 */
async function initializePerformanceOptimizations(database) {
  logger.info('🚀 Initializing PlexBridge performance optimizations...');
  
  const results = {
    database: { success: false },
    cache: { success: false },
    timing: {}
  };

  try {
    // 1. Optimize database
    const dbStart = Date.now();
    logger.info('Optimizing database for Plex Android TV compatibility...');
    results.database = await optimizeDatabase(database);
    results.timing.database = Date.now() - dbStart;
    
    if (results.database.success) {
      logger.info(`✅ Database optimized in ${results.timing.database}ms`);
    } else {
      logger.error('❌ Database optimization failed:', results.database.error);
    }

    // 2. Preload cache
    const cacheStart = Date.now();
    logger.info('Preloading cache for fast responses...');
    try {
      await preloadCache(database);
      
      // Initialize channel metadata cache for fast switching
      const channelCache = getChannelMetadataCache();
      await channelCache.refreshAllChannelMetadata();
      
      results.cache.success = true;
      results.timing.cache = Date.now() - cacheStart;
      logger.info(`✅ Cache and channel metadata preloaded in ${results.timing.cache}ms`);
    } catch (error) {
      results.cache.error = error.message;
      results.timing.cache = Date.now() - cacheStart;
      logger.error('❌ Cache preload failed:', error);
    }

    // 3. Verify performance improvements
    logger.info('Verifying performance improvements...');
    const testStart = Date.now();
    
    // Test critical queries
    try {
      await database.get(`
        SELECT p.channel_id, p.title 
        FROM epg_programs p 
        WHERE p.start_time <= datetime('now') AND p.end_time > datetime('now') 
        LIMIT 1
      `);
      results.timing.queryTest = Date.now() - testStart;
      
      if (results.timing.queryTest > 50) {
        logger.warn(`Query test took ${results.timing.queryTest}ms - may need further optimization`);
      } else {
        logger.info(`✅ Query performance verified: ${results.timing.queryTest}ms`);
      }
    } catch (error) {
      logger.error('Query test failed:', error);
    }

    const totalTime = Object.values(results.timing).reduce((a, b) => a + b, 0);
    logger.info(`🎯 Performance optimization complete in ${totalTime}ms`);

    // Log optimization summary
    logger.info('Performance Optimization Summary:', {
      database: results.database.success ? '✅ Optimized' : '❌ Failed',
      cache: results.cache.success ? '✅ Preloaded' : '❌ Failed',
      totalTime: `${totalTime}ms`,
      queryPerformance: results.timing.queryTest ? `${results.timing.queryTest}ms` : 'Not tested'
    });

    return results;

  } catch (error) {
    logger.error('❌ Startup optimization failed:', error);
    return { error: error.message, results };
  }
}

/**
 * Periodic performance monitoring and optimization
 */
function startPerformanceMonitoring(database) {
  logger.info('Starting performance monitoring...');

  // Monitor query performance every 5 minutes
  setInterval(async () => {
    try {
      const testStart = Date.now();
      await database.get(`
        SELECT COUNT(*) as count 
        FROM epg_programs 
        WHERE start_time <= datetime('now') AND end_time > datetime('now')
      `);
      const queryTime = Date.now() - testStart;

      if (queryTime > 100) {
        logger.warn('Performance degradation detected', { 
          currentProgramQueryTime: `${queryTime}ms`,
          threshold: '100ms'
        });
        
        // Trigger optimization if performance is poor
        if (queryTime > 500) {
          logger.info('Triggering automatic re-optimization...');
          await optimizeDatabase(database);
        }
      }
    } catch (error) {
      logger.error('Performance monitoring check failed:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  logger.info('✅ Performance monitoring started');
}

module.exports = {
  initializePerformanceOptimizations,
  startPerformanceMonitoring
};