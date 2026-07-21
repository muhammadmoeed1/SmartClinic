import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Manages both servers itself (via webServer) so `npx playwright
 * test` works the same locally and in CI: it starts the built backend
 * (expects migrations + seed already run — see README/CI) and the frontend
 * dev server, waits for both health checks, then runs the suite.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../backend',
      url: 'http://localhost:3000/health',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
