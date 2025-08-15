# PlexBridge Development Guide

## Fixed Issues

The following critical backend issues have been resolved:

### ✅ Database Initialization
- **Fixed SQLite path resolution**: Database now correctly uses local data directory in development
- **Fixed SQL syntax errors**: Removed invalid INDEX syntax from CREATE TABLE statements
- **Added proper error handling**: Database initialization includes permission checks and detailed logging
- **Path**: Database located at `./data/database/plextv.db` in development

### ✅ Configuration Management
- **Fixed Docker/local path detection**: Automatically uses `/data` in Docker, `./data` locally
- **Fixed config file precedence**: Removed hardcoded paths from production.json
- **Added directory creation**: All required directories are created with proper permissions
- **Improved error handling**: Configuration loading includes fallback mechanisms

### ✅ Logging System
- **Fixed Winston dependency**: All logging dependencies are properly installed
- **Added fallback logging**: If file logging fails, console logging is used
- **Fixed log directory permissions**: Automatic creation with proper permissions
- **Added structured logging**: Different log files for app, errors, streams, and HTTP requests

### ✅ Cache Service  
- **Fixed Redis timeout**: Reduced connection timeout from default to 5 seconds
- **Improved fallback**: Graceful fallback to memory cache when Redis unavailable
- **Added connection cleanup**: Proper cleanup of failed Redis connections
- **Memory cache implementation**: Full in-memory cache as fallback

### ✅ Service Dependencies
- **Fixed import issues**: All service dependencies are properly resolved
- **Added error boundaries**: Services can fail gracefully without crashing the app
- **Improved startup sequence**: Services start in correct order with retry logic
- **Added health checks**: All services provide health status endpoints

## Development Setup

### Prerequisites
```bash
# Node.js 18+ and npm
node --version  # Should be 18+
npm --version   # Should be 8+
```

### Installation
```bash
# Install dependencies
npm install

# Install client dependencies (optional, for full stack development)
cd client && npm install && cd ..
```

### Running the Application

#### Development Mode (Recommended)
```bash
npm run dev
```
- Uses nodemon for auto-restart
- Detailed debug logging
- Hot reloading on file changes
- Console logging enabled

#### Production Mode
```bash
npm start
```
- Uses PM2 process manager
- Production logging levels
- File-based logging
- Better performance

### Environment Variables

The application works with defaults, but you can customize:

```bash
# Core settings
NODE_ENV=development
PORT=8080
LOG_LEVEL=debug

# Database (optional - defaults to ./data/database/)
DB_PATH=/custom/path/to/database.db

# Redis (optional - falls back to memory cache)
REDIS_HOST=localhost
REDIS_PORT=6379

# Streams (optional)
MAX_CONCURRENT_STREAMS=10
FFMPEG_PATH=/usr/bin/ffmpeg

# SSDP Discovery (optional)
DEVICE_UUID=auto-generated
FRIENDLY_NAME=PlexTV
```

### Verification

Run the built-in validation:
```bash
# Quick validation (< 10 seconds)
node -e "
const config = require('./server/config');
const database = require('./server/services/database');
console.log('✅ Config:', config.database.path);
database.initialize().then(() => {
  console.log('✅ Database working');
  process.exit(0);
}).catch(err => {
  console.log('❌ Database error:', err.message);
  process.exit(1);
});
"
```

### Application URLs

Once started, access:
- **Web Interface**: http://localhost:8080
- **Health Check**: http://localhost:8080/health
- **Plex Discovery**: http://localhost:8080/discover.json
- **Channel Lineup**: http://localhost:8080/lineup.json
- **API Documentation**: http://localhost:8080/api/

### Troubleshooting

#### Database Issues
```bash
# Check database path and permissions
ls -la data/database/
# Should show plextv.db with read/write permissions
```

#### Redis Connection
```bash
# Redis is optional - application will use memory cache if unavailable
# To install Redis (Ubuntu/Debian):
sudo apt-get install redis-server
sudo systemctl start redis-server
```

#### Log Files
```bash
# Check application logs
tail -f data/logs/app-$(date +%Y-%m-%d).log

# Check error logs
tail -f data/logs/error-$(date +%Y-%m-%d).log
```

## Development Architecture

### Core Components
- **Express Server**: HTTP server with middleware
- **SQLite Database**: Local storage for channels, streams, EPG
- **Cache Service**: Redis or memory-based caching
- **SSDP Service**: Plex discovery protocol
- **Stream Manager**: IPTV stream handling
- **EPG Service**: Electronic Program Guide

### File Structure
```
server/
├── config/index.js          # Configuration management
├── services/
│   ├── database.js          # SQLite operations
│   ├── cacheService.js      # Redis/memory caching
│   ├── ssdpService.js       # Plex discovery
│   ├── streamManager.js     # Stream handling
│   └── epgService.js        # Program guide
├── routes/                  # API endpoints
├── utils/logger.js          # Logging system
└── index.js                 # Main application

data/                        # Local data directory
├── database/plextv.db       # SQLite database
├── logs/                    # Application logs
├── cache/                   # Cache files
└── logos/                   # Channel logos
```

## API Endpoints

### Plex Discovery (HDHomeRun Compatible)
- `GET /discover.json` - Device discovery
- `GET /device.xml` - Device description  
- `GET /lineup.json` - Channel lineup
- `GET /lineup_status.json` - Tuner status

### Management API
- `GET /api/channels` - Channel management
- `GET /api/streams` - Stream management  
- `GET /api/epg` - Program guide data
- `GET /api/metrics` - System metrics
- `GET /health` - Health check

### Stream Endpoints
- `GET /stream/:channelId` - Live stream proxy
- `POST /api/streams/validate` - Stream validation

## Next Steps

The backend is now stable and ready for:

1. **Frontend Integration**: Connect React interface to API endpoints
2. **IPTV Source Configuration**: Add M3U playlist imports
3. **EPG Integration**: Configure XML TV guide sources  
4. **Plex Testing**: Test Plex Media Server integration
5. **Docker Deployment**: Deploy with Docker Compose

The application should now start successfully without the previous database and configuration errors.