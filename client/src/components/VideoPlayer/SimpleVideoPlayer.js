import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Alert,
  Chip,
  CircularProgress,
  Switch,
  FormControlLabel,
  Divider,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  OpenInNew as OpenInNewIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';

const SimpleVideoPlayer = ({ 
  open, 
  onClose, 
  streamUrl, 
  streamName, 
  streamType,
  channelId,
  streamId,
  useProxy = true,
  onError
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hlsInstance, setHlsInstance] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState(useProxy);
  
  const videoRef = useRef(null);
  
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Get the appropriate stream URL
  const getStreamUrl = useCallback(() => {
    if (!streamUrl) return '';
    
    if (proxyEnabled && (streamId || channelId)) {
      // Use the backend proxy to avoid CORS issues  
      const id = streamId || channelId;
      return `${window.location.origin}/preview/${id}`;
    }
    
    return streamUrl;
  }, [streamUrl, proxyEnabled, channelId, streamId]);

  // Initialize simple HLS player
  const initializePlayer = useCallback(async () => {
    if (!open || !streamUrl || !videoRef.current) return;

    setLoading(true);
    setError(null);
    setVideoReady(false);

    try {
      const currentUrl = getStreamUrl();
      
      // Clean up previous HLS instance
      if (hlsInstance) {
        hlsInstance.destroy();
        setHlsInstance(null);
      }

      // Handle HLS streams
      if (currentUrl.includes('.m3u8')) {
        const Hls = (await import('hls.js')).default;
        
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90
          });
          
          setHlsInstance(hls);
          
          hls.on(Hls.Events.MANIFEST_LOADED, () => {
            setVideoReady(true);
            enqueueSnackbar('HLS stream loaded successfully!', { variant: 'success' });
          });
          
          hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS Error:', data);
            if (data.fatal) {
              setError({ 
                message: `HLS Error: ${data.details || data.type}`, 
                canRecover: true 
              });
            }
          });
          
          hls.loadSource(currentUrl);
          hls.attachMedia(videoRef.current);
          
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS support
          videoRef.current.src = currentUrl;
          videoRef.current.load();
          setVideoReady(true);
          enqueueSnackbar('Using Safari native HLS support', { variant: 'info' });
        } else {
          setError({ 
            message: 'HLS not supported in this browser. Try external players.', 
            canRecover: false 
          });
        }
      } else {
        // Direct video for non-HLS
        videoRef.current.src = currentUrl;
        videoRef.current.load();
        setVideoReady(true);
        enqueueSnackbar('Direct video stream loaded!', { variant: 'success' });
      }

    } catch (error) {
      console.error('Player initialization error:', error);
      setError({ 
        message: error.message || 'Failed to initialize player', 
        canRecover: true 
      });
      if (onError) onError(error);
    } finally {
      setLoading(false);
    }
  }, [open, streamUrl, getStreamUrl, hlsInstance, enqueueSnackbar, onError]);

  const retryConnection = () => {
    initializePlayer();
  };

  const copyStreamUrl = () => {
    navigator.clipboard.writeText(getStreamUrl());
    enqueueSnackbar('Stream URL copied!', { variant: 'success' });
  };

  const openInExternalPlayer = (playerType) => {
    const url = getStreamUrl();
    let playerUrl;
    
    switch (playerType) {
      case 'vlc':
        playerUrl = `vlc://${url}`;
        break;
      case 'mpc':
        playerUrl = `mpc-hc://${url}`;
        break;
      default:
        return;
    }
    
    window.open(playerUrl, '_blank');
    enqueueSnackbar(`Opening in ${playerType.toUpperCase()}...`, { variant: 'info' });
  };

  // Effects
  useEffect(() => {
    if (open) {
      initializePlayer();
    }
    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
        setHlsInstance(null);
      }
    };
  }, [open, initializePlayer]);

  useEffect(() => {
    if (open) {
      initializePlayer();
    }
  }, [proxyEnabled, initializePlayer]);

  const handleClose = () => {
    if (hlsInstance) {
      hlsInstance.destroy();
      setHlsInstance(null);
    }
    setError(null);
    setVideoReady(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      sx={{
        '& .MuiDialog-paper': {
          bgcolor: 'black',
          minHeight: isMobile ? '100vh' : '600px',
        }
      }}
    >
      <DialogTitle sx={{ color: 'white', borderBottom: '1px solid #333', p: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" component="div">
            Simple Stream Player: {streamName}
          </Typography>
          <Box display="flex" alignItems="center" gap={1}>
            <Chip 
              label={streamUrl?.includes('.m3u8') ? 'HLS' : 'Direct'} 
              size="small" 
              color="primary" 
              variant="outlined"
            />
            <IconButton onClick={handleClose} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, bgcolor: 'black', position: 'relative' }}>
        {/* Loading Indicator */}
        {loading && (
          <Box 
            display="flex" 
            flexDirection="column" 
            alignItems="center" 
            justifyContent="center" 
            height="400px"
            color="white"
          >
            <CircularProgress color="primary" size={60} sx={{ mb: 2 }} />
            <Typography variant="h6">Loading stream...</Typography>
            <Typography variant="body2" color="text.secondary">
              {proxyEnabled ? 'Using PlexBridge proxy' : 'Direct connection'}
            </Typography>
          </Box>
        )}

        {/* Error Display */}
        {error && (
          <Box p={3}>
            <Alert 
              severity="error" 
              sx={{ mb: 2, bgcolor: 'rgba(244, 67, 54, 0.1)', color: 'white' }}
              action={
                error.canRecover && (
                  <Button color="inherit" size="small" onClick={retryConnection} startIcon={<RefreshIcon />}>
                    Retry
                  </Button>
                )
              }
            >
              <Typography variant="subtitle1" fontWeight="bold">
                Playback Error
              </Typography>
              <Typography variant="body2">
                {error.message}
              </Typography>
              {!proxyEnabled && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Try enabling proxy mode below to avoid CORS issues.
                </Typography>
              )}
            </Alert>
          </Box>
        )}

        {/* Video Player */}
        <Box sx={{ position: 'relative', width: '100%', height: '500px' }}>
          <video
            ref={videoRef}
            controls
            autoPlay={false}
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: loading ? 'none' : 'block'
            }}
            onError={(e) => {
              console.error('Video error:', e);
              const target = e.target;
              let errorMessage = 'Video playback error';
              
              if (target && target.error) {
                switch (target.error.code) {
                  case target.error.MEDIA_ERR_NETWORK:
                    errorMessage = 'Network error - try proxy mode';
                    break;
                  case target.error.MEDIA_ERR_DECODE:
                    errorMessage = 'Video decode error - unsupported format';
                    break;
                  case target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage = 'Video format not supported';
                    break;
                  default:
                    errorMessage = 'Unknown video error';
                }
              }
              
              setError({ message: errorMessage, canRecover: true });
            }}
            onLoadStart={() => console.log('Video load started')}
            onCanPlay={() => {
              console.log('Video can play');
              setVideoReady(true);
            }}
          />

          {/* Stream Info Overlay */}
          {videoReady && (
            <Box
              sx={{
                position: 'absolute',
                top: 16,
                left: 16,
                right: 16,
                bgcolor: 'rgba(0,0,0,0.7)',
                color: 'white',
                p: 2,
                borderRadius: 1,
                backdropFilter: 'blur(5px)'
              }}
            >
              <Typography variant="body2" sx={{ wordBreak: 'break-all', mb: 1 }}>
                <strong>Stream URL:</strong> {getStreamUrl()}
              </Typography>
              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                <Chip 
                  label={getStreamUrl().includes('.m3u8') ? 'HLS' : 'Direct'}
                  size="small" 
                  color="primary" 
                />
                {proxyEnabled && (
                  <Chip 
                    label="Proxied" 
                    size="small" 
                    color="success" 
                    variant="outlined"
                  />
                )}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={copyStreamUrl}
                  sx={{ color: 'white', borderColor: 'white' }}
                  startIcon={<CopyIcon />}
                >
                  Copy URL
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ 
        bgcolor: 'black', 
        borderTop: '1px solid #333', 
        flexDirection: 'column', 
        alignItems: 'stretch', 
        gap: 2,
        p: 3
      }}>
        {/* Proxy Toggle */}
        <Box display="flex" justifyContent="center">
          <FormControlLabel
            control={
              <Switch
                checked={proxyEnabled}
                onChange={(e) => setProxyEnabled(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography color="white">
                Use PlexBridge Proxy (Recommended for CORS issues)
              </Typography>
            }
          />
        </Box>

        <Divider sx={{ bgcolor: '#333' }} />

        {/* CORS Warning */}
        <Alert 
          severity="warning" 
          sx={{ bgcolor: 'rgba(255,193,7,0.1)', color: 'white' }}
          icon={<WarningIcon />}
        >
          <Typography variant="body2">
            <strong>Browser Limitations:</strong> Some streams may not play due to CORS restrictions. 
            Use proxy mode or external players for best compatibility.
          </Typography>
        </Alert>

        {/* External Player Options */}
        <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
          <Button
            variant="outlined"
            onClick={() => openInExternalPlayer('vlc')}
            sx={{ color: 'white', borderColor: 'white' }}
            startIcon={<OpenInNewIcon />}
          >
            Open in VLC
          </Button>
          
          <Button
            variant="outlined"
            onClick={() => openInExternalPlayer('mpc')}
            sx={{ color: 'white', borderColor: 'white' }}
            startIcon={<OpenInNewIcon />}
          >
            Open in MPC-HC
          </Button>
          
          <Button
            variant="outlined"
            onClick={copyStreamUrl}
            sx={{ color: 'white', borderColor: 'white' }}
            startIcon={<CopyIcon />}
          >
            Copy for External Player
          </Button>
          
          <Button 
            onClick={handleClose} 
            sx={{ color: 'white' }}
          >
            Close
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default SimpleVideoPlayer;