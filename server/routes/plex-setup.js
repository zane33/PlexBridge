const express = require('express');
const router = express.Router();
const os = require('os');
const config = require('../config');

// Plex setup information endpoint
router.get('/plex-setup', (req, res) => {
  try {
    // Get local IP for URLs
    const networkInterfaces = os.networkInterfaces();
    let localIP = '127.0.0.1';
    
    for (const interfaceName in networkInterfaces) {
      const addresses = networkInterfaces[interfaceName];
      for (const address of addresses) {
        if (address.family === 'IPv4' && !address.internal) {
          localIP = address.address;
          break;
        }
      }
      if (localIP !== '127.0.0.1') break;
    }

    const hostHeader = req.get('host') || `${localIP}:${config.server.port}`;
    const baseURL = `http://${hostHeader}`;
    
    const setupInfo = {
      device: {
        name: 'PlexBridge HDHomeRun Emulator',
        ip: localIP,
        port: config.server.port,
        discoveryURL: `${baseURL}/discover.json`
      },
      epg: {
        xmltvURL: `${baseURL}/epg/xmltv.xml`,
        description: 'XMLTV Electronic Program Guide',
        updateInterval: '4 hours',
        daysAvailable: 7
      },
      setup: {
        steps: [
          'Open Plex and go to Settings > Live TV & DVR',
          'Click "Set up Plex DVR"',
          'Plex should automatically discover PlexBridge as an HDHomeRun device',
          'If not found automatically, click "Don\'t see your HDHomeRun device?" and enter the IP address manually',
          'Complete the channel scan',
          'When prompted for EPG/Guide data, select "Use XMLTV"',
          `Enter the XMLTV URL: ${baseURL}/epg/xmltv.xml`,
          'Complete the setup and enjoy your channels!'
        ],
        troubleshooting: [
          `If device discovery fails, manually enter IP: ${localIP}`,
          'Ensure PlexBridge and Plex are on the same network',
          'Check that no firewall is blocking port ' + config.server.port,
          'Verify EPG sources are configured in PlexBridge settings'
        ]
      }
    };

    res.json(setupInfo);
  } catch (error) {
    res.status(500).json({ error: 'Setup information failed', message: error.message });
  }
});

// Plex setup web page
router.get('/plex-setup.html', (req, res) => {
  try {
    // Get local IP for URLs
    const networkInterfaces = os.networkInterfaces();
    let localIP = '127.0.0.1';
    
    for (const interfaceName in networkInterfaces) {
      const addresses = networkInterfaces[interfaceName];
      for (const address of addresses) {
        if (address.family === 'IPv4' && !address.internal) {
          localIP = address.address;
          break;
        }
      }
      if (localIP !== '127.0.0.1') break;
    }

    const hostHeader = req.get('host') || `${localIP}:${config.server.port}`;
    const baseURL = `http://${hostHeader}`;
    const xmltvURL = `${baseURL}/epg/xmltv.xml`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PlexBridge - Plex Setup Guide</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 10px;
        }
        .url-box {
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            font-family: monospace;
            font-size: 16px;
            text-align: center;
            position: relative;
        }
        .copy-button {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            background: #007bff;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .copy-button:hover {
            background: #0056b3;
        }
        .step {
            background: #fff;
            border-left: 4px solid #007bff;
            padding: 15px;
            margin: 15px 0;
            border-radius: 0 8px 8px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .step-number {
            background: #007bff;
            color: white;
            border-radius: 50%;
            width: 25px;
            height: 25px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            margin-right: 10px;
            font-size: 14px;
        }
        .highlight {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
        }
        .success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
        }
        .troubleshooting {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .device-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin: 20px 0;
        }
        .info-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #dee2e6;
        }
        .info-label {
            font-weight: bold;
            color: #495057;
            margin-bottom: 5px;
        }
        .info-value {
            font-family: monospace;
            color: #007bff;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎭 PlexBridge Setup Guide</h1>
        <p>Complete guide for setting up PlexBridge with Plex Media Server</p>
    </div>

    <div class="success">
        <strong>✅ PlexBridge is running!</strong> Your HDHomeRun emulator is ready for Plex integration.
    </div>

    <h2>📺 Device Information</h2>
    <div class="device-info">
        <div class="info-card">
            <div class="info-label">Device IP Address</div>
            <div class="info-value">${localIP}</div>
        </div>
        <div class="info-card">
            <div class="info-label">Port</div>
            <div class="info-value">${config.server.port}</div>
        </div>
        <div class="info-card">
            <div class="info-label">Discovery URL</div>
            <div class="info-value">${baseURL}/discover.json</div>
        </div>
        <div class="info-card">
            <div class="info-label">XMLTV EPG URL</div>
            <div class="info-value">${xmltvURL}</div>
        </div>
    </div>

    <h2>📋 Plex Setup Steps</h2>

    <div class="step">
        <span class="step-number">1</span>
        <strong>Open Plex DVR Setup</strong><br>
        Go to Plex Settings → Live TV & DVR → "Set up Plex DVR"
    </div>

    <div class="step">
        <span class="step-number">2</span>
        <strong>Device Discovery</strong><br>
        Plex should automatically discover "PlexBridge" as an HDHomeRun device
        <div class="highlight">
            If not found automatically, click "Don't see your HDHomeRun device?" and enter: <strong>${localIP}</strong>
        </div>
    </div>

    <div class="step">
        <span class="step-number">3</span>
        <strong>Channel Scan</strong><br>
        Complete the channel scan process. Plex will discover all available channels.
    </div>

    <div class="step">
        <span class="step-number">4</span>
        <strong>EPG Configuration</strong><br>
        When prompted for Guide/EPG data:
        <ol>
            <li>Select <strong>"Use XMLTV"</strong> as the guide source</li>
            <li>Enter the XMLTV URL below:</li>
        </ol>
    </div>

    <div class="url-box" id="xmltv-url">
        ${xmltvURL}
        <button class="copy-button" onclick="copyToClipboard('${xmltvURL}')">Copy</button>
    </div>

    <div class="step">
        <span class="step-number">5</span>
        <strong>Complete Setup</strong><br>
        Finish the Plex DVR setup and enjoy your channels with full EPG data!
    </div>

    <h2>🔧 Troubleshooting</h2>
    <div class="troubleshooting">
        <h3>Common Issues:</h3>
        <ul>
            <li><strong>Device not discovered:</strong> Manually enter IP address <code>${localIP}</code></li>
            <li><strong>Connection failed:</strong> Ensure Plex and PlexBridge are on the same network</li>
            <li><strong>Port blocked:</strong> Check firewall settings for port ${config.server.port}</li>
            <li><strong>No EPG data:</strong> Verify EPG sources are configured in PlexBridge settings</li>
            <li><strong>Channels missing:</strong> Check that streams are enabled in PlexBridge Channel Manager</li>
        </ul>
    </div>

    <h2>📊 Verification</h2>
    <p>Test these URLs to verify everything is working:</p>
    <ul>
        <li><a href="${baseURL}/discover.json" target="_blank">Device Discovery</a></li>
        <li><a href="${baseURL}/lineup.json" target="_blank">Channel Lineup</a></li>
        <li><a href="${baseURL}/epg/xmltv.xml" target="_blank">XMLTV EPG Data</a></li>
        <li><a href="${baseURL}/health" target="_blank">Health Check</a></li>
    </ul>

    <script>
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                button.style.background = '#28a745';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '#007bff';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy:', err);
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            });
        }
    </script>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
});

module.exports = router;