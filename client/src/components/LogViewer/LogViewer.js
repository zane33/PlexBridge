import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Stack,
  Grid,
  Switch,
  FormControlLabel,
  Pagination,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon
} from '@mui/icons-material';
import axios from 'axios';

const LOG_LEVELS = {
  error: { color: '#f44336', label: 'Error' },
  warn: { color: '#ff9800', label: 'Warning' },
  info: { color: '#2196f3', label: 'Info' },
  http: { color: '#9c27b0', label: 'HTTP' },
  debug: { color: '#4caf50', label: 'Debug' }
};

const LOG_CATEGORIES = {
  stream: 'Stream',
  security: 'Security',
  performance: 'Performance',
  epg: 'EPG',
  api: 'API'
};

function LogViewer() {
  const [logs, setLogs] = useState([]);
  const [fileLogs, setFileLogs] = useState([]);
  const [logFiles, setLogFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Filters
  const [filters, setFilters] = useState({
    level: '',
    category: '',
    search: '',
    startDate: '',
    endDate: ''
  });
  
  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100,
    total: 0
  });
  
  // Load logs function
  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        ...filters,
        limit: pagination.limit,
        offset: (pagination.page - 1) * pagination.limit
      };
      
      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (!params[key]) {
          delete params[key];
        }
      });
      
      const response = await axios.get('/api/logs', { params });
      
      setLogs(response.data.database_logs || []);
      setFileLogs(response.data.recent_file_logs || []);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination?.total || 0
      }));
      
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);
  
  // Load log files
  const loadLogFiles = useCallback(async () => {
    try {
      const response = await axios.get('/api/logs/files');
      setLogFiles(response.data.files || []);
    } catch (err) {
      console.error('Failed to load log files:', err);
    }
  }, []);
  
  // Initial load
  useEffect(() => {
    loadLogs();
    loadLogFiles();
  }, [loadLogs, loadLogFiles]);
  
  // Auto-refresh setup
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadLogs, 5000); // Refresh every 5 seconds
      setRefreshInterval(interval);
      return () => clearInterval(interval);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }
  }, [autoRefresh, loadLogs]);
  
  // Handle filter changes
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };
  
  // Clear filters
  const clearFilters = () => {
    setFilters({
      level: '',
      category: '',
      search: '',
      startDate: '',
      endDate: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };
  
  // Download log file
  const downloadLogFile = async (filename, format = 'txt') => {
    try {
      const [type, date] = filename.replace('.log', '').split('-');
      const response = await axios.get('/api/logs/download', {
        params: { type, date, format },
        responseType: format === 'json' ? 'json' : 'blob'
      });
      
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: 'application/json'
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${type}-${date || 'latest'}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
      } else {
        const url = window.URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Failed to download log file');
    }
  };
  
  // Cleanup old logs
  const cleanupLogs = async (days = 30) => {
    try {
      await axios.delete('/api/logs/cleanup', {
        data: { days }
      });
      loadLogFiles(); // Refresh file list
      loadLogs(); // Refresh logs
    } catch (err) {
      setError('Failed to cleanup logs');
    }
  };
  
  // Format timestamp
  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };
  
  // Format log level with color
  const formatLogLevel = (level) => {
    const config = LOG_LEVELS[level?.toLowerCase()] || { color: '#666', label: level };
    return (
      <Chip
        label={config.label}
        size="small"
        style={{
          backgroundColor: config.color,
          color: 'white',
          fontSize: '0.75rem'
        }}
      />
    );
  };
  
  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  return (
    <Box>
      <Box 
        display="flex" 
        justifyContent="space-between" 
        alignItems={isMobile ? 'flex-start' : 'center'} 
        mb={3}
        flexDirection={isMobile ? 'column' : 'row'}
        gap={isMobile ? 2 : 0}
      >
        <Typography 
          variant={isMobile ? "h5" : "h4"} 
          sx={{ 
            fontWeight: 700,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.025em',
            mb: isMobile ? 1 : 0
          }}
        >
          Log Viewer
        </Typography>
        {isMobile && (
          <Typography 
            variant="body2" 
            sx={{ 
              color: 'text.secondary',
              fontWeight: 500,
            }}
          >
            Monitor application logs and system activity
          </Typography>
        )}
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {/* Controls */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: isMobile ? 2 : 3 }}>
          <Grid container spacing={isMobile ? 1 : 2} alignItems="center">
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Level</InputLabel>
                <Select
                  value={filters.level}
                  label="Level"
                  onChange={(e) => handleFilterChange('level', e.target.value)}
                >
                  <MenuItem value="">All Levels</MenuItem>
                  {Object.entries(LOG_LEVELS).map(([key, config]) => (
                    <MenuItem key={key} value={key}>{config.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select
                  value={filters.category}
                  label="Category"
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                >
                  <MenuItem value="">All Categories</MenuItem>
                  {Object.entries(LOG_CATEGORIES).map(([key, label]) => (
                    <MenuItem key={key} value={key}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Search"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'gray' }} />
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label="Start Date"
                type="datetime-local"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label="End Date"
                type="datetime-local"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            
            <Grid item xs={12} md={1}>
              <Stack 
                direction={isMobile ? "row" : "row"} 
                spacing={1}
                sx={{ 
                  width: '100%',
                  justifyContent: isMobile ? 'space-around' : 'center'
                }}
              >
                <Tooltip title="Refresh">
                  <Button
                    variant="outlined"
                    onClick={loadLogs} 
                    disabled={loading}
                    size={isMobile ? "small" : "medium"}
                    startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
                    sx={{ flex: isMobile ? 1 : 'initial' }}
                  >
                    {isMobile && !loading ? 'Refresh' : ''}
                  </Button>
                </Tooltip>
                
                <Tooltip title="Clear Filters">
                  <Button
                    variant="outlined"
                    onClick={clearFilters}
                    size={isMobile ? "small" : "medium"}
                    startIcon={<ClearIcon />}
                    sx={{ flex: isMobile ? 1 : 'initial' }}
                  >
                    {isMobile ? 'Clear' : ''}
                  </Button>
                </Tooltip>
              </Stack>
            </Grid>
          </Grid>
          
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
              }
              label="Auto Refresh"
            />
            
            <Button
              variant="outlined"
              startIcon={<DeleteIcon />}
              onClick={() => cleanupLogs(30)}
              size="small"
            >
              Cleanup Old Logs
            </Button>
          </Box>
        </CardContent>
      </Card>
      
      {/* Recent File Logs */}
      {fileLogs.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Recent Activity ({fileLogs.length} entries)
            </Typography>
            <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>Level</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Metadata</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fileLogs.map((log, index) => (
                    <TableRow key={index}>
                      <TableCell>{formatTimestamp(log.timestamp)}</TableCell>
                      <TableCell>{formatLogLevel(log.level)}</TableCell>
                      <TableCell sx={{ maxWidth: 400, wordBreak: 'break-word' }}>
                        {log.message}
                      </TableCell>
                      <TableCell>
                        {log.meta && Object.keys(log.meta).length > 0 && (
                          <pre style={{ fontSize: '0.75rem', margin: 0 }}>
                            {JSON.stringify(log.meta, null, 2)}
                          </pre>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
      
      {/* Database Logs */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Application Logs ({pagination.total} total)
          </Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Level</TableCell>
                  <TableCell>Message</TableCell>
                  <TableCell>Metadata</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((log, index) => (
                  <TableRow key={index}>
                    <TableCell>{formatTimestamp(log.timestamp)}</TableCell>
                    <TableCell>{formatLogLevel(log.level)}</TableCell>
                    <TableCell sx={{ maxWidth: 400, wordBreak: 'break-word' }}>
                      {log.message}
                    </TableCell>
                    <TableCell>
                      {log.meta && (
                        <pre style={{ fontSize: '0.75rem', margin: 0 }}>
                          {typeof log.meta === 'string' ? log.meta : JSON.stringify(log.meta, null, 2)}
                        </pre>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          {pagination.total > pagination.limit && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Pagination
                count={Math.ceil(pagination.total / pagination.limit)}
                page={pagination.page}
                onChange={(e, page) => setPagination(prev => ({ ...prev, page }))}
              />
            </Box>
          )}
        </CardContent>
      </Card>
      
      {/* Log Files */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Log Files
          </Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>File Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Modified</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logFiles.map((file, index) => (
                  <TableRow key={index}>
                    <TableCell>{file.name}</TableCell>
                    <TableCell>
                      <Chip label={file.type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{formatFileSize(file.size)}</TableCell>
                    <TableCell>{file.date}</TableCell>
                    <TableCell>{formatTimestamp(file.modified)}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Tooltip title="Download as Text">
                          <IconButton
                            size="small"
                            onClick={() => downloadLogFile(file.name, 'txt')}
                          >
                            <DownloadIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download as JSON">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => downloadLogFile(file.name, 'json')}
                          >
                            JSON
                          </Button>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}

export default LogViewer;
