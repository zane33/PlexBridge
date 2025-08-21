#!/usr/bin/env node

/**
 * Connection stability test script
 * Tests WebSocket reconnection, database resilience, and health endpoints
 */

const axios = require('axios');
const io = require('socket.io-client');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

console.log('🔧 PlexBridge Connection Stability Test');
console.log('========================================');
console.log(`Testing server at: ${BASE_URL}`);
console.log('');

// Test health endpoints
async function testHealthEndpoints() {
  console.log('📍 Testing Health Endpoints...');
  
  try {
    // Test main health endpoint
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Main health endpoint:', healthResponse.data.status);
    console.log('   Services:', Object.keys(healthResponse.data.services).join(', '));
    
    // Test liveness endpoint
    const liveResponse = await axios.get(`${BASE_URL}/health/live`);
    console.log('✅ Liveness endpoint:', liveResponse.data.status);
    
    // Test readiness endpoint
    const readyResponse = await axios.get(`${BASE_URL}/health/ready`);
    console.log('✅ Readiness endpoint:', readyResponse.data.status);
    
  } catch (error) {
    console.error('❌ Health endpoint test failed:', error.message);
  }
  
  console.log('');
}

// Test WebSocket connection and reconnection
async function testWebSocketConnection() {
  console.log('🔌 Testing WebSocket Connection...');
  
  return new Promise((resolve) => {
    const socket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000
    });
    
    let connectionCount = 0;
    let disconnectionCount = 0;
    
    socket.on('connect', () => {
      connectionCount++;
      console.log(`✅ Connected (${connectionCount} time${connectionCount > 1 ? 's' : ''}):`, socket.id);
      
      // Test forced disconnection and reconnection
      if (connectionCount === 1) {
        setTimeout(() => {
          console.log('🔄 Forcing disconnection to test reconnection...');
          socket.disconnect();
          setTimeout(() => {
            socket.connect();
          }, 1000);
        }, 2000);
      }
      
      // Complete test after reconnection
      if (connectionCount === 2) {
        setTimeout(() => {
          console.log('✅ Reconnection test successful');
          socket.disconnect();
          resolve();
        }, 2000);
      }
    });
    
    socket.on('disconnect', (reason) => {
      disconnectionCount++;
      console.log(`⚠️  Disconnected (${disconnectionCount} time${disconnectionCount > 1 ? 's' : ''}):`, reason);
    });
    
    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
    });
    
    socket.on('reconnect', (attemptNumber) => {
      console.log('♻️  Reconnected after', attemptNumber, 'attempts');
    });
    
    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 Reconnection attempt #', attemptNumber);
    });
    
    // Timeout if test takes too long
    setTimeout(() => {
      console.log('⏱️  Test timeout reached');
      socket.disconnect();
      resolve();
    }, 30000);
  });
  
  console.log('');
}

// Test database operations
async function testDatabaseOperations() {
  console.log('💾 Testing Database Operations...');
  
  try {
    // Test channel operations
    const channelsResponse = await axios.get(`${BASE_URL}/api/channels`);
    console.log('✅ Database query successful:', channelsResponse.data.length, 'channels found');
    
    // Test settings
    const settingsResponse = await axios.get(`${BASE_URL}/api/settings`);
    console.log('✅ Settings query successful');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  }
  
  console.log('');
}

// Monitor connection stability over time
async function monitorStability(duration = 30000) {
  console.log(`📊 Monitoring Connection Stability for ${duration/1000} seconds...`);
  
  const socket = io(BASE_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true
  });
  
  let disconnections = 0;
  let reconnections = 0;
  let errors = 0;
  let healthChecks = 0;
  let healthChecksFailed = 0;
  
  socket.on('connect', () => {
    console.log('   Connected at', new Date().toISOString());
  });
  
  socket.on('disconnect', () => {
    disconnections++;
  });
  
  socket.on('reconnect', () => {
    reconnections++;
  });
  
  socket.on('error', () => {
    errors++;
  });
  
  // Periodic health checks
  const healthInterval = setInterval(async () => {
    try {
      healthChecks++;
      const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
      if (response.data.status !== 'healthy') {
        healthChecksFailed++;
      }
    } catch (error) {
      healthChecksFailed++;
    }
  }, 5000);
  
  // Wait for monitoring duration
  await new Promise(resolve => setTimeout(resolve, duration));
  
  clearInterval(healthInterval);
  socket.disconnect();
  
  console.log('📈 Stability Report:');
  console.log(`   Disconnections: ${disconnections}`);
  console.log(`   Reconnections: ${reconnections}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Health Checks: ${healthChecks} (${healthChecksFailed} failed)`);
  console.log(`   Stability Score: ${((healthChecks - healthChecksFailed) / healthChecks * 100).toFixed(1)}%`);
  console.log('');
}

// Run all tests
async function runTests() {
  try {
    await testHealthEndpoints();
    await testWebSocketConnection();
    await testDatabaseOperations();
    await monitorStability(30000);
    
    console.log('✅ All connection stability tests completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Start tests
runTests();