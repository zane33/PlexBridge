# PlexBridge - Claude Agent Manifest

## Project Overview

**PlexBridge** is a Node.js application that acts as a bridge between IPTV streams and Plex Media Server by emulating an HDHomeRun network tuner. It provides a complete solution for integrating IPTV sources into Plex with full Electronic Program Guide (EPG) support, real-time monitoring, and a modern web management interface.

### Key Features
- **HDHomeRun Compatibility**: Full API compliance with HDHomeRun tuner protocols
- **Universal Protocol Support**: Handles all major IPTV streaming protocols (HLS, DASH, RTSP, RTMP, UDP, HTTP, MMS, SRT)
- **Real-time Operations**: Live monitoring, streaming, and web interface updates
- **Modern Web Interface**: React-based dashboard with Material-UI components
- **EPG Integration**: XMLTV support with automated refresh scheduling
- **Containerized Deployment**: Docker support with health checks and monitoring

## Technology Stack

### Backend (Node.js)
- **Framework**: Express.js 4.18.2 with Socket.IO for real-time communication
- **Database**: SQLite with WAL journaling mode
- **Caching**: Redis with memory fallback
- **Streaming**: FFmpeg integration for transcoding and format conversion
- **Discovery**: SSDP/UPnP protocol for Plex integration
- **Security**: Helmet.js, CORS, rate limiting, input validation with Joi
- **Logging**: Winston with daily rotation and structured logging
- **Process Management**: PM2 for production deployment

### Frontend (React)
- **Framework**: React 18.2.0 with React Router 6.20.0
- **UI Library**: Material-UI 5.15.0 with Emotion for styling
- **Data Visualization**: Chart.js 4.4.0 with react-chartjs-2
- **Real-time**: Socket.IO client for live updates
- **HTTP Client**: Axios with interceptors and error handling
- **Video Streaming**: HLS.js, DASH.js, Video.js for media playback
- **Notifications**: Notistack for toast notifications

### Development Tools
- **Package Manager**: npm with Node.js 18+ requirement
- **Development Server**: nodemon for auto-restart
- **Testing**: Jest with Supertest for API testing
- **Build Tools**: React Scripts for frontend build
- **Containerization**: Docker with multi-stage builds

## Project Structure

```
PlexBridge/
├── server/                    # Backend application
│   ├── config/               # Configuration management
│   ├── routes/               # API endpoints
│   ├── services/             # Business logic services
│   ├── utils/                # Utility functions
│   └── index.js              # Main server entry point
├── client/                   # Frontend React application
│   ├── public/               # Static assets
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── services/         # API and WebSocket services
│   │   └── App.js            # Main React component
│   └── package.json
├── config/                   # Configuration files
├── data/                     # Runtime data (database, logs, cache)
├── docs/                     # Project documentation
├── docker-compose.yml        # Docker deployment
├── Dockerfile               # Container build
└── package.json             # Root package.json
```

## Architecture Overview

### System Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                           │
│  React + Material-UI + Socket.IO Client                        │
│  • Dashboard, Channel Manager, Stream Manager, EPG Manager     │
│  • Real-time updates, Data visualization, Error boundaries     │
└─────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                        Backend Layer                            │
│  Express.js + Socket.IO + Service Layer                        │
│  • REST API, WebSocket, Stream proxy, SSDP discovery          │
│  • Database, Cache, EPG, Stream management services           │
└─────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                         Data Layer                              │
│  SQLite + Redis + File System                                  │
│  • Channels, Streams, EPG data, Settings, Logs                │
│  • Caching, Session management, Asset storage                 │
└─────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐         ┌────────▼────────┐         ┌───────▼────────┐
│  Plex Server   │         │  IPTV Sources   │         │  EPG Sources   │
│                │         │                 │         │                │
│ • Discovery    │         │ • HLS/M3U8      │         │ • XMLTV Files  │
│ • Channel      │         │ • DASH/MPD      │         │ • Schedule API │
│ • Lineup       │         │ • RTSP Streams  │         │ • HTTP/HTTPS   │
│ • EPG Data     │         │ • RTMP Flash    │         │ • Gzip Support │
│ • Live Stream  │         │ • UDP Multicast │         │ • Auto Refresh │
│ • Recording    │         │ • HTTP Direct   │         │ • Format Valid │
└────────────────┘         │ • MMS/SRT       │         └────────────────┘
                          │ • Auth Support  │
                          └─────────────────┘
```

### Component Architecture

#### Frontend Components
- **Layout.js**: Responsive navigation with Material-UI drawer
- **Dashboard.js**: Real-time metrics, system health, active streams
- **ChannelManager.js**: CRUD operations for TV channels with data grid
- **StreamManager.js**: IPTV stream configuration and validation
- **EPGManager.js**: XMLTV data source management and scheduling
- **LogViewer.js**: Real-time log streaming with filtering
- **Settings.js**: Application configuration with live validation
- **ErrorBoundary.js**: React error boundary for fault tolerance

#### Backend Services
- **Database Service**: SQLite operations with WAL mode and connection pooling
- **Cache Service**: Redis with memory fallback and TTL management
- **Stream Manager**: Universal IPTV protocol handling with FFmpeg
- **SSDP Service**: UPnP device emulation for Plex discovery
- **EPG Service**: XMLTV parsing with cron-based scheduling
- **Logger Service**: Winston-based structured logging

## API Endpoints

### Core Management API
- `GET /api/channels` - Channel management with CRUD operations
- `GET /api/streams` - Stream configuration and validation
- `GET /api/epg` - Program guide data and sources
- `GET /api/metrics` - System metrics and health status
- `GET /api/settings` - Application configuration
- `GET /api/logs` - Application logs with filtering

### HDHomeRun Emulation (Plex Integration)
- `GET /discover.json` - Device discovery for Plex
- `GET /device.xml` - UPnP device description
- `GET /lineup.json` - Channel lineup for Plex tuner
- `GET /lineup_status.json` - Tuner status information

### Stream Endpoints
- `GET /stream/:channelId` - Live stream proxy for Plex consumption
- `POST /validate` - Stream URL validation and format detection
- `GET /stream/active` - Active streaming sessions

### EPG Endpoints
- `GET /epg/xmltv/:channelId?` - XMLTV format export
- `GET /epg/json/:channelId?` - JSON format export
- `GET /epg/search` - Program search functionality

## Configuration Management

### Configuration Hierarchy
1. **Default Values** - Built-in sensible defaults
2. **JSON Files** - `config/default.json`, `config/production.json`
3. **Environment Variables** - Override any setting
4. **Runtime Settings** - Dynamic settings via web interface

### Key Configuration Areas
- **Server**: Port, host, environment settings
- **Database**: SQLite path, options, connection pooling
- **Cache**: Redis configuration, TTL policies
- **Streams**: Concurrent limits, transcoding, protocol options
- **SSDP**: Device discovery, UPnP settings
- **EPG**: Refresh intervals, source URLs, scheduling
- **Logging**: Levels, rotation, file management
- **Security**: Rate limiting, authentication, CORS

### Environment Variables
```bash
# Core settings
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# Database
DB_PATH=/data/database/plextv.db

# Cache
REDIS_HOST=localhost
REDIS_PORT=6379

# Streaming
MAX_CONCURRENT_STREAMS=10
TRANSCODE_ENABLED=true
FFMPEG_PATH=/usr/bin/ffmpeg

# SSDP Discovery
DEVICE_UUID=auto-generated
FRIENDLY_NAME=PlexBridge
SSDP_PORT=1900
```

## Development Guidelines

### Code Standards
- **Backend**: ES6+ JavaScript with async/await patterns
- **Frontend**: React functional components with hooks
- **Error Handling**: Comprehensive error boundaries and logging
- **Validation**: Joi schemas for all API inputs
- **Documentation**: JSDoc comments for functions and classes

### Best Practices
- **Security First**: Input validation, rate limiting, secure headers
- **Performance**: Caching strategies, connection pooling, resource limits
- **Reliability**: Graceful fallbacks, health checks, error recovery
- **Maintainability**: Modular architecture, clear separation of concerns
- **Testing**: Unit tests, integration tests, end-to-end testing

## Testing Strategy

### Testing Framework Setup
The project uses **Playwright** for comprehensive end-to-end testing with Chrome browser automation. Tests verify M3U import pagination fixes and stream preview functionality.

### Playwright Configuration

#### Installation and Setup
```bash
# Install Playwright dependencies
npm install --save-dev @playwright/test playwright

# Install browser binaries (may require sudo/admin privileges)
npx playwright install chrome
# Alternative for permission issues:
npx playwright install chromium

# For Docker/CI environments:
npx playwright install-deps
```

#### Playwright Configuration (`playwright.config.js`)
```javascript
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Chrome-specific settings for stability
        channel: 'chrome',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

### Test Categories

#### 1. Unit Tests (Jest)
```javascript
// Example: API endpoint testing
describe('Channel API', () => {
  test('GET /api/channels returns channels', async () => {
    const response = await request(app).get('/api/channels');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

#### 2. Integration Tests (Supertest)
```javascript
// Example: Database integration testing
describe('Database Integration', () => {
  test('Channel creation and retrieval', async () => {
    const channel = { name: 'Test Channel', number: 999 };
    const createResponse = await request(app)
      .post('/api/channels')
      .send(channel);
    expect(createResponse.status).toBe(201);
    
    const getResponse = await request(app)
      .get(`/api/channels/${createResponse.body.id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.name).toBe(channel.name);
  });
});
```

#### 3. End-to-End Tests (Playwright)
**IMPORTANT: Use data-testid selectors for reliable UI testing**

```javascript
// Example: Complete user workflow testing with proper selectors
test('Channel management workflow', async ({ page }) => {
  // Navigate to channel manager using data-testid
  await page.goto('/');
  await page.click('[data-testid="nav-channels"]');
  
  // Create new channel using data-testid selectors
  await page.click('[data-testid="add-channel-button"]');
  await page.fill('[data-testid="channel-name-input"]', 'Test Channel');
  await page.fill('[data-testid="channel-number-input"]', '999');
  await page.click('[data-testid="save-channel-button"]');
  
  // Verify channel appears in list
  await expect(page.locator('table tbody tr:has-text("Test Channel")')).toBeVisible();
  
  // Edit channel using scoped selectors
  await page.locator('table tbody tr:has-text("Test Channel")')
    .locator('[data-testid="edit-channel-button"]').click();
  await page.fill('[data-testid="channel-name-input"]', 'Updated Channel');
  await page.click('[data-testid="save-channel-button"]');
  
  // Verify update
  await expect(page.locator('table tbody tr:has-text("Updated Channel")')).toBeVisible();
});

// Example: M3U Import with pagination testing
test('M3U import with pagination', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="nav-streams"]');
  await page.click('[data-testid="import-m3u-button"]');
  
  // Fill import form using scoped selectors within dialog
  await page.locator('[data-testid="import-dialog"]')
    .locator('[data-testid="import-url-input"]')
    .fill('https://iptv-org.github.io/iptv/index.m3u');
  await page.click('[data-testid="parse-channels-button"]');
  
  // Wait for channels to load and verify pagination
  await page.waitForSelector('[data-testid="import-dialog"] table tbody tr');
  
  // Test pagination controls (Material-UI specific)
  const nextPageButton = page.locator('[data-testid="import-dialog"]')
    .locator('.MuiTablePagination-actions button[aria-label="Go to next page"]');
  if (await nextPageButton.isEnabled()) {
    await nextPageButton.click();
    await page.waitForTimeout(1000); // Allow page to update
  }
  
  // Test rows per page selector
  await page.locator('[data-testid="import-dialog"]')
    .locator('.MuiTablePagination-select').click();
  await page.click('li[data-value="50"]');
  
  // Verify up to 50 rows are now displayed
  const rows = await page.locator('[data-testid="import-dialog"] table tbody tr').count();
  expect(rows).toBeLessThanOrEqual(50);
});
```

#### 4. Performance Tests
```javascript
// Example: Load testing with Playwright
test('Dashboard performance under load', async ({ page }) => {
  const startTime = Date.now();
  
  await page.goto('/dashboard');
  
  // Wait for all metrics to load
  await page.waitForSelector('[data-testid="system-metrics"]');
  await page.waitForSelector('[data-testid="active-streams"]');
  
  const loadTime = Date.now() - startTime;
  expect(loadTime).toBeLessThan(3000); // Should load within 3 seconds
});
```

### Test Data Management
```javascript
// Test fixtures and data setup
const testData = {
  channels: [
    { name: 'CNN HD', number: 101, enabled: true },
    { name: 'BBC News', number: 102, enabled: true }
  ],
  streams: [
    { url: 'https://test.com/stream.m3u8', type: 'hls' }
  ]
};

// Database seeding for tests
async function seedTestData() {
  // Insert test data into database
  for (const channel of testData.channels) {
    await db.run('INSERT INTO channels (name, number, enabled) VALUES (?, ?, ?)',
      [channel.name, channel.number, channel.enabled]);
  }
}
```

### Test Commands and Scripts

The project includes comprehensive npm scripts for different testing scenarios:

```bash
# End-to-End Testing Commands
npm run test:e2e          # Run all Playwright tests (headless)
npm run test:e2e:headed   # Run tests with visible browser
npm run test:e2e:debug    # Run tests in debug mode (step-through)
npm run test:e2e:ui       # Run tests with Playwright UI
npm run test:all          # Run both unit and e2e tests

# Running Specific Tests
npx playwright test tests/e2e/m3u-import.spec.js           # Specific test file
npx playwright test -g "should display M3U import dialog"  # Specific test case
npx playwright test --project=chromium                     # Specific browser project

# Test Reports and Debugging
npx playwright show-report  # View HTML test report
npx playwright codegen      # Generate test code interactively
```

### Critical Testing Guidelines for Future Agents

#### 1. **Always Use data-testid Selectors**
```javascript
// ✅ CORRECT - Use data-testid for reliable selection
await page.click('[data-testid="nav-streams"]');
await page.fill('[data-testid="import-url-input"]', url);

// ❌ INCORRECT - Avoid text selectors that can match multiple elements
await page.click('text="Streams"');  // Can match multiple elements
await page.click('button:has-text("Import")');  // Can be ambiguous
```

#### 2. **Scope Selectors to Dialog/Container Context**
```javascript
// ✅ CORRECT - Scope selectors within specific containers
await page.locator('[data-testid="import-dialog"]')
  .locator('[data-testid="import-url-input"]')
  .fill('test-url');

// ❌ INCORRECT - Global selectors can match wrong elements
await page.fill('[data-testid="import-url-input"]', 'test-url');
```

#### 3. **Handle Responsive Design Differences**
```javascript
// ✅ CORRECT - Check for mobile vs desktop patterns
const isMobile = page.viewportSize().width < 768;
if (isMobile) {
  await page.click('[data-testid="mobile-menu-button"]');
  await page.click('[data-testid="nav-streams"]');
} else {
  await page.click('[data-testid="nav-streams"]');
}
```

#### 4. **Material-UI Specific Selectors**
```javascript
// Pagination controls
await page.click('.MuiTablePagination-actions button[aria-label="Go to next page"]');

// Select dropdowns
await page.click('.MuiTablePagination-select');
await page.click('li[data-value="50"]');

// Dialog containers
await page.locator('.MuiDialog-root [data-testid="import-dialog"]');
```

#### 5. **Proper Wait Strategies**
```javascript
// ✅ CORRECT - Wait for specific elements
await page.waitForSelector('[data-testid="import-dialog"] table tbody tr');
await page.waitForLoadState('networkidle');

// ❌ INCORRECT - Avoid arbitrary timeouts
await page.waitForTimeout(5000);  // Unreliable and slow
```

### Available Test Data IDs

#### Navigation
- `[data-testid="nav-dashboard"]` - Dashboard navigation link
- `[data-testid="nav-channels"]` - Channels navigation link  
- `[data-testid="nav-streams"]` - Streams navigation link
- `[data-testid="nav-epg"]` - EPG navigation link
- `[data-testid="nav-logs"]` - Logs navigation link
- `[data-testid="nav-settings"]` - Settings navigation link
- `[data-testid="mobile-menu-button"]` - Mobile hamburger menu

#### Stream Manager
- `[data-testid="add-stream-button"]` - Add new stream button
- `[data-testid="import-m3u-button"]` - Import M3U playlist button
- `[data-testid="stream-dialog"]` - Stream creation/edit dialog
- `[data-testid="import-dialog"]` - M3U import dialog
- `[data-testid="stream-name-input"]` - Stream name input field
- `[data-testid="stream-url-input"]` - Stream URL input field
- `[data-testid="import-url-input"]` - M3U URL input field
- `[data-testid="parse-channels-button"]` - Parse M3U channels button
- `[data-testid="import-selected-button"]` - Import selected channels button
- `[data-testid="test-stream-button"]` - Test stream in player button
- `[data-testid="preview-stream-button"]` - Preview stream button (table row)
- `[data-testid="edit-stream-button"]` - Edit stream button (table row)
- `[data-testid="delete-stream-button"]` - Delete stream button (table row)

#### Channel Manager  
- `[data-testid="add-channel-button"]` - Add new channel button
- `[data-testid="add-channel-fab"]` - Mobile add channel FAB
- `[data-testid="channel-name-input"]` - Channel name input field
- `[data-testid="channel-number-input"]` - Channel number input field
- `[data-testid="edit-channel-button"]` - Edit channel button (table row)
- `[data-testid="delete-channel-button"]` - Delete channel button (table row)

#### Common Form Actions
- `[data-testid="save-button"]` - Generic save button
- `[data-testid="cancel-button"]` - Generic cancel button
- `[data-testid="save-stream-button"]` - Save stream button
- `[data-testid="cancel-stream-button"]` - Cancel stream button
- `[data-testid="save-channel-button"]` - Save channel button
- `[data-testid="cancel-channel-button"]` - Cancel channel button

### Continuous Integration
```yaml
# GitHub Actions workflow example
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test
      - run: npx playwright install-deps  # Install browser dependencies
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## Deployment Guidelines

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d

# Environment-specific configurations
docker-compose -f docker-compose.prod.yml up -d
```

### Production Considerations
- **Security**: HTTPS enforcement, secure headers, rate limiting
- **Performance**: Redis caching, connection pooling, resource limits
- **Monitoring**: Health checks, logging, metrics collection
- **Scalability**: Horizontal scaling, load balancing, database optimization
- **Backup**: Database backups, configuration versioning, disaster recovery

### Health Monitoring
```javascript
// Health check endpoint
GET /health
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 86400,
  "services": {
    "database": { "status": "healthy" },
    "cache": { "status": "healthy" },
    "ssdp": { "status": "running" }
  }
}
```

## Troubleshooting Guide

### Common Issues
1. **Database Connection**: Check file permissions and path configuration
2. **Redis Connection**: Verify Redis service and connection parameters
3. **Stream Issues**: Validate FFmpeg installation and stream URLs
4. **SSDP Discovery**: Check network interface and firewall settings
5. **Frontend Build**: Ensure all dependencies are installed

### Debug Commands
```bash
# Check application status
curl http://localhost:8080/health

# View application logs
tail -f data/logs/app-$(date +%Y-%m-%d).log

# Test database connection
sqlite3 data/database/plextv.db ".tables"

# Validate configuration
node -e "console.log(require('./server/config'))"
```

## Contributing Guidelines

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Follow coding standards and testing requirements
4. Submit a pull request with comprehensive tests

### Code Review Checklist
- [ ] Code follows project standards
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Security considerations addressed
- [ ] Performance impact assessed

### Testing Requirements
- [ ] Unit tests for new functionality
- [ ] Integration tests for API changes
- [ ] End-to-end tests for user workflows
- [ ] Performance tests for critical paths

## Resources and References

### Documentation
- [Architecture Documentation](docs/Architecture.md)
- [API Reference](docs/API.md)
- [Configuration Guide](docs/Configuration.md)
- [Setup Instructions](docs/Setup.md)
- [Troubleshooting Guide](docs/Troubleshooting.md)

### External Dependencies
- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://reactjs.org/)
- [Material-UI Documentation](https://mui.com/)
- [Playwright Documentation](https://playwright.dev/)
- [Docker Documentation](https://docs.docker.com/)

### Community and Support
- GitHub Issues for bug reports and feature requests
- Documentation for setup and configuration
- Code examples in the repository
- Testing framework for validation

---

This manifest provides Claude agents with comprehensive information about the PlexBridge project, enabling effective development, testing, and maintenance tasks. The Playwright MCP configuration ensures robust end-to-end testing capabilities with Chrome browser automation.
