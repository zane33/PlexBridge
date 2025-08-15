import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.connectionStatus = 'disconnected';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    if (this.socket?.connected) {
      return;
    }

    const serverPath = process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : 'http://localhost:8080';

    this.socket = io(serverPath, {
      autoConnect: true,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      forceNew: false,
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket.IO connected:', this.socket.id);
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      this.notifyListeners('connection', { status: 'connected' });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      this.connectionStatus = 'disconnected';
      this.notifyListeners('connection', { status: 'disconnected', reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      this.connectionStatus = 'error';
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error(`Failed to connect after ${this.maxReconnectAttempts} attempts`);
        this.connectionStatus = 'failed';
      }
      
      this.notifyListeners('connection', { 
        status: 'error', 
        error,
        attempts: this.reconnectAttempts 
      });
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Socket.IO reconnected after', attemptNumber, 'attempts');
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      this.notifyListeners('connection', { status: 'reconnected' });
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
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionStatus = 'disconnected';
      this.listeners.clear();
    }
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
}

// Create singleton instance
const socketService = new SocketService();

export default socketService;