/**
 * M3U Performance Test Script
 * Tests the optimized M3U parsing performance with various playlist sizes
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

const BASE_URL = 'http://localhost:8080';

// Test playlists of different sizes
const TEST_PLAYLISTS = [
  {
    name: 'Small Playlist (~100 channels)',
    url: 'https://iptv-org.github.io/iptv/countries/us.m3u',
    expectedSize: { min: 50, max: 500 }
  },
  {
    name: 'Medium Playlist (~1K channels)', 
    url: 'https://iptv-org.github.io/iptv/index.m3u',
    expectedSize: { min: 500, max: 5000 }
  },
  {
    name: 'Large Playlist (Custom - if available)',
    url: 'https://example.com/large-playlist.m3u', // Replace with actual large playlist
    expectedSize: { min: 5000, max: 100000 }
  }
];

class M3UPerformanceTester {
  constructor() {
    this.results = [];
  }

  async testLegacyParser(url) {
    const startTime = performance.now();
    let channelCount = 0;
    
    try {
      console.log('Testing Legacy Parser...');
      const response = await axios.post(`${BASE_URL}/api/streams/parse/m3u`, { 
        url, 
        useCache: false 
      });
      
      channelCount = response.data.total;
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      return {
        parser: 'legacy',
        success: true,
        duration,
        channelCount,
        channelsPerSecond: channelCount / (duration / 1000)
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        parser: 'legacy',
        success: false,
        duration: endTime - startTime,
        error: error.message
      };
    }
  }

  async testStreamingParser(url) {
    const startTime = performance.now();
    let channelCount = 0;
    let chunksReceived = 0;
    
    return new Promise((resolve) => {
      console.log('Testing Streaming Parser...');
      
      const encodedUrl = encodeURIComponent(url);
      const eventSource = new EventSource(
        `${BASE_URL}/api/streams/parse/m3u/stream?url=${encodedUrl}&chunkSize=100&useCache=false`
      );

      eventSource.addEventListener('channels', (event) => {
        const data = JSON.parse(event.data);
        channelCount = data.totalParsed;
        chunksReceived++;
      });

      eventSource.addEventListener('complete', (event) => {
        const data = JSON.parse(event.data);
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        eventSource.close();
        resolve({
          parser: 'streaming',
          success: true,
          duration,
          channelCount: data.totalChannels,
          chunksReceived,
          channelsPerSecond: data.totalChannels / (duration / 1000)
        });
      });

      eventSource.addEventListener('error', (event) => {
        const endTime = performance.now();
        eventSource.close();
        resolve({
          parser: 'streaming',
          success: false,
          duration: endTime - startTime,
          error: 'Streaming connection failed'
        });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        const endTime = performance.now();
        eventSource.close();
        resolve({
          parser: 'streaming',
          success: false,
          duration: endTime - startTime,
          error: 'Timeout after 5 minutes'
        });
      }, 300000);
    });
  }

  async testCachePerformance(url) {
    console.log('Testing Cache Performance...');
    
    // First request (cache miss)
    const startTime1 = performance.now();
    const response1 = await axios.post(`${BASE_URL}/api/streams/parse/m3u`, { 
      url, 
      useCache: true 
    });
    const endTime1 = performance.now();
    const duration1 = endTime1 - startTime1;

    // Wait a moment for cache to settle
    await new Promise(resolve => setTimeout(resolve, 100));

    // Second request (cache hit)
    const startTime2 = performance.now();
    const response2 = await axios.post(`${BASE_URL}/api/streams/parse/m3u`, { 
      url, 
      useCache: true 
    });
    const endTime2 = performance.now();
    const duration2 = endTime2 - startTime2;

    return {
      cacheMiss: {
        duration: duration1,
        cached: response1.data.cached,
        channelCount: response1.data.total
      },
      cacheHit: {
        duration: duration2,
        fromCache: response2.data.fromCache,
        channelCount: response2.data.total,
        speedup: duration1 / duration2
      }
    };
  }

  async getCacheStatus() {
    try {
      const response = await axios.get(`${BASE_URL}/api/m3u/cache/status`);
      return response.data;
    } catch (error) {
      return { error: error.message };
    }
  }

  async clearCache() {
    try {
      await axios.delete(`${BASE_URL}/api/m3u/cache/clear`);
      console.log('Cache cleared successfully');
    } catch (error) {
      console.error('Failed to clear cache:', error.message);
    }
  }

  async runPerformanceTest() {
    console.log('🚀 Starting M3U Performance Tests\n');
    console.log('=' * 50);

    for (const playlist of TEST_PLAYLISTS) {
      console.log(`\n📋 Testing: ${playlist.name}`);
      console.log(`🔗 URL: ${playlist.url}`);
      console.log('-' * 30);

      try {
        // Clear cache before each test
        await this.clearCache();

        // Test both parsers
        const legacyResult = await this.testLegacyParser(playlist.url);
        const streamingResult = await this.testStreamingParser(playlist.url);
        
        // Test cache performance
        const cacheResult = await this.testCachePerformance(playlist.url);

        // Store results
        const testResult = {
          playlist: playlist.name,
          url: playlist.url,
          legacy: legacyResult,
          streaming: streamingResult,
          cache: cacheResult,
          timestamp: new Date().toISOString()
        };

        this.results.push(testResult);

        // Display results
        this.displayTestResults(testResult);

      } catch (error) {
        console.error(`❌ Test failed for ${playlist.name}:`, error.message);
      }
    }

    // Display final summary
    console.log('\n' + '=' * 50);
    console.log('📊 PERFORMANCE TEST SUMMARY');
    console.log('=' * 50);
    this.displaySummary();
  }

  displayTestResults(result) {
    console.log('\n📈 Results:');
    
    if (result.legacy.success) {
      console.log(`   Legacy Parser: ${result.legacy.duration.toFixed(2)}ms (${result.legacy.channelCount} channels)`);
      console.log(`   ⚡ Speed: ${result.legacy.channelsPerSecond.toFixed(2)} channels/sec`);
    } else {
      console.log(`   Legacy Parser: ❌ Failed - ${result.legacy.error}`);
    }

    if (result.streaming.success) {
      console.log(`   Streaming Parser: ${result.streaming.duration.toFixed(2)}ms (${result.streaming.channelCount} channels)`);
      console.log(`   ⚡ Speed: ${result.streaming.channelsPerSecond.toFixed(2)} channels/sec`);
      console.log(`   📦 Chunks: ${result.streaming.chunksReceived}`);
    } else {
      console.log(`   Streaming Parser: ❌ Failed - ${result.streaming.error}`);
    }

    if (result.cache.cacheHit) {
      console.log(`   Cache Performance:`);
      console.log(`     First load: ${result.cache.cacheMiss.duration.toFixed(2)}ms`);
      console.log(`     Cache hit: ${result.cache.cacheHit.duration.toFixed(2)}ms`);
      console.log(`     🚀 Speedup: ${result.cache.cacheHit.speedup.toFixed(2)}x faster`);
    }
  }

  displaySummary() {
    const successfulTests = this.results.filter(r => r.legacy.success && r.streaming.success);
    
    if (successfulTests.length === 0) {
      console.log('❌ No successful tests to summarize');
      return;
    }

    const avgLegacySpeed = successfulTests.reduce((sum, r) => sum + r.legacy.channelsPerSecond, 0) / successfulTests.length;
    const avgStreamingSpeed = successfulTests.reduce((sum, r) => sum + r.streaming.channelsPerSecond, 0) / successfulTests.length;
    const avgCacheSpeedup = successfulTests.reduce((sum, r) => sum + (r.cache.cacheHit?.speedup || 1), 0) / successfulTests.length;

    console.log(`✅ Successful tests: ${successfulTests.length}/${this.results.length}`);
    console.log(`📊 Average Performance:`);
    console.log(`   Legacy Parser: ${avgLegacySpeed.toFixed(2)} channels/sec`);
    console.log(`   Streaming Parser: ${avgStreamingSpeed.toFixed(2)} channels/sec`);
    console.log(`   Cache Speedup: ${avgCacheSpeedup.toFixed(2)}x`);
    
    if (avgStreamingSpeed > avgLegacySpeed) {
      const improvement = ((avgStreamingSpeed - avgLegacySpeed) / avgLegacySpeed * 100);
      console.log(`🚀 Streaming parser is ${improvement.toFixed(1)}% faster on average`);
    }
  }

  async monitorMemoryUsage() {
    const used = process.memoryUsage();
    return {
      rss: Math.round(used.rss / 1024 / 1024),
      heapTotal: Math.round(used.heapTotal / 1024 / 1024),
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      external: Math.round(used.external / 1024 / 1024)
    };
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new M3UPerformanceTester();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n⏹️  Test interrupted by user');
    process.exit(0);
  });

  tester.runPerformanceTest()
    .then(() => {
      console.log('\n✅ Performance tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Performance tests failed:', error);
      process.exit(1);
    });
}

module.exports = M3UPerformanceTester;