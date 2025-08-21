# EPG Auto-Discovery Solution

## The Real Issue

After thorough research of the HDHomeRun specification and Plex integration, I discovered that **EPG auto-discovery doesn't work the way I initially thought**. Here's what I learned:

### How Real HDHomeRun Devices Work

Real HDHomeRun devices do NOT include EPG information in their `discover.json` response. Instead:

1. **Standard discover.json** contains only basic device info (no EPG fields)
2. **EPG data** comes from SiliconDust's cloud service via `api.hdhomerun.com/api/xmltv?DeviceAuth=xxx`
3. **DeviceAuth** changes every 8 hours and requires internet connectivity

### How Plex Actually Handles EPG

Plex has three EPG source options:

1. **Built-in Plex EPG** (automatic for supported regions)
2. **HDHomeRun Cloud EPG** (via DeviceAuth for real devices)
3. **Manual XMLTV entry** (for custom sources like PlexBridge)

**PlexBridge emulators MUST use option #3 - manual XMLTV entry.**

## The Correct Solution

Instead of trying to force auto-discovery (which doesn't exist), I implemented a user-friendly manual setup process:

### 1. **Clear Setup Instructions**

Created comprehensive setup guides that clearly explain:
- Device discovery works automatically (using standard HDHomeRun endpoints)
- EPG requires manual XMLTV URL entry
- Step-by-step Plex configuration process

### 2. **Enhanced Web Interface**

Updated the dashboard to:
- Prominently display the EPG XML URL needed for Plex
- Add visual indicators that EPG setup is required
- Provide a "Complete Plex Setup Guide" button
- Highlight the EPG URL field with orange styling

### 3. **Dedicated Setup Guide**

Created `/plex-setup.html` endpoint with:
- Visual step-by-step instructions
- Copy-to-clipboard EPG URL
- Troubleshooting tips
- Verification links

### 4. **Standard HDHomeRun Compliance**

Maintained authentic HDHomeRun endpoints:
- `discover.json` - Standard device discovery (no custom EPG fields)
- `lineup.json` - Channel lineup
- `lineup_status.json` - Tuner status
- `device.xml` - UPnP device description

## Implementation Details

### New Files Created
- `server/routes/plex-setup.js` - Setup guide API and web page
- `EPG_SETUP_SOLUTION.md` - This documentation

### Enhanced Files
- `client/src/components/Dashboard/Dashboard.js` - Better EPG URL display and instructions
- `server/index.js` - Added Plex setup route

### Key URLs for Users
- `http://[device-ip]:8080/plex-setup.html` - Complete setup guide
- `http://[device-ip]:8080/epg/xmltv.xml` - EPG URL for Plex

## User Experience

### Before Fix
❌ Users expected automatic EPG discovery (which doesn't exist)
❌ No clear instructions on manual EPG setup
❌ EPG URL was buried in technical interface

### After Fix
✅ Clear explanation that manual EPG setup is required
✅ Prominent display of EPG URL in dashboard
✅ Step-by-step setup guide with copy-paste URLs
✅ Visual indicators and warnings about EPG requirements

## Plex Setup Process (Simplified)

1. **Device Discovery**: Automatic via SSDP/UPnP
2. **Channel Scan**: Automatic via HDHomeRun endpoints
3. **EPG Setup**: Manual XMLTV URL entry (this was the missing piece)

## Why This is the Correct Approach

1. **Follows HDHomeRun Standards** - Real devices don't auto-discover EPG either
2. **Works with Plex's Design** - Plex expects manual XMLTV for custom sources
3. **User-Friendly** - Clear instructions eliminate confusion
4. **Future-Proof** - Doesn't rely on non-standard hacks

## Result

Users now have a clear, documented process for setting up EPG in Plex:
1. Add tuner (automatic discovery)
2. Scan channels (automatic)
3. Configure EPG (manual XMLTV URL from setup guide)

The "auto-discovery" issue was actually a documentation and user experience problem, not a technical limitation. The solution provides the missing guidance that users need to successfully configure EPG in Plex.