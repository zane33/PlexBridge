const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

// Orphaned streams (not linked to any channel)
const orphanedStreams = [
  {
    name: 'Sky Sports News (Orphaned)',
    url: 'https://skysports.example.com/news.m3u8',
    type: 'hls',
    enabled: true
    // No channel_id - this will be an orphaned stream
  },
  {
    name: 'Fox News Live (Orphaned)',
    url: 'https://foxnews.example.com/live.m3u8',
    type: 'hls',
    enabled: true
    // No channel_id - this will be an orphaned stream
  },
  {
    name: 'Test RTSP Stream (Orphaned)',
    url: 'rtsp://test.example.com:554/stream',
    type: 'rtsp',
    enabled: true
    // No channel_id - this will be an orphaned stream
  },
  {
    name: 'Test UDP Stream (Orphaned)',
    url: 'udp://239.255.1.1:1234',
    type: 'udp',
    enabled: false
    // No channel_id - this will be an orphaned stream
  },
  {
    name: 'ABC News 24 (Orphaned)',
    url: 'https://abc-news24.example.com/live.m3u8',
    type: 'hls',
    enabled: true
    // No channel_id - this will be an orphaned stream
  }
];

async function createOrphanedStreams() {
  console.log('🚀 Creating orphaned test streams...\n');
  
  let successCount = 0;
  let errors = [];

  for (const stream of orphanedStreams) {
    try {
      // Explicitly ensure no channel_id is sent
      const streamData = {
        name: stream.name,
        url: stream.url,
        type: stream.type,
        enabled: stream.enabled
        // Intentionally not including channel_id
      };
      
      const response = await axios.post(`${API_BASE_URL}/streams`, streamData);
      successCount++;
      console.log(`✅ Created orphaned stream: ${stream.name}`);
    } catch (error) {
      console.error(`❌ Failed to create stream ${stream.name}:`, error.response?.data?.error || error.message);
      errors.push(`${stream.name}: ${error.response?.data?.error || error.message}`);
    }
  }

  // Summary
  console.log('\n📊 Orphaned Streams Creation Summary:');
  console.log('=====================================');
  console.log(`✅ Orphaned streams created: ${successCount}/${orphanedStreams.length}`);
  console.log('\n🎯 These streams are not linked to any channel');
  console.log('   Perfect for testing:');
  console.log('   • Simple stream deletion (no channel relationship)');
  console.log('   • Stream list filtering');
  console.log('   • Assigning streams to channels later');
  
  if (errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    errors.forEach(err => console.log(`  - ${err}`));
  }
  
  console.log('\n✨ Orphaned streams creation complete!');
}

// Run the script
createOrphanedStreams().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});