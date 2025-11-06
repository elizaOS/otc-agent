import { createJejuSynpressConfig, createJejuWalletSetup } from '../../tests/shared/synpress.config.base';

const OTC_DESK_PORT = parseInt(process.env.OTC_DESK_PORT || '5004');

// Export Playwright config
export default createJejuSynpressConfig({
  appName: 'otc-desk',
  port: OTC_DESK_PORT,
  testDir: './tests/synpress',
  overrides: {
    timeout: 120000, // 2 minutes for OTC trading operations
    webServer: undefined, // Server must be started manually
  },
});

// Export wallet setup for Synpress
export const basicSetup = createJejuWalletSetup();

