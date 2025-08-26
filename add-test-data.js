const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

// Test channels data
const testChannels = [
  {
    name: 'CNN International',
    number: 101,
    enabled: true,
    epg_id: 'cnn.international',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/CNN.svg'
  },
  {
    name: 'BBC News',
    number: 102,
    enabled: true,
    epg_id: 'bbc.news',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/1/17/BBC_News_logo.svg'
  },
  {
    name: 'ESPN Sports',
    number: 201,
    enabled: true,
    epg_id: 'espn.sports',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg'
  },
  {
    name: 'Discovery Channel',
    number: 301,
    enabled: true,
    epg_id: 'discovery.channel',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f1/2019_Discovery_logo.svg'
  },
  {
    name: 'HBO Max',
    number: 401,
    enabled: true,
    epg_id: 'hbo.max',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/1/17/HBO_Max_Logo.svg'
  },
  {
    name: 'Cartoon Network',
    number: 501,
    enabled: false, // Disabled channel for testing
    epg_id: 'cartoon.network',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/8/80/Cartoon_Network_2010_logo.svg'
  },
  {
    name: 'National Geographic',
    number: 601,
    enabled: true,
    epg_id: 'natgeo.channel',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/f/fc/Natgeologo.svg'
  },
  {
    name: 'Comedy Central',
    number: 701,
    enabled: true,
    epg_id: 'comedy.central',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Comedy_Central_2018.svg'
  }
];

// Test streams data
const testStreams = [
  // CNN - Multiple streams for testing cascade deletion
  {
    name: 'CNN HD Stream',
    url: 'https://cnn-cnninternational-1-gb.samsung.wurl.com/manifest/playlist.m3u8',
    type: 'hls',
    enabled: true,
    channelNumber: 101 // Will be linked to CNN
  },
  {
    name: 'CNN Backup Stream',
    url: 'https://cnn-backup.example.com/stream.m3u8',
    type: 'hls',
    enabled: true,
    channelNumber: 101 // Will be linked to CNN
  },
  {
    name: 'CNN Low Quality',
    url: 'https://cnn-low.example.com/stream.m3u8',
    type: 'hls',
    enabled: false,
    channelNumber: 101 // Will be linked to CNN
  },
  // BBC - Single stream
  {
    name: 'BBC News Live',
    url: 'https://bbc-news.example.com/live.m3u8',
    type: 'hls',
    enabled: true,
    channelNumber: 102 // Will be linked to BBC
  },
  // ESPN - Multiple streams
  {
    name: 'ESPN HD',
    url: 'https://espn-hd.example.com/stream.m3u8',
    type: 'hls',
    enabled: true,
    channelNumber: 201 // Will be linked to ESPN
  },
  {
    name: 'ESPN 4K',
    url: 'https://espn-4k.example.com/stream.m3u8',
    type: 'dash',
    enabled: true,
    channelNumber: 201 // Will be linked to ESPN
  },
  // Discovery - Single stream
  {
    name: 'Discovery Channel HD',
    url: 'rtmp://discovery.example.com/live/stream',
    type: 'rtmp',
    enabled: true,
    channelNumber: 301 // Will be linked to Discovery
  },
  // HBO - No streams (for testing channel with no streams)
  
  // Orphaned streams (not linked to any channel)
  {
    name: 'Sky Sports News',
    url: 'https://skysports.example.com/news.m3u8',
    type: 'hls',
    enabled: true,
    channelNumber: null // Orphaned stream
  },
  {
    name: 'Fox News Live',
    url: 'https://foxnews.example.com/live.m3u8',
    type: 'hls',
    enabled: true,
    channelNumber: null // Orphaned stream
  },
  {
    name: 'Test Stream RTSP',
    url: 'rtsp://test.example.com:554/stream',
    type: 'rtsp',
    enabled: true,
    channelNumber: null // Orphaned stream
  },
  {
    name: 'Test Stream UDP',
    url: 'udp://239.255.1.1:1234',
    type: 'udp',
    enabled: false,
    channelNumber: null // Orphaned disabled stream
  },
  // National Geographic - Single stream
  {
    name: 'NatGeo Wild HD',
    url: 'https://natgeo.example.com/wild.m3u8',
    type: 'hls',
    enabled: true,
    channelNumber: 601 // Will be linked to NatGeo
  }
];

async function createTestData() {
  console.log('🚀 Starting test data creation...\n');
  
  const createdChannels = [];
  const createdStreams = [];
  let errors = [];

  // Create channels first
  console.log('📺 Creating test channels...');
  for (const channel of testChannels) {
    try {
      const response = await axios.post(`${API_BASE_URL}/channels`, channel);
      createdChannels.push(response.data);
      console.log(`✅ Created channel: ${channel.name} (#${channel.number})`);
    } catch (error) {
      if (error.response?.status === 409) {
        console.log(`⚠️  Channel already exists: ${channel.name} (#${channel.number})`);
      } else {
        console.error(`❌ Failed to create channel ${channel.name}:`, error.response?.data?.error || error.message);
        errors.push(`Channel ${channel.name}: ${error.response?.data?.error || error.message}`);
      }
    }
  }

  console.log('\n📡 Creating test streams...');
  
  // Get all channels to map channel numbers to IDs
  try {
    const channelsResponse = await axios.get(`${API_BASE_URL}/channels`);
    const allChannels = channelsResponse.data;
    
    for (const stream of testStreams) {
      try {
        // Find the channel ID if stream should be linked
        let streamData = {
          name: stream.name,
          url: stream.url,
          type: stream.type,
          enabled: stream.enabled
        };
        
        if (stream.channelNumber) {
          const channel = allChannels.find(ch => ch.number === stream.channelNumber);
          if (channel) {
            streamData.channel_id = channel.id;
            console.log(`   Linking to channel: ${channel.name}`);
          }
        }
        
        const response = await axios.post(`${API_BASE_URL}/streams`, streamData);
        createdStreams.push(response.data);
        console.log(`✅ Created stream: ${stream.name}${stream.channelNumber ? ` (Channel #${stream.channelNumber})` : ' (Orphaned)'}`);
      } catch (error) {
        console.error(`❌ Failed to create stream ${stream.name}:`, error.response?.data?.error || error.message);
        errors.push(`Stream ${stream.name}: ${error.response?.data?.error || error.message}`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to fetch channels for stream linking:', error.message);
    errors.push(`Channel fetching: ${error.message}`);
  }

  // Summary
  console.log('\n📊 Test Data Creation Summary:');
  console.log('================================');
  console.log(`✅ Channels created/existing: ${testChannels.length}`);
  console.log(`✅ Streams created: ${createdStreams.length}`);
  
  console.log('\n🎯 Test Scenarios Available:');
  console.log('• CNN International (#101): Has 3 streams (test cascade deletion)');
  console.log('• BBC News (#102): Has 1 stream (test single stream deletion)');
  console.log('• ESPN Sports (#201): Has 2 streams (test multiple stream handling)');
  console.log('• Discovery Channel (#301): Has 1 RTMP stream');
  console.log('• HBO Max (#401): No streams (test simple channel deletion)');
  console.log('• Cartoon Network (#501): Disabled channel with no streams');
  console.log('• National Geographic (#601): Has 1 stream');
  console.log('• Comedy Central (#701): No streams');
  console.log('• Orphaned Streams: 4 streams not linked to any channel');
  
  if (errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    errors.forEach(err => console.log(`  - ${err}`));
  }
  
  console.log('\n✨ Test data creation complete!');
  console.log('🌐 Open http://localhost:3000 to test the deletion functionality');
}

// Run the script
createTestData().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});