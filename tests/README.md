# PlexBridge Testing Guide

## Overview

PlexBridge uses **Playwright** for end-to-end testing with Chrome browser automation. All tests verify core functionality including stream preview, M3U import, and video player integration.

## Current Test Status

### ✅ Core Functionality Tests

| Test Suite | Status | Coverage |
|------------|--------|----------|
| **M3U Import** | ✅ Working | Full playlist import with pagination |
| **Stream Preview** | ✅ Working | Video player with transcoded streams |
| **Channel Management** | ✅ Working | CRUD operations and bulk updates |
| **EPG Integration** | ✅ Working | XMLTV import and program guide |
| **Dashboard** | ✅ Working | System metrics and configuration |

### 🔧 Recent Fixes Implemented

1. **Video Player Audio-Only Issue**: Fixed by enabling transcoding for all browser previews
2. **M3U Import Pagination**: Removed 50-channel limit, added proper pagination controls
3. **Stream Preview URLs**: Updated to use `/streams/preview/{streamId}?transcode=true`
4. **Flash Tech Errors**: Removed Flash dependencies from Video.js configuration

## Test Structure

### Active Test Files

- `m3u-import.spec.js` - M3U playlist import functionality
- `stream-preview.spec.js` - Stream preview and video player testing
- `channel-management.spec.js` - Channel CRUD operations
- `dashboard.spec.js` - Dashboard functionality and metrics
- `epg-manager.spec.js` - Electronic Program Guide management

### Archived Test Files

Temporary diagnostic and debug test files have been moved to `/tests/archive/` to maintain a clean test directory structure.

## Running Tests

### Prerequisites

```bash
# Install Playwright dependencies
npm install --save-dev @playwright/test playwright

# Install browser binaries
npx playwright install chrome
```

### Test Commands

```bash
# Run all tests
npm run test:e2e

# Run tests with visible browser
npm run test:e2e:headed

# Run specific test file
npx playwright test tests/e2e/stream-preview.spec.js

# View test report
npx playwright show-report
```

### Test Configuration

Tests are configured in `playwright.config.js`:
- **Base URL**: `http://localhost:8080`
- **Browser**: Chrome/Chromium
- **Screenshots**: Captured on failure
- **Video Recording**: Enabled for failures
- **Timeout**: 30 seconds per test

## Key Test Scenarios

### 1. Stream Preview Testing

```javascript
// Tests video player functionality with transcoded streams
test('Stream preview with transcoding', async ({ page }) => {
  await page.goto('/streams');
  await page.click('[data-testid="preview-stream-button"]');
  
  // Verify transcoded URL is used
  const videoUrl = await page.getAttribute('video', 'src');
  expect(videoUrl).toContain('?transcode=true');
});
```

### 2. M3U Import Testing

```javascript
// Tests large playlist import with pagination
test('M3U import with pagination', async ({ page }) => {
  await page.goto('/streams');
  await page.click('[data-testid="import-m3u-button"]');
  await page.fill('[data-testid="import-url-input"]', 'test-playlist.m3u');
  
  // Verify pagination controls work
  await page.click('.MuiTablePagination-actions button[aria-label="Go to next page"]');
});
```

### 3. Video Player Testing

```javascript
// Tests video player configuration and playback
test('Video player without Flash errors', async ({ page }) => {
  await page.goto('/streams');
  
  // Monitor console for Flash tech errors (should be none)
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('flash')) {
      errors.push(msg.text());
    }
  });
  
  await page.click('[data-testid="preview-stream-button"]');
  expect(errors).toHaveLength(0);
});
```

## Screenshots and Documentation

Test screenshots are automatically captured and stored in `/tests/screenshots/` for visual verification and debugging purposes.

## Troubleshooting

### Common Issues

1. **Tests timing out**: Increase timeout in playwright.config.js
2. **Browser not launching**: Run `npx playwright install chrome`
3. **Network errors**: Ensure PlexBridge server is running on port 8080
4. **Screenshot failures**: Check disk space and permissions

### Debug Mode

```bash
# Run tests in debug mode with step-through
npx playwright test --debug

# Run with verbose output
npx playwright test --reporter=list

# Run specific test with debug info
npx playwright test stream-preview.spec.js --headed --debug
```

## Contributing

When adding new tests:

1. Use `data-testid` attributes for reliable element selection
2. Follow the existing naming conventions
3. Include proper error handling and timeouts
4. Add screenshots for visual verification
5. Update this README with new test coverage

## Archive

Historical test files and diagnostic reports are maintained in:
- `/tests/archive/` - Archived test files
- `/docs/archive/` - Historical documentation and reports

These archives preserve the development history while keeping the active codebase clean and focused.