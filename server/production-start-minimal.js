#!/usr/bin/env node

// Simplified production startup that works reliably
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

if (!process.env.DB_PATH || !process.env.DB_PATH.startsWith('/')) {
  process.env.DB_PATH = '/data/database/plextv.db';
}

console.log('Starting PlexBridge in minimal mode for deployment stability...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.HTTP_PORT || process.env.PORT || 8080);

// Start the minimal server
require('./minimal-start.js');