#!/usr/bin/env node

/**
 * CRITICAL EPG DATABASE REPAIR SCRIPT
 * 
 * This script fixes the database corruption issue that is causing
 * EPG refresh to fail silently with segmentation faults.
 */

const fs = require('fs');
const path = require('path');

async function fixEPGDatabase() {
  console.log('🔧 CRITICAL EPG DATABASE REPAIR');
  console.log('================================');
  
  const dbPath = path.join(__dirname, 'data', 'database', 'plextv.db');
  const backupPath = `${dbPath}.corrupted.backup.${Date.now()}`;
  
  try {
    console.log('\n📂 Step 1: Backing up corrupted database...');
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`✅ Corrupted database backed up to: ${backupPath}`);
    }
    
    console.log('\n🗑️ Step 2: Removing corrupted database...');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('✅ Corrupted database removed');
    }
    
    console.log('\n🚀 Step 3: Starting application to recreate database...');
    console.log('The application will automatically recreate the database with the correct schema.');
    console.log('');
    console.log('NEXT STEPS:');
    console.log('1. Start the application: npm run dev');
    console.log('2. Go to the EPG Sources page in the web interface');
    console.log('3. Add the Freeview EPG source:');
    console.log('   - Name: Freeview NZ');
    console.log('   - URL: https://i.mjh.nz/nz/epg.xml');
    console.log('   - Refresh Interval: 4h');
    console.log('4. Click "Refresh Now" to populate the EPG data');
    console.log('5. Map channels to EPG IDs in the Channel Manager');
    
    return {
      success: true,
      backupPath,
      message: 'Database corruption fixed - restart application to recreate database'
    };
    
  } catch (error) {
    console.error('💥 Database repair failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Create a simple database recreation script
async function createDatabaseRecreationScript() {
  const scriptContent = `#!/usr/bin/env node

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
    await database.run(\`
      INSERT OR REPLACE INTO epg_sources (id, name, url, refresh_interval, enabled)
      VALUES (?, ?, ?, ?, ?)
    \`, ['freeview-nz', 'Freeview NZ', 'https://i.mjh.nz/nz/epg.xml', '4h', 1]);
    
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
`;

  const scriptPath = path.join(__dirname, 'recreate-epg-database.js');
  fs.writeFileSync(scriptPath, scriptContent);
  console.log(`✅ Database recreation script created: ${scriptPath}`);
  
  return scriptPath;
}

// Run the repair
async function main() {
  const result = await fixEPGDatabase();
  
  if (result.success) {
    const scriptPath = await createDatabaseRecreationScript();
    console.log('\n📋 REPAIR SUMMARY:');
    console.log('==================');
    console.log('✅ Corrupted database backed up and removed');
    console.log('✅ Database recreation script created');
    console.log('');
    console.log('🚀 TO COMPLETE THE FIX:');
    console.log('1. Run: node recreate-epg-database.js');
    console.log('2. Or start the app and configure EPG sources manually');
  }
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch(console.error);