#!/usr/bin/env node

// Wrapper script to ensure proper application startup
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Import the application and its initialization function
const { initializeApp } = require('./index.js');

// Start the application
console.log('PlexBridge startup wrapper - calling initializeApp()...');
initializeApp();