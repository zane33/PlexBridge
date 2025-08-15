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
} from '@mui/material';
import {
  Stream as StreamIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Storage as StorageIcon,
  Refresh as RefreshIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { format } from 'date-fns';
import api from '../../services/api';
import socketService from '../../services/socket';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [activeStreams, setActiveStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    fetchMetrics();
    fetchActiveStreams();
    
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
    
    // Fallback polling for when socket is not connected
    const interval = setInterval(() => {
      if (!socketService.isConnected()) {
        fetchMetrics();
        fetchActiveStreams();
      }
    }, 30000); // Update every 30 seconds

    return () => {
      clearInterval(interval);
      unsubscribeMetrics();
      unsubscribeStreamStart();
      unsubscribeStreamStop();
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
      const response = await api.get('/stream/active');
      setActiveStreams(response.data.streams || []);
    } catch (error) {
      console.error('Failed to fetch active streams:', error);
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

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Grid container spacing={3}>
          {[...Array(4)].map((_, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card>
                <CardContent>
                  <Skeleton variant="rectangular" height={120} />
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
          action={
            <Box onClick={fetchMetrics} sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1 }}>
              <RefreshIcon />
              <Typography variant="body2">Retry</Typography>
            </Box>
          }
        >
          {error || 'Failed to load metrics'}
        </Alert>
      </Box>
    );
  }

  const streamUtilizationData = {
    labels: ['Used', 'Available'],
    datasets: [
      {
        data: [metrics.streams.active, metrics.streams.maximum - metrics.streams.active],
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
          metrics.system.memory.heapUsed,
          metrics.system.memory.heapTotal - metrics.system.memory.heapUsed,
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
      <Grid container spacing={isMobile ? 2 : 3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Active Streams
                  </Typography>
                  <Typography variant="h4">
                    {metrics.streams.active}
                  </Typography>
                  <Typography variant="body2">
                    of {metrics.streams.maximum} max
                  </Typography>
                </Box>
                <StreamIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
              <LinearProgress
                variant="determinate"
                value={metrics.streams.utilization}
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Memory Usage
                  </Typography>
                  <Typography variant="h6">
                    {formatBytes(metrics.system.memory.heapUsed)}
                  </Typography>
                  <Typography variant="body2">
                    of {formatBytes(metrics.system.memory.heapTotal)}
                  </Typography>
                </Box>
                <MemoryIcon color="secondary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Uptime
                  </Typography>
                  <Typography variant="h6">
                    {formatUptime(metrics.system.uptime)}
                  </Typography>
                </Box>
                <SpeedIcon color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Database
                  </Typography>
                  <Chip
                    label={metrics.database.status}
                    color={metrics.database.status === 'healthy' ? 'success' : 'error'}
                    size="small"
                  />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Cache: {metrics.cache.status}
                  </Typography>
                </Box>
                <StorageIcon color="info" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Stream Utilization
              </Typography>
              <Box sx={{ height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Doughnut
                  data={streamUtilizationData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom',
                      },
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Memory Usage
              </Typography>
              <Box sx={{ height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Doughnut
                  data={memoryData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom',
                      },
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Active Streams Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Active Streams
          </Typography>
          {activeStreams.length === 0 ? (
            <Typography color="textSecondary">
              No active streams
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Stream ID</TableCell>
                    <TableCell>Client IP</TableCell>
                    <TableCell>Started</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Data Transferred</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeStreams.map((stream) => (
                    <TableRow key={stream.sessionId}>
                      <TableCell>{stream.streamId}</TableCell>
                      <TableCell>{stream.clientIP}</TableCell>
                      <TableCell>
                        {format(new Date(stream.startTime), 'HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        {Math.floor(stream.duration / 1000)}s
                      </TableCell>
                      <TableCell>
                        {formatBytes(stream.bytesTransferred)}
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
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Information
              </Typography>
              <Box>
                <Typography variant="body2">
                  <strong>Platform:</strong> {metrics.system.platform}
                </Typography>
                <Typography variant="body2">
                  <strong>Node.js:</strong> {metrics.system.nodeVersion}
                </Typography>
                <Typography variant="body2">
                  <strong>Memory RSS:</strong> {formatBytes(metrics.system.memory.rss)}
                </Typography>
                <Typography variant="body2">
                  <strong>External Memory:</strong> {formatBytes(metrics.system.memory.external)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
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
                  label={metrics.epg?.isInitialized ? 'Running' : 'Stopped'}
                  color={metrics.epg?.isInitialized ? 'success' : 'warning'}
                  size="small"
                  sx={{ mt: 1 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;
