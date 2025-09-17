#!/usr/bin/env node

/**
 * Script to remove unnecessary system profiles
 * Keeps only the "Default Profile" and removes "Maximum Compatibility" and "Optimized Streaming"
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Determine database path
const getDataDir = () => {
  const dockerDataDir = '/data';
  const localDataDir = path.join(__dirname, '../data');

  try {
    if (fs.existsSync(dockerDataDir) && fs.statSync(dockerDataDir).isDirectory()) {
      fs.accessSync(dockerDataDir, fs.constants.W_OK);
      return dockerDataDir;
    }
  } catch (error) {
    console.log(`Docker data directory not accessible, using local: ${error.message}`);
  }

  return localDataDir;
};

const dataDir = process.env.DATA_PATH || getDataDir();
const dbPath = process.env.DB_PATH || path.join(dataDir, 'database', 'plextv.db');

console.log(`Using database at: ${dbPath}`);

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.log('Database does not exist yet. This script should be run after initial setup.');
  process.exit(0);
}

const db = new Database(dbPath);

try {
  console.log('Starting cleanup of extra system profiles...');

  // Get all system profiles
  const systemProfiles = db.prepare('SELECT * FROM ffmpeg_profiles WHERE is_system = 1').all();
  console.log(`Found ${systemProfiles.length} system profiles`);

  // Display current profiles
  systemProfiles.forEach((profile, index) => {
    console.log(`  ${index + 1}. ${profile.name} (ID: ${profile.id}, Default: ${profile.is_default})`);
  });

  // Identify profiles to remove
  const profilesToRemove = systemProfiles.filter(p =>
    p.name === 'Maximum Compatibility' || p.name === 'Optimized Streaming'
  );

  if (profilesToRemove.length === 0) {
    console.log('No extra system profiles found to remove.');
    process.exit(0);
  }

  console.log(`\nRemoving ${profilesToRemove.length} extra system profiles...`);

  // Begin transaction
  const transaction = db.transaction(() => {
    for (const profile of profilesToRemove) {
      console.log(`Removing profile: ${profile.name} (ID: ${profile.id})`);

      // Verify no streams are assigned to this profile
      const streamCount = db.prepare('SELECT COUNT(*) as count FROM streams WHERE ffmpeg_profile_id = ?').get(profile.id);

      if (streamCount.count > 0) {
        console.log(`  WARNING: Profile ${profile.name} has ${streamCount.count} streams assigned. Skipping removal.`);
        continue;
      }

      // Delete client configurations first
      const clientsDeleted = db.prepare('DELETE FROM ffmpeg_profile_clients WHERE profile_id = ?').run(profile.id);
      console.log(`  Deleted ${clientsDeleted.changes} client configurations`);

      // Delete the profile
      const profileDeleted = db.prepare('DELETE FROM ffmpeg_profiles WHERE id = ?').run(profile.id);
      console.log(`  Deleted profile: ${profile.name}`);
    }
  });

  // Execute the transaction
  transaction();

  console.log('\nExtra system profiles cleanup completed successfully!');

  // Show final state
  const finalProfiles = db.prepare('SELECT * FROM ffmpeg_profiles ORDER BY is_default DESC, is_system DESC, name').all();
  console.log('\nFinal profile state:');
  finalProfiles.forEach(profile => {
    const streamCount = db.prepare('SELECT COUNT(*) as count FROM streams WHERE ffmpeg_profile_id = ? OR (ffmpeg_profile_id IS NULL AND ? = (SELECT id FROM ffmpeg_profiles WHERE is_default = 1 LIMIT 1))').get(profile.id, profile.id);
    console.log(`  - ${profile.name} (Default: ${profile.is_default ? 'Yes' : 'No'}, System: ${profile.is_system ? 'Yes' : 'No'}, Streams: ${streamCount.count})`);
  });

} catch (error) {
  console.error('Error during system profile cleanup:', error);
  process.exit(1);
} finally {
  db.close();
}