import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Chip,
  Grid,
  Divider,
  Tooltip,
  Paper,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Tab,
  Tabs,
  Badge,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Tune as TuneIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  ContentCopy as CopyIcon,
  Settings as SettingsIcon,
  Devices as DevicesIcon,
  Stream as StreamIcon,
  Assignment as AssignmentIcon,
  PlayArrow as PlayIcon,
  RemoveCircle as RemoveIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';

const CLIENT_TYPES = {
  web_browser: 'Web Browser',
  android_mobile: 'Android Mobile',
  android_tv: 'Android TV',
  ios_mobile: 'iOS Mobile', 
  apple_tv: 'Apple TV'
};

const DEFAULT_FFMPEG_ARGS = {
  web_browser: '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1',
  android_mobile: '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1',
  android_tv: '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1',
  ios_mobile: '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1',
  apple_tv: '-hide_banner -loglevel error -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i [URL] -c:v copy -c:a copy -bsf:v dump_extra -f mpegts -mpegts_copyts 1 -avoid_negative_ts make_zero -fflags +genpts+igndts+discardcorrupt -copyts -muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 0 -max_muxing_queue_size 9999 pipe:1'
};

const DEFAULT_HLS_ARGS = {
  web_browser: '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto',
  android_mobile: '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto',
  android_tv: '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto',
  ios_mobile: '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto',
  apple_tv: '-allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,pipe,crypto'
};

function FFmpegProfileManager() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState(null);
  const [dialogTab, setDialogTab] = useState(0);
  const [availableStreams, setAvailableStreams] = useState([]);
  const [selectedStreams, setSelectedStreams] = useState([]);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [assigningStreams, setAssigningStreams] = useState(false);
  const [bulkAssignments, setBulkAssignments] = useState([]);
  const [expandedProfiles, setExpandedProfiles] = useState(new Set());
  const [applyToAllConfirm, setApplyToAllConfirm] = useState(null);
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_default: false,
    clients: {}
  });

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/ffmpeg-profiles');
      if (response.ok) {
        const data = await response.json();
        setProfiles(data);
      } else {
        setError('Failed to load FFmpeg profiles');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch full profile data including associated streams with cache busting
  const fetchProfileWithStreams = async (profileId, bustCache = false) => {
    try {
      // Use cache busting to ensure fresh data when needed
      const cacheBuster = bustCache ? `?_t=${Date.now()}` : '';
      const response = await fetch(`/api/ffmpeg-profiles${cacheBuster}`);
      if (response.ok) {
        const profiles = await response.json();
        const profile = profiles.find(p => p.id === profileId);
        return profile || null;
      }
      return null;
    } catch (err) {
      console.error('Error fetching profile with streams:', err);
      return null;
    }
  };

  const fetchAvailableStreams = async (profileId) => {
    if (!profileId) return;
    
    setLoadingStreams(true);
    try {
      const response = await fetch(`/api/ffmpeg-profiles/available-streams/${profileId}`);
      if (response.ok) {
        const streams = await response.json();
        setAvailableStreams(streams);
      } else {
        enqueueSnackbar('Failed to load available streams', { variant: 'error' });
      }
    } catch (error) {
      enqueueSnackbar('Error loading streams', { variant: 'error' });
    } finally {
      setLoadingStreams(false);
    }
  };

  const handleOpenDialog = async (profile = null) => {
    if (profile) {
      // Fetch full profile data including associated streams
      const fullProfile = await fetchProfileWithStreams(profile.id);
      if (fullProfile) {
        setEditingProfile(fullProfile);
        setFormData({
          name: fullProfile.name,
          description: fullProfile.description || '',
          is_default: fullProfile.is_default === 1,
          clients: fullProfile.clients || {}
        });
      } else {
        // Fallback to basic profile data if fetch fails
        setEditingProfile(profile);
        setFormData({
          name: profile.name,
          description: profile.description || '',
          is_default: profile.is_default === 1,
          clients: profile.clients || {}
        });
      }
      // Load available streams for assignment tab
      fetchAvailableStreams(profile.id);
    } else {
      setEditingProfile(null);
      setFormData({
        name: '',
        description: '',
        is_default: false,
        clients: {
          web_browser: {
            ffmpeg_args: DEFAULT_FFMPEG_ARGS.web_browser,
            hls_args: DEFAULT_HLS_ARGS.web_browser
          }
        }
      });
    }
    setDialogTab(0); // Reset to first tab
    setSelectedStreams([]);
    setBulkAssignments([]);
    setDialogOpen(true);
  };

  const handleBulkAssignStreams = async () => {
    if (!editingProfile || selectedStreams.length === 0) {
      enqueueSnackbar('Please select streams to assign', { variant: 'warning' });
      return;
    }

    setAssigningStreams(true);
    try {
      const response = await fetch(`/api/ffmpeg-profiles/${editingProfile.id}/assign-streams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamIds: selectedStreams })
      });

      if (response.ok) {
        const result = await response.json();
        
        // IMMEDIATE GUI STATE UPDATE - Add newly assigned streams to editingProfile
        if (editingProfile && availableStreams.length > 0) {
          // Find the streams that were just assigned
          const newlyAssignedStreams = availableStreams.filter(
            stream => selectedStreams.includes(stream.id)
          );
          
          // Add them to the current associated_streams
          const currentAssociatedStreams = editingProfile.associated_streams || [];
          const updatedAssociatedStreams = [
            ...currentAssociatedStreams,
            ...newlyAssignedStreams.map(stream => ({
              id: stream.id,
              name: stream.name,
              channel_number: stream.channel_number,
              type: stream.type,
              url: stream.url,
              enabled: stream.enabled
            }))
          ];
          const updatedStreamCount = updatedAssociatedStreams.length;
          
          // Create completely new editingProfile object to force React re-render
          const newEditingProfile = {
            ...editingProfile,
            associated_streams: [...updatedAssociatedStreams], // Create new array reference
            stream_count: updatedStreamCount
          };
          
          // Update editingProfile state immediately with new object reference
          setEditingProfile(newEditingProfile);
          
          // Also update the profiles list to reflect changes immediately
          setProfiles(prevProfiles => 
            prevProfiles.map(profile => 
              profile.id === editingProfile.id 
                ? { ...profile, stream_count: updatedStreamCount }
                : profile
            )
          );
        }
        
        // Show success notification AFTER immediate state update
        enqueueSnackbar(
          `Successfully assigned ${result.assignedStreams} stream${result.assignedStreams !== 1 ? 's' : ''} to ${editingProfile.name}`,
          { variant: 'success' }
        );
        
        // Clear selection immediately
        setSelectedStreams([]);
        
        // DON'T call fetchProfiles() immediately - it overwrites editingProfile state
        // Instead, only refresh available streams for assignment tab
        fetchAvailableStreams(editingProfile.id);
      } else {
        const error = await response.json();
        enqueueSnackbar(error.error || 'Failed to assign streams', { variant: 'error' });
      }
    } catch (error) {
      enqueueSnackbar('Error assigning streams', { variant: 'error' });
    } finally {
      setAssigningStreams(false);
    }
  };

  const handleRemoveStreamsFromProfile = async (streamIds) => {
    setAssigningStreams(true);
    try {
      const response = await fetch('/api/ffmpeg-profiles/remove-streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamIds })
      });

      if (response.ok) {
        const result = await response.json();
        
        // IMMEDIATE GUI STATE UPDATE - Force React re-render with completely new object
        if (editingProfile && editingProfile.associated_streams) {
          const updatedAssociatedStreams = editingProfile.associated_streams.filter(
            stream => !streamIds.includes(stream.id)
          );
          const updatedStreamCount = updatedAssociatedStreams.length;
          
          // Create completely new editingProfile object to force React re-render
          const newEditingProfile = {
            ...editingProfile,
            associated_streams: [...updatedAssociatedStreams], // Create new array reference
            stream_count: updatedStreamCount
          };
          
          // Update editingProfile state immediately with new object reference
          setEditingProfile(newEditingProfile);
          
          // Also update the profiles list to reflect changes immediately
          setProfiles(prevProfiles => 
            prevProfiles.map(profile => 
              profile.id === editingProfile.id 
                ? { ...profile, stream_count: updatedStreamCount }
                : profile
            )
          );
        }
        
        // Show success notification AFTER immediate state update
        enqueueSnackbar(
          `Successfully removed ${result.removedStreams} stream${result.removedStreams !== 1 ? 's' : ''} from profile`,
          { variant: 'success' }
        );
        
        // DON'T call fetchProfiles() immediately - it overwrites editingProfile state
        // Instead, refresh available streams for assignment tab only
        if (editingProfile) {
          fetchAvailableStreams(editingProfile.id);
        }
      } else {
        const error = await response.json();
        enqueueSnackbar(error.error || 'Failed to remove streams', { variant: 'error' });
      }
    } catch (error) {
      enqueueSnackbar('Error removing streams', { variant: 'error' });
    } finally {
      setAssigningStreams(false);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingProfile(null);
    setFormData({
      name: '',
      description: '',
      is_default: false,
      clients: {}
    });
    setSelectedStreams([]);
    setBulkAssignments([]);
    setAvailableStreams([]);
  };

  const handleSaveProfile = async () => {
    try {
      const url = editingProfile 
        ? `/api/ffmpeg-profiles/${editingProfile.id}`
        : '/api/ffmpeg-profiles';
      
      const method = editingProfile ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const savedProfile = await response.json();
        const profileId = editingProfile ? editingProfile.id : savedProfile.id;
        
        // Handle bulk assignments if any are selected
        if (selectedStreams.length > 0 && profileId) {
          try {
            const assignResponse = await fetch(`/api/ffmpeg-profiles/${profileId}/assign-streams`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ streamIds: selectedStreams })
            });
            
            if (assignResponse.ok) {
              const assignResult = await assignResponse.json();
              
              // IMMEDIATE GUI STATE UPDATE for bulk assignments during profile save
              if (editingProfile && availableStreams.length > 0) {
                const newlyAssignedStreams = availableStreams.filter(
                  stream => selectedStreams.includes(stream.id)
                );
                
                const currentAssociatedStreams = editingProfile.associated_streams || [];
                const updatedAssociatedStreams = [
                  ...currentAssociatedStreams,
                  ...newlyAssignedStreams.map(stream => ({
                    id: stream.id,
                    name: stream.name,
                    channel_number: stream.channel_number,
                    type: stream.type,
                    url: stream.url,
                    enabled: stream.enabled
                  }))
                ];
                
                // Create completely new editingProfile object to force React re-render
                const newEditingProfile = {
                  ...editingProfile,
                  associated_streams: [...updatedAssociatedStreams], // Create new array reference
                  stream_count: updatedAssociatedStreams.length
                };
                
                setEditingProfile(newEditingProfile);
              }
              
              enqueueSnackbar(
                `Profile ${editingProfile ? 'updated' : 'created'} successfully and assigned ${assignResult.assignedStreams} stream${assignResult.assignedStreams !== 1 ? 's' : ''}`,
                { variant: 'success' }
              );
              
              // Refresh profile data to ensure backend synchronization
              if (editingProfile) {
                const updatedProfile = await fetchProfileWithStreams(editingProfile.id, true);
                if (updatedProfile) {
                  setEditingProfile(updatedProfile);
                }
              }
            } else {
              enqueueSnackbar(
                `Profile ${editingProfile ? 'updated' : 'created'} successfully, but failed to assign some streams`,
                { variant: 'warning' }
              );
            }
          } catch (assignError) {
            enqueueSnackbar(
              `Profile ${editingProfile ? 'updated' : 'created'} successfully, but failed to assign streams`,
              { variant: 'warning' }
            );
          }
        } else {
          enqueueSnackbar(
            editingProfile ? 'Profile updated successfully' : 'Profile created successfully',
            { variant: 'success' }
          );
        }
        
        // Refresh profiles before closing dialog to ensure UI is up-to-date
        await fetchProfiles();
        handleCloseDialog();
      } else {
        const error = await response.json();
        enqueueSnackbar(error.error || 'Failed to save profile', { variant: 'error' });
      }
    } catch (err) {
      enqueueSnackbar(`Error: ${err.message}`, { variant: 'error' });
    }
  };

  const handleDeleteProfile = async () => {
    if (!profileToDelete) return;
    
    try {
      const response = await fetch(`/api/ffmpeg-profiles/${profileToDelete.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        enqueueSnackbar('Profile deleted successfully', { variant: 'success' });
        setDeleteConfirmOpen(false);
        setProfileToDelete(null);
        fetchProfiles();
      } else {
        const error = await response.json();
        enqueueSnackbar(error.error || 'Failed to delete profile', { variant: 'error' });
      }
    } catch (err) {
      enqueueSnackbar(`Error: ${err.message}`, { variant: 'error' });
    }
  };

  const handleSetDefault = async (profileId) => {
    try {
      const response = await fetch(`/api/ffmpeg-profiles/${profileId}/set-default`, {
        method: 'POST'
      });

      if (response.ok) {
        enqueueSnackbar('Default profile updated', { variant: 'success' });
        fetchProfiles();
      } else {
        const error = await response.json();
        enqueueSnackbar(error.error || 'Failed to set default profile', { variant: 'error' });
      }
    } catch (err) {
      enqueueSnackbar(`Error: ${err.message}`, { variant: 'error' });
    }
  };

  const addClientConfig = (clientType) => {
    setFormData(prev => ({
      ...prev,
      clients: {
        ...prev.clients,
        [clientType]: {
          ffmpeg_args: DEFAULT_FFMPEG_ARGS[clientType] || '',
          hls_args: DEFAULT_HLS_ARGS[clientType] || ''
        }
      }
    }));
  };

  const removeClientConfig = (clientType) => {
    setFormData(prev => {
      const newClients = { ...prev.clients };
      delete newClients[clientType];
      return { ...prev, clients: newClients };
    });
  };

  const updateClientConfig = (clientType, field, value) => {
    setFormData(prev => ({
      ...prev,
      clients: {
        ...prev.clients,
        [clientType]: {
          ...prev.clients[clientType],
          [field]: value
        }
      }
    }));
  };

  const duplicateProfile = (profile) => {
    setEditingProfile(null);
    setFormData({
      name: `${profile.name} (Copy)`,
      description: profile.description || '',
      is_default: false,
      clients: profile.clients || {}
    });
    setDialogOpen(true);
  };

  const toggleProfileExpansion = (profileId) => {
    setExpandedProfiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(profileId)) {
        newSet.delete(profileId);
      } else {
        newSet.add(profileId);
      }
      return newSet;
    });
  };

  const applyToAllClients = (sourceClientType) => {
    const sourceConfig = formData.clients[sourceClientType];
    if (!sourceConfig) return;

    // CRITICAL FIX: Use Object.keys() instead of Object.values() to get actual client type keys
    const updatedClients = { ...formData.clients }; // Preserve existing configurations
    Object.keys(CLIENT_TYPES).forEach(clientTypeKey => {
      updatedClients[clientTypeKey] = {
        ffmpeg_args: sourceConfig.ffmpeg_args,
        hls_args: sourceConfig.hls_args
      };
    });

    setFormData(prev => ({
      ...prev,
      clients: updatedClients
    }));

    enqueueSnackbar(`Applied ${CLIENT_TYPES[sourceClientType]} settings to all client types`, { variant: 'success' });
    setApplyToAllConfirm(null);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: isMobile ? 2 : 3 }}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: isMobile ? 'flex-start' : 'center', 
        justifyContent: 'space-between', 
        mb: 3,
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 2 : 0
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <TuneIcon sx={{ mr: 2, color: 'primary.main', fontSize: isMobile ? 28 : 32 }} />
          <Typography variant={isMobile ? "h5" : "h4"} component="h1">
            FFmpeg Profiles
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          fullWidth={isMobile}
          size={isMobile ? "large" : "medium"}
        >
          Add Profile
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {profiles.length === 0 ? (
          <Grid item xs={12}>
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <SettingsIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                No Profiles Found
              </Typography>
              <Typography color="text.secondary" paragraph>
                Create your first FFmpeg profile to customize transcoding settings for different client types.
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
              >
                Create First Profile
              </Button>
            </Paper>
          </Grid>
        ) : (
          profiles.map((profile) => (
            <Grid item xs={12} sm={6} lg={4} key={profile.id}>
              <Card sx={{ 
                height: '100%',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 3
                }
              }}>
                <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0, mr: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography 
                          variant={isMobile ? "subtitle1" : "h6"} 
                          sx={{ 
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontWeight: 'bold'
                          }}
                          title={profile.name}
                        >
                          {profile.name}
                        </Typography>
                        <Badge 
                          badgeContent={profile.stream_count || 0} 
                          color={(profile.stream_count || 0) > 0 ? 'primary' : 'default'}
                          max={999}
                          sx={{
                            '& .MuiBadge-badge': {
                              fontSize: '0.7rem',
                              height: 18,
                              minWidth: 18
                            }
                          }}
                        >
                          <StreamIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                        </Badge>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                        {profile.is_default === 1 && (
                          <Chip 
                            label="Default" 
                            color="primary" 
                            size={isMobile ? "medium" : "small"}
                            sx={{ fontSize: isMobile ? '0.75rem' : '0.7rem' }}
                          />
                        )}
                        {profile.is_system === 1 && (
                          <Chip 
                            label="System" 
                            color="secondary" 
                            size={isMobile ? "medium" : "small"}
                            sx={{ fontSize: isMobile ? '0.75rem' : '0.7rem' }}
                          />
                        )}
                        {(profile.stream_count || 0) > 0 && (
                          <Chip 
                            label={`${profile.stream_count} stream${(profile.stream_count || 0) !== 1 ? 's' : ''}`}
                            color="info"
                            variant="outlined"
                            size={isMobile ? "medium" : "small"}
                            sx={{ fontSize: isMobile ? '0.75rem' : '0.7rem' }}
                          />
                        )}
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 0.5 }}>
                      {profile.is_system !== 1 && (
                        <>
                          <Tooltip title="Edit">
                            <IconButton 
                              size={isMobile ? "medium" : "small"} 
                              onClick={() => handleOpenDialog(profile)}
                              sx={{ color: 'primary.main' }}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Duplicate">
                            <IconButton 
                              size={isMobile ? "medium" : "small"} 
                              onClick={() => duplicateProfile(profile)}
                              sx={{ color: 'info.main' }}
                            >
                              <CopyIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton 
                              size={isMobile ? "medium" : "small"} 
                              onClick={() => {
                                setProfileToDelete(profile);
                                setDeleteConfirmOpen(true);
                              }}
                              sx={{ color: 'error.main' }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {profile.is_default !== 1 && (
                        <Tooltip title="Set as Default">
                          <IconButton 
                            size={isMobile ? "medium" : "small"} 
                            onClick={() => handleSetDefault(profile.id)}
                            sx={{ color: 'warning.main' }}
                          >
                            <SettingsIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                  
                  {profile.description && (
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {profile.description}
                    </Typography>
                  )}

                  <Divider sx={{ my: 2 }} />
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography 
                      variant={isMobile ? "body2" : "subtitle2"} 
                      sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}
                    >
                      <StreamIcon sx={{ mr: 1, fontSize: isMobile ? 20 : 18 }} />
                      Associated Streams
                    </Typography>
                  </Box>
                  
                  {profile.associated_streams && profile.associated_streams.length > 0 ? (
                    <Box sx={{ mt: 1, mb: 2 }}>
                      {(expandedProfiles.has(profile.id)
                        ? profile.associated_streams
                        : profile.associated_streams.slice(0, isMobile ? 2 : 3)
                      ).map((stream) => (
                        <Box key={stream.id} sx={{ mb: 0.5 }}>
                          <Typography
                            variant={isMobile ? "body2" : "caption"}
                            display="block"
                            color="text.secondary"
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={`${stream.channel_number ? `Ch ${stream.channel_number}: ` : ''}${stream.name}`}
                          >
                            • {stream.channel_number ? `Ch ${stream.channel_number}: ` : ''}{stream.name}
                          </Typography>
                        </Box>
                      ))}
                      {profile.associated_streams.length > (isMobile ? 2 : 3) && (
                        <Button
                          size="small"
                          variant="text"
                          color="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleProfileExpansion(profile.id);
                          }}
                          sx={{
                            p: 0,
                            minWidth: 'auto',
                            textTransform: 'none',
                            fontWeight: 'bold',
                            fontSize: isMobile ? '0.875rem' : '0.75rem',
                            '&:hover': { backgroundColor: 'action.hover' }
                          }}
                          startIcon={expandedProfiles.has(profile.id) ?
                            <KeyboardArrowUpIcon /> :
                            <KeyboardArrowDownIcon />
                          }
                        >
                          {expandedProfiles.has(profile.id)
                            ? 'Show fewer streams'
                            : `Show ${profile.associated_streams.length - 3} more streams`
                          }
                        </Button>
                      )}
                    </Box>
                  ) : (
                    <Typography 
                      variant={isMobile ? "body2" : "body2"} 
                      color="text.secondary" 
                      sx={{ mb: 2, fontStyle: 'italic' }}
                    >
                      No streams assigned
                    </Typography>
                  )}

                  <Divider sx={{ my: 2 }} />
                  
                  <Typography 
                    variant={isMobile ? "body2" : "subtitle2"} 
                    gutterBottom 
                    sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}
                  >
                    <DevicesIcon sx={{ mr: 1, fontSize: isMobile ? 20 : 18 }} />
                    Client Configurations
                  </Typography>
                  
                  {profile.clients && Object.keys(profile.clients).length > 0 ? (
                    <Box sx={{ mt: 1 }}>
                      {Object.entries(profile.clients).map(([clientType, config]) => (
                        <Chip
                          key={clientType}
                          label={CLIENT_TYPES[clientType] || clientType}
                          size={isMobile ? "medium" : "small"}
                          variant="outlined"
                          color="primary"
                          sx={{ 
                            mr: 0.5, 
                            mb: 0.5,
                            fontSize: isMobile ? '0.75rem' : '0.7rem'
                          }}
                        />
                      ))}
                    </Box>
                  ) : (
                    <Typography 
                      variant={isMobile ? "body2" : "body2"} 
                      color="text.secondary"
                      sx={{ fontStyle: 'italic' }}
                    >
                      No client configurations
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>

      {/* Add/Edit Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleCloseDialog} 
        maxWidth="lg" 
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h5">
              {editingProfile ? `Edit Profile: ${editingProfile.name}` : 'Add New Profile'}
            </Typography>
            {editingProfile && (
              <Chip
                label={`${editingProfile.stream_count || 0} stream${(editingProfile.stream_count || 0) !== 1 ? 's' : ''}`}
                color={(editingProfile.stream_count || 0) > 0 ? 'primary' : 'default'}
                size="small"
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          {editingProfile && (
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs 
                value={dialogTab} 
                onChange={(e, newValue) => setDialogTab(newValue)}
                aria-label="profile management tabs"
                variant={isMobile ? "fullWidth" : "standard"}
                scrollButtons={isMobile ? false : "auto"}
                allowScrollButtonsMobile
              >
                <Tab 
                  icon={<SettingsIcon />}
                  label={isMobile ? "Config" : "Configuration"} 
                  id="tab-0"
                  aria-controls="tabpanel-0"
                  sx={{ minWidth: isMobile ? 'auto' : 160 }}
                />
                <Tab
                  icon={
                    <Badge badgeContent={editingProfile.stream_count || 0} color="primary">
                      <StreamIcon />
                    </Badge>
                  }
                  label={isMobile ? "Streams" : "Associated Streams"}
                  id="tab-1"
                  aria-controls="tabpanel-1"
                  sx={{ minWidth: isMobile ? 'auto' : 160 }}
                />
                <Tab
                  icon={<AssignmentIcon />}
                  label={isMobile ? "Assign" : "Bulk Assignment"}
                  id="tab-2"
                  aria-controls="tabpanel-2"
                  sx={{ minWidth: isMobile ? 'auto' : 160 }}
                />
              </Tabs>
            </Box>
          )}
          
          {/* Configuration Tab Content */}
          {(!editingProfile || dialogTab === 0) && (
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Profile Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              margin="normal"
              required
            />
            
            <TextField
              fullWidth
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              margin="normal"
              multiline
              rows={2}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                />
              }
              label="Set as Default Profile"
              sx={{ mt: 2, mb: 3 }}
            />

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" gutterBottom>
              Client Configurations
            </Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Add Client Type</InputLabel>
              <Select
                value=""
                onChange={(e) => addClientConfig(e.target.value)}
                label="Add Client Type"
              >
                {Object.entries(CLIENT_TYPES).map(([key, label]) => (
                  <MenuItem 
                    key={key} 
                    value={key}
                    disabled={formData.clients[key] !== undefined}
                  >
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {Object.entries(formData.clients).map(([clientType, config]) => (
              <Accordion key={clientType} defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography sx={{ flexGrow: 1 }}>
                      {CLIENT_TYPES[clientType] || clientType}
                    </Typography>
                    <Tooltip title="Apply these settings to all client types">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<CopyIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setApplyToAllConfirm(clientType);
                        }}
                        sx={{ mr: 1, fontSize: '0.75rem' }}
                        data-testid={`apply-to-all-button-${clientType}`}
                      >
                        Apply to All
                      </Button>
                    </Tooltip>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeClientConfig(clientType);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <TextField
                    fullWidth
                    label="FFmpeg Arguments"
                    value={config.ffmpeg_args || ''}
                    onChange={(e) => updateClientConfig(clientType, 'ffmpeg_args', e.target.value)}
                    margin="normal"
                    multiline
                    rows={2}
                    helperText="Command-line arguments for FFmpeg transcoding"
                  />
                  <TextField
                    fullWidth
                    label="HLS Arguments (Optional)"
                    value={config.hls_args || ''}
                    onChange={(e) => updateClientConfig(clientType, 'hls_args', e.target.value)}
                    margin="normal"
                    multiline
                    rows={2}
                    helperText="Additional arguments for HLS streaming"
                  />
                </AccordionDetails>
              </Accordion>
            ))}

            {Object.keys(formData.clients).length === 0 && (
              <Alert severity="info">
                Add client configurations to customize FFmpeg settings for different device types.
              </Alert>
            )}
          </Box>
          )}

          {/* Associated Streams Tab */}
          {editingProfile && dialogTab === 1 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                Streams Using This Profile
              </Typography>
              
              {editingProfile.associated_streams && editingProfile.associated_streams.length > 0 ? (
                <List sx={{
                  '& .MuiListItem-root': {
                    py: isMobile ? 2 : 1,
                    px: isMobile ? 1 : 2
                  }
                }}>
                  {editingProfile.associated_streams.map((stream) => (
                    <ListItem 
                      key={stream.id} 
                      divider
                      sx={{
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        alignItems: isMobile ? 'stretch' : 'center',
                        overflow: 'visible',
                        minHeight: isMobile ? 'auto' : 72,
                        py: isMobile ? 2 : 1.5,
                        px: isMobile ? 1 : 2
                      }}
                    >
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        flex: 1,
                        minWidth: 0,
                        mb: isMobile ? 1.5 : 0,
                        mr: isMobile ? 0 : 2,
                        overflow: 'hidden'
                      }}>
                        <ListItemIcon sx={{ minWidth: isMobile ? 40 : 56 }}>
                          <PlayIcon 
                            color={stream.enabled ? 'primary' : 'disabled'} 
                            sx={{ fontSize: isMobile ? 24 : 20 }}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 1,
                              flexWrap: isMobile ? 'wrap' : 'nowrap',
                              overflow: 'hidden'
                            }}>
                              {stream.channel_number && (
                                <Chip 
                                  label={`Ch ${stream.channel_number}`} 
                                  size={isMobile ? "medium" : "small"} 
                                  variant="outlined" 
                                />
                              )}
                              <Typography 
                                variant={isMobile ? "body1" : "body1"}
                                sx={{
                                  fontWeight: 'bold',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: isMobile ? 'normal' : 'nowrap',
                                  flexGrow: 1,
                                  minWidth: 0
                                }}
                                title={stream.name}
                              >
                                {stream.name}
                              </Typography>
                              <Chip 
                                label={stream.type?.toUpperCase()} 
                                size={isMobile ? "medium" : "small"} 
                                color="primary" 
                                variant="outlined" 
                              />
                              {!stream.enabled && (
                                <Chip 
                                  label="Disabled" 
                                  size={isMobile ? "medium" : "small"} 
                                  color="error" 
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            <Typography 
                              variant={isMobile ? "body2" : "body2"} 
                              color="text.secondary" 
                              sx={{ 
                                mt: 0.5,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={stream.url}
                            >
                              {stream.url}
                            </Typography>
                          }
                        />
                      </Box>
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: isMobile ? 'center' : 'flex-end',
                        alignItems: 'center',
                        flexShrink: 0,
                        width: isMobile ? '100%' : 'auto',
                        maxWidth: isMobile ? '100%' : 140,
                        overflow: 'visible'
                      }}>
                        <Button
                          color="error"
                          variant="outlined"
                          onClick={() => handleRemoveStreamsFromProfile([stream.id])}
                          disabled={assigningStreams}
                          title="Remove from profile"
                          startIcon={<RemoveIcon />}
                          size={isMobile ? "medium" : "small"}
                          sx={{ 
                            minWidth: isMobile ? 120 : 100,
                            maxWidth: isMobile ? '100%' : 140,
                            whiteSpace: 'nowrap',
                            fontSize: isMobile ? '0.875rem' : '0.75rem'
                          }}
                        >
                          Remove
                        </Button>
                      </Box>
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Alert severity="info">
                  No streams are currently assigned to this profile. Use the "Bulk Assignment" tab to assign streams.
                </Alert>
              )}
            </Box>
          )}

          {/* Bulk Assignment Tab */}
          {editingProfile && dialogTab === 2 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                Assign Streams to Profile
              </Typography>
              
              {loadingStreams ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Select streams to assign to this profile. Streams already using other profiles will be moved to this profile.
                  </Alert>
                  
                  {selectedStreams.length > 0 && (
                    <Box sx={{ 
                      mb: 2, 
                      display: 'flex', 
                      alignItems: isMobile ? 'stretch' : 'center', 
                      gap: 2,
                      flexDirection: isMobile ? 'column' : 'row'
                    }}>
                      <Typography 
                        variant={isMobile ? "body1" : "body2"}
                        sx={{ 
                          fontWeight: 'bold',
                          textAlign: isMobile ? 'center' : 'left',
                          color: 'primary.main'
                        }}
                      >
                        {selectedStreams.length} stream{selectedStreams.length !== 1 ? 's' : ''} selected
                      </Typography>
                      <Box sx={{ 
                        display: 'flex', 
                        gap: 1,
                        flexDirection: isMobile ? 'column' : 'row',
                        width: isMobile ? '100%' : 'auto'
                      }}>
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={handleBulkAssignStreams}
                          disabled={assigningStreams}
                          startIcon={assigningStreams ? <CircularProgress size={20} /> : <AssignmentIcon />}
                          fullWidth={isMobile}
                          size={isMobile ? "large" : "medium"}
                        >
                          {assigningStreams ? 'Assigning...' : 'Assign Selected'}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => setSelectedStreams([])}
                          disabled={assigningStreams}
                          fullWidth={isMobile}
                          size={isMobile ? "large" : "medium"}
                        >
                          Clear Selection
                        </Button>
                      </Box>
                    </Box>
                  )}
                  
                  {availableStreams.length > 0 ? (
                    <List sx={{ 
                      maxHeight: isMobile ? 300 : 400, 
                      overflow: 'auto',
                      '& .MuiListItem-root': {
                        py: isMobile ? 2 : 1,
                        px: isMobile ? 1 : 2
                      }
                    }}>
                      {availableStreams.map((stream) => (
                        <ListItem
                          key={stream.id}
                          divider
                          sx={{
                            backgroundColor: selectedStreams.includes(stream.id)
                              ? 'action.selected'
                              : 'transparent',
                            '&:hover': { backgroundColor: 'action.hover' },
                            transition: 'background-color 0.2s ease'
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: isMobile ? 40 : 56 }}>
                            <Checkbox
                              checked={selectedStreams.includes(stream.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedStreams([...selectedStreams, stream.id]);
                                } else {
                                  setSelectedStreams(selectedStreams.filter(id => id !== stream.id));
                                }
                              }}
                              disabled={assigningStreams}
                              size={isMobile ? "medium" : "small"}
                              sx={{
                                '& .MuiSvgIcon-root': {
                                  fontSize: isMobile ? 24 : 20
                                }
                              }}
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 1,
                                flexWrap: isMobile ? 'wrap' : 'nowrap',
                                mb: isMobile ? 0.5 : 0
                              }}>
                                {stream.channel_number && (
                                  <Chip 
                                    label={`Ch ${stream.channel_number}`} 
                                    size={isMobile ? "medium" : "small"} 
                                    variant="outlined" 
                                  />
                                )}
                                <Typography 
                                  variant={isMobile ? "body1" : "body1"}
                                  sx={{ 
                                    fontWeight: 'bold',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: isMobile ? 'normal' : 'nowrap',
                                    flexGrow: 1,
                                    minWidth: 0
                                  }}
                                  title={stream.name}
                                >
                                  {stream.name}
                                </Typography>
                                <Chip 
                                  label={stream.type?.toUpperCase()} 
                                  size={isMobile ? "medium" : "small"} 
                                  color="primary" 
                                  variant="outlined" 
                                />
                              </Box>
                            }
                            secondary={
                              <Box sx={{ mt: isMobile ? 1 : 0.5 }}>
                                {stream.is_using_current_profile && (
                                  <Chip 
                                    label="Already using this profile" 
                                    size={isMobile ? "medium" : "small"} 
                                    color="success" 
                                    sx={{ mb: 0.5, mr: 0.5 }}
                                  />
                                )}
                                {stream.profile_name && !stream.is_using_current_profile && (
                                  <Chip 
                                    label={`Using: ${stream.profile_name}`} 
                                    size={isMobile ? "medium" : "small"} 
                                    variant="outlined" 
                                    sx={{ mb: 0.5, mr: 0.5 }}
                                  />
                                )}
                                <Typography 
                                  variant={isMobile ? "body2" : "caption"} 
                                  color="text.secondary"
                                  sx={{ 
                                    display: 'block',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    mt: 0.5
                                  }}
                                  title={stream.url}
                                >
                                  {stream.url}
                                </Typography>
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Alert severity="warning">
                      No streams available for assignment.
                    </Alert>
                  )}
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ 
          p: isMobile ? 2 : 3, 
          gap: isMobile ? 1 : 2,
          flexDirection: isMobile ? 'column-reverse' : 'row'
        }}>
          <Button 
            onClick={handleCloseDialog} 
            startIcon={<CancelIcon />}
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
            color="inherit"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSaveProfile} 
            variant="contained" 
            startIcon={<SaveIcon />}
            disabled={!formData.name || Object.keys(formData.clients).length === 0}
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
            color="primary"
          >
            {editingProfile ? 'Update Profile' : 'Create Profile'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={deleteConfirmOpen} 
        onClose={() => setDeleteConfirmOpen(false)}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Typography variant={isMobile ? "h5" : "h6"}>
            Confirm Delete
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          <Typography variant={isMobile ? "body1" : "body2"}>
            Are you sure you want to delete the profile "{profileToDelete?.name}"?
          </Typography>
          {profileToDelete?.stream_count > 0 && (
            <Typography 
              variant={isMobile ? "body2" : "caption"} 
              color="warning.main" 
              sx={{ mt: 2, fontWeight: 'bold' }}
            >
              Warning: This profile is currently used by {profileToDelete.stream_count} stream{profileToDelete.stream_count !== 1 ? 's' : ''}. 
              Those streams will revert to the default profile.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ 
          p: isMobile ? 2 : 3, 
          gap: isMobile ? 1 : 2,
          flexDirection: isMobile ? 'column-reverse' : 'row'
        }}>
          <Button 
            onClick={() => setDeleteConfirmOpen(false)}
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
            color="inherit"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteProfile} 
            color="error" 
            variant="contained"
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
          >
            Delete Profile
          </Button>
        </DialogActions>
      </Dialog>

      {/* Apply to All Confirmation Dialog */}
      <Dialog
        open={!!applyToAllConfirm}
        onClose={() => setApplyToAllConfirm(null)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        data-testid="apply-to-all-confirm-dialog"
      >
        <DialogTitle>
          <Typography variant={isMobile ? "h5" : "h6"}>
            Apply Settings to All Client Types?
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          <Typography variant={isMobile ? "body1" : "body2"} paragraph>
            This will overwrite the FFmpeg and HLS settings for all other client types
            with the settings from <strong>{applyToAllConfirm ? CLIENT_TYPES[applyToAllConfirm] : ''}</strong>.
          </Typography>
          <Typography variant={isMobile ? "body2" : "caption"} color="warning.main">
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{
          p: isMobile ? 2 : 3,
          gap: isMobile ? 1 : 2,
          flexDirection: isMobile ? 'column-reverse' : 'row'
        }}>
          <Button
            onClick={() => setApplyToAllConfirm(null)}
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
            color="inherit"
            data-testid="cancel-apply-to-all-button"
          >
            Cancel
          </Button>
          <Button
            onClick={() => applyToAllClients(applyToAllConfirm)}
            variant="contained"
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
            color="primary"
            data-testid="confirm-apply-to-all-button"
          >
            Apply to All
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default FFmpegProfileManager;