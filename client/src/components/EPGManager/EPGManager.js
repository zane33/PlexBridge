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
  Autocomplete,
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

// NZ timezone formatting function
const formatNZDateTime = (dateString) => {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  return date.toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

// Short NZ date formatting for Last Success column
const formatNZDateTimeShort = (dateString) => {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  return date.toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

function EPGManager() {
  const [activeTab, setActiveTab] = useState(0);
  const [epgSources, setEpgSources] = useState([]);
  const [channels, setChannels] = useState([]);
  const [epgPrograms, setEpgPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [refreshing, setRefreshing] = useState(null);
  const [epgStatus, setEpgStatus] = useState(null);
  const [availableEpgIds, setAvailableEpgIds] = useState([]);
  const [editingChannelEpg, setEditingChannelEpg] = useState(null);
  const [tempEpgId, setTempEpgId] = useState('');
  const [testingUrl, setTestingUrl] = useState(false);
  const [urlTestResult, setUrlTestResult] = useState(null);
  const [secondaryGenres, setSecondaryGenres] = useState({});
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    refresh_interval: '4h',
    enabled: true,
    category: '',
    secondary_genres: [],
  });
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const isExtraSmall = useMediaQuery(theme.breakpoints.down('xs'));

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
    fetchSecondaryGenres();
  }, []);

  useEffect(() => {
    if (activeTab === 1) {
      fetchEpgPrograms();
    } else if (activeTab === 2) {
      fetchAvailableEpgIds();
    }
  }, [activeTab]);

  const fetchSecondaryGenres = async () => {
    try {
      const response = await api.get('/api/epg/secondary-genres');
      setSecondaryGenres(response.data.genres || {});
    } catch (error) {
      console.error('Failed to fetch secondary genres:', error);
      enqueueSnackbar('Failed to load genre options', { variant: 'warning' });
    }
  };

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

  const fetchEpgPrograms = async (epgChannelId = null) => {
    setProgramsLoading(true);
    try {
      const params = {};

      // Expand time range to show past and future programs (24 hours ago to 7 days ahead)
      // This ensures we see recent programs even if they've ended
      const now = new Date();
      const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago
      const endTime = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days ahead

      params.start = startTime.toISOString();
      params.end = endTime.toISOString();

      // If we have a specific EPG channel ID, use it
      if (epgChannelId && epgChannelId !== 'all') {
        params.channel_id = epgChannelId;
      } else if (selectedChannelId && selectedChannelId !== 'all') {
        // If no EPG channel ID provided but we have a selected channel, get its EPG ID
        const selectedChannel = channels.find(c => c.id === selectedChannelId);
        if (selectedChannel?.epg_id) {
          params.channel_id = selectedChannel.epg_id;
        }
      }

      const response = await api.get('/api/epg', { params });
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
      const epgData = response.data.epg;
      
      // Enhance EPG status with additional context
      const enhancedStatus = {
        ...epgData,
        hasData: (epgData.programs?.total || 0) > 0,
        hasMapping: (epgData.channels?.mapped || 0) > 0,
        needsAttention: (epgData.programs?.total || 0) === 0 && (epgData.sources || []).length > 0
      };
      
      setEpgStatus(enhancedStatus);
      
      // Show helpful notification if no programs but sources exist
      if (enhancedStatus.needsAttention && enhancedStatus.channels?.total > 0) {
        console.info('EPG Notice: Sources configured but no programs loaded. Check channel mappings.');
      }
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
      category: '',
      secondary_genres: [],
    });
    setUrlTestResult(null);
    setDialogOpen(true);
  };

  const handleEdit = (source) => {
    setEditingSource(source);
    
    // Parse secondary_genres from JSON string if it exists
    let parsedSecondaryGenres = [];
    try {
      if (source.secondary_genres && typeof source.secondary_genres === 'string') {
        parsedSecondaryGenres = JSON.parse(source.secondary_genres);
      } else if (Array.isArray(source.secondary_genres)) {
        parsedSecondaryGenres = source.secondary_genres;
      }
    } catch (error) {
      console.warn('Failed to parse secondary genres:', error);
      parsedSecondaryGenres = [];
    }
    
    setFormData({
      name: source.name || '',
      url: source.url || '',
      refresh_interval: source.refresh_interval || '4h',
      enabled: source.enabled !== 0,
      category: source.category || '',
      secondary_genres: parsedSecondaryGenres,
    });
    setUrlTestResult(null);
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

  const handleTestUrl = async () => {
    if (!formData.url.trim()) {
      enqueueSnackbar('Please enter a URL to test', { variant: 'warning' });
      return;
    }

    setTestingUrl(true);
    setUrlTestResult(null);
    
    try {
      const response = await api.post('/api/epg/test-url', { url: formData.url.trim() });
      setUrlTestResult({
        success: true,
        message: response.data.message,
        details: response.data.details
      });
      enqueueSnackbar('URL test successful! ✅', { variant: 'success' });
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to test URL';
      setUrlTestResult({
        success: false,
        message: errorMessage,
        details: error.response?.data?.details || {}
      });
      enqueueSnackbar(errorMessage, { variant: 'error' });
    } finally {
      setTestingUrl(false);
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

  const handleRefresh = async (sourceId = null, forceInitialize = false) => {
    setRefreshing(sourceId || 'all');
    try {
      const payload = sourceId ? { source_id: sourceId } : {};
      if (forceInitialize) {
        payload.force_initialize = true;
      }
      
      await api.post('/api/epg/refresh', payload);
      
      const message = sourceId 
        ? `EPG refresh started for source${forceInitialize ? ' (with initialization)' : ''}` 
        : `EPG refresh started for all sources${forceInitialize ? ' (with initialization)' : ''}`;
      
      enqueueSnackbar(message, { variant: 'success' });
      
      // If force initialize was used, also try to initialize the service
      if (forceInitialize) {
        try {
          await api.post('/api/epg/initialize');
          enqueueSnackbar('EPG service initialized! ⚙️', { variant: 'info' });
        } catch (initError) {
          console.warn('EPG initialization warning:', initError);
        }
      }
      
      // Refresh status after a short delay
      setTimeout(() => {
        fetchEpgStatus();
        if (activeTab === 1) {
          fetchEpgPrograms();
        }
        if (activeTab === 2) {
          fetchAvailableEpgIds();
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
      
      if (!channel) {
        enqueueSnackbar('Channel not found in current data', { variant: 'error' });
        return;
      }

      // Only send the fields that the API validation expects
      const updatePayload = {
        name: channel.name,
        number: channel.number,
        enabled: Boolean(channel.enabled), // Convert number to boolean for validation
        logo: channel.logo || null,
        epg_id: tempEpgId.trim() || null
      };
      
      await api.put(`/api/channels/${channelId}`, updatePayload);
      
      enqueueSnackbar('EPG ID updated successfully! 🎉', { variant: 'success' });
      setEditingChannelEpg(null);
      setTempEpgId('');
      fetchChannels();
    } catch (error) {
      console.error('EPG ID update error:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.details?.[0] || 'Failed to update EPG ID';
      enqueueSnackbar(errorMessage, { variant: 'error' });
    }
  };

  const handleEpgIdCancel = () => {
    setEditingChannelEpg(null);
    setTempEpgId('');
  };

  const handleChannelSelectionChange = async (channelId) => {
    setSelectedChannelId(channelId);
    
    // If a specific channel is selected, get its EPG ID
    if (channelId && channelId !== 'all') {
      const selectedChannel = channels.find(c => c.id === channelId);
      const epgChannelId = selectedChannel?.epg_id;
      await fetchEpgPrograms(epgChannelId);
    } else {
      await fetchEpgPrograms('all');
    }
  };

  const handleAutoMapping = async () => {
    try {
      const response = await api.get('/api/epg/mapping-suggestions');
      const suggestions = response.data.suggestions || [];
      
      if (suggestions.length === 0) {
        enqueueSnackbar('No automatic mapping suggestions found', { variant: 'info' });
        return;
      }
      
      let mappedCount = 0;
      
      for (const suggestion of suggestions) {
        // Use the highest confidence suggestion
        const bestMatch = suggestion.suggestions.find(s => s.confidence === 'high') || suggestion.suggestions[0];
        
        if (bestMatch) {
          try {
            const channel = channels.find(c => c.id === suggestion.channel.id);
            if (channel) {
              // Only send the fields that the API validation expects
              await api.put(`/api/channels/${channel.id}`, {
                name: channel.name,
                number: channel.number,
                enabled: Boolean(channel.enabled), // Convert number to boolean for validation
                logo: channel.logo || null,
                epg_id: bestMatch.epg_id
              });
              mappedCount++;
            }
          } catch (error) {
            console.warn('Failed to auto-map channel:', suggestion.channel.name, error);
          }
        }
      }
      
      if (mappedCount > 0) {
        enqueueSnackbar(`Successfully auto-mapped ${mappedCount} channels! 🎉`, { 
          variant: 'success',
          autoHideDuration: 6000
        });
        fetchChannels();
        fetchEpgStatus();
        fetchAvailableEpgIds();
      } else {
        enqueueSnackbar('No channels could be auto-mapped', { variant: 'warning' });
      }
    } catch (error) {
      console.error('Auto-mapping failed:', error);
      enqueueSnackbar('Auto-mapping failed', { variant: 'error' });
    }
  };

  const handleDiagnoseMappings = async () => {
    try {
      const response = await api.get('/api/debug/epg');
      const data = response.data;
      
      const issues = [];
      
      if (data.invalid_mappings && data.invalid_mappings.length > 0) {
        issues.push(`${data.invalid_mappings.length} channels have invalid EPG IDs`);
      }
      
      if (data.summary.channels_with_programs === 0 && data.summary.total_epg_channels > 0) {
        issues.push('No programs loaded despite EPG channels being available');
      }
      
      if (data.summary.mapping_efficiency < 50) {
        issues.push(`Low mapping efficiency: ${data.summary.mapping_efficiency}%`);
      }
      
      if (issues.length > 0) {
        enqueueSnackbar(`Issues found: ${issues.join(', ')}`, { 
          variant: 'warning',
          autoHideDuration: 8000
        });
      } else {
        enqueueSnackbar('EPG mappings look good! ✓', { variant: 'success' });
      }
      
      console.log('EPG Diagnostics:', data);
    } catch (error) {
      console.error('Diagnostic failed:', error);
      enqueueSnackbar('Diagnostic check failed', { variant: 'error' });
    }
  };

  const renderSkeletonTable = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>URL</TableCell>
            <TableCell>Category</TableCell>
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
    <Box sx={{ width: '100%', maxWidth: '100%' }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems={isMobile ? "flex-start" : "center"}
        mb={3}
        flexDirection={isMobile ? "column" : "row"}
        gap={isMobile ? 2 : 0}
      >
        <Typography variant="h6">EPG Sources</Typography>

        <Box display="flex" gap={1} flexWrap="wrap">
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => handleRefresh()}
            disabled={refreshing === 'all'}
            size={isMobile ? "small" : "medium"}
          >
            {refreshing === 'all' ? <CircularProgress size={20} /> : 'Refresh All'}
          </Button>

          {epgStatus && !epgStatus.isInitialized && (
            <Button
              variant="contained"
              color="warning"
              startIcon={<RefreshIcon />}
              onClick={() => handleRefresh(null, true)}
              disabled={refreshing === 'all'}
              size={isMobile ? "small" : "medium"}
            >
              {refreshing === 'all' ? <CircularProgress size={20} /> : 'Fix & Refresh'}
            </Button>
          )}

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
        <Alert 
          severity={epgStatus.programs?.total > 0 ? "success" : "warning"} 
          sx={{ mb: 2 }} 
          icon={<InfoIcon />}
        >
          <Typography variant="body2" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            <span>📊 Total Programs: <strong>{epgStatus.programs?.total || 0}</strong></span>
            <span>📅 Upcoming 24h: <strong>{epgStatus.programs?.upcoming24h || 0}</strong></span>
            {epgStatus.channels && (
              <>
                <span>📺 Channels: <strong>{epgStatus.channels.mapped || 0}/{epgStatus.channels.total || 0}</strong> mapped</span>
                {epgStatus.mapping?.efficiency !== undefined && (
                  <span>⚡ Efficiency: <strong>{epgStatus.mapping.efficiency}%</strong></span>
                )}
              </>
            )}
            {epgStatus.programs?.total === 0 && epgStatus.channels?.epgAvailable > 0 && (
              <span style={{ color: '#f57c00' }}>⚠️ Check channel EPG mappings</span>
            )}
          </Typography>
          {epgStatus.programs?.total === 0 && epgStatus.channels?.total > 0 && (
            <Typography variant="caption" sx={{ mt: 1, display: 'block', fontStyle: 'italic' }}>
              Tip: Map your channels to EPG IDs in the "Channel Mapping" tab to see program data
            </Typography>
          )}
        </Alert>
      )}

      <Card sx={{ width: '100%', overflowX: 'auto' }}>
        <CardContent sx={{ p: { xs: 1, sm: 2, md: 3 }, '&:last-child': { pb: { xs: 1, sm: 2, md: 3 } } }}>
          {loading ? renderSkeletonTable() : (
            <TableContainer component={Paper} sx={{ width: '100%' }}>
              <Table sx={{ minWidth: { xs: 650, md: 750 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: { xs: 120, md: 150 } }}>Name</TableCell>
                    <TableCell sx={{ width: { md: 250, lg: 300 }, display: { xs: 'none', md: 'table-cell' } }}>URL</TableCell>
                    <TableCell sx={{ width: { xs: 100, md: 120 } }}>Category</TableCell>
                    <TableCell sx={{ width: { xs: 90, md: 100 } }}>Interval</TableCell>
                    <TableCell sx={{ width: { sm: 120, md: 140 }, display: { xs: 'none', sm: 'table-cell' } }}>Last Success</TableCell>
                    <TableCell sx={{ width: { xs: 80, md: 100 } }}>Status</TableCell>
                    <TableCell sx={{ width: { xs: 120, md: 150 } }}>Actions</TableCell>
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
                        {source.category ? (
                          <Box>
                            <Chip
                              label={source.category}
                              size="small"
                              color="secondary"
                              variant="outlined"
                            />
                            {(() => {
                              try {
                                const secondaryGenres = source.secondary_genres && typeof source.secondary_genres === 'string' 
                                  ? JSON.parse(source.secondary_genres)
                                  : Array.isArray(source.secondary_genres) ? source.secondary_genres : [];
                                
                                return secondaryGenres.length > 0 && (
                                  <Box mt={0.5} display="flex" flexWrap="wrap" gap={0.5}>
                                    {secondaryGenres.slice(0, 3).map((genre, index) => (
                                      <Chip
                                        key={index}
                                        label={genre}
                                        size="small"
                                        color="primary"
                                        variant="outlined"
                                        sx={{ fontSize: '0.7rem', height: '20px' }}
                                      />
                                    ))}
                                    {secondaryGenres.length > 3 && (
                                      <Chip
                                        label={`+${secondaryGenres.length - 3} more`}
                                        size="small"
                                        color="default"
                                        variant="outlined"
                                        sx={{ fontSize: '0.7rem', height: '20px' }}
                                      />
                                    )}
                                  </Box>
                                );
                              } catch (error) {
                                console.warn('Failed to parse secondary genres for display:', error);
                                return null;
                              }
                            })()}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.disabled">
                            Auto
                          </Typography>
                        )}
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
                          {formatNZDateTimeShort(source.last_success)}
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
    <Box data-testid="epg-program-guide" sx={{ width: '100%', maxWidth: '100%' }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems={isMobile ? "flex-start" : "center"}
        mb={3}
        flexDirection={isMobile ? "column" : "row"}
        gap={isMobile ? 2 : 0}
      >
        <Typography variant="h6">Program Guide</Typography>
        <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <FormControl
            variant="outlined"
            size="small"
            sx={{
              minWidth: isMobile ? '100%' : 250,
              maxWidth: isMobile ? '100%' : 400
            }}
          >
            <InputLabel>Channel</InputLabel>
            <Select
              value={selectedChannelId}
              onChange={(e) => handleChannelSelectionChange(e.target.value)}
              label="Channel"
              disabled={programsLoading}
              data-testid="channel-selector"
            >
              <MenuItem value="all">
                <em>All Channels</em>
              </MenuItem>
              {channels
                .filter(channel => channel.epg_id) // Only show channels with EPG IDs
                .map((channel) => (
                  <MenuItem key={channel.id} value={channel.id}>
                    {channel.number} - {channel.name}
                  </MenuItem>
                ))
              }
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => fetchEpgPrograms()}
            disabled={programsLoading}
            size={isMobile ? "small" : "medium"}
            sx={{ minWidth: isMobile ? 'auto' : 120 }}
          >
            {programsLoading ? <CircularProgress size={20} /> : 'Refresh'}
          </Button>
        </Box>
      </Box>

      {selectedChannelId !== 'all' && (
        <Alert severity="info" sx={{ mb: 2, width: '100%' }}>
          <Typography variant="body2">
            📺 Showing program guide for: <strong>
              {channels.find(c => c.id === selectedChannelId)?.number} - {channels.find(c => c.id === selectedChannelId)?.name}
            </strong>
            {channels.find(c => c.id === selectedChannelId)?.epg_id && (
              <span> (EPG ID: {channels.find(c => c.id === selectedChannelId)?.epg_id})</span>
            )}
          </Typography>
        </Alert>
      )}

      <Card sx={{ width: '100%' }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 }, '&:last-child': { pb: { xs: 2, sm: 3 } } }}>
          {programsLoading ? (
            <Box display="flex" flexDirection="column" gap={2}>
              {[...Array(5)].map((_, index) => (
                <Skeleton key={index} height={60} />
              ))}
            </Box>
          ) : (
            <List sx={{ width: '100%', px: 0 }}>
              {epgPrograms.slice(0, 20).map((program, index) => (
                <React.Fragment key={program.id || index}>
                  <ListItem
                    sx={{
                      width: '100%',
                      px: { xs: 1, sm: 2 },
                      py: { xs: 1.5, sm: 2 },
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'flex-start', sm: 'flex-start' },
                      gap: { xs: 1, sm: 0 }
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: { xs: 'auto', sm: 56 },
                        mr: { xs: 0, sm: 0 }
                      }}
                    >
                      <TvIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      sx={{ width: '100%', my: 0 }}
                      primary={
                        <Box sx={{ width: '100%' }}>
                          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 0.5 }}>
                            {program.title}
                          </Typography>
                          {selectedChannelId === 'all' && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              {program.channel_name} ({program.channel_number})
                            </Typography>
                          )}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ width: '100%', mt: 0.5 }}>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              display: 'flex',
                              gap: 1,
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              mb: program.description ? 0.5 : 0
                            }}
                          >
                            <Box component="span" sx={{ fontWeight: 500 }}>
                              {formatNZDateTime(program.start_time)} - {formatNZDateTime(program.end_time)}
                            </Box>
                          </Typography>
                          {program.description && (
                            <Typography
                              variant="body2"
                              sx={{
                                mt: 0.5,
                                color: 'text.primary',
                                display: '-webkit-box',
                                WebkitLineClamp: isMobile ? 2 : 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                lineHeight: 1.6,
                                maxWidth: '100%'
                              }}
                            >
                              {program.description}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < epgPrograms.slice(0, 20).length - 1 && <Divider variant="fullWidth" />}
                </React.Fragment>
              ))}
              {epgPrograms.length === 0 && (
                <Box display="flex" flexDirection="column" alignItems="center" gap={2} py={4}>
                  <ScheduleIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
                  <Typography variant="h6" color="text.secondary">
                    {selectedChannelId === 'all' ? 'No program data available' : 'No program data for selected channel'}
                  </Typography>
                  <Typography variant="body2" color="text.disabled">
                    {selectedChannelId === 'all' 
                      ? 'Add EPG sources and ensure channels have EPG IDs mapped'
                      : 'Check that this channel has a valid EPG ID and EPG data has been refreshed'
                    }
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
    <Box sx={{ width: '100%', maxWidth: '100%' }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems={isMobile ? "flex-start" : "center"}
        mb={3}
        flexDirection={isMobile ? "column" : "row"}
        gap={isMobile ? 2 : 0}
      >
        <Typography variant="h6">Channel EPG Mapping</Typography>

        <Box display="flex" gap={1} flexWrap="wrap">
          <Button
            variant="outlined"
            size={isMobile ? "small" : "medium"}
            onClick={handleAutoMapping}
            disabled={!availableEpgIds.length}
            startIcon={<CheckIcon />}
          >
            Auto-Map Channels
          </Button>
          <Button
            variant="outlined"
            size={isMobile ? "small" : "medium"}
            onClick={handleDiagnoseMappings}
            startIcon={<InfoIcon />}
          >
            Diagnose Issues
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2, width: '100%' }}>
        <Typography variant="body2">
          🔗 Map your channels to EPG IDs from your XMLTV sources to get program guide data.
          Click the EPG ID chip to edit inline. Use "Auto-Map Channels" for smart suggestions.
        </Typography>
      </Alert>

      {availableEpgIds.length > 0 && (
        <Card sx={{ mb: 2, width: '100%' }}>
          <CardContent sx={{ p: { xs: 2, sm: 3 }, '&:last-child': { pb: { xs: 2, sm: 3 } } }}>
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

      <Card sx={{ width: '100%' }}>
        <CardContent sx={{ p: { xs: 1, sm: 2, md: 3 }, '&:last-child': { pb: { xs: 1, sm: 2, md: 3 } } }}>
          <List sx={{ width: '100%', px: 0 }}>
            {channels.map((channel, index) => (
              <React.Fragment key={channel.id}>
                <ListItem
                  sx={{
                    width: '100%',
                    px: { xs: 1, sm: 2 },
                    py: { xs: 1.5, sm: 2 },
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    gap: { xs: 1, sm: 0 }
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: { xs: 'auto', sm: 56 },
                      mr: { xs: 0, sm: 0 }
                    }}
                  >
                    <TvIcon color={channel.epg_id ? 'primary' : 'disabled'} />
                  </ListItemIcon>
                  <ListItemText
                    sx={{ width: '100%', my: 0 }}
                    primary={
                      <Box
                        display="flex"
                        alignItems={isMobile ? "flex-start" : "center"}
                        gap={2}
                        flexDirection={isMobile ? "column" : "row"}
                        sx={{ width: '100%' }}
                      >
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
    <Box sx={{ width: '100%', maxWidth: '100%' }}>
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

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3, width: '100%' }}>
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          variant={isMobile ? "fullWidth" : "standard"}
          scrollButtons={isMobile ? "auto" : false}
          allowScrollButtonsMobile={isMobile}
          sx={{
            width: '100%',
            '& .MuiTab-root': {
              minHeight: isMobile ? 48 : 72,
              fontSize: isMobile ? '0.875rem' : '1rem',
              textTransform: 'none',
              fontWeight: 600,
            },
            '& .MuiTab-iconWrapper': {
              marginBottom: isMobile ? '2px' : '4px',
            }
          }}
        >
          <Tab
            label={isMobile ? "Sources" : "EPG Sources"}
            icon={<LinkIcon sx={{ fontSize: isMobile ? 18 : 24 }} />}
          />
          <Tab
            label={isMobile ? "Programs" : "Program Guide"}
            icon={<ScheduleIcon sx={{ fontSize: isMobile ? 18 : 24 }} />}
          />
          <Tab
            label={isMobile ? "Mapping" : "Channel Mapping"}
            icon={<TvIcon sx={{ fontSize: isMobile ? 18 : 24 }} />}
          />
        </Tabs>
      </Box>

      {activeTab === 0 && renderSourcesTab()}
      {activeTab === 1 && renderProgramsTab()}
      {activeTab === 2 && renderChannelMappingTab()}

      {/* EPG Source Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => {
          if (!saving) {
            setDialogOpen(false);
            setUrlTestResult(null);
          }
        }}
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
              <Button
                variant="outlined"
                startIcon={testingUrl ? <CircularProgress size={20} /> : <LinkIcon />}
                onClick={handleTestUrl}
                disabled={testingUrl || !formData.url.trim() || saving}
                fullWidth
                sx={{ mb: 2 }}
              >
                {testingUrl ? 'Testing URL...' : 'Test URL'}
              </Button>
              
              {urlTestResult && (
                <Alert 
                  severity={urlTestResult.success ? 'success' : 'error'} 
                  sx={{ mb: 2 }}
                  onClose={() => setUrlTestResult(null)}
                >
                  <Typography variant="body2" fontWeight="bold">
                    {urlTestResult.success ? '✅ URL Test Successful' : '❌ URL Test Failed'}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {urlTestResult.message}
                  </Typography>
                  {urlTestResult.details && urlTestResult.success && (
                    <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
                      <Typography variant="caption" display="block">
                        <strong>Status:</strong> {urlTestResult.details.status}
                      </Typography>
                      <Typography variant="caption" display="block">
                        <strong>Content Type:</strong> {urlTestResult.details.contentType || 'Not specified'}
                      </Typography>
                      {urlTestResult.details.isXMLTV && (
                        <Typography variant="caption" display="block" color="success.main">
                          <strong>✓ Valid XMLTV format detected</strong>
                        </Typography>
                      )}
                    </Box>
                  )}
                </Alert>
              )}
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
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  Plex Category
                </Typography>
                <Tooltip 
                  title="Categories help Plex organize recordings into the correct library (TV Shows vs Movies). PlexBridge automatically adds appropriate genre tags for better classification."
                  arrow
                  placement="top"
                >
                  <InfoIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
                </Tooltip>
              </Box>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Plex Category</InputLabel>
                <Select
                  value={formData.category}
                  onChange={(e) => {
                    const newCategory = e.target.value;
                    handleInputChange('category', newCategory);
                    // Clear secondary genres when primary category changes
                    if (newCategory !== formData.category) {
                      handleInputChange('secondary_genres', []);
                    }
                  }}
                  label="Plex Category"
                  disabled={saving}
                >
                  <MenuItem value="">
                    <em>Auto-detect (Use original EPG categories)</em>
                  </MenuItem>
                  <MenuItem value="News">News (News bulletins, current affairs)</MenuItem>
                  <MenuItem value="Movie">Movies (Films, documentaries)</MenuItem>
                  <MenuItem value="Series">TV Series (Shows, episodic content)</MenuItem>
                  <MenuItem value="Sports">Sports (Live events, sports talk)</MenuItem>
                </Select>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Plex will use this to determine if recordings go to your TV Shows or Movies library
                </Typography>
              </FormControl>
            </Grid>
            
            {/* Secondary Genres Selection - Only show if primary category is selected */}
            {formData.category && secondaryGenres[formData.category] && (
              <Grid item xs={12}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Secondary Genres (Optional)
                  </Typography>
                  <Tooltip 
                    title={`Select specific genres for ${formData.category} content. These will enhance Plex's classification and add more detailed metadata to your programs.`}
                    arrow
                    placement="top"
                  >
                    <InfoIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
                  </Tooltip>
                </Box>
                <Autocomplete
                  multiple
                  id="secondary-genres"
                  options={secondaryGenres[formData.category] || []}
                  value={formData.secondary_genres || []}
                  onChange={(event, newValue) => {
                    handleInputChange('secondary_genres', newValue);
                  }}
                  filterSelectedOptions
                  disabled={saving}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        variant="outlined"
                        label={option}
                        color="primary"
                        size="small"
                        {...getTagProps({ index })}
                        key={option}
                      />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      variant="outlined"
                      label="Select Secondary Genres"
                      placeholder={formData.secondary_genres?.length === 0 ? "Choose genres..." : "Add more genres..."}
                      helperText={`Available genres for ${formData.category} content. Leave empty to use auto-detection.`}
                    />
                  )}
                  sx={{
                    '& .MuiAutocomplete-tag': {
                      margin: '2px',
                    }
                  }}
                />
                <Box mt={1}>
                  <Typography variant="caption" color="text.secondary">
                    💡 Tip: Select 2-3 relevant genres for best results. These will be combined with the primary category.
                  </Typography>
                </Box>
              </Grid>
            )}
            
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
            onClick={() => {
              setDialogOpen(false);
              setUrlTestResult(null);
            }}
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
