const Database = require('better-sqlite3');
const path = require('path');

async function analyzeDatabase() {
  console.log('Analyzing PlexBridge database structure and EPG data...');
  
  const dbPath = path.join(__dirname, 'data', 'database', 'plextv.db');
  const db = new Database(dbPath, { readonly: true });

  try {
    console.log('\n=== DATABASE SCHEMA ANALYSIS ===');
    
    // Get table schema
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Available tables:', tables.map(t => t.name));

    // Check channels table structure
    console.log('\n=== CHANNELS TABLE ===');
    const channelsSchema = db.prepare("PRAGMA table_info(channels)").all();
    console.log('Channels table schema:');
    channelsSchema.forEach(col => {
      console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });

    const channelsData = db.prepare("SELECT * FROM channels LIMIT 5").all();
    console.log('\nSample channels data:');
    console.log(JSON.stringify(channelsData, null, 2));

    // Check epg_programs table structure
    console.log('\n=== EPG_PROGRAMS TABLE ===');
    try {
      const epgProgramsSchema = db.prepare("PRAGMA table_info(epg_programs)").all();
      console.log('EPG Programs table schema:');
      epgProgramsSchema.forEach(col => {
        console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });

      const epgProgramsData = db.prepare("SELECT * FROM epg_programs LIMIT 5").all();
      console.log('\nSample EPG programs data:');
      console.log(JSON.stringify(epgProgramsData, null, 2));

      const epgProgramsCount = db.prepare("SELECT COUNT(*) as count FROM epg_programs").get();
      console.log(`\nTotal EPG programs: ${epgProgramsCount.count}`);

    } catch (error) {
      console.log('EPG Programs table does not exist or is empty:', error.message);
    }

    // Check epg_sources table
    console.log('\n=== EPG_SOURCES TABLE ===');
    try {
      const epgSourcesSchema = db.prepare("PRAGMA table_info(epg_sources)").all();
      console.log('EPG Sources table schema:');
      epgSourcesSchema.forEach(col => {
        console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });

      const epgSourcesData = db.prepare("SELECT * FROM epg_sources").all();
      console.log('\nEPG sources data:');
      console.log(JSON.stringify(epgSourcesData, null, 2));

    } catch (error) {
      console.log('EPG Sources table does not exist:', error.message);
    }

    // Check epg_channels table
    console.log('\n=== EPG_CHANNELS TABLE ===');
    try {
      const epgChannelsSchema = db.prepare("PRAGMA table_info(epg_channels)").all();
      console.log('EPG Channels table schema:');
      epgChannelsSchema.forEach(col => {
        console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });

      const epgChannelsData = db.prepare("SELECT * FROM epg_channels LIMIT 10").all();
      console.log('\nSample EPG channels data:');
      console.log(JSON.stringify(epgChannelsData, null, 2));

      const epgChannelsCount = db.prepare("SELECT COUNT(*) as count FROM epg_channels").get();
      console.log(`\nTotal EPG channels: ${epgChannelsCount.count}`);

    } catch (error) {
      console.log('EPG Channels table does not exist:', error.message);
    }

    // Analyze the JOIN issue - getAllEPGData query
    console.log('\n=== CHANNEL MAPPING ANALYSIS ===');
    try {
      // Test the problematic JOIN query from getAllEPGData
      const joinQuery = `
        SELECT p.*, c.name as channel_name, c.number as channel_number
        FROM epg_programs p
        JOIN channels c ON p.channel_id = c.id
        WHERE p.start_time <= ? 
        AND p.end_time >= ?
        ORDER BY c.number, p.start_time
        LIMIT 10
      `;
      
      const now = new Date().toISOString();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      const joinResults = db.prepare(joinQuery).all(tomorrow, now);
      console.log('JOIN query results (epg_programs.channel_id = channels.id):');
      console.log(JSON.stringify(joinResults, null, 2));
      console.log(`Found ${joinResults.length} programs with successful JOIN`);

      // Check distinct channel_ids in epg_programs
      const distinctChannelIds = db.prepare("SELECT DISTINCT channel_id, COUNT(*) as count FROM epg_programs GROUP BY channel_id LIMIT 10").all();
      console.log('\nDistinct channel_ids in epg_programs:');
      console.log(JSON.stringify(distinctChannelIds, null, 2));

      // Check channels with epg_id mappings
      const channelsWithEpgId = db.prepare("SELECT id, name, number, epg_id FROM channels WHERE epg_id IS NOT NULL AND epg_id != ''").all();
      console.log('\nChannels with EPG ID mappings:');
      console.log(JSON.stringify(channelsWithEpgId, null, 2));

      console.log('\n=== ROOT CAUSE ANALYSIS ===');
      console.log('1. EPG programs use channel_id field that contains EPG identifiers from XMLTV sources');
      console.log('2. Channels table has internal UUID ids that do not match EPG channel_ids');
      console.log('3. The JOIN fails because epg_programs.channel_id contains EPG IDs, not internal channel IDs');
      console.log('4. Proper mapping should use channels.epg_id = epg_programs.channel_id');

      // Test the correct JOIN query
      const correctJoinQuery = `
        SELECT p.*, c.name as channel_name, c.number as channel_number
        FROM epg_programs p
        JOIN channels c ON c.epg_id = p.channel_id
        WHERE p.start_time <= ? 
        AND p.end_time >= ?
        ORDER BY c.number, p.start_time
        LIMIT 10
      `;
      
      const correctJoinResults = db.prepare(correctJoinQuery).all(tomorrow, now);
      console.log('\nCORRECT JOIN query results (channels.epg_id = epg_programs.channel_id):');
      console.log(JSON.stringify(correctJoinResults, null, 2));
      console.log(`Found ${correctJoinResults.length} programs with CORRECT JOIN`);

    } catch (error) {
      console.log('Channel mapping analysis failed:', error.message);
    }

  } catch (error) {
    console.error('Database analysis failed:', error);
  } finally {
    db.close();
  }
}

analyzeDatabase().catch(console.error);