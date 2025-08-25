/**
 * Stream Architecture Analyzer
 * Detects complex M3U8 streams that require transcoding for Plex compatibility
 */

/**
 * Analyzes M3U8 content to determine if transcoding is needed for Plex compatibility
 * @param {string} m3u8Content - The M3U8 playlist content
 * @param {string} baseUrl - The base M3U8 URL for context
 * @returns {Object} Analysis result with transcoding recommendation
 */
function analyzeStreamComplexity(m3u8Content, baseUrl = '') {
  const analysis = {
    needsTranscoding: false,
    reasons: [],
    complexityScore: 0,
    details: {}
  };

  // Parse M3U8 content
  const lines = m3u8Content.split('\n').map(line => line.trim()).filter(line => line);
  const segmentUrls = lines.filter(line => line && !line.startsWith('#'));

  if (segmentUrls.length === 0) {
    analysis.reasons.push('No segment URLs found');
    return analysis;
  }

  // 1. URL Length Analysis
  const avgUrlLength = segmentUrls.reduce((sum, url) => sum + url.length, 0) / segmentUrls.length;
  const maxUrlLength = Math.max(...segmentUrls.map(url => url.length));
  
  analysis.details.avgUrlLength = Math.round(avgUrlLength);
  analysis.details.maxUrlLength = maxUrlLength;
  
  if (maxUrlLength > 500) {
    analysis.complexityScore += 3;
    analysis.reasons.push(`Extremely long URLs (max: ${maxUrlLength} chars)`);
  } else if (avgUrlLength > 200) {
    analysis.complexityScore += 2;
    analysis.reasons.push(`Long URLs (avg: ${Math.round(avgUrlLength)} chars)`);
  }

  // 2. Beacon/Tracking Detection
  const hasBeaconUrls = segmentUrls.some(url => url.includes('/beacon/'));
  if (hasBeaconUrls) {
    analysis.complexityScore += 4;
    analysis.reasons.push('Uses beacon/tracking endpoints');
    analysis.details.hasBeacon = true;
  }

  // 3. Redirect Parameter Detection
  const hasRedirectParams = segmentUrls.some(url => url.includes('redirect_url='));
  if (hasRedirectParams) {
    analysis.complexityScore += 3;
    analysis.reasons.push('Contains redirect parameters');
    analysis.details.hasRedirect = true;
  }

  // 4. Ad Insertion Detection
  const adInsertionIndicators = ['seen-ad=', 'media_type=', 'ad_break=', 'scte35='];
  const hasAdInsertion = segmentUrls.some(url => 
    adInsertionIndicators.some(indicator => url.includes(indicator))
  );
  if (hasAdInsertion) {
    analysis.complexityScore += 2;
    analysis.reasons.push('Server-side ad insertion detected');
    analysis.details.hasAdInsertion = true;
  }

  // 5. Authentication Token Analysis
  const hasLongTokens = segmentUrls.some(url => {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.length > 300; // Long path indicates embedded tokens
    } catch (e) {
      return false;
    }
  });
  if (hasLongTokens) {
    analysis.complexityScore += 2;
    analysis.reasons.push('Long authentication tokens in URLs');
    analysis.details.hasLongTokens = true;
  }

  // 6. Complex Query Parameters
  let totalParams = 0;
  let complexParams = 0;
  segmentUrls.forEach(url => {
    try {
      const urlObj = new URL(url);
      const paramCount = urlObj.searchParams.size;
      totalParams += paramCount;
      if (paramCount > 5) complexParams++;
    } catch (e) {
      // Invalid URL, skip
    }
  });

  const avgParams = segmentUrls.length > 0 ? totalParams / segmentUrls.length : 0;
  analysis.details.avgQueryParams = Math.round(avgParams * 10) / 10;

  if (avgParams > 5) {
    analysis.complexityScore += 2;
    analysis.reasons.push(`Many query parameters (avg: ${Math.round(avgParams)})`);
  }

  // 7. Domain Complexity (CDN/Edge Networks)
  const sampleUrl = segmentUrls[0];
  try {
    const domain = new URL(sampleUrl).hostname;
    if (domain.includes('amagi.tv') || domain.includes('fastly') || 
        domain.includes('cloudfront') || domain.includes('akamai')) {
      analysis.complexityScore += 1;
      analysis.reasons.push('Uses complex CDN architecture');
      analysis.details.complexCdn = true;
    }
  } catch (e) {
    // Invalid URL
  }

  // 8. Segment Duration Variability (indicates live/complex streams)
  const durations = [];
  lines.forEach(line => {
    if (line.startsWith('#EXTINF:')) {
      const match = line.match(/#EXTINF:([\d.]+)/);
      if (match) durations.push(parseFloat(match[1]));
    }
  });

  if (durations.length > 0) {
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
    
    analysis.details.avgSegmentDuration = Math.round(avgDuration * 100) / 100;
    analysis.details.segmentVariance = Math.round(variance * 100) / 100;
    
    if (variance > 1.0) {
      analysis.complexityScore += 1;
      analysis.reasons.push('Highly variable segment durations');
    }
  }

  // 9. Base URL Analysis
  if (baseUrl) {
    if (baseUrl.length > 500) {
      analysis.complexityScore += 1;
      analysis.reasons.push('Complex base URL structure');
    }
  }

  // Final Decision Logic
  analysis.needsTranscoding = analysis.complexityScore >= 4;
  analysis.details.complexityScore = analysis.complexityScore;

  return analysis;
}

/**
 * Quick check to determine if a stream URL pattern indicates complexity
 * @param {string} streamUrl - The stream URL to check
 * @returns {boolean} True if the URL pattern suggests complexity
 */
function isComplexStreamUrl(streamUrl) {
  const urlLower = streamUrl.toLowerCase();
  
  const complexIndicators = [
    streamUrl.length > 300,
    streamUrl.includes('amagi.tv'),
    streamUrl.includes('/beacon/'),
    streamUrl.includes('redirect_url'),
    streamUrl.includes('seen-ad='),
    streamUrl.match(/[a-f0-9]{64,}/), // Long hex tokens
  ];
  
  // CRITICAL FIX: Direct .ts streams need transcoding for Plex compatibility
  // MPEG Transport Streams (.ts) are not directly compatible with web browsers
  // and need to be transcoded to MPEG-TS format for Plex
  const isTSStream = urlLower.includes('.ts') || urlLower.includes('.mpegts') || urlLower.includes('.mts');
  if (isTSStream && !urlLower.includes('.m3u8')) { // Exclude HLS playlists that reference .ts files
    return true; // All direct .ts streams need transcoding
  }
  
  // Special handling for known problematic domains that often have complex segments
  // even when the main URL appears simple
  const knownComplexDomains = [
    'amagi.tv',           // Server-side ad insertion, complex segment URLs
    'tsv2.amagi.tv',      // Amagi CDN with token-based segments
    'cdn-apse1-prod.tsv2.amagi.tv', // Regional Amagi CDN
    'cdn-uw2-prod.tsv2.amagi.tv',   // US West Amagi CDN
    'cdn-ue1-prod.tsv2.amagi.tv'    // US East Amagi CDN
  ];
  
  const hasKnownComplexDomain = knownComplexDomains.some(domain => streamUrl.includes(domain));
  
  // If it's a known complex domain, lower the threshold
  const threshold = hasKnownComplexDomain ? 1 : 2;
  
  return complexIndicators.filter(Boolean).length >= threshold;
}

/**
 * Fetches and analyzes an M3U8 stream for complexity
 * @param {string} streamUrl - The M3U8 URL to analyze
 * @param {Object} options - Options for fetching (headers, timeout, etc.)
 * @returns {Promise<Object>} Analysis result
 */
async function analyzeRemoteStream(streamUrl, options = {}) {
  try {
    const axios = require('axios');
    const response = await axios.get(streamUrl, {
      timeout: options.timeout || 10000,
      headers: {
        'User-Agent': 'PlexBridge/1.0',
        ...options.headers
      }
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const m3u8Content = response.data;
    return analyzeStreamComplexity(m3u8Content, streamUrl);
  } catch (error) {
    return {
      needsTranscoding: false,
      reasons: [`Failed to analyze stream: ${error.message}`],
      complexityScore: 0,
      details: { error: error.message },
      fallbackRecommendation: isComplexStreamUrl(streamUrl)
    };
  }
}

module.exports = {
  analyzeStreamComplexity,
  isComplexStreamUrl,
  analyzeRemoteStream
};