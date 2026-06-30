import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke tests against the production build. Run with `pnpm test:e2e`
 * (requires `npx playwright install chromium` once for the browser binary).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
