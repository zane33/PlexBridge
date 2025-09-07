# Network Failure Analysis - Plex to PlexBridge Connection Issues

## Critical Insight: Network Failures as Root Cause

### The Scenario You've Identified

```
[Plex Server] --X--> [PlexBridge] ----> [IPTV Source]
     ^                     ^
     |                     |
Network failure here causes 404s
```

## Why Network Failures Cause 404 Errors

### 1. **Connection Lifecycle Problem**

When Plex Android TV starts streaming:
1. **Initial Connection**: Plex connects to PlexBridge successfully
2. **Playlist Fetch**: PlexBridge provides the initial HLS playlist
3. **Segment Requests**: After 30-60 seconds, Plex requests new segments
4. **Network Failure**: If network fails HERE, PlexBridge can't be reached
5. **Result**: 404 errors because PlexBridge is unreachable

### 2. **The Timing Matches Your Symptoms**

- **30-60 seconds**: This is typically when:
  - Initial buffered segments are exhausted
  - Plex needs to fetch new segments
  - Network issues become apparent
  - TCP connections may timeout

### 3. **Why Android TV is More Affected**

Android TV clients are particularly vulnerable because:
- Less robust error recovery than desktop clients
- Stricter timeout requirements
- Limited retry logic in ExoPlayer
- No fallback mechanisms for network interruptions

## Evidence Supporting Network Failure Theory

### From Your Logs:
```
androidx.media3.datasource.HttpDataSource$InvalidResponseCodeException: Response code: 404
```

This could mean:
1. PlexBridge is unreachable (network failure)
2. PlexBridge returns 404 (segment not found)
3. Timeout interpreted as 404 by client

### Key Indicators:
```
- Timing: Consistent ~30-60 second delay
- Pattern: Affects segment requests, not initial connection
- Recovery: Sometimes works after restart (network recovers)
```

## Network Failure Scenarios

### 1. **Intermittent Network Loss**
```
Timeline:
0s:   Stream starts (network OK)
30s:  Buffered segments playing (network degrades)
60s:  New segment request (network fails)
61s:  404 error (PlexBridge unreachable)
```

### 2. **Network Congestion**
```
- High latency causes timeout
- Plex interprets timeout as 404
- Android TV crashes due to "missing" segments
```

### 3. **Router/Switch Issues**
```
- ARP cache timeout
- DHCP lease renewal
- Spanning tree reconvergence
- WiFi roaming between APs
```

### 4. **Docker Networking Issues**
```
- Container network bridge problems
- iptables rules dropping packets
- Docker daemon network hiccups
- Host network stack issues
```

## Diagnostic Tests to Confirm

### Test 1: Continuous Ping During Streaming
```bash
# From Plex server to PlexBridge
ping -t 192.168.3.183 > network_test.log

# Watch for packet loss during crashes
tail -f network_test.log | grep -E "(timeout|unreachable|lost)"
```

### Test 2: Network Trace During Failure
```bash
# On PlexBridge server
tcpdump -i any -w plexbridge_capture.pcap host 192.168.4.5

# Analyze for:
# - RST packets
# - Retransmissions
# - Connection timeouts
```

### Test 3: Connection Monitoring
```bash
# Monitor established connections
watch -n 1 'netstat -an | grep -E "(192.168.4.5|ESTABLISHED)" | wc -l'

# Look for connection drops at crash time
```

### Test 4: Latency Monitoring
```bash
# Check latency spikes
while true; do 
  ping -c 1 192.168.3.183 | grep time= | awk '{print strftime("%H:%M:%S"), $0}'
  sleep 1
done
```

## The Real Fix: Network Resilience

### 1. **Connection Keep-Alive Enhancement**
```javascript
// Add to PlexBridge
const keepAliveAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,    // Send keep-alive every 10s
  timeout: 30000,            // 30s timeout
  maxSockets: 100
});

// TCP keep-alive at OS level
socket.setKeepAlive(true, 10000);
```

### 2. **Implement Connection Pooling**
```javascript
// Maintain persistent connections
class ConnectionPool {
  constructor() {
    this.connections = new Map();
    this.healthCheck = setInterval(() => {
      this.validateConnections();
    }, 5000);
  }
  
  async validateConnections() {
    for (const [id, conn] of this.connections) {
      try {
        await conn.ping();
      } catch (error) {
        logger.warn(`Connection ${id} failed health check`);
        this.reconnect(id);
      }
    }
  }
}
```

### 3. **Add Segment Pre-fetching**
```javascript
// Pre-fetch next segments to survive network hiccups
class SegmentPrefetcher {
  async prefetchNext(currentSegment) {
    const nextSegments = this.predictNextSegments(currentSegment, 3);
    
    for (const segment of nextSegments) {
      this.cache.set(segment.url, await this.fetch(segment));
    }
  }
}
```

### 4. **Implement Retry with Exponential Backoff**
```javascript
async function fetchWithRetry(url, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url, {
        timeout: 5000 + (i * 2000)  // Increase timeout each retry
      });
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      logger.warn(`Retry ${i + 1} after ${delay}ms`);
      await sleep(delay);
    }
  }
}
```

### 5. **Add Network Quality Monitoring**
```javascript
class NetworkMonitor {
  constructor() {
    this.latencyHistory = [];
    this.packetLoss = 0;
  }
  
  async checkNetworkQuality() {
    const start = Date.now();
    try {
      await axios.get('/health', { timeout: 1000 });
      const latency = Date.now() - start;
      
      this.latencyHistory.push(latency);
      
      if (latency > 500) {
        logger.warn('High latency detected', { latency });
        this.enableDegradedMode();
      }
    } catch (error) {
      this.packetLoss++;
      logger.error('Network probe failed', { packetLoss: this.packetLoss });
    }
  }
  
  enableDegradedMode() {
    // Increase timeouts
    // Enable aggressive caching
    // Pre-fetch more segments
  }
}
```

## Recommended Network Architecture Changes

### 1. **Use Static IP/Reservation**
```yaml
# docker-compose.yml
services:
  plextv:
    networks:
      bridge:
        ipv4_address: 172.20.0.10  # Static IP
```

### 2. **Implement Health Checks**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 10s     # More frequent checks
  timeout: 5s       # Shorter timeout
  retries: 2        # Fewer retries before unhealthy
```

### 3. **Add Network Redundancy**
- Use multiple network interfaces
- Implement failover logic
- Consider bonded interfaces

### 4. **Optimize Network Path**
```bash
# Ensure Plex and PlexBridge are on same subnet
# Avoid routing through multiple switches/VLANs
# Consider direct connection or same switch
```

## Quick Network Fixes to Try

### 1. **Increase TCP Timeouts**
```bash
# On PlexBridge host
sysctl -w net.ipv4.tcp_keepalive_time=60
sysctl -w net.ipv4.tcp_keepalive_intvl=10
sysctl -w net.ipv4.tcp_keepalive_probes=6
```

### 2. **Disable Power Saving**
```bash
# If using WiFi
iwconfig wlan0 power off

# Ethernet
ethtool -s eth0 wol g
```

### 3. **Check MTU Size**
```bash
# Test for MTU issues
ping -M do -s 1472 192.168.3.183

# If fails, reduce MTU
ifconfig eth0 mtu 1400
```

### 4. **Docker Network Optimization**
```bash
# Restart Docker network
docker network prune -f
docker-compose down
docker-compose up -d
```

## Monitoring Commands

### Real-time Connection Monitoring
```bash
# Watch for connection drops
watch -n 1 'ss -ant | grep 192.168 | grep ESTAB'

# Monitor packet loss
mtr -n --report --report-cycles 100 192.168.3.183

# Check for network errors
ip -s link show

# Docker network issues
docker network inspect bridge
```

## Conclusion

Your suspicion about network failures is likely correct. The 404 errors after 30-60 seconds strongly suggest:

1. **Initial connection succeeds** (buffered content plays)
2. **Network degrades or fails** (during playback)
3. **Segment requests fail** (can't reach PlexBridge)
4. **Android TV interprets as 404** (poor error handling)

## Immediate Actions

1. **Monitor network during streaming**:
   ```bash
   ping -i 0.5 192.168.3.183 | ts '[%H:%M:%.S]'
   ```

2. **Check Docker logs for network errors**:
   ```bash
   docker logs plextv 2>&1 | grep -E "(ETIMEDOUT|ECONNREFUSED|ENETUNREACH)"
   ```

3. **Test with direct connection** (bypass switches/routers if possible)

4. **Implement the network resilience fixes** in addition to the HLS resolver

The HLS segment resolver fix addresses part of the problem, but network resilience is equally important for stable Android TV streaming.