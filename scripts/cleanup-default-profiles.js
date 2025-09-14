#!/usr/bin/env node

/**
 * Script to clean up multiple default profiles and consolidate to single default
 * This addresses the issue where multiple default profiles were created
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
  console.log('Starting default profile cleanup...');

  // Get all current default profiles
  const defaultProfiles = db.prepare('SELECT * FROM ffmpeg_profiles WHERE is_default = 1').all();
  console.log(`Found ${defaultProfiles.length} default profiles`);

  if (defaultProfiles.length <= 1) {
    console.log('Only one default profile exists. No cleanup needed.');
    process.exit(0);
  }

  // Display current profiles
  defaultProfiles.forEach((profile, index) => {
    console.log(`  ${index + 1}. ${profile.name} (ID: ${profile.id}, Created: ${profile.created_at})`);
  });

  // Keep the one with "Default Profile" name and most recent update, or first one if none match
  let primaryDefault = defaultProfiles.find(p => p.name === 'Default Profile');
  if (!primaryDefault) {
    // Sort by updated_at descending and take the most recent
    primaryDefault = defaultProfiles.sort((a, b) =>
      new Date(b.updated_at) - new Date(a.updated_at)
    )[0];
  }

  console.log(`Keeping profile: ${primaryDefault.name} (ID: ${primaryDefault.id})`);

  // Update this profile to use the new optimized FFmpeg arguments
  const newFFmpegArgs = '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1';
  const newHLSArgs = '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto';

  // Begin transaction
  const transaction = db.transaction(() => {
    // Update the primary default profile
    db.prepare(`
      UPDATE ffmpeg_profiles
      SET name = 'Default Profile',
          description = 'Optimized for maximum compatibility and performance',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(primaryDefault.id);

    // Update all client configurations for the primary default
    db.prepare('DELETE FROM ffmpeg_profile_clients WHERE profile_id = ?').run(primaryDefault.id);

    const clientTypes = ['web_browser', 'android_mobile', 'android_tv', 'ios_mobile', 'apple_tv'];
    const insertClient = db.prepare(`
      INSERT INTO ffmpeg_profile_clients (id, profile_id, client_type, ffmpeg_args, hls_args, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    clientTypes.forEach(clientType => {
      const clientId = require('crypto').randomUUID();
      insertClient.run(clientId, primaryDefault.id, clientType, newFFmpegArgs, newHLSArgs);
    });

    // Handle streams from other default profiles
    const otherDefaults = defaultProfiles.filter(p => p.id !== primaryDefault.id);

    for (const profile of otherDefaults) {
      console.log(`Processing profile: ${profile.name} (ID: ${profile.id})`);

      // Move streams from this profile to the primary default
      const streamsUsingProfile = db.prepare('SELECT id, name FROM streams WHERE ffmpeg_profile_id = ?').all(profile.id);

      if (streamsUsingProfile.length > 0) {
        console.log(`  Moving ${streamsUsingProfile.length} streams to primary default profile`);
        db.prepare('UPDATE streams SET ffmpeg_profile_id = ? WHERE ffmpeg_profile_id = ?')
          .run(primaryDefault.id, profile.id);
      }

      // Mark as non-default and rename
      db.prepare(`
        UPDATE ffmpeg_profiles
        SET is_default = 0,
            name = ?,
            description = 'Deprecated - migrated to consolidated default profile',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(`${profile.name} (Deprecated)`, profile.id);

      console.log(`  Profile marked as deprecated: ${profile.name} (Deprecated)`);
    }

    // Delete deprecated profiles that have no streams and are system profiles
    for (const profile of otherDefaults) {
      const streamCount = db.prepare('SELECT COUNT(*) as count FROM streams WHERE ffmpeg_profile_id = ?').get(profile.id);

      if (streamCount.count === 0 && profile.is_system === 1) {
        // Delete client configurations first
        db.prepare('DELETE FROM ffmpeg_profile_clients WHERE profile_id = ?').run(profile.id);
        // Delete the profile
        db.prepare('DELETE FROM ffmpeg_profiles WHERE id = ?').run(profile.id);
        console.log(`  Deleted empty system profile: ${profile.name}`);
      }
    }
  });

  // Execute the transaction
  transaction();

  console.log('Default profile cleanup completed successfully!');

  // Show final state
  const finalProfiles = db.prepare('SELECT * FROM ffmpeg_profiles ORDER BY is_default DESC, name').all();
  console.log('\nFinal profile state:');
  finalProfiles.forEach(profile => {
    const streamCount = db.prepare('SELECT COUNT(*) as count FROM streams WHERE ffmpeg_profile_id = ? OR (ffmpeg_profile_id IS NULL AND ? = (SELECT id FROM ffmpeg_profiles WHERE is_default = 1 LIMIT 1))').get(profile.id, profile.id);
    console.log(`  - ${profile.name} (Default: ${profile.is_default ? 'Yes' : 'No'}, Streams: ${streamCount.count})`);
  });

} catch (error) {
  console.error('Error during profile cleanup:', error);
  process.exit(1);
} finally {
  db.close();
}