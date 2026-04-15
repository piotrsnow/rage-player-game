import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.CI ? 'http://localhost:3001' : 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.js/,
      testDir: './e2e',
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      testMatch: /responsive\.spec\.js/,
    },
  ],

  // Locally: start backend & frontend yourself (`npm run dev`) before running tests.
  // CI: webServer starts backend only — it serves the pre-built frontend from
  // `backend/public/dist`, so FE and BE are same-origin on :3001 and the
  // CSRF double-submit cookie read by `document.cookie` works. A split
  // :5173/:3001 setup breaks CSRF on `/v1/auth/refresh` because the csrf
  // cookie set on :3001 isn't visible to JS on :5173.
  webServer: process.env.CI
    ? {
        command: 'node backend/src/server.js',
        port: 3001,
        reuseExistingServer: false,
        timeout: 60_000,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
