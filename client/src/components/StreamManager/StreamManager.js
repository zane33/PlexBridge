import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  CircularProgress,
  Skeleton,
  Grid,
  useTheme,
  useMediaQuery,
  Tooltip,
  Fab,
  Backdrop,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  LinearProgress,
  Checkbox,
  TablePagination,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
  Visibility as PreviewIcon,
  Settings as SettingsIcon,
  CloudUpload as ImportIcon,
  List as ListIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';

const STREAM_TYPES = [
  { value: 'hls', label: 'HLS (.m3u8)' },
  { value: 'dash', label: 'DASH (.mpd)' },
  { value: 'rtsp', label: 'RTSP' },
  { value: 'rtmp', label: 'RTMP' },
  { value: 'udp', label: 'UDP' },
  { value: 'http', label: 'HTTP' },
  { value: 'mms', label: 'MMS' },
  { value: 'srt', label: 'SRT' },
  { value: 'm3u_playlist', label: 'M3U Playlist (Auto-create channels)' },
];

function StreamManager() {
  const [streams, setStreams] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStream, setEditingStream] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [validating, setValidating] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [selectedStreams, setSelectedStreams] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedChannels, setParsedChannels] = useState([]);
  const [importFormData, setImportFormData] = useState({
    url: '',
    type: 'hls',
    auth_username: '',
    auth_password: '',
    auto_create_channels: false,
  });
  const [formData, setFormData] = useState({
    channel_id: '',
    name: '',
    url: '',
    type: 'hls',
    backup_urls: [],
    auth_username: '',
    auth_password: '',
    headers: {},
    protocol_options: {},
    enabled: true,
  });
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const formValidation = useMemo(() => {
    const isM3UPlaylist = formData.type === 'm3u_playlist';
    return {
      nameError: !formData.name.trim(),
      urlError: !formData.url.trim(),
      channelError: !isM3UPlaylist && !formData.channel_id,
      nameHelperText: !formData.name.trim() ? "Stream name is required" : "",
      urlHelperText: !formData.url.trim() ? "Stream URL is required" : "",
      channelHelperText: !isM3UPlaylist && !formData.channel_id ? "Channel selection is required" : ""
    };
  }, [formData.name, formData.url, formData.channel_id, formData.type]);

  useEffect(() => {
    fetchStreams();
    fetchChannels();
  }, []);

  const fetchStreams = async () => {
    try {
      const response = await api.get('/api/streams');
      setStreams(response.data);
      setLoading(false);
    } catch (error) {
      enqueueSnackbar('Failed to fetch streams', { variant: 'error' });
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const response = await api.get('/api/channels');
      setChannels(response.data);
    } catch (error) {
      enqueueSnackbar('Failed to fetch channels', { variant: 'error' });
    }
  };

  const handleCreate = () => {
    setEditingStream(null);
    setValidationResult(null);
    setFormData({
      channel_id: '',
      name: '',
      url: '',
      type: 'hls',
      backup_urls: [],
      auth_username: '',
      auth_password: '',
      headers: {},
      protocol_options: {},
      enabled: true,
    });
    setDialogOpen(true);
  };

  const handleEdit = (stream) => {
    setEditingStream(stream);
    setValidationResult(null);
    setFormData({
      channel_id: stream.channel_id || '',
      name: stream.name || '',
      url: stream.url || '',
      type: stream.type || 'hls',
      backup_urls: stream.backup_urls ? JSON.parse(stream.backup_urls) : [],
      auth_username: stream.auth_username || '',
      auth_password: stream.auth_password || '',
      headers: stream.headers ? JSON.parse(stream.headers) : {},
      protocol_options: stream.protocol_options ? JSON.parse(stream.protocol_options) : {},
      enabled: stream.enabled !== 0,
    });
    setDialogOpen(true);
  };

  const handleValidate = async () => {
    if (!formData.url.trim()) {
      enqueueSnackbar('Please enter a stream URL first', { variant: 'warning' });
      return;
    }

    setValidating(true);
    setValidationResult(null);
    
    try {
      const response = await api.post('/streams/validate', {
        url: formData.url,
        type: formData.type,
        auth: formData.auth_username ? {
          username: formData.auth_username,
          password: formData.auth_password
        } : null,
        headers: formData.headers
      });
      
      setValidationResult(response.data);
      
      if (response.data.valid) {
        enqueueSnackbar('Stream validation successful! 🎉', { variant: 'success' });
      } else {
        enqueueSnackbar(`Stream validation failed: ${response.data.error}`, { variant: 'error' });
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Validation failed';
      enqueueSnackbar(errorMessage, { variant: 'error' });
      setValidationResult({ valid: false, error: errorMessage });
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (formValidation.nameError || formValidation.urlError || formValidation.channelError) {
      enqueueSnackbar('Please fill in all required fields', { variant: 'warning' });
      return;
    }

    // If M3U playlist type is selected, redirect to import functionality
    if (formData.type === 'm3u_playlist' && !editingStream) {
      setDialogOpen(false);
      setImportFormData({
        url: formData.url.trim(),
        type: formData.type.startsWith('m3u') ? 'hls' : formData.type, // Default to HLS for M3U
        auth_username: formData.auth_username || '',
        auth_password: formData.auth_password || '',
        auto_create_channels: true, // Enable by default for M3U imports
      });
      setImportDialogOpen(true);
      enqueueSnackbar('M3U import ready - auto-create is enabled to import all channels', { variant: 'success' });
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        name: formData.name.trim(),
        url: formData.url.trim(),
      };

      if (editingStream) {
        await api.put(`/api/streams/${editingStream.id}`, data);
        enqueueSnackbar('Stream updated successfully! 🎉', { variant: 'success' });
      } else {
        await api.post('/api/streams', data);
        enqueueSnackbar('Stream created successfully! 🎉', { variant: 'success' });
      }

      setDialogOpen(false);
      fetchStreams();
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to save stream';
      enqueueSnackbar(errorMessage, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (stream) => {
    if (window.confirm(`Are you sure you want to delete stream "${stream.name}"? This action cannot be undone.`)) {
      setDeleting(stream.id);
      try {
        await api.delete(`/api/streams/${stream.id}`);
        enqueueSnackbar('Stream deleted successfully 🗑️', { variant: 'success' });
        fetchStreams();
      } catch (error) {
        enqueueSnackbar('Failed to delete stream', { variant: 'error' });
      } finally {
        setDeleting(null);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedStreams.length === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedStreams.length} selected streams? This action cannot be undone.`)) {
      try {
        await Promise.all(
          selectedStreams.map(streamId => api.delete(`/api/streams/${streamId}`))
        );
        enqueueSnackbar(`${selectedStreams.length} streams deleted successfully! 🗑️`, { variant: 'success' });
        setSelectedStreams([]);
        fetchStreams();
      } catch (error) {
        enqueueSnackbar('Failed to delete some streams', { variant: 'error' });
      }
    }
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedStreams(streams.map(stream => stream.id));
    } else {
      setSelectedStreams([]);
    }
  };

  const handleSelectStream = (streamId) => {
    setSelectedStreams(prev => 
      prev.includes(streamId) 
        ? prev.filter(id => id !== streamId)
        : [...prev, streamId]
    );
  };

  const handleImportOpen = () => {
    setImportDialogOpen(true);
    setParsedChannels([]);
    setImportFormData({
      url: '',
      type: 'hls',
      auth_username: '',
      auth_password: '',
      auto_create_channels: false,
    });
  };

  const handleImportInputChange = useCallback((field, value) => {
    setImportFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleParseChannels = async () => {
    if (!importFormData.url.trim()) {
      enqueueSnackbar('Please enter a stream source URL', { variant: 'warning' });
      return;
    }

    setImporting(true);
    try {
      const response = await api.post('/api/streams/import', {
        ...importFormData,
        auto_create_channels: false // Just parse, don't create yet
      });

      const channels = response.data.channels || [];
      setParsedChannels(channels);
      
      if (channels.length > 0) {
        enqueueSnackbar(`Found ${channels.length} channels! 🎉`, { variant: 'success' });
      } else {
        enqueueSnackbar('No channels found in the source', { variant: 'warning' });
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to parse stream source';
      enqueueSnackbar(errorMessage, { variant: 'error' });
      console.error('Parse error:', error);
    } finally {
      setImporting(false);
    }
  };

  const handleImportChannels = async () => {
    if (parsedChannels.length === 0) {
      enqueueSnackbar('No channels to import', { variant: 'warning' });
      return;
    }

    if (!importFormData.auto_create_channels) {
      enqueueSnackbar('Please enable "Auto-create channels" to import', { variant: 'warning' });
      return;
    }

    setImporting(true);
    try {
      const response = await api.post('/api/streams/import', {
        ...importFormData,
        auto_create_channels: true
      });

      const channelsCreated = response.data.channelsCreated || 0;
      const streamsCreated = response.data.streamsCreated || 0;

      enqueueSnackbar(
        `Successfully imported ${channelsCreated} channels and ${streamsCreated} streams! 🎉`,
        { variant: 'success' }
      );
      
      setImportDialogOpen(false);
      setParsedChannels([]);
      fetchStreams();
      fetchChannels();
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to import channels';
      enqueueSnackbar(errorMessage, { variant: 'error' });
      console.error('Import error:', error);
    } finally {
      setImporting(false);
    }
  };

  const renderSkeletonTable = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Skeleton width={24} height={24} />
            </TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Channel</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>URL</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[...Array(5)].map((_, index) => (
            <TableRow key={index}>
              <TableCell padding="checkbox">
                <Skeleton width={24} height={24} />
              </TableCell>
              <TableCell><Skeleton width={120} /></TableCell>
              <TableCell><Skeleton width={80} /></TableCell>
              <TableCell><Skeleton width={60} /></TableCell>
              <TableCell><Skeleton width={200} /></TableCell>
              <TableCell><Skeleton width={80} /></TableCell>
              <TableCell><Skeleton width={100} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const paginatedStreams = streams.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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
        <Typography variant="h4" sx={{ mb: isMobile ? 1 : 0 }}>
          Stream Manager
        </Typography>
        
        <Box display="flex" gap={1} flexWrap="wrap">
          {selectedStreams.length > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleBulkDelete}
              size={isMobile ? "small" : "medium"}
            >
              Delete {selectedStreams.length}
            </Button>
          )}
          
          {!isMobile ? (
            <>
              <Button
                variant="outlined"
                startIcon={<ImportIcon />}
                onClick={handleImportOpen}
                size="large"
                color="info"
              >
                Import M3U
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreate}
                size="large"
              >
                Add Stream
              </Button>
            </>
          ) : (
            <Fab
              color="primary"
              aria-label="add"
              onClick={handleCreate}
              sx={{
                position: 'fixed',
                bottom: 16,
                right: 16,
                zIndex: 1000,
              }}
            >
              <AddIcon />
            </Fab>
          )}
        </Box>
      </Box>

      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 3 } }}>
          {loading ? renderSkeletonTable() : (
            <>
              <TableContainer 
                component={Paper} 
                sx={{ 
                  maxHeight: isMobile ? '70vh' : 'none',
                  overflowX: 'auto',
                }}
              >
                <Table stickyHeader={isMobile}>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          indeterminate={selectedStreams.length > 0 && selectedStreams.length < streams.length}
                          checked={streams.length > 0 && selectedStreams.length === streams.length}
                          onChange={handleSelectAll}
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 150 }}>Name</TableCell>
                      <TableCell sx={{ minWidth: 120, display: { xs: 'none', sm: 'table-cell' } }}>Channel</TableCell>
                      <TableCell sx={{ minWidth: 80 }}>Type</TableCell>
                      <TableCell sx={{ minWidth: 200, display: { xs: 'none', md: 'table-cell' } }}>URL</TableCell>
                      <TableCell sx={{ minWidth: 100 }}>Status</TableCell>
                      <TableCell sx={{ minWidth: 150 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedStreams.map((stream) => (
                      <TableRow key={stream.id} hover>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selectedStreams.includes(stream.id)}
                            onChange={() => handleSelectStream(stream.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="bold">
                            {stream.name}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          <Typography variant="body2" color="text.secondary">
                            {stream.channel_name || 'No Channel'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={stream.type?.toUpperCase()}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          <Typography 
                            variant="body2" 
                            color="text.secondary"
                            sx={{ 
                              maxWidth: 200,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {stream.url}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={stream.enabled ? 'Enabled' : 'Disabled'}
                            color={stream.enabled ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Box display="flex" gap={1}>
                            <Tooltip title="Edit Stream">
                              <IconButton 
                                onClick={() => handleEdit(stream)} 
                                size="small"
                                color="primary"
                              >
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Preview Stream">
                              <IconButton
                                onClick={() => window.open(`/streams/preview/${stream.id}`, '_blank')}
                                size="small"
                                color="info"
                              >
                                <PreviewIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Stream">
                              <IconButton
                                onClick={() => handleDelete(stream)}
                                size="small"
                                color="error"
                                disabled={deleting === stream.id}
                              >
                                {deleting === stream.id ? (
                                  <CircularProgress size={20} />
                                ) : (
                                  <DeleteIcon />
                                )}
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                    {streams.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                          <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                            <PlayIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
                            <Typography variant="h6" color="text.secondary">
                              No streams found
                            </Typography>
                            <Typography variant="body2" color="text.disabled">
                              Get started by adding your first stream
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              
              <TablePagination
                component="div"
                count={streams.length}
                page={page}
                onPageChange={(event, newPage) => setPage(newPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(event) => {
                  setRowsPerPage(parseInt(event.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25, 50]}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Stream Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => !saving && setDialogOpen(false)}
        maxWidth="md" 
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Typography variant="h5" component="div">
            {editingStream ? '✏️ Edit Stream' : '➕ Add Stream'}
          </Typography>
        </DialogTitle>
        
        <DialogContent>
          {validationResult && (
            <Alert 
              severity={validationResult.valid ? 'success' : 'error'} 
              sx={{ mb: 2 }}
              icon={validationResult.valid ? <CheckIcon /> : <ErrorIcon />}
            >
              {validationResult.valid 
                ? `Stream validation successful! Type: ${validationResult.type}`
                : `Validation failed: ${validationResult.error}`
              }
            </Alert>
          )}
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={8}>
              <TextField
                autoFocus
                label="Stream Name *"
                fullWidth
                variant="outlined"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                error={formValidation.nameError}
                helperText={formValidation.nameHelperText}
                disabled={saving}
              />
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth variant="outlined" error={formValidation.channelError}>
                <InputLabel>
                  {formData.type === 'm3u_playlist' ? 'Channel (Optional for M3U)' : 'Channel *'}
                </InputLabel>
                <Select
                  value={formData.channel_id}
                  onChange={(e) => handleInputChange('channel_id', e.target.value)}
                  label={formData.type === 'm3u_playlist' ? 'Channel (Optional for M3U)' : 'Channel *'}
                  disabled={saving || formData.type === 'm3u_playlist'}
                >
                  {formData.type === 'm3u_playlist' ? (
                    <MenuItem value="" disabled>
                      M3U will auto-create channels
                    </MenuItem>
                  ) : (
                    channels.map((channel) => (
                      <MenuItem key={channel.id} value={channel.id}>
                        {channel.number} - {channel.name}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={8}>
              <TextField
                label="Stream URL *"
                fullWidth
                variant="outlined"
                value={formData.url}
                onChange={(e) => handleInputChange('url', e.target.value)}
                error={formValidation.urlError}
                helperText={formValidation.urlHelperText}
                disabled={saving}
                placeholder="https://example.com/stream.m3u8"
              />
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <Box display="flex" gap={1}>
                <FormControl fullWidth variant="outlined">
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={formData.type}
                    onChange={(e) => handleInputChange('type', e.target.value)}
                    label="Type"
                    disabled={saving}
                  >
                    {STREAM_TYPES.map((type) => (
                      <MenuItem key={type.value} value={type.value}>
                        {type.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  onClick={handleValidate}
                  disabled={validating || saving || !formData.url.trim()}
                  sx={{ minWidth: 100 }}
                >
                  {validating ? <CircularProgress size={20} /> : 'Test'}
                </Button>
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>🔐 Authentication & Advanced Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Username"
                        fullWidth
                        variant="outlined"
                        value={formData.auth_username}
                        onChange={(e) => handleInputChange('auth_username', e.target.value)}
                        disabled={saving}
                        helperText="Optional - For authenticated streams"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={formData.auth_password}
                        onChange={(e) => handleInputChange('auth_password', e.target.value)}
                        disabled={saving}
                        helperText="Optional - For authenticated streams"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled}
                    onChange={(e) => handleInputChange('enabled', e.target.checked)}
                    disabled={saving}
                    color="success"
                  />
                }
                label={
                  <Typography variant="body1">
                    {formData.enabled ? '✅ Stream Enabled' : '❌ Stream Disabled'}
                  </Typography>
                }
              />
            </Grid>
          </Grid>
        </DialogContent>
        
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button 
            onClick={() => setDialogOpen(false)}
            disabled={saving}
            startIcon={<CancelIcon />}
            color="inherit"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            variant="contained"
            disabled={saving || formValidation.nameError || formValidation.urlError || formValidation.channelError}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            color="primary"
            size="large"
          >
            {saving ? 'Saving...' : 'Save Stream'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Multi-Channel Import Dialog */}
      <Dialog 
        open={importDialogOpen} 
        onClose={() => !importing && setImportDialogOpen(false)}
        maxWidth="lg" 
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Typography variant="h5" component="div">
            📺 Import Multiple Channels from Stream Source
          </Typography>
        </DialogTitle>
        
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              🎯 Import multiple channels from M3U playlists, XMLTV files, or other multi-channel sources.
              This will automatically create channels and streams for each entry found.
            </Typography>
          </Alert>

          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                autoFocus
                label="Stream Source URL *"
                fullWidth
                variant="outlined"
                value={importFormData.url}
                onChange={(e) => handleImportInputChange('url', e.target.value)}
                disabled={importing}
                placeholder="https://example.com/playlist.m3u8"
                helperText="M3U playlist, XMLTV file, or other multi-channel source"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Default Stream Type</InputLabel>
                <Select
                  value={importFormData.type}
                  onChange={(e) => handleImportInputChange('type', e.target.value)}
                  label="Default Stream Type"
                  disabled={importing}
                >
                  {STREAM_TYPES.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Button
                variant="outlined"
                onClick={handleParseChannels}
                disabled={importing || !importFormData.url.trim()}
                fullWidth
                size="large"
                startIcon={importing ? <CircularProgress size={20} /> : <ListIcon />}
              >
                {importing ? 'Parsing...' : 'Parse Channels'}
              </Button>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Username"
                fullWidth
                variant="outlined"
                value={importFormData.auth_username}
                onChange={(e) => handleImportInputChange('auth_username', e.target.value)}
                disabled={importing}
                helperText="Optional - For authenticated sources"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Password"
                type="password"
                fullWidth
                variant="outlined"
                value={importFormData.auth_password}
                onChange={(e) => handleImportInputChange('auth_password', e.target.value)}
                disabled={importing}
                helperText="Optional - For authenticated sources"
              />
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={importFormData.auto_create_channels}
                    onChange={(e) => handleImportInputChange('auto_create_channels', e.target.checked)}
                    disabled={importing}
                    color="success"
                  />
                }
                label={
                  <Typography variant="body1">
                    {importFormData.auto_create_channels 
                      ? '✅ Auto-create channels and streams' 
                      : '🔍 Preview only (don\'t create yet)'
                    }
                  </Typography>
                }
              />
            </Grid>

            {parsedChannels.length > 0 && (
              <Grid item xs={12}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  📋 Found {parsedChannels.length} Channels:
                </Typography>
                
                <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Number</TableCell>
                        <TableCell>Name</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>URL</TableCell>
                        <TableCell>EPG ID</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parsedChannels.slice(0, 50).map((channel, index) => (
                        <TableRow key={index} hover>
                          <TableCell>{channel.number}</TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={1}>
                              {channel.logo && (
                                <img 
                                  src={channel.logo} 
                                  alt="" 
                                  style={{ width: 24, height: 24, objectFit: 'contain' }}
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              )}
                              <Typography variant="body2">{channel.name}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={channel.type?.toUpperCase()} 
                              size="small" 
                              color="primary" 
                              variant="outlined" 
                            />
                          </TableCell>
                          <TableCell>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                maxWidth: 200, 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {channel.url}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {channel.epg_id || '-'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                      {parsedChannels.length > 50 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            <Typography variant="body2" color="text.secondary">
                              ... and {parsedChannels.length - 50} more channels
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button 
            onClick={() => setImportDialogOpen(false)}
            disabled={importing}
            startIcon={<CancelIcon />}
            color="inherit"
          >
            Cancel
          </Button>
          
          {parsedChannels.length > 0 && (
            <Button 
              onClick={handleImportChannels}
              variant="contained"
              disabled={importing || !importFormData.auto_create_channels}
              startIcon={importing ? <CircularProgress size={20} /> : <ImportIcon />}
              color="success"
              size="large"
            >
              {importing ? 'Importing...' : `Import ${parsedChannels.length} Channels`}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StreamManager;
