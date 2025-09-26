const express = require('express');
const router = express.Router();
const database = require('../services/database');
const epgService = require('../services/epgService');
const logger = require('../utils/logger');
const { fixEPGMappings } = require('../scripts/auto-fix-epg-mappings');
const { needsEPGRemapping, getSuggestedEPGId } = require('../utils/epgChannelMapper');

/**
 * EPG Admin Routes
 * Endpoints for managing EPG channel mappings and fixing issues
 */

// Check EPG mapping status
router.get('/mapping-status', async (req, res) => {
  try {
    const channels = await database.all(`
      SELECT c.*,
        COUNT(DISTINCT p.id) as program_count
      FROM channels c
      LEFT JOIN epg_programs p ON p.channel_id = c.epg_id
      GROUP BY c.id
      ORDER BY c.number
    `);

    const mappingStatus = channels.map(channel => {
      const needsRemapping = needsEPGRemapping(channel);
      const suggestedId = getSuggestedEPGId(channel);

      // Check if programs exist for the suggested ID
      let suggestedProgramCount = 0;
      if (suggestedId) {
        const result = database.get(
          'SELECT COUNT(*) as count FROM epg_programs WHERE channel_id = ?',
          [suggestedId]
        );
        suggestedProgramCount = result?.count || 0;
      }

      return {
        id: channel.id,
        name: channel.name,
        number: channel.number,
        currentEpgId: channel.epg_id,
        suggestedEpgId: suggestedId,
        needsRemapping,
        currentProgramCount: channel.program_count,
        suggestedProgramCount,
        status: channel.program_count > 0 ? 'ok' :
          suggestedProgramCount > 0 ? 'needs_fix' :
            'no_programs'
      };
    });

    const summary = {
      total: mappingStatus.length,
      ok: mappingStatus.filter(c => c.status === 'ok').length,
      needsFix: mappingStatus.filter(c => c.status === 'needs_fix').length,
      noPrograms: mappingStatus.filter(c => c.status === 'no_programs').length
    };

    res.json({
      summary,
      channels: mappingStatus
    });
  } catch (error) {
    logger.error('Failed to get EPG mapping status:', error);
    res.status(500).json({ error: 'Failed to get mapping status' });
  }
});

// Fix EPG mappings
router.post('/fix-mappings', async (req, res) => {
  try {
    logger.info('EPG mapping fix requested via API');

    // Run the fix
    const results = fixEPGMappings();

    // Clear EPG cache after fixing mappings
    if (results.updated > 0) {
      await epgService.clearEPGCache();
      logger.info('EPG cache cleared after mapping fix');
    }

    res.json({
      success: true,
      message: `Fixed ${results.updated} channel EPG mappings`,
      results
    });
  } catch (error) {
    logger.error('Failed to fix EPG mappings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fix EPG mappings',
      details: error.message
    });
  }
});

// Update single channel EPG ID
router.put('/channel/:channelId/epg-id', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { epg_id } = req.body;

    if (!epg_id) {
      return res.status(400).json({ error: 'epg_id is required' });
    }

    // Check if channel exists
    const channel = await database.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if programs exist for the new EPG ID
    const programCount = await database.get(
      'SELECT COUNT(*) as count FROM epg_programs WHERE channel_id = ?',
      [epg_id]
    );

    // Update the channel
    await database.run(
      'UPDATE channels SET epg_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [epg_id, channelId]
    );

    // Clear cache for this channel
    await epgService.clearEPGCache();

    logger.info('Channel EPG ID updated', {
      channelId,
      channelName: channel.name,
      oldEpgId: channel.epg_id,
      newEpgId: epg_id,
      programsAvailable: programCount?.count || 0
    });

    res.json({
      success: true,
      channel: {
        id: channelId,
        name: channel.name,
        oldEpgId: channel.epg_id,
        newEpgId: epg_id,
        programsAvailable: programCount?.count || 0
      }
    });
  } catch (error) {
    logger.error('Failed to update channel EPG ID:', error);
    res.status(500).json({ error: 'Failed to update channel EPG ID' });
  }
});

// Get EPG diagnostic info for a channel
router.get('/channel/:channelId/diagnostic', async (req, res) => {
  try {
    const { channelId } = req.params;

    // Get channel info
    const channel = await database.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check programs with current EPG ID
    const currentPrograms = await database.all(`
      SELECT title, start_time, end_time
      FROM epg_programs
      WHERE channel_id = ?
      ORDER BY start_time DESC
      LIMIT 5
    `, [channel.epg_id]);

    // Get suggested EPG ID
    const suggestedId = getSuggestedEPGId(channel);
    let suggestedPrograms = [];
    if (suggestedId && suggestedId !== channel.epg_id) {
      suggestedPrograms = await database.all(`
        SELECT title, start_time, end_time
        FROM epg_programs
        WHERE channel_id = ?
        ORDER BY start_time DESC
        LIMIT 5
      `, [suggestedId]);
    }

    // Get all possible EPG channel IDs that might match
    const possibleMatches = await database.all(`
      SELECT DISTINCT channel_id, COUNT(*) as program_count
      FROM epg_programs
      WHERE channel_id IN (?, ?, ?, ?)
      GROUP BY channel_id
    `, [
      channel.epg_id,
      channel.number.toString(),
      channel.name.toLowerCase(),
      suggestedId || ''
    ]);

    res.json({
      channel: {
        id: channel.id,
        name: channel.name,
        number: channel.number,
        currentEpgId: channel.epg_id
      },
      diagnostic: {
        currentPrograms: {
          count: currentPrograms.length,
          samples: currentPrograms
        },
        suggestedEpgId: suggestedId,
        suggestedPrograms: {
          count: suggestedPrograms.length,
          samples: suggestedPrograms
        },
        possibleMatches,
        needsRemapping: needsEPGRemapping(channel)
      }
    });
  } catch (error) {
    logger.error('Failed to get channel diagnostic:', error);
    res.status(500).json({ error: 'Failed to get diagnostic info' });
  }
});

module.exports = router;