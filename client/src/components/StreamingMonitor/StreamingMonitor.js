import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Chip,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Button,
  LinearProgress,
  Grid,
  useTheme,
  useMediaQuery,
  Alert,
  Skeleton,
} from '@mui/material';
import {
  Stream as StreamIcon,
  Computer as ComputerIcon,
  Tv as TvIcon,
  Timeline as TimelineIcon,
  DataUsage as DataUsageIcon,
  NetworkCheck as NetworkCheckIcon,
  Stop as StopIcon,
  Warning as WarningIcon,
  PlayCircle as PlayCircleIcon,
  Refresh as RefreshIcon,
  PersonPin as PersonPinIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import socketService from '../../services/socket';
import { useSnackbar } from 'notistack';

function StreamingMonitor({ 
  showCapacityInfo = true, 
  showBandwidthAnalytics = true, 
  showStatistics = true,
  maxHeight = null,
  title = "Live Streaming Monitor"
}) {
  const [sessions, setSessions] = useState([]);
  const [capacity, setCapacity] = useState(null);
  const [bandwidth, setBandwidth] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [terminateDialog, setTerminateDialog] = useState({ open: false, sessionId: null, sessionData: null });
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    fetchStreamingData();
    
    // Set up real-time updates via Socket.IO
    const unsubscribeSessionStarted = socketService.on('session:started', (data) => {
      console.log('New streaming session started:', data);
      fetchStreamingData();
    });

    const unsubscribeSessionEnded = socketService.on('session:ended', (data) => {
      console.log('Streaming session ended:', data);
      fetchStreamingData();
    });

    const unsubscribeMonitoringUpdate = socketService.on('monitoring:update', (data) => {
      if (data.sessions) {
        setSessions(data.sessions);
      }
      if (data.capacity) {
        setCapacity(data.capacity);
      }
      if (data.bandwidth) {
        setBandwidth(data.bandwidth);
      }
      if (data.statistics) {
        setStatistics(data.statistics);
      }
    });

    return () => {
      unsubscribeSessionStarted();
      unsubscribeSessionEnded();
      unsubscribeMonitoringUpdate();
    };
  }, []);

  const fetchStreamingData = async () => {
    try {
      setError(null);
      
      // Fetch all streaming data in parallel
      const [sessionsResponse, capacityResponse, bandwidthResponse, statsResponse] = await Promise.all([
        api.get('/api/streaming/active'),
        showCapacityInfo ? api.get('/api/streaming/capacity') : Promise.resolve({ data: null }),
        showBandwidthAnalytics ? api.get('/api/streaming/bandwidth') : Promise.resolve({ data: null }),
        showStatistics ? api.get('/api/streaming/stats') : Promise.resolve({ data: null }),
      ]);
      
      setSessions(sessionsResponse.data.sessions || []);
      setCapacity(capacityResponse.data);
      setBandwidth(bandwidthResponse.data);
      setStatistics(statsResponse.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch streaming data:', error);
      setError('Failed to load streaming monitoring data. Please check your connection.');
      setLoading(false);
      
      // Set empty arrays as fallback
      setSessions([]);
      setCapacity(null);
      setBandwidth(null);
      setStatistics(null);
    }
  };

  const handleTerminateSession = async (sessionId) => {
    try {
      await api.delete(`/api/streaming/sessions/${sessionId}`);
      enqueueSnackbar('Session terminated successfully', { variant: 'success' });
      setTerminateDialog({ open: false, sessionId: null, sessionData: null });
      fetchStreamingData();
    } catch (error) {
      console.error('Failed to terminate session:', error);
      enqueueSnackbar('Failed to terminate session', { variant: 'error' });
    }
  };

  const openTerminateDialog = (session) => {
    setTerminateDialog({ open: true, sessionId: session.sessionId, sessionData: session });
  };

  const closeTerminateDialog = () => {
    setTerminateDialog({ open: false, sessionId: null, sessionData: null });
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
    if (!milliseconds || isNaN(milliseconds)) return '0s';
    
    const totalSeconds = Math.floor(Math.abs(milliseconds) / 1000);
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

  const formatSessionDuration = (startTime) => {
    if (!startTime) return '0s';
    const duration = Date.now() - new Date(startTime).getTime();
    return formatDuration(duration);
  };

  const getUtilizationColor = (percentage) => {
    if (percentage <= 70) return 'success';
    if (percentage <= 90) return 'warning';
    return 'error';
  };

  const getUtilizationStatus = (percentage) => {
    if (percentage <= 70) return 'normal';
    if (percentage <= 90) return 'busy';
    return 'critical';
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {title}
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Skeleton variant="rectangular" height={200} />
          </Box>
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {title}
          </Typography>
          <Alert 
            severity="error" 
            action={
              <Button
                onClick={fetchStreamingData}
                size="small"
                startIcon={<RefreshIcon />}
              >
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      {/* Capacity Information */}
      {showCapacityInfo && capacity && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <StreamIcon sx={{ color: 'primary.main', mr: 1 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Streaming Capacity
                </Typography>
              </Box>
              <Chip
                label={getUtilizationStatus(capacity.utilizationPercentage)}
                color={getUtilizationColor(capacity.utilizationPercentage)}
                size="small"
              />
            </Box>
            
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6}>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                  {capacity.totalActiveStreams} / {capacity.maxConcurrentStreams}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Active streams out of maximum capacity
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Utilization: {capacity.utilizationPercentage}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={capacity.utilizationPercentage}
                    color={getUtilizationColor(capacity.utilizationPercentage)}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Bandwidth and Statistics */}
      {(showBandwidthAnalytics || showStatistics) && (bandwidth || statistics) && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {showBandwidthAnalytics && bandwidth && (
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <NetworkCheckIcon sx={{ color: 'success.main', mr: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Bandwidth Analytics
                    </Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="h5" sx={{ color: 'success.main', fontWeight: 700 }}>
                        {formatBitrate(bandwidth.totalBandwidthUsage)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Total Bandwidth
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="h5" sx={{ color: 'info.main', fontWeight: 700 }}>
                        {formatBitrate(bandwidth.peakBandwidthUsage)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Peak Bandwidth
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          )}

          {showStatistics && statistics && (
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TimelineIcon sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Session Statistics
                    </Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="h5" sx={{ color: 'primary.main', fontWeight: 700 }}>
                        {statistics.totalSessions || 0}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Total Sessions
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="h5" sx={{ color: 'warning.main', fontWeight: 700 }}>
                        {formatDuration(statistics.averageSessionDuration)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Avg Duration
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* Active Sessions Table */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <PlayCircleIcon sx={{ color: 'primary.main', mr: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {title}
              </Typography>
            </Box>
            
            {/* Real-time indicator */}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: socketService.isConnected() ? 'success.main' : 'error.main',
                  mr: 1,
                  animation: socketService.isConnected() ? 'pulse 2s infinite' : 'none'
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {socketService.isConnected() ? 'Live' : 'Offline'}
              </Typography>
            </Box>
          </Box>
          
          {sessions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <PlayCircleIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" color="textSecondary" sx={{ mb: 1 }}>
                No Active Streaming Sessions
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Sessions will appear here when users start watching channels
              </Typography>
            </Box>
          ) : (
            <TableContainer 
              component={Paper} 
              sx={{ 
                maxHeight: maxHeight,
                '& .MuiTableCell-root': {
                  fontSize: isMobile ? '0.75rem' : '0.875rem'
                }
              }}
            >
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Client</TableCell>
                    <TableCell>Channel</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Bitrate</TableCell>
                    <TableCell>Data</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.sessionId} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Avatar 
                            sx={{ 
                              bgcolor: 'primary.main', 
                              width: 32, 
                              height: 32, 
                              mr: 2,
                              fontSize: '0.75rem'
                            }}
                          >
                            <ComputerIcon sx={{ fontSize: 16 }} />
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {session.clientIP}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {session.hostname || 'Resolving...'}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <TvIcon sx={{ mr: 1, color: 'primary.main', fontSize: 16 }} />
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {session.channelName || 'Unknown'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Ch {session.channelNumber || 'N/A'}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {formatSessionDuration(session.startTime)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Box
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              bgcolor: session.currentBitrate > 0 ? 'success.main' : 'grey.400',
                              mr: 1,
                              animation: session.currentBitrate > 0 ? 'pulse 2s infinite' : 'none'
                            }}
                          />
                          <Typography variant="body2">
                            {formatBitrate(session.currentBitrate)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatBytes(session.bytesTransferred)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Terminate Session">
                          <IconButton
                            onClick={() => openTerminateDialog(session)}
                            size="small"
                            sx={{ color: 'error.main' }}
                          >
                            <StopIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Termination Dialog */}
      <Dialog
        open={terminateDialog.open}
        onClose={closeTerminateDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
          <WarningIcon sx={{ color: 'warning.main', mr: 1 }} />
          Terminate Streaming Session
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to terminate this streaming session?
          </DialogContentText>
          {terminateDialog.sessionData && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>Client:</strong> {terminateDialog.sessionData.clientIP}
              </Typography>
              <Typography variant="body2">
                <strong>Channel:</strong> {terminateDialog.sessionData.channelName} (Ch {terminateDialog.sessionData.channelNumber})
              </Typography>
              <Typography variant="body2">
                <strong>Duration:</strong> {formatSessionDuration(terminateDialog.sessionData.startTime)}
              </Typography>
            </Box>
          )}
          <DialogContentText sx={{ mt: 2 }}>
            This will immediately stop the stream. The user may need to restart their player.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTerminateDialog}>Cancel</Button>
          <Button 
            onClick={() => handleTerminateSession(terminateDialog.sessionId)} 
            color="error" 
            variant="contained"
            startIcon={<StopIcon />}
          >
            Terminate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StreamingMonitor;