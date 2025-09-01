/**
 * Database Optimization for PlexBridge
 * Adds indices and optimizes queries to prevent Plex transaction timeouts
 */

const logger = require('./logger');

/**
 * Creates database indices for optimal query performance
 */
async function optimizeDatabase(database) {
  try {
    logger.info('Starting database optimization for Plex performance...');

    // Critical indices for EPG queries
    const indices = [
      // EPG programs - most critical for Android TV
      {
        name: 'idx_epg_programs_time_channel',
        sql: `CREATE INDEX IF NOT EXISTS idx_epg_programs_time_channel 
              ON epg_programs(channel_id, start_time, end_time)`
      },
      {
        name: 'idx_epg_programs_current',
        sql: `CREATE INDEX IF NOT EXISTS idx_epg_programs_current 
              ON epg_programs(start_time, end_time) 
              WHERE start_time <= datetime('now') AND end_time > datetime('now')`
      },
      
      // Channels optimization
      {
        name: 'idx_channels_enabled',
        sql: `CREATE INDEX IF NOT EXISTS idx_channels_enabled 
              ON channels(enabled, number) WHERE enabled = 1`
      },
      {
        name: 'idx_channels_epg_id',
        sql: `CREATE INDEX IF NOT EXISTS idx_channels_epg_id 
              ON channels(epg_id, enabled)`
      },
      
      // Streams optimization
      {
        name: 'idx_streams_channel_enabled',
        sql: `CREATE INDEX IF NOT EXISTS idx_streams_channel_enabled 
              ON streams(channel_id, enabled) WHERE enabled = 1`
      },
      
      // EPG channels mapping
      {
        name: 'idx_epg_channels_mapping',
        sql: `CREATE INDEX IF NOT EXISTS idx_epg_channels_mapping 
              ON epg_channels(epg_id, source_id)`
      }
    ];

    let createdIndices = 0;
    for (const index of indices) {
      try {
        await database.exec(index.sql);
        logger.debug(`Created/verified index: ${index.name}`);
        createdIndices++;
      } catch (error) {
        logger.warn(`Failed to create index ${index.name}:`, error.message);
      }
    }

    // Optimize database settings for performance
    const optimizations = [
      'PRAGMA journal_mode = WAL',
      'PRAGMA synchronous = NORMAL', 
      'PRAGMA cache_size = -64000', // 64MB cache
      'PRAGMA temp_store = MEMORY',
      'PRAGMA mmap_size = 268435456', // 256MB memory map
      'PRAGMA optimize'
    ];

    for (const optimization of optimizations) {
      try {
        await database.exec(optimization);
        logger.debug(`Applied optimization: ${optimization}`);
      } catch (error) {
        logger.warn(`Failed to apply optimization: ${optimization}`, error.message);
      }
    }

    // Analyze tables for query planner
    const tables = ['epg_programs', 'channels', 'streams', 'epg_channels'];
    for (const table of tables) {
      try {
        await database.exec(`ANALYZE ${table}`);
      } catch (error) {
        logger.warn(`Failed to analyze table ${table}:`, error.message);
      }
    }

    logger.info(`Database optimization complete. Created/verified ${createdIndices} indices.`);
    return { success: true, indicesCreated: createdIndices };

  } catch (error) {
    logger.error('Database optimization failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Optimized query for current EPG programs (prevents transaction timeouts)
 */
async function getCurrentProgramsOptimized(database, channelIds = null) {
  try {
    const now = new Date().toISOString();
    let query, params;

    if (channelIds && channelIds.length > 0) {
      // Specific channels
      const placeholders = channelIds.map(() => '?').join(',');
      query = `
        SELECT p.channel_id, p.title, p.description, p.start_time, p.end_time
        FROM epg_programs p
        WHERE p.channel_id IN (${placeholders})
        AND p.start_time <= ? AND p.end_time > ?
        ORDER BY p.start_time DESC
        LIMIT 50
      `;
      params = [...channelIds, now, now];
    } else {
      // All channels - fastest possible query
      query = `
        SELECT p.channel_id, p.title, p.description, p.start_time, p.end_time
        FROM epg_programs p
        WHERE p.start_time <= ? AND p.end_time > ?
        ORDER BY p.start_time DESC
        LIMIT 100
      `;
      params = [now, now];
    }

    const startTime = Date.now();
    const results = await database.all(query, params);
    const queryTime = Date.now() - startTime;

    if (queryTime > 100) {
      logger.warn('Slow getCurrentPrograms query', { 
        queryTime: `${queryTime}ms`,
        resultCount: results.length,
        channelCount: channelIds?.length || 'all'
      });
    }

    return results;
  } catch (error) {
    logger.error('getCurrentProgramsOptimized failed:', error);
    return [];
  }
}

/**
 * Optimized channel lineup query
 */
async function getChannelLineupOptimized(database) {
  try {
    const startTime = Date.now();
    
    // Single optimized query with minimal joins
    const channels = await database.all(`
      SELECT c.id, c.name, c.number, c.enabled, c.epg_id, c.logo,
             s.url, s.type, s.enabled as stream_enabled
      FROM channels c
      LEFT JOIN streams s ON c.id = s.channel_id AND s.enabled = 1
      WHERE c.enabled = 1
      ORDER BY c.number
      LIMIT 100
    `);

    const queryTime = Date.now() - startTime;
    
    if (queryTime > 50) {
      logger.warn('Slow channel lineup query', { 
        queryTime: `${queryTime}ms`,
        channelCount: channels.length
      });
    }

    return channels.filter(c => c.stream_enabled === 1);
  } catch (error) {
    logger.error('getChannelLineupOptimized failed:', error);
    return [];
  }
}

/**
 * Checks database performance and suggests optimizations
 */
async function checkDatabasePerformance(database) {
  try {
    const stats = {
      tables: {},
      indices: {},
      performance: {}
    };

    // Get table row counts
    const tables = ['epg_programs', 'channels', 'streams', 'epg_sources'];
    for (const table of tables) {
      try {
        const result = await database.get(`SELECT COUNT(*) as count FROM ${table}`);
        stats.tables[table] = result.count;
      } catch (error) {
        stats.tables[table] = 'error';
      }
    }

    // Check index usage
    const indices = await database.all(`
      SELECT name, tbl_name, sql 
      FROM sqlite_master 
      WHERE type = 'index' 
      AND name LIKE 'idx_%'
    `);
    
    stats.indices.count = indices.length;
    stats.indices.names = indices.map(i => i.name);

    // Performance test
    const testStart = Date.now();
    await database.get(`
      SELECT COUNT(*) 
      FROM epg_programs p 
      WHERE p.start_time <= datetime('now') 
      AND p.end_time > datetime('now')
    `);
    stats.performance.currentProgramQuery = Date.now() - testStart;

    return stats;
  } catch (error) {
    logger.error('Database performance check failed:', error);
    return { error: error.message };
  }
}

module.exports = {
  optimizeDatabase,
  getCurrentProgramsOptimized,
  getChannelLineupOptimized,
  checkDatabasePerformance
};