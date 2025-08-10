# PlexTV Testing Guide

## Quick Start

PlexTV is now built as a **single container** with all components included:
- Node.js backend with Express and Socket.IO
- React frontend with mobile-responsive Material-UI
- Internal Redis cache (no external dependencies)
- SQLite database
- FFmpeg for stream processing
- All IPTV protocol support

## Prerequisites

1. **Docker Desktop** - Install and start Docker Desktop
2. **Git** (optional) - For cloning the repository

## Local Testing

### Option 1: Windows (Recommended)
```batch
# Double-click or run in Command Prompt
build-local.bat
```

### Option 2: Linux/macOS
```bash
# Make executable and run
chmod +x build-local.sh
./build-local.sh
```

### Option 3: Manual Docker Commands
```bash
# Create data directories
mkdir -p data/database data/cache data/logs data/logos

# Build and start
docker-compose build --no-cache
docker-compose up -d

# Check status
docker-compose logs -f
```

## Application Features

### 🎯 Single Container Architecture
- ✅ All services in one container (Node.js + Redis + FFmpeg)
- ✅ No external dependencies
- ✅ Simplified deployment
- ✅ Built-in health checks
- ✅ Automatic process management with Supervisor

### 📱 Mobile-Responsive GUI
- ✅ **Responsive Layout**: Adapts to all screen sizes
- ✅ **Mobile Navigation**: Collapsible sidebar with FAB on mobile
- ✅ **Touch-Friendly**: Large touch targets and gestures
- ✅ **Responsive Tables**: Horizontal scrolling and sticky headers
- ✅ **Adaptive Typography**: Font sizes adjust for mobile
- ✅ **Optimized Dialogs**: Full-screen on mobile, modal on desktop

### 🎨 Visual Feedback & UX
- ✅ **Loading States**: Skeleton screens and spinners
- ✅ **Success Notifications**: Toast messages with emojis (🎉, 🗑️)
- ✅ **Error Handling**: User-friendly error messages
- ✅ **Connection Status**: Live connection indicator
- ✅ **Progress Indicators**: Save/delete operations show progress
- ✅ **Interactive Elements**: Hover effects and transitions
- ✅ **Form Validation**: Real-time validation with visual feedback

### 🔧 Key Components

#### Dashboard
- Real-time system metrics with auto-refresh
- Mobile-responsive charts (Chart.js)
- Connection status monitoring
- Active stream tracking
- System health indicators

#### Channel Manager
- ✅ **Mobile FAB**: Floating Action Button for adding channels
- ✅ **Responsive Forms**: Adaptive dialog layouts
- ✅ **Visual Feedback**: Loading spinners, success/error messages
- ✅ **Form Validation**: Real-time validation with error highlights
- ✅ **Touch Optimization**: Large buttons and touch targets

#### Stream Manager
- Universal IPTV protocol support (HLS, DASH, RTSP, RTMP, UDP, HTTP, MMS, SRT)
- Stream validation and testing
- Format auto-detection
- Backup URL support

#### EPG Manager
- XMLTV format support
- Automatic refresh scheduling
- Channel mapping
- Program guide data

## Mobile-First Design Features

### Navigation
- **Desktop**: Permanent sidebar navigation
- **Mobile**: Collapsible drawer with hamburger menu
- **Touch**: Large touch targets (44px minimum)
- **Gestures**: Swipe to close mobile drawer

### Layout Adaptations
- **Desktop**: Multi-column layouts with full tables
- **Tablet**: Reduced columns, optimized spacing
- **Mobile**: Single column, stacked cards, horizontal scroll

### Form Interactions
- **Desktop**: Inline forms with hover effects
- **Mobile**: Full-screen dialogs with large buttons
- **Touch**: Enhanced tap targets and visual feedback

### Data Display
- **Desktop**: Full data tables with all columns
- **Mobile**: Essential columns only, sticky headers
- **Responsive**: Adaptive typography and spacing

## Testing the Application

### 1. Start Application
Run the build script appropriate for your platform.

### 2. Access Web Interface
Open http://localhost:8080 in your browser.

### 3. Test Mobile Responsiveness
- Resize browser window
- Use Chrome DevTools device emulation
- Test on actual mobile devices

### 4. Test Features
1. **Add Channels**: Test the mobile-responsive forms
2. **Configure Streams**: Test IPTV URL validation
3. **Monitor Dashboard**: Check real-time updates
4. **View Logs**: Test live log streaming

### 5. Test Plex Integration
1. In Plex: Settings → Live TV & DVR
2. Plex should auto-discover PlexTV
3. Follow setup wizard
4. Test live TV playback

## Visual Feedback Examples

### Success Messages
- ✅ "Channel created successfully! 🎉"
- ✅ "Channel updated successfully! 🎉"
- ✅ "Channel deleted successfully 🗑️"

### Loading States
- Skeleton screens during initial load
- Spinner buttons during save operations
- Progress indicators for long operations

### Error Handling
- Form validation with red highlights
- User-friendly error messages
- Retry buttons for failed operations

### Connection Status
- Green chip: "Connected"
- Yellow chip: "Error" 
- Red chip: "Disconnected"

## Architecture Highlights

### Single Container Benefits
- **Simplified Deployment**: No orchestration needed
- **Resource Efficiency**: Shared memory and processes
- **Easy Scaling**: Single unit to replicate
- **Reduced Complexity**: No inter-service networking

### Mobile-First Approach
- **Progressive Enhancement**: Works on any device
- **Touch-Optimized**: Designed for finger navigation
- **Performance**: Optimized for mobile networks
- **Accessibility**: WCAG compliant interactions

### Modern UX Patterns
- **Material Design 3**: Latest design language
- **Dark Theme**: Easy on the eyes
- **Micro-interactions**: Smooth animations
- **Feedback Loops**: Immediate user feedback

## Troubleshooting

### Docker Issues
```bash
# Check Docker is running
docker --version

# View logs
docker-compose logs -f

# Restart services
docker-compose restart
```

### Mobile Issues
- Clear browser cache
- Test in incognito/private mode
- Check console for JavaScript errors
- Test on different devices/browsers

### Performance Issues
- Monitor container resources: `docker stats`
- Check application logs for errors
- Verify network connectivity to IPTV sources

## Production Deployment

The application is production-ready with:
- Security hardening
- Resource limits
- Health checks
- Monitoring endpoints
- Log management
- Graceful shutdown

For production deployment, see the main README.md and documentation in the `docs/` folder.

---

🎉 **PlexTV is ready for testing!** The application provides a modern, mobile-responsive interface for managing IPTV streams in Plex with comprehensive visual feedback and professional UX patterns.
