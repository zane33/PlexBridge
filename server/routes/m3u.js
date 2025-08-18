const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const http = require('http');
const urlModule = require('url');
const zlib = require('zlib');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Cache for M3U parsing results
const m3uCache = new Map();
const M3U_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
const M3U_CACHE_MAX_SIZE = 50; // Maximum number of cached playlists

// Helper to get cached data
const getCachedData = (url) => {
  const cached = m3uCache.get(url);
  if (cached && Date.now() - cached.timestamp < M3U_CACHE_TTL) {
    return cached.channels;
  }
  m3uCache.delete(url);
  return null;
};

// Helper to set cache data with size management
const setCachedData = (url, channels) => {
  // Limit cache size
  if (m3uCache.size >= M3U_CACHE_MAX_SIZE) {
    const oldestKey = m3uCache.keys().next().value;
    m3uCache.delete(oldestKey);
  }
  
  m3uCache.set(url, {
    channels,
    timestamp: Date.now()
  });
};

// M3U Parser function
const parseM3UContent = (content) => {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  const channels = [];
  let currentChannel = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('#EXTINF:')) {
      // Parse channel info
      const match = line.match(/#EXTINF:(-?\d+(?:\.\d+)?)\s*(.*?),\s*(.*?)$/);
      if (match) {
        const [, duration, attributesStr, name] = match;
        
        // Parse attributes
        const attributes = {};
        const attrRegex = /(\w+(?:-\w+)?)="([^"]*)"/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
          attributes[attrMatch[1]] = attrMatch[2];
        }
        
        currentChannel = {
          id: uuidv4(),
          name: name || 'Unknown Channel',
          duration: parseFloat(duration),
          attributes,
          url: null
        };
      }
    } else if (!line.startsWith('#') && line.length > 0 && currentChannel) {
      // This is the URL line
      currentChannel.url = line;
      channels.push(currentChannel);
      currentChannel = null;
    }
  }
  
  return channels;
};

// Estimate playlist size endpoint
router.get('/estimate', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  try {
    const parsedUrl = urlModule.parse(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    // Try HEAD request first
    const response = await new Promise((resolve, reject) => {
      const req = client.request({
        ...parsedUrl,
        method: 'HEAD',
        headers: {
          'User-Agent': 'PlexBridge/1.0',
          'Accept': '*/*'
        },
        timeout: 10000
      }, resolve);
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
    
    const contentLength = parseInt(response.headers['content-length'] || '0');
    const contentType = response.headers['content-type'] || '';
    
    // Estimate channel count based on file size (rough estimate)
    const estimatedChannels = contentLength > 0 ? Math.floor(contentLength / 200) : 0;
    const recommendStreaming = contentLength > 1 * 1024 * 1024 || contentLength === 0;
    const memoryImpact = contentLength > 10 * 1024 * 1024 ? 'high' : 
                         contentLength > 1 * 1024 * 1024 ? 'medium' : 
                         contentLength === 0 ? 'unknown' : 'low';
    
    res.json({
      contentLength,
      contentType,
      estimatedChannels,
      recommendStreaming,
      memoryImpact
    });
  } catch (error) {
    logger.error('M3U estimate error:', error);
    // Return safe defaults on error
    res.json({
      contentLength: 0,
      contentType: 'unknown',
      estimatedChannels: 0,
      recommendStreaming: true, // Always recommend streaming when uncertain
      memoryImpact: 'unknown'
    });
  }
});

// Legacy M3U parsing endpoint
router.post('/', async (req, res) => {
  const { url, useCache = true } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  // Check cache first
  if (useCache) {
    const cachedChannels = getCachedData(url);
    if (cachedChannels) {
      logger.info(`Using cached M3U data for: ${url} (${cachedChannels.length} channels)`);
      return res.json({
        success: true,
        channels: cachedChannels,
        total: cachedChannels.length,
        source: url,
        fromCache: true,
        sessionId: `cached_${Date.now()}`
      });
    }
  }
  
  const sessionId = `m3u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    logger.info(`Starting M3U parsing session ${sessionId} for: ${url}`);
    
    // Send progress via Socket.IO if available
    const io = req.app.get('io');
    if (io) {
      io.emit('m3uProgress', {
        sessionId,
        stage: 'fetching',
        progress: 0,
        message: 'Fetching M3U playlist...'
      });
    }
    
    // Fetch M3U content
    const response = await axios.get(url, {
      timeout: 120000, // 2 minutes
      maxContentLength: 100 * 1024 * 1024, // 100MB max
      responseType: 'text',
      headers: {
        'User-Agent': 'PlexBridge/1.0',
        'Accept': '*/*'
      }
    });
    
    if (io) {
      io.emit('m3uProgress', {
        sessionId,
        stage: 'parsing',
        progress: 50,
        message: 'Parsing playlist data...'
      });
    }
    
    // Parse M3U content
    const channels = parseM3UContent(response.data);
    
    // Cache the results
    if (useCache) {
      setCachedData(url, channels);
    }
    
    if (io) {
      io.emit('m3uProgress', {
        sessionId,
        stage: 'complete',
        progress: 100,
        message: `Successfully parsed ${channels.length} channels`
      });
    }
    
    logger.info(`M3U parsing completed: ${channels.length} channels found`);
    
    res.json({
      success: true,
      channels,
      total: channels.length,
      source: url,
      fromCache: false,
      sessionId
    });
  } catch (error) {
    logger.error('M3U parsing error:', error);
    
    const io = req.app.get('io');
    if (io) {
      io.emit('m3uProgress', {
        sessionId,
        stage: 'error',
        progress: 0,
        message: error.message,
        error: true
      });
    }
    
    res.status(500).json({
      error: 'Failed to parse M3U playlist',
      details: error.message,
      sessionId
    });
  }
});

// Streaming M3U parser for large playlists
router.get('/stream', async (req, res) => {
  const { url, chunkSize = 1000, useCache = 'true' } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  const sessionId = `m3u_stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  
  try {
    logger.info(`Starting streaming M3U parsing session ${sessionId} for: ${url}`);
    
    // Set up Server-Sent Events for streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Transfer-Encoding': 'chunked'
    });
    
    const sendEvent = (eventType, data) => {
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify({ ...data, timestamp: Date.now() })}\n\n`);
    };
    
    // Send initial progress
    sendEvent('progress', {
      sessionId,
      stage: 'fetching',
      progress: 0,
      message: 'Starting to fetch M3U playlist...'
    });
    
    // Fetch and parse the M3U playlist
    const parsedUrl = urlModule.parse(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const request = client.get(url, {
      headers: {
        'User-Agent': 'PlexBridge/1.0',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate'
      },
      timeout: 300000 // 5 minutes for large playlists
    }, (response) => {
      if (response.statusCode !== 200) {
        sendEvent('error', {
          sessionId,
          error: `HTTP ${response.statusCode}: ${response.statusMessage}`
        });
        res.end();
        return;
      }
      
      // Handle compression
      let stream = response;
      if (response.headers['content-encoding'] === 'gzip') {
        stream = response.pipe(zlib.createGunzip());
      } else if (response.headers['content-encoding'] === 'deflate') {
        stream = response.pipe(zlib.createInflate());
      }
      
      let buffer = '';
      let currentChannel = null;
      let channels = [];
      let totalChannels = 0;
      let lastProgressUpdate = Date.now();
      const BATCH_SIZE = parseInt(chunkSize);
      
      stream.setEncoding('utf8');
      
      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the incomplete line in buffer
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          if (trimmedLine.startsWith('#EXTINF:')) {
            // Parse channel info
            const match = trimmedLine.match(/#EXTINF:(-?\d+(?:\.\d+)?)\s*(.*?),\s*(.*?)$/);
            if (match) {
              const [, duration, attributesStr, name] = match;
              
              // Parse attributes
              const attributes = {};
              const attrRegex = /(\w+(?:-\w+)?)="([^"]*)"/g;
              let attrMatch;
              while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
                attributes[attrMatch[1]] = attrMatch[2];
              }
              
              currentChannel = {
                id: uuidv4(),
                name: name || 'Unknown Channel',
                duration: parseFloat(duration),
                attributes,
                url: null
              };
            }
          } else if (!trimmedLine.startsWith('#') && trimmedLine.length > 0 && currentChannel) {
            // This is the URL line
            currentChannel.url = trimmedLine;
            channels.push(currentChannel);
            totalChannels++;
            currentChannel = null;
            
            // Send batch when reaching batch size
            if (channels.length >= BATCH_SIZE) {
              sendEvent('channels', {
                sessionId,
                channels: [...channels],
                batchSize: channels.length,
                totalSoFar: totalChannels
              });
              channels = []; // Clear batch
              
              // Send progress update
              const now = Date.now();
              if (now - lastProgressUpdate > 1000) { // Update progress every second
                const elapsedSeconds = Math.floor((now - startTime) / 1000);
                sendEvent('progress', {
                  sessionId,
                  stage: 'streaming',
                  progress: Math.min(90, Math.floor((totalChannels / 1000) * 10)), // Estimate progress
                  message: `Processed ${totalChannels} channels (${elapsedSeconds}s)...`
                });
                lastProgressUpdate = now;
              }
            }
          }
        }
      });
      
      stream.on('end', () => {
        // Send remaining channels
        if (channels.length > 0) {
          sendEvent('channels', {
            sessionId,
            channels: [...channels],
            batchSize: channels.length,
            totalSoFar: totalChannels
          });
        }
        
        // Send completion event
        sendEvent('complete', {
          sessionId,
          totalChannels,
          duration: Date.now() - startTime,
          message: `Successfully parsed ${totalChannels} channels`
        });
        
        logger.info(`Streaming M3U parsing completed: ${totalChannels} channels found in ${Date.now() - startTime}ms`);
        res.end();
      });
      
      stream.on('error', (error) => {
        logger.error('Stream parsing error:', error);
        sendEvent('error', {
          sessionId,
          error: error.message
        });
        res.end();
      });
    });
    
    request.on('error', (error) => {
      logger.error('Request error:', error);
      sendEvent('error', {
        sessionId,
        error: error.message
      });
      res.end();
    });
    
    request.on('timeout', () => {
      request.destroy();
      sendEvent('error', {
        sessionId,
        error: 'Request timeout after 5 minutes'
      });
      res.end();
    });
    
    // Handle client disconnect
    req.on('close', () => {
      logger.info(`Client disconnected from streaming session ${sessionId}`);
      request.destroy();
    });
    
  } catch (error) {
    logger.error('Streaming M3U parsing error:', error);
    res.status(500).json({
      error: 'Failed to start streaming parser',
      details: error.message
    });
  }
});


module.exports = router;