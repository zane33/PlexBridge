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
  Tooltip,
  Switch,
  FormControlLabel,
  Divider,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Close as CloseIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Refresh as RefreshIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  ContentCopy as CopyIcon,
  OpenInNew as OpenInNewIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

const EnhancedVideoPlayer = ({ 
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
  const [playerInstance, setPlayerInstance] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState(useProxy);
  const [streamInfo, setStreamInfo] = useState(null);
  const [useVideoJS, setUseVideoJS] = useState(false);
  
  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const isCleaningUp = useRef(false);
  const initializationTimeoutRef = useRef(null);
  
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Get the appropriate stream URL with validation
  const getStreamUrl = useCallback(() => {
    if (!streamUrl) return '';
    
    // Validate URL format
    try {
      new URL(streamUrl);
    } catch (error) {
      console.warn('Invalid stream URL format:', streamUrl);
      return '';
    }
    
    if (proxyEnabled && streamId) {
      // Use the backend stream preview endpoint to avoid CORS issues  
      const proxyUrl = `${window.location.origin}/streams/preview/${streamId}`;
      console.log(`Using proxy URL for stream ${streamId}: ${proxyUrl}`);
      return proxyUrl;
    } else if (proxyEnabled && channelId) {
      // Use the channel stream endpoint for channel-based playback
      const channelUrl = `${window.location.origin}/stream/${channelId}`;
      console.log(`Using channel URL for channel ${channelId}: ${channelUrl}`);
      return channelUrl;
    }
    
    console.log(`Using direct stream URL: ${streamUrl}`);
    return streamUrl;
  }, [streamUrl, proxyEnabled, channelId, streamId]);

  // Detect stream format and capabilities
  const detectStreamCapabilities = useCallback((url) => {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('.m3u8')) {
      return {
        type: 'hls',
        useVideoJS: true,
        needsSpecialHandling: true,
        supportedByBrowser: videoRef.current?.canPlayType('application/vnd.apple.mpegurl') || false,
        description: 'HLS Live Stream'
      };
    }
    
    if (urlLower.includes('.mpd')) {
      return {
        type: 'dash',
        useVideoJS: true,
        needsSpecialHandling: true,
        supportedByBrowser: false,
        description: 'DASH Stream'
      };
    }
    
    if (urlLower.includes('.mp4')) {
      return {
        type: 'mp4',
        useVideoJS: false,
        needsSpecialHandling: false,
        supportedByBrowser: true,
        description: 'MP4 Video'
      };
    }
    
    if (urlLower.includes('.webm')) {
      return {
        type: 'webm',
        useVideoJS: false,
        needsSpecialHandling: false,
        supportedByBrowser: videoRef.current?.canPlayType('video/webm') || false,
        description: 'WebM Video'
      };
    }
    
    if (urlLower.startsWith('rtsp://') || urlLower.startsWith('rtmp://')) {
      return {
        type: 'streaming',
        useVideoJS: true,
        needsSpecialHandling: true,
        supportedByBrowser: false,
        description: 'Live Stream (Requires proxy)'
      };
    }
    
    // Default to trying Video.js for unknown formats
    return {
      type: 'unknown',
      useVideoJS: true,
      needsSpecialHandling: true,
      supportedByBrowser: false,
      description: 'Unknown format - trying Video.js'
    };
  }, []);

  // Clean up current player
  const cleanupPlayer = useCallback(() => {
    if (isCleaningUp.current) return;
    isCleaningUp.current = true;
    
    // Clear any pending initialization
    if (initializationTimeoutRef.current) {
      clearTimeout(initializationTimeoutRef.current);
      initializationTimeoutRef.current = null;
    }
    
    if (playerInstance) {
      try {
        if (typeof playerInstance.dispose === 'function') {
          playerInstance.dispose();
        }
      } catch (error) {
        console.warn('Error disposing Video.js player:', error);
      }
      setPlayerInstance(null);
    }
    
    // Reset video element
    if (videoRef.current) {
      // Remove any Video.js classes
      videoRef.current.className = 'video-js vjs-default-skin';
      videoRef.current.removeAttribute('data-vjs-player');
      videoRef.current.src = '';
      videoRef.current.load();
    }
    
    setVideoReady(false);
    setIsPlaying(false);
    
    // Reset cleanup flag after a brief delay
    setTimeout(() => {
      isCleaningUp.current = false;
    }, 100);
  }, [playerInstance]);

  // Initialize video player
  const initializePlayer = useCallback(async () => {
    if (!open || !streamUrl || isCleaningUp.current) return;
    
    // Clear any pending initialization
    if (initializationTimeoutRef.current) {
      clearTimeout(initializationTimeoutRef.current);
      initializationTimeoutRef.current = null;
    }
    
    // Wait for DOM element to be available
    if (!videoRef.current) {
      // Only retry if dialog is still open
      if (open) {
        initializationTimeoutRef.current = setTimeout(() => initializePlayer(), 100);
      }
      return;
    }

    setLoading(true);
    setError(null);
    
    // Clean up any existing player first
    cleanupPlayer();
    
    // Wait for cleanup to complete
    await new Promise(resolve => {
      const checkCleanup = () => {
        if (!isCleaningUp.current) {
          resolve();
        } else {
          setTimeout(checkCleanup, 50);
        }
      };
      checkCleanup();
    });
    
    // Check if we should still proceed (dialog might have closed)
    if (!open || !streamUrl) {
      setLoading(false);
      return;
    }

    try {
      const currentUrl = getStreamUrl();
      const capabilities = detectStreamCapabilities(currentUrl);
      setStreamInfo(capabilities);
      setUseVideoJS(capabilities.useVideoJS);

      // Use Video.js for complex streams (HLS, DASH, RTSP, etc.)
      if (capabilities.useVideoJS || useVideoJS) {
        await initializeVideoJSPlayer(currentUrl, capabilities);
      } else {
        // Use native HTML5 video for simple formats
        initializeNativePlayer(currentUrl, capabilities);
      }

    } catch (error) {
      console.error('Player initialization error:', error);
      
      // If proxy failed, suggest trying direct stream
      if (proxyEnabled && error.message && (error.message.includes('Failed') || error.message.includes('proxy'))) {
        setError({ 
          message: `${error.message}. Try disabling proxy mode to stream directly.`, 
          canRecover: true 
        });
        enqueueSnackbar('Proxy initialization failed. Consider disabling proxy mode.', { variant: 'warning' });
      } else {
        setError({ 
          message: error.message || 'Failed to initialize player', 
          canRecover: true 
        });
      }
      
      if (onError) onError(error);
    } finally {
      setLoading(false);
    }
  }, [open, streamUrl, getStreamUrl, detectStreamCapabilities, cleanupPlayer, useVideoJS, onError]);

  // Initialize Video.js player for complex streams
  const initializeVideoJSPlayer = useCallback(async (url, capabilities) => {
    try {
      // Ensure the video element is clean and ready
      const videoElement = videoRef.current;
      if (!videoElement) {
        throw new Error('Video element not available');
      }
      
      // Small delay to ensure React has rendered the element
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if element already has a Video.js player
      if (videoElement.player) {
        console.warn('Video.js player already exists on element, disposing first');
        try {
          videoElement.player.dispose();
        } catch (disposeError) {
          console.warn('Error disposing existing player:', disposeError);
        }
        // Remove Video.js attributes
        videoElement.removeAttribute('data-vjs-player');
        videoElement.className = 'video-js vjs-default-skin';
      }
      
      // Additional cleanup - check for any Video.js instances attached to this element
      if (window.videojs && window.videojs.getPlayer) {
        try {
          const existingPlayer = window.videojs.getPlayer(videoElement);
          if (existingPlayer) {
            existingPlayer.dispose();
          }
        } catch (e) {
          console.warn('Error checking for existing Video.js player:', e);
        }
      }
      
      // Create Video.js player
      const player = videojs(videoElement, {
        controls: true,
        fluid: true,
        responsive: true,
        playbackRates: [0.5, 1, 1.25, 1.5, 2],
        html5: {
          vhs: {
            enableLowInitialPlaylist: true,
            smoothQualityChange: true,
            overrideNative: true
          }
        },
        liveui: capabilities.type === 'hls' || capabilities.type === 'dash',
        sources: [{
          src: url,
          type: getVideoJSMimeType(capabilities.type, url)
        }]
      });

      setPlayerInstance(player);

      // Video.js event handlers
      player.ready(() => {
        console.log('Video.js player ready');
        setVideoReady(true);
        enqueueSnackbar(`${capabilities.description} loaded with Video.js!`, { variant: 'success' });
      });

      player.on('loadstart', () => {
        console.log('Video.js load started');
      });

      player.on('canplay', () => {
        console.log('Video.js can play');
        setVideoReady(true);
      });

      player.on('play', () => {
        setIsPlaying(true);
      });

      player.on('pause', () => {
        setIsPlaying(false);
      });

      player.on('volumechange', () => {
        setIsMuted(player.muted());
      });

      player.on('error', (e) => {
        const error = player.error();
        console.error('Video.js error:', error);
        console.error('Player tech info:', player.tech && player.tech());
        
        let errorMessage = 'Video.js playback error';
        let canRecover = true;
        let suggestedAction = null;
        
        if (error) {
          switch (error.code) {
            case 1: // MEDIA_ERR_ABORTED
              errorMessage = 'Stream loading was aborted by user or browser';
              suggestedAction = 'Try reloading the stream';
              break;
            case 2: // MEDIA_ERR_NETWORK
              if (proxyEnabled) {
                errorMessage = 'Network error with PlexBridge proxy. The backend streaming service may be unavailable.';
                suggestedAction = 'Try disabling proxy mode or check PlexBridge server status';
              } else {
                errorMessage = 'Network error accessing stream directly. This may be due to CORS restrictions.';
                suggestedAction = 'Try enabling proxy mode or use an external player';
              }
              break;
            case 3: // MEDIA_ERR_DECODE
              errorMessage = 'Stream decode error - the video format may be corrupted or unsupported';
              suggestedAction = 'Try a different stream or external player';
              canRecover = false;
              break;
            case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
              if (proxyEnabled) {
                errorMessage = 'Stream format not supported by PlexBridge proxy or browser';
                suggestedAction = 'Try disabling proxy mode or use VLC/MPC-HC external player';
              } else {
                errorMessage = 'Stream format not supported by browser directly';
                suggestedAction = 'Try enabling proxy mode or use an external player';
              }
              break;
            default:
              errorMessage = error.message || `Unknown playback error (code: ${error.code})`;
              suggestedAction = 'Try refreshing or using an external player';
          }
        }
        
        setError({ 
          message: errorMessage, 
          canRecover,
          suggestedAction,
          technicalDetails: `Error ${error?.code}: ${error?.message || 'Unknown'}`
        });
        
        // Auto-suggest proxy toggle for network/format errors
        if (error && (error.code === 2 || error.code === 4)) {
          const suggestion = proxyEnabled ? 
            'Try disabling proxy mode to stream directly from source' :
            'Try enabling proxy mode to stream through PlexBridge';
          
          enqueueSnackbar(suggestion, { 
            variant: 'warning',
            persist: true,
            action: (key) => (
              <Button 
                color="inherit" 
                size="small" 
                onClick={() => {
                  setProxyEnabled(!proxyEnabled);
                  enqueueSnackbar.closeSnackbar(key);
                }}
              >
                {proxyEnabled ? 'Disable Proxy' : 'Enable Proxy'}
              </Button>
            )
          });
        }
      });

    } catch (error) {
      console.error('Video.js initialization error:', error);
      throw new Error(`Video.js setup failed: ${error.message}`);
    }
  }, [enqueueSnackbar]);

  // Initialize native HTML5 player for simple formats  
  const initializeNativePlayer = useCallback((url, capabilities) => {
    try {
      console.log('Using native HTML5 video player');
      videoRef.current.src = url;
      videoRef.current.load();
      setVideoReady(true);
      enqueueSnackbar(`${capabilities.description} loaded with native player!`, { variant: 'success' });
    } catch (error) {
      console.error('Native player initialization error:', error);
      throw new Error(`Native player setup failed: ${error.message}`);
    }
  }, [enqueueSnackbar]);

  // Get appropriate MIME type for Video.js
  const getVideoJSMimeType = (streamType, url) => {
    switch (streamType) {
      case 'hls':
        return 'application/x-mpegURL';
      case 'dash':
        return 'application/dash+xml';
      case 'mp4':
        return 'video/mp4';
      case 'webm':
        return 'video/webm';
      case 'streaming':
        // For RTSP/RTMP streams proxied through backend
        return 'video/mp2t';
      default:
        // Auto-detect based on URL
        if (url.includes('.m3u8')) return 'application/x-mpegURL';
        if (url.includes('.mpd')) return 'application/dash+xml';
        if (url.includes('.mp4')) return 'video/mp4';
        if (url.includes('.webm')) return 'video/webm';
        return 'video/mp4'; // Default fallback
    }
  };

  // Get detailed network error message
  const getNetworkErrorMessage = (data) => {
    if (data.details === 'manifestLoadError') {
      return 'Failed to load stream playlist. Check URL or try proxy mode.';
    }
    if (data.details === 'manifestLoadTimeOut') {
      return 'Stream playlist load timeout. Server may be slow.';
    }
    if (data.response && data.response.code) {
      return `HTTP ${data.response.code}: ${data.response.text || 'Network error'}`;
    }
    return 'Network error loading stream';
  };

  // Video event handlers
  const handleVideoEvents = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadStart = () => console.log('Video load started');
    const onCanPlay = () => {
      console.log('Video can play');
      setVideoReady(true);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onError = (e) => {
      console.error('Video element error:', e);
      const target = e.target;
      let errorMessage = 'Video playback error';
      
      if (target && target.error) {
        switch (target.error.code) {
          case target.error.MEDIA_ERR_ABORTED:
            errorMessage = 'Video loading was aborted';
            break;
          case target.error.MEDIA_ERR_NETWORK:
            errorMessage = 'Network error - try proxy mode';
            break;
          case target.error.MEDIA_ERR_DECODE:
            errorMessage = 'Video decode error - unsupported format';
            break;
          case target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Video format not supported';
            break;
        }
      }
      
      setError({ message: errorMessage, canRecover: true });
    };

    video.addEventListener('loadstart', onLoadStart);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('loadstart', onLoadStart);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
    };
  }, []);

  // Player controls
  const togglePlayPause = () => {
    if (playerInstance) {
      // Video.js player
      if (isPlaying) {
        playerInstance.pause();
      } else {
        playerInstance.play().catch(e => {
          console.error('Video.js play failed:', e);
          enqueueSnackbar('Playback failed. Try unmuting or user interaction.', { variant: 'warning' });
        });
      }
    } else if (videoRef.current) {
      // Native HTML5 player
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(e => {
          console.error('Native play failed:', e);
          enqueueSnackbar('Playback failed. Try unmuting or user interaction.', { variant: 'warning' });
        });
      }
    }
  };

  const toggleMute = () => {
    if (playerInstance) {
      // Video.js player
      playerInstance.muted(!playerInstance.muted());
      setIsMuted(playerInstance.muted());
    } else if (videoRef.current) {
      // Native HTML5 player
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;

    if (!isFullscreen) {
      if (playerContainerRef.current.requestFullscreen) {
        playerContainerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const retryConnection = () => {
    // Clear any existing error
    setError(null);
    // Ensure cleanup before retry
    cleanupPlayer();
    // Delay slightly to ensure cleanup completes
    setTimeout(() => {
      initializePlayer();
    }, 200);
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
    if (open && streamUrl) {
      initializePlayer();
    }
    return () => {
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = null;
      }
      cleanupPlayer();
    };
  }, [open, streamUrl]); // Remove the dependency on initializePlayer to prevent loops

  useEffect(() => {
    return handleVideoEvents();
  }, [handleVideoEvents]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Cleanup and reinitialize on proxy mode or player type change
  useEffect(() => {
    if (open && streamUrl) {
      // Clean up existing player
      cleanupPlayer();
      // Add delay to prevent rapid re-initialization when toggling settings
      const timeoutId = setTimeout(() => {
        if (open && !isCleaningUp.current) {
          initializePlayer();
        }
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [proxyEnabled, useVideoJS]);

  const handleClose = () => {
    cleanupPlayer();
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile || isFullscreen}
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
            Stream Preview: {streamName}
          </Typography>
          <Box display="flex" alignItems="center" gap={1}>
            {streamInfo && (
              <Chip 
                label={streamInfo.description} 
                size="small" 
                color="primary" 
                variant="outlined"
              />
            )}
            <IconButton onClick={handleClose} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, bgcolor: 'black', position: 'relative' }} ref={playerContainerRef}>
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
              icon={<ErrorIcon />}
              action={
                error.canRecover && (
                  <Button color="inherit" size="small" onClick={retryConnection}>
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
            className="video-js vjs-default-skin"
            controls={!useVideoJS}
            autoPlay={false}
            muted={isMuted}
            data-setup="{}"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: loading ? 'none' : 'block'
            }}
          />

          {/* Video Controls Overlay */}
          {videoReady && !loading && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 16,
                left: 16,
                right: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                bgcolor: 'rgba(0,0,0,0.7)',
                borderRadius: 1,
                p: 1,
                backdropFilter: 'blur(5px)'
              }}
            >
              <Box display="flex" alignItems="center" gap={1}>
                <IconButton onClick={togglePlayPause} sx={{ color: 'white' }}>
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </IconButton>
                <IconButton onClick={toggleMute} sx={{ color: 'white' }}>
                  {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
                </IconButton>
              </Box>

              <Box display="flex" alignItems="center" gap={1}>
                <IconButton onClick={retryConnection} sx={{ color: 'white' }}>
                  <RefreshIcon />
                </IconButton>
                <IconButton onClick={toggleFullscreen} sx={{ color: 'white' }}>
                  {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
              </Box>
            </Box>
          )}

          {/* Stream Info Overlay */}
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
              {streamInfo && (
                <Chip 
                  label={`${streamInfo.type.toUpperCase()}`}
                  size="small" 
                  color="primary" 
                />
              )}
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
        {/* Player Options */}
        <Box display="flex" justifyContent="center" gap={4} flexWrap="wrap">
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
          
          <FormControlLabel
            control={
              <Switch
                checked={useVideoJS}
                onChange={(e) => setUseVideoJS(e.target.checked)}
                color="secondary"
              />
            }
            label={
              <Typography color="white">
                Use Video.js Player (Better for streaming formats)
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

export default EnhancedVideoPlayer;