# Device Name Fix Summary

## Problem
The tuner name in Plex was stuck on "PlexTV Development" despite changing the Device Name in settings and saving it.

## Root Cause
The SSDP service was using static configuration values (`config.ssdp.friendlyName`) instead of dynamically fetching the device name from the database settings.

## Solution

### 1. **Updated SSDP Service** (`server/services/ssdpService.js`)
- Modified `generateDeviceDescription()` and `generateDiscoveryResponse()` to be async and fetch device name from settings
- Added fallback methods `generateStaticDeviceDescription()` and `generateStaticDiscoveryResponse()` for error cases
- Enhanced `refreshDevice()` method to restart SSDP service with updated settings

### 2. **Updated SSDP Routes** (`server/routes/ssdp.js`)
- Changed route handlers to async to support the new async SSDP methods
- Updated `/discover.json`, `/device.xml`, and `/auto/:device` endpoints

### 3. **Updated Settings Service** (`server/services/settingsService.js`)
- Added SSDP refresh logic to `applySettingsToServices()` method
- When device settings change, the SSDP service is automatically refreshed

### 4. **Added Default Device Name Setting** (`server/services/database.js`)
- Added `plexlive.device.name` to default settings with value "PlexBridge HDHomeRun"
- This ensures the setting exists for new installations

## How It Works Now

1. **Initial Load**: SSDP service reads device name from database settings on startup
2. **Settings Update**: When user changes device name in web interface:
   - Settings are saved to database
   - `applySettingsToServices()` is called
   - SSDP service is refreshed with new device name
   - Plex sees the updated device name on next discovery

## Testing

Use the provided test script to verify the fix:

```bash
node test-ssdp.js
```

This script will:
- Check current device name in SSDP endpoints
- Update the device name via settings API
- Verify the change is reflected in SSDP endpoints

## Key Files Modified

- `server/services/ssdpService.js` - Dynamic device name fetching
- `server/routes/ssdp.js` - Async route handlers  
- `server/services/settingsService.js` - SSDP refresh on settings change
- `server/services/database.js` - Default device name setting

## Result

The device name in Plex will now update immediately when changed in the PlexBridge settings interface, without requiring a restart.