import React, { useMemo, useCallback } from 'react';
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
  Tooltip
} from '@mui/material';
import { FixedSizeList as List } from 'react-window';
import { Visibility as PreviewIcon } from '@mui/icons-material';

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
  // Filter channels based on search and group
  const filteredChannels = useMemo(() => {
    let filtered = channels;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(channel => 
        channel.name?.toLowerCase().includes(query) ||
        channel.attributes?.['group-title']?.toLowerCase().includes(query) ||
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

  // Row component for react-window
  const Row = useCallback(({ index, style }) => {
    const channel = filteredChannels[index];
    const actualIndex = channels.findIndex(c => c.id === channel.id);
    const isSelected = selectedChannels.includes(actualIndex);
    
    return (
      <div style={style}>
        <TableRow hover selected={isSelected} sx={{ height: ITEM_HEIGHT }}>
          <TableCell padding="checkbox" sx={{ borderBottom: 'none' }}>
            <Checkbox
              checked={isSelected}
              onChange={() => handleChannelSelect(index)}
              size="small"
            />
          </TableCell>
          <TableCell sx={{ borderBottom: 'none' }}>
            <Typography variant="body2" noWrap>
              {channel.attributes?.['tvg-chno'] || index + 1}
            </Typography>
          </TableCell>
          <TableCell sx={{ borderBottom: 'none' }}>
            <Box display="flex" alignItems="center" gap={1}>
              {channel.attributes?.['tvg-logo'] && (
                <img 
                  src={channel.attributes['tvg-logo']} 
                  alt="" 
                  style={{ 
                    width: 24, 
                    height: 24, 
                    borderRadius: 4,
                    objectFit: 'cover'
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                {channel.name}
              </Typography>
            </Box>
          </TableCell>
          <TableCell sx={{ borderBottom: 'none' }}>
            <Chip
              label={channel.type?.toUpperCase() || 'HTTP'}
              size="small"
              color="primary"
              variant="outlined"
            />
          </TableCell>
          <TableCell sx={{ borderBottom: 'none' }}>
            <Typography 
              variant="body2" 
              color="text.secondary"
              noWrap
              sx={{ maxWidth: 200 }}
            >
              {channel.url}
            </Typography>
          </TableCell>
          <TableCell sx={{ borderBottom: 'none' }}>
            <Typography variant="body2" noWrap>
              {channel.attributes?.['tvg-id'] || '-'}
            </Typography>
          </TableCell>
          <TableCell sx={{ borderBottom: 'none' }}>
            <Tooltip title="Preview Stream">
              <IconButton 
                size="small"
                onClick={() => onPreview && onPreview(channel)}
              >
                <PreviewIcon />
              </IconButton>
            </Tooltip>
          </TableCell>
        </TableRow>
      </div>
    );
  }, [filteredChannels, channels, selectedChannels, handleChannelSelect, onPreview]);

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
              <Checkbox
                indeterminate={filteredSelectionState.some}
                checked={filteredSelectionState.all}
                onChange={(e) => handleSelectAllFiltered(e.target.checked)}
                size="small"
              />
            </TableCell>
            <TableCell>Number</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>URL</TableCell>
            <TableCell>EPG ID</TableCell>
            <TableCell>Actions</TableCell>
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
      
      {/* Selection summary */}
      <Box 
        sx={{ 
          p: 1, 
          bgcolor: 'background.default',
          borderTop: '1px solid rgba(224, 224, 224, 1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Showing {filteredChannels.length} of {channels.length} channels
        </Typography>
        <Typography variant="body2" color="primary">
          {selectedChannels.length} selected
        </Typography>
      </Box>
    </TableContainer>
  );
};

export default VirtualizedChannelTable;