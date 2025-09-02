#!/usr/bin/env node

/**
 * EPG System Check via API
 * This script checks EPG status using the running server's API
 */

const axios = require('axios');

const API_BASE = 'http://localhost:8080';

async function checkEPG() {
  try {
    console.log('=== EPG SYSTEM CHECK VIA API ===\n');
    
    // Get all channels
    const channelsResponse = await axios.get(`${API_BASE}/api/channels`);
    const channels = channelsResponse.data;
    
    console.log('=== FOX SPORTS CHANNELS (After Your Updates) ===');
    const foxChannels = channels.filter(ch => ch.name.includes('FOX'));
    foxChannels.forEach(ch => {
      const status = ch.epg_id ? '✅' : '❌';
      console.log(`${status} Channel ${ch.number}: ${ch.name}`);
      console.log(`   EPG ID: ${ch.epg_id || 'NOT SET'}`);
      console.log(`   ID: ${ch.id}`);
    });
    
    console.log('\n=== SKY SPORT CHANNELS ===');
    const skyChannels = channels.filter(ch => ch.name.includes('Sky Sport'));
    skyChannels.forEach(ch => {
      const status = ch.epg_id ? '✅' : '❌';
      console.log(`${status} Channel ${ch.number}: ${ch.name}`);
      console.log(`   EPG ID: ${ch.epg_id || 'NOT SET'}`);
      console.log(`   ID: ${ch.id}`);
    });
    
    // Get EPG sources
    console.log('\n=== EPG SOURCES ===');
    const epgSourcesResponse = await axios.get(`${API_BASE}/api/epg-sources`);
    const epgSources = epgSourcesResponse.data;
    epgSources.forEach(source => {
      const status = source.enabled ? '✅ ENABLED' : '❌ DISABLED';
      console.log(`${status}: ${source.name}`);
      console.log(`   Last Success: ${source.last_success || 'Never'}`);
      if (source.last_error) {
        console.log(`   ⚠️  Last Error: ${source.last_error}`);
      }
    });
    
    // Check EPG programs for specific channels
    console.log('\n=== EPG PROGRAM CHECK ===');
    const testChannels = [...foxChannels.slice(0, 3), ...skyChannels.slice(0, 3)];
    
    for (const channel of testChannels) {
      if (channel.epg_id) {
        try {
          const epgResponse = await axios.get(`${API_BASE}/api/epg/json/${channel.epg_id}?days=1`);
          const programs = epgResponse.data.programs;
          if (programs && programs.length > 0) {
            console.log(`✅ ${channel.name} (EPG ID: ${channel.epg_id}): ${programs.length} programs found`);
            const sample = programs[0];
            console.log(`   Sample: "${sample.title}" at ${new Date(sample.start_time).toLocaleString()}`);
          } else {
            console.log(`❌ ${channel.name} (EPG ID: ${channel.epg_id}): No programs found`);
          }
        } catch (err) {
          console.log(`❌ ${channel.name} (EPG ID: ${channel.epg_id}): Error fetching EPG - ${err.message}`);
        }
      } else {
        console.log(`⚠️  ${channel.name}: No EPG ID set`);
      }
    }
    
    // Check EPG channel mappings
    console.log('\n=== EPG CHANNEL MAPPINGS ===');
    const epgChannelsResponse = await axios.get(`${API_BASE}/api/epg/channels`);
    const epgChannels = epgChannelsResponse.data;
    
    // Find EPG channels that might match our problem channels
    console.log('\nAvailable EPG channels for FOX:');
    const foxEpgChannels = epgChannels.filter(ch => 
      ch.display_name.toLowerCase().includes('fox') || 
      ch.epg_id.toLowerCase().includes('fox')
    );
    foxEpgChannels.slice(0, 10).forEach(ch => {
      console.log(`   EPG ID: "${ch.epg_id}" → ${ch.display_name}`);
    });
    
    console.log('\nAvailable EPG channels for Sky:');
    const skyEpgChannels = epgChannels.filter(ch => 
      ch.display_name.toLowerCase().includes('sky') ||
      ch.epg_id.toLowerCase().includes('sky')
    );
    skyEpgChannels.slice(0, 10).forEach(ch => {
      console.log(`   EPG ID: "${ch.epg_id}" → ${ch.display_name}`);
    });
    
    // Test XMLTV output
    console.log('\n=== TESTING XMLTV OUTPUT ===');
    try {
      const xmltvResponse = await axios.get(`${API_BASE}/epg/xmltv?days=1`, {
        headers: { 'Accept': 'application/xml' }
      });
      
      // Check if FOX channels appear in XMLTV
      const xmlContent = xmltvResponse.data;
      
      // Count channel entries
      const channelMatches = xmlContent.match(/<channel\s+id="[^"]+"/g) || [];
      console.log(`Total channels in XMLTV: ${channelMatches.length}`);
      
      // Check for specific channels
      const foxInXml = foxChannels.filter(ch => {
        if (ch.epg_id) {
          return xmlContent.includes(`channel="${ch.epg_id}"`) || 
                 xmlContent.includes(`id="${ch.epg_id}"`);
        }
        return false;
      });
      
      console.log(`FOX channels in XMLTV: ${foxInXml.length} of ${foxChannels.filter(ch => ch.epg_id).length}`);
      
      // Count programs
      const programMatches = xmlContent.match(/<programme\s/g) || [];
      console.log(`Total programs in XMLTV: ${programMatches.length}`);
      
    } catch (err) {
      console.log(`❌ Failed to fetch XMLTV: ${err.message}`);
    }
    
    console.log('\n=== SUMMARY ===');
    const channelsWithEpg = channels.filter(ch => ch.epg_id);
    console.log(`Total Channels: ${channels.length}`);
    console.log(`Channels with EPG IDs: ${channelsWithEpg.length}`);
    console.log(`Channels without EPG IDs: ${channels.length - channelsWithEpg.length}`);
    console.log(`EPG Sources: ${epgSources.length} (${epgSources.filter(s => s.enabled).length} enabled)`);
    
  } catch (error) {
    console.error('❌ Error checking EPG:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Server is not running. Please start the server first.');
    }
  }
}

// Run the check
checkEPG().then(() => {
  console.log('\n✅ EPG check complete');
}).catch(err => {
  console.error('❌ EPG check failed:', err);
});