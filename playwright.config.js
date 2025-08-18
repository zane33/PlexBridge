const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run tests sequentially for better analysis
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries for debugging
  workers: 1, // Single worker for stability
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chrome-desktop',
      use: { 
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1920, height: 1080 },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection'
        ]
      },
    }
  ],

  // Don't start server - assume it's already running
  timeout: 120000,
});