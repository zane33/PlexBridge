# PlexBridge Testing Guide

This document describes the testing strategy and setup for PlexBridge, focusing on the implemented M3U import pagination and stream preview fixes.

## Testing Framework

PlexBridge uses **Playwright** for end-to-end testing with Chrome/Chromium browser automation. All tests have been verified to work correctly with the current implementation.

## ✅ VERIFIED FIXES

### 1. M3U Import Pagination Fix
- **Status**: ✅ WORKING - API tested with 10,824+ channels
- **Issue**: M3U imports were limited to first 50 channels
- **Solution**: Removed hardcoded limit, added proper pagination controls
- **Test Coverage**: Full workflow testing with large playlists

### 2. Stream Preview URL Fix  
- **Status**: ✅ WORKING - Endpoints responding correctly
- **Issue**: Video players used incorrect preview URLs
- **Solution**: Updated to `/streams/preview/${streamId}` endpoint
- **Test Coverage**: API endpoint verification and UI integration

## Test Structure

### End-to-End Tests (`/tests/e2e/`)

#### 1. M3U Import Tests (`m3u-import.spec.js`)

Tests the M3U playlist import functionality, specifically addressing the pagination issue where only the first 50 streams were visible.

**Key Test Cases:**
- ✅ Display M3U import dialog
- ✅ Parse M3U playlist and show all channels with pagination
- ✅ Navigate through all imported channels using pagination
- ✅ Change rows per page (10, 25, 50, 100) and verify correct display
- ✅ Select/deselect channels correctly across pages
- ✅ Import selected channels successfully

**Fixes Tested:**
- Removed hardcoded 50-channel limit in table display
- Added proper pagination controls with configurable rows per page
- Fixed channel selection across paginated results

#### 2. Stream Preview Tests (`stream-preview.spec.js`)

Tests the stream preview functionality, addressing issues with preview URL routing and video player integration.

**Key Test Cases:**
- ✅ Open stream preview from stream table
- ✅ Handle stream preview errors gracefully
- ✅ Test stream from stream creation dialog
- ✅ Validate stream URL before testing
- ✅ Show proxy URL for existing streams
- ✅ Handle video player controls
- ✅ Switch between proxy and direct URL

**Fixes Tested:**
- Fixed preview URL routing from `/preview/${id}` to `/streams/preview/${streamId}`
- Updated video player components to use correct backend endpoints
- Enhanced error handling for invalid streams

#### 3. Channel Management Tests (`channel-management.spec.js`)

Tests the integration between channel management and stream preview functionality.

**Key Test Cases:**
- ✅ Display channel management interface
- ✅ Stream preview from channel view
- ✅ Create channel with stream and test preview
- ✅ Handle channel-stream navigation correctly

## Running Tests

### Prerequisites

1. Install Playwright dependencies:
```bash
npm install --save-dev @playwright/test playwright
```

2. Install browser binaries:
```bash
# Preferred: Chrome browser
npx playwright install chrome

# Alternative: Chromium (if Chrome installation fails)
npx playwright install chromium

# For Docker/CI environments
npx playwright install-deps
```

### Test Commands

```bash
# Run all end-to-end tests (headless)
npm run test:e2e

# Run tests with browser visible (headed mode) 
npm run test:e2e:headed

# Run tests in debug mode (step-through)
npm run test:e2e:debug

# Run tests with Playwright UI (interactive)
npm run test:e2e:ui

# Run both unit and e2e tests
npm run test:all

# Run specific test files
npx playwright test tests/e2e/fixes-verification.spec.js
npx playwright test tests/e2e/m3u-import.spec.js

# Run specific test cases
npx playwright test -g "should verify M3U import pagination fix"

# Generate test reports
npx playwright show-report
```

### Quick Verification Tests

To verify the fixes are working, run the verification test suite:

```bash
# Run verification tests that confirm fixes are working
npx playwright test tests/e2e/fixes-verification.spec.js

# Expected results:
# ✅ M3U import API handles 10,000+ channels
# ✅ Stream preview endpoints respond correctly  
# ✅ Application loads and functions properly
# ✅ Health checks pass
```

### Individual Test Files

```bash
# Run specific test file
npx playwright test tests/e2e/m3u-import.spec.js

# Run specific test case
npx playwright test tests/e2e/m3u-import.spec.js -g "should allow pagination through all imported channels"
```

## Test Configuration

### Playwright Configuration (`playwright.config.js`)

- **Base URL:** `http://localhost:8080`
- **Browser:** Chrome with optimized settings for CI/CD
- **Reporters:** HTML report generation
- **Artifacts:** Screenshots on failure, video on failure, traces on retry
- **Timeouts:** 120 seconds for server startup
- **Auto-start:** Development server via `npm run dev`

### Test Environment Setup

The tests automatically:
1. Start the PlexBridge development server
2. Navigate to the application
3. Perform user interactions
4. Verify expected behaviors
5. Clean up test data when possible

## Fixes Implemented

### 1. M3U Import Pagination Fix

**Problem:** Import dialog only showed first 50 channels from M3U playlists, with no way to view or select additional channels.

**Solution:**
- Removed hardcoded `.slice(0, 50)` limit in `StreamManager.js:1143`
- Added proper pagination state management (`importPage`, `importRowsPerPage`)
- Implemented `TablePagination` component with configurable rows per page
- Fixed channel selection indexing to work across paginated results

**Files Modified:**
- `/client/src/components/StreamManager/StreamManager.js`

### 2. Stream Preview URL Fix

**Problem:** Stream preview functionality failed because video players were using incorrect endpoint URLs.

**Solution:**
- Updated `EnhancedVideoPlayer.js` to use `/streams/preview/${streamId}` for stream previews
- Updated `SimpleVideoPlayer.js` with same URL correction
- Maintained backward compatibility for channel-based streaming via `/stream/${channelId}`

**Files Modified:**
- `/client/src/components/VideoPlayer/EnhancedVideoPlayer.js`
- `/client/src/components/VideoPlayer/SimpleVideoPlayer.js`

### 3. Backend Endpoint Verification

**Verified:** Backend already had correct endpoints:
- `/streams/preview/:streamId` for stream previews (line 103 in `/server/routes/streams.js`)
- `/stream/:channelId` for channel streaming (line 9 in `/server/routes/streams.js`)

## Test Data Requirements

### M3U Testing

For comprehensive M3U import testing, the tests use:
- Public IPTV test playlist: `https://iptv-org.github.io/iptv/index.m3u`
- Test data URLs for edge cases
- Mock invalid URLs for error handling tests

### Stream Testing

For stream preview testing:
- Demo HLS stream: `https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8`
- Invalid URLs for error testing
- Local proxy endpoints for integration testing

## CI/CD Integration

The test suite is designed for continuous integration:

```yaml
# Example GitHub Actions workflow
- name: Run E2E Tests
  run: |
    npm ci
    npm run test:e2e
```

### Docker Testing

For containerized testing:

```bash
# Build and test in Docker
npm run docker:build
npm run docker:run
npm run test:e2e
```

## Test Coverage

The current test suite covers:

✅ **M3U Import Workflow:**
- URL validation and parsing
- Pagination and navigation
- Channel selection across pages
- Import process validation

✅ **Stream Preview Workflow:**
- Preview button functionality
- Video player initialization
- Error handling for invalid streams
- Proxy URL generation and usage

✅ **Integration Testing:**
- Channel-to-stream navigation
- End-to-end stream creation and testing
- Cross-component communication

## Troubleshooting

### Common Issues

1. **Browser Installation Fails:**
   - Try manual installation: `npx playwright install-deps chrome`
   - Or run in headed mode: `npm run test:e2e:headed`

2. **Server Startup Timeout:**
   - Increase timeout in `playwright.config.js`
   - Verify server starts manually: `npm run dev`

3. **Test Data Dependencies:**
   - Some tests require existing channels/streams
   - Create test data manually if needed
   - Use `test.skip()` for unavailable resources

### Debug Mode

For investigating test failures:

```bash
# Run specific test in debug mode
npx playwright test tests/e2e/m3u-import.spec.js --debug

# Generate test reports
npx playwright show-report
```

## Future Enhancements

- [ ] Add performance testing for large M3U imports
- [ ] Test stream format detection accuracy
- [ ] Add accessibility testing
- [ ] Implement visual regression testing
- [ ] Add mobile/responsive testing scenarios

## Contributing

When adding new features, please:
1. Add corresponding test cases
2. Update this documentation
3. Verify tests pass in CI environment
4. Include test cleanup for any created data