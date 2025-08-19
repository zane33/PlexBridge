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
  Skeleton,
  LinearProgress,
  Fade,
  Slide,
  Zoom,
  Backdrop,
  Snackbar,
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
  const [loadingStage, setLoadingStage] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState(null);
  const [playerInstance, setPlayerInstance] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState(useProxy);
  const [streamInfo, setStreamInfo] = useState(null);
  const [useVideoJS, setUseVideoJS] = useState(false);
  // Transcoding is now always enabled for browser compatibility
  const [showControls, setShowControls] = useState(true);
  const [lastUserActivity, setLastUserActivity] = useState(Date.now());
  const [retryCount, setRetryCount] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState('unknown');
  
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
      let proxyUrl = `${window.location.origin}/streams/preview/${streamId}`;
      
      // Always enable transcoding for browser video previews to ensure MP4 compatibility
      // This fixes the audio-only issue by providing transcoded MP4 instead of HLS
      proxyUrl += '?transcode=true';
      console.log(`Using transcoded proxy URL for stream ${streamId}: ${proxyUrl}`);
      
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

  // Detect stream format and capabilities with enhanced proxy URL detection
  const detectStreamCapabilities = useCallback(async (url) => {
    const urlLower = url.toLowerCase();
    
    // Check for direct stream format indicators
    if (urlLower.includes('.m3u8') || urlLower.includes('/playlist.m3u8') || urlLower.includes('type=hls')) {
      return {
        type: 'hls',
        useVideoJS: true,
        needsSpecialHandling: true,
        supportedByBrowser: videoRef.current?.canPlayType('application/vnd.apple.mpegurl') || false,
        description: 'HLS Live Stream'
      };
    }
    
    if (urlLower.includes('.mpd') || urlLower.includes('type=dash')) {
      return {
        type: 'dash',
        useVideoJS: true,
        needsSpecialHandling: true,
        supportedByBrowser: false,
        description: 'DASH Stream'
      };
    }
    
    if (urlLower.includes('.mp4') || urlLower.includes('type=mp4')) {
      return {
        type: 'mp4',
        useVideoJS: false,
        needsSpecialHandling: false,
        supportedByBrowser: true,
        description: 'MP4 Video'
      };
    }
    
    if (urlLower.includes('.webm') || urlLower.includes('type=webm')) {
      return {
        type: 'webm',
        useVideoJS: false,
        needsSpecialHandling: false,
        supportedByBrowser: videoRef.current?.canPlayType('video/webm') || false,
        description: 'WebM Video'
      };
    }
    
    // CRITICAL FIX: Handle .ts (MPEG Transport Stream) files
    if (urlLower.includes('.ts') || urlLower.includes('.mpegts') || urlLower.includes('.mts') || urlLower.includes('type=ts')) {
      return {
        type: 'ts',
        useVideoJS: false, // Use native player for converted MP4 output
        needsSpecialHandling: true,
        supportedByBrowser: false, // TS files need transcoding for browsers
        requiresTranscoding: true, // Flag to indicate transcoding is required
        description: 'MPEG Transport Stream (Converting to MP4)'
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
    
    // For proxy URLs, try to detect the actual content type
    if (urlLower.includes('/streams/preview/') || urlLower.includes('/stream/')) {
      try {
        // Make a HEAD request to get content-type
        const response = await fetch(url, { 
          method: 'HEAD',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        const contentType = response.headers.get('content-type') || '';
        console.log(`Proxy stream content-type: ${contentType}`);
        
        if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL')) {
          return {
            type: 'hls',
            useVideoJS: true,
            needsSpecialHandling: true,
            supportedByBrowser: videoRef.current?.canPlayType('application/vnd.apple.mpegurl') || false,
            description: 'HLS Live Stream (Proxied)'
          };
        }
        
        if (contentType.includes('application/dash+xml')) {
          return {
            type: 'dash',
            useVideoJS: true,
            needsSpecialHandling: true,
            supportedByBrowser: false,
            description: 'DASH Stream (Proxied)'
          };
        }
        
        if (contentType.includes('video/mp4')) {
          return {
            type: 'mp4',
            useVideoJS: false,
            needsSpecialHandling: false,
            supportedByBrowser: true,
            description: 'MP4 Video (Proxied)'
          };
        }
        
        if (contentType.includes('video/webm')) {
          return {
            type: 'webm',
            useVideoJS: false,
            needsSpecialHandling: false,
            supportedByBrowser: videoRef.current?.canPlayType('video/webm') || false,
            description: 'WebM Video (Proxied)'
          };
        }
        
        // CRITICAL FIX: Handle MPEG Transport Stream content type
        // When proxied through our backend, .ts files are transcoded to MP4
        if (contentType.includes('video/mp2t') || contentType.includes('video/MP2T')) {
          return {
            type: 'ts',
            useVideoJS: false, // Use native player for converted MP4 output
            needsSpecialHandling: true,
            supportedByBrowser: true, // After transcoding to MP4, it's browser-compatible
            requiresTranscoding: true,
            description: 'MPEG Transport Stream (Converted to MP4)'
          };
        }
        
        // If content-type suggests a video stream, assume HLS as most common for IPTV
        if (contentType.includes('video/') || contentType.includes('application/octet-stream')) {
          return {
            type: 'hls',
            useVideoJS: true,
            needsSpecialHandling: true,
            supportedByBrowser: false,
            description: 'Live Stream (Proxied, detected as HLS)'
          };
        }
        
      } catch (error) {
        console.warn('Failed to detect proxy stream type:', error);
        // Fall back to assuming HLS for proxy URLs
        return {
          type: 'hls',
          useVideoJS: true,
          needsSpecialHandling: true,
          supportedByBrowser: false,
          description: 'Live Stream (Proxied, assumed HLS)'
        };
      }
    }
    
    // Default to HLS for unknown formats (most common for IPTV)
    return {
      type: 'hls',
      useVideoJS: true,
      needsSpecialHandling: true,
      supportedByBrowser: false,
      description: 'Live Stream (Format auto-detected as HLS)'
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

  // Enhanced user activity tracking for auto-hiding controls
  const trackUserActivity = useCallback(() => {
    setLastUserActivity(Date.now());
    setShowControls(true);
  }, []);

  // Auto-hide controls after inactivity
  useEffect(() => {
    if (!videoReady) return;
    
    const hideTimer = setInterval(() => {
      if (Date.now() - lastUserActivity > 3000 && isPlaying) {
        setShowControls(false);
      }
    }, 1000);
    
    return () => clearInterval(hideTimer);
  }, [lastUserActivity, isPlaying, videoReady]);

  // Initialize video player with enhanced progress tracking
  const initializePlayer = useCallback(async () => {
    console.log('EnhancedVideoPlayer initializePlayer called with:', { 
      open, 
      streamUrl, 
      isCleaningUp: isCleaningUp.current,
      hasVideoRef: !!videoRef.current 
    });
    
    if (!open || !streamUrl || isCleaningUp.current) {
      console.log('EnhancedVideoPlayer early return - missing requirements');
      return;
    }
    
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
    setLoadingStage('Initializing player...');
    setLoadingProgress(10);
    setError(null);
    setRetryCount(prev => prev + 1);
    
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
      setLoadingStage('Analyzing stream format...');
      setLoadingProgress(25);
      
      const currentUrl = getStreamUrl();
      if (!currentUrl) {
        throw new Error('Invalid stream URL');
      }
      
      const capabilities = await detectStreamCapabilities(currentUrl);
      setStreamInfo(capabilities);
      
      // For .ts streams, automatically enable transcoding if proxy is enabled
      if (capabilities.requiresTranscoding && proxyEnabled) {
        setUseTranscoding(true);
        capabilities.description = 'MPEG Transport Stream (Auto-transcoding enabled)';
      }
      
      setUseVideoJS(capabilities.useVideoJS);

      setLoadingStage(capabilities.useVideoJS ? 'Loading Video.js player...' : 
                      capabilities.requiresTranscoding ? 'Transcoding .ts stream to MP4...' : 
                      'Loading native player...');
      setLoadingProgress(50);

      // Use Video.js for complex streams (HLS, DASH, RTSP, etc.)
      if (capabilities.useVideoJS || useVideoJS) {
        await initializeVideoJSPlayer(currentUrl, capabilities);
      } else {
        // Use native HTML5 video for simple formats or transcoded streams
        initializeNativePlayer(currentUrl, capabilities);
      }

      setLoadingProgress(100);
      setLoadingStage('Stream ready!');

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
      
      // Comprehensive Video.js cleanup
      if (videoElement.player) {
        console.warn('Video.js player already exists on element, disposing first');
        try {
          videoElement.player.dispose();
        } catch (disposeError) {
          console.warn('Error disposing existing player:', disposeError);
        }
      }
      
      // Remove all Video.js related attributes and classes
      videoElement.removeAttribute('data-vjs-player');
      videoElement.removeAttribute('data-setup');
      videoElement.className = 'video-js vjs-default-skin';
      
      // Clear any existing source to prevent conflicts
      videoElement.src = '';
      videoElement.load();
      
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
      
      // Wait a bit more after cleanup
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Create Video.js player with enhanced configuration for better compatibility
      const player = videojs(videoElement, {
        controls: true,
        fluid: true,
        responsive: true,
        playbackRates: [0.5, 1, 1.25, 1.5, 2],
        html5: {
          vhs: {
            enableLowInitialPlaylist: true,
            smoothQualityChange: true,
            overrideNative: true,
            limitRenditionByPlayerDimensions: false,
            useDevicePixelRatio: false,
            allowSeeksWithinUnsafeLiveWindow: true
          },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false
        },
        liveui: capabilities.type === 'hls' || capabilities.type === 'dash',
        sources: [{
          src: url,
          type: getVideoJSMimeType(capabilities.type, url)
        }],
        // Improve error recovery
        liveTracker: {
          trackingThreshold: 30,
          liveTolerance: 15
        },
        // Add tech options for better stream handling
        techOrder: ['html5'],
        // Preload metadata to help with stream initialization
        preload: 'metadata'
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

  // Get appropriate MIME type for Video.js with improved codec support
  const getVideoJSMimeType = (streamType, url) => {
    switch (streamType) {
      case 'hls':
        // Use multiple compatible MIME types for HLS
        return 'application/x-mpegURL';
      case 'dash':
        return 'application/dash+xml';
      case 'mp4':
        return 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'; // H.264 Baseline + AAC
      case 'webm':
        return 'video/webm; codecs="vp8, vorbis"'; // VP8 + Vorbis
      case 'ts':
      case 'mpegts':
      case 'mts':
        // CRITICAL FIX: Handle MPEG Transport Stream with proper MIME type
        // For TS files going through proxy/transcoding, they're converted to MP4
        if (url.includes('/streams/preview/') || url.includes('/stream/') || url.includes('/streams/convert/hls/')) {
          return 'video/mp4'; // Backend converts TS to MP4 for browser compatibility
        } else {
          return 'video/mp2t'; // Direct TS file (won't work in browsers without conversion)
        }
      case 'streaming':
      case 'rtsp':
      case 'rtmp':
        // For streams transcoded by backend - use HLS as most compatible
        return 'application/x-mpegURL';
      case 'http':
        // For direct HTTP streams, try to detect format from URL or assume HLS for IPTV
        if (url.includes('.m3u8')) return 'application/x-mpegURL';
        if (url.includes('.mpd')) return 'application/dash+xml';
        if (url.includes('.webm')) return 'video/webm; codecs="vp8, vorbis"';
        if (url.includes('.mp4')) return 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
        if (url.includes('.ts') || url.includes('.mpegts')) return 'video/mp2t';
        // For IPTV streams, default to HLS
        return 'application/x-mpegURL';
      default:
        // Auto-detect based on URL with codec information
        if (url.includes('.m3u8')) return 'application/x-mpegURL';
        if (url.includes('.mpd')) return 'application/dash+xml';
        if (url.includes('.webm')) return 'video/webm; codecs="vp8, vorbis"';
        if (url.includes('.mp4')) return 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
        if (url.includes('.ts') || url.includes('.mpegts')) return 'video/mp2t';
        // For proxy URLs and unknown formats, assume HLS (most common for IPTV)
        return 'application/x-mpegURL';
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

  const retryConnection = useCallback(() => {
    // Clear any existing error
    setError(null);
    // Ensure cleanup before retry
    cleanupPlayer();
    // Delay slightly to ensure cleanup completes
    setTimeout(() => {
      initializePlayer();
    }, 200);
  }, [cleanupPlayer, initializePlayer]);

  // Keyboard navigation support
  const handleKeyDown = useCallback((event) => {
    if (!videoReady) return;
    
    // Don't interfere with text input
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    
    switch (event.key) {
      case ' ':
      case 'k':
      case 'K':
        event.preventDefault();
        togglePlayPause();
        trackUserActivity();
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        toggleMute();
        trackUserActivity();
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        toggleFullscreen();
        trackUserActivity();
        break;
      case 'r':
      case 'R':
        event.preventDefault();
        retryConnection();
        trackUserActivity();
        break;
      case 'Escape':
        if (isFullscreen) {
          event.preventDefault();
          toggleFullscreen();
        }
        break;
      default:
        break;
    }
  }, [videoReady, togglePlayPause, toggleMute, toggleFullscreen, retryConnection, trackUserActivity, isFullscreen]);

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
    console.log('EnhancedVideoPlayer useEffect triggered:', { open, streamUrl, hasStreamUrl: !!streamUrl });
    
    if (open && streamUrl) {
      console.log('Calling initializePlayer from useEffect');
      initializePlayer();
    } else {
      console.log('Not calling initializePlayer:', { open, streamUrl });
    }
    
    return () => {
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = null;
      }
      cleanupPlayer();
    };
  }, [open, streamUrl]); // Remove the dependency on initializePlayer to prevent loops

  // Keyboard event listener
  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

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
      TransitionComponent={Slide}
      TransitionProps={{ direction: 'up' }}
      sx={{
        '& .MuiDialog-paper': {
          bgcolor: 'black',
          minHeight: isMobile ? '100vh' : '600px',
        }
      }}
      aria-labelledby="video-player-title"
      aria-describedby="video-player-description"
      data-testid="video-player-dialog"
    >
      <DialogTitle sx={{ color: 'white', borderBottom: '1px solid #333', p: 2 }} id="video-player-title">
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
            <Tooltip title="Close Player (Esc)" arrow>
              <IconButton 
                onClick={handleClose} 
                sx={{ color: 'white' }}
                aria-label="Close video player"
                data-testid="close-video-player"
              >
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent 
        sx={{ p: 0, bgcolor: 'black', position: 'relative' }} 
        ref={playerContainerRef}
        id="video-player-description"
        onMouseMove={trackUserActivity}
        tabIndex={-1}
        role="application"
        aria-label="Video player content area"
      >
        {/* Enhanced Loading Indicator with Progress */}
        {loading && (
          <Fade in={loading} timeout={300}>
            <Box 
              display="flex" 
              flexDirection="column" 
              alignItems="center" 
              justifyContent="center" 
              height="400px"
              color="white"
              sx={{ p: 4 }}
            >
              <Box position="relative" display="inline-flex" mb={3}>
                <CircularProgress 
                  variant="determinate" 
                  value={loadingProgress} 
                  size={80} 
                  thickness={4}
                  sx={{ color: 'primary.main' }}
                />
                <Box
                  position="absolute"
                  top={0}
                  left={0}
                  bottom={0}
                  right={0}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Typography variant="h6" component="div" color="white">
                    {`${Math.round(loadingProgress)}%`}
                  </Typography>
                </Box>
              </Box>
              
              <Typography variant="h6" gutterBottom>
                {loadingStage || 'Loading stream...'}
              </Typography>
              
              <Typography variant="body2" color="text.secondary" textAlign="center">
                {proxyEnabled ? 'Using PlexBridge proxy for optimal compatibility' : 'Connecting directly to stream source'}
              </Typography>
              
              {retryCount > 1 && (
                <Typography variant="caption" color="warning.main" sx={{ mt: 1 }}>
                  Retry attempt {retryCount - 1}
                </Typography>
              )}
              
              <LinearProgress 
                variant="determinate" 
                value={loadingProgress} 
                sx={{ 
                  width: '100%', 
                  mt: 2, 
                  height: 6, 
                  borderRadius: 3,
                  bgcolor: 'rgba(255,255,255,0.1)'
                }} 
              />
            </Box>
          </Fade>
        )}

        {/* Enhanced Error Display with Recovery Suggestions */}
        {error && (
          <Fade in={!!error} timeout={300}>
            <Box p={3}>
              <Alert 
                severity="error" 
                sx={{ 
                  mb: 2, 
                  bgcolor: 'rgba(244, 67, 54, 0.1)', 
                  color: 'white',
                  '& .MuiAlert-icon': { color: 'error.main' }
                }}
                icon={<ErrorIcon />}
                action={
                  error.canRecover && (
                    <Box display="flex" gap={1}>
                      <Button 
                        color="inherit" 
                        size="small" 
                        onClick={retryConnection}
                        startIcon={<RefreshIcon />}
                      >
                        Retry
                      </Button>
                      {!proxyEnabled && (
                        <Button 
                          color="inherit" 
                          size="small" 
                          onClick={() => setProxyEnabled(true)}
                          variant="outlined"
                        >
                          Try Proxy
                        </Button>
                      )}
                    </Box>
                  )
                }
              >
                <Typography variant="subtitle1" fontWeight="bold">
                  {retryCount > 3 ? 'Persistent Connection Issue' : 'Stream Playback Error'}
                </Typography>
                <Typography variant="body2">
                  {error.message}
                </Typography>
                
                {error.suggestedAction && (
                  <Typography variant="body2" sx={{ mt: 1, fontWeight: 'medium' }}>
                    💡 Suggestion: {error.suggestedAction}
                  </Typography>
                )}
                
                {error.technicalDetails && (
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', opacity: 0.8 }}>
                    Technical details: {error.technicalDetails}
                  </Typography>
                )}
                
                {retryCount > 3 && (
                  <Typography variant="body2" sx={{ mt: 1, color: 'warning.main' }}>
                    ⚠️ Multiple retry attempts failed. Consider using an external player or checking the stream source.
                  </Typography>
                )}
              </Alert>
            </Box>
          </Fade>
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
            crossOrigin="anonymous"
            playsInline
            webkit-playsinline="true"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: loading ? 'none' : 'block'
            }}
            aria-label={`Video player for ${streamName}`}
            role="application"
            onError={(e) => {
              console.error('Video element error:', e);
              const target = e.target;
              let errorMessage = 'Video playback error';
              let canRecover = true;
              
              if (target && target.error) {
                switch (target.error.code) {
                  case target.error.MEDIA_ERR_ABORTED:
                    errorMessage = 'Video loading was aborted';
                    break;
                  case target.error.MEDIA_ERR_NETWORK:
                    errorMessage = proxyEnabled ? 
                      'Network error with PlexBridge proxy. Check if streaming service is running.' :
                      'Network error accessing stream. Try enabling proxy mode to avoid CORS issues.';
                    break;
                  case target.error.MEDIA_ERR_DECODE:
                    errorMessage = 'Video decode error - the stream format may be unsupported or corrupted. Audio may work but video cannot be decoded.';
                    canRecover = false;
                    break;
                  case target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage = proxyEnabled ?
                      'Stream format not supported by PlexBridge proxy or browser. The audio codec may be supported but video codec is not.' :
                      'Stream format not supported by browser directly. Try enabling proxy mode or use an external player.';
                    break;
                  default:
                    errorMessage = target.error.message || `Unknown video error (code: ${target.error.code})`;
                }
              }
              
              setError({ 
                message: errorMessage, 
                canRecover,
                suggestedAction: canRecover ? 
                  (proxyEnabled ? 'Try disabling proxy mode or use external player' : 'Try enabling proxy mode or use external player') :
                  'Use an external player like VLC or MPC-HC for better codec support',
                technicalDetails: `Video Error ${target?.error?.code}: ${target?.error?.message || 'Unknown'}`
              });
            }}
            onLoadStart={() => console.log('Video load started')}
            onCanPlay={() => {
              console.log('Video can play');
              setVideoReady(true);
            }}
            onLoadedMetadata={() => {
              console.log('Video metadata loaded');
              const video = videoRef.current;
              if (video) {
                console.log('Video details:', {
                  duration: video.duration,
                  videoWidth: video.videoWidth,
                  videoHeight: video.videoHeight,
                  readyState: video.readyState
                });
              }
            }}
          />

          {/* Enhanced Video Controls Overlay with Auto-hide */}
          {videoReady && !loading && (
            <Fade in={showControls} timeout={300}>
              <Box
                onMouseMove={trackUserActivity}
                onMouseEnter={trackUserActivity}
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                  p: 2,
                  pt: 4
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    bgcolor: 'rgba(0,0,0,0.6)',
                    borderRadius: 2,
                    p: 1,
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  <Box display="flex" alignItems="center" gap={1}>
                    <Tooltip title={`${isPlaying ? 'Pause' : 'Play'} (Space/K)`} arrow>
                      <IconButton 
                        onClick={togglePlayPause} 
                        sx={{ 
                          color: 'white', 
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                        }}
                        size="large"
                        aria-label={`${isPlaying ? 'Pause' : 'Play'} video`}
                        data-testid="play-pause-button"
                      >
                        {isPlaying ? <PauseIcon /> : <PlayIcon />}
                      </IconButton>
                    </Tooltip>
                    
                    <Tooltip title={`${isMuted ? 'Unmute' : 'Mute'} (M)`} arrow>
                      <IconButton 
                        onClick={toggleMute} 
                        sx={{ 
                          color: 'white', 
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                        }}
                        aria-label={`${isMuted ? 'Unmute' : 'Mute'} audio`}
                        data-testid="mute-toggle-button"
                      >
                        {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
                      </IconButton>
                    </Tooltip>
                    
                    {connectionQuality !== 'unknown' && (
                      <Chip 
                        label={`Quality: ${connectionQuality}`} 
                        size="small" 
                        color={connectionQuality === 'good' ? 'success' : connectionQuality === 'poor' ? 'error' : 'warning'}
                        variant="outlined"
                        sx={{ color: 'white' }}
                      />
                    )}
                  </Box>

                  <Box display="flex" alignItems="center" gap={1}>
                    <Tooltip title="Refresh Stream (R)" arrow>
                      <IconButton 
                        onClick={retryConnection} 
                        sx={{ 
                          color: 'white', 
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                        }}
                        aria-label="Refresh stream"
                        data-testid="refresh-stream-button"
                      >
                        <RefreshIcon />
                      </IconButton>
                    </Tooltip>
                    
                    <Tooltip title={`${isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'} (F)`} arrow>
                      <IconButton 
                        onClick={toggleFullscreen} 
                        sx={{ 
                          color: 'white', 
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                        }}
                        aria-label={`${isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} mode`}
                      >
                        {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>
            </Fade>
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
        p: { xs: 2, sm: 3 },
        maxHeight: isMobile ? '40vh' : 'auto',
        overflowY: 'auto'
      }}>
        {/* Player Options - Enhanced for Mobile */}
        <Box 
          display="flex" 
          flexDirection={isMobile ? 'column' : 'row'} 
          justifyContent="center" 
          gap={isMobile ? 2 : 4} 
          flexWrap="wrap"
        >
          <FormControlLabel
            control={
              <Switch
                checked={proxyEnabled}
                onChange={(e) => setProxyEnabled(e.target.checked)}
                color="primary"
                inputProps={{ 'aria-describedby': 'proxy-help' }}
              />
            }
            label={
              <Box>
                <Typography color="white" variant={isMobile ? 'body2' : 'body1'}>
                  Use PlexBridge Proxy
                </Typography>
                <Typography color="text.secondary" variant="caption" id="proxy-help">
                  Recommended for CORS issues
                </Typography>
              </Box>
            }
          />
          
          <Fade in={proxyEnabled} timeout={300}>
            <FormControlLabel
              sx={{ ml: isMobile ? 0 : 2 }}
              control={
                <Switch
                  checked={true}
                  disabled={true}
                  color="secondary"
                  inputProps={{ 'aria-describedby': 'transcode-help' }}
                />
              }
              label={
                <Box>
                  <Typography color="white" variant={isMobile ? 'body2' : 'body1'}>
                    Video Transcoding
                  </Typography>
                  <Typography color="text.secondary" variant="caption" id="transcode-help">
                    Always enabled for browser compatibility
                  </Typography>
                </Box>
              }
            />
          </Fade>
          
          <FormControlLabel
            control={
              <Switch
                checked={useVideoJS}
                onChange={(e) => setUseVideoJS(e.target.checked)}
                color="secondary"
                inputProps={{ 'aria-describedby': 'videojs-help' }}
              />
            }
            label={
              <Box>
                <Typography color="white" variant={isMobile ? 'body2' : 'body1'}>
                  Video.js Player
                </Typography>
                <Typography color="text.secondary" variant="caption" id="videojs-help">
                  Better for streaming formats
                </Typography>
              </Box>
            }
          />
        </Box>

        <Divider sx={{ bgcolor: '#333' }} />

        {/* Enhanced Help and Tips */}
        <Alert 
          severity="info" 
          sx={{ 
            bgcolor: 'rgba(33, 150, 243, 0.1)', 
            color: 'white',
            '& .MuiAlert-icon': { color: 'info.main' }
          }}
          icon={<WarningIcon />}
        >
          <Typography variant="body2" gutterBottom>
            <strong>Keyboard Controls:</strong> Space/K (play/pause), M (mute), F (fullscreen), R (refresh), Esc (exit fullscreen)
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Browser Limitations: Some streams may not play due to CORS restrictions. Use proxy mode or external players for best compatibility.
          </Typography>
        </Alert>

        {/* External Player Options - Enhanced for Mobile */}
        <Box 
          display="flex" 
          gap={isMobile ? 1 : 2} 
          justifyContent="center" 
          flexWrap="wrap"
          flexDirection={isMobile ? 'column' : 'row'}
        >
          <Box 
            display="flex" 
            gap={1} 
            justifyContent="center" 
            flexWrap="wrap"
            flex={1}
          >
            <Tooltip title="Open stream in VLC Media Player" arrow>
              <Button
                variant="outlined"
                onClick={() => openInExternalPlayer('vlc')}
                sx={{ 
                  color: 'white', 
                  borderColor: 'white', 
                  minWidth: isMobile ? '100px' : 'auto',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                }}
                startIcon={<OpenInNewIcon />}
                size={isMobile ? 'small' : 'medium'}
              >
                VLC
              </Button>
            </Tooltip>
            
            <Tooltip title="Open stream in MPC-HC Media Player" arrow>
              <Button
                variant="outlined"
                onClick={() => openInExternalPlayer('mpc')}
                sx={{ 
                  color: 'white', 
                  borderColor: 'white', 
                  minWidth: isMobile ? '100px' : 'auto',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                }}
                startIcon={<OpenInNewIcon />}
                size={isMobile ? 'small' : 'medium'}
              >
                MPC-HC
              </Button>
            </Tooltip>
            
            <Tooltip title="Copy stream URL to clipboard for external players" arrow>
              <Button
                variant="outlined"
                onClick={copyStreamUrl}
                sx={{ 
                  color: 'white', 
                  borderColor: 'white', 
                  minWidth: isMobile ? '100px' : 'auto',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                }}
                startIcon={<CopyIcon />}
                size={isMobile ? 'small' : 'medium'}
              >
                Copy URL
              </Button>
            </Tooltip>
          </Box>
          
          <Button 
            onClick={handleClose} 
            variant="contained"
            sx={{ 
              bgcolor: 'rgba(255,255,255,0.1)', 
              color: 'white',
              minWidth: isMobile ? '100px' : 'auto',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
            }}
            size={isMobile ? 'small' : 'medium'}
          >
            Close
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default EnhancedVideoPlayer;