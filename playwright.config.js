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
    baseURL: 'http://localhost:5173',
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
  // CI: webServer starts them automatically.
  webServer: process.env.CI
    ? [
        {
          command: 'node backend/src/server.js',
          port: 3001,
          reuseExistingServer: false,
          timeout: 30_000,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            DATABASE_URL: process.env.E2E_DATABASE_URL || 'mongodb://localhost:27017/rpgon_test',
            JWT_SECRET: 'e2e-test-jwt-secret-playwright-2026',
            API_KEY_ENCRYPTION_SECRET: 'e2e-test-encryption-key-2026!!',
            CORS_ORIGIN: 'http://localhost:5173',
            MEDIA_BACKEND: 'local',
            PORT: '3001',
          },
        },
        {
          command: 'npm run dev:frontend',
          port: 5173,
          reuseExistingServer: false,
          timeout: 30_000,
        },
      ]
    : undefined,
});
