const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST_IP || '0.0.0.0';

console.log('Starting test server...');

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, HOST, () => {
  console.log(`Test server running on ${HOST}:${PORT}`);
});

console.log('Server setup complete');