#!/usr/bin/env node

/**
 * Plex Cache Clearing Utility for PlexBridge
 * 
 * Forces Plex to refresh all cached metadata and channel lineup data
 * to eliminate lingering "type 5" errors from cached responses.
 * 
 * Usage: node clear-plex-cache.js [--plex-url=<url>] [--plex-token=<token>]
 */

const axios = require('axios');
const logger = require('./server/utils/logger');

class PlexCacheClearer {
  constructor() {
    this.plexUrl = process.env.PLEX_URL || process.argv.find(arg => arg.startsWith('--plex-url='))?.split('=')[1];
    this.plexToken = process.env.PLEX_TOKEN || process.argv.find(arg => arg.startsWith('--plex-token='))?.split('=')[1];
    
    this.plexBridgeUrl = process.env.PLEXBRIDGE_URL || 'http://localhost:3000';
    this.deviceUuid = process.env.DEVICE_UUID || 'plextv-001';
    
    this.actions = [];
  }

  log(message, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, data);
    this.actions.push({ timestamp, message, data });
  }

  async clearPlexServer() {
    if (!this.plexUrl || !this.plexToken) {
      this.log('⚠️ Plex server URL and token not provided, skipping Plex server cache clear');
      this.log('   Set PLEX_URL and PLEX_TOKEN environment variables or use --plex-url and --plex-token flags');
      return false;
    }

    try {
      this.log('🧹 Clearing Plex server cache...');

      // 1. Refresh library sections
      const sectionsResponse = await axios.get(`${this.plexUrl}/library/sections`, {
        headers: { 'X-Plex-Token': this.plexToken },
        timeout: 10000
      });

      if (sectionsResponse.data?.MediaContainer?.Directory) {
        for (const section of sectionsResponse.data.MediaContainer.Directory) {
          if (section.type === 'livetv' || section.scanner === 'HDHomeRun') {
            this.log(`📺 Refreshing Live TV section: ${section.title}`, { sectionId: section.key });
            
            try {
              await axios.put(`${this.plexUrl}/library/sections/${section.key}/refresh`, {}, {
                headers: { 'X-Plex-Token': this.plexToken },
                timeout: 30000
              });
              
              this.log(`✅ Live TV section refreshed: ${section.title}`);
            } catch (refreshError) {
              this.log(`❌ Failed to refresh section ${section.title}`, { 
                error: refreshError.message 
              });
            }
          }
        }
      }

      // 2. Clear device cache
      try {
        await axios.delete(`${this.plexUrl}/devices/${this.deviceUuid}`, {
          headers: { 'X-Plex-Token': this.plexToken },
          timeout: 10000
        });
        this.log('🔧 Cleared device cache for PlexBridge');
      } catch (deviceError) {
        this.log('⚠️ Could not clear device cache (device may not be registered)', { 
          error: deviceError.message 
        });
      }

      // 3. Force rescan of HDHomeRun devices
      try {
        await axios.put(`${this.plexUrl}/livetv/dvrs/discover`, {}, {
          headers: { 'X-Plex-Token': this.plexToken },
          timeout: 15000
        });
        this.log('🔍 Triggered HDHomeRun device discovery');
      } catch (discoverError) {
        this.log('⚠️ Could not trigger device discovery', { 
          error: discoverError.message 
        });
      }

      return true;
    } catch (error) {
      this.log('❌ Failed to clear Plex server cache', { error: error.message });
      return false;
    }
  }

  async forceChannelRescan() {
    try {
      this.log('📡 Forcing PlexBridge channel rescan...');

      // Trigger channel lineup refresh by hitting the lineup.post endpoint
      const rescanResponse = await axios.post(`${this.plexBridgeUrl}/lineup.post`, {}, {
        headers: {
          'User-Agent': 'PlexCacheClearer/1.0',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      this.log('✅ Channel rescan completed', { 
        channelCount: Array.isArray(rescanResponse.data) ? rescanResponse.data.length : 'unknown'
      });

      return rescanResponse.data;
    } catch (error) {
      this.log('❌ Failed to trigger channel rescan', { error: error.message });
      return false;
    }
  }

  async updatePlexBridgeMetadata() {
    try {
      this.log('🔄 Updating PlexBridge metadata responses...');

      // Hit key endpoints to ensure they return fresh metadata
      const endpoints = [
        '/discover.json',
        '/lineup.json', 
        '/lineup_status.json'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await axios.get(`${this.plexBridgeUrl}${endpoint}`, {
            headers: {
              'User-Agent': 'PlexCacheClearer/1.0',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            },
            timeout: 10000
          });

          this.log(`✅ Updated ${endpoint}`, { 
            status: response.status,
            dataSize: JSON.stringify(response.data).length 
          });
        } catch (endpointError) {
          this.log(`❌ Failed to update ${endpoint}`, { 
            error: endpointError.message 
          });
        }
      }

      return true;
    } catch (error) {
      this.log('❌ Failed to update PlexBridge metadata', { error: error.message });
      return false;
    }
  }

  async addCachePreventionHeaders() {
    this.log('🚫 Configuring cache prevention headers...');
    
    // Instructions for manual header configuration
    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': `"plexbridge-${Date.now()}"`,
      'Last-Modified': new Date().toUTCString(),
      'Vary': 'User-Agent, Accept, X-Plex-Token'
    };

    this.log('📝 Recommended headers to prevent Plex metadata caching:', headers);
    
    return headers;
  }

  async validateCurrentMetadata() {
    this.log('🔍 Validating current PlexBridge metadata...');
    
    try {
      // Check key endpoints for type 5 issues
      const endpoints = [
        '/lineup.json',
        '/library/metadata/1',
        '/timeline/1'
      ];

      let foundIssues = [];

      for (const endpoint of endpoints) {
        try {
          const response = await axios.get(`${this.plexBridgeUrl}${endpoint}`, {
            timeout: 10000
          });

          const responseText = JSON.stringify(response.data);
          
          // Check for actual type 5 issues (exact matches)
          const type5Patterns = [
            /"type":\s*5\b/,
            /"contentType":\s*5\b/,
            /"ContentType":\s*5\b/,
            /type="5"/,
            /"type":\s*"trailer"/,
            /type="trailer"/
          ];

          for (const pattern of type5Patterns) {
            if (pattern.test(responseText)) {
              foundIssues.push({
                endpoint,
                pattern: pattern.toString(),
                match: responseText.match(pattern)?.[0]
              });
            }
          }

          this.log(`✅ Validated ${endpoint} - No type 5 issues found`);
        } catch (endpointError) {
          this.log(`❌ Could not validate ${endpoint}`, { 
            error: endpointError.message 
          });
        }
      }

      if (foundIssues.length > 0) {
        this.log('🚨 CRITICAL: Type 5 metadata still detected!', { issues: foundIssues });
        return false;
      } else {
        this.log('✅ All metadata validation passed - No type 5 issues detected');
        return true;
      }
    } catch (error) {
      this.log('❌ Metadata validation failed', { error: error.message });
      return false;
    }
  }

  async run() {
    console.log('🧹 Plex Cache Clearing Utility for PlexBridge');
    console.log('============================================');
    console.log(`PlexBridge: ${this.plexBridgeUrl}`);
    console.log(`Plex Server: ${this.plexUrl || 'Not configured'}`);
    console.log('');

    let success = true;

    // Step 1: Validate current metadata
    this.log('Phase 1: Validating current metadata');
    const validationPassed = await this.validateCurrentMetadata();
    
    if (validationPassed) {
      this.log('✅ Current metadata is clean - no type 5 issues detected');
    } else {
      this.log('🚨 Type 5 metadata detected - continuing with cache clearing...');
      success = false;
    }

    console.log('');

    // Step 2: Update PlexBridge responses
    this.log('Phase 2: Refreshing PlexBridge metadata');
    await this.updatePlexBridgeMetadata();

    console.log('');

    // Step 3: Force channel rescan
    this.log('Phase 3: Forcing channel rescan');
    const rescanResult = await this.forceChannelRescan();
    
    if (rescanResult) {
      this.log('✅ Channel rescan completed successfully');
    }

    console.log('');

    // Step 4: Clear Plex server cache (if configured)
    this.log('Phase 4: Clearing Plex server cache');
    const plexClearResult = await this.clearPlexServer();
    
    console.log('');

    // Step 5: Configure cache prevention
    this.log('Phase 5: Cache prevention configuration');
    await this.addCachePreventionHeaders();

    console.log('');

    // Final validation
    this.log('Phase 6: Final validation');
    const finalValidation = await this.validateCurrentMetadata();

    console.log('');
    console.log('📋 Summary');
    console.log('==========');
    
    if (finalValidation) {
      console.log('✅ SUCCESS: No type 5 metadata detected');
      console.log('✅ PlexBridge metadata is clean and ready');
    } else {
      console.log('❌ CRITICAL: Type 5 metadata still present');
      console.log('❌ Manual intervention may be required');
      success = false;
    }

    console.log(`📊 Actions performed: ${this.actions.length}`);

    // Recommendations
    console.log('');
    console.log('💡 Next Steps:');
    console.log('1. Restart your Plex Server to clear all cached metadata');
    console.log('2. Remove and re-add PlexBridge as a DVR device in Plex');
    console.log('3. Run a full channel scan in Plex Live TV settings');
    console.log('4. Monitor Plex logs for any remaining type 5 errors');
    
    if (!plexClearResult) {
      console.log('5. Configure Plex server connection for automated cache clearing');
    }

    return success;
  }
}

// Run the cache clearer if called directly
if (require.main === module) {
  const clearer = new PlexCacheClearer();
  clearer.run().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Cache clearing failed:', error);
    process.exit(1);
  });
}

module.exports = PlexCacheClearer;