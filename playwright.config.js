const { defineConfig, devices } = require('@playwright/test');

// Support multiple test environments
const TEST_ENVIRONMENTS = {
  production: 'http://192.168.3.148:3000',
  docker: 'http://192.168.4.56:3000',
  local: 'http://localhost:8080'
};

// Use environment variable or default to docker
const baseURL = TEST_ENVIRONMENTS[process.env.TEST_ENV] || TEST_ENVIRONMENTS.docker;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 60000, // 60 second timeout for M3U8 streaming tests
  
  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
    screenshot: 'always',
    video: 'retain-on-failure',
    actionTimeout: 30000, // 30 seconds for actions
    navigationTimeout: 30000, // 30 seconds for navigation
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Chrome-specific settings for stability
        channel: 'chrome',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      },
    },
  ],

  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});