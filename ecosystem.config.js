module.exports = {
  apps: [{
    name: 'plextv',
    script: 'server/index.js',
    instances: 1, // Single instance for SSDP compatibility
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 8080
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    error_file: '/data/logs/pm2-error.log',
    out_file: '/data/logs/pm2-out.log',
    log_file: '/data/logs/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    kill_timeout: 10000,
    wait_ready: true,
    listen_timeout: 10000,
    // Health monitoring
    health_check_grace_period: 30000,
    // Resource limits
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
