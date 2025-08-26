import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Box,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Alert,
  FormControlLabel,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  CircularProgress,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Delete as DeleteIcon,
  Tv as TvIcon,
  Stream as StreamIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';

const ConfirmationDialog = ({
  open,
  onClose,
  onConfirm,
  loading,
  title,
  type = 'delete', // 'delete', 'warning', 'info'
  itemName,
  itemType = 'item', // 'channel', 'stream', 'item'
  relatedItems = [],
  relatedItemsLabel = 'Related Items',
  options = [], // Array of {value, label, description} for radio options
  selectedOption,
  onOptionChange,
  children,
  confirmButtonText = 'Delete',
  cancelButtonText = 'Cancel',
  showWarning = true,
}) => {
  const getThemeColors = () => {
    switch (type) {
      case 'delete':
        return {
          primary: '#ef4444',
          secondary: '#dc2626',
          background: 'rgba(239, 68, 68, 0.05)',
          icon: DeleteIcon,
        };
      case 'warning':
        return {
          primary: '#f59e0b',
          secondary: '#d97706',
          background: 'rgba(245, 158, 11, 0.05)',
          icon: WarningIcon,
        };
      case 'info':
      default:
        return {
          primary: '#6366f1',
          secondary: '#4f46e5',
          background: 'rgba(99, 102, 241, 0.05)',
          icon: InfoIcon,
        };
    }
  };

  const getItemIcon = () => {
    switch (itemType) {
      case 'channel':
        return TvIcon;
      case 'stream':
        return StreamIcon;
      default:
        return InfoIcon;
    }
  };

  const colors = getThemeColors();
  const IconComponent = colors.icon;
  const ItemIconComponent = getItemIcon();

  return (
    <Dialog
      open={open}
      onClose={!loading ? onClose : undefined}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: `linear-gradient(135deg, ${colors.background} 0%, rgba(255, 255, 255, 0.95) 100%)`,
          border: `1px solid ${colors.primary}20`,
        },
      }}
    >
      <DialogTitle sx={{ pb: 2 }}>
        <Box display="flex" alignItems="center" gap={2}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
          >
            <IconComponent sx={{ fontSize: 24 }} />
          </Box>
          <Box flex={1}>
            <Typography
              variant="h5"
              component="div"
              sx={{
                fontWeight: 700,
                color: 'text.primary',
                mb: 0.5,
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontWeight: 500,
              }}
            >
              This action requires confirmation
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pb: 1 }}>
        {/* Item Information */}
        {itemName && (
          <Box mb={3}>
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.02) 0%, rgba(0, 0, 0, 0.01) 100%)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
              }}
            >
              <Box display="flex" alignItems="center" gap={2} mb={1}>
                <ItemIconComponent
                  sx={{
                    fontSize: 20,
                    color: colors.primary,
                  }}
                />
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    color: 'text.primary',
                  }}
                >
                  {itemName}
                </Typography>
                <Chip
                  label={itemType.charAt(0).toUpperCase() + itemType.slice(1)}
                  size="small"
                  sx={{
                    background: `linear-gradient(135deg, ${colors.primary}20 0%, ${colors.secondary}20 100%)`,
                    color: colors.primary,
                    fontWeight: 600,
                  }}
                />
              </Box>
            </Box>
          </Box>
        )}

        {/* Related Items */}
        {relatedItems.length > 0 && (
          <Box mb={3}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                color: 'text.primary',
                mb: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <WarningIcon sx={{ fontSize: 18, color: '#f59e0b' }} />
              {relatedItemsLabel} ({relatedItems.length})
            </Typography>
            <Box
              sx={{
                maxHeight: 200,
                overflow: 'auto',
                border: '1px solid rgba(0, 0, 0, 0.12)',
                borderRadius: 2,
                backgroundColor: 'background.paper',
              }}
            >
              <List dense sx={{ py: 0 }}>
                {relatedItems.map((item, index) => (
                  <React.Fragment key={index}>
                    <ListItem sx={{ py: 1 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {item.type === 'channel' ? (
                          <TvIcon sx={{ fontSize: 18, color: '#6366f1' }} />
                        ) : (
                          <StreamIcon sx={{ fontSize: 18, color: '#8b5cf6' }} />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              color: 'text.primary',
                            }}
                          >
                            {item.name}
                          </Typography>
                        }
                        secondary={
                          item.details && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                              }}
                            >
                              {item.details}
                            </Typography>
                          )
                        }
                      />
                    </ListItem>
                    {index < relatedItems.length - 1 && (
                      <Divider sx={{ mx: 2 }} />
                    )}
                  </React.Fragment>
                ))}
              </List>
            </Box>
          </Box>
        )}

        {/* Options */}
        {options.length > 0 && (
          <Box mb={3}>
            <FormControl component="fieldset" fullWidth>
              <FormLabel
                component="legend"
                sx={{
                  fontWeight: 600,
                  color: 'text.primary',
                  mb: 1,
                }}
              >
                Choose an action:
              </FormLabel>
              <RadioGroup
                value={selectedOption}
                onChange={(e) => onOptionChange && onOptionChange(e.target.value)}
              >
                {options.map((option) => (
                  <Box
                    key={option.value}
                    sx={{
                      border: '1px solid',
                      borderColor: selectedOption === option.value ? colors.primary : 'rgba(0, 0, 0, 0.12)',
                      borderRadius: 2,
                      p: 1,
                      mb: 1,
                      background: selectedOption === option.value 
                        ? `${colors.primary}08` 
                        : 'transparent',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <FormControlLabel
                      value={option.value}
                      control={
                        <Radio
                          sx={{
                            color: colors.primary,
                            '&.Mui-checked': {
                              color: colors.primary,
                            },
                          }}
                        />
                      }
                      label={
                        <Box>
                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: 600,
                              color: 'text.primary',
                              mb: 0.5,
                            }}
                          >
                            {option.label}
                          </Typography>
                          {option.description && (
                            <Typography
                              variant="body2"
                              sx={{
                                color: 'text.secondary',
                                lineHeight: 1.4,
                              }}
                            >
                              {option.description}
                            </Typography>
                          )}
                        </Box>
                      }
                      sx={{ alignItems: 'flex-start', m: 0, p: 1 }}
                    />
                  </Box>
                ))}
              </RadioGroup>
            </FormControl>
          </Box>
        )}

        {/* Warning Alert */}
        {showWarning && type === 'delete' && (
          <Alert
            severity="error"
            icon={<ErrorIcon />}
            sx={{
              mb: 2,
              borderRadius: 2,
              '& .MuiAlert-icon': {
                fontSize: 20,
              },
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              <strong>Warning:</strong> This action cannot be undone. Please review your selection carefully.
            </Typography>
          </Alert>
        )}

        {/* Custom Content */}
        {children}
      </DialogContent>

      <DialogActions sx={{ p: 3, gap: 2 }}>
        <Button
          onClick={onClose}
          disabled={loading}
          variant="outlined"
          size="large"
          startIcon={<CancelIcon />}
          sx={{
            minWidth: 120,
            borderColor: 'rgba(0, 0, 0, 0.23)',
            color: 'text.secondary',
            '&:hover': {
              borderColor: 'rgba(0, 0, 0, 0.4)',
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
            },
          }}
        >
          {cancelButtonText}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading || (options.length > 0 && !selectedOption)}
          variant="contained"
          size="large"
          startIcon={
            loading ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              <IconComponent />
            )
          }
          sx={{
            minWidth: 140,
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
            boxShadow: `0 4px 12px ${colors.primary}40`,
            '&:hover': {
              background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
              boxShadow: `0 6px 16px ${colors.primary}60`,
              transform: 'translateY(-1px)',
            },
            '&:disabled': {
              background: 'rgba(0, 0, 0, 0.12)',
              color: 'rgba(0, 0, 0, 0.26)',
              boxShadow: 'none',
            },
            transition: 'all 0.2s ease',
          }}
        >
          {loading ? 'Processing...' : confirmButtonText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmationDialog;