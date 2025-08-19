const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const database = require('../services/database');
const { v4: uuidv4 } = require('uuid');

// Import selected channels from M3U with bulk channel numbering
router.post('/', async (req, res) => {
  const { url, selectedChannels, startingChannelNumber = null, channelNumberOverrides = {} } = req.body;
  
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
      
      // Enhanced starting channel number logic
      let nextChannelNumber;
      
      if (startingChannelNumber) {
        // User specified a starting number
        nextChannelNumber = parseInt(startingChannelNumber);
        
        // If starting number conflicts, find next available
        if (existingNumbers.has(nextChannelNumber)) {
          const maxExisting = Math.max(...Array.from(existingNumbers), 0);
          nextChannelNumber = maxExisting + 1;
          logger.info(`Starting channel number ${startingChannelNumber} conflicts, using ${nextChannelNumber} instead`);
        }
      } else {
        // No starting number provided - auto-append after last channel
        if (existingNumbers.size > 0) {
          const maxExisting = Math.max(...Array.from(existingNumbers));
          nextChannelNumber = maxExisting + 1;
          logger.info(`No starting channel number provided, auto-appending from channel ${nextChannelNumber}`);
        } else {
          // No existing channels, start from 1
          nextChannelNumber = 1;
          logger.info('No existing channels found, starting from channel 1');
        }
      }
      
      const findNextAvailableNumber = () => {
        while (existingNumbers.has(nextChannelNumber)) {
          nextChannelNumber++;
        }
        return nextChannelNumber++;
      };
      
      const conflicts = [];
      const assignments = [];
      
      for (let i = 0; i < selectedChannels.length; i++) {
        const channel = selectedChannels[i];
        try {
          // Create channel if it doesn't exist
          const channelId = uuidv4();
          
          // Check if user provided specific number override for this channel
          let channelNumber;
          if (channelNumberOverrides[i] && channelNumberOverrides[i] > 0) {
            channelNumber = parseInt(channelNumberOverrides[i]);
            
            // Check for conflicts with user-specified numbers
            if (existingNumbers.has(channelNumber)) {
              conflicts.push({
                channelName: channel.name,
                requestedNumber: channelNumber,
                assignedNumber: null // Will be determined later
              });
              channelNumber = findNextAvailableNumber(); // Fall back to next available
            }
          } else {
            channelNumber = findNextAvailableNumber();
          }
          
          assignments.push({
            channelName: channel.name,
            assignedNumber: channelNumber
          });
          
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
      
      logger.info(`M3U import completed: ${channelsCreated} channels, ${streamsCreated} streams`, {
        assignments,
        conflicts: conflicts.length > 0 ? conflicts : undefined
      });
      
      res.json({
        success: true,
        channelsCreated,
        streamsCreated,
        assignments,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        errors: errors.length > 0 ? errors : undefined,
        message: conflicts.length > 0 
          ? `Successfully imported ${channelsCreated} channels and ${streamsCreated} streams (${conflicts.length} channel numbers had conflicts and were auto-assigned)`
          : `Successfully imported ${channelsCreated} channels and ${streamsCreated} streams`
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