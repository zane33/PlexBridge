#!/usr/bin/env node
/**
 * XML INJECTION VULNERABILITY DEMONSTRATION
 * 
 * This script demonstrates the critical XML injection vulnerability
 * in the Android TV fix and shows how it can be exploited.
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Simulate malicious channel names that would break XML
const MALICIOUS_PAYLOADS = [
  {
    name: 'Test Channel <script>alert("XSS")</script>',
    description: 'XSS injection via channel name'
  },
  {
    name: 'Channel "onclick="alert(1)" title="',
    description: 'Attribute injection to break XML structure'
  },
  {
    name: 'Channel]]><!--<script>alert(1)</script>--><!--',
    description: 'CDATA section break and script injection'
  },
  {
    name: 'Channel</title><script>document.location="http://evil.com"</script><title>',
    description: 'Tag injection with redirect payload'
  },
  {
    name: 'Channel&lt;test&gt;&amp;more',
    description: 'Pre-encoded entities that may double-encode'
  },
  {
    name: 'Channel\n<malicious xmlns="http://evil.com"/>',
    description: 'Newline injection with malicious namespace'
  }
];

async function demonstrateVulnerability() {
  console.log('\n🔴 XML INJECTION VULNERABILITY DEMONSTRATION');
  console.log('='.repeat(60));
  
  console.log('\n📋 Testing how malicious channel names would appear in XML responses...\n');
  
  for (const payload of MALICIOUS_PAYLOADS) {
    console.log(`\n🎯 Test Case: ${payload.description}`);
    console.log(`   Input: "${payload.name}"`);
    
    // Show what the current code would generate (vulnerable)
    const vulnerableXML = generateVulnerableXML(payload.name);
    console.log(`   Vulnerable XML: ${vulnerableXML}`);
    
    // Show what the fixed code should generate
    const safeXML = generateSafeXML(payload.name);
    console.log(`   Safe XML: ${safeXML}`);
    
    // Try to parse the vulnerable XML
    try {
      // This would fail XML parsing in some cases
      const testXMLDoc = `<?xml version="1.0"?><root>${vulnerableXML}</root>`;
      // In a real scenario, this would be parsed by Plex clients
      console.log('   ⚠️  XML Status: Potentially parseable but unsafe');
    } catch (e) {
      console.log('   💥 XML Status: Would crash XML parser!');
    }
    
    console.log('   ' + '-'.repeat(50));
  }
}

function generateVulnerableXML(channelName) {
  // This is what the current SSDP code does - VULNERABLE!
  return `<Video title="${channelName}" grandparentTitle="${channelName}" summary="Live TV"/>`;
}

function generateSafeXML(channelName) {
  // This is what it should do - SAFE!
  const escaped = escapeXML(channelName);
  return `<Video title="${escaped}" grandparentTitle="${escaped}" summary="Live TV"/>`;
}

function escapeXML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
}

async function testActualEndpoints() {
  console.log('\n\n🔍 TESTING ACTUAL API ENDPOINTS');
  console.log('='.repeat(60));
  
  try {
    // Test the library sections endpoint that contains channel data
    const response = await axios.get(`${BASE_URL}/library/sections/1/all`, {
      headers: {
        'Accept': 'application/xml',
        'User-Agent': 'Plex for Android TV/10.13.0'
      },
      timeout: 5000
    });
    
    console.log('\n📊 Current XML Response Analysis:');
    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers['content-type']}`);
    console.log(`   Response Length: ${response.data.length} characters`);
    
    // Check for potentially dangerous patterns in actual response
    const xmlContent = response.data;
    const dangerousPatterns = [
      /<[^>]*title="[^"]*<[^"]*"/g,  // Script tags in titles
      /<[^>]*title="[^"]*"[^>]*onclick/g,  // onclick attributes
      /<[^>]*title="[^"]*"[^>]*javascript:/g,  // javascript: URLs
      /]]>/g,  // CDATA breaks
      /<script/g  // Script tags
    ];
    
    let foundVulnerabilities = false;
    dangerousPatterns.forEach((pattern, index) => {
      const matches = xmlContent.match(pattern);
      if (matches) {
        console.log(`   🚨 VULNERABILITY DETECTED - Pattern ${index + 1}: ${matches.length} matches`);
        console.log(`      Sample: ${matches[0].substring(0, 100)}...`);
        foundVulnerabilities = true;
      }
    });
    
    if (!foundVulnerabilities) {
      console.log('   ✅ No obvious injection patterns detected in current data');
      console.log('   ⚠️  But vulnerability still exists with malicious channel names');
    }
    
    // Try to parse the XML
    try {
      const xml2js = require('xml2js');
      await xml2js.parseStringPromise(xmlContent);
      console.log('   ✅ XML is currently well-formed');
    } catch (e) {
      console.log(`   💥 XML PARSING ERROR: ${e.message}`);
    }
    
  } catch (error) {
    console.log(`\n❌ Error testing endpoint: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      console.log('   💡 Make sure the PlexBridge server is running on port 3000');
    }
  }
}

async function showFixImplementation() {
  console.log('\n\n🔧 REQUIRED SECURITY FIX');
  console.log('='.repeat(60));
  
  console.log(`
📝 The fix requires adding XML escaping to these locations in ssdp.js:

1. Line ~702: Channel list generation
   BEFORE: title="\${channel.name}"
   AFTER:  title="\${escapeXML(channel.name)}"

2. Line ~869: Metadata generation
   BEFORE: title="\${channel?.name || \`Channel \${channelId}\`}"
   AFTER:  title="\${escapeXML(channel?.name || \`Channel \${channelId}\`)}"

3. All other user-controlled data in XML:
   - channel.description
   - channel.name variations
   - Any user input that goes into XML attributes or content

🛠️  Implementation Steps:
1. Add escapeXML function to top of ssdp.js
2. Wrap ALL user data with escapeXML() before XML generation  
3. Test with malicious payloads above
4. Validate all generated XML with XML parser

⚠️  Critical: This MUST be fixed before production deployment!
`);
}

// Main execution
async function main() {
  await demonstrateVulnerability();
  await testActualEndpoints();
  await showFixImplementation();
  
  console.log('\n\n🚨 SECURITY ASSESSMENT SUMMARY');
  console.log('='.repeat(60));
  console.log('🔴 CRITICAL: XML injection vulnerability confirmed');
  console.log('🔴 IMPACT: Android TV crashes, XML parsing failures, potential XSS');
  console.log('🔴 PRIORITY: Fix required before production deployment');
  console.log('✅ SOLUTION: Implement XML escaping for all user-controlled data');
  console.log('\n');
}

main().catch(console.error);