import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Avatar,
  Grid,
  Divider,
  LinearProgress
} from '@mui/material';
import {
  Tv as TvIcon,
  Computer as ComputerIcon,
  Smartphone as SmartphoneIcon,
  Tablet as TabletIcon,
  DesktopWindows as DesktopIcon,
  PersonPin as PersonPinIcon,
  NetworkCheck as NetworkCheckIcon,
  Timeline as TimelineIcon,
  DataUsage as DataUsageIcon,
  Speed as SpeedIcon,
  Stop as StopIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
  Devices as DevicesIcon,
  PlayCircle as PlayCircleIcon
} from '@mui/icons-material';

const SessionCard = ({
  session,
  onTerminate,
  formatDuration,
  formatBitrate,
  formatBytes
}) => {
  // Determine device type icon based on client information
  const getDeviceIcon = () => {
    const product = session.plexProduct?.toLowerCase() || '';
    const platform = session.plexPlatform?.toLowerCase() || '';
    const deviceName = session.plexDeviceName?.toLowerCase() || '';
    const clientName = session.plexClientName?.toLowerCase() || '';

    // Android TV detection
    if (product.includes('android') && product.includes('tv') ||
        platform.includes('android') && platform.includes('tv') ||
        deviceName.includes('android') && deviceName.includes('tv') ||
        clientName.includes('android') && clientName.includes('tv')) {
      return <TvIcon />;
    }

    // Mobile detection
    if (product.includes('android') || product.includes('ios') ||
        platform.includes('android') || platform.includes('ios') ||
        clientName.includes('mobile')) {
      return <SmartphoneIcon />;
    }

    // Desktop/Web detection
    if (product.includes('web') || platform.includes('web') ||
        clientName.includes('web') || platform.includes('windows') ||
        platform.includes('macos') || platform.includes('linux')) {
      return <DesktopIcon />;
    }

    // Default to computer
    return <ComputerIcon />;
  };

  // Determine device type for display
  const getDeviceType = () => {
    const product = session.plexProduct?.toLowerCase() || '';
    const platform = session.plexPlatform?.toLowerCase() || '';
    const deviceName = session.plexDeviceName?.toLowerCase() || '';
    const clientName = session.plexClientName?.toLowerCase() || '';

    if (product.includes('android') && product.includes('tv') ||
        platform.includes('android') && platform.includes('tv') ||
        deviceName.includes('android') && deviceName.includes('tv')) {
      return 'Android TV';
    }
    if (product.includes('android') || platform.includes('android')) {
      return 'Android Device';
    }
    if (product.includes('ios') || platform.includes('ios')) {
      return 'iOS Device';
    }
    if (product.includes('web') || platform.includes('web') || clientName.includes('web')) {
      return 'Web Browser';
    }
    if (platform.includes('windows')) {
      return 'Windows';
    }
    if (platform.includes('macos')) {
      return 'macOS';
    }
    if (platform.includes('linux')) {
      return 'Linux';
    }
    return session.plexProduct || session.plexPlatform || 'Unknown Device';
  };

  // Get connection quality indicator
  const getConnectionQuality = () => {
    const bitrate = session.currentBitrate || 0;
    if (bitrate > 8000000) return { label: 'Excellent', color: 'success', score: 95 };
    if (bitrate > 5000000) return { label: 'Very Good', color: 'success', score: 80 };
    if (bitrate > 3000000) return { label: 'Good', color: 'info', score: 65 };
    if (bitrate > 1000000) return { label: 'Fair', color: 'warning', score: 45 };
    if (bitrate > 0) return { label: 'Poor', color: 'error', score: 25 };
    return { label: 'No Data', color: 'default', score: 0 };
  };

  // Get user display name
  const getUserDisplayName = () => {
    return session.plexUsername || session.displayName || 'Unknown User';
  };

  // Get device display name
  const getDeviceDisplayName = () => {
    return session.plexDeviceName ||
           session.plexFriendlyName ||
           session.plexClientName ||
           session.clientHostname ||
           'Unknown Device';
  };

  // Get client application name
  const getClientAppName = () => {
    if (session.plexProduct && session.plexVersion) {
      return `${session.plexProduct} v${session.plexVersion}`;
    }
    return session.plexProduct || session.plexClientName || 'Unknown Client';
  };

  const connectionQuality = getConnectionQuality();
  const deviceType = getDeviceType();
  const deviceIcon = getDeviceIcon();

  return (
    <Card
      sx={{
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: `linear-gradient(90deg, ${
            connectionQuality.color === 'success' ? '#4caf50' :
            connectionQuality.color === 'info' ? '#2196f3' :
            connectionQuality.color === 'warning' ? '#ff9800' :
            connectionQuality.color === 'error' ? '#f44336' : '#9e9e9e'
          } 0%, rgba(255,255,255,0.2) 100%)`,
        }
      }}
    >
      <CardContent sx={{ pb: 2 }}>
        {/* Header: Channel and Status */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <TvIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                {session.channelName || 'Unknown Channel'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Channel {session.channelNumber || 'N/A'}
              </Typography>
            </Box>
          </Box>

          {/* Connection Quality Indicator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={connectionQuality.label}
              size="small"
              color={connectionQuality.color}
              sx={{ fontSize: '0.7rem', height: '20px', fontWeight: 600 }}
            />
            <Tooltip title="Terminate Session">
              <IconButton
                onClick={() => onTerminate(session)}
                size="small"
                sx={{
                  color: 'error.main',
                  '&:hover': {
                    backgroundColor: 'error.light',
                    color: 'error.dark',
                  }
                }}
              >
                <StopIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Grid container spacing={2}>
          {/* User and Device Information */}
          <Grid item xs={12} md={6}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>
                👤 User & Device
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Avatar
                  sx={{
                    bgcolor: connectionQuality.color === 'success' ? 'success.main' :
                             connectionQuality.color === 'info' ? 'info.main' :
                             connectionQuality.color === 'warning' ? 'warning.main' :
                             connectionQuality.color === 'error' ? 'error.main' : 'grey.500',
                    width: 32,
                    height: 32,
                    mr: 1.5,
                    fontSize: '0.875rem'
                  }}
                >
                  {deviceIcon}
                </Avatar>
                <Box>
                  <Typography variant="body2" fontWeight="bold">
                    {getUserDisplayName()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {getDeviceDisplayName()}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ ml: 5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  <DevicesIcon sx={{ fontSize: 10, mr: 0.5 }} />
                  {deviceType}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  <PlayCircleIcon sx={{ fontSize: 10, mr: 0.5 }} />
                  {getClientAppName()}
                </Typography>
              </Box>
            </Box>
          </Grid>

          {/* Network Information */}
          <Grid item xs={12} md={6}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>
                🌐 Network & Location
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <NetworkCheckIcon sx={{ mr: 1, color: 'info.main', fontSize: 16 }} />
                <Box>
                  <Typography variant="body2" fontWeight="bold">
                    {session.clientIP}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {session.clientHostname || session.hostname || 'Resolving hostname...'}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Grid>

          {/* Performance Metrics */}
          <Grid item xs={12}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>
                📊 Performance Metrics
              </Typography>

              <Grid container spacing={3}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5 }}>
                      <TimelineIcon sx={{ mr: 0.5, color: 'success.main', fontSize: 16 }} />
                      <Typography variant="body2" fontWeight="bold">
                        {formatDuration(session)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Duration
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: session.currentBitrate > 0 ? 'success.main' : 'grey.400',
                          mr: 0.5,
                          animation: session.currentBitrate > 0 ? 'pulse 2s infinite' : 'none'
                        }}
                      />
                      <Typography variant="body2" fontWeight="bold">
                        {formatBitrate(session.currentBitrate)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Current Bitrate
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5 }}>
                      <SpeedIcon sx={{ mr: 0.5, color: 'warning.main', fontSize: 16 }} />
                      <Typography variant="body2" fontWeight="bold">
                        {formatBitrate(session.avgBitrate || session.averageBitrate)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Avg Bitrate
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5 }}>
                      <DataUsageIcon sx={{ mr: 0.5, color: 'info.main', fontSize: 16 }} />
                      <Typography variant="body2" fontWeight="bold">
                        {formatBytes(session.bytesTransferred)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Data Used
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              {/* Connection Quality Bar */}
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Connection Quality
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {connectionQuality.score}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={connectionQuality.score}
                  color={connectionQuality.color === 'default' ? 'inherit' : connectionQuality.color}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: connectionQuality.color === 'default' ? '#9e9e9e' : undefined
                    }
                  }}
                />
              </Box>
            </Box>
          </Grid>
        </Grid>

        {/* Additional Plex Information (if available) */}
        {(session.plexPlatform || session.plexVersion) && (
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(0, 0, 0, 0.1)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              🔧 Technical Details
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {session.plexPlatform && (
                <Chip
                  label={`Platform: ${session.plexPlatform}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: '20px' }}
                />
              )}
              {session.plexVersion && (
                <Chip
                  label={`Version: ${session.plexVersion}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: '20px' }}
                />
              )}
              {session.streamType && (
                <Chip
                  label={`Stream: ${session.streamType.toUpperCase()}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: '20px' }}
                />
              )}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default SessionCard;