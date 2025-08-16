const axios = require('axios');
const logger = require('../utils/logger');

class M3UParser {
  constructor() {
    this.timeout = 30000; // 30 seconds
    this.maxSize = 100 * 1024 * 1024; // 100MB
  }

  async parseFromUrl(url, options = {}) {
    try {
      logger.info(`Fetching M3U playlist from: ${url}`);
      
      const requestConfig = {
        method: 'GET',
        url: url,
        timeout: this.timeout,
        maxContentLength: this.maxSize,
        headers: {
          'User-Agent': 'PlexBridge/1.0'
        }
      };

      // Add authentication if provided
      if (options.auth_username && options.auth_password) {
        requestConfig.auth = {
          username: options.auth_username,
          password: options.auth_password
        };
      }

      const response = await axios(requestConfig);
      const content = response.data;

      return this.parseContent(content);
    } catch (error) {
      logger.error('Failed to fetch M3U playlist:', error.message);
      throw new Error(`Failed to fetch M3U playlist: ${error.message}`);
    }
  }

  parseContent(content) {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const channels = [];
    let currentChannel = null;

    logger.info(`Parsing M3U content with ${lines.length} lines`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('#EXTM3U')) {
        continue; // Header line
      }

      if (line.startsWith('#EXTINF:')) {
        // Parse EXTINF line
        currentChannel = this.parseExtinf(line);
      } else if (line.startsWith('#EXTGRP:')) {
        // Parse group
        if (currentChannel) {
          currentChannel.group = line.substring(8);
        }
      } else if (line.startsWith('#')) {
        // Other comments, skip
        continue;
      } else if (line.startsWith('http://') || line.startsWith('https://')) {
        // Stream URL
        if (currentChannel) {
          currentChannel.url = line;
          currentChannel.type = this.detectStreamType(line);
          channels.push(currentChannel);
          currentChannel = null;
        } else {
          // URL without EXTINF, create basic channel
          channels.push({
            name: this.extractNameFromUrl(line),
            url: line,
            type: this.detectStreamType(line),
            duration: -1,
            group: 'Uncategorized'
          });
        }
      }
    }

    logger.info(`Parsed ${channels.length} channels from M3U playlist`);
    return channels;
  }

  parseExtinf(line) {
    // #EXTINF:duration,name
    const match = line.match(/#EXTINF:([^,]*),(.*)$/);
    if (!match) {
      return null;
    }

    const duration = parseFloat(match[1]) || -1;
    const nameAndAttribs = match[2];

    // Extract attributes like tvg-id, tvg-name, group-title, etc.
    const attributes = {};
    const attrRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
    let attrMatch;
    let name = nameAndAttribs;

    while ((attrMatch = attrRegex.exec(nameAndAttribs)) !== null) {
      attributes[attrMatch[1]] = attrMatch[2];
      // Remove attribute from name
      name = name.replace(attrMatch[0], '').trim();
    }

    // Clean up name (remove leading comma and spaces)
    name = name.replace(/^[,\s]+/, '').trim();

    return {
      name: name || 'Unknown Channel',
      duration: duration,
      attributes: attributes,
      group: attributes['group-title'] || 'General',
      epg_id: attributes['tvg-id'] || null,
      logo: attributes['tvg-logo'] || null
    };
  }

  detectStreamType(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('.m3u8') || urlLower.includes('hls')) {
      return 'hls';
    } else if (urlLower.includes('.mpd') || urlLower.includes('dash')) {
      return 'dash';
    } else if (urlLower.startsWith('rtsp://')) {
      return 'rtsp';
    } else if (urlLower.startsWith('rtmp://')) {
      return 'rtmp';
    } else if (urlLower.includes('udp://')) {
      return 'udp';
    } else {
      return 'http';
    }
  }

  extractNameFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      return filename.replace(/\.[^/.]+$/, '') || 'Unknown Channel';
    } catch {
      return 'Unknown Channel';
    }
  }

  async validateChannels(channels, options = {}) {
    if (!options.validate_streams) {
      return channels;
    }

    logger.info(`Validating ${channels.length} channel URLs...`);
    const validatedChannels = [];

    for (const channel of channels) {
      try {
        const response = await axios.head(channel.url, {
          timeout: 5000,
          maxRedirects: 3
        });
        
        channel.status = 'valid';
        channel.contentType = response.headers['content-type'];
        validatedChannels.push(channel);
      } catch (error) {
        logger.warn(`Channel validation failed for ${channel.name}: ${error.message}`);
        channel.status = 'invalid';
        channel.error = error.message;
        
        if (options.include_invalid) {
          validatedChannels.push(channel);
        }
      }
    }

    logger.info(`Validation complete: ${validatedChannels.length} valid channels`);
    return validatedChannels;
  }
}

module.exports = M3UParser;