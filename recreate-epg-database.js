#!/usr/bin/env node

/**
 * DATABASE RECREATION SCRIPT
 * 
 * This script recreates the database with proper EPG configuration
 */

const path = require('path');

// Import the application's database service
const database = require('./server/services/database');
const epgService = require('./server/services/epgService');

async function recreateDatabase() {
  console.log('🔄 Recreating PlexBridge database...');
  
  try {
    // Initialize database (will create tables)
    await database.initialize();
    console.log('✅ Database initialized with correct schema');
    
    // Add default EPG source
    console.log('📺 Adding Freeview EPG source...');
    await database.run(`
      INSERT OR REPLACE INTO epg_sources (id, name, url, refresh_interval, enabled)
      VALUES (?, ?, ?, ?, ?)
    `, ['freeview-nz', 'Freeview NZ', 'https://i.mjh.nz/nz/epg.xml', '4h', 1]);
    
    console.log('✅ EPG source added');
    
    // Initialize EPG service
    await epgService.initialize();
    console.log('✅ EPG service initialized');
    
    // Trigger initial refresh
    console.log('🔄 Triggering initial EPG refresh...');
    const refreshResult = await epgService.forceRefresh('freeview-nz');
    console.log('✅ EPG refresh completed:', refreshResult);
    
    console.log('');
    console.log('🎉 DATABASE RECREATION COMPLETE!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Check the web interface at http://localhost:3000');
    console.log('2. Go to Channels page and map channels to EPG IDs');
    console.log('3. Verify EPG data is showing in Plex');
    
  } catch (error) {
    console.error('❌ Database recreation failed:', error);
    process.exit(1);
  }
}

recreateDatabase().catch(console.error);
