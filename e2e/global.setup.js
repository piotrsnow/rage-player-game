import { writeFileSync, mkdirSync } from 'fs';
import { test as setup, request as apiRequest } from '@playwright/test';
import { TEST_USER, TEST_HOST, TEST_GUEST, BACKEND_URL } from './fixtures/test-data.js';

// Where the frontend lives. In CI the backend serves the built FE from
// `backend/public/dist`, so FE and BE share an origin on :3001 (required
// for the CSRF double-submit cookie to be readable by document.cookie).
// Locally you typically run vite on :5173 alongside the backend container.
const FRONTEND_ORIGIN = process.env.CI ? BACKEND_URL : 'http://localhost:5173';

async function waitForBackend(request, retries = 60, intervalMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await request.get(`${BACKEND_URL}/health`, { timeout: 3000 });
      if (res.ok()) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Backend not ready after ${retries * intervalMs / 1000}s`);
}

// Register (or log in if the account already exists) and capture the HttpOnly
// refresh cookie + non-httpOnly csrf-token cookie in an isolated APIRequestContext.
// We then bolt a seeded localStorage entry onto the captured storage state so
// the SPA boots with `useBackend: true` and calls /v1/auth/refresh, which swaps
// the cookie for a fresh access token on page load.
async function seedAuthState(user, outPath) {
  const ctx = await apiRequest.newContext();
  try {
    const registerRes = await ctx.post(`${BACKEND_URL}/v1/auth/register`, {
      data: user,
      timeout: 30_000,
    });

    if (!registerRes.ok() && registerRes.status() !== 409) {
      const body = await registerRes.text().catch(() => '');
      throw new Error(`register ${user.email}: ${registerRes.status()} ${body}`);
    }

    if (registerRes.status() === 409) {
      const loginRes = await ctx.post(`${BACKEND_URL}/v1/auth/login`, {
        data: user,
        timeout: 30_000,
      });
      if (!loginRes.ok()) {
        const body = await loginRes.text().catch(() => '');
        throw new Error(`login ${user.email}: ${loginRes.status()} ${body}`);
      }
    }

    const state = await ctx.storageState();
    state.origins = [
      {
        origin: FRONTEND_ORIGIN,
        localStorage: [
          {
            name: 'nikczemny_krzemuch_settings',
            value: JSON.stringify({
              backendUrl: BACKEND_URL,
              useBackend: true,
            }),
          },
        ],
      },
    ];

    writeFileSync(outPath, JSON.stringify(state, null, 2));
  } finally {
    await ctx.dispose();
  }
}

setup('create auth states', async ({ request }) => {
  mkdirSync('./e2e/.auth', { recursive: true });

  await waitForBackend(request);

  // Sequential to avoid rate limiting on /v1/auth/register.
  await seedAuthState(TEST_USER, './e2e/.auth/user.json');
  await seedAuthState(TEST_HOST, './e2e/.auth/host.json');
  await seedAuthState(TEST_GUEST, './e2e/.auth/guest.json');
});
