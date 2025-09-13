const axios = require('axios');

// Test the Sky Sport SELECT NZ stream structure
const streamUrl = 'http://38.64.138.128:8089/live/86544787/4964672797/820994.m3u8';

async function analyzeM3U8Structure() {
  console.log('=== ANALYZING M3U8 STREAM STRUCTURE ===\n');
  console.log('Target URL:', streamUrl);
  
  try {
    console.log('\n1. Fetching M3U8 playlist...');
    
    const response = await axios.get(streamUrl, {
      headers: {
        'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
        'Accept': '*/*',
        'Connection': 'close'
      },
      timeout: 30000
    });
    
    console.log('✅ M3U8 fetch SUCCESS!');
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers['content-type']);
    console.log('Content-Length:', response.data.length);
    
    console.log('\n2. Analyzing M3U8 content...');
    const content = response.data;
    
    // Check if it's a master playlist or media playlist
    const isMasterPlaylist = content.includes('#EXT-X-STREAM-INF');
    const isMediaPlaylist = content.includes('#EXT-X-TARGETDURATION');
    
    console.log('Master Playlist:', isMasterPlaylist);
    console.log('Media Playlist:', isMediaPlaylist);
    
    if (isMasterPlaylist) {
      console.log('\n3. Master playlist detected - extracting variants...');
      const lines = content.split('\n');
      const variants = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const nextLine = lines[i + 1]?.trim();
          if (nextLine && !nextLine.startsWith('#')) {
            // Extract bandwidth and resolution
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
            const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            
            variants.push({
              bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1]) : null,
              resolution: resolutionMatch ? resolutionMatch[1] : null,
              url: nextLine
            });
          }
        }
      }
      
      console.log('Found variants:', variants.length);
      variants.forEach((variant, idx) => {
        console.log(`  ${idx + 1}. Bandwidth: ${variant.bandwidth}, Resolution: ${variant.resolution}`);
        console.log(`     URL: ${variant.url}`);
      });
      
      // Test the highest quality variant
      if (variants.length > 0) {
        const bestVariant = variants.reduce((prev, current) => 
          (prev.bandwidth > current.bandwidth) ? prev : current
        );
        
        console.log('\n4. Testing highest quality variant...');
        console.log('Selected variant:', bestVariant);
        
        let variantUrl = bestVariant.url;
        if (!variantUrl.startsWith('http')) {
          // Relative URL - need to resolve it
          const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/'));
          variantUrl = baseUrl + '/' + variantUrl;
          console.log('Resolved relative URL to:', variantUrl);
        }
        
        try {
          const variantResponse = await axios.get(variantUrl, {
            headers: {
              'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
              'Accept': '*/*',
              'Connection': 'close'
            },
            timeout: 15000
          });
          
          console.log('✅ Variant playlist accessible!');
          console.log('Status:', variantResponse.status);
          console.log('Content length:', variantResponse.data.length);
          
          // Analyze the variant playlist
          const variantContent = variantResponse.data;
          const segments = variantContent.split('\n').filter(line => 
            line.trim() && !line.startsWith('#')
          );
          
          console.log('Segments in playlist:', segments.length);
          if (segments.length > 0) {
            console.log('Sample segment URLs:');
            segments.slice(0, 3).forEach((segment, idx) => {
              console.log(`  ${idx + 1}. ${segment}`);
            });
          }
          
        } catch (variantError) {
          console.log('❌ Variant playlist failed:', variantError.message);
          console.log('Status:', variantError.response?.status);
        }
      }
      
    } else if (isMediaPlaylist) {
      console.log('\n3. Media playlist detected - analyzing segments...');
      
      const lines = content.split('\n');
      const segments = lines.filter(line => line.trim() && !line.startsWith('#'));
      
      console.log('Segments found:', segments.length);
      console.log('Target duration:', content.match(/#EXT-X-TARGETDURATION:(\d+)/)?.[1]);
      console.log('Media sequence:', content.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1]);
      
      if (segments.length > 0) {
        console.log('Sample segment URLs:');
        segments.slice(0, 3).forEach((segment, idx) => {
          console.log(`  ${idx + 1}. ${segment}`);
        });
        
        // Test accessing a segment
        console.log('\n4. Testing segment access...');
        let segmentUrl = segments[0];
        if (!segmentUrl.startsWith('http')) {
          const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/'));
          segmentUrl = baseUrl + '/' + segmentUrl;
        }
        
        try {
          const segmentStart = Date.now();
          const segmentResponse = await axios.head(segmentUrl, {
            headers: {
              'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
              'Accept': '*/*',
              'Connection': 'close'
            },
            timeout: 15000
          });
          const segmentTime = Date.now() - segmentStart;
          
          console.log('✅ Segment accessible!');
          console.log('Response time:', segmentTime + 'ms');
          console.log('Content-Type:', segmentResponse.headers['content-type']);
          console.log('Content-Length:', segmentResponse.headers['content-length']);
          
        } catch (segmentError) {
          console.log('❌ Segment access failed:', segmentError.message);
          console.log('Status:', segmentError.response?.status);
        }
      }
    }
    
    console.log('\n5. Testing connection timing...');
    const timingTests = [];
    
    for (let i = 0; i < 3; i++) {
      console.log(`\nTiming test ${i + 1}/3...`);
      const start = Date.now();
      
      try {
        await axios.get(streamUrl, {
          headers: {
            'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
            'Accept': '*/*',
            'Connection': 'close'
          },
          timeout: 20000,
          maxContentLength: 1024 * 1024
        });
        
        const duration = Date.now() - start;
        timingTests.push(duration);
        console.log(`✅ Test ${i + 1} completed in ${duration}ms`);
        
        // Wait 1 second between tests
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (timingError) {
        const duration = Date.now() - start;
        console.log(`❌ Test ${i + 1} failed after ${duration}ms: ${timingError.message}`);
      }
    }
    
    if (timingTests.length > 0) {
      const avgTime = timingTests.reduce((a, b) => a + b, 0) / timingTests.length;
      const minTime = Math.min(...timingTests);
      const maxTime = Math.max(...timingTests);
      
      console.log('\nTiming summary:');
      console.log(`Average: ${avgTime.toFixed(0)}ms`);
      console.log(`Min: ${minTime}ms`);
      console.log(`Max: ${maxTime}ms`);
      
      if (avgTime > 10000) {
        console.log('⚠️  WARNING: Slow response times detected (>10s average)');
        console.log('   This explains why Plex times out!');
      }
    }
    
  } catch (error) {
    console.log('❌ Analysis FAILED');
    console.log('Error:', error.message);
    console.log('Status:', error.response?.status);
  }
  
  console.log('\n=== ANALYSIS COMPLETE ===');
}

analyzeM3U8Structure().catch(console.error);