import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run tests serially for blockchain state consistency
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for blockchain tests (critical for contract state)
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  timeout: 600000, // 10 minutes to allow wallet extension download on first run
  
  use: {
    baseURL: 'http://localhost:2222',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000, // 30s for web3 interactions
  },

  projects: [
    {
      name: 'chromium',
      testMatch: ['e2e/**/*.spec.ts'],
      use: { 
        ...devices['Desktop Chrome'],
        // Viewport for consistent screenshots
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  webServer: {
    command: 'bash scripts/test-playwright-start.sh',
    url: 'http://localhost:2222',
    reuseExistingServer: !process.env.CI,
    timeout: 240000, // 4 minutes for all services to start
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_E2E_TEST: '1',
      NODE_ENV: 'development',
      NEXT_PUBLIC_JEJU_RPC_URL: 'http://127.0.0.1:9545',
      NEXT_PUBLIC_JEJU_NETWORK: 'localnet',
      NETWORK: 'jeju-localnet',
    },
  },
});

