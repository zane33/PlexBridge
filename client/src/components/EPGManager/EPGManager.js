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
  Tabs,
  Tab,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  Tv as TvIcon,
  Link as LinkIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';

const REFRESH_INTERVALS = [
  { value: '30m', label: 'Every 30 minutes' },
  { value: '1h', label: 'Every hour' },
  { value: '2h', label: 'Every 2 hours' },
  { value: '4h', label: 'Every 4 hours' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: '1d', label: 'Daily' },
];

function EPGManager() {
  const [activeTab, setActiveTab] = useState(0);
  const [epgSources, setEpgSources] = useState([]);
  const [channels, setChannels] = useState([]);
  const [epgPrograms, setEpgPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [refreshing, setRefreshing] = useState(null);
  const [epgStatus, setEpgStatus] = useState(null);
  const [availableEpgIds, setAvailableEpgIds] = useState([]);
  const [editingChannelEpg, setEditingChannelEpg] = useState(null);
  const [tempEpgId, setTempEpgId] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    refresh_interval: '4h',
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
    return {
      nameError: !formData.name.trim(),
      urlError: !formData.url.trim(),
      nameHelperText: !formData.name.trim() ? "Source name is required" : "",
      urlHelperText: !formData.url.trim() ? "XMLTV URL is required" : ""
    };
  }, [formData.name, formData.url]);

  useEffect(() => {
    fetchEpgSources();
    fetchChannels();
    fetchEpgStatus();
  }, []);

  useEffect(() => {
    if (activeTab === 1) {
      fetchEpgPrograms();
    } else if (activeTab === 2) {
      fetchAvailableEpgIds();
    }
  }, [activeTab]);

  const fetchAvailableEpgIds = async () => {
    try {
      console.log('EPG Manager: Fetching available EPG IDs...');
      
      // Get all available EPG channels from the consolidated endpoint
      const channelsResponse = await api.get('/api/epg/channels');
      console.log('EPG Manager: EPG channels response:', channelsResponse.data);
      
      if (channelsResponse.data && channelsResponse.data.available_channels) {
        const allEpgIds = channelsResponse.data.available_channels
          .filter(ch => ch && ch.epg_id) // Only include valid channels with EPG IDs
          .map(ch => ({
            epg_id: ch.epg_id,
            program_count: ch.program_count || 0,
            source_name: ch.source_name || 'Unknown Source',
            channel_name: ch.channel_name || ch.epg_id,
            icon_url: ch.icon_url,
            source_id: ch.source_id
          }));
        
        console.log('EPG Manager: Total EPG IDs found:', allEpgIds.length);
        setAvailableEpgIds(allEpgIds);
        
        if (allEpgIds.length === 0) {
          enqueueSnackbar('No EPG channel IDs found. Check EPG sources and refresh.', { 
            variant: 'info',
            autoHideDuration: 6000
          });
        }
      } else {
        console.warn('EPG Manager: No available_channels found in response');
        setAvailableEpgIds([]);
        enqueueSnackbar('No EPG channel IDs found. Check EPG sources and refresh.', { 
          variant: 'info',
          autoHideDuration: 6000
        });
      }
    } catch (error) {
      console.error('EPG Manager: Failed to fetch available EPG IDs:', error);
      enqueueSnackbar('Failed to load EPG data. Check EPG sources.', { variant: 'error' });
      setAvailableEpgIds([]); // Ensure we have an empty array on error
    }
  };

  const fetchEpgSources = async () => {
    try {
      const response = await api.get('/api/epg/sources');
      setEpgSources(response.data);
      setLoading(false);
    } catch (error) {
      enqueueSnackbar('Failed to fetch EPG sources', { variant: 'error' });
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

  const fetchEpgPrograms = async () => {
    setProgramsLoading(true);
    try {
      const response = await api.get('/api/epg');
      setEpgPrograms(response.data.programs || []);
    } catch (error) {
      enqueueSnackbar('Failed to fetch EPG programs', { variant: 'error' });
    } finally {
      setProgramsLoading(false);
    }
  };

  const fetchEpgStatus = async () => {
    try {
      const response = await api.get('/api/metrics');
      setEpgStatus(response.data.epg);
    } catch (error) {
      console.error('Failed to fetch EPG status:', error);
    }
  };

  const handleCreate = () => {
    setEditingSource(null);
    setFormData({
      name: '',
      url: '',
      refresh_interval: '4h',
      enabled: true,
    });
    setDialogOpen(true);
  };

  const handleEdit = (source) => {
    setEditingSource(source);
    setFormData({
      name: source.name || '',
      url: source.url || '',
      refresh_interval: source.refresh_interval || '4h',
      enabled: source.enabled !== 0,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (formValidation.nameError || formValidation.urlError) {
      enqueueSnackbar('Please fill in all required fields', { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        name: formData.name.trim(),
        url: formData.url.trim(),
      };

      if (editingSource) {
        await api.put(`/api/epg/sources/${editingSource.id}`, data);
        enqueueSnackbar('EPG source updated successfully! 🎉', { variant: 'success' });
      } else {
        await api.post('/api/epg/sources', data);
        enqueueSnackbar('EPG source created successfully! 🎉', { variant: 'success' });
      }

      setDialogOpen(false);
      fetchEpgSources();
      fetchEpgStatus();
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to save EPG source';
      enqueueSnackbar(errorMessage, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (source) => {
    if (window.confirm(`Are you sure you want to delete EPG source "${source.name}"? This will also remove all associated program data.`)) {
      setDeleting(source.id);
      try {
        await api.delete(`/api/epg/sources/${source.id}`);
        enqueueSnackbar('EPG source deleted successfully 🗑️', { variant: 'success' });
        fetchEpgSources();
        fetchEpgStatus();
      } catch (error) {
        enqueueSnackbar('Failed to delete EPG source', { variant: 'error' });
      } finally {
        setDeleting(null);
      }
    }
  };

  const handleRefresh = async (sourceId = null) => {
    setRefreshing(sourceId || 'all');
    try {
      await api.post('/api/epg/refresh', sourceId ? { source_id: sourceId } : {});
      enqueueSnackbar(
        sourceId ? 'EPG refresh started for source' : 'EPG refresh started for all sources', 
        { variant: 'success' }
      );
      
      // Refresh status after a short delay
      setTimeout(() => {
        fetchEpgStatus();
        if (activeTab === 1) {
          fetchEpgPrograms();
        }
      }, 2000);
    } catch (error) {
      enqueueSnackbar('Failed to start EPG refresh', { variant: 'error' });
    } finally {
      setRefreshing(null);
    }
  };

  const handleEpgIdEdit = (channel) => {
    setEditingChannelEpg(channel.id);
    setTempEpgId(channel.epg_id || '');
  };

  const handleEpgIdSave = async (channelId) => {
    try {
      const channel = channels.find(c => c.id === channelId);
      await api.put(`/api/channels/${channelId}`, {
        ...channel,
        epg_id: tempEpgId.trim() || null
      });
      
      enqueueSnackbar('EPG ID updated successfully! 🎉', { variant: 'success' });
      setEditingChannelEpg(null);
      setTempEpgId('');
      fetchChannels();
    } catch (error) {
      enqueueSnackbar('Failed to update EPG ID', { variant: 'error' });
    }
  };

  const handleEpgIdCancel = () => {
    setEditingChannelEpg(null);
    setTempEpgId('');
  };

  const renderSkeletonTable = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>URL</TableCell>
            <TableCell>Interval</TableCell>
            <TableCell>Last Success</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[...Array(3)].map((_, index) => (
            <TableRow key={index}>
              <TableCell><Skeleton width={120} /></TableCell>
              <TableCell><Skeleton width={200} /></TableCell>
              <TableCell><Skeleton width={80} /></TableCell>
              <TableCell><Skeleton width={100} /></TableCell>
              <TableCell><Skeleton width={80} /></TableCell>
              <TableCell><Skeleton width={100} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderSourcesTab = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6">EPG Sources</Typography>
        
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => handleRefresh()}
            disabled={refreshing === 'all'}
            size={isMobile ? "small" : "medium"}
          >
            {refreshing === 'all' ? <CircularProgress size={20} /> : 'Refresh All'}
          </Button>
          
          {!isMobile && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreate}
            >
              Add Source
            </Button>
          )}
        </Box>
      </Box>

      {epgStatus && (
        <Alert severity="info" sx={{ mb: 2 }} icon={<InfoIcon />}>
          <Typography variant="body2">
            📊 Total Programs: {epgStatus.programs?.total || 0} | 
            📅 Upcoming 24h: {epgStatus.programs?.upcoming24h || 0}
          </Typography>
        </Alert>
      )}

      <Card>
        <CardContent>
          {loading ? renderSkeletonTable() : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 150 }}>Name</TableCell>
                    <TableCell sx={{ minWidth: 250, display: { xs: 'none', md: 'table-cell' } }}>URL</TableCell>
                    <TableCell sx={{ minWidth: 100 }}>Interval</TableCell>
                    <TableCell sx={{ minWidth: 120, display: { xs: 'none', sm: 'table-cell' } }}>Last Success</TableCell>
                    <TableCell sx={{ minWidth: 100 }}>Status</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {epgSources.map((source) => (
                    <TableRow key={source.id} hover>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <LinkIcon sx={{ mr: 1, color: 'primary.main' }} />
                          <Typography variant="body2" fontWeight="bold">
                            {source.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ 
                            maxWidth: 250,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {source.url}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={source.refresh_interval}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Typography variant="body2" color="text.secondary">
                          {source.last_success 
                            ? new Date(source.last_success).toLocaleDateString('en-NZ', {
                                timeZone: 'Pacific/Auckland',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                              })
                            : 'Never'
                          }
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={source.enabled ? 'Enabled' : 'Disabled'}
                          color={source.enabled ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={1}>
                          <Tooltip title="Refresh Source">
                            <IconButton 
                              onClick={() => handleRefresh(source.id)}
                              size="small"
                              color="info"
                              disabled={refreshing === source.id}
                            >
                              {refreshing === source.id ? (
                                <CircularProgress size={20} />
                              ) : (
                                <RefreshIcon />
                              )}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit Source">
                            <IconButton 
                              onClick={() => handleEdit(source)} 
                              size="small"
                              color="primary"
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Source">
                            <IconButton
                              onClick={() => handleDelete(source)}
                              size="small"
                              color="error"
                              disabled={deleting === source.id}
                            >
                              {deleting === source.id ? (
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
                  {epgSources.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                        <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                          <ScheduleIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
                          <Typography variant="h6" color="text.secondary">
                            No EPG sources found
                          </Typography>
                          <Typography variant="body2" color="text.disabled">
                            Add an XMLTV source to get program guide data
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );

  const renderProgramsTab = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6">Program Guide</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchEpgPrograms}
          disabled={programsLoading}
        >
          {programsLoading ? <CircularProgress size={20} /> : 'Refresh'}
        </Button>
      </Box>

      <Card>
        <CardContent>
          {programsLoading ? (
            <Box display="flex" flexDirection="column" gap={2}>
              {[...Array(5)].map((_, index) => (
                <Skeleton key={index} height={60} />
              ))}
            </Box>
          ) : (
            <List>
              {epgPrograms.slice(0, 20).map((program, index) => (
                <React.Fragment key={program.id || index}>
                  <ListItem>
                    <ListItemIcon>
                      <TvIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box>
                          <Typography variant="subtitle1" fontWeight="bold">
                            {program.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {program.channel_name} ({program.channel_number})
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            {new Date(program.start_time).toLocaleString()} - 
                            {new Date(program.end_time).toLocaleString()}
                          </Typography>
                          {program.description && (
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                              {program.description.length > 100 
                                ? `${program.description.substring(0, 100)}...`
                                : program.description
                              }
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < epgPrograms.slice(0, 20).length - 1 && <Divider />}
                </React.Fragment>
              ))}
              {epgPrograms.length === 0 && (
                <Box display="flex" flexDirection="column" alignItems="center" gap={2} py={4}>
                  <ScheduleIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
                  <Typography variant="h6" color="text.secondary">
                    No program data available
                  </Typography>
                  <Typography variant="body2" color="text.disabled">
                    Add EPG sources and ensure channels have EPG IDs mapped
                  </Typography>
                </Box>
              )}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );

  const renderChannelMappingTab = () => (
    <Box>
      <Typography variant="h6" mb={3}>Channel EPG Mapping</Typography>
      
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          🔗 Map your channels to EPG IDs from your XMLTV sources to get program guide data.
          Click the EPG ID chip to edit inline. Available EPG IDs are shown below.
        </Typography>
      </Alert>

      {availableEpgIds.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight="bold" mb={1}>
              📺 Available EPG IDs from Sources:
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={1}>
              {availableEpgIds.map((epgData, index) => (
                <Chip
                  key={index}
                  label={`${epgData.channel_name || epgData.epg_id} (${epgData.program_count} programs)`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  onClick={() => setTempEpgId(epgData.epg_id)}
                  sx={{ cursor: 'pointer' }}
                  title={`EPG ID: ${epgData.epg_id}${epgData.source_name ? ` | Source: ${epgData.source_name}` : ''}`}
                />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <List>
            {channels.map((channel, index) => (
              <React.Fragment key={channel.id}>
                <ListItem>
                  <ListItemIcon>
                    <TvIcon color={channel.epg_id ? 'primary' : 'disabled'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={2}>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {channel.number} - {channel.name}
                        </Typography>
                        
                        {editingChannelEpg === channel.id ? (
                          <Box display="flex" alignItems="center" gap={1}>
                            <FormControl size="small" sx={{ width: 200 }}>
                              <InputLabel>Select EPG ID</InputLabel>
                              <Select
                                value={tempEpgId}
                                onChange={(e) => setTempEpgId(e.target.value)}
                                label="Select EPG ID"
                              >
                                <MenuItem value="">
                                  <em>No EPG</em>
                                </MenuItem>
                                {availableEpgIds.filter(epgData => epgData && epgData.epg_id).map((epgData, index) => (
                                  <MenuItem key={index} value={epgData.epg_id || ''}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, py: 0.5 }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography fontWeight="bold" color="primary">
                                          {epgData.channel_name || epgData.epg_id || 'Unknown'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          ({epgData.program_count || 0} programs)
                                        </Typography>
                                      </Box>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="caption" color="text.secondary">
                                          ID: {epgData.epg_id || 'Unknown'}
                                        </Typography>
                                        {epgData.source_name && (
                                          <Chip 
                                            label={epgData.source_name} 
                                            size="small" 
                                            variant="outlined"
                                          />
                                        )}
                                      </Box>
                                    </Box>
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                            <IconButton 
                              size="small" 
                              color="primary" 
                              onClick={() => handleEpgIdSave(channel.id)}
                            >
                              <SaveIcon />
                            </IconButton>
                            <IconButton 
                              size="small" 
                              onClick={handleEpgIdCancel}
                            >
                              <CancelIcon />
                            </IconButton>
                          </Box>
                        ) : (
                          <Chip 
                            label={channel.epg_id ? `EPG: ${channel.epg_id}` : 'Set EPG ID'} 
                            size="small" 
                            color={channel.epg_id ? 'success' : 'default'}
                            variant="outlined"
                            onClick={() => handleEpgIdEdit(channel)}
                            sx={{ cursor: 'pointer' }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary">
                        {channel.epg_id 
                          ? 'Channel is mapped to EPG data - click chip to edit'
                          : 'Click chip to assign EPG ID from your sources'
                        }
                      </Typography>
                    }
                  />
                </ListItem>
                {index < channels.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </CardContent>
      </Card>
    </Box>
  );

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
          EPG Manager
        </Typography>
        
        {isMobile && (
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

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="EPG Sources" icon={<LinkIcon />} />
          <Tab label="Program Guide" icon={<ScheduleIcon />} />
          <Tab label="Channel Mapping" icon={<TvIcon />} />
        </Tabs>
      </Box>

      {activeTab === 0 && renderSourcesTab()}
      {activeTab === 1 && renderProgramsTab()}
      {activeTab === 2 && renderChannelMappingTab()}

      {/* EPG Source Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => !saving && setDialogOpen(false)}
        maxWidth="sm" 
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Typography variant="h5" component="div">
            {editingSource ? '✏️ Edit EPG Source' : '➕ Add EPG Source'}
          </Typography>
        </DialogTitle>
        
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                autoFocus
                label="Source Name *"
                fullWidth
                variant="outlined"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                error={formValidation.nameError}
                helperText={formValidation.nameHelperText}
                disabled={saving}
                placeholder="My XMLTV Source"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="XMLTV URL *"
                fullWidth
                variant="outlined"
                value={formData.url}
                onChange={(e) => handleInputChange('url', e.target.value)}
                error={formValidation.urlError}
                helperText={formValidation.urlHelperText}
                disabled={saving}
                placeholder="https://example.com/epg.xml"
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Refresh Interval</InputLabel>
                <Select
                  value={formData.refresh_interval}
                  onChange={(e) => handleInputChange('refresh_interval', e.target.value)}
                  label="Refresh Interval"
                  disabled={saving}
                >
                  {REFRESH_INTERVALS.map((interval) => (
                    <MenuItem key={interval.value} value={interval.value}>
                      {interval.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
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
                    {formData.enabled ? '✅ Source Enabled' : '❌ Source Disabled'}
                  </Typography>
                }
              />
            </Grid>
          </Grid>

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              📊 XMLTV files should contain channel and program data. 
              Make sure to set EPG IDs in your channels to match the channel IDs in the XMLTV file.
            </Typography>
          </Alert>
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
            disabled={saving || formValidation.nameError || formValidation.urlError}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            color="primary"
            size="large"
          >
            {saving ? 'Saving...' : 'Save Source'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default EPGManager;
