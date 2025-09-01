const axios = require('axios');

async function testRedirect() {
  const streamUrl = 'http://line.premiumpowers.net:80/fc98427248/ab83b073d8/1520176';
  
  console.log('Testing redirect logic...');
  console.log(`Original URL: ${streamUrl}`);
  
  try {
    console.log('\n1. Testing with GET request (maxRedirects: 0)');
    const response = await axios.get(streamUrl, {
      maxRedirects: 0,
      timeout: 10000,
      responseType: 'text',
      maxContentLength: 1000,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      },
      headers: {
        'User-Agent': 'IPTVSmarters/1.0',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response URL: ${response.request.responseURL}`);
    console.log(`Location header: ${response.headers.location}`);
    
  } catch (error) {
    console.log(`Error caught: ${error.message}`);
    console.log(`Error status: ${error.response?.status}`);
    console.log(`Error headers:`, error.response?.headers);
    
    if (error.response?.status === 302 && error.response?.headers?.location) {
      console.log(`✅ Got redirect from error: ${error.response.headers.location}`);
      
      // Test the redirected URL
      const redirectUrl = error.response.headers.location;
      console.log(`\n2. Testing redirected URL: ${redirectUrl}`);
      
      try {
        const redirectResponse = await axios.head(redirectUrl, {
          timeout: 5000,
          headers: { 'User-Agent': 'IPTVSmarters/1.0' }
        });
        
        console.log(`Redirect URL status: ${redirectResponse.status}`);
        console.log(`Redirect URL content-type: ${redirectResponse.headers['content-type']}`);
        console.log(`✅ Redirected URL is accessible`);
        
      } catch (redirectError) {
        console.log(`❌ Redirected URL failed: ${redirectError.message}`);
      }
    }
  }
}

testRedirect().catch(console.error);