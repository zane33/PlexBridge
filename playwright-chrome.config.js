const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run sequentially for investigation
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries for investigation
  workers: 1, // Single worker for investigation
  reporter: [['html'], ['list']], // Both HTML and console reporting
  
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on', // Always capture trace for investigation
    screenshot: 'always', // Always take screenshots
    video: 'on', // Always record video
    headless: false, // Run in headed mode to see what's happening
  },

  projects: [
    {
      name: 'chrome',
      use: { 
        ...devices['Desktop Chrome'],
        // Chrome-specific settings for investigation
        // channel: 'chrome', // Use Chromium instead
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        // Enable additional debugging
        launchOptions: {
          slowMo: 500, // Add delay between actions for better observation
          devtools: true // Open DevTools for real-time debugging
        }
      },
    },
  ],

  webServer: {
    command: 'echo "Server already running"', // Don't start server, it's already running
    url: 'http://localhost:8080',
    reuseExistingServer: true, // Use existing server
    timeout: 5000, // Quick timeout since server is already running
  },
});