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
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';

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
      
      // Get all available EPG IDs from all sources
      const sourcesResponse = await api.get('/api/epg/sources');
      const sources = sourcesResponse.data.filter(s => s && s.enabled);
      console.log('Found EPG sources:', sources.length);
      
      let allEpgIds = [];
      for (const source of sources) {
        try {
          console.log(`Fetching channels for source: ${source.name} (${source.id})`);
          const channelsResponse = await api.get(`/api/epg/sources/${source.id}/channels`);
          console.log('EPG channels response:', channelsResponse.data);
          
          if (channelsResponse.data && channelsResponse.data.available_channels) {
            const sourceIds = channelsResponse.data.available_channels
              .filter(ch => ch && ch.epg_id) // Only include valid channels with EPG IDs
              .map(ch => ({
                epg_id: ch.epg_id,
                program_count: ch.program_count || 0,
                source_name: source.name || 'Unknown Source',
                channel_name: ch.channel_name || ch.epg_id
              }));
            console.log(`Found ${sourceIds.length} EPG IDs from source ${source.name}`);
            allEpgIds.push(...sourceIds);
          } else {
            console.warn(`No available_channels found for source ${source.name}`);
          }
        } catch (error) {
          console.error(`Failed to fetch EPG IDs for source ${source.name}:`, error.response?.data || error);
          enqueueSnackbar(`Failed to load EPG data from ${source.name}`, { variant: 'warning' });
        }
      }
      
      console.log('Total EPG IDs found:', allEpgIds.length);
      setAvailableEpgIds(allEpgIds);
      
      if (allEpgIds.length === 0) {
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

  const paginatedChannels = channels.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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
          Channel Manager
        </Typography>
        
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
            >
              Add Channel
            </Button>
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
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 60 }}>Number</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>Name</TableCell>
                    <TableCell sx={{ minWidth: 100, display: { xs: 'none', sm: 'table-cell' } }}>EPG ID</TableCell>
                    <TableCell sx={{ minWidth: 80 }}>Streams</TableCell>
                    <TableCell sx={{ minWidth: 100 }}>Status</TableCell>
                    <TableCell sx={{ minWidth: 120 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedChannels.map((channel) => (
                    <TableRow key={channel.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedChannels.includes(channel.id)}
                          onChange={() => handleSelectChannel(channel.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {channel.number}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <TvIcon sx={{ mr: 1, color: 'primary.main' }} />
                          <Typography variant="body2" noWrap>
                            {channel.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Typography variant="body2" color="text.secondary">
                          {channel.epg_id || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Chip
                            label={channel.stream_count || 0}
                            size="small"
                            color={channel.stream_count > 0 ? 'primary' : 'default'}
                            variant="outlined"
                          />
                          {channel.stream_count > 0 && (
                            <Tooltip title="Manage Streams">
                              <IconButton 
                                onClick={() => window.location.href = `/streams?channel=${channel.id}`}
                                size="small"
                                color="info"
                              >
                                <StreamIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={channel.enabled ? 'Enabled' : 'Disabled'}
                          color={channel.enabled ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={1}>
                          <Tooltip title="Edit Channel">
                            <IconButton 
                              onClick={() => handleEdit(channel)} 
                              size="small"
                              color="primary"
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Channel">
                            <IconButton
                              onClick={() => handleDelete(channel)}
                              size="small"
                              color="error"
                              disabled={deleting === channel.id}
                            >
                              {deleting === channel.id ? (
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
                  {channels.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
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
              count={channels.length}
              page={page}
              onPageChange={(event, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(parseInt(event.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 25, 50]}
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
                >
                  <MenuItem value="">
                    <em>No EPG</em>
                  </MenuItem>
                  {availableEpgIds.filter(epgData => epgData && epgData.epg_id).map((epgData, index) => (
                    <MenuItem key={index} value={epgData.epg_id || ''}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{epgData.epg_id || 'Unknown'}</Typography>
                        <Chip 
                          label={`${epgData.program_count || 0} programs`} 
                          size="small" 
                          color="primary" 
                        />
                        {epgData.source_name && (
                          <Chip 
                            label={epgData.source_name} 
                            size="small" 
                            variant="outlined" 
                          />
                        )}
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
          >
            {saving ? 'Saving...' : 'Save Channel'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ChannelManager;
