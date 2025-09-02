const axios = require('axios');

async function testRedirectConsistency() {
  const originalUrl = 'http://line.premiumpowers.net:80/fc98427248/ab83b073d8/1520176';
  
  console.log('🔄 Testing Redirect URL Consistency');
  console.log('==================================');
  console.log(`Original URL: ${originalUrl}`);
  
  const redirectUrls = [];
  
  // Test 5 consecutive redirect requests
  for (let i = 1; i <= 5; i++) {
    console.log(`\n${i}. Testing redirect #${i}:`);
    
    try {
      const response = await axios.get(originalUrl, {
        maxRedirects: 0,
        timeout: 5000,
        responseType: 'text',
        maxContentLength: 1000,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'IPTVSmarters/1.0',
          'Accept': '*/*',
          'Connection': 'keep-alive'
        }
      });
      
      if (response.status === 302 && response.headers.location) {
        const redirectUrl = response.headers.location;
        redirectUrls.push(redirectUrl);
        console.log(`   ✅ Status: ${response.status}`);
        console.log(`   ✅ Redirect: ${redirectUrl}`);
        
        // Extract the encoded path for comparison
        const pathMatch = redirectUrl.match(/live\/play\/([^\/]+)/);
        if (pathMatch) {
          console.log(`   🔑 Encoded path: ${pathMatch[1]}`);
        }
      } else {
        console.log(`   ❌ No redirect: Status ${response.status}`);
      }
      
      // Wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      if (error.response && error.response.status === 302) {
        const redirectUrl = error.response.headers.location;
        redirectUrls.push(redirectUrl);
        console.log(`   ✅ Status: ${error.response.status} (from error)`);
        console.log(`   ✅ Redirect: ${redirectUrl}`);
      } else {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
  }
  
  // Analyze consistency
  console.log('\n📊 Redirect Analysis:');
  console.log('===================');
  
  if (redirectUrls.length === 0) {
    console.log('❌ No redirect URLs captured');
    return;
  }
  
  const uniqueUrls = [...new Set(redirectUrls)];
  console.log(`Total redirects: ${redirectUrls.length}`);
  console.log(`Unique URLs: ${uniqueUrls.length}`);
  
  if (uniqueUrls.length === 1) {
    console.log('✅ All redirects are identical (static URLs)');
    console.log(`URL: ${uniqueUrls[0]}`);
  } else {
    console.log('⚠️ Redirects are changing (time-sensitive/session URLs)');
    uniqueUrls.forEach((url, index) => {
      console.log(`${index + 1}. ${url}`);
    });
  }
  
  // Test if any of the redirected URLs work
  console.log('\n🔍 Testing Redirected URL Accessibility:');
  for (let i = 0; i < Math.min(2, uniqueUrls.length); i++) {
    const testUrl = uniqueUrls[i];
    console.log(`\nTesting URL ${i + 1}: ${testUrl}`);
    
    try {
      const testResponse = await axios.head(testUrl, {
        timeout: 5000,
        validateStatus: () => true,
        headers: { 'User-Agent': 'IPTVSmarters/1.0' }
      });
      
      console.log(`   Status: ${testResponse.status} ${testResponse.statusText}`);
      console.log(`   Content-Type: ${testResponse.headers['content-type']}`);
      
      if (testResponse.status === 200) {
        console.log(`   ✅ URL ${i + 1} is accessible`);
      } else if (testResponse.status === 509) {
        console.log(`   ❌ URL ${i + 1} - Bandwidth limit exceeded`);
      } else {
        console.log(`   ⚠️ URL ${i + 1} - Unexpected status`);
      }
    } catch (testError) {
      console.log(`   ❌ URL ${i + 1} failed: ${testError.message}`);
    }
  }
}

testRedirectConsistency().catch(console.error);