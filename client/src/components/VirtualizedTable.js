import React, { useMemo, useCallback, useState } from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Checkbox,
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Fade,
  Skeleton,
  useTheme,
  useMediaQuery
} from '@mui/material';
import { FixedSizeList as List } from 'react-window';
import { 
  Visibility as PreviewIcon,
  PlayArrow as PlayIcon,
  Error as ErrorIcon 
} from '@mui/icons-material';

const ITEM_HEIGHT = 64; // Height of each table row
const HEADER_HEIGHT = 56; // Height of table header

const VirtualizedChannelTable = ({
  channels = [],
  selectedChannels = [],
  onSelectionChange,
  onSelectAll,
  onPreview,
  maxHeight = 400,
  searchQuery = '',
  groupFilter = ''
}) => {
  const [previewingChannel, setPreviewingChannel] = useState(null);
  const [imageErrors, setImageErrors] = useState(new Set());
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  // Filter channels based on search and group
  const filteredChannels = useMemo(() => {
    let filtered = channels;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(channel => 
        channel.name?.toLowerCase().includes(query) ||
        channel.attributes?.['group-title']?.toLowerCase().includes(query) ||
        channel.attributes?.['tvg-id']?.toLowerCase().includes(query) ||
        channel.attributes?.['tvg-name']?.toLowerCase().includes(query) ||
        channel.url?.toLowerCase().includes(query)
      );
    }
    
    if (groupFilter && groupFilter !== 'all') {
      filtered = filtered.filter(channel => 
        (channel.attributes?.['group-title'] || 'Ungrouped') === groupFilter
      );
    }
    
    return filtered;
  }, [channels, searchQuery, groupFilter]);

  // Handle selection changes
  const handleChannelSelect = useCallback((channelIndex) => {
    const actualIndex = channels.findIndex(c => c.id === filteredChannels[channelIndex].id);
    if (actualIndex !== -1) {
      onSelectionChange(actualIndex);
    }
  }, [channels, filteredChannels, onSelectionChange]);

  const handleSelectAllFiltered = useCallback((checked) => {
    const filteredIndices = filteredChannels.map(channel => 
      channels.findIndex(c => c.id === channel.id)
    ).filter(index => index !== -1);
    
    onSelectAll(checked, filteredIndices);
  }, [channels, filteredChannels, onSelectAll]);

  // Check selection state for filtered channels
  const filteredSelectionState = useMemo(() => {
    const filteredIndices = filteredChannels.map(channel => 
      channels.findIndex(c => c.id === channel.id)
    ).filter(index => index !== -1);
    
    const selectedCount = filteredIndices.filter(index => 
      selectedChannels.includes(index)
    ).length;
    
    return {
      all: selectedCount === filteredIndices.length && filteredIndices.length > 0,
      some: selectedCount > 0 && selectedCount < filteredIndices.length
    };
  }, [channels, filteredChannels, selectedChannels]);

  // Handle image loading errors
  const handleImageError = useCallback((channelId) => {
    setImageErrors(prev => new Set([...prev, channelId]));
  }, []);

  // Handle preview with loading state
  const handlePreview = useCallback((channel) => {
    setPreviewingChannel(channel.id);
    if (onPreview) {
      onPreview(channel);
      // Reset preview state after a delay
      setTimeout(() => setPreviewingChannel(null), 2000);
    }
  }, [onPreview]);

  // Row component for react-window with enhanced UI
  const Row = useCallback(({ index, style }) => {
    const channel = filteredChannels[index];
    const actualIndex = channels.findIndex(c => c.id === channel.id);
    const isSelected = selectedChannels.includes(actualIndex);
    const hasImageError = imageErrors.has(channel.id);
    const isPreviewing = previewingChannel === channel.id;
    
    return (
      <div style={style}>
        <TableRow 
          hover 
          selected={isSelected} 
          sx={{ 
            height: ITEM_HEIGHT,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              bgcolor: 'action.hover',
              transform: 'translateX(4px)'
            },
            ...(isSelected && {
              bgcolor: 'primary.dark',
              '&:hover': {
                bgcolor: 'primary.main'
              }
            })
          }}
        >
          <TableCell padding="checkbox" sx={{ borderBottom: 'none' }}>
            <Tooltip title={isSelected ? 'Deselect channel' : 'Select channel'} arrow>
              <Checkbox
                checked={isSelected}
                onChange={() => handleChannelSelect(index)}
                size="small"
                color="primary"
                sx={{
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': { transform: 'scale(1.1)' }
                }}
              />
            </Tooltip>
          </TableCell>
          <TableCell sx={{ borderBottom: 'none' }}>
            <Typography variant="body2" noWrap fontWeight={isSelected ? 'bold' : 'normal'}>
              {channel.attributes?.['tvg-chno'] || index + 1}
            </Typography>
          </TableCell>
          <TableCell sx={{ borderBottom: 'none' }}>
            <Box display="flex" alignItems="center" gap={1}>
              {channel.attributes?.['tvg-logo'] && !hasImageError ? (
                <Fade in={true} timeout={300}>
                  <img 
                    src={channel.attributes['tvg-logo']} 
                    alt={`${channel.name} logo`}
                    style={{ 
                      width: 24, 
                      height: 24, 
                      borderRadius: 4,
                      objectFit: 'cover',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}
                    onError={() => handleImageError(channel.id)}
                    loading="lazy"
                  />
                </Fade>
              ) : (
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: 1,
                    bgcolor: 'action.selected',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  <PlayIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                </Box>
              )}
              <Tooltip title={channel.name} arrow>
                <Typography 
                  variant="body2" 
                  noWrap 
                  sx={{ 
                    maxWidth: isMobile ? 120 : 200,
                    fontWeight: isSelected ? 'bold' : 'normal',
                    color: isSelected ? 'primary.contrastText' : 'text.primary'
                  }}
                >
                  {channel.name}
                </Typography>
              </Tooltip>
            </Box>
          </TableCell>
          <TableCell sx={{ borderBottom: 'none' }}>
            <Chip
              label={channel.type?.toUpperCase() || 'HTTP'}
              size="small"
              color={isSelected ? 'secondary' : 'primary'}
              variant={isSelected ? 'filled' : 'outlined'}
              sx={{
                transition: 'all 0.2s ease-in-out',
                fontWeight: 'bold'
              }}
            />
          </TableCell>
          {!isMobile && (
            <TableCell sx={{ borderBottom: 'none' }}>
              <Tooltip title={channel.url} arrow>
                <Typography 
                  variant="body2" 
                  color="text.secondary"
                  noWrap
                  sx={{ 
                    maxWidth: 200,
                    fontFamily: 'monospace',
                    fontSize: '0.75rem'
                  }}
                >
                  {channel.url}
                </Typography>
              </Tooltip>
            </TableCell>
          )}
          <TableCell sx={{ borderBottom: 'none' }}>
            <Typography variant="body2" noWrap color="text.secondary">
              {channel.attributes?.['tvg-id'] || '-'}
            </Typography>
          </TableCell>
          <TableCell sx={{ borderBottom: 'none' }}>
            <Tooltip title="Preview stream in player" arrow>
              <IconButton 
                size="small"
                onClick={() => handlePreview(channel)}
                disabled={isPreviewing}
                sx={{
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': { 
                    transform: 'scale(1.1)',
                    bgcolor: 'primary.main',
                    color: 'white'
                  },
                  ...(isPreviewing && {
                    bgcolor: 'primary.main',
                    color: 'white'
                  })
                }}
                data-testid="preview-stream-button"
              >
                {isPreviewing ? <PlayIcon /> : <PreviewIcon />}
              </IconButton>
            </Tooltip>
          </TableCell>
        </TableRow>
      </div>
    );
  }, [filteredChannels, channels, selectedChannels, handleChannelSelect, handlePreview, imageErrors, previewingChannel, isMobile]);

  if (filteredChannels.length === 0) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        py={4}
      >
        <Typography color="text.secondary">
          {channels.length === 0 ? 'No channels to display' : 'No channels match your filters'}
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ maxHeight }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow sx={{ height: HEADER_HEIGHT }}>
            <TableCell padding="checkbox">
              <Tooltip title="Select all filtered channels" arrow>
                <Checkbox
                  indeterminate={filteredSelectionState.some}
                  checked={filteredSelectionState.all}
                  onChange={(e) => handleSelectAllFiltered(e.target.checked)}
                  size="small"
                  color="primary"
                />
              </Tooltip>
            </TableCell>
            <TableCell>
              <Typography variant="subtitle2" fontWeight="bold">
                #
              </Typography>
            </TableCell>
            <TableCell>
              <Typography variant="subtitle2" fontWeight="bold">
                Channel Name
              </Typography>
            </TableCell>
            <TableCell>
              <Typography variant="subtitle2" fontWeight="bold">
                Type
              </Typography>
            </TableCell>
            {!isMobile && (
              <TableCell>
                <Typography variant="subtitle2" fontWeight="bold">
                  Stream URL
                </Typography>
              </TableCell>
            )}
            <TableCell>
              <Typography variant="subtitle2" fontWeight="bold">
                EPG ID
              </Typography>
            </TableCell>
            <TableCell>
              <Typography variant="subtitle2" fontWeight="bold">
                Preview
              </Typography>
            </TableCell>
          </TableRow>
        </TableHead>
      </Table>
      
      {/* Virtual scrolling body */}
      <Box sx={{ height: maxHeight - HEADER_HEIGHT }}>
        <List
          height={maxHeight - HEADER_HEIGHT}
          itemCount={filteredChannels.length}
          itemSize={ITEM_HEIGHT}
          overscanCount={5} // Render 5 extra items above/below visible area
        >
          {Row}
        </List>
      </Box>
      
      {/* Enhanced Selection Summary */}
      <Box 
        sx={{ 
          p: 2, 
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="body2" color="text.secondary">
            Showing <strong>{filteredChannels.length}</strong> of <strong>{channels.length}</strong> channels
          </Typography>
          {(searchQuery || groupFilter) && (
            <Chip 
              label="Filtered" 
              size="small" 
              color="info" 
              variant="outlined"
            />
          )}
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Chip
            label={`${selectedChannels.length} selected`}
            color={selectedChannels.length > 0 ? 'primary' : 'default'}
            variant={selectedChannels.length > 0 ? 'filled' : 'outlined'}
            size="small"
          />
          {selectedChannels.length > 0 && (
            <Typography variant="caption" color="primary">
              Ready for import
            </Typography>
          )}
        </Box>
      </Box>
    </TableContainer>
  );
};

export default VirtualizedChannelTable;