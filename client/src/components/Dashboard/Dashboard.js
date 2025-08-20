import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useTheme,
  useMediaQuery,
  Alert,
  Skeleton,
  IconButton,
  TextField,
  InputAdornment,
  Tooltip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Button,
  Collapse,
} from '@mui/material';
import {
  Stream as StreamIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Storage as StorageIcon,
  Refresh as RefreshIcon,
  Error as ErrorIcon,
  ContentCopy as CopyIcon,
  Tv as TvIcon,
  Router as RouterIcon,
  Public as PublicIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Star as StarIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip as ChartTooltip, Legend, ArcElement } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { format } from 'date-fns';
import api from '../../services/api';
import socketService from '../../services/socket';
import { useSnackbar } from 'notistack';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend, ArcElement);

function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [activeStreams, setActiveStreams] = useState([]);
  const [serverInfo, setServerInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdditionalUrls, setShowAdditionalUrls] = useState(false);
  const [currentSettings, setCurrentSettings] = useState(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { enqueueSnackbar } = useSnackbar();

  // Add pulse animation styles
  const pulseKeyframes = `
    @keyframes pulse {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.2);
        opacity: 0.7;
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }
  `;

  // Inject styles
  if (typeof document !== 'undefined') {
    let styleSheet = document.getElementById('dashboard-styles');
    if (!styleSheet) {
      styleSheet = document.createElement('style');
      styleSheet.id = 'dashboard-styles';
      styleSheet.innerHTML = pulseKeyframes;
      document.head.appendChild(styleSheet);
    }
  }

  useEffect(() => {
    fetchMetrics();
    fetchActiveStreams();
    fetchServerInfo();
    fetchCurrentSettings();
    
    // Set up real-time updates via Socket.IO
    const unsubscribeMetrics = socketService.on('metrics:update', (data) => {
      setMetrics(data);
    });

    const unsubscribeStreamStart = socketService.on('stream:started', () => {
      fetchActiveStreams();
    });

    const unsubscribeStreamStop = socketService.on('stream:stopped', () => {
      fetchActiveStreams();
    });

    const unsubscribeBandwidthUpdate = socketService.on('streams:bandwidth:update', (data) => {
      // Update active streams with real-time bandwidth data
      if (data.streams && data.streams.length > 0) {
        setActiveStreams(prevStreams => {
          return prevStreams.map(stream => {
            const updatedStream = data.streams.find(s => s.sessionId === stream.sessionId);
            if (updatedStream) {
              return {
                ...stream,
                currentBitrate: updatedStream.currentBitrate,
                avgBitrate: updatedStream.avgBitrate,
                peakBitrate: updatedStream.peakBitrate,
                bytesTransferred: updatedStream.bytesTransferred,
                duration: updatedStream.duration
              };
            }
            return stream;
          });
        });
      }
    });
    
    // Fallback polling for when socket is not connected
    const interval = setInterval(() => {
      if (!socketService.isConnected()) {
        fetchMetrics();
        fetchActiveStreams();
      }
    }, 30000); // Update every 30 seconds

    const unsubscribeSettingsChange = socketService.on('settings:changed', (data) => {
      console.log('Settings changed, refreshing metrics:', data);
      fetchMetrics(); // Refresh metrics when settings change
    });

    const unsubscribeSettingsUpdate = socketService.on('settings:updated', (data) => {
      if (data.settings) {
        setCurrentSettings(data.settings);
        console.log('Dashboard received settings update:', data.settings.plexlive?.streaming?.maxConcurrentStreams);
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribeMetrics();
      unsubscribeStreamStart();
      unsubscribeStreamStop();
      unsubscribeBandwidthUpdate();
      unsubscribeSettingsChange();
      unsubscribeSettingsUpdate();
    };
  }, []);

  const fetchMetrics = async () => {
    try {
      setError(null);
      const response = await api.get('/api/metrics');
      setMetrics(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      setError('Failed to load system metrics. Please check your connection.');
      setLoading(false);
    }
  };

  const fetchActiveStreams = async () => {
    try {
      const response = await api.get('/streams/active');
      setActiveStreams(response.data.streams || []);
    } catch (error) {
      console.error('Failed to fetch active streams:', error);
      // Set empty array as fallback - this is expected when there are no active streams
      setActiveStreams([]);
    }
  };

  const fetchServerInfo = async () => {
    try {
      const response = await api.get('/api/server/info');
      setServerInfo(response.data);
    } catch (error) {
      console.error('Failed to fetch server info:', error);
      
      // Provide fallback server information when API fails
      const fallbackServerInfo = {
        hostname: 'plextv-container',
        platform: 'linux',
        arch: 'x64',
        nodeVersion: 'v18.20.8',
        port: 8080,
        baseUrl: `${window.location.protocol}//${window.location.host}`,
        ipAddresses: [
          {
            interface: 'eth0',
            address: window.location.hostname || 'localhost',
            netmask: '255.255.255.0'
          }
        ],
        urls: {
          webInterface: `${window.location.protocol}//${window.location.host}`,
          m3uPlaylist: `${window.location.protocol}//${window.location.host}/playlist.m3u`,
          epgXml: `${window.location.protocol}//${window.location.host}/epg/xmltv`,
          tunerDiscovery: `${window.location.protocol}//${window.location.host}/device.xml`,
          channelLineup: `${window.location.protocol}//${window.location.host}/lineup.json`
        },
        tuner: {
          deviceType: 'SiliconDust HDHomeRun',
          friendlyName: 'PlexTV Bridge',
          manufacturer: 'PlexTV Bridge',
          modelName: 'PlexTV Bridge',
          deviceId: 'PLEXTV001',
          firmwareVersion: '1.0.0'
        }
      };
      
      setServerInfo(fallbackServerInfo);
    }
  };

  const fetchCurrentSettings = async () => {
    try {
      const response = await api.get('/api/settings');
      setCurrentSettings(response.data);
    } catch (error) {
      console.error('Failed to fetch current settings:', error);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatBitrate = (bps) => {
    if (!bps || bps === 0) return '0 bps';
    const kbps = bps / 1000;
    const mbps = bps / 1000000;
    
    if (mbps >= 1) {
      return `${mbps.toFixed(1)} Mbps`;
    } else if (kbps >= 1) {
      return `${kbps.toFixed(0)} kbps`;
    } else {
      return `${bps} bps`;
    }
  };

  const formatDuration = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Format timestamp according to current locale settings
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    const locale = currentSettings?.plexlive?.localization?.locale || 'en-US';
    const timeFormat = currentSettings?.plexlive?.localization?.timeFormat || '24h';
    
    // Create formatting options based on settings
    let options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    
    if (timeFormat === '12h') {
      options = { ...options, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    } else {
      options = { ...options, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    }
    
    // Apply timezone if available
    if (currentSettings?.plexlive?.localization?.timezone) {
      options.timeZone = currentSettings.plexlive.localization.timezone;
    }
    
    try {
      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch (error) {
      console.warn('Failed to format timestamp with locale settings:', error);
      return format(date, 'yyyy-MM-dd HH:mm:ss');
    }
  };

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      enqueueSnackbar(`${label} copied to clipboard! 📋`, { variant: 'success' });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      enqueueSnackbar('Failed to copy to clipboard', { variant: 'error' });
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Grid container spacing={3}>
          {[...Array(4)].map((_, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card 
                sx={{ 
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.15)',
                  animation: 'pulse 2s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%': { opacity: 0.6 },
                    '50%': { opacity: 1 },
                    '100%': { opacity: 0.6 },
                  },
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <Skeleton 
                        variant="text" 
                        width="60%" 
                        height={20} 
                        sx={{ mb: 1, animation: 'wave 1.5s ease-in-out 0.5s infinite' }}
                      />
                      <Skeleton 
                        variant="text" 
                        width="80%" 
                        height={32} 
                        sx={{ mb: 1, animation: 'wave 1.5s ease-in-out 0.7s infinite' }}
                      />
                      <Skeleton 
                        variant="text" 
                        width="40%" 
                        height={16} 
                        sx={{ animation: 'wave 1.5s ease-in-out 0.9s infinite' }}
                      />
                    </Box>
                    <Skeleton 
                      variant="circular" 
                      width={56} 
                      height={56} 
                      sx={{ animation: 'wave 1.5s ease-in-out 1.1s infinite' }}
                    />
                  </Box>
                  <Skeleton 
                    variant="rectangular" 
                    height={8} 
                    sx={{ 
                      borderRadius: 1,
                      animation: 'wave 1.5s ease-in-out 1.3s infinite'
                    }} 
                  />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (error || !metrics) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Alert 
          severity="error" 
          icon={<ErrorIcon />}
          sx={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 3,
          }}
          action={
            <Button
              onClick={fetchMetrics}
              size="small"
              startIcon={<RefreshIcon />}
              sx={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: 'white',
                '&:hover': {
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  transform: 'scale(1.05)',
                },
                transition: 'all 0.2s ease',
              }}
            >
              Retry
            </Button>
          }
        >
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {error || 'Failed to load metrics'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Please check your connection and try again
          </Typography>
        </Alert>
      </Box>
    );
  }

  const streamUtilizationData = {
    labels: ['Used', 'Available'],
    datasets: [
      {
        data: [
          metrics?.streams?.active || 0, 
          (metrics?.streams?.maximum || 0) - (metrics?.streams?.active || 0)
        ],
        backgroundColor: ['#1976d2', '#424242'],
        borderWidth: 0,
      },
    ],
  };

  const memoryData = {
    labels: ['Used', 'Available'],
    datasets: [
      {
        data: [
          metrics?.system?.memory?.heapUsed || 0,
          (metrics?.system?.memory?.heapTotal || 0) - (metrics?.system?.memory?.heapUsed || 0),
        ],
        backgroundColor: ['#dc004e', '#424242'],
        borderWidth: 0,
      },
    ],
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      {/* Key Metrics Cards */}
      <Grid container spacing={isMobile ? 2 : 3} sx={{ mb: 3 }} data-testid="system-metrics">
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
              }
            }}
          >
            <CardContent sx={{ position: 'relative' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography 
                    sx={{ 
                      color: 'text.secondary', 
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      mb: 1
                    }}
                  >
                    Active Streams
                  </Typography>
                  <Typography 
                    variant="h3" 
                    sx={{ 
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      mb: 0.5
                    }}
                  >
                    {metrics?.streams?.active || 0}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    of {metrics?.streams?.maximum || 0} max capacity
                  </Typography>
                </Box>
                <Box 
                  sx={{ 
                    width: 56, 
                    height: 56,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'scale(1.1) rotate(5deg)',
                      boxShadow: '0 12px 40px rgba(99, 102, 241, 0.4)',
                    }
                  }}
                >
                  <StreamIcon sx={{ fontSize: 28, color: 'white' }} />
                </Box>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    Utilization
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                    {metrics?.streams?.utilization || 0}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={metrics?.streams?.utilization || 0}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 4,
                      background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
                    }
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(244, 63, 94, 0.1) 100%)',
              border: '1px solid rgba(236, 72, 153, 0.2)',
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: 'linear-gradient(90deg, #ec4899 0%, #f43f5e 100%)',
              }
            }}
          >
            <CardContent sx={{ position: 'relative' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography 
                    sx={{ 
                      color: 'text.secondary', 
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      mb: 1
                    }}
                  >
                    Memory Usage
                  </Typography>
                  <Typography 
                    variant="h4" 
                    sx={{ 
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      mb: 0.5
                    }}
                  >
                    {formatBytes(metrics?.system?.memory?.heapUsed || 0)}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    of {formatBytes(metrics?.system?.memory?.heapTotal || 0)} total
                  </Typography>
                </Box>
                <Box 
                  sx={{ 
                    width: 56, 
                    height: 56,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(236, 72, 153, 0.3)',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'scale(1.1) rotate(5deg)',
                      boxShadow: '0 12px 40px rgba(236, 72, 153, 0.4)',
                    }
                  }}
                >
                  <MemoryIcon sx={{ fontSize: 28, color: 'white' }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
              }
            }}
          >
            <CardContent sx={{ position: 'relative' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography 
                    sx={{ 
                      color: 'text.secondary', 
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      mb: 1
                    }}
                  >
                    System Uptime
                  </Typography>
                  <Typography 
                    variant="h4" 
                    sx={{ 
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      mb: 0.5
                    }}
                  >
                    {formatUptime(metrics?.system?.uptime || 0)}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    Continuous operation
                  </Typography>
                </Box>
                <Box 
                  sx={{ 
                    width: 56, 
                    height: 56,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(16, 185, 129, 0.3)',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'scale(1.1) rotate(5deg)',
                      boxShadow: '0 12px 40px rgba(16, 185, 129, 0.4)',
                    }
                  }}
                >
                  <SpeedIcon sx={{ fontSize: 28, color: 'white' }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(29, 78, 216, 0.1) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: 'linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)',
              }
            }}
          >
            <CardContent sx={{ position: 'relative' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography 
                    sx={{ 
                      color: 'text.secondary', 
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      mb: 1
                    }}
                  >
                    Database Status
                  </Typography>
                  <Box sx={{ mb: 1 }}>
                    <Chip
                      label={metrics?.database?.status === 'healthy' ? 'Healthy' : 'Error'}
                      sx={{
                        background: metrics?.database?.status === 'healthy' 
                          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                          : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: '0.75rem'
                      }}
                      size="small"
                    />
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    Cache: {metrics?.cache?.status || 'Unknown'}
                  </Typography>
                </Box>
                <Box 
                  sx={{ 
                    width: 56, 
                    height: 56,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'scale(1.1) rotate(5deg)',
                      boxShadow: '0 12px 40px rgba(59, 130, 246, 0.4)',
                    }
                  }}
                >
                  <StorageIcon sx={{ fontSize: 28, color: 'white' }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card 
            sx={{ 
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.15)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <CardContent sx={{ pb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
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
                  <StreamIcon sx={{ fontSize: 20, color: 'white' }} />
                </Box>
                <Box>
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    Stream Utilization
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    Real-time streaming capacity usage
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 280, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Doughnut
                  data={streamUtilizationData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: {
                          usePointStyle: true,
                          padding: 20,
                          font: {
                            weight: 'bold',
                            size: 12
                          }
                        }
                      },
                    },
                    cutout: '65%',
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card 
            sx={{ 
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.05) 0%, rgba(244, 63, 94, 0.05) 100%)',
              border: '1px solid rgba(236, 72, 153, 0.15)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <CardContent sx={{ pb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Box 
                  sx={{ 
                    width: 40, 
                    height: 40,
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mr: 2
                  }}
                >
                  <MemoryIcon sx={{ fontSize: 20, color: 'white' }} />
                </Box>
                <Box>
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    Memory Usage
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    System memory allocation overview
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 280, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Doughnut
                  data={memoryData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: {
                          usePointStyle: true,
                          padding: 20,
                          font: {
                            weight: 'bold',
                            size: 12
                          }
                        }
                      },
                    },
                    cutout: '65%',
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Active Streams Table */}
      <Card 
        sx={{ 
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          mb: 3
        }}
      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
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
              <StreamIcon sx={{ fontSize: 20, color: 'white' }} />
            </Box>
            <Box>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Active Streams
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Currently active streaming sessions
              </Typography>
            </Box>
          </Box>
          {activeStreams.length === 0 ? (
            <Typography color="textSecondary">
              No active streams
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2 }} data-testid="active-streams">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Channel</TableCell>
                    <TableCell>Client IP</TableCell>
                    <TableCell>Current Bitrate</TableCell>
                    <TableCell>Avg Bitrate</TableCell>
                    <TableCell>Peak Bitrate</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Data Transferred</TableCell>
                    <TableCell>Started</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeStreams.map((stream) => (
                    <TableRow key={stream.sessionId}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <TvIcon sx={{ mr: 1, color: 'primary.main' }} />
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              Ch {stream.channelNumber || 'N/A'} - {stream.channelName || 'Unknown Channel'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {stream.streamId}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{stream.clientIP}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {stream.userAgent ? stream.userAgent.split(' ')[0] : 'Unknown'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: stream.currentBitrate > 0 ? 'success.main' : 'grey.400',
                              mr: 1,
                              animation: stream.currentBitrate > 0 ? 'pulse 2s infinite' : 'none'
                            }}
                          />
                          <Typography variant="body2" fontWeight="bold">
                            {formatBitrate(stream.currentBitrate)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatBitrate(stream.avgBitrate)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="primary.main" fontWeight="bold">
                          {formatBitrate(stream.peakBitrate)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatDuration(stream.duration)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatBytes(stream.bytesTransferred)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatTimestamp(stream.startTime)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Started {formatDuration(Date.now() - new Date(stream.startTime).getTime())} ago
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* System Information */}
      <Grid container spacing={3} sx={{ mt: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Information
              </Typography>
              <Box>
                <Typography variant="body2">
                  <strong>Platform:</strong> {metrics?.system?.platform || 'Unknown'}
                </Typography>
                <Typography variant="body2">
                  <strong>Node.js:</strong> {metrics?.system?.nodeVersion || 'Unknown'}
                </Typography>
                <Typography variant="body2">
                  <strong>Memory RSS:</strong> {formatBytes(metrics?.system?.memory?.rss || 0)}
                </Typography>
                <Typography variant="body2">
                  <strong>External Memory:</strong> {formatBytes(metrics?.system?.memory?.external || 0)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Current Settings
              </Typography>
              <Box>
                <Typography variant="body2">
                  <strong>Locale:</strong> {currentSettings?.plexlive?.localization?.locale || 'en-US'}
                </Typography>
                <Typography variant="body2">
                  <strong>Timezone:</strong> {currentSettings?.plexlive?.localization?.timezone || 'UTC'}
                </Typography>
                <Typography variant="body2">
                  <strong>Time Format:</strong> {currentSettings?.plexlive?.localization?.timeFormat || '24h'}
                </Typography>
                <Typography variant="body2">
                  <strong>Date Format:</strong> {currentSettings?.plexlive?.localization?.dateFormat || 'YYYY-MM-DD'}
                </Typography>
                <Typography variant="body2">
                  <strong>Max Concurrent Streams:</strong> {currentSettings?.plexlive?.streaming?.maxConcurrentStreams || 10}
                </Typography>
                <Typography variant="body2">
                  <strong>Stream Timeout:</strong> {currentSettings?.plexlive?.streaming?.streamTimeout || 30000}ms
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                EPG Status
              </Typography>
              <Box>
                <Typography variant="body2">
                  <strong>Sources:</strong> {metrics.epg?.sources?.length || 0}
                </Typography>
                <Typography variant="body2">
                  <strong>Total Programs:</strong> {metrics.epg?.programs?.total || 0}
                </Typography>
                <Typography variant="body2">
                  <strong>Upcoming (24h):</strong> {metrics.epg?.programs?.upcoming24h || 0}
                </Typography>
                <Chip
                  label={metrics?.epg?.isInitialized ? 'Running' : 'Stopped'}
                  color={metrics?.epg?.isInitialized ? 'success' : 'warning'}
                  size="small"
                  sx={{ mt: 1 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* PlexTV Server Information */}
      {serverInfo && (
        <Grid container spacing={3} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TvIcon color="primary" />
                  PlexTV Server Information
                </Typography>

                {/* Server Details */}
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      Server Details
                    </Typography>
                    <List dense>
                      <ListItem>
                        <ListItemIcon><RouterIcon /></ListItemIcon>
                        <ListItemText 
                          primary="Hostname" 
                          secondary={serverInfo.hostname}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon><PublicIcon /></ListItemIcon>
                        <ListItemText 
                          primary="Port" 
                          secondary={serverInfo.port}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon><TvIcon /></ListItemIcon>
                        <ListItemText 
                          primary="Device Name" 
                          secondary={serverInfo.tuner?.friendlyName}
                        />
                      </ListItem>
                    </List>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      Network Interfaces
                    </Typography>
                    <List dense>
                      {serverInfo.ipAddresses?.map((ip, index) => (
                        <ListItem key={index}>
                          <ListItemIcon><PublicIcon /></ListItemIcon>
                          <ListItemText 
                            primary={ip.interface}
                            secondary={`${ip.address} (${ip.netmask})`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                {/* Plex Configuration URLs */}
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <StarIcon sx={{ color: '#ffd700', mr: 1 }} />
                    <Typography variant="subtitle1" fontWeight="bold">
                      Plex Configuration URL
                    </Typography>
                  </Box>
                  
                  <Alert severity="success" sx={{ mb: 3 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      🎯 <strong>Primary URL for Plex:</strong> Use the Tuner Discovery URL below - this is what Plex needs to discover your PlexTV Bridge server.
                    </Typography>
                  </Alert>

                  {/* Primary Plex Tuner URL - Prominently displayed */}
                  <Card 
                    sx={{ 
                      background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(46, 125, 50, 0.1) 100%)',
                      border: '2px solid rgba(76, 175, 80, 0.3)',
                      position: 'relative',
                      mb: 3,
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '4px',
                        background: 'linear-gradient(90deg, #4caf50 0%, #2e7d32 100%)',
                      }
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Box 
                          sx={{ 
                            width: 40, 
                            height: 40,
                            borderRadius: 2,
                            background: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            mr: 2
                          }}
                        >
                          <TvIcon sx={{ fontSize: 20, color: 'white' }} />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="h6" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                            Plex Tuner Discovery URL
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            This is the main URL you need for Plex configuration
                          </Typography>
                        </Box>
                        <Chip
                          label="PRIMARY"
                          size="small"
                          sx={{
                            background: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
                            color: 'white',
                            fontWeight: 700,
                            fontSize: '0.7rem'
                          }}
                        />
                      </Box>
                      
                      <TextField
                        fullWidth
                        value={serverInfo.urls?.tunerDiscovery || ''}
                        variant="outlined"
                        size="medium"
                        InputProps={{
                          readOnly: true,
                          sx: {
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            fontSize: '1.1rem',
                            fontWeight: 500,
                          },
                          endAdornment: (
                            <InputAdornment position="end">
                              <Tooltip title="Copy Plex Tuner URL">
                                <IconButton
                                  onClick={() => copyToClipboard(serverInfo.urls?.tunerDiscovery, 'Plex Tuner Discovery URL')}
                                  edge="end"
                                  sx={{
                                    background: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
                                    color: 'white',
                                    '&:hover': {
                                      background: 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)',
                                      transform: 'scale(1.05)',
                                    },
                                    transition: 'all 0.2s ease',
                                  }}
                                >
                                  <CopyIcon />
                                </IconButton>
                              </Tooltip>
                            </InputAdornment>
                          ),
                        }}
                      />
                      
                      <Alert severity="info" sx={{ mt: 2, backgroundColor: 'rgba(33, 150, 243, 0.1)' }}>
                        <Typography variant="body2">
                          <strong>How to use:</strong> In Plex, go to Settings → Live TV & DVR → Set up → Add a tuner → 
                          Enter this URL when prompted for the tuner location. Plex will automatically discover your PlexTV Bridge server.
                        </Typography>
                      </Alert>
                    </CardContent>
                  </Card>

                  {/* Additional URLs Section */}
                  <Box>
                    <Button
                      variant="outlined"
                      onClick={() => setShowAdditionalUrls(!showAdditionalUrls)}
                      startIcon={showAdditionalUrls ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      sx={{
                        mb: 2,
                        borderColor: 'rgba(99, 102, 241, 0.3)',
                        color: '#6366f1',
                        '&:hover': {
                          borderColor: '#6366f1',
                          background: 'rgba(99, 102, 241, 0.05)',
                        }
                      }}
                    >
                      {showAdditionalUrls ? 'Hide' : 'Show'} Additional URLs for Other Products
                    </Button>

                    <Collapse in={showAdditionalUrls}>
                      <Card sx={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <InfoIcon sx={{ color: '#6366f1', mr: 1 }} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#6366f1' }}>
                              Additional URLs for Other Software
                            </Typography>
                          </Box>
                          
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            These URLs are provided for compatibility with other IPTV software. 
                            <strong>For Plex, use the primary Tuner Discovery URL above.</strong>
                          </Typography>

                          <Grid container spacing={2}>
                            <Grid item xs={12}>
                              <TextField
                                label="M3U Playlist URL (for IPTV Players)"
                                fullWidth
                                value={serverInfo.urls?.m3uPlaylist || ''}
                                variant="outlined"
                                size="small"
                                InputProps={{
                                  readOnly: true,
                                  endAdornment: (
                                    <InputAdornment position="end">
                                      <Tooltip title="Copy M3U URL">
                                        <IconButton
                                          onClick={() => copyToClipboard(serverInfo.urls?.m3uPlaylist, 'M3U Playlist URL')}
                                          edge="end"
                                        >
                                          <CopyIcon />
                                        </IconButton>
                                      </Tooltip>
                                    </InputAdornment>
                                  ),
                                }}
                                helperText="For standalone IPTV players like VLC, Kodi, or dedicated IPTV apps"
                              />
                            </Grid>

                            <Grid item xs={12}>
                              <TextField
                                label="EPG XML URL (for Program Guide)"
                                fullWidth
                                value={serverInfo.urls?.epgXml || ''}
                                variant="outlined"
                                size="small"
                                InputProps={{
                                  readOnly: true,
                                  endAdornment: (
                                    <InputAdornment position="end">
                                      <Tooltip title="Copy EPG XML URL">
                                        <IconButton
                                          onClick={() => copyToClipboard(serverInfo.urls?.epgXml, 'EPG XML URL')}
                                          edge="end"
                                        >
                                          <CopyIcon />
                                        </IconButton>
                                      </Tooltip>
                                    </InputAdornment>
                                  ),
                                }}
                                helperText="XMLTV format program guide for compatible software"
                              />
                            </Grid>

                            <Grid item xs={12}>
                              <TextField
                                label="Channel Lineup URL (JSON API)"
                                fullWidth
                                value={serverInfo.urls?.channelLineup || ''}
                                variant="outlined"
                                size="small"
                                InputProps={{
                                  readOnly: true,
                                  endAdornment: (
                                    <InputAdornment position="end">
                                      <Tooltip title="Copy Channel Lineup URL">
                                        <IconButton
                                          onClick={() => copyToClipboard(serverInfo.urls?.channelLineup, 'Channel Lineup URL')}
                                          edge="end"
                                        >
                                          <CopyIcon />
                                        </IconButton>
                                      </Tooltip>
                                    </InputAdornment>
                                  ),
                                }}
                                helperText="JSON endpoint for developers and advanced users"
                              />
                            </Grid>
                          </Grid>
                        </CardContent>
                      </Card>
                    </Collapse>
                  </Box>
                </Box>

              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

export default Dashboard;
