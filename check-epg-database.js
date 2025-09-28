#!/usr/bin/env node

/**
 * EPG Database Diagnostic Script
 * 
 * This script investigates the current state of EPG sources, channels, and programs
 * to identify why the new Freeview EPG source is not downloading or parsing data.
 */

const Database = require('better-sqlite3');
const path = require('path');

async function checkEPGDatabase() {
  const dbPath = path.join(__dirname, 'data', 'database', 'plextv.db');
  console.log('🔍 Checking EPG database:', dbPath);
  
  let db;
  try {
    db = new Database(dbPath);
    
    console.log('\n=== DATABASE TABLES ===');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    tables.forEach(table => console.log(`- ${table.name}`));
    
    console.log('\n=== EPG SOURCES ===');
    const sources = db.prepare('SELECT * FROM epg_sources').all();
    if (sources.length === 0) {
      console.log('❌ NO EPG SOURCES FOUND');
    } else {
      sources.forEach(source => {
        console.log(`\n📺 Source: ${source.name} (ID: ${source.id})`);
        console.log(`   URL: ${source.url}`);
        console.log(`   Enabled: ${source.enabled ? 'YES' : 'NO'}`);
        console.log(`   Refresh Interval: ${source.refresh_interval}`);
        console.log(`   Last Refresh: ${source.last_refresh || 'NEVER'}`);
        console.log(`   Last Success: ${source.last_success || 'NEVER'}`);
        console.log(`   Last Error: ${source.last_error || 'NONE'}`);
      });
    }
    
    console.log('\n=== EPG CHANNELS ===');
    const epgChannels = db.prepare('SELECT * FROM epg_channels').all();
    if (epgChannels.length === 0) {
      console.log('❌ NO EPG CHANNELS FOUND');
    } else {
      console.log(`✅ Found ${epgChannels.length} EPG channels`);
      
      // Group by source
      const channelsBySource = {};
      epgChannels.forEach(channel => {
        if (!channelsBySource[channel.source_id]) {
          channelsBySource[channel.source_id] = [];
        }
        channelsBySource[channel.source_id].push(channel);
      });
      
      Object.keys(channelsBySource).forEach(sourceId => {
        const channels = channelsBySource[sourceId];
        console.log(`\n   Source ${sourceId}: ${channels.length} channels`);
        channels.slice(0, 5).forEach(channel => {
          console.log(`     - ${channel.epg_id}: ${channel.display_name}`);
        });
        if (channels.length > 5) {
          console.log(`     ... and ${channels.length - 5} more`);
        }
      });
    }
    
    console.log('\n=== EPG PROGRAMS ===');
    const programCount = db.prepare('SELECT COUNT(*) as count FROM epg_programs').get();
    console.log(`Total programs: ${programCount.count}`);
    
    if (programCount.count > 0) {
      const programsByChannel = db.prepare(`
        SELECT channel_id, COUNT(*) as count 
        FROM epg_programs 
        GROUP BY channel_id 
        ORDER BY count DESC 
        LIMIT 10
      `).all();
      
      console.log('\nTop channels by program count:');
      programsByChannel.forEach(entry => {
        console.log(`  ${entry.channel_id}: ${entry.count} programs`);
      });
      
      // Recent programs
      const recentPrograms = db.prepare(`
        SELECT * FROM epg_programs 
        ORDER BY created_at DESC 
        LIMIT 5
      `).all();
      
      console.log('\nMost recent programs:');
      recentPrograms.forEach(program => {
        console.log(`  ${program.channel_id}: ${program.title} (${program.start_time})`);
      });
    } else {
      console.log('❌ NO EPG PROGRAMS FOUND');
    }
    
    console.log('\n=== CHANNEL MAPPINGS ===');
    const channels = db.prepare('SELECT id, name, number, epg_id FROM channels').all();
    if (channels.length === 0) {
      console.log('❌ NO CHANNELS FOUND');
    } else {
      const mappedChannels = channels.filter(ch => ch.epg_id);
      const unmappedChannels = channels.filter(ch => !ch.epg_id);
      
      console.log(`Total channels: ${channels.length}`);
      console.log(`Mapped channels: ${mappedChannels.length}`);
      console.log(`Unmapped channels: ${unmappedChannels.length}`);
      
      if (mappedChannels.length > 0) {
        console.log('\nMapped channels (sample):');
        mappedChannels.slice(0, 5).forEach(channel => {
          console.log(`  ${channel.number}: ${channel.name} -> ${channel.epg_id}`);
        });
      }
      
      if (unmappedChannels.length > 0) {
        console.log('\nUnmapped channels (sample):');
        unmappedChannels.slice(0, 5).forEach(channel => {
          console.log(`  ${channel.number}: ${channel.name} (no EPG ID)`);
        });
      }
    }
    
    console.log('\n=== EPG CROSS-REFERENCE ===');
    // Check for orphaned programs (programs without matching channels)
    const orphanedPrograms = db.prepare(`
      SELECT DISTINCT ep.channel_id, COUNT(*) as program_count
      FROM epg_programs ep
      LEFT JOIN channels c ON c.epg_id = ep.channel_id
      WHERE c.id IS NULL
      GROUP BY ep.channel_id
      ORDER BY program_count DESC
      LIMIT 10
    `).all();
    
    if (orphanedPrograms.length > 0) {
      console.log(`⚠️  Found ${orphanedPrograms.length} EPG channel IDs with programs but no matching channels:`);
      orphanedPrograms.forEach(entry => {
        console.log(`  ${entry.channel_id}: ${entry.program_count} programs`);
      });
    } else {
      console.log('✅ All programs have matching channels');
    }
    
    // Check for mapped channels without programs
    const channelsWithoutPrograms = db.prepare(`
      SELECT c.name, c.number, c.epg_id
      FROM channels c
      LEFT JOIN epg_programs ep ON ep.channel_id = c.epg_id
      WHERE c.epg_id IS NOT NULL AND ep.id IS NULL
      LIMIT 10
    `).all();
    
    if (channelsWithoutPrograms.length > 0) {
      console.log(`\n⚠️  Found ${channelsWithoutPrograms.length} mapped channels without programs:`);
      channelsWithoutPrograms.forEach(channel => {
        console.log(`  ${channel.number}: ${channel.name} (${channel.epg_id})`);
      });
    } else {
      console.log('\n✅ All mapped channels have programs');
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    if (db) {
      db.close();
    }
  }
}

checkEPGDatabase().catch(console.error);