#!/usr/bin/env node

const database = require('./server/services/database');
const logger = require('./server/utils/logger');

async function fixOrphanedEPGPrograms() {
  console.log('🔧 EPG Orphaned Programs Fix Tool');
  console.log('=================================\n');

  try {
    // Initialize database
    await database.initialize();
    console.log('✅ Database initialized\n');

    // 1. Find orphaned programs (programs with EPG IDs that don't match any channel)
    console.log('1️⃣ Finding Orphaned Programs:');
    console.log('-----------------------------');
    
    const orphanedPrograms = await database.all(`
      SELECT DISTINCT p.channel_id, COUNT(*) as program_count,
             MIN(p.start_time) as earliest_program,
             MAX(p.end_time) as latest_program,
             ec.display_name
      FROM epg_programs p
      LEFT JOIN channels c ON c.epg_id = p.channel_id
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE c.epg_id IS NULL
      GROUP BY p.channel_id
      ORDER BY program_count DESC
    `);
    
    console.log(`Found ${orphanedPrograms.length} orphaned EPG channel IDs:`);
    
    let totalOrphanedPrograms = 0;
    orphanedPrograms.forEach(op => {
      totalOrphanedPrograms += op.program_count;
      console.log(`  📺 EPG ID: ${op.channel_id}`);
      console.log(`     Display Name: ${op.display_name || 'Unknown'}`);
      console.log(`     Programs: ${op.program_count.toLocaleString()}`);
      console.log(`     Date Range: ${op.earliest_program} to ${op.latest_program}`);
      console.log('');
    });
    
    console.log(`📊 Total orphaned programs: ${totalOrphanedPrograms.toLocaleString()}\n`);

    // 2. Check what channels are missing vs what EPG channels exist
    console.log('2️⃣ Channel Mapping Analysis:');
    console.log('----------------------------');
    
    const epgChannels = await database.all(`
      SELECT epg_id, display_name, source_id 
      FROM epg_channels 
      ORDER BY epg_id
    `);
    
    const mappedChannels = await database.all(`
      SELECT epg_id, name, number 
      FROM channels 
      WHERE epg_id IS NOT NULL 
      ORDER BY epg_id
    `);
    
    const mappedEpgIds = new Set(mappedChannels.map(c => c.epg_id));
    const unmappedEpgChannels = epgChannels.filter(ec => !mappedEpgIds.has(ec.epg_id));
    
    console.log(`EPG channels in feeds: ${epgChannels.length}`);
    console.log(`Mapped channels: ${mappedChannels.length}`);
    console.log(`Unmapped EPG channels: ${unmappedEpgChannels.length}`);
    
    if (unmappedEpgChannels.length > 0) {
      console.log('\n📺 Unmapped EPG Channels (Top 10):');
      unmappedEpgChannels.slice(0, 10).forEach(ec => {
        const orphan = orphanedPrograms.find(op => op.channel_id === ec.epg_id);
        console.log(`  - ${ec.epg_id}: ${ec.display_name} (${orphan ? orphan.program_count : 0} programs)`);
      });
    }

    // 3. Suggest fix options
    console.log('\n3️⃣ Fix Options:');
    console.log('---------------');
    
    console.log('Option 1: Modify getAllEPGData query to include orphaned programs');
    console.log('  - Change JOIN to LEFT JOIN in getAllEPGData query');
    console.log('  - This will show programs even without channel mapping');
    console.log('');
    
    console.log('Option 2: Auto-create channels for popular orphaned EPG IDs');
    console.log('  - Create channels for EPG IDs with >100 programs');
    console.log('  - Use display_name from epg_channels table');
    console.log('');
    
    console.log('Option 3: Clean up orphaned programs (NOT RECOMMENDED)');
    console.log('  - Delete programs without matching channels');
    console.log('  - Will lose potentially valuable EPG data');

    // 4. Test the current query vs improved query
    console.log('\n4️⃣ Query Comparison Test:');
    console.log('-------------------------');
    
    const now = new Date().toISOString();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    // Current query (with JOIN - excludes orphaned programs)
    const currentQuery = `
      SELECT p.*, c.name as channel_name, c.number as channel_number, ec.source_id
      FROM epg_programs p
      JOIN channels c ON c.epg_id = p.channel_id
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE p.start_time <= ? 
      AND p.end_time >= ?
      ORDER BY c.number, p.start_time
      LIMIT 20
    `;
    
    const currentResults = await database.all(currentQuery, [tomorrow, now]);
    
    // Improved query (with LEFT JOIN - includes orphaned programs)
    const improvedQuery = `
      SELECT p.*, 
             COALESCE(c.name, ec.display_name, 'EPG Channel ' || p.channel_id) as channel_name, 
             COALESCE(c.number, 9999) as channel_number, 
             ec.source_id,
             CASE WHEN c.epg_id IS NULL THEN 1 ELSE 0 END as is_orphaned
      FROM epg_programs p
      LEFT JOIN channels c ON c.epg_id = p.channel_id
      LEFT JOIN epg_channels ec ON ec.epg_id = p.channel_id
      WHERE p.start_time <= ? 
      AND p.end_time >= ?
      ORDER BY channel_number, p.start_time
      LIMIT 20
    `;
    
    const improvedResults = await database.all(improvedQuery, [tomorrow, now]);
    
    console.log(`Current query results: ${currentResults.length} programs`);
    console.log(`Improved query results: ${improvedResults.length} programs`);
    console.log(`Difference: +${improvedResults.length - currentResults.length} programs\n`);
    
    if (improvedResults.length > currentResults.length) {
      console.log('🎯 Sample additional programs that would be included:');
      const additionalPrograms = improvedResults.filter(ir => 
        !currentResults.some(cr => cr.id === ir.id)
      );
      
      additionalPrograms.slice(0, 5).forEach(p => {
        console.log(`  - ${p.channel_name}: ${p.title} (${p.is_orphaned ? 'ORPHANED' : 'MAPPED'})`);
      });
    }

  } catch (error) {
    console.error('❌ Fix analysis failed:', error);
  } finally {
    if (database && database.db) {
      database.db.close();
    }
  }
}

// Run the fix analysis
fixOrphanedEPGPrograms().then(() => {
  console.log('\n🏁 Analysis completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Analysis crashed:', error);
  process.exit(1);
});