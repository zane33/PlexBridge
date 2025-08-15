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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Tv as TvIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
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

  const renderSkeletonTable = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
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
                    <TableCell sx={{ minWidth: 60 }}>Number</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>Name</TableCell>
                    <TableCell sx={{ minWidth: 100, display: { xs: 'none', sm: 'table-cell' } }}>EPG ID</TableCell>
                    <TableCell sx={{ minWidth: 80 }}>Streams</TableCell>
                    <TableCell sx={{ minWidth: 100 }}>Status</TableCell>
                    <TableCell sx={{ minWidth: 120 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {channels.map((channel) => (
                    <TableRow key={channel.id} hover>
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
                        <Chip
                          label={channel.stream_count || 0}
                          size="small"
                          color={channel.stream_count > 0 ? 'primary' : 'default'}
                          variant="outlined"
                        />
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
                      <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
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
        </CardContent>
      </Card>

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
              <TextField
                label="EPG ID"
                fullWidth
                variant="outlined"
                value={formData.epg_id}
                onChange={(e) => handleInputChange('epg_id', e.target.value)}
                helperText="Optional - Used to match EPG data from guide sources"
                disabled={saving}
              />
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
