const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run tests sequentially for debugging
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries for debugging
  workers: 1, // Single worker for debugging
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: false, // Run in headed mode for debugging
  },

  projects: [
    {
      name: 'chrome-debug',
      use: { 
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--allow-running-insecure-content',
          ],
          slowMo: 1000, // Slow down actions for debugging
        },
        contextOptions: {
          recordVideo: {
            dir: 'test-results/videos/',
            size: { width: 1280, height: 720 }
          }
        }
      },
    },
  ],

  // Don't start server (assume it's already running)
  webServer: undefined,
});