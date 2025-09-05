# 🚨 CRITICAL SECURITY VULNERABILITY - XML INJECTION

## PRODUCTION CODE REVIEW RESULTS - ANDROID TV FIX

### 🔴 CRITICAL ISSUES FOUND

#### 1. XML Injection Vulnerability (CRITICAL)
**Location**: `/server/routes/ssdp.js`
**Issue**: User-controlled data (channel names, descriptions) embedded directly into XML without escaping
**Impact**: XML parsing crashes, potential XSS, malformed responses breaking Android TV clients

**Vulnerable Code Examples**:
```javascript
// Line 702: Channel name directly embedded in XML
title="${channel.name}"

// Line 869: Multiple user inputs without escaping  
title="${channel?.name || `Channel ${channelId}`}"
grandparentTitle="${channel?.name || `Channel ${channelId}`}"
summary="${channel?.description || "Live television programming"}"
```

**Attack Vectors**:
- Channel name: `Test Channel <script>alert(1)</script>`
- Channel name: `Channel"onclick="alert(1)`  
- Channel name: `Channel]]><!--malicious-->`
- Description: `<![CDATA[</description><script>alert(1)</script><description>]]>`

#### 2. Missing User-Agent Handling for Grabber
**Location**: Line 799, `/library/metadata/:metadataId`
**Issue**: Grabber clients not detected properly
**Impact**: Wrong content type returned to Plex Grabber processes

#### 3. Performance Concerns
- Large XML documents generated in memory (no streaming)
- No rate limiting on expensive endpoints
- Database queries in tight loops without optimization

### ✅ WHAT'S WORKING CORRECTLY

1. **Content Negotiation**: Proper XML/JSON detection based on Accept headers
2. **Cache Headers**: Appropriate no-cache directives for live content  
3. **Error Handling**: Graceful degradation with valid XML responses
4. **Concurrent Requests**: Handles 50 concurrent requests well
5. **Android TV Detection**: Properly identifies Plex clients via User-Agent

### 🔧 REQUIRED FIXES

#### Fix 1: Implement XML Escaping (CRITICAL - Must fix before deployment)

```javascript
// Add this function to the top of ssdp.js
function escapeXML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
}

// Update all XML generation to use escaping:
// BEFORE:
title="${channel.name}"

// AFTER:
title="${escapeXML(channel.name)}"
```

#### Fix 2: Import Existing XML Escaping Utility

The project already has an `escapeXML` function in `/server/utils/plexMetadataFix.js`.
Add this import to ssdp.js:

```javascript
const { escapeXML } = require('../utils/plexMetadataFix');
```

But the function needs to be exported first from plexMetadataFix.js.

#### Fix 3: Fix Grabber Detection

```javascript
// Line 799 - Update the detection logic:
const isGrabber = userAgent.includes('Grabber') || 
                  userAgent.includes('grabber') ||
                  req.get('X-Plex-Client-Identifier')?.includes('grabber');
```

#### Fix 4: Add Input Validation

```javascript
// Validate channel data before XML generation
function validateChannelData(channel) {
  if (!channel) return false;
  if (typeof channel.name !== 'string' || channel.name.length > 500) return false;
  if (channel.description && typeof channel.description !== 'string') return false;
  return true;
}
```

### 🧪 TESTING REQUIREMENTS

Before deploying the fix:

1. **Security Tests**: Test with malicious channel names containing:
   - `<script>alert(1)</script>`
   - `Channel"onclick="alert(1)`
   - `Channel]]><!--`
   - `Channel\n<malicious/>`

2. **XML Validation**: All generated XML must pass XML parser validation

3. **Android TV Tests**: Test actual Android TV client with:
   - Channel names with special characters
   - Large channel lists (1000+ channels) 
   - Concurrent playback requests

4. **Performance Tests**: Verify memory usage with large datasets

### 🔒 SECURITY CHECKLIST

- [ ] All user input escaped before XML generation
- [ ] XML parser validation on all generated XML  
- [ ] Rate limiting on expensive endpoints
- [ ] Input length validation
- [ ] HTML entity encoding for special characters
- [ ] CDATA injection prevention
- [ ] Logging of malicious input attempts

### 📊 PRODUCTION IMPACT ASSESSMENT

**Pre-Fix Risks**:
- Android TV crashes when channels have special characters
- XML parsing failures causing 500 errors
- Potential XSS if XML viewed in browsers
- Plex client failures and error states

**Post-Fix Benefits**:
- Stable Android TV playback
- Proper handling of international channel names
- Compliant XML that passes all validators
- Better security posture

### 🚀 DEPLOYMENT PLAN

1. **IMMEDIATE**: Apply XML escaping fix to all user data
2. **URGENT**: Test with actual malicious inputs
3. **BEFORE PRODUCTION**: Run full security test suite
4. **POST-DEPLOY**: Monitor logs for XML parsing errors

---

**CONCLUSION**: The Android TV fix successfully implements content negotiation but introduces critical XML injection vulnerabilities. The core architecture is sound, but **XML escaping must be implemented before production deployment**.

**Risk Level**: 🔴 **CRITICAL** - Do not deploy without XML escaping fixes

**Timeline**: Security fixes required within 24 hours for production readiness