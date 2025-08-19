# PlexBridge Test Archive

This directory contains historical test files generated during the development and debugging process. These files have been archived to maintain a clean test directory while preserving testing history.

## Archive Contents

### Diagnostic Test Files

Test files focused on diagnosing specific issues:
- `*diagnosis*.spec.js` - Issue diagnosis and root cause analysis
- `*debug*.spec.js` - Debug sessions and troubleshooting tests

### Comprehensive Test Suites

Large-scale test files covering multiple scenarios:
- `*comprehensive*.spec.js` - Multi-feature test suites
- `*critical*.spec.js` - Critical path testing
- `*streaming*.spec.js` - Streaming functionality analysis

### Verification and Validation

Test files verifying specific fixes:
- `*verification*.spec.js` - Fix verification tests
- `*validation*.spec.js` - Feature validation tests
- `*fixes*.spec.js` - Implementation verification

## Issues Tested and Resolved

### 1. Video Player Audio-Only Issue
**Test Files**: 
- `video-player-diagnosis.spec.js`
- `critical-video-player-test.spec.js`
- `streaming-functionality-comprehensive-analysis.spec.js`

**Testing Focus**:
- HLS vs MP4 stream format comparison
- Video.js configuration validation
- Browser codec compatibility
- Transcoding parameter effectiveness

### 2. M3U Import Pagination
**Test Files**:
- `m3u-import-*.spec.js`
- `comprehensive-application-test.spec.js`

**Testing Focus**:
- Large playlist import (10,000+ channels)
- Pagination control functionality
- Memory usage during import
- UI responsiveness with large datasets

### 3. Stream Preview Functionality
**Test Files**:
- `stream-preview-*.spec.js`
- `detailed-stream-debug.spec.js`

**Testing Focus**:
- Preview URL generation
- Video player integration
- Network request analysis
- Error handling and recovery

### 4. EPG Integration
**Test Files**:
- `epg-*.spec.js`
- `epg-manager-fixes-validation.spec.js`

**Testing Focus**:
- XMLTV parsing and validation
- Timezone handling
- Program guide display
- EPG refresh mechanisms

## Test Methodology Preserved

### Playwright MCP Integration
These archived tests demonstrate comprehensive browser automation using Playwright MCP:
- **Chrome Browser Testing**: Real browser environment simulation
- **Screenshot Analysis**: Visual verification of UI states
- **Network Monitoring**: Request/response analysis
- **Console Error Tracking**: JavaScript error detection

### Testing Patterns
- **Data-testid Selectors**: Reliable element selection
- **Material-UI Component Testing**: Proper MUI component interaction
- **API Endpoint Validation**: Backend service verification
- **Error Boundary Testing**: React error handling verification

## Current Active Tests

The main `/tests/e2e/` directory contains streamlined, production-ready tests:
- `m3u-import.spec.js` - Core M3U import functionality
- `stream-preview.spec.js` - Stream preview and video player
- `channel-management.spec.js` - Channel CRUD operations
- `dashboard.spec.js` - Dashboard and metrics
- `epg-manager.spec.js` - EPG management

## Why These Tests Were Archived

### Development vs. Production Testing
- **Archived**: Exploratory, diagnostic, and debugging tests
- **Active**: Focused, maintainable, production-ready tests

### Code Quality
- **Archived**: Experimental approaches and multiple iterations
- **Active**: Best practices and clean, documented code

### Maintenance Burden
- **Archived**: Complex, overlapping test scenarios
- **Active**: Essential functionality with clear purpose

## Usage Guidelines

### When to Reference Archived Tests
1. **Debugging Similar Issues**: Review diagnostic approaches
2. **Understanding Test Coverage**: See comprehensive testing scenarios  
3. **Learning Playwright Patterns**: Study browser automation techniques
4. **Historical Context**: Understand development decision process

### Test Pattern Examples

#### Comprehensive Screenshot Analysis
```javascript
// Pattern used in archived comprehensive tests
await page.screenshot({ 
  path: `screenshots/test-${step}-${timestamp}.png`,
  fullPage: true 
});
```

#### Network Request Monitoring
```javascript
// Pattern from diagnostic tests
page.on('request', req => {
  if (req.url().includes('/streams/preview/')) {
    console.log(`Stream request: ${req.url()}`);
  }
});
```

#### Error Boundary Testing
```javascript
// Pattern from critical path tests
const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') {
    errors.push(msg.text());
  }
});
```

## Migration Notes

### Code Improvements Made
1. **Simplified Test Logic**: Removed redundant test cases
2. **Better Selectors**: Standardized on data-testid attributes
3. **Cleaner Assertions**: More specific and reliable expectations
4. **Focused Scope**: Each test file has a clear, single purpose

### Lessons Learned
1. **Screenshot Verification**: Essential for UI testing
2. **Network Analysis**: Critical for API integration testing
3. **Error Monitoring**: Prevents regressions in error handling
4. **Performance Testing**: Important for large dataset operations

## Archive Maintenance

These files are preserved for historical reference and should not be modified. For new test development:
1. Use the current active test files as templates
2. Follow the patterns documented in `/tests/README.md`
3. Maintain the clean, focused approach of the active test suite
4. Archive any experimental or diagnostic tests following this model