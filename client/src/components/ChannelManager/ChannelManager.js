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
  Checkbox,
  TablePagination,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  FormControl,
  InputLabel,
  Select,
  TableSortLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Tv as TvIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon,
  PlayArrow as StreamIcon,
  DragHandle as DragHandleIcon,
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import {
  CSS,
} from '@dnd-kit/utilities';
import { useSnackbar } from 'notistack';
import api from '../../services/api';

// Sortable Channel Row Component
function SortableChannelRow({ channel, index, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: channel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow 
      ref={setNodeRef}
      style={style}
      {...props}
      sx={{
        ...props.sx,
        cursor: isDragging ? 'grabbing' : 'grab',
        '&:hover .drag-handle': {
          opacity: 1,
        },
      }}
    >
      {props.children(attributes, listeners, isDragging)}
    </TableRow>
  );
}

function ChannelManager() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [bulkMenuAnchor, setBulkMenuAnchor] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [availableEpgIds, setAvailableEpgIds] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'number', direction: 'asc' });
  const [isDragReordering, setIsDragReordering] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    number: '',
    enabled: true,
    logo: '',
    epg_id: '',
  });
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Optimized form input handlers to prevent unnecessary re-renders
  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Memoized validation to prevent constant re-computation
  const formValidation = useMemo(() => {
    return {
      nameError: !formData.name.trim(),
      numberError: !formData.number,
      nameHelperText: !formData.name.trim() ? "Channel name is required" : "",
      numberHelperText: !formData.number ? "Number required" : ""
    };
  }, [formData.name, formData.number]);

  // Sort channels based on current sort configuration
  const sortedChannels = useMemo(() => {
    if (!channels.length) return [];
    
    const sorted = [...channels].sort((a, b) => {
      const { key, direction } = sortConfig;
      let aValue = a[key];
      let bValue = b[key];
      
      // Handle different data types
      if (key === 'number') {
        aValue = parseInt(aValue) || 0;
        bValue = parseInt(bValue) || 0;
      } else if (key === 'name') {
        aValue = (aValue || '').toLowerCase();
        bValue = (bValue || '').toLowerCase();
      } else if (key === 'stream_count') {
        aValue = parseInt(aValue) || 0;
        bValue = parseInt(bValue) || 0;
      } else if (key === 'enabled') {
        aValue = aValue ? 1 : 0;
        bValue = bValue ? 1 : 0;
      }
      
      if (aValue < bValue) {
        return direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    
    return sorted;
  }, [channels, sortConfig]);

  useEffect(() => {
    fetchChannels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchChannels = async () => {
    try {
      const response = await api.get('/api/channels');
      setChannels(response.data);
      setLoading(false);
    } catch (error) {
      enqueueSnackbar('Failed to fetch channels', { variant: 'error' });
      setLoading(false);
    }
  };

  const fetchAvailableEpgIds = async () => {
    try {
      console.log('Fetching available EPG IDs...');
      
      // Get all available EPG channels from the consolidated endpoint
      const channelsResponse = await api.get('/api/epg/channels');
      console.log('EPG channels response:', channelsResponse.data);
      
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
        
        console.log('Total EPG IDs found:', allEpgIds.length);
        setAvailableEpgIds(allEpgIds);
        
        if (allEpgIds.length === 0) {
          enqueueSnackbar('No EPG channel IDs found. Check EPG sources and refresh.', { 
            variant: 'info',
            autoHideDuration: 6000
          });
        }
      } else {
        console.warn('No available_channels found in response');
        setAvailableEpgIds([]);
        enqueueSnackbar('No EPG channel IDs found. Check EPG sources and refresh.', { 
          variant: 'info',
          autoHideDuration: 6000
        });
      }
    } catch (error) {
      console.error('Failed to fetch available EPG IDs:', error);
      enqueueSnackbar('Failed to load EPG data. Check EPG sources.', { variant: 'error' });
      setAvailableEpgIds([]); // Ensure we have an empty array on error
    }
  };

  // Handle column sorting
  const handleSort = (property) => {
    const isAsc = sortConfig.key === property && sortConfig.direction === 'asc';
    setSortConfig({
      key: property,
      direction: isAsc ? 'desc' : 'asc',
    });
  };

  // Enhanced drag end handler with improved automatic channel numbering
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      setIsDragReordering(false);
      return;
    }

    const oldIndex = sortedChannels.findIndex((channel) => channel.id === active.id);
    const newIndex = sortedChannels.findIndex((channel) => channel.id === over.id);

    if (oldIndex !== newIndex) {
      const draggedChannel = sortedChannels.find(ch => ch.id === active.id);
      const reorderedChannels = arrayMove(sortedChannels, oldIndex, newIndex);
      
      // Enhanced automatic numbering with gap detection and intelligent placement
      let updatedChannels;
      
      if (newIndex === 0) {
        // Dragged to top - assign starting from 1
        updatedChannels = reorderedChannels.map((channel, index) => ({
          ...channel,
          number: index + 1
        }));
      } else if (newIndex === reorderedChannels.length - 1) {
        // Dragged to bottom - maintain existing numbers for others, assign next available
        const maxNumber = Math.max(...reorderedChannels.slice(0, -1).map(ch => ch.number));
        updatedChannels = reorderedChannels.map((channel, index) => {
          if (index === reorderedChannels.length - 1) {
            return { ...channel, number: maxNumber + 1 };
          }
          return channel;
        });
      } else {
        // Dragged to middle - smart gap filling or sequential numbering
        const prevChannel = reorderedChannels[newIndex - 1];
        const nextChannel = reorderedChannels[newIndex + 1];
        
        if (prevChannel && nextChannel && (nextChannel.number - prevChannel.number) > 1) {
          // There's a gap, place in between
          const newNumber = prevChannel.number + 1;
          updatedChannels = reorderedChannels.map((channel, index) => {
            if (index === newIndex) {
              return { ...channel, number: newNumber };
            }
            return channel;
          });
        } else {
          // No gap, renumber sequentially from the target position
          const startNumber = prevChannel?.number || 1;
          updatedChannels = reorderedChannels.map((channel, index) => ({
            ...channel,
            number: startNumber + index
          }));
        }
      }
      
      // Update UI optimistically
      const newChannelsState = channels.map(channel => {
        const updated = updatedChannels.find(uc => uc.id === channel.id);
        return updated || channel;
      });
      
      setChannels(newChannelsState);
      setIsDragReordering(true);
      
      try {
        // Send bulk update to backend with only the changed numbers
        await handleBulkReorder(updatedChannels);
        
        const oldNumber = draggedChannel.number;
        const newNumber = updatedChannels.find(ch => ch.id === active.id).number;
        const affectedChannels = updatedChannels.filter(ch => 
          ch.number !== sortedChannels.find(sc => sc.id === ch.id)?.number
        ).length;
        
        enqueueSnackbar(
          `Channel "${draggedChannel.name}" moved from #${oldNumber} to #${newNumber}! ${affectedChannels > 1 ? `${affectedChannels} channels renumbered` : 'No other channels affected'} 🎯`, 
          { 
            variant: 'success',
            autoHideDuration: 4000,
          }
        );
      } catch (error) {
        // Revert optimistic update on error
        fetchChannels();
        enqueueSnackbar('Failed to reorder channels. Changes reverted.', { 
          variant: 'error',
          autoHideDuration: 5000,
        });
      } finally {
        setIsDragReordering(false);
      }
    }
  };

  // Handle bulk channel reordering
  const handleBulkReorder = async (reorderedChannels) => {
    const updates = reorderedChannels.map(channel => ({
      id: channel.id,
      number: channel.number
    }));
    
    await api.put('/api/channels/bulk-update', { updates });
  };

  const handleCreate = () => {
    setEditingChannel(null);
    setFormData({
      name: '',
      number: '',
      enabled: true,
      logo: '',
      epg_id: '',
    });
    setDialogOpen(true);
    fetchAvailableEpgIds();
  };

  const handleEdit = (channel) => {
    setEditingChannel(channel);
    setFormData({
      name: channel.name || '',
      number: channel.number || '',
      enabled: channel.enabled !== 0,
      logo: channel.logo || '',
      epg_id: channel.epg_id || '',
    });
    setDialogOpen(true);
    fetchAvailableEpgIds();
  };

  const handleSave = async () => {
    if (formValidation.nameError || formValidation.numberError) {
      enqueueSnackbar('Please fill in all required fields', { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        number: parseInt(formData.number),
        name: formData.name.trim(),
      };

      if (editingChannel) {
        await api.put(`/api/channels/${editingChannel.id}`, data);
        enqueueSnackbar('Channel updated successfully! 🎉', { 
          variant: 'success',
          autoHideDuration: 3000,
        });
      } else {
        await api.post('/api/channels', data);
        enqueueSnackbar('Channel created successfully! 🎉', { 
          variant: 'success',
          autoHideDuration: 3000,
        });
      }

      setDialogOpen(false);
      fetchChannels();
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to save channel';
      enqueueSnackbar(errorMessage, { 
        variant: 'error',
        autoHideDuration: 5000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (channel) => {
    if (window.confirm(`Are you sure you want to delete channel "${channel.name}"? This action cannot be undone.`)) {
      setDeleting(channel.id);
      try {
        await api.delete(`/api/channels/${channel.id}`);
        enqueueSnackbar('Channel deleted successfully 🗑️', { 
          variant: 'success',
          autoHideDuration: 3000,
        });
        fetchChannels();
      } catch (error) {
        enqueueSnackbar('Failed to delete channel', { 
          variant: 'error',
          autoHideDuration: 5000,
        });
      } finally {
        setDeleting(null);
      }
    }
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedChannels(channels.map(channel => channel.id));
    } else {
      setSelectedChannels([]);
    }
  };

  const handleSelectChannel = (channelId) => {
    setSelectedChannels(prev => 
      prev.includes(channelId) 
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const handleBulkAction = (action) => {
    setBulkMenuAnchor(null);
    
    if (selectedChannels.length === 0) {
      enqueueSnackbar('No channels selected', { variant: 'warning' });
      return;
    }

    switch (action) {
      case 'enable':
        handleBulkEnable(true);
        break;
      case 'disable':
        handleBulkEnable(false);
        break;
      case 'delete':
        handleBulkDelete();
        break;
      default:
        break;
    }
  };

  const handleBulkEnable = async (enabled) => {
    const action = enabled ? 'enable' : 'disable';
    
    if (window.confirm(`Are you sure you want to ${action} ${selectedChannels.length} selected channels?`)) {
      try {
        await Promise.all(
          selectedChannels.map(async (channelId) => {
            const channel = channels.find(c => c.id === channelId);
            if (channel) {
              await api.put(`/api/channels/${channelId}`, {
                ...channel,
                enabled
              });
            }
          })
        );
        
        enqueueSnackbar(`${selectedChannels.length} channels ${action}d successfully! 🎉`, { 
          variant: 'success' 
        });
        setSelectedChannels([]);
        fetchChannels();
      } catch (error) {
        enqueueSnackbar(`Failed to ${action} some channels`, { variant: 'error' });
      }
    }
  };

  const handleBulkDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedChannels.length} selected channels? This action cannot be undone.`)) {
      try {
        await Promise.all(
          selectedChannels.map(channelId => api.delete(`/api/channels/${channelId}`))
        );
        
        enqueueSnackbar(`${selectedChannels.length} channels deleted successfully! 🗑️`, { 
          variant: 'success' 
        });
        setSelectedChannels([]);
        fetchChannels();
      } catch (error) {
        enqueueSnackbar('Failed to delete some channels', { variant: 'error' });
      }
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
            <TableCell>Number</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>EPG ID</TableCell>
            <TableCell>Streams</TableCell>
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
              <TableCell><Skeleton width={40} /></TableCell>
              <TableCell><Skeleton width={120} /></TableCell>
              <TableCell><Skeleton width={80} /></TableCell>
              <TableCell><Skeleton width={60} /></TableCell>
              <TableCell><Skeleton width={80} /></TableCell>
              <TableCell><Skeleton width={100} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const paginatedChannels = sortedChannels.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box>
      <Box 
        display="flex" 
        justifyContent="space-between" 
        alignItems={isMobile ? 'flex-start' : 'center'} 
        mb={4}
        flexDirection={isMobile ? 'column' : 'row'}
        gap={isMobile ? 2 : 0}
      >
        <Box>
          <Typography 
            variant="h4" 
            sx={{ 
              fontWeight: 700,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.025em',
              mb: 0.5
            }}
          >
            Channel Manager
          </Typography>
          <Typography 
            variant="body2" 
            sx={{ 
              color: 'text.secondary',
              fontWeight: 500,
              display: { xs: 'none', sm: 'block' },
            }}
          >
            Manage your IPTV channels and streaming configuration
          </Typography>
        </Box>
        
        <Box display="flex" gap={1} flexWrap="wrap">
          {selectedChannels.length > 0 && (
            <Button
              variant="outlined"
              onClick={(e) => setBulkMenuAnchor(e.currentTarget)}
              size={isMobile ? "small" : "medium"}
            >
              Bulk Actions ({selectedChannels.length})
            </Button>
          )}
          
          {!isMobile ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreate}
              size="large"
              data-testid="add-channel-button"
            >
              Add Channel
            </Button>
          ) : (
            <Fab
              color="primary"
              aria-label="add"
              onClick={handleCreate}
              data-testid="add-channel-fab"
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

      <Card 
        sx={{ 
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          borderRadius: 3,
          overflow: 'hidden'
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {loading ? renderSkeletonTable() : (
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
                        indeterminate={selectedChannels.length > 0 && selectedChannels.length < channels.length}
                        checked={channels.length > 0 && selectedChannels.length === channels.length}
                        onChange={handleSelectAll}
                        data-testid="select-all-channels"
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 40 }} data-testid="drag-column-header">
                      <Tooltip title="Drag to reorder channels">
                        <DragHandleIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ minWidth: 60 }}>
                      <TableSortLabel
                        active={sortConfig.key === 'number'}
                        direction={sortConfig.key === 'number' ? sortConfig.direction : 'asc'}
                        onClick={() => handleSort('number')}
                        data-testid="sort-by-number"
                      >
                        Number
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      <TableSortLabel
                        active={sortConfig.key === 'name'}
                        direction={sortConfig.key === 'name' ? sortConfig.direction : 'asc'}
                        onClick={() => handleSort('name')}
                        data-testid="sort-by-name"
                      >
                        Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ minWidth: 100, display: { xs: 'none', sm: 'table-cell' } }}>EPG ID</TableCell>
                    <TableCell sx={{ minWidth: 80 }}>
                      <TableSortLabel
                        active={sortConfig.key === 'stream_count'}
                        direction={sortConfig.key === 'stream_count' ? sortConfig.direction : 'asc'}
                        onClick={() => handleSort('stream_count')}
                        data-testid="sort-by-streams"
                      >
                        Streams
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ minWidth: 100 }}>
                      <TableSortLabel
                        active={sortConfig.key === 'enabled'}
                        direction={sortConfig.key === 'enabled' ? sortConfig.direction : 'asc'}
                        onClick={() => handleSort('enabled')}
                        data-testid="sort-by-status"
                      >
                        Status
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ minWidth: 120 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext 
                      items={paginatedChannels.map(ch => ch.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {paginatedChannels.map((channel, index) => (
                        <SortableChannelRow 
                          key={channel.id}
                          channel={channel}
                          index={index}
                          hover
                          data-testid={`channel-row-${channel.id}`}
                          sx={{
                            transition: 'all 0.2s ease',
                            animation: `fadeInUp 0.3s ease ${index * 0.05}s both`,
                            '@keyframes fadeInUp': {
                              '0%': {
                                opacity: 0,
                                transform: 'translateY(20px)'
                              },
                              '100%': {
                                opacity: 1,
                                transform: 'translateY(0)'
                              }
                            },
                            '&:hover': {
                              backgroundColor: 'rgba(99, 102, 241, 0.08)',
                              transform: 'scale(1.01)',
                              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)',
                            }
                          }}
                        >
                          {(attributes, listeners, isDragging) => (
                            <>
                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={selectedChannels.includes(channel.id)}
                                  onChange={() => handleSelectChannel(channel.id)}
                                  data-testid={`select-channel-${channel.id}`}
                                  sx={{
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                      transform: 'scale(1.1)',
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Box 
                                  {...attributes}
                                  {...listeners}
                                  className="drag-handle"
                                  sx={{ 
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: isDragging ? 'grabbing' : 'grab',
                                    opacity: 0.6,
                                    transition: 'opacity 0.2s ease',
                                    '&:hover': {
                                      opacity: 1,
                                    },
                                    touchAction: 'none',
                                  }}
                                  data-testid={`drag-handle-${channel.id}`}
                                >
                                  <DragHandleIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Box 
                                  sx={{ 
                                    width: 32, 
                                    height: 32,
                                    borderRadius: 2,
                                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    fontWeight: 700,
                                    fontSize: '0.875rem'
                                  }}
                                  data-testid={`channel-number-${channel.id}`}
                                >
                                  {channel.number}
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Box display="flex" alignItems="center">
                                  <Box 
                                    sx={{ 
                                      width: 32, 
                                      height: 32,
                                      borderRadius: 2,
                                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      mr: 2,
                                      transition: 'all 0.2s ease',
                                      '&:hover': {
                                        transform: 'rotate(5deg) scale(1.1)',
                                      }
                                    }}
                                  >
                                    <TvIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                                  </Box>
                                  <Box>
                                    <Typography 
                                      variant="body2" 
                                      sx={{ 
                                        fontWeight: 600,
                                        color: 'text.primary',
                                        mb: 0.25
                                      }}
                                      data-testid={`channel-name-${channel.id}`}
                                    >
                                      {channel.name}
                                    </Typography>
                                    {channel.epg_id && (
                                      <Typography 
                                        variant="caption" 
                                        sx={{ 
                                          color: 'text.secondary',
                                          fontSize: '0.7rem'
                                        }}
                                      >
                                        EPG: {channel.epg_id}
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                                <Typography variant="body2" color="text.secondary">
                                  {channel.epg_id || '-'}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Box display="flex" alignItems="center" gap={1.5}>
                                  <Chip
                                    label={`${channel.stream_count || 0} streams`}
                                    size="small"
                                    data-testid={`stream-count-${channel.id}`}
                                    sx={{
                                      background: channel.stream_count > 0 
                                        ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                                        : 'rgba(148, 163, 184, 0.2)',
                                      color: channel.stream_count > 0 ? '#ffffff' : 'text.secondary',
                                      fontWeight: 600,
                                      fontSize: '0.7rem',
                                      transition: 'all 0.2s ease',
                                      '&:hover': {
                                        transform: 'scale(1.05)',
                                      }
                                    }}
                                  />
                                  {channel.stream_count > 0 && (
                                    <Tooltip title="Manage Streams">
                                      <IconButton 
                                        onClick={() => window.location.href = `/streams?channel=${channel.id}`}
                                        size="small"
                                        data-testid={`manage-streams-${channel.id}`}
                                        sx={{
                                          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(29, 78, 216, 0.1) 100%)',
                                          transition: 'all 0.2s ease',
                                          '&:hover': {
                                            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                            color: 'white',
                                            transform: 'scale(1.1)',
                                          }
                                        }}
                                      >
                                        <StreamIcon sx={{ fontSize: 16 }} />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={channel.enabled ? 'Active' : 'Inactive'}
                                  data-testid={`channel-status-${channel.id}`}
                                  sx={{
                                    background: channel.enabled 
                                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                      : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                                    color: '#ffffff',
                                    fontWeight: 600,
                                    fontSize: '0.7rem',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                      transform: 'scale(1.05)',
                                    },
                                    '&::before': {
                                      content: channel.enabled ? '"●"' : '"○"',
                                      marginRight: '4px',
                                    }
                                  }}
                                  size="small"
                                />
                              </TableCell>
                              <TableCell>
                                <Box display="flex" gap={1}>
                                  <Tooltip title="Edit Channel">
                                    <IconButton 
                                      onClick={() => handleEdit(channel)} 
                                      size="small"
                                      data-testid={`edit-channel-${channel.id}`}
                                      sx={{
                                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                          color: 'white',
                                          transform: 'scale(1.1) rotate(5deg)',
                                          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                                        }
                                      }}
                                    >
                                      <EditIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Delete Channel">
                                    <IconButton
                                      onClick={() => handleDelete(channel)}
                                      size="small"
                                      disabled={deleting === channel.id}
                                      data-testid={`delete-channel-${channel.id}`}
                                      sx={{
                                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%)',
                                        transition: 'all 0.2s ease',
                                        '&:hover:not(:disabled)': {
                                          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                          color: 'white',
                                          transform: 'scale(1.1)',
                                          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                                        },
                                        '&:disabled': {
                                          background: 'rgba(148, 163, 184, 0.1)',
                                        }
                                      }}
                                    >
                                      {deleting === channel.id ? (
                                        <CircularProgress 
                                          size={16} 
                                          sx={{ 
                                            color: 'primary.main',
                                            animation: 'spin 1s linear infinite',
                                            '@keyframes spin': {
                                              '0%': { transform: 'rotate(0deg)' },
                                              '100%': { transform: 'rotate(360deg)' },
                                            }
                                          }} 
                                        />
                                      ) : (
                                        <DeleteIcon sx={{ fontSize: 16 }} />
                                      )}
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </TableCell>
                            </>
                          )}
                        </SortableChannelRow>
                      ))}
                    </SortableContext>
                  </DndContext>
                  {channels.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                        <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                          <TvIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
                          <Typography variant="h6" color="text.secondary">
                            No channels found
                          </Typography>
                          <Typography variant="body2" color="text.disabled">
                            Get started by adding your first channel
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          
          {!loading && channels.length > 0 && (
            <TablePagination
              component="div"
              count={sortedChannels.length}
              page={page}
              onPageChange={(event, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(parseInt(event.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 25, 50]}
              data-testid="channel-pagination"
            />
          )}
        </CardContent>
      </Card>

      {/* Bulk Actions Menu */}
      <Menu
        anchorEl={bulkMenuAnchor}
        open={Boolean(bulkMenuAnchor)}
        onClose={() => setBulkMenuAnchor(null)}
      >
        <MenuItem onClick={() => handleBulkAction('enable')}>
          <ListItemIcon>
            <CheckBoxIcon />
          </ListItemIcon>
          <ListItemText>Enable Selected</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleBulkAction('disable')}>
          <ListItemIcon>
            <CheckBoxOutlineBlankIcon />
          </ListItemIcon>
          <ListItemText>Disable Selected</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleBulkAction('delete')} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteIcon color="error" />
          </ListItemIcon>
          <ListItemText>Delete Selected</ListItemText>
        </MenuItem>
      </Menu>

      {/* Channel Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => !saving && setDialogOpen(false)}
        maxWidth="sm" 
        fullWidth
        fullScreen={isMobile}
        BackdropComponent={Backdrop}
        BackdropProps={{
          sx: { backgroundColor: 'rgba(0, 0, 0, 0.7)' }
        }}
        sx={{
          '& .MuiDialog-paper': {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) !important',
            transition: 'none !important'
          }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h5" component="div">
            {editingChannel ? '✏️ Edit Channel' : '➕ Add Channel'}
          </Typography>
        </DialogTitle>
        
        <DialogContent sx={{ pb: 1 }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={8}>
              <TextField
                autoFocus
                label="Channel Name *"
                fullWidth
                variant="outlined"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                error={formValidation.nameError}
                helperText={formValidation.nameHelperText}
                disabled={saving}
                data-testid="channel-name-input"
              />
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <TextField
                label="Channel Number *"
                type="number"
                fullWidth
                variant="outlined"
                value={formData.number}
                onChange={(e) => handleInputChange('number', e.target.value)}
                error={formValidation.numberError}
                helperText={formValidation.numberHelperText}
                disabled={saving}
                inputProps={{ min: 1, max: 9999 }}
                data-testid="channel-number-input"
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>EPG ID</InputLabel>
                <Select
                  value={formData.epg_id}
                  onChange={(e) => handleInputChange('epg_id', e.target.value)}
                  label="EPG ID"
                  disabled={saving}
                  data-testid="channel-epg-select"
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
                          <Chip 
                            label={`${epgData.program_count || 0} programs`} 
                            size="small" 
                            color="primary" 
                          />
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
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                  Optional - Used to match EPG data from guide sources
                </Typography>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Logo URL"
                fullWidth
                variant="outlined"
                value={formData.logo}
                onChange={(e) => handleInputChange('logo', e.target.value)}
                helperText="Optional - URL to channel logo image (PNG, JPG, SVG)"
                disabled={saving}
                data-testid="channel-logo-input"
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled}
                    onChange={(e) => handleInputChange('enabled', e.target.checked)}
                    disabled={saving}
                    color="success"
                    data-testid="channel-enabled-switch"
                  />
                }
                label={
                  <Typography variant="body1">
                    {formData.enabled ? '✅ Channel Enabled' : '❌ Channel Disabled'}
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
            data-testid="cancel-channel-button"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            variant="contained"
            disabled={saving || formValidation.nameError || formValidation.numberError}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            color="primary"
            size="large"
            data-testid="save-channel-button"
          >
            {saving ? 'Saving...' : 'Save Channel'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ChannelManager;
