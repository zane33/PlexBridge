#!/usr/bin/env node

/**
 * Test script to verify EPG auto-discovery for Plex
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

async function testEPGDiscovery() {
  console.log('🔧 Testing EPG Auto-Discovery for Plex');
  console.log('=====================================');
  console.log(`Testing server at: ${BASE_URL}`);
  console.log('');

  try {
    // Test 1: discover.json endpoint - main discovery endpoint
    console.log('📍 Testing /discover.json...');
    const discoverResponse = await axios.get(`${BASE_URL}/discover.json`);
    console.log('   FriendlyName:', discoverResponse.data.FriendlyName);
    console.log('   EPGURL:', discoverResponse.data.EPGURL);
    console.log('   GuideURL:', discoverResponse.data.GuideURL);
    console.log('   EPGSource:', discoverResponse.data.EPGSource);
    console.log('   SupportsEPG:', discoverResponse.data.SupportsEPG);
    console.log('   EPGDays:', discoverResponse.data.EPGDays);
    console.log('   XMLTVGuideDataURL:', discoverResponse.data.XMLTVGuideDataURL);
    console.log('');

    // Test 2: lineup_status.json endpoint 
    console.log('📍 Testing /lineup_status.json...');
    const statusResponse = await axios.get(`${BASE_URL}/lineup_status.json`);
    console.log('   EPGAvailable:', statusResponse.data.EPGAvailable);
    console.log('   EPGURL:', statusResponse.data.EPGURL);
    console.log('   GuideURL:', statusResponse.data.GuideURL);
    console.log('   EPGSource:', statusResponse.data.EPGSource);
    console.log('   SupportsEPG:', statusResponse.data.SupportsEPG);
    console.log('   EPGLastUpdate:', statusResponse.data.EPGLastUpdate);
    console.log('');

    // Test 3: lineup.json endpoint
    console.log('📍 Testing /lineup.json...');
    const lineupResponse = await axios.get(`${BASE_URL}/lineup.json`);
    const firstChannel = lineupResponse.data[0];
    if (firstChannel) {
      console.log('   Sample channel EPG info:');
      console.log('     GuideNumber:', firstChannel.GuideNumber);
      console.log('     GuideName:', firstChannel.GuideName);
      console.log('     EPGAvailable:', firstChannel.EPGAvailable);
      console.log('     EPGURL:', firstChannel.EPGURL);
      console.log('     GuideURL:', firstChannel.GuideURL);
      console.log('     EPGChannelID:', firstChannel.EPGChannelID);
    }
    console.log('   Total channels with EPG info:', lineupResponse.data.length);
    console.log('');

    // Test 4: device.xml endpoint
    console.log('📍 Testing /device.xml...');
    const deviceResponse = await axios.get(`${BASE_URL}/device.xml`);
    const hasContentDirectory = deviceResponse.data.includes('ContentDirectory');
    console.log('   Has ContentDirectory service:', hasContentDirectory);
    console.log('');

    // Test 5: Actual EPG data endpoint
    console.log('📍 Testing EPG data endpoint /epg/xmltv.xml...');
    try {
      const epgResponse = await axios.get(`${BASE_URL}/epg/xmltv.xml`, {
        timeout: 10000
      });
      const hasXMLTVHeader = epgResponse.data.includes('<?xml version="1.0"') && 
                           epgResponse.data.includes('<tv');
      const hasChannels = epgResponse.data.includes('<channel');
      const hasProgrammes = epgResponse.data.includes('<programme');
      
      console.log('   Valid XMLTV format:', hasXMLTVHeader);
      console.log('   Contains channels:', hasChannels);
      console.log('   Contains programmes:', hasProgrammes);
      console.log('   Response size:', epgResponse.data.length, 'bytes');
    } catch (epgError) {
      console.log('   EPG endpoint error:', epgError.message);
    }
    console.log('');

    // Summary and recommendations
    console.log('📊 EPG Discovery Summary:');
    console.log('=========================');
    
    const epgUrls = [
      discoverResponse.data.EPGURL,
      discoverResponse.data.GuideURL,
      discoverResponse.data.EPGSource,
      discoverResponse.data.XMLTVGuideDataURL,
      statusResponse.data.EPGURL,
      statusResponse.data.GuideURL
    ];
    
    const uniqueEpgUrls = [...new Set(epgUrls.filter(url => url))];
    console.log('📍 EPG URLs advertised to Plex:');
    uniqueEpgUrls.forEach(url => console.log(`   ${url}`));
    console.log('');

    // Check consistency
    const allPointToSameEndpoint = uniqueEpgUrls.every(url => 
      url.endsWith('/epg/xmltv.xml')
    );
    
    if (allPointToSameEndpoint) {
      console.log('✅ SUCCESS: All EPG URLs consistently point to XMLTV endpoint');
    } else {
      console.log('⚠️  WARNING: EPG URLs are inconsistent');
    }

    const supportsEPG = discoverResponse.data.SupportsEPG && statusResponse.data.SupportsEPG;
    if (supportsEPG) {
      console.log('✅ SUCCESS: EPG support is properly advertised');
    } else {
      console.log('❌ FAILED: EPG support not properly advertised');
    }

    console.log('');
    console.log('📋 Plex Setup Instructions:');
    console.log('============================');
    console.log('1. In Plex, go to Settings > Live TV & DVR');
    console.log('2. Select "Set up Plex DVR"');
    console.log('3. Plex should automatically discover your PlexBridge device');
    console.log('4. The EPG source should be automatically populated as:');
    console.log(`   ${uniqueEpgUrls[0] || 'No EPG URL found'}`);
    console.log('5. If not automatic, manually enter the EPG URL above');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
  }
}

// Run the test
testEPGDiscovery();