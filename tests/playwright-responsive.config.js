const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run tests sequentially for better analysis
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries for debugging
  workers: 1, // Single worker for stability
  reporter: [
    ['html', { outputFolder: 'tests/responsive-report' }],
    ['list']
  ],
  
  use: {
    baseURL: 'http://localhost:3000', // Correct port for PlexBridge
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['iPhone SE'],
        channel: 'chrome',
        viewport: { width: 375, height: 667 },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection'
        ]
      },
    },
    {
      name: 'tablet-chrome',
      use: { 
        ...devices['iPad'],
        channel: 'chrome',
        viewport: { width: 768, height: 1024 },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection'
        ]
      },
    },
    {
      name: 'desktop-chrome',
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