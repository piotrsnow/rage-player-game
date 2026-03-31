import { test, expect } from '@playwright/test';

const HOST_STATE = './e2e/.auth/host.json';
const GUEST_STATE = './e2e/.auth/guest.json';

test.describe('Multiplayer', () => {
  test('should load join room page with room code input', async ({ browser }) => {
    const context = await browser.newContext({ storageState: HOST_STATE });
    try {
      const page = await context.newPage();
      await page.goto('/join');

      await expect(page).toHaveURL(/\/join/);
      await expect(page.locator('[data-testid="room-code-input"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('should validate room code format (uppercase, max 4 chars)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: HOST_STATE });
    try {
      const page = await context.newPage();
      await page.goto('/join');

      const input = page.locator('[data-testid="room-code-input"]');
      await input.fill('ab12');
      await expect(input).toHaveValue('AB12');

      await input.fill('ABCDE');
      await expect(input).toHaveValue('ABCD');
    } finally {
      await context.close();
    }
  });

  test('should show error for non-existent room code', async ({ browser }) => {
    const context = await browser.newContext({ storageState: HOST_STATE });
    try {
      const page = await context.newPage();
      await page.goto('/join');

      await page.locator('[data-testid="room-code-input"]').fill('ZZZZ');
      await page.locator('[data-testid="join-room-button"]').click();

      await expect(page.locator('[data-testid="join-error"]')).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('should show available rooms section and refresh button', async ({ browser }) => {
    const context = await browser.newContext({ storageState: HOST_STATE });
    try {
      const page = await context.newPage();
      await page.goto('/join');

      await expect(page.getByText(/available rooms|dostępne pokoje/i)).toBeVisible();
      await expect(page.locator('[data-testid="refresh-rooms"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('should support independent browser contexts for host and guest', async ({ browser }) => {
    const hostContext = await browser.newContext({ storageState: HOST_STATE });
    const guestContext = await browser.newContext({ storageState: GUEST_STATE });
    try {
      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();

      await hostPage.goto('/join');
      await guestPage.goto('/join');

      await expect(hostPage).toHaveURL(/\/join/);
      await expect(guestPage).toHaveURL(/\/join/);

      await expect(hostPage.locator('[data-testid="room-code-input"]')).toBeVisible();
      await expect(guestPage.locator('[data-testid="room-code-input"]')).toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
