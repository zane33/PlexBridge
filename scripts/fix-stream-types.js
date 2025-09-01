#!/usr/bin/env node

/**
 * Script to fix incorrect stream types for IPTV provider streams
 * Some streams are marked as 'hls' but are actually direct HTTP streams
 */

const Database = require('better-sqlite3');
const path = require('path');
const axios = require('axios');

// Database path
const dbPath = path.join(__dirname, '../data/database/plextv.db');
const db = new Database(dbPath);

async function detectActualStreamType(url) {
  try {
    // Special IPTV providers that provide direct HTTP streams
    if (url.includes('premiumpowers') || url.includes('line.')) {
      console.log(`  → IPTV provider detected, should be HTTP stream`);
      return 'http';
    }
    
    // Check URL patterns
    if (url.includes('.m3u8')) {
      return 'hls';
    }
    
    if (url.includes('.mpd')) {
      return 'dash';
    }
    
    // Try HEAD request to check content type
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20'
        },
        validateStatus: () => true // Accept any status
      });
      
      const contentType = response.headers['content-type'] || '';
      console.log(`  → Content-Type: ${contentType}, Status: ${response.status}`);
      
      if (contentType.includes('mpegurl')) {
        return 'hls';
      }
      
      if (contentType.includes('dash')) {
        return 'dash';
      }
      
      // Default to HTTP for video streams
      if (contentType.includes('video') || contentType.includes('octet-stream')) {
        return 'http';
      }
    } catch (error) {
      console.log(`  → HEAD request failed: ${error.message}`);
    }
    
    // Default to HTTP for direct URLs
    return 'http';
  } catch (error) {
    console.error(`  → Error detecting stream type: ${error.message}`);
    return null;
  }
}

async function fixStreamTypes() {
  console.log('Checking and fixing stream types...\n');
  
  // Get all streams
  const streams = db.prepare(`
    SELECT s.*, c.name as channel_name, c.number as channel_number
    FROM streams s
    LEFT JOIN channels c ON s.channel_id = c.id
    WHERE s.enabled = 1
    ORDER BY c.number
  `).all();
  
  console.log(`Found ${streams.length} enabled streams\n`);
  
  let fixedCount = 0;
  const problematicStreams = [];
  
  for (const stream of streams) {
    console.log(`Checking: ${stream.channel_name || stream.name} (Channel ${stream.channel_number || 'N/A'})`);
    console.log(`  URL: ${stream.url}`);
    console.log(`  Current type: ${stream.type}`);
    
    // Check if this is an IPTV provider stream marked as HLS
    if ((stream.url.includes('premiumpowers') || stream.url.includes('line.')) && stream.type === 'hls') {
      console.log(`  ⚠️  IPTV provider stream incorrectly marked as HLS`);
      problematicStreams.push(stream);
      
      const actualType = await detectActualStreamType(stream.url);
      
      if (actualType && actualType !== stream.type) {
        console.log(`  ✓ Fixing type from '${stream.type}' to '${actualType}'`);
        
        // Update the stream type in database
        const updateStmt = db.prepare('UPDATE streams SET type = ? WHERE id = ?');
        updateStmt.run(actualType, stream.id);
        
        fixedCount++;
      }
    } else if (stream.url.includes('premiumpowers') || stream.url.includes('line.')) {
      console.log(`  ✓ IPTV provider stream correctly marked as ${stream.type}`);
    }
    
    console.log('');
  }
  
  console.log('\n=== Summary ===');
  console.log(`Total streams checked: ${streams.length}`);
  console.log(`Problematic streams found: ${problematicStreams.length}`);
  console.log(`Streams fixed: ${fixedCount}`);
  
  if (problematicStreams.length > 0) {
    console.log('\nProblematic streams:');
    for (const stream of problematicStreams) {
      console.log(`  - ${stream.channel_name || stream.name} (Channel ${stream.channel_number || 'N/A'})`);
    }
  }
}

// Run the fix
fixStreamTypes()
  .then(() => {
    console.log('\nDone!');
    db.close();
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    db.close();
    process.exit(1);
  });