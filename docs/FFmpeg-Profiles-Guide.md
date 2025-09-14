# FFmpeg Profiles Management System

## Overview

The FFmpeg Profiles Management System in PlexBridge allows you to create custom transcoding profiles for different client types and devices. This system provides fine-grained control over video and audio encoding parameters, ensuring optimal playback quality and performance across various Plex clients.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Profile Structure](#profile-structure)
3. [Client Types](#client-types)
4. [Default Configurations](#default-configurations)
5. [Profile Management](#profile-management)
6. [Stream Association](#stream-association)
7. [API Endpoints](#api-endpoints)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

## System Architecture

### Backend Components

- **`ffmpegProfileManager.js`**: Core service managing profile CRUD operations, stream associations, and FFmpeg argument generation
- **`ffmpeg-profiles.js`**: Express router handling HTTP API endpoints for profile management
- **Database Schema**: SQLite tables storing profile configurations and stream associations

### Frontend Components

- **`FFmpegProfileManager.js`**: React component providing the user interface for profile management
- **Profile Editor**: Tabbed interface for configuration, stream association, and bulk assignment
- **Real-time State Management**: Immediate UI updates for all profile operations

## Profile Structure

### Basic Profile Properties

```json
{
  "id": 1,
  "name": "High Quality Web",
  "description": "Optimized for web browsers with high-speed connections",
  "is_default": 0,
  "is_system": 0,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z",
  "stream_count": 5,
  "associated_streams": [...],
  "clients": {
    "web_browser": {
      "ffmpeg_args": "-c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k",
      "hls_args": "-hls_time 4 -hls_list_size 10 -hls_flags delete_segments"
    }
  }
}
```

### Client Configuration Structure

Each profile can contain multiple client configurations:

```json
{
  "clients": {
    "web_browser": {
      "ffmpeg_args": "Video and audio encoding parameters",
      "hls_args": "HLS-specific streaming parameters"
    },
    "android_mobile": {
      "ffmpeg_args": "Mobile-optimized encoding parameters",
      "hls_args": "Mobile HLS parameters"
    }
  }
}
```

## Client Types

### Supported Client Types

| Client Type | Description | Use Case |
|-------------|-------------|----------|
| `web_browser` | Plex Web Browser Client | Desktop browsers, web interfaces |
| `android_mobile` | Plex Android Mobile App | Android phones and tablets |
| `android_tv` | Plex Android TV App | Android TV devices, set-top boxes |
| `ios_mobile` | Plex iOS Mobile App | iPhones and iPads |
| `apple_tv` | Plex Apple TV App | Apple TV devices |

### Client Detection

The system automatically detects client types based on User-Agent headers and device capabilities. You can also manually specify client types for testing purposes.

## Default Configurations

### Default FFmpeg Arguments

```javascript
const DEFAULT_FFMPEG_ARGS = {
  web_browser: '-c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags +faststart',
  android_mobile: '-c:v h264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart',
  android_tv: '-c:v h264 -preset fast -crf 21 -c:a aac -b:a 192k -movflags +faststart',
  ios_mobile: '-c:v h264 -profile:v baseline -level 3.0 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart',
  apple_tv: '-c:v h264 -profile:v high -level 4.2 -preset fast -crf 21 -c:a aac -b:a 256k -movflags +faststart'
};
```

### Default HLS Arguments

```javascript
const DEFAULT_HLS_ARGS = {
  web_browser: '-hls_time 4 -hls_list_size 10 -hls_flags delete_segments',
  android_mobile: '-hls_time 4 -hls_list_size 10 -hls_flags delete_segments',
  android_tv: '-hls_time 6 -hls_list_size 10 -hls_flags delete_segments',
  ios_mobile: '-hls_time 4 -hls_list_size 10 -hls_flags delete_segments',
  apple_tv: '-hls_time 6 -hls_list_size 10 -hls_flags delete_segments'
};
```

## Profile Management

### Creating Profiles

1. **Access Profile Manager**: Navigate to "FFmpeg Profiles" in the PlexBridge interface
2. **Add New Profile**: Click "Add Profile" button
3. **Configure Basic Settings**:
   - Profile name (required)
   - Description (optional)
   - Default profile checkbox
4. **Add Client Configurations**: Select client types and configure FFmpeg/HLS arguments
5. **Save Profile**: Click "Create Profile"

### Editing Profiles

1. **Open Profile Editor**: Click "Edit" button on any profile card
2. **Configuration Tab**: Modify basic settings and client configurations
3. **Associated Streams Tab**: View and manage streams using this profile
4. **Bulk Assignment Tab**: Assign multiple streams to the profile
5. **Save Changes**: Click "Update Profile"

### Profile Features

- **Stream Count Badge**: Visual indicator showing number of associated streams
- **System vs Custom Profiles**: System profiles are read-only, custom profiles are fully editable
- **Default Profile**: One profile can be marked as default for new streams
- **Profile Duplication**: Clone existing profiles as starting templates

## Stream Association

### Automatic Assignment

- New streams use the default profile automatically
- Profile inheritance follows priority: stream-specific → default → system fallback

### Manual Assignment

#### Individual Stream Assignment
1. Edit a specific stream in Stream Manager
2. Select desired profile from "FFmpeg Profile" dropdown
3. Save stream configuration

#### Bulk Assignment
1. Open profile editor
2. Navigate to "Bulk Assignment" tab
3. Select multiple streams from the list
4. Click "Assign Selected" to associate streams with the profile

### Stream Removal
1. Open profile editor
2. Navigate to "Associated Streams" tab
3. Click "Remove" button next to any stream
4. Stream reverts to default profile automatically

## API Endpoints

### Profile Management

```http
GET /api/ffmpeg-profiles
POST /api/ffmpeg-profiles
GET /api/ffmpeg-profiles/:id
PUT /api/ffmpeg-profiles/:id
DELETE /api/ffmpeg-profiles/:id
```

### Profile Operations

```http
POST /api/ffmpeg-profiles/:id/set-default
GET /api/ffmpeg-profiles/default/profile
POST /api/ffmpeg-profiles/initialize
```

### Stream Assignment

```http
POST /api/ffmpeg-profiles/:id/assign-streams
POST /api/ffmpeg-profiles/remove-streams
GET /api/ffmpeg-profiles/available-streams/:id?
```

### Testing and Utilities

```http
POST /api/ffmpeg-profiles/test-args
GET /api/ffmpeg-profiles/client-types/list
```

### API Example: Creating a Profile

```bash
curl -X POST http://localhost:3000/api/ffmpeg-profiles \
  -H "Content-Type: application/json" \
  -d '{
    "name": "4K High Quality",
    "description": "Optimized for 4K content",
    "is_default": false,
    "clients": {
      "web_browser": {
        "ffmpeg_args": "-c:v libx264 -preset medium -crf 18 -c:a aac -b:a 256k",
        "hls_args": "-hls_time 6 -hls_list_size 8"
      }
    }
  }'
```

## Best Practices

### Performance Optimization

1. **Use Hardware Acceleration**: Include GPU-specific encoding when available
   ```bash
   -c:v h264_nvenc -preset p4 -crf 23  # NVIDIA GPU
   -c:v h264_videotoolbox -crf 23      # Apple hardware
   ```

2. **Optimize Presets**: Balance encoding speed vs quality
   - `ultrafast`: Lowest quality, fastest encoding
   - `veryfast`: Good for real-time transcoding
   - `medium`: Balanced quality/speed
   - `slow`: Higher quality, slower encoding

3. **Mobile Considerations**: Use lower bitrates and compatible codecs
   ```bash
   -c:v h264 -profile:v baseline -level 3.0 -maxrate 2M -bufsize 4M
   ```

### Quality Settings

1. **CRF Values**: Constant Rate Factor for quality control
   - CRF 18-23: High quality
   - CRF 23-28: Standard quality
   - CRF 28+: Lower quality, smaller files

2. **Audio Settings**: Match source quality appropriately
   ```bash
   -c:a aac -b:a 128k  # Standard quality
   -c:a aac -b:a 256k  # High quality
   ```

### HLS Optimization

1. **Segment Duration**: Balance between startup time and efficiency
   - Short segments (2-4s): Fast startup, more overhead
   - Long segments (6-10s): Slower startup, more efficient

2. **Playlist Management**: Control segment retention
   ```bash
   -hls_list_size 10 -hls_flags delete_segments
   ```

## Troubleshooting

### Common Issues

#### Profile Not Applied
- **Symptom**: Stream uses different encoding than expected
- **Solution**: Check stream's assigned profile in Stream Manager
- **Verification**: Use "Test Arguments" feature to verify profile application

#### Encoding Failures
- **Symptom**: Stream fails to start or produces errors
- **Solution**: Verify FFmpeg arguments syntax and hardware support
- **Debug**: Check application logs for FFmpeg error messages

#### Poor Performance
- **Symptom**: High CPU usage or slow transcoding
- **Solution**: Optimize encoding presets and consider hardware acceleration
- **Monitoring**: Monitor system resources during transcoding

### Profile Validation

The system validates profiles before saving:

1. **Required Fields**: Profile name and at least one client configuration
2. **FFmpeg Arguments**: Verifies argument syntax and compatibility
3. **HLS Parameters**: Validates HLS-specific settings
4. **Resource Limits**: Checks for reasonable quality/performance settings

### Debug Tools

#### Test Arguments Generation
```http
POST /api/ffmpeg-profiles/test-args
{
  "profileId": "1",
  "clientType": "web_browser",
  "streamUrl": "http://example.com/stream.m3u8"
}
```

#### Profile Information
```http
GET /api/ffmpeg-profiles/1
```

Returns complete profile data including associated streams and client configurations.

### Logging

Profile operations are logged with detailed information:

```
INFO: Profile 'High Quality Web' created successfully
INFO: Assigned 5 streams to profile 'High Quality Web'
ERROR: FFmpeg arguments validation failed: invalid codec 'x265'
```

## Integration with PlexBridge

### Stream Manager Integration
- Profile selection dropdown in stream editing
- Profile application during stream creation
- Automatic profile assignment for M3U imports

### Backup System Integration
- Profiles included in backup exports
- Profile restoration with stream associations
- Validation during import process

### System Profiles
- Default system profiles created automatically
- Cannot be deleted or modified
- Serve as fallback when custom profiles fail

## Advanced Configuration

### Custom Client Detection
Override automatic client detection by providing User-Agent patterns:

```javascript
const customClientRules = {
  'my_custom_device': /MyDevice\/\d+\.\d+/,
  'special_browser': /SpecialBrowser\/\d+/
};
```

### Dynamic Profile Selection
Implement custom logic for profile selection based on:
- Stream characteristics (resolution, bitrate)
- Client capabilities
- Network conditions
- Time-based rules

### Profile Inheritance
Configure complex inheritance rules:
1. Stream-specific profile (highest priority)
2. Channel-specific profile
3. Default profile
4. System fallback profile (lowest priority)

## Conclusion

The FFmpeg Profiles Management System provides comprehensive control over transcoding in PlexBridge. By creating tailored profiles for different client types and use cases, you can optimize both quality and performance for your specific streaming environment.

For additional support or advanced configuration questions, refer to the PlexBridge documentation or community forums.