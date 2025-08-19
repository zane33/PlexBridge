import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  InputAdornment,
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
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api, { m3uApi } from '../../services/api';
import socketService from '../../services/socket';
import EnhancedVideoPlayer from '../VideoPlayer/EnhancedVideoPlayer';
import SimpleVideoPlayer from '../VideoPlayer/SimpleVideoPlayer';
import VirtualizedChannelTable from '../VirtualizedTable';

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
  const [importPage, setImportPage] = useState(0);
  const [importRowsPerPage, setImportRowsPerPage] = useState(25);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedChannels, setParsedChannels] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [availableGroups, setAvailableGroups] = useState([]);
  const [parsingProgress, setParsingProgress] = useState({
    show: false,
    progress: 0,
    stage: '',
    message: '',
    sessionId: null
  });
  const [importFormData, setImportFormData] = useState({
    url: '',
    type: 'hls',
    auth_username: '',
    auth_password: '',
    auto_create_channels: true, // Default to true for M3U imports
    isM3UMode: false, // Track if this is an M3U import
  });
  const [enhancedPlayerOpen, setEnhancedPlayerOpen] = useState(false);
  const [currentStream, setCurrentStream] = useState(null);
  const [useEnhancedPlayer, setUseEnhancedPlayer] = useState(true);
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

  // Memoized pagination handlers for better performance
  const handleImportPageChange = useCallback((event, newPage) => {
    setImportPage(newPage);
  }, []);

  const handleImportRowsPerPageChange = useCallback((event) => {
    setImportRowsPerPage(parseInt(event.target.value, 10));
    setImportPage(0);
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

  // Debounce search query to improve performance with large datasets
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Emergency optimized filtering with chunked processing for large datasets
  const filteredChannels = useMemo(() => {
    // Emergency size limit to prevent total freeze
    if (parsedChannels.length > 200000) {
      enqueueSnackbar('⚠️ Dataset too large (200K+ channels). Please use API or contact support for enterprise solutions.', { variant: 'error' });
      return parsedChannels.slice(0, 10000); // Emergency fallback
    }
    
    let filtered = parsedChannels;

    // Apply search filter with debounced query
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      
      // For very large datasets, use more efficient filtering
      if (parsedChannels.length > 50000) {
        // Emergency: Limit search processing to prevent freeze
        filtered = parsedChannels.slice(0, 50000).filter(channel => 
          channel.name.toLowerCase().includes(query) ||
          (channel.attributes?.['group-title'] || '').toLowerCase().includes(query) ||
          (channel.attributes?.['tvg-id'] || '').toLowerCase().includes(query)
        );
        
        if (filtered.length === 0 && parsedChannels.length > 50000) {
          enqueueSnackbar('🔍 Search limited to first 50K channels for performance. Use group filters for better results.', { variant: 'warning' });
        }
      } else {
        filtered = filtered.filter(channel => 
          channel.name.toLowerCase().includes(query) ||
          (channel.attributes?.['group-title'] || '').toLowerCase().includes(query) ||
          (channel.attributes?.['tvg-id'] || '').toLowerCase().includes(query)
        );
      }
      
      // Emergency limit for search results
      if (filtered.length > 10000) {
        filtered = filtered.slice(0, 10000);
      }
    }

    // Apply group filter
    if (groupFilter && groupFilter !== '') {
      filtered = filtered.filter(channel => 
        (channel.attributes?.['group-title'] || 'Ungrouped') === groupFilter
      );
    }

    return filtered;
  }, [parsedChannels, debouncedSearchQuery, groupFilter, enqueueSnackbar]);

  // Reset pagination when filtering changes
  useEffect(() => {
    setImportPage(0);
  }, [debouncedSearchQuery, groupFilter]);

  // WebSocket listener for M3U parsing progress
  useEffect(() => {
    const socket = socketService.getSocket();
    if (socket) {
      const handleM3UProgress = (data) => {
        setParsingProgress(prev => {
          // Only update if this is our current session or we don't have a session yet
          if (!prev.sessionId || prev.sessionId === data.sessionId) {
            // Don't auto-hide on backend completion - frontend manages final stages
            return {
              show: !data.error, // Only hide on error
              progress: data.progress,
              stage: data.stage,
              message: data.message,
              sessionId: data.sessionId
            };
          }
          return prev;
        });

        // Only hide progress on error (frontend handles normal completion)
        if (data.error) {
          setTimeout(() => {
            setParsingProgress(prev => ({ ...prev, show: false }));
          }, 2000);
        }
      };

      socket.on('m3uProgress', handleM3UProgress);
      return () => socket.off('m3uProgress', handleM3UProgress);
    }
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
        type: 'hls', // Always default to HLS for M3U imports
        auth_username: formData.auth_username || '',
        auth_password: formData.auth_password || '',
        auto_create_channels: true, // Enable by default for M3U imports
        isM3UMode: true, // Mark as M3U mode
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
    setSelectedChannels([]);
    setImportFormData({
      url: '',
      type: 'hls',
      auth_username: '',
      auth_password: '',
      auto_create_channels: true, // Default to true for M3U imports
      isM3UMode: true, // Set to true for M3U import
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
    setParsedChannels([]); // Clear previous results
    setSelectedChannels([]);
    
    try {
      // Reset progress and show initial state
      setParsingProgress({
        show: true,
        progress: 0,
        stage: 'starting',
        message: 'Starting optimized M3U parsing...',
        sessionId: null
      });
      
      enqueueSnackbar('Starting optimized M3U parsing with real-time updates...', { variant: 'info' });
      
      let allChannels = [];
      let sessionId = null;
      
      // Use auto-selecting parser (streaming for large playlists)
      await m3uApi.parsePlaylistAuto(importFormData.url.trim(), {
        onProgress: (data) => {
          setParsingProgress(prev => ({
            ...prev,
            sessionId: data.sessionId || sessionId,
            stage: data.stage,
            progress: data.progress,
            message: data.message
          }));
        },
        
        onChannels: (data) => {
          // Progressive channel loading for streaming parser with emergency limits
          allChannels = data.allChannels || data.channels;
          sessionId = data.sessionId;
          
          // Emergency check for massive datasets
          if (allChannels.length > 200000) {
            enqueueSnackbar('🚨 Dataset exceeds 200K channels. Truncating for UI stability.', { variant: 'error' });
            allChannels = allChannels.slice(0, 200000);
          }
          
          // Update UI progressively with throttling for large datasets
          if (allChannels.length < 50000) {
            setParsedChannels([...allChannels]);
          } else {
            // For huge datasets, throttle UI updates
            if (allChannels.length % 5000 === 0) {
              setParsedChannels([...allChannels]);
            }
          }
          
          // Update progress to show live count
          setParsingProgress(prev => ({
            ...prev,
            sessionId,
            message: `Loaded ${allChannels.length} channels so far...`
          }));
          
          // For very large lists, provide user feedback with performance warnings
          if (allChannels.length > 0 && allChannels.length % 10000 === 0) {
            const message = allChannels.length > 100000 
              ? `⚠️ ${allChannels.length} channels loaded - UI performance may be impacted`
              : `📺 ${allChannels.length} channels loaded and ready for selection`;
            enqueueSnackbar(message, { variant: allChannels.length > 100000 ? 'warning' : 'info' });
          }
        },
        
        onComplete: (data) => {
          console.log('M3U Parse onComplete called with data:', data);
          sessionId = data.sessionId;
          
          // Final channel count
          const totalChannels = data.totalChannels || allChannels.length;
          console.log('Final channel count:', totalChannels, 'allChannels.length:', allChannels.length);
          
          try {
            setParsingProgress(prev => ({ 
              ...prev,
              sessionId,
              stage: 'organizing',
              progress: 95,
              message: 'Organizing channel groups and finalizing...'
            }));
            
            // Extract unique groups progressively to prevent main thread blocking
            const extractGroupsProgressively = async () => {
              console.log('Starting group extraction for', allChannels.length, 'channels');
              const groupSet = new Set();
              const CHUNK_SIZE = 1000;
            
            for (let i = 0; i < allChannels.length; i += CHUNK_SIZE) {
              const chunk = allChannels.slice(i, i + CHUNK_SIZE);
              
              // Process chunk in next frame to prevent blocking
              await new Promise(resolve => {
                requestIdleCallback(() => {
                  chunk.forEach(ch => {
                    const group = ch.attributes?.['group-title'] || 'Ungrouped';
                    if (group) groupSet.add(group);
                  });
                  resolve();
                }, { timeout: 50 });
              });
              
              // Update progress for very large datasets
              if (allChannels.length > 50000 && i % 5000 === 0) {
                setParsingProgress(prev => ({
                  ...prev,
                  message: `Organizing groups... ${Math.round((i / allChannels.length) * 100)}%`
                }));
              }
            }
            
            const groups = Array.from(groupSet).sort();
            setAvailableGroups(groups);
            return groups;
          };
          
            extractGroupsProgressively().catch(error => {
              console.error('Group extraction failed:', error);
              // Continue with default group if extraction fails
              setAvailableGroups(['Ungrouped']);
            });
            
            // CRITICAL: Set final parsed channels IMMEDIATELY
            console.log('Setting final parsed channels:', allChannels.length);
            setParsedChannels([...allChannels]);
            
            // Smart selection based on playlist size - deferred to prevent blocking
            setTimeout(() => {
              console.log('Setting selected channels based on playlist size:', totalChannels);
              if (totalChannels > 10000) {
                setSelectedChannels([]); // Don't select any for very large lists
                enqueueSnackbar(`🚀 Large playlist detected (${totalChannels} channels). Use search and filters to select specific channels for better performance.`, { variant: 'warning' });
              } else if (totalChannels > 1000) {
                setSelectedChannels([]); // Don't auto-select for large lists
                enqueueSnackbar(`📋 Medium playlist loaded (${totalChannels} channels). Select specific channels or groups for import.`, { variant: 'info' });
              } else {
                setSelectedChannels(allChannels.map((_, index) => index)); // Auto-select for small lists
              }
            }, 100); // Defer to next tick to prevent blocking
            
            // Final completion
            setParsingProgress(prev => ({ 
              ...prev,
              stage: 'complete',
              progress: 100,
              message: `Successfully loaded ${totalChannels} channels! Ready for selection.`,
              eta: null
            }));
            
            // Show different messages based on playlist size and performance
            if (totalChannels > 50000) {
              enqueueSnackbar(`🚀 Massive playlist loaded! ${totalChannels} channels processed efficiently using streaming technology.`, { variant: 'success' });
            } else if (totalChannels > 10000) {
              enqueueSnackbar(`📊 Large playlist loaded! ${totalChannels} channels ready for selection.`, { variant: 'success' });
            } else {
              enqueueSnackbar(`✅ Parsing complete! Found ${totalChannels} channels.`, { variant: 'success' });
            }
            
            // Auto-hide progress after completion
            setTimeout(() => {
              setParsingProgress(prev => ({ ...prev, show: false }));
            }, 3000);
            
          } catch (error) {
            console.error('Error in onComplete callback:', error);
            // Emergency fallback - still try to set the channels
            console.log('Emergency fallback: Setting channels despite error');
            setParsedChannels([...allChannels]);
            setAvailableGroups(['Ungrouped']);
            setSelectedChannels([]);
            
            setParsingProgress(prev => ({ 
              ...prev,
              stage: 'complete',
              progress: 100,
              message: `Loaded ${totalChannels} channels with minor issues`,
              eta: null
            }));
            
            enqueueSnackbar(`⚠️ Channels loaded but with some issues. ${totalChannels} channels available.`, { variant: 'warning' });
          }
        },
        
        onError: (error) => {
          throw new Error(error.error || 'Streaming parser failed');
        }
      });
      
      // Fallback: If auto parser returns data directly (legacy mode)
      if (!allChannels.length && arguments[0]?.data?.channels) {
        const response = arguments[0];
        allChannels = response.data.channels || [];
        setParsedChannels(allChannels);
        
        // Handle legacy response
        const groups = [...new Set(allChannels.map(ch => ch.attributes?.['group-title'] || 'Ungrouped').filter(Boolean))];
        setAvailableGroups(groups.sort());
        setSelectedChannels(allChannels.length > 1000 ? [] : allChannels.map((_, index) => index));
        
        setParsingProgress({
          show: true,
          progress: 100,
          stage: 'complete',
          message: `Legacy parser used: ${allChannels.length} channels loaded`,
          sessionId: response.data.sessionId
        });
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to parse stream source';
      enqueueSnackbar(errorMessage, { variant: 'error' });
      console.error('Parse error:', error);
      
      // Hide progress on error
      setParsingProgress(prev => ({ ...prev, show: false }));
    } finally {
      setImporting(false);
    }
  };

  const handleImportChannels = async () => {
    if (selectedChannels.length === 0) {
      enqueueSnackbar('No channels selected for import', { variant: 'warning' });
      return;
    }

    if (!importFormData.auto_create_channels) {
      enqueueSnackbar('Please enable "Auto-create channels" to import', { variant: 'warning' });
      return;
    }

    setImporting(true);
    try {
      // Filter to only selected channels
      const channelsToImport = parsedChannels.filter((_, index) => selectedChannels.includes(index));
      
      const response = await m3uApi.importChannels(importFormData.url, channelsToImport);

      const channelsCreated = response.data.channelsCreated || selectedChannels.length;
      const streamsCreated = response.data.streamsCreated || selectedChannels.length;

      enqueueSnackbar(
        `Successfully imported ${channelsCreated} channels and ${streamsCreated} streams! 🎉`,
        { variant: 'success' }
      );
      
      handleImportDialogClose();
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

  const handleImportDialogClose = () => {
    setImportDialogOpen(false);
    setParsedChannels([]);
    setSelectedChannels([]);
    setImportPage(0);
    setImportFormData({
      url: '',
      type: 'hls',
      auth_username: '',
      auth_password: '',
      auto_create_channels: true,
      isM3UMode: false,
    });
  };

  const handleTestStream = useCallback((stream) => {
    // Enhanced feedback for stream testing
    const streamData = {
      url: stream.url || stream,
      name: stream.name || 'Test Stream',
      type: stream.type || 'hls',
      channelId: stream.channel_id || stream.id,
      streamId: stream.id,
      id: stream.id
    };
    
    console.log('handleTestStream called with:', stream);
    console.log('streamData created:', streamData);
    
    setCurrentStream(streamData);
    setEnhancedPlayerOpen(true);
    
    // Provide user feedback
    enqueueSnackbar(
      `Opening ${streamData.name} in enhanced player...`, 
      { 
        variant: 'info',
        autoHideDuration: 2000,
        anchorOrigin: { vertical: 'bottom', horizontal: 'right' }
      }
    );
  }, [enqueueSnackbar]);

  const handleCloseEnhancedPlayer = () => {
    setEnhancedPlayerOpen(false);
    setCurrentStream(null);
  };

  const handlePlayerError = useCallback((error) => {
    console.error('Enhanced player error:', error);
    
    // Enhanced error messaging with recovery suggestions
    let errorMessage = `Player error: ${error.message}`;
    let suggestions = [];
    
    if (error.message.includes('CORS')) {
      suggestions.push('Try enabling proxy mode in player settings');
    }
    if (error.message.includes('Network')) {
      suggestions.push('Check your internet connection');
    }
    if (error.message.includes('format')) {
      suggestions.push('Try using an external player like VLC');
    }
    
    if (suggestions.length > 0) {
      errorMessage += `. Suggestions: ${suggestions.join(', ')}`;
    }
    
    enqueueSnackbar(errorMessage, { 
      variant: 'error',
      persist: true,
      anchorOrigin: { vertical: 'top', horizontal: 'center' }
    });
  }, [enqueueSnackbar]);


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
                data-testid="import-m3u-button"
              >
                Import M3U
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreate}
                size="large"
                data-testid="add-stream-button"
              >
                Add Stream
              </Button>
            </>
          ) : (
            <Fab
              color="primary"
              aria-label="add"
              onClick={handleCreate}
              data-testid="add-stream-fab"
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
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Typography 
                              variant="caption" 
                              color="primary"
                              sx={{ 
                                fontSize: '0.7rem'
                              }}
                            >
                              📡 Proxied via /stream/{stream.channel_id?.substring(0, 8)}...
                            </Typography>
                            <Tooltip title="Copy direct stream URL">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  navigator.clipboard.writeText(stream.url);
                                  enqueueSnackbar('Direct stream URL copied! 📋', { variant: 'success' });
                                }}
                                sx={{ p: 0.25 }}
                              >
                                <ContentCopyIcon sx={{ fontSize: '0.8rem' }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
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
                                data-testid="edit-stream-button"
                              >
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Preview Stream in Player" arrow>
                              <IconButton
                                onClick={() => {
                                  console.log('Preview button clicked for stream:', stream);
                                  handleTestStream(stream);
                                }}
                                size="small"
                                color="info"
                                data-testid="preview-stream-button"
                                sx={{
                                  transition: 'all 0.2s ease-in-out',
                                  '&:hover': {
                                    transform: 'scale(1.1)',
                                    bgcolor: 'info.main',
                                    color: 'white'
                                  }
                                }}
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
                                data-testid="delete-stream-button"
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
        data-testid="stream-dialog"
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
                data-testid="stream-name-input"
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
                data-testid="stream-url-input"
              />
            </Grid>
            
            {editingStream && (
              <Grid item xs={12}>
                <TextField
                  label="📡 PlexBridge Proxy URL (for Plex)"
                  fullWidth
                  variant="outlined"
                  value={`${window.location.origin}/stream/${editingStream.channel_id}`}
                  InputProps={{
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title="Copy PlexBridge URL">
                          <IconButton
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/stream/${editingStream.channel_id}`);
                              enqueueSnackbar('PlexBridge URL copied to clipboard! 📋', { variant: 'success' });
                            }}
                            edge="end"
                          >
                            <ContentCopyIcon />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  }}
                  helperText="This is the URL Plex uses to access this stream through PlexBridge"
                  size="small"
                />
              </Grid>
            )}
            
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
                <Tooltip title="Preview stream before saving" arrow>
                  <Button
                    variant="outlined"
                    onClick={() => formData.url.trim() && handleTestStream({
                      url: formData.url,
                      name: formData.name || 'Test Stream',
                      type: formData.type,
                      channel_id: formData.channel_id,
                      id: 'test_stream' // For preview purposes
                    })}
                    disabled={saving || !formData.url.trim()}
                    sx={{ 
                      minWidth: 120,
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: 2
                      }
                    }}
                    data-testid="test-stream-button"
                    color="info"
                  >
                    <PreviewIcon sx={{ mr: 1 }} />
                    {isMobile ? 'Test' : 'Test in Player'}
                  </Button>
                </Tooltip>
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
            data-testid="cancel-stream-button"
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
            data-testid="save-stream-button"
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
        data-testid="import-dialog"
      >
        <DialogTitle data-testid="import-dialog-title">
          <Typography variant="h5" component="div">
            📺 Import Multiple Channels from Stream Source
          </Typography>
        </DialogTitle>
        
        <DialogContent>
          {/* Emergency processing overlay for large datasets */}
          {parsedChannels.length > 50000 && importing && (
            <Backdrop open={true} sx={{ zIndex: 9999, color: '#fff' }}>
              <Box textAlign="center">
                <CircularProgress size={60} sx={{ mb: 2 }} />
                <Typography variant="h6">Processing Large Dataset...</Typography>
                <Typography variant="body2">
                  {parsedChannels.length} channels detected. Please wait...
                </Typography>
              </Box>
            </Backdrop>
          )}
          
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              🎯 Import multiple channels from M3U playlists, XMLTV files, or other multi-channel sources.
              This will automatically create channels and streams for each entry found.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              💡 Large playlists are automatically streamed and cached for faster subsequent access.
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
                data-testid="import-url-input"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Stream Type</InputLabel>
                {importFormData.isM3UMode ? (
                  <TextField
                    value="HLS (.m3u8) - M3U Playlist"
                    label="Stream Type"
                    variant="outlined"
                    disabled
                    helperText="Stream type is automatically detected from M3U playlist"
                  />
                ) : (
                  <Select
                    value={importFormData.type}
                    onChange={(e) => handleImportInputChange('type', e.target.value)}
                    label="Stream Type"
                    disabled={importing}
                  >
                    <MenuItem value="hls">HLS (.m3u8)</MenuItem>
                    <MenuItem value="dash">DASH (.mpd)</MenuItem>
                    <MenuItem value="rtsp">RTSP</MenuItem>
                    <MenuItem value="rtmp">RTMP</MenuItem>
                    <MenuItem value="udp">UDP</MenuItem>
                    <MenuItem value="http">HTTP</MenuItem>
                  </Select>
                )}
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
                data-testid="parse-channels-button"
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

            {/* Progress Bar */}
            {parsingProgress.show && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {parsingProgress.message}
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={parsingProgress.progress} 
                      sx={{ mb: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {parsingProgress.stage}: {Math.round(parsingProgress.progress)}%
                    </Typography>
                  </Box>
                </Alert>
              </Grid>
            )}

            {parsedChannels.length > 0 && (
              <Grid item xs={12}>
                {/* Search and Filter Controls */}
                <Box sx={{ mb: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="🔍 Search channels..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        disabled={importing}
                        variant="outlined"
                        size="small"
                        placeholder="Search by name, group, or TVG ID"
                        data-testid="channel-search-input"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>📁 Filter by Group</InputLabel>
                        <Select
                          value={groupFilter}
                          onChange={(e) => setGroupFilter(e.target.value)}
                          disabled={importing}
                          label="📁 Filter by Group"
                          data-testid="group-filter-select"
                        >
                          <MenuItem value="">
                            <em>All Groups ({parsedChannels.length} channels)</em>
                          </MenuItem>
                          {availableGroups.map((group) => {
                            const groupCount = parsedChannels.filter(ch => 
                              (ch.attributes?.['group-title'] || 'Ungrouped') === group
                            ).length;
                            return (
                              <MenuItem key={group} value={group}>
                                {group} ({groupCount})
                              </MenuItem>
                            );
                          })}
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </Box>

                {/* Emergency performance warnings for large datasets */}
                {parsedChannels.length > 100000 && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      🚨 HUGE DATASET ({parsedChannels.length} channels)! UI limited to prevent freezing. 
                      Use group filters and search for better performance. 
                      Consider using API for bulk operations.
                    </Typography>
                  </Alert>
                )}
                {filteredChannels.length > 10000 && parsedChannels.length <= 100000 && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      ⚠️ Large dataset detected ({filteredChannels.length} channels). 
                      Use search and filters to improve performance. 
                      Consider selecting by group instead of browsing all channels.
                    </Typography>
                  </Alert>
                )}

                <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Box display="flex" alignItems="center" flexWrap="wrap" gap={1}>
                    <Typography variant="h6">
                      📋 {searchQuery || groupFilter ? 
                        `Showing ${filteredChannels.length} of ${parsedChannels.length} channels` : 
                        `Found ${parsedChannels.length} channels`
                      } ({selectedChannels.length} selected):
                    </Typography>
                    {searchQuery && parsedChannels.filter(channel => 
                      channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (channel.attributes?.['group-title'] || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (channel.attributes?.['tvg-id'] || '').toLowerCase().includes(searchQuery.toLowerCase())
                    ).length > 10000 && filteredChannels.length === 10000 && (
                      <Chip 
                        label="Results limited to 10,000 for performance" 
                        size="small" 
                        color="warning"
                      />
                    )}
                  </Box>
                  <Box>
                    <Button
                      size="small"
                      onClick={() => {
                        // Emergency safety check for massive selections
                        if (parsedChannels.length > 100000) {
                          enqueueSnackbar('⚠️ Cannot select all channels in datasets over 100K. Use group filters to select smaller subsets.', { variant: 'warning' });
                          return;
                        }
                        
                        if (searchQuery || groupFilter) {
                          // Emergency limit for filtered selections
                          if (filteredChannels.length > 50000) {
                            enqueueSnackbar('⚠️ Selection limited to 50K channels for performance. Use more specific filters.', { variant: 'warning' });
                            return;
                          }
                          
                          // Select all filtered channels with chunked processing
                          const processSelection = async () => {
                            const CHUNK_SIZE = 1000;
                            const newSelection = [...selectedChannels];
                            
                            for (let i = 0; i < filteredChannels.length; i += CHUNK_SIZE) {
                              const chunk = filteredChannels.slice(i, i + CHUNK_SIZE);
                              
                              await new Promise(resolve => {
                                requestIdleCallback(() => {
                                  chunk.forEach(filteredChannel => {
                                    const originalIndex = parsedChannels.findIndex(originalChannel => originalChannel.id === filteredChannel.id);
                                    if (originalIndex !== -1 && !newSelection.includes(originalIndex)) {
                                      newSelection.push(originalIndex);
                                    }
                                  });
                                  resolve();
                                }, { timeout: 50 });
                              });
                            }
                            
                            setSelectedChannels([...new Set(newSelection)]);
                          };
                          
                          processSelection();
                        } else {
                          // Select all channels with safety limit
                          if (parsedChannels.length > 50000) {
                            enqueueSnackbar('⚠️ Auto-select limited to 50K channels. Use filters for larger selections.', { variant: 'warning' });
                            setSelectedChannels(Array.from({ length: 50000 }, (_, index) => index));
                          } else {
                            setSelectedChannels(parsedChannels.map((_, index) => index));
                          }
                        }
                      }}
                      disabled={(
                        searchQuery || groupFilter ? 
                          filteredChannels.length > 50000 || filteredChannels.every(filteredChannel => {
                            const originalIndex = parsedChannels.findIndex(originalChannel => originalChannel.id === filteredChannel.id);
                            return selectedChannels.includes(originalIndex);
                          }) :
                          parsedChannels.length > 100000 || selectedChannels.length === parsedChannels.length
                      )}
                    >
                      {searchQuery || groupFilter ? 'Select Filtered' : 'Select All'}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        if (searchQuery || groupFilter) {
                          // Emergency limit for deselection operations
                          if (filteredChannels.length > 50000) {
                            enqueueSnackbar('⚠️ Deselection limited for large filtered sets. Use more specific filters.', { variant: 'warning' });
                            return;
                          }
                          
                          // Deselect filtered channels with chunked processing
                          const processDeselection = async () => {
                            const CHUNK_SIZE = 1000;
                            let newSelection = [...selectedChannels];
                            
                            for (let i = 0; i < filteredChannels.length; i += CHUNK_SIZE) {
                              const chunk = filteredChannels.slice(i, i + CHUNK_SIZE);
                              
                              await new Promise(resolve => {
                                requestIdleCallback(() => {
                                  chunk.forEach(filteredChannel => {
                                    const originalIndex = parsedChannels.findIndex(originalChannel => originalChannel.id === filteredChannel.id);
                                    if (originalIndex !== -1) {
                                      newSelection = newSelection.filter(index => index !== originalIndex);
                                    }
                                  });
                                  resolve();
                                }, { timeout: 50 });
                              });
                            }
                            
                            setSelectedChannels(newSelection);
                          };
                          
                          processDeselection();
                        } else {
                          // Deselect all - always safe
                          setSelectedChannels([]);
                        }
                      }}
                      disabled={(
                        searchQuery || groupFilter ? 
                          filteredChannels.length > 50000 || !filteredChannels.some(filteredChannel => {
                            const originalIndex = parsedChannels.findIndex(originalChannel => originalChannel.id === filteredChannel.id);
                            return selectedChannels.includes(originalIndex);
                          }) :
                          selectedChannels.length === 0
                      )}
                      sx={{ ml: 1 }}
                    >
                      {searchQuery || groupFilter ? 'Deselect Filtered' : 'Select None'}
                    </Button>
                  </Box>
                </Box>
                
                <VirtualizedChannelTable
                  channels={parsedChannels}
                  selectedChannels={selectedChannels}
                  onSelectionChange={(channelIndex) => {
                    // Emergency throttling for very large datasets
                    if (parsedChannels.length > 100000) {
                      // Use setTimeout to prevent blocking on massive datasets
                      setTimeout(() => {
                        if (selectedChannels.includes(channelIndex)) {
                          setSelectedChannels(prev => prev.filter(i => i !== channelIndex));
                        } else {
                          setSelectedChannels(prev => [...prev, channelIndex]);
                        }
                      }, 0);
                    } else {
                      if (selectedChannels.includes(channelIndex)) {
                        setSelectedChannels(selectedChannels.filter(i => i !== channelIndex));
                      } else {
                        setSelectedChannels([...selectedChannels, channelIndex]);
                      }
                    }
                  }}
                  onSelectAll={(checked, indices) => {
                    if (indices) {
                      // For filtered selection
                      if (checked) {
                        const newSelection = [...new Set([...selectedChannels, ...indices])];
                        setSelectedChannels(newSelection);
                      } else {
                        setSelectedChannels(selectedChannels.filter(i => !indices.includes(i)));
                      }
                    } else {
                      // For all channels
                      if (checked) {
                        setSelectedChannels(parsedChannels.map((_, index) => index));
                      } else {
                        setSelectedChannels([]);
                      }
                    }
                  }}
                  onPreview={(channel) => {
                    const streamData = {
                      url: channel.url,
                      name: channel.name,
                      type: channel.type || 'hls',
                      id: channel.id,
                      channelId: channel.id
                    };
                    
                    setCurrentStream(streamData);
                    setEnhancedPlayerOpen(true);
                    
                    // Provide feedback for M3U preview
                    enqueueSnackbar(
                      `Previewing ${channel.name}...`, 
                      { 
                        variant: 'info',
                        autoHideDuration: 2000
                      }
                    );
                  }}
                  maxHeight={isMobile ? 300 : 400}
                  searchQuery={searchQuery}
                  groupFilter={groupFilter}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button 
            onClick={handleImportDialogClose}
            disabled={importing}
            startIcon={<CancelIcon />}
            color="inherit"
            data-testid="cancel-import-button"
          >
            Cancel
          </Button>
          
          {parsedChannels.length > 0 && (
            <Button 
              onClick={handleImportChannels}
              variant="contained"
              disabled={importing || !importFormData.auto_create_channels || selectedChannels.length === 0}
              startIcon={importing ? <CircularProgress size={20} /> : <ImportIcon />}
              color="success"
              size="large"
              data-testid="import-selected-button"
            >
              {importing ? 'Importing...' : `Import ${selectedChannels.length} Selected Channel${selectedChannels.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Enhanced Video Player with Improved Error Handling */}
      {useEnhancedPlayer ? (
        <EnhancedVideoPlayer
          open={enhancedPlayerOpen}
          onClose={handleCloseEnhancedPlayer}
          streamUrl={currentStream?.url}
          streamName={currentStream?.name || 'Unknown Stream'}
          streamType={currentStream?.type || 'hls'}
          channelId={currentStream?.channelId}
          streamId={currentStream?.streamId}
          useProxy={true}
          onError={handlePlayerError}
        />
      ) : (
        <SimpleVideoPlayer
          open={enhancedPlayerOpen}
          onClose={handleCloseEnhancedPlayer}
          streamUrl={currentStream?.url}
          streamName={currentStream?.name || 'Unknown Stream'}
          streamType={currentStream?.type || 'hls'}
          channelId={currentStream?.channelId}
          streamId={currentStream?.streamId}
          useProxy={true}
          onError={handlePlayerError}
        />
      )}
    </Box>
  );
}

export default StreamManager;
