const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const database = require('../services/database');
const { v4: uuidv4 } = require('uuid');

// Import selected channels from M3U
router.post('/', async (req, res) => {
  const { url, selectedChannels } = req.body;
  
  if (!url || !selectedChannels || !Array.isArray(selectedChannels)) {
    return res.status(400).json({ error: 'URL and selectedChannels array are required' });
  }
  
  try {
    let channelsCreated = 0;
    let streamsCreated = 0;
    let errors = [];
    
    // Start a transaction for bulk import
    await database.run('BEGIN TRANSACTION');
    
    try {
      // Get existing channel numbers to avoid conflicts
      const existingChannels = await database.all('SELECT number FROM channels');
      const existingNumbers = new Set(existingChannels.map(c => c.number));
      
      let nextChannelNumber = 1;
      const findNextAvailableNumber = () => {
        while (existingNumbers.has(nextChannelNumber)) {
          nextChannelNumber++;
        }
        return nextChannelNumber++;
      };
      
      for (const channel of selectedChannels) {
        try {
          // Create channel if it doesn't exist
          const channelId = uuidv4();
          const channelNumber = findNextAvailableNumber();
          
          await database.run(`
            INSERT INTO channels (id, name, number, enabled, logo, epg_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            channelId,
            channel.name || 'Unknown Channel',
            channelNumber,
            1, // enabled
            channel.attributes?.['tvg-logo'] || null,
            channel.attributes?.['tvg-id'] || null
          ]);
          
          channelsCreated++;
          existingNumbers.add(channelNumber);
          
          // Create stream for the channel
          if (channel.url) {
            const streamId = uuidv4();
            await database.run(`
              INSERT INTO streams (id, channel_id, name, url, type, enabled)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [
              streamId,
              channelId,
              channel.name || 'Stream',
              channel.url,
              'hls', // Default to HLS for M3U streams
              1 // enabled
            ]);
            
            streamsCreated++;
          }
        } catch (error) {
          errors.push(`Failed to import ${channel.name}: ${error.message}`);
          logger.error('Channel import error:', error);
        }
      }
      
      await database.run('COMMIT');
      
      logger.info(`M3U import completed: ${channelsCreated} channels, ${streamsCreated} streams`);
      
      res.json({
        success: true,
        channelsCreated,
        streamsCreated,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully imported ${channelsCreated} channels and ${streamsCreated} streams`
      });
      
    } catch (error) {
      await database.run('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    logger.error('M3U import error:', error);
    res.status(500).json({
      error: 'Failed to import channels',
      details: error.message
    });
  }
});

module.exports = router;