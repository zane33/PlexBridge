import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Grid,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Alert,
  Snackbar,
  Divider,
  Chip,
  InputAdornment,
  CircularProgress
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  RestoreFromTrash as ResetIcon
} from '@mui/icons-material';
import api, { settingsApi, settingsHelpers } from '../../services/api';
import socketService from '../../services/socket';

function Settings() {
  const [settings, setSettings] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [expandedSections, setExpandedSections] = useState({
    ssdp: true,
    streaming: false,
    transcoding: false,
    caching: false,
    device: false,
    network: false,
    compatibility: false
  });

  useEffect(() => {
    loadSettings();
    loadMetadata();

    // Join settings room for real-time updates
    socketService.emit('join-settings');

    // Listen for settings updates
    const unsubscribeSettings = socketService.on('settings:updated', (data) => {
      console.log('Received settings update via Socket.IO:', data);
      if (data.settings) {
        setSettings(data.settings);
        showSnackbar('Settings updated from another source', 'info');
      }
    });

    // Cleanup on unmount
    return () => {
      unsubscribeSettings();
    };
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await settingsApi.getSettings();
      
      // Check if we got actual settings data or fallback/error response
      let settingsData = response.data;
      
      // If the response has an error but includes fallback settings, use those
      if (settingsData.error && settingsData.plexlive) {
        console.warn('Settings API returned error but provided fallback data:', settingsData.error);
        settingsData = { plexlive: settingsData.plexlive };
      }
      
      // Merge with defaults to ensure all settings are present
      const defaults = settingsApi.getDefaults();
      const mergedSettings = settingsHelpers.mergeSettings(defaults, settingsData);
      
      setSettings(mergedSettings);
      
      console.log('Settings loaded successfully', { 
        maxConcurrentStreams: mergedSettings.plexlive?.streaming?.maxConcurrentStreams,
        hasError: !!settingsData.error
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to load settings';
      showSnackbar(errorMessage, 'error');
      
      // Fallback to defaults if loading fails
      setSettings(settingsApi.getDefaults());
    } finally {
      setLoading(false);
    }
  };

  const loadMetadata = async () => {
    try {
      const response = await settingsApi.getMetadata();
      setMetadata(response.data);
    } catch (error) {
      console.error('Failed to load settings metadata:', error);
      // Provide fallback metadata
      setMetadata({
        plexlive: {
          title: 'Plex Live TV Settings',
          description: 'Configuration options for Plex Live TV integration'
        }
      });
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      
      // Validate settings before saving
      const validation = settingsApi.validateSettings(settings);
      if (!validation.isValid) {
        const errorMessage = `Validation failed: ${validation.errors.join(', ')}`;
        showSnackbar(errorMessage, 'error');
        return;
      }
      
      const response = await settingsApi.updateSettings(settings);
      
      // Update local settings with the response from server
      if (response.data && response.data.settings) {
        setSettings(response.data.settings);
        console.log('Settings updated and reloaded from server', { 
          maxConcurrentStreams: response.data.settings.plexlive?.streaming?.maxConcurrentStreams
        });
      }
      
      showSnackbar('Settings saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      
      let errorMessage = 'Failed to save settings';
      
      if (error.response?.data?.details) {
        // Joi validation errors
        errorMessage = `Validation error: ${error.response.data.details.join(', ')}`;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showSnackbar(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = async (category = null) => {
    try {
      const confirmMessage = category 
        ? `Are you sure you want to reset the '${category}' settings to defaults?`
        : 'Are you sure you want to reset ALL settings to defaults? This action cannot be undone.';
      
      if (!window.confirm(confirmMessage)) {
        return;
      }
      
      const response = await settingsApi.resetSettings(category);
      
      // Update local settings with the response from server
      if (response.data && response.data.settings) {
        setSettings(response.data.settings);
        console.log('Settings reset and reloaded from server', { 
          maxConcurrentStreams: response.data.settings.plexlive?.streaming?.maxConcurrentStreams
        });
      } else {
        // Reload settings to reflect changes if no settings in response
        await loadSettings();
      }
      
      showSnackbar(`Settings ${category ? `category '${category}'` : ''} reset to defaults`, 'success');
    } catch (error) {
      console.error('Failed to reset settings:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to reset settings';
      showSnackbar(errorMessage, 'error');
    }
  };

  const updateSetting = (path, value) => {
    try {
      const newSettings = settingsHelpers.setSettingByPath(settings, path, value);
      setSettings(newSettings);
    } catch (error) {
      console.error('Failed to update setting:', error);
      showSnackbar(`Failed to update setting: ${path}`, 'error');
    }
  };

  const getSetting = (path, defaultValue = '') => {
    if (!settings) return defaultValue;
    return settingsHelpers.getSettingByPath(settings, path, defaultValue);
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleAccordionChange = (section) => (event, isExpanded) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: isExpanded
    }));
  };

  const formatBytes = settingsHelpers.formatBytes;
  const formatDuration = settingsHelpers.formatDuration;
  
  // Check if settings have unsaved changes
  const hasUnsavedChanges = () => {
    const defaults = settingsApi.getDefaults();
    return settingsHelpers.hasChanges(settings, defaults);
  };
  
  // Add validation feedback for individual settings
  const getFieldError = (path, value) => {
    const tempSettings = settingsHelpers.setSettingByPath(settings, path, value);
    const validation = settingsApi.validateSettings(tempSettings);
    
    if (!validation.isValid) {
      const relevantErrors = validation.errors.filter(error => 
        error.toLowerCase().includes(path.split('.').pop().toLowerCase())
      );
      return relevantErrors.length > 0 ? relevantErrors[0] : null;
    }
    
    return null;
  };

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading Settings...
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
          Please wait while we load your configuration
        </Typography>
      </Box>
    );
  }
  
  if (!settings) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="50vh">
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load settings. Please try refreshing the page.
        </Alert>
        <Button variant="contained" onClick={loadSettings}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box 
            sx={{ 
              width: 40, 
              height: 40,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 2
            }}
          >
            <SaveIcon sx={{ fontSize: 20, color: 'white' }} />
          </Box>
          <Box>
            <Typography 
              variant="h4" 
              sx={{ 
                fontWeight: 700,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.025em'
              }}
            >
              PlexBridge Settings
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'text.secondary',
                fontWeight: 500,
                display: { xs: 'none', sm: 'block' },
              }}
            >
              Configure your IPTV bridge and streaming preferences
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={loadSettings}
            variant="outlined"
            sx={{
              borderColor: 'rgba(59, 130, 246, 0.5)',
              color: '#3b82f6',
              '&:hover': {
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
              }
            }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={saving ? 
              <CircularProgress 
                size={20} 
                sx={{ color: 'white' }}
              /> : <SaveIcon />}
            onClick={saveSettings}
            disabled={saving || !settings}
            sx={{
              background: hasUnsavedChanges() 
                ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                : 'rgba(148, 163, 184, 0.3)',
              '&:hover': {
                background: hasUnsavedChanges()
                  ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                  : 'rgba(148, 163, 184, 0.3)',
              },
              '&:disabled': {
                background: 'rgba(148, 163, 184, 0.2)',
                color: 'rgba(148, 163, 184, 0.5)',
              }
            }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
        
        {hasUnsavedChanges() && (
          <Alert 
            severity="info" 
            sx={{ 
              mt: 2,
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(29, 78, 216, 0.1) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
            }}
          >
            You have unsaved changes. Don't forget to save your settings!
          </Alert>
        )}
      </Box>

      <Grid container spacing={3}>
        {/* SSDP Discovery Settings */}
        <Grid item xs={12}>
          <Accordion 
            expanded={expandedSections.ssdp} 
            onChange={handleAccordionChange('ssdp')}
            sx={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.15)',
              borderRadius: '12px !important',
              '&:before': { display: 'none' },
              boxShadow: 'none',
              mb: 2,
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="h6">SSDP Discovery</Typography>
                <Chip 
                  label={getSetting('plexlive.ssdp.enabled') ? 'Enabled' : 'Disabled'} 
                  color={getSetting('plexlive.ssdp.enabled') ? 'success' : 'default'}
                  size="small"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getSetting('plexlive.ssdp.enabled', true)}
                        onChange={(e) => updateSetting('plexlive.ssdp.enabled', e.target.checked)}
                      />
                    }
                    label="Enable SSDP Discovery"
                  />
                  <Typography variant="caption" display="block" color="textSecondary">
                    Allow Plex to automatically discover this device on the network
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Discoverable Interval"
                    type="number"
                    value={getSetting('plexlive.ssdp.discoverableInterval', 30000)}
                    onChange={(e) => updateSetting('plexlive.ssdp.discoverableInterval', parseInt(e.target.value))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">ms</InputAdornment>
                    }}
                    helperText="How often to send discovery announcements"
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Announce Interval"
                    type="number"
                    value={getSetting('plexlive.ssdp.announceInterval', 1800000)}
                    onChange={(e) => updateSetting('plexlive.ssdp.announceInterval', parseInt(e.target.value))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">ms</InputAdornment>
                    }}
                    helperText={`Interval between announcements (${formatDuration(getSetting('plexlive.ssdp.announceInterval', 1800000))})`}
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Multicast Address"
                    value={getSetting('plexlive.ssdp.multicastAddress', '239.255.255.250')}
                    onChange={(e) => updateSetting('plexlive.ssdp.multicastAddress', e.target.value)}
                    helperText="SSDP multicast address (usually 239.255.255.250)"
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Device Description"
                    value={getSetting('plexlive.ssdp.deviceDescription', 'IPTV to Plex Bridge Interface')}
                    onChange={(e) => updateSetting('plexlive.ssdp.deviceDescription', e.target.value)}
                    helperText="Description shown in device discovery"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Streaming Settings */}
        <Grid item xs={12}>
          <Accordion 
            expanded={expandedSections.streaming} 
            onChange={handleAccordionChange('streaming')}
            sx={{
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.05) 0%, rgba(244, 63, 94, 0.05) 100%)',
              border: '1px solid rgba(236, 72, 153, 0.15)',
              borderRadius: '12px !important',
              '&:before': { display: 'none' },
              boxShadow: 'none',
              mb: 2,
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="h6">Streaming</Typography>
                <Chip 
                  label={`${getSetting('plexlive.streaming.maxConcurrentStreams', 10)} max streams`}
                  color="primary"
                  size="small"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography gutterBottom>Maximum Concurrent Streams</Typography>
                  <Slider
                    value={getSetting('plexlive.streaming.maxConcurrentStreams', 10)}
                    onChange={(e, value) => updateSetting('plexlive.streaming.maxConcurrentStreams', value)}
                    min={1}
                    max={50}
                    marks
                    valueLabelDisplay="auto"
                  />
                  <Typography variant="caption" color="textSecondary">
                    Maximum number of simultaneous streams
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography gutterBottom>Maximum Concurrent Streams Per Channel</Typography>
                  <Slider
                    value={getSetting('plexlive.streaming.maxConcurrentPerChannel', 3)}
                    onChange={(e, value) => updateSetting('plexlive.streaming.maxConcurrentPerChannel', value)}
                    min={1}
                    max={10}
                    marks
                    valueLabelDisplay="auto"
                  />
                  <Typography variant="caption" color="textSecondary">
                    Maximum simultaneous streams per individual channel
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Stream Timeout"
                    type="number"
                    value={getSetting('plexlive.streaming.streamTimeout', 30000)}
                    onChange={(e) => updateSetting('plexlive.streaming.streamTimeout', parseInt(e.target.value))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">ms</InputAdornment>
                    }}
                    helperText={`Connection timeout (${formatDuration(getSetting('plexlive.streaming.streamTimeout', 30000))})`}
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Reconnect Attempts"
                    type="number"
                    value={getSetting('plexlive.streaming.reconnectAttempts', 3)}
                    onChange={(e) => updateSetting('plexlive.streaming.reconnectAttempts', parseInt(e.target.value))}
                    helperText="Number of reconnection attempts on failure"
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Buffer Size"
                    type="number"
                    value={getSetting('plexlive.streaming.bufferSize', 65536)}
                    onChange={(e) => updateSetting('plexlive.streaming.bufferSize', parseInt(e.target.value))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">bytes</InputAdornment>
                    }}
                    helperText={`Stream buffer size (${formatBytes(getSetting('plexlive.streaming.bufferSize', 65536))})`}
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getSetting('plexlive.streaming.adaptiveBitrate', true)}
                        onChange={(e) => updateSetting('plexlive.streaming.adaptiveBitrate', e.target.checked)}
                      />
                    }
                    label="Adaptive Bitrate"
                  />
                  <Typography variant="caption" display="block" color="textSecondary">
                    Automatically adjust quality based on network conditions
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Preferred Protocol</InputLabel>
                    <Select
                      value={getSetting('plexlive.streaming.preferredProtocol', 'hls')}
                      onChange={(e) => updateSetting('plexlive.streaming.preferredProtocol', e.target.value)}
                      label="Preferred Protocol"
                    >
                      <MenuItem value="hls">HLS (HTTP Live Streaming)</MenuItem>
                      <MenuItem value="dash">DASH (Dynamic Adaptive Streaming)</MenuItem>
                      <MenuItem value="rtsp">RTSP (Real Time Streaming Protocol)</MenuItem>
                      <MenuItem value="rtmp">RTMP (Real Time Messaging Protocol)</MenuItem>
                      <MenuItem value="udp">UDP (User Datagram Protocol)</MenuItem>
                      <MenuItem value="http">HTTP (Hypertext Transfer Protocol)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Transcoding Settings */}
        <Grid item xs={12}>
          <Accordion 
            expanded={expandedSections.transcoding} 
            onChange={handleAccordionChange('transcoding')}
            sx={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.05) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              borderRadius: '12px !important',
              '&:before': { display: 'none' },
              boxShadow: 'none',
              mb: 2,
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="h6">Transcoding</Typography>
                <Chip 
                  label={getSetting('plexlive.transcoding.enabled') ? 'Enabled' : 'Disabled'} 
                  color={getSetting('plexlive.transcoding.enabled') ? 'success' : 'default'}
                  size="small"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getSetting('plexlive.transcoding.enabled', true)}
                        onChange={(e) => updateSetting('plexlive.transcoding.enabled', e.target.checked)}
                      />
                    }
                    label="Enable Transcoding"
                  />
                  <Typography variant="caption" display="block" color="textSecondary">
                    Convert streams to formats compatible with Plex
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getSetting('plexlive.transcoding.hardwareAcceleration', false)}
                        onChange={(e) => updateSetting('plexlive.transcoding.hardwareAcceleration', e.target.checked)}
                      />
                    }
                    label="Hardware Acceleration"
                  />
                  <Typography variant="caption" display="block" color="textSecondary">
                    Use GPU for faster transcoding (requires compatible hardware)
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Transcoding Preset</InputLabel>
                    <Select
                      value={getSetting('plexlive.transcoding.preset', 'medium')}
                      onChange={(e) => updateSetting('plexlive.transcoding.preset', e.target.value)}
                      label="Transcoding Preset"
                    >
                      <MenuItem value="ultrafast">Ultra Fast (lowest quality)</MenuItem>
                      <MenuItem value="superfast">Super Fast</MenuItem>
                      <MenuItem value="veryfast">Very Fast</MenuItem>
                      <MenuItem value="faster">Faster</MenuItem>
                      <MenuItem value="fast">Fast</MenuItem>
                      <MenuItem value="medium">Medium (balanced)</MenuItem>
                      <MenuItem value="slow">Slow</MenuItem>
                      <MenuItem value="slower">Slower</MenuItem>
                      <MenuItem value="veryslow">Very Slow (highest quality)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Video Codec</InputLabel>
                    <Select
                      value={getSetting('plexlive.transcoding.videoCodec', 'h264')}
                      onChange={(e) => updateSetting('plexlive.transcoding.videoCodec', e.target.value)}
                      label="Video Codec"
                    >
                      <MenuItem value="h264">H.264 (most compatible)</MenuItem>
                      <MenuItem value="h265">H.265/HEVC (better compression)</MenuItem>
                      <MenuItem value="vp8">VP8</MenuItem>
                      <MenuItem value="vp9">VP9</MenuItem>
                      <MenuItem value="av1">AV1 (newest)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Audio Codec</InputLabel>
                    <Select
                      value={getSetting('plexlive.transcoding.audioCodec', 'aac')}
                      onChange={(e) => updateSetting('plexlive.transcoding.audioCodec', e.target.value)}
                      label="Audio Codec"
                    >
                      <MenuItem value="aac">AAC (recommended)</MenuItem>
                      <MenuItem value="mp3">MP3</MenuItem>
                      <MenuItem value="ac3">AC-3 (Dolby Digital)</MenuItem>
                      <MenuItem value="opus">Opus</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom>Quality Profiles</Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" color="primary">Low Quality</Typography>
                      <TextField
                        fullWidth
                        label="Resolution"
                        value={getSetting('plexlive.transcoding.qualityProfiles.low.resolution', '720x480')}
                        onChange={(e) => updateSetting('plexlive.transcoding.qualityProfiles.low.resolution', e.target.value)}
                        size="small"
                        sx={{ mt: 1, mb: 1 }}
                      />
                      <TextField
                        fullWidth
                        label="Bitrate"
                        value={getSetting('plexlive.transcoding.qualityProfiles.low.bitrate', '1000k')}
                        onChange={(e) => updateSetting('plexlive.transcoding.qualityProfiles.low.bitrate', e.target.value)}
                        size="small"
                      />
                    </CardContent>
                  </Card>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" color="primary">Medium Quality</Typography>
                      <TextField
                        fullWidth
                        label="Resolution"
                        value={getSetting('plexlive.transcoding.qualityProfiles.medium.resolution', '1280x720')}
                        onChange={(e) => updateSetting('plexlive.transcoding.qualityProfiles.medium.resolution', e.target.value)}
                        size="small"
                        sx={{ mt: 1, mb: 1 }}
                      />
                      <TextField
                        fullWidth
                        label="Bitrate"
                        value={getSetting('plexlive.transcoding.qualityProfiles.medium.bitrate', '2500k')}
                        onChange={(e) => updateSetting('plexlive.transcoding.qualityProfiles.medium.bitrate', e.target.value)}
                        size="small"
                      />
                    </CardContent>
                  </Card>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" color="primary">High Quality</Typography>
                      <TextField
                        fullWidth
                        label="Resolution"
                        value={getSetting('plexlive.transcoding.qualityProfiles.high.resolution', '1920x1080')}
                        onChange={(e) => updateSetting('plexlive.transcoding.qualityProfiles.high.resolution', e.target.value)}
                        size="small"
                        sx={{ mt: 1, mb: 1 }}
                      />
                      <TextField
                        fullWidth
                        label="Bitrate"
                        value={getSetting('plexlive.transcoding.qualityProfiles.high.bitrate', '5000k')}
                        onChange={(e) => updateSetting('plexlive.transcoding.qualityProfiles.high.bitrate', e.target.value)}
                        size="small"
                      />
                    </CardContent>
                  </Card>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Default Profile</InputLabel>
                    <Select
                      value={getSetting('plexlive.transcoding.defaultProfile', 'medium')}
                      onChange={(e) => updateSetting('plexlive.transcoding.defaultProfile', e.target.value)}
                      label="Default Profile"
                    >
                      <MenuItem value="low">Low Quality</MenuItem>
                      <MenuItem value="medium">Medium Quality</MenuItem>
                      <MenuItem value="high">High Quality</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Caching Settings */}
        <Grid item xs={12}>
          <Accordion 
            expanded={expandedSections.caching} 
            onChange={handleAccordionChange('caching')}
            sx={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(217, 119, 6, 0.05) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.15)',
              borderRadius: '12px !important',
              '&:before': { display: 'none' },
              boxShadow: 'none',
              mb: 2,
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="h6">Caching</Typography>
                <Chip 
                  label={getSetting('plexlive.caching.enabled') ? 'Enabled' : 'Disabled'} 
                  color={getSetting('plexlive.caching.enabled') ? 'success' : 'default'}
                  size="small"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getSetting('plexlive.caching.enabled', true)}
                        onChange={(e) => updateSetting('plexlive.caching.enabled', e.target.checked)}
                      />
                    }
                    label="Enable Stream Caching"
                  />
                  <Typography variant="caption" display="block" color="textSecondary">
                    Cache stream data to improve performance and reduce bandwidth
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Cache Duration"
                    type="number"
                    value={getSetting('plexlive.caching.duration', 3600)}
                    onChange={(e) => updateSetting('plexlive.caching.duration', parseInt(e.target.value))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">seconds</InputAdornment>
                    }}
                    helperText={`How long to cache streams (${formatDuration(getSetting('plexlive.caching.duration', 3600) * 1000)})`}
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Maximum Cache Size"
                    type="number"
                    value={getSetting('plexlive.caching.maxSize', 1073741824)}
                    onChange={(e) => updateSetting('plexlive.caching.maxSize', parseInt(e.target.value))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">bytes</InputAdornment>
                    }}
                    helperText={`Maximum cache size (${formatBytes(getSetting('plexlive.caching.maxSize', 1073741824))})`}
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom>Cache Cleanup</Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getSetting('plexlive.caching.cleanup.enabled', true)}
                        onChange={(e) => updateSetting('plexlive.caching.cleanup.enabled', e.target.checked)}
                      />
                    }
                    label="Auto Cleanup"
                  />
                  <Typography variant="caption" display="block" color="textSecondary">
                    Automatically clean up old cache files
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Cleanup Interval"
                    type="number"
                    value={getSetting('plexlive.caching.cleanup.interval', 3600000)}
                    onChange={(e) => updateSetting('plexlive.caching.cleanup.interval', parseInt(e.target.value))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">ms</InputAdornment>
                    }}
                    helperText={`Run cleanup every ${formatDuration(getSetting('plexlive.caching.cleanup.interval', 3600000))}`}
                  />
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Maximum Age"
                    type="number"
                    value={getSetting('plexlive.caching.cleanup.maxAge', 86400000)}
                    onChange={(e) => updateSetting('plexlive.caching.cleanup.maxAge', parseInt(e.target.value))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">ms</InputAdornment>
                    }}
                    helperText={`Delete files older than ${formatDuration(getSetting('plexlive.caching.cleanup.maxAge', 86400000))}`}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Device Settings */}
        <Grid item xs={12}>
          <Accordion 
            expanded={expandedSections.device} 
            onChange={handleAccordionChange('device')}
            sx={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(29, 78, 216, 0.05) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.15)',
              borderRadius: '12px !important',
              '&:before': { display: 'none' },
              boxShadow: 'none',
              mb: 2,
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="h6">Device Information</Typography>
                <Chip 
                  label={getSetting('plexlive.device.name', 'PlexTV')}
                  color="info"
                  size="small"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Device Name"
                    value={getSetting('plexlive.device.name', 'PlexTV')}
                    onChange={(e) => updateSetting('plexlive.device.name', e.target.value)}
                    helperText="Name displayed in Plex"
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Device ID"
                    value={getSetting('plexlive.device.id', 'PLEXTV001')}
                    onChange={(e) => updateSetting('plexlive.device.id', e.target.value)}
                    helperText="Unique identifier for this device"
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography gutterBottom>Virtual Tuner Count</Typography>
                  <Slider
                    value={getSetting('plexlive.device.tunerCount', 4)}
                    onChange={(e, value) => updateSetting('plexlive.device.tunerCount', value)}
                    min={1}
                    max={32}
                    marks
                    valueLabelDisplay="auto"
                  />
                  <Typography variant="caption" color="textSecondary">
                    Number of simultaneous recordings/streams supported
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Firmware Version"
                    value={getSetting('plexlive.device.firmware', '1.0.0')}
                    onChange={(e) => updateSetting('plexlive.device.firmware', e.target.value)}
                    helperText="Version reported to Plex"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Base URL"
                    value={getSetting('plexlive.device.baseUrl', 'http://localhost:8080')}
                    onChange={(e) => updateSetting('plexlive.device.baseUrl', e.target.value)}
                    helperText="Base URL for device services (leave default unless needed)"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Network Settings */}
        <Grid item xs={12}>
          <Accordion 
            expanded={expandedSections.network} 
            onChange={handleAccordionChange('network')}
            sx={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(124, 58, 237, 0.05) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.15)',
              borderRadius: '12px !important',
              '&:before': { display: 'none' },
              boxShadow: 'none',
              mb: 2,
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="h6">Network</Typography>
                <Chip 
                  label={`Port ${getSetting('plexlive.network.streamingPort', 8080)}`}
                  color="secondary"
                  size="small"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Bind Address"
                    value={getSetting('plexlive.network.bindAddress', '0.0.0.0')}
                    onChange={(e) => updateSetting('plexlive.network.bindAddress', e.target.value)}
                    helperText="IP address to bind to (0.0.0.0 for all interfaces)"
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Advertised Host"
                    value={getSetting('plexlive.network.advertisedHost', '') || ''}
                    onChange={(e) => updateSetting('plexlive.network.advertisedHost', e.target.value || null)}
                    helperText="Host advertised to clients (auto-detect if empty)"
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Streaming Port"
                    type="number"
                    value={getSetting('plexlive.network.streamingPort', 8080)}
                    onChange={(e) => updateSetting('plexlive.network.streamingPort', parseInt(e.target.value))}
                    helperText="Port for streaming services"
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Discovery Port"
                    type="number"
                    value={getSetting('plexlive.network.discoveryPort', 1900)}
                    onChange={(e) => updateSetting('plexlive.network.discoveryPort', parseInt(e.target.value))}
                    helperText="Port for SSDP discovery"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getSetting('plexlive.network.ipv6Enabled', false)}
                        onChange={(e) => updateSetting('plexlive.network.ipv6Enabled', e.target.checked)}
                      />
                    }
                    label="Enable IPv6"
                  />
                  <Typography variant="caption" display="block" color="textSecondary">
                    Enable IPv6 support for network operations
                  </Typography>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Compatibility Settings */}
        <Grid item xs={12}>
          <Accordion 
            expanded={expandedSections.compatibility} 
            onChange={handleAccordionChange('compatibility')}
            sx={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(220, 38, 38, 0.05) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
              borderRadius: '12px !important',
              '&:before': { display: 'none' },
              boxShadow: 'none',
              mb: 2,
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="h6">Compatibility</Typography>
                <Chip 
                  label={getSetting('plexlive.compatibility.hdHomeRunMode') ? 'HDHomeRun Mode' : 'Generic Mode'}
                  color={getSetting('plexlive.compatibility.hdHomeRunMode') ? 'success' : 'default'}
                  size="small"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getSetting('plexlive.compatibility.hdHomeRunMode', true)}
                        onChange={(e) => updateSetting('plexlive.compatibility.hdHomeRunMode', e.target.checked)}
                      />
                    }
                    label="HDHomeRun Compatibility Mode"
                  />
                  <Typography variant="caption" display="block" color="textSecondary">
                    Emulate HDHomeRun device for better Plex compatibility
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getSetting('plexlive.compatibility.plexPassRequired', false)}
                        onChange={(e) => updateSetting('plexlive.compatibility.plexPassRequired', e.target.checked)}
                      />
                    }
                    label="Require Plex Pass"
                  />
                  <Typography variant="caption" display="block" color="textSecondary">
                    Restrict access to Plex Pass subscribers only
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Grace Period"
                    type="number"
                    value={getSetting('plexlive.compatibility.gracePeriod', 10000)}
                    onChange={(e) => updateSetting('plexlive.compatibility.gracePeriod', parseInt(e.target.value))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">ms</InputAdornment>
                    }}
                    helperText={`Stream startup grace period (${formatDuration(getSetting('plexlive.compatibility.gracePeriod', 10000))})`}
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getSetting('plexlive.compatibility.channelLogoFallback', true)}
                        onChange={(e) => updateSetting('plexlive.compatibility.channelLogoFallback', e.target.checked)}
                      />
                    }
                    label="Channel Logo Fallback"
                  />
                  <Typography variant="caption" display="block" color="textSecondary">
                    Use fallback logos when channel logos are missing
                  </Typography>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        <Grid item xs={12}>
          <Box display="flex" gap={2} flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<ResetIcon />}
              onClick={() => resetSettings('plexlive')}
              sx={{
                borderColor: 'rgba(245, 158, 11, 0.5)',
                color: '#f59e0b',
                '&:hover': {
                  borderColor: '#f59e0b',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                }
              }}
            >
              Reset Plex Live TV Settings
            </Button>
            <Button
              variant="outlined"
              startIcon={<ResetIcon />}
              onClick={() => resetSettings()}
              sx={{
                borderColor: 'rgba(239, 68, 68, 0.5)',
                color: '#ef4444',
                '&:hover': {
                  borderColor: '#ef4444',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                }
              }}
            >
              Reset All Settings to Defaults
            </Button>
          </Box>
          <Typography variant="caption" display="block" color="textSecondary" sx={{ mt: 1 }}>
            Warning: Resetting settings will restore all values to their defaults and cannot be undone.
          </Typography>
        </Grid>
      </Grid>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Settings;
