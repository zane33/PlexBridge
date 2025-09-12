# Channel Manager Drag & Drop and Sorting Tests

## Overview

This document describes the comprehensive Playwright test suite for the Channel Manager's drag-and-drop reordering and column sorting functionality. The tests are located in `/tests/e2e/channel-manager-drag-sort.spec.js` and follow the PlexBridge project's testing standards.

## Test Coverage

### 1. Drag and Drop Functionality

#### ✅ Visual Feedback Tests
- **Hover State**: Verifies drag handles appear on row hover with proper cursor styling
- **During Drag**: Tests opacity changes and visual feedback during drag operations
- **Immediate Response**: Ensures UI provides instant feedback when drag starts

#### ✅ Reordering Logic Tests
- **Successful Reorder**: Validates channels can be dragged to new positions
- **Number Reassignment**: Verifies channel numbers are automatically updated based on new order
- **Optimistic Updates**: Tests that UI updates immediately before backend confirmation
- **Backend Integration**: Ensures proper API calls to `/api/channels/bulk-update`

#### ✅ Error Handling Tests
- **API Failure**: Simulates backend errors and verifies graceful degradation
- **State Reversion**: Ensures UI reverts to original state on failed operations
- **Error Notifications**: Validates proper error messages are displayed

### 2. Column Sorting Functionality

#### ✅ Sort by Number
- **Ascending Order**: Tests numeric sorting (1, 2, 3...)
- **Descending Order**: Tests reverse numeric sorting (3, 2, 1...)
- **Sort Indicators**: Verifies proper arrow indicators in column headers

#### ✅ Sort by Name
- **Alphabetical Ascending**: Tests A-Z sorting (case-insensitive)
- **Alphabetical Descending**: Tests Z-A sorting
- **Unicode Support**: Handles special characters and international names

#### ✅ Sort by Stream Count
- **Numeric Ascending**: Tests 0, 1, 2+ stream counts
- **Numeric Descending**: Tests reverse stream count sorting
- **Zero Handling**: Properly sorts channels with no streams

#### ✅ Sort by Status
- **Boolean Sorting**: Tests Active/Inactive status sorting
- **State Consistency**: Ensures enabled/disabled channels sort correctly

#### ✅ Sort State Management
- **Column Switching**: Verifies only one column can be active at a time
- **State Persistence**: Tests sort state during other operations
- **Reset Behavior**: Validates sorting resets when switching columns

### 3. Integration with Existing Features

#### ✅ CRUD Operations Integration
- **Create Channel**: Tests sorting is maintained after adding new channels
- **Edit Channel**: Verifies position updates after channel modifications
- **Delete Channel**: Ensures sorting works after channel removal
- **Sort Preservation**: Validates sort state persists through CRUD operations

#### ✅ Pagination Integration
- **Sorted Pagination**: Tests sorting works across multiple pages
- **Page Navigation**: Verifies sort order is maintained when changing pages
- **Rows Per Page**: Tests sorting with different page sizes (5, 10, 25, 50)

#### ✅ Bulk Selection Integration
- **Selection Persistence**: Tests checkboxes remain selected during sorting
- **Cross-Page Selection**: Verifies selection works with sorted, paginated data
- **Bulk Actions**: Ensures bulk operations work with sorted channels

### 4. Responsive Design & Mobile Support

#### ✅ Mobile Viewport Tests
- **Touch Drag**: Tests drag-and-drop with touch events
- **Mobile FAB**: Verifies mobile floating action button appears correctly
- **Touch Targets**: Ensures drag handles meet minimum touch size requirements (44px)
- **Responsive Layout**: Tests table adapts to mobile screen sizes

#### ✅ Touch Interface Optimization
- **Touch Action**: Verifies `touch-action: none` for proper drag handling
- **Gesture Recognition**: Tests touch gestures don't interfere with browser navigation
- **Scrolling**: Ensures table scrolling works during touch interactions

### 5. API Integration & Backend Communication

#### ✅ Bulk Update API Tests
- **Request Format**: Validates proper JSON structure sent to backend
- **Data Integrity**: Ensures all channel IDs and numbers are included
- **HTTP Methods**: Tests PUT requests to `/api/channels/bulk-update`
- **Response Handling**: Verifies success/error response processing

#### ✅ Error Scenarios
- **Network Failures**: Tests behavior when API is unreachable
- **Server Errors**: Handles 500-level HTTP errors gracefully
- **Timeout Handling**: Tests behavior with slow API responses
- **Data Consistency**: Ensures UI reverts on backend failures

### 6. Performance & User Experience

#### ✅ Performance Tests
- **Large Datasets**: Tests with 20+ channels for performance validation
- **Scroll Performance**: Ensures dragging doesn't interfere with table scrolling
- **Memory Usage**: Validates no memory leaks during repeated operations
- **Animation Smoothness**: Tests CSS transitions and animations

#### ✅ UX Validation
- **Loading States**: Tests visual feedback during backend operations
- **Success Notifications**: Verifies snackbar messages appear correctly
- **Accessibility**: Ensures keyboard navigation and screen reader support
- **Visual Consistency**: Validates Material-UI theme compliance

## Test Data Management

### Helper Functions

The test suite includes comprehensive helper functions for:

- **`ensureTestChannels()`**: Creates minimum test data if none exists
- **`ensureMultipleChannels()`**: Creates specified number of channels for pagination tests
- **`getChannelOrder()`**: Extracts current channel order from DOM
- **`getChannelNumbers()`**: Gets channel numbers for sorting validation
- **`getChannelNames()`**: Extracts channel names for alphabetical sorting
- **`getStreamCounts()`**: Gets stream count data for numeric sorting
- **`getChannelStatuses()`**: Extracts status information for boolean sorting

### Test Data Isolation

Each test ensures:
- **Clean State**: Fresh browser context for each test
- **Data Independence**: Tests don't depend on specific existing data
- **Cleanup**: Test data is contained and doesn't persist between runs

## Data Test IDs Used

The tests use the following data-testid selectors as specified in the requirements:

### Navigation & Actions
- `[data-testid="nav-channels"]` - Navigate to Channel Manager
- `[data-testid="add-channel-button"]` - Desktop add channel button
- `[data-testid="add-channel-fab"]` - Mobile floating action button

### Drag & Drop Elements
- `[data-testid="drag-handle-${channel.id}"]` - Individual drag handles
- `[data-testid="channel-row-${channel.id}"]` - Channel table rows

### Sort Headers
- `[data-testid="sort-by-number"]` - Number column sort
- `[data-testid="sort-by-name"]` - Name column sort
- `[data-testid="sort-by-streams"]` - Streams column sort
- `[data-testid="sort-by-status"]` - Status column sort

### Data Display Elements
- `[data-testid="channel-number-${channel.id}"]` - Channel number display
- `[data-testid="channel-name-${channel.id}"]` - Channel name display
- `[data-testid="stream-count-${channel.id}"]` - Stream count chip
- `[data-testid="channel-status-${channel.id}"]` - Status chip

### Form Elements
- `[data-testid="channel-name-input"]` - Channel name input
- `[data-testid="channel-number-input"]` - Channel number input
- `[data-testid="save-channel-button"]` - Save button
- `[data-testid="cancel-channel-button"]` - Cancel button

### Selection Elements
- `[data-testid="select-channel-${channel.id}"]` - Individual checkboxes
- `[data-testid="select-all-channels"]` - Select all checkbox

## Running the Tests

### Prerequisites
1. Ensure PlexBridge server is running on `http://localhost:8080`
2. Install Playwright dependencies: `npx playwright install chrome`
3. Verify test environment has sufficient test data

### Execution Commands

```bash
# Run all drag and sort tests
npx playwright test channel-manager-drag-sort.spec.js

# Run with UI mode for debugging
npx playwright test channel-manager-drag-sort.spec.js --ui

# Run specific test group
npx playwright test channel-manager-drag-sort.spec.js -g "Drag and Drop Functionality"

# Run with headed browser for visual debugging
npx playwright test channel-manager-drag-sort.spec.js --headed

# Generate test report
npx playwright test channel-manager-drag-sort.spec.js --reporter=html
```

### Debug Mode

For detailed debugging:
```bash
# Run with debug mode
npx playwright test channel-manager-drag-sort.spec.js --debug

# Run single test with debug
npx playwright test channel-manager-drag-sort.spec.js -g "should successfully reorder channels" --debug
```

## Expected Outcomes

### Success Criteria
All tests should pass with:
- ✅ Zero test failures
- ✅ All screenshots captured successfully
- ✅ No JavaScript console errors
- ✅ Proper drag and drop functionality
- ✅ Correct sorting behavior
- ✅ Mobile responsiveness working
- ✅ API integration functioning
- ✅ Error handling working correctly

### Generated Artifacts

The test suite generates the following artifacts:
- **Screenshots**: Visual verification of each major test step
- **Videos**: Recordings of drag operations and interactions
- **Traces**: Detailed execution traces for debugging
- **HTML Report**: Comprehensive test results with timing data

### Screenshot Locations
- `test-results/drag-handle-hover-state.png`
- `test-results/before-drag-reorder.png`
- `test-results/during-drag-reorder.png`
- `test-results/after-drag-reorder.png`
- `test-results/sort-number-ascending.png`
- `test-results/sort-name-descending.png`
- `test-results/mobile-drag-sort.png`
- And many more detailed screenshots for each test scenario

## Maintenance Notes

### Updating Tests
When Channel Manager features change:
1. Update data-testid selectors if UI structure changes
2. Modify helper functions if data format changes
3. Add new test cases for additional functionality
4. Update API expectations if backend changes

### Common Issues
- **Timing Issues**: Increase wait times if tests are flaky
- **Selector Changes**: Update data-testid references if component structure changes
- **API Changes**: Modify mock responses if backend API evolves
- **Mobile Testing**: Ensure touch events work correctly across devices

## Integration with Existing Test Suite

This test file integrates seamlessly with the existing PlexBridge test infrastructure:
- Uses same Playwright configuration
- Follows established patterns from other test files
- Compatible with CI/CD pipeline
- Generates reports in same format as other tests

The tests are designed to be robust, maintainable, and provide comprehensive coverage of the drag-and-drop and sorting functionality while following the project's testing standards and best practices.