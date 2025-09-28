# EPG Production Testing Guide

## Overview

This guide provides comprehensive Playwright tests for verifying EPG functionality on the production PlexBridge system at **192.168.3.148:3000**.

## Test Coverage

### 1. EPG Management Interface (`epg-production-comprehensive.spec.js`)
- **EPG Interface Navigation**: Tests navigation to EPG section and interface loading
- **EPG Source Management**: Verifies EPG source listing and management functionality
- **Manual Refresh Testing**: Tests EPG refresh functionality with error capture
- **Channel Association**: Tests channel association dropdowns and FreeviewNEW channels
- **Data Display Verification**: Validates EPG program data display
- **Error Handling**: Comprehensive error scenario testing
- **Responsive Design**: Mobile and desktop interface testing

### 2. FreeviewNEW Specific Testing (`epg-freeviewnew-specific.spec.js`)
- **FreeviewNEW Source Status**: Specific testing of FreeviewNEW source configuration
- **Manual Refresh with Error Capture**: Detailed refresh testing with network monitoring
- **Channel Mapping Verification**: Tests FreeviewNEW channel association functionality
- **Program Data Validation**: Validates FreeviewNEW program data quality
- **API Endpoint Testing**: Tests EPG APIs with FreeviewNEW specific parameters

## Quick Start

### Run All EPG Tests
```bash
# Navigate to tests directory
cd /mnt/c/Users/ZaneT/SFF/PlexBridge/tests

# Run comprehensive EPG test suite
node run-production-epg-tests.js
```

### Run Individual Test Files
```bash
# Run comprehensive EPG tests
TEST_ENV=production npx playwright test e2e/epg-production-comprehensive.spec.js --project=chromium

# Run FreeviewNEW specific tests
TEST_ENV=production npx playwright test e2e/epg-freeviewnew-specific.spec.js --project=chromium
```

### Run with Visual Debug
```bash
# Run with browser visible (headed mode)
TEST_ENV=production npx playwright test e2e/epg-production-comprehensive.spec.js --project=chromium --headed

# Run with Playwright UI for interactive debugging
TEST_ENV=production npx playwright test --ui
```

## Test Configuration

### Environment Variables
- `TEST_ENV=production` - Targets production environment (192.168.3.148:3000)
- `BASE_URL=http://192.168.3.148:3000` - Override base URL if needed

### Browser Configuration
Tests are configured to run with Chrome browser with production-optimized settings:
- Extended timeouts for network operations
- Comprehensive screenshot capture
- Network request monitoring
- Console error tracking

## Generated Artifacts

### Screenshots
All tests generate comprehensive screenshots stored in `/tests/screenshots/`:

#### EPG Production Tests
- `epg-prod-01-homepage.png` - Initial homepage state
- `epg-prod-02-interface-initial.png` - EPG interface before interactions
- `epg-prod-03-freeviewnew-highlighted.png` - FreeviewNEW source highlighted
- `epg-prod-04-before-refresh.png` - Interface before refresh operation
- `epg-prod-05-after-refresh.png` - Interface after refresh operation
- `epg-prod-06-refresh-analysis.png` - Detailed refresh analysis overlay
- `epg-prod-08-channel-association.png` - Channel association interface
- `epg-prod-09-association-dropdown.png` - Association dropdown open state
- `epg-prod-12-data-display.png` - EPG data display verification
- `epg-prod-13-mobile-display.png` - Mobile responsive display
- `epg-prod-15-error-analysis.png` - Error handling analysis

#### FreeviewNEW Specific Tests
- `freeview-01-epg-initial.png` - Initial EPG state
- `freeview-02-source-highlighted.png` - FreeviewNEW source highlighted
- `freeview-03-before-refresh.png` - Before FreeviewNEW refresh
- `freeview-04-after-refresh.png` - After FreeviewNEW refresh
- `freeview-05-refresh-analysis.png` - Detailed refresh analysis
- `freeview-08-mapping-interface.png` - Channel mapping interface
- `freeview-09-channel-selected.png` - FreeviewNEW channel selected
- `freeview-12-data-validation.png` - Program data validation results

### Test Reports
- HTML reports generated in `/tests/playwright-report/`
- Console output with detailed analysis
- Network request/response monitoring
- API endpoint status verification

## Key Test Features

### Comprehensive Error Monitoring
- **Console Error Tracking**: Captures all JavaScript console errors
- **Network Failure Detection**: Monitors failed network requests
- **API Response Validation**: Verifies API endpoints return proper JSON (not HTML error pages)
- **Error Message Display**: Tests error boundary functionality

### FreeviewNEW Focus Areas
- **Source Status Verification**: Confirms FreeviewNEW source is present and configured
- **Refresh Functionality**: Tests manual refresh with detailed error capture
- **Channel Association**: Verifies FreeviewNEW channels appear in association dropdowns
- **Program Data Quality**: Validates program data completeness and accuracy

### Visual Verification
- **Screenshot Analysis**: Comprehensive visual documentation of interface states
- **Responsive Testing**: Mobile and desktop interface verification
- **Interactive Element Testing**: Button functionality and dropdown operations
- **Loading State Verification**: Tests loading indicators and progress feedback

## Troubleshooting

### Common Issues

#### Test Connection Failures
```bash
# Verify production system is accessible
curl -I http://192.168.3.148:3000

# Test specific EPG endpoints
curl http://192.168.3.148:3000/api/epg/sources
curl http://192.168.3.148:3000/api/epg/programs
```

#### Browser Installation Issues
```bash
# Install Playwright browsers
npx playwright install chrome

# Install system dependencies (if needed)
npx playwright install-deps
```

#### Permission Issues
```bash
# Ensure screenshots directory is writable
chmod 755 /mnt/c/Users/ZaneT/SFF/PlexBridge/tests/screenshots

# Check test file permissions
ls -la /mnt/c/Users/ZaneT/SFF/PlexBridge/tests/e2e/epg-*.spec.js
```

### Debug Mode
```bash
# Run with debug output
DEBUG=pw:api TEST_ENV=production npx playwright test e2e/epg-production-comprehensive.spec.js

# Run with trace recording
TEST_ENV=production npx playwright test e2e/epg-production-comprehensive.spec.js --trace=on
```

## Expected Test Results

### Healthy EPG System
- ✅ All navigation elements functional
- ✅ FreeviewNEW source visible and configured
- ✅ Manual refresh completes without errors
- ✅ Channel association dropdowns populated with FreeviewNEW channels
- ✅ Program data displays correctly
- ✅ No JavaScript console errors
- ✅ All API endpoints return proper JSON responses

### Common Issues to Watch For
- ❌ FreeviewNEW source missing from interface
- ❌ Refresh operations fail with network errors
- ❌ Channel association dropdowns empty
- ❌ API endpoints returning HTML error pages instead of JSON
- ❌ JavaScript console errors during EPG operations
- ❌ Loading indicators stuck or missing

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: EPG Production Tests
on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM
  workflow_dispatch:

jobs:
  epg-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install chrome
      - run: TEST_ENV=production node tests/run-production-epg-tests.js
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: epg-test-results
          path: |
            tests/screenshots/epg-prod-*.png
            tests/screenshots/freeview-*.png
            tests/playwright-report/
```

## Maintenance

### Regular Testing Schedule
- **Daily**: Automated EPG functionality verification
- **Weekly**: Manual review of test screenshots
- **Monthly**: Test suite updates and maintenance

### Test Data Management
- Screenshots are automatically timestamped
- Old screenshots should be archived monthly
- Test reports should be reviewed for trends

### Performance Monitoring
- Monitor test execution times
- Track screenshot file sizes
- Review network request performance during tests

---

**Created**: 2025-09-29
**Target Environment**: PlexBridge Production (192.168.3.148:3000)
**Framework**: Playwright with Chrome browser
**Focus**: FreeviewNEW EPG source functionality verification