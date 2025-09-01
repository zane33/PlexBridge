const express = require('express');
const router = express.Router();
const database = require('../services/database');
const logger = require('../utils/logger');

/**
 * Admin route to fix incorrectly typed IPTV provider streams
 * This fixes streams from premiumpowers.net and line. that are marked as HLS but should be HTTP
 */
router.post('/fix-iptv-stream-types', async (req, res) => {
  try {
    logger.info('Starting IPTV stream type fix...');
    
    // Get all streams that are IPTV providers but marked as HLS
    const problematicStreams = await database.all(`
      SELECT id, name, url, type, channel_id
      FROM streams
      WHERE (url LIKE '%premiumpowers%' OR url LIKE '%line.%')
        AND type = 'hls'
        AND enabled = 1
    `);
    
    logger.info(`Found ${problematicStreams.length} IPTV streams incorrectly marked as HLS`);
    
    const results = [];
    let fixedCount = 0;
    
    for (const stream of problematicStreams) {
      try {
        // Update stream type to 'http'
        await database.run(
          'UPDATE streams SET type = ? WHERE id = ?',
          ['http', stream.id]
        );
        
        results.push({
          id: stream.id,
          name: stream.name,
          url: stream.url.substring(0, 60) + '...',
          oldType: 'hls',
          newType: 'http',
          status: 'fixed'
        });
        
        fixedCount++;
        
        logger.info(`Fixed stream type for: ${stream.name}`, {
          streamId: stream.id,
          oldType: 'hls',
          newType: 'http'
        });
      } catch (error) {
        logger.error(`Failed to fix stream: ${stream.name}`, {
          streamId: stream.id,
          error: error.message
        });
        
        results.push({
          id: stream.id,
          name: stream.name,
          url: stream.url.substring(0, 60) + '...',
          oldType: 'hls',
          newType: 'http',
          status: 'error',
          error: error.message
        });
      }
    }
    
    const response = {
      success: true,
      message: `Fixed ${fixedCount} out of ${problematicStreams.length} IPTV streams`,
      totalFound: problematicStreams.length,
      totalFixed: fixedCount,
      results: results
    };
    
    logger.info('IPTV stream type fix completed', response);
    
    res.json(response);
  } catch (error) {
    logger.error('Error fixing IPTV stream types:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get status of IPTV streams
 */
router.get('/iptv-stream-status', async (req, res) => {
  try {
    // Get all IPTV provider streams
    const iptvStreams = await database.all(`
      SELECT s.id, s.name, s.url, s.type, s.enabled,
             c.name as channel_name, c.number as channel_number
      FROM streams s
      LEFT JOIN channels c ON s.channel_id = c.id
      WHERE (s.url LIKE '%premiumpowers%' OR s.url LIKE '%line.%')
      ORDER BY c.number
    `);
    
    const stats = {
      total: iptvStreams.length,
      correct: 0,
      incorrect: 0,
      disabled: 0
    };
    
    const problematic = [];
    
    for (const stream of iptvStreams) {
      if (!stream.enabled) {
        stats.disabled++;
      } else if (stream.type === 'hls') {
        stats.incorrect++;
        problematic.push({
          id: stream.id,
          name: stream.channel_name || stream.name,
          channelNumber: stream.channel_number,
          type: stream.type,
          url: stream.url.substring(0, 60) + '...'
        });
      } else {
        stats.correct++;
      }
    }
    
    res.json({
      success: true,
      stats: stats,
      problematicStreams: problematic
    });
  } catch (error) {
    logger.error('Error getting IPTV stream status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;