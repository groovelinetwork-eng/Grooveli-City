import { defineConfig, devices } from '@playwright/test';

/**
 * Cross-app E2E. Runs PRODUCTION builds of both apps:
 *   web  → next start on :3000 (proxies /city/* to :3001)
 *   city → vite preview on :3001 (base /city/)
 * Build first: pnpm --filter @grooveli/web build && pnpm --filter @grooveli/city build
 */
const reuse = !process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @grooveli/city exec vite preview --port 3001 --strictPort',
      url: 'http://localhost:3001/city/',
      reuseExistingServer: reuse,
      timeout: 120_000,
      cwd: '../..',
    },
    {
      command: 'pnpm --filter @grooveli/web start',
      url: 'http://localhost:3000',
      reuseExistingServer: reuse,
      timeout: 120_000,
      cwd: '../..',
    },
  ],
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1366, height: 860 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], channel: 'chromium' }, grep: /@mobile/ },
  ],
});
