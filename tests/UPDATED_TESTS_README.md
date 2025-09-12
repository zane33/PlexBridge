# PlexBridge - Updated Playwright Test Suite

This document describes the comprehensive Playwright test suite updates for the PlexBridge application.

## Updated Test Files

### 1. M3U Import Comprehensive Tests
**File:** `tests/e2e/m3u-import-comprehensive.spec.js`

**Features Tested:**
- M3U import dialog display and validation
- URL input validation before parsing
- Large playlist parsing with real IPTV-org playlist
- Material-UI pagination controls with proper selectors
- Channel selection with checkbox interactions
- Search and filtering functionality
- Import process validation
- Large playlist performance optimizations
- Error handling for invalid URLs
- Mobile viewport responsiveness
- Dialog state preservation

**Key Improvements:**
- Uses proper `data-testid` selectors throughout
- Tests Material-UI pagination with `.MuiTablePagination-*` selectors
- Handles large datasets (120+ second timeout for IPTV-org playlist)
- Comprehensive error handling scenarios
- Mobile-responsive testing

### 2. Stream Preview Comprehensive Tests
**File:** `tests/e2e/stream-preview-comprehensive.spec.js`

**Features Tested:**
- Stream preview from existing streams table
- Stream testing from creation dialog
- URL validation before enabling test button
- Error handling for invalid stream URLs
- Proxy URL display for existing streams
- Video player controls and interactions
- Mobile viewport functionality
- Different stream types (HLS, DASH)
- Accessibility features
- Keyboard navigation
- Network interruption handling

**Key Improvements:**
- Comprehensive video player testing
- Error scenario coverage
- Mobile-specific FAB testing
- Accessibility compliance checks
- Network resilience testing

### 3. Database Error Handling Tests
**File:** `tests/e2e/database-error-handling.spec.js`

**Features Tested:**
- Database errors on application startup
- Database errors when fetching streams/channels
- Database errors during stream/channel creation
- Database errors during M3U import
- Different types of database errors (timeout, permission, corruption)
- Database reconnection scenarios
- Health check endpoint failures
- Retry mechanisms
- Mobile error handling
- Application stability under database stress

**Key Improvements:**
- Comprehensive error simulation using route interception
- Multiple error scenario coverage
- Recovery testing
- Mobile error handling
- Stability testing

### 4. Material-UI Components Comprehensive Tests
**File:** `tests/e2e/material-ui-comprehensive.spec.js`

**Features Tested:**
- Dialog components and backdrop behavior
- Pagination controls and navigation
- Form controls (TextField, Select, Switch, Checkbox)
- Snackbar notifications
- Accordion components
- Table components with hover states
- Responsive design across viewports
- Theme consistency
- Focus management and accessibility
- Loading states

**Key Improvements:**
- Proper Material-UI selector usage (`.MuiComponent-*`)
- Comprehensive interaction testing
- Responsive design validation
- Accessibility compliance
- Theme and styling verification

### 5. Comprehensive PlexBridge Test Suite
**File:** `tests/e2e/comprehensive-plexbridge-test-suite.spec.js`

**Features Tested:**
- Application startup and navigation health
- API endpoints health check (11+ endpoints)
- Stream management workflow
- M3U import workflow
- Channel management workflow
- Mobile responsiveness
- Error handling and resilience
- Performance and load testing
- Accessibility compliance
- Final comprehensive status report

**Key Improvements:**
- End-to-end workflow testing
- Comprehensive API validation
- Performance benchmarking
- Screenshot capture throughout testing
- Detailed error tracking and reporting
- Mobile-first testing approach

## Test Data IDs Used

All tests follow the project's data-testid convention:

### Navigation
- `[data-testid="nav-dashboard"]`
- `[data-testid="nav-streams"]`
- `[data-testid="nav-channels"]`
- `[data-testid="nav-epg"]`
- `[data-testid="nav-logs"]`
- `[data-testid="nav-settings"]`
- `[data-testid="mobile-menu-button"]`

### Stream Manager
- `[data-testid="add-stream-button"]`
- `[data-testid="add-stream-fab"]` (mobile)
- `[data-testid="import-m3u-button"]`
- `[data-testid="stream-dialog"]`
- `[data-testid="import-dialog"]`
- `[data-testid="stream-name-input"]`
- `[data-testid="stream-url-input"]`
- `[data-testid="import-url-input"]`
- `[data-testid="test-stream-button"]`
- `[data-testid="preview-stream-button"]`
- `[data-testid="edit-stream-button"]`
- `[data-testid="delete-stream-button"]`
- `[data-testid="parse-channels-button"]`
- `[data-testid="import-selected-button"]`
- `[data-testid="save-stream-button"]`
- `[data-testid="cancel-stream-button"]`
- `[data-testid="cancel-import-button"]`

### Channel Manager
- `[data-testid="add-channel-button"]`
- `[data-testid="add-channel-fab"]` (mobile)
- `[data-testid="channel-name-input"]`
- `[data-testid="channel-number-input"]`
- `[data-testid="edit-channel-button"]`
- `[data-testid="delete-channel-button"]`
- `[data-testid="save-channel-button"]`
- `[data-testid="cancel-channel-button"]`

### Search and Filtering
- `[data-testid="channel-search-input"]`
- `[data-testid="group-filter-select"]`

## Material-UI Selectors

Tests use proper Material-UI component selectors:

### Pagination
- `.MuiTablePagination-root`
- `.MuiTablePagination-select`
- `.MuiTablePagination-actions button[aria-label="Go to next page"]`
- `.MuiTablePagination-actions button[aria-label="Go to previous page"]`

### Dialogs
- `.MuiDialog-paper`
- `.MuiDialogTitle-root`
- `.MuiDialogContent-root`
- `.MuiDialogActions-root`
- `.MuiBackdrop-root`

### Form Controls
- `.MuiTextField-root`
- `.MuiSelect-root`
- `.MuiSwitch-root`
- `.MuiCheckbox-root`
- `.MuiAccordion-root`
- `.MuiAccordionSummary-root`
- `.MuiAccordionDetails-root`

### Notifications
- `.MuiSnackbar-root`
- `.MuiAlert-standardError`
- `[role="alert"]`

### Tables
- `.MuiTable-root`
- `.MuiTableHead-root`
- `.MuiTableBody-root`
- `.MuiTableRow-root`
- `.MuiTableCell-root`

## Test Guidelines Followed

### 1. Reliable Selectors
- **Primary:** `data-testid` attributes for application-specific elements
- **Secondary:** Material-UI component selectors for framework components
- **Fallback:** ARIA labels and semantic selectors
- **Avoided:** Text-based and CSS class selectors that may change

### 2. Error Handling
- Comprehensive error scenario coverage
- Graceful fallbacks for missing elements
- Network error simulation
- Database error simulation
- Recovery testing

### 3. Performance Considerations
- Extended timeouts for large datasets (120+ seconds for IPTV playlists)
- Performance benchmarking
- Load time validation
- Navigation speed testing

### 4. Mobile-First Approach
- Mobile viewport testing (375x667)
- Tablet viewport testing (768x1024)
- Desktop viewport testing (1200x800)
- Touch interaction testing
- FAB (Floating Action Button) testing

### 5. Accessibility
- Keyboard navigation testing
- Screen reader compatibility
- ARIA label verification
- Focus management
- Color contrast (basic validation)

## Running the Tests

### Individual Test Files
```bash
# M3U Import Tests
npx playwright test tests/e2e/m3u-import-comprehensive.spec.js

# Stream Preview Tests
npx playwright test tests/e2e/stream-preview-comprehensive.spec.js

# Database Error Handling Tests
npx playwright test tests/e2e/database-error-handling.spec.js

# Material-UI Component Tests
npx playwright test tests/e2e/material-ui-comprehensive.spec.js

# Comprehensive Test Suite
npx playwright test tests/e2e/comprehensive-plexbridge-test-suite.spec.js
```

### All Updated Tests
```bash
npx playwright test tests/e2e/*comprehensive*.spec.js tests/e2e/database-error-handling.spec.js
```

### Debug Mode
```bash
npx playwright test --debug tests/e2e/comprehensive-plexbridge-test-suite.spec.js
```

### Headed Mode (Visible Browser)
```bash
npx playwright test --headed tests/e2e/m3u-import-comprehensive.spec.js
```

## Test Reports and Artifacts

Tests generate comprehensive artifacts:

### Screenshots
- Automatic screenshots on test failures
- Progress screenshots during long operations
- Mobile viewport screenshots
- Error state screenshots

### Logs
- Console error tracking
- Network failure monitoring
- Performance metrics
- Test execution summaries

### Reports
- HTML reports via `npx playwright show-report`
- Console output with detailed test progress
- Error summaries and debugging information

## Key Testing Improvements

### 1. Selector Reliability
- **Before:** Text-based selectors prone to changes
- **After:** Consistent `data-testid` usage throughout

### 2. Material-UI Integration
- **Before:** Generic CSS selectors for UI components
- **After:** Proper Material-UI component selectors

### 3. Error Coverage
- **Before:** Limited error scenario testing
- **After:** Comprehensive error simulation and recovery testing

### 4. Performance Testing
- **Before:** No performance validation
- **After:** Load time benchmarking and performance thresholds

### 5. Mobile Testing
- **Before:** Desktop-only testing
- **After:** Mobile-first responsive design testing

### 6. Real-World Scenarios
- **Before:** Simple test data
- **After:** Real IPTV playlists with thousands of channels

### 7. Comprehensive Coverage
- **Before:** Isolated component testing
- **After:** End-to-end workflow validation

## Compliance with Project Standards

These tests fully comply with the PlexBridge testing requirements:

✅ **Mandatory Chrome browser automation with Playwright MCP**
✅ **Detailed screenshot analysis throughout testing**
✅ **Comprehensive page and UI state coverage**
✅ **JavaScript error detection and reporting**
✅ **Network failure monitoring**
✅ **Responsive design testing (Desktop and Mobile)**
✅ **Interactive element validation**
✅ **Error boundary and console error checking**
✅ **All required API endpoint testing**
✅ **Status reporting with detailed analysis**

The test suite ensures consistent application quality and provides comprehensive validation of all PlexBridge functionality.
