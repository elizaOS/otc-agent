import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:2222',
    viewportWidth: 1280,
    viewportHeight: 720,
    pageLoadTimeout: 120000,
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 20000,
    requestTimeout: 60000,
    responseTimeout: 60000,
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    env: {
      // Test wallet from Anvil (default account #0)
      TEST_WALLET_ADDRESS: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      TEST_PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      API_SECRET_KEY: 'dev-api-secret-change-in-production',
    },
  },
  component: {
    devServer: {
      framework: 'next',
      bundler: 'webpack',
    },
  },
});

