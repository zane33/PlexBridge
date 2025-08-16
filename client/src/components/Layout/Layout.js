import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import socketService from '../../services/socket';
import {
  AppBar,
  Box,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useTheme,
  useMediaQuery,
  Avatar,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Tv as TvIcon,
  Stream as StreamIcon,
  Schedule as ScheduleIcon,
  Article as ArticleIcon,
  Settings as SettingsIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

const drawerWidth = 240;

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Channels', icon: <TvIcon />, path: '/channels' },
  { text: 'Streams', icon: <StreamIcon />, path: '/streams' },
  { text: 'EPG', icon: <ScheduleIcon />, path: '/epg' },
  { text: 'Logs', icon: <ArticleIcon />, path: '/logs' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    // Auto-close mobile drawer when screen size changes
    if (!isMobile && mobileOpen) {
      setMobileOpen(false);
    }
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    // Initialize Socket.IO connection
    socketService.connect();

    // Monitor connection status via Socket.IO
    const unsubscribeConnection = socketService.on('connection', (data) => {
      setConnectionStatus(data.status);
    });

    // Fallback health check
    const checkConnection = async () => {
      try {
        const response = await fetch('/health');
        if (!socketService.isConnected()) {
          setConnectionStatus(response.ok ? 'connected' : 'error');
        }
      } catch (error) {
        if (!socketService.isConnected()) {
          setConnectionStatus('disconnected');
        }
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000); // Check every 30 seconds

    return () => {
      clearInterval(interval);
      unsubscribeConnection();
    };
  }, []);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleNavigation = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'success';
      case 'error': return 'warning';
      case 'disconnected': return 'error';
      default: return 'default';
    }
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box 
            sx={{ 
              width: 36, 
              height: 36, 
              borderRadius: 2,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'scale(1.05) rotate(5deg)',
                boxShadow: '0 6px 16px rgba(99, 102, 241, 0.6)',
              }
            }}
          >
            <Box 
              component="svg" 
              sx={{ width: 20, height: 20 }}
              viewBox="0 0 24 24" 
              fill="white"
            >
              <path d="M20 6h-2v6h2V6zm0 10h-2v2h2v-2zM4 8v8c0 1.1.9 2 2 2h8v-2H6V8h8V6H6c-1.1 0-2 .9-2 2zm10-2v4h2V8h2V6h-4zm0 6v4h4v-2h-2v-2h-2z"/>
            </Box>
          </Box>
          <Box>
            <Typography 
              variant="h6" 
              noWrap 
              component="div"
              sx={{ 
                fontWeight: 700,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.025em'
              }}
            >
              PlexBridge
            </Typography>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.65rem',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}
            >
              Media Server
            </Typography>
          </Box>
        </Box>
        {isMobile && (
          <IconButton 
            edge="end" 
            onClick={handleDrawerToggle}
            sx={{ color: 'text.secondary' }}
          >
            <CloseIcon />
          </IconButton>
        )}
      </Toolbar>
      
      <Box sx={{ px: 2, pb: 1 }}>
        <Chip
          label={connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
          color={getConnectionStatusColor()}
          size="small"
          sx={{ 
            width: '100%',
            background: connectionStatus === 'connected' 
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : connectionStatus === 'error'
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.7rem',
            animation: connectionStatus !== 'connected' ? 'pulse 2s infinite' : 'none',
            '@keyframes pulse': {
              '0%': { opacity: 1 },
              '50%': { opacity: 0.7 },
              '100%': { opacity: 1 },
            },
            '&::before': {
              content: connectionStatus === 'connected' ? '"●"' : connectionStatus === 'error' ? '"⚠"' : '"●"',
              marginRight: '6px',
              animation: connectionStatus === 'connected' ? 'none' : 'blink 1s infinite',
            },
            '@keyframes blink': {
              '0%': { opacity: 1 },
              '50%': { opacity: 0 },
              '100%': { opacity: 1 },
            }
          }}
        />
      </Box>
      
      <Divider />
      
      <List sx={{ flexGrow: 1, py: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ px: 1 }}>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavigation(item.path)}
              aria-label={`Navigate to ${item.text}`}
              aria-current={location.pathname === item.path ? 'page' : undefined}
              sx={{
                borderRadius: 3,
                mx: 1,
                my: 0.5,
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                  transform: 'translateX(-100%)',
                  transition: 'transform 0.3s ease',
                },
                '&:hover': {
                  backgroundColor: 'rgba(99, 102, 241, 0.08)',
                  transform: 'translateX(4px)',
                  '&::before': {
                    transform: 'translateX(0)',
                  },
                  '& .MuiListItemIcon-root': {
                    transform: 'scale(1.1)',
                  },
                },
                '&:focus-visible': {
                  outline: '2px solid #6366f1',
                  outlineOffset: '2px',
                },
                '&.Mui-selected': {
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  color: '#ffffff',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    boxShadow: '0 6px 16px rgba(99, 102, 241, 0.5)',
                  },
                  '& .MuiListItemIcon-root': {
                    color: '#ffffff',
                  },
                  '& .MuiListItemText-primary': {
                    fontWeight: 600,
                  },
                },
              }}
            >
              <ListItemIcon 
                sx={{ 
                  minWidth: 44,
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={item.text}
                primaryTypographyProps={{ 
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  transition: 'all 0.2s ease'
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      
      <Box sx={{ p: 2, mt: 'auto' }}>
        <Box 
          sx={{ 
            textAlign: 'center',
            p: 1.5,
            borderRadius: 2,
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Typography 
            variant="caption" 
            sx={{ 
              color: 'text.secondary', 
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}
          >
            PlexBridge
          </Typography>
          <Typography 
            variant="caption" 
            sx={{ 
              display: 'block',
              color: 'primary.main', 
              fontSize: '0.65rem',
              fontWeight: 500,
              mt: 0.5
            }}
          >
            v1.0.0
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography 
              variant="h5" 
              noWrap 
              component="div" 
              sx={{ 
                fontWeight: 700,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.025em',
                fontSize: { xs: '1.25rem', sm: '1.5rem' }
              }}
            >
              {menuItems.find(item => item.path === location.pathname)?.text || 'PlexBridge'}
            </Typography>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.75rem',
                fontWeight: 500,
                display: { xs: 'none', sm: 'block' },
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}
            >
              Professional IPTV Management
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="mailbox folders"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          aria-label="Navigation menu"
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              backgroundImage: 'none',
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              backgroundImage: 'none',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          backgroundColor: 'background.default',
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}

export default Layout;
