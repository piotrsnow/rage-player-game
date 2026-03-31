import { writeFileSync, mkdirSync } from 'fs';
import { test as setup } from '@playwright/test';
import { TEST_USER, TEST_HOST, TEST_GUEST, BACKEND_URL } from './fixtures/test-data.js';

async function waitForBackend(request, retries = 30, intervalMs = 1000) {
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

async function registerOrLogin(request, user) {
  const registerRes = await request.post(`${BACKEND_URL}/auth/register`, {
    data: user,
    timeout: 30_000,
  });

  if (registerRes.ok()) {
    const body = await registerRes.json();
    return body.token;
  }

  // 409 = already exists → login instead
  const loginRes = await request.post(`${BACKEND_URL}/auth/login`, {
    data: user,
    timeout: 30_000,
  });

  if (!loginRes.ok()) {
    const errorBody = await loginRes.text().catch(() => '');
    throw new Error(`Auth failed for ${user.email}: register=${registerRes.status()}, login=${loginRes.status()} ${errorBody}`);
  }

  const body = await loginRes.json();
  return body.token;
}

function buildStorageState(token) {
  const settings = JSON.stringify({
    backendUrl: BACKEND_URL,
    useBackend: true,
  });

  return {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:5173',
        localStorage: [
          { name: 'nikczemny_krzemuch_auth_token', value: token },
          { name: 'nikczemny_krzemuch_settings', value: settings },
        ],
      },
    ],
  };
}

function saveAuthState(token, path) {
  writeFileSync(path, JSON.stringify(buildStorageState(token)));
}

setup('create auth states', async ({ request }) => {
  mkdirSync('./e2e/.auth', { recursive: true });

  await waitForBackend(request);

  // Sequential to avoid rate limiting
  const userToken = await registerOrLogin(request, TEST_USER);
  const hostToken = await registerOrLogin(request, TEST_HOST);
  const guestToken = await registerOrLogin(request, TEST_GUEST);

  saveAuthState(userToken, './e2e/.auth/user.json');
  saveAuthState(hostToken, './e2e/.auth/host.json');
  saveAuthState(guestToken, './e2e/.auth/guest.json');
});
