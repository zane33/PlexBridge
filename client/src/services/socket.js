import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.connectionStatus = 'disconnected';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Infinity; // Never stop trying in production
    this.reconnectTimer = null;
    this.healthCheckInterval = null;
  }

  connect() {
    // If socket already exists (connected or not), just return the existing one
    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return;
    }

    const serverPath = process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : 'http://localhost:3000';

    this.socket = io(serverPath, {
      // Connection settings
      autoConnect: true,
      timeout: 30000, // Increased timeout for production
      
      // Transport settings - prioritize WebSocket with polling fallback
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      
      // Reconnection settings - more aggressive for production
      forceNew: false,
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying forever
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      
      // Ping settings - detect disconnections faster
      pingInterval: 25000,
      pingTimeout: 20000,
      
      // Production optimizations
      perMessageDeflate: false,
      closeOnBeforeunload: false
    });

    this.setupEventListeners();
    this.startHealthCheck();
  }

  setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket.IO connected:', this.socket.id);
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      
      // Join the metrics room for real-time updates
      this.socket.emit('join-metrics');
      console.log('Joined metrics room for real-time updates');
      
      this.notifyListeners('connection', { status: 'connected' });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      this.connectionStatus = 'disconnected';
      this.notifyListeners('connection', { status: 'disconnected', reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error.message || error);
      this.connectionStatus = 'error';
      this.reconnectAttempts++;
      
      // Log more details about the error
      if (error.type) console.error('Error type:', error.type);
      if (error.code) console.error('Error code:', error.code);
      
      // Don't give up on reconnection in production
      this.notifyListeners('connection', { 
        status: 'error', 
        error: error.message || 'Connection failed',
        attempts: this.reconnectAttempts 
      });
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Socket.IO reconnected after', attemptNumber, 'attempts');
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      this.notifyListeners('connection', { status: 'reconnected', attempts: attemptNumber });
    });

    // Additional reconnection events
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Socket.IO reconnection attempt #', attemptNumber);
      this.notifyListeners('connection', { status: 'reconnecting', attempts: attemptNumber });
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('Socket.IO reconnection error:', error.message || error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Socket.IO reconnection failed');
      this.connectionStatus = 'failed';
      this.notifyListeners('connection', { status: 'failed' });
    });

    // Ping/pong for connection health
    this.socket.on('ping', () => {
      console.debug('Socket.IO ping sent');
    });

    this.socket.on('pong', (latency) => {
      console.debug('Socket.IO pong received, latency:', latency, 'ms');
    });

    // Application-specific events
    this.socket.on('metrics:update', (data) => {
      this.notifyListeners('metrics:update', data);
    });

    this.socket.on('stream:started', (data) => {
      this.notifyListeners('stream:started', data);
    });

    this.socket.on('stream:stopped', (data) => {
      this.notifyListeners('stream:stopped', data);
    });

    this.socket.on('channel:updated', (data) => {
      this.notifyListeners('channel:updated', data);
    });

    this.socket.on('epg:updated', (data) => {
      this.notifyListeners('epg:updated', data);
    });

    this.socket.on('log:new', (data) => {
      this.notifyListeners('log:new', data);
    });

    this.socket.on('settings:updated', (data) => {
      this.notifyListeners('settings:updated', data);
    });

    this.socket.on('streams:bandwidth:update', (data) => {
      this.notifyListeners('streams:bandwidth:update', data);
    });

    // New streaming monitoring events
    this.socket.on('session:started', (data) => {
      this.notifyListeners('session:started', data);
    });

    this.socket.on('session:ended', (data) => {
      this.notifyListeners('session:ended', data);
    });

    this.socket.on('monitoring:update', (data) => {
      this.notifyListeners('monitoring:update', data);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionStatus = 'disconnected';
      this.listeners.clear();
    }
    
    // Clear any timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // Manual reconnect method for fallback
  forceReconnect() {
    console.log('Forcing reconnection...');
    if (this.socket) {
      this.socket.disconnect();
      setTimeout(() => {
        this.socket.connect();
      }, 100);
    }
  }

  // Start health check monitoring
  startHealthCheck() {
    if (this.healthCheckInterval) return;
    
    this.healthCheckInterval = setInterval(() => {
      if (!this.isConnected() && this.connectionStatus !== 'reconnecting') {
        console.warn('Socket disconnected, attempting to reconnect...');
        this.forceReconnect();
      }
    }, 30000); // Check every 30 seconds
  }

  emit(event, data) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit:', event);
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(callback);
        if (eventListeners.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  off(event, callback) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  notifyListeners(event, data) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in socket event listener:', error);
        }
      });
    }
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  isConnected() {
    return this.socket?.connected || false;
  }

  getSocket() {
    return this.socket;
  }
}

// Create singleton instance
const socketService = new SocketService();

// Auto-connect when service is imported
socketService.connect();

export default socketService;