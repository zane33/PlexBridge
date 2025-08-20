import React, { useEffect, useState } from 'react';
import { Alert, Snackbar, Chip, Box } from '@mui/material';
import {
  WifiOff as WifiOffIcon,
  Wifi as WifiIcon,
  Sync as SyncIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import socketService from '../../services/socket';

const ConnectionMonitor = () => {
  const [connectionState, setConnectionState] = useState({
    status: 'disconnected',
    message: '',
    attempts: 0
  });
  const [showAlert, setShowAlert] = useState(false);
  const [lastDisconnectTime, setLastDisconnectTime] = useState(null);

  useEffect(() => {
    // Subscribe to connection events
    const unsubscribe = socketService.on('connection', (data) => {
      console.log('Connection event:', data);
      
      switch (data.status) {
        case 'connected':
          setConnectionState({
            status: 'connected',
            message: 'Connected to server',
            attempts: 0
          });
          // Show success alert if we were previously disconnected
          if (lastDisconnectTime) {
            setShowAlert(true);
            setLastDisconnectTime(null);
          }
          break;
          
        case 'reconnected':
          setConnectionState({
            status: 'connected',
            message: `Reconnected after ${data.attempts} attempts`,
            attempts: 0
          });
          setShowAlert(true);
          setLastDisconnectTime(null);
          break;
          
        case 'disconnected':
          setConnectionState({
            status: 'disconnected',
            message: data.reason || 'Disconnected from server',
            attempts: 0
          });
          setLastDisconnectTime(Date.now());
          setShowAlert(true);
          break;
          
        case 'reconnecting':
          setConnectionState({
            status: 'reconnecting',
            message: `Reconnecting... (attempt ${data.attempts})`,
            attempts: data.attempts
          });
          break;
          
        case 'error':
          setConnectionState({
            status: 'error',
            message: data.error || 'Connection error',
            attempts: data.attempts || 0
          });
          if (data.attempts === 1) {
            setShowAlert(true);
          }
          break;
          
        case 'failed':
          setConnectionState({
            status: 'failed',
            message: 'Connection failed permanently',
            attempts: 0
          });
          setShowAlert(true);
          break;
          
        default:
          break;
      }
    });

    // Check initial connection status
    const checkInitialStatus = () => {
      if (socketService.isConnected()) {
        setConnectionState({
          status: 'connected',
          message: 'Connected to server',
          attempts: 0
        });
      } else {
        setConnectionState({
          status: 'disconnected',
          message: 'Not connected',
          attempts: 0
        });
      }
    };

    checkInitialStatus();

    // Periodic connection check
    const intervalId = setInterval(() => {
      const isConnected = socketService.isConnected();
      const currentStatus = socketService.getConnectionStatus();
      
      if (!isConnected && connectionState.status === 'connected') {
        setConnectionState({
          status: 'disconnected',
          message: 'Connection lost',
          attempts: 0
        });
        setLastDisconnectTime(Date.now());
        setShowAlert(true);
      } else if (isConnected && connectionState.status !== 'connected') {
        setConnectionState({
          status: 'connected',
          message: 'Connected to server',
          attempts: 0
        });
        setShowAlert(true);
        setLastDisconnectTime(null);
      }
    }, 5000); // Check every 5 seconds

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [connectionState.status]);

  const getStatusColor = () => {
    switch (connectionState.status) {
      case 'connected':
        return 'success';
      case 'reconnecting':
        return 'warning';
      case 'disconnected':
      case 'error':
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = () => {
    switch (connectionState.status) {
      case 'connected':
        return <WifiIcon />;
      case 'reconnecting':
        return <SyncIcon />;
      case 'disconnected':
      case 'failed':
        return <WifiOffIcon />;
      case 'error':
        return <ErrorIcon />;
      default:
        return null;
    }
  };

  const getSeverity = () => {
    switch (connectionState.status) {
      case 'connected':
      case 'reconnected':
        return 'success';
      case 'reconnecting':
        return 'info';
      case 'disconnected':
      case 'error':
      case 'failed':
        return 'error';
      default:
        return 'info';
    }
  };

  return (
    <>
      {/* Connection Status Chip - Always visible in top-right corner */}
      <Box
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 9999
        }}
      >
        <Chip
          icon={getStatusIcon()}
          label={connectionState.status.charAt(0).toUpperCase() + connectionState.status.slice(1)}
          color={getStatusColor()}
          size="small"
          variant={connectionState.status === 'connected' ? 'filled' : 'outlined'}
        />
      </Box>

      {/* Alert Snackbar for connection changes */}
      <Snackbar
        open={showAlert}
        autoHideDuration={connectionState.status === 'connected' ? 3000 : 6000}
        onClose={() => setShowAlert(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setShowAlert(false)}
          severity={getSeverity()}
          sx={{ width: '100%' }}
        >
          {connectionState.message}
          {connectionState.attempts > 0 && ` (Attempt ${connectionState.attempts})`}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ConnectionMonitor;