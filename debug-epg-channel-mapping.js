#!/usr/bin/env node

const database = require('./server/services/database');
const logger = require('./server/utils/logger');

async function debugEPGChannelMapping() {
  console.log('🔍 EPG Channel Mapping Debug Tool');
  console.log('==================================\n');

  try {
    // Initialize database
    await database.initialize();
    console.log('✅ Database initialized\n');

    // 1. Check all channels and their EPG assignments
    console.log('1️⃣ Checking Channel EPG Assignments:');
    console.log('------------------------------------');
    
    const channels = await database.all(`
      SELECT id, name, number, enabled, epg_id 
      FROM channels 
      WHERE name LIKE '% Sport%' OR name LIKE '%sport%'
      ORDER BY number
    `);
    
    if (channels.length === 0) {
      console.log('❌ No sport channels found in database');
    } else {
      for (const channel of channels) {
        console.log(`Channel: ${channel.name} (#${channel.number})`);
        console.log(`  ID: ${channel.id}`);
        console.log(`  Enabled: ${channel.enabled ? '✅' : '❌'}`);
        console.log(`  EPG ID: ${channel.epg_id || '❌ NOT SET'}`);
        console.log('');
      }
    }

    // 2. Check EPG sources
    console.log('2️⃣ Checking EPG Sources:');
    console.log('------------------------');
    
    const sources = await database.all(`
      SELECT id, name, url, enabled, last_refresh, last_success, last_error 
      FROM epg_sources 
      ORDER BY name
    `);
    
    if (sources.length === 0) {
      console.log('❌ No EPG sources configured');
    } else {
      for (const source of sources) {
        console.log(`Source: ${source.name}`);
        console.log(`  ID: ${source.id}`);
        console.log(`  URL: ${source.url}`);
        console.log(`  Enabled: ${source.enabled ? '✅' : '❌'}`);
        console.log(`  Last Refresh: ${source.last_refresh || 'Never'}`);
        console.log(`  Last Success: ${source.last_success || 'Never'}`);
        console.log(`  Last Error: ${source.last_error || 'None'}`);
        console.log('');
      }
    }

    // 3. Check EPG channels from feeds
    console.log('3️⃣ Checking EPG Channels from Feeds:');
    console.log('------------------------------------');
    
    const epgChannels = await database.all(`
      SELECT epg_id, display_name, source_id 
      FROM epg_channels 
      WHERE display_name LIKE '%sport%' OR display_name LIKE '%Sport%'
      ORDER BY display_name
    `);
    
    if (epgChannels.length === 0) {
      console.log('❌ No sport-related EPG channels found');
    } else {
      for (const epgChannel of epgChannels) {
        console.log(`EPG Channel: ${epgChannel.display_name}`);
        console.log(`  EPG ID: ${epgChannel.epg_id}`);
        console.log(`  Source ID: ${epgChannel.source_id}`);
        console.log('');
      }
    }

    // 4. Check programs for specific channels
    console.log('4️⃣ Checking Programs for Sport Channels:');
    console.log('----------------------------------------');
    
    const now = new Date().toISOString();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    // Find channels that might be  Sport 6 NZ
    const Channel = await database.get(`
      SELECT * FROM channels 
      WHERE name LIKE '% Sport 6%' OR name LIKE '% Sport%6%'
      LIMIT 1
    `);
    
    if (Channel) {
      console.log(`Found  Sport channel: ${Channel.name} (#${Channel.number})`);
      console.log(`  EPG ID: ${Channel.epg_id || 'NOT SET'}`);
      
      if (Channel.epg_id) {
        // Check if programs exist for this EPG ID
        const programs = await database.all(`
          SELECT id, title, start_time, end_time, channel_id 
          FROM epg_programs 
          WHERE channel_id = ? 
          AND start_time >= ? 
          AND start_time <= ?
          ORDER BY start_time
          LIMIT 10
        `, [Channel.epg_id, now, tomorrow]);
        
        console.log(`  Programs found: ${programs.length}`);
        
        if (programs.length > 0) {
          console.log('  Sample programs:');
          programs.slice(0, 3).forEach(program => {
            console.log(`    - ${program.title} (${program.start_time})`);
          });
        } else {
          console.log('  ❌ No programs found for this EPG ID');
          
          // Check if there are programs with similar EPG IDs
          const similarPrograms = await database.all(`
            SELECT DISTINCT channel_id, COUNT(*) as program_count
            FROM epg_programs 
            WHERE channel_id LIKE ? 
            GROUP BY channel_id
            ORDER BY program_count DESC
            LIMIT 5
          `, [`%%`]);
          
          if (similarPrograms.length > 0) {
            console.log('  Similar EPG channel IDs found:');
            similarPrograms.forEach(p => {
              console.log(`    - Channel ID: ${p.channel_id} (${p.program_count} programs)`);
            });
          }
        }
      } else {
        console.log('  ❌ No EPG ID assigned to this channel');
      }
    } else {
      console.log('❌ No  Sport 6 channel found');
      
      // List all  Sport channels
      const Channels = await database.all(`
        SELECT name, number, epg_id 
        FROM channels 
        WHERE name LIKE '%%Sport%' 
        ORDER BY number
      `);
      
      if (Channels.length > 0) {
        console.log('Other  Sport channels found:');
        Channels.forEach(ch => {
          console.log(`  - ${ch.name} (#${ch.number}) EPG ID: ${ch.epg_id || 'NOT SET'}`);
        });
      }
    }

    // 5. Show the query that fails
    console.log('\n5️⃣ Testing getAllEPGData Query:');
    console.log('-------------------------------');
    
    const problematicQuery = `
      SELECT p.*, c.name as channel_name, c.number as channel_number, ec.source_id
      FROM epg_programs p
      JOIN channels c ON c.epg_id = p.channel_id
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE p.start_time <= ? 
      AND p.end_time >= ?
      ORDER BY c.number, p.start_time
      LIMIT 10
    `;
    
    const testPrograms = await database.all(problematicQuery, [tomorrow, now]);
    
    console.log(`Query returned ${testPrograms.length} programs`);
    if (testPrograms.length > 0) {
      console.log('Sample results:');
      testPrograms.slice(0, 3).forEach(p => {
        console.log(`  - ${p.channel_name} (#${p.channel_number}): ${p.title}`);
      });
    }

    // 6. Check for orphaned programs (programs without matching channels)
    console.log('\n6️⃣ Checking for Orphaned Programs:');
    console.log('----------------------------------');
    
    const orphanedPrograms = await database.all(`
      SELECT DISTINCT p.channel_id, COUNT(*) as program_count
      FROM epg_programs p
      LEFT JOIN channels c ON c.epg_id = p.channel_id
      WHERE c.epg_id IS NULL
      GROUP BY p.channel_id
      ORDER BY program_count DESC
      LIMIT 10
    `);
    
    if (orphanedPrograms.length > 0) {
      console.log(`Found ${orphanedPrograms.length} EPG channel IDs with no matching channels:`);
      orphanedPrograms.forEach(op => {
        console.log(`  - EPG ID: ${op.channel_id} (${op.program_count} programs)`);
      });
      
      console.log('\n💡 SOLUTION: These programs exist but channels are not mapped to them!');
    } else {
      console.log('✅ No orphaned programs found');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    if (database && database.db) {
      database.db.close();
    }
  }
}

// Run the debug
debugEPGChannelMapping().then(() => {
  console.log('\n🏁 Debug completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Debug crashed:', error);
  process.exit(1);
});