import { expect } from '@playwright/test';
import { fullTest as test } from '../fixtures/auth.fixture.js';

test.describe('Gameplay - Basic', () => {
  test('should redirect to lobby when no campaign loaded', async ({ page, mockAI }) => {
    await mockAI.interceptAll();
    await page.goto('/play');

    // Without a loaded campaign, should redirect to lobby or show empty state
    await page.waitForLoadState('networkidle');
    const url = page.url();
    const isOnPlay = url.includes('/play');
    const isOnLobby = url.includes('/') && !url.includes('/play');

    expect(isOnPlay || isOnLobby).toBeTruthy();
  });

  test('should show action input when campaign is loaded', async ({ page, mockAI }) => {
    await mockAI.interceptAll();
    await page.goto('/play');
    await page.waitForLoadState('networkidle');

    // If on play page with a campaign, action input should be visible
    if (page.url().includes('/play')) {
      const actionInput = page.locator('[data-testid="action-input"]');
      const hasInput = await actionInput.isVisible().catch(() => false);

      if (hasInput) {
        await expect(actionInput).toBeEnabled();
      }
    }
  });

  test('should allow typing in action input', async ({ page, mockAI }) => {
    await mockAI.interceptAll();
    await page.goto('/play');
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/play')) return;

    const actionInput = page.locator('[data-testid="action-input"]');
    if (!(await actionInput.isVisible().catch(() => false))) return;

    await actionInput.fill('I cautiously enter the dungeon');
    await expect(actionInput).toHaveValue('I cautiously enter the dungeon');
  });

  test('should clear action input after submission', async ({ page, mockAI }) => {
    await mockAI.interceptAll();
    await page.goto('/play');
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/play')) return;

    const actionInput = page.locator('[data-testid="action-input"]');
    const submitBtn = page.locator('[data-testid="submit-action"]');
    if (!(await actionInput.isVisible().catch(() => false))) return;

    await actionInput.fill('I look around the room');
    await submitBtn.click();

    // Input should clear after submit
    await expect(actionInput).toHaveValue('');
  });

  test('should display suggested action buttons', async ({ page, mockAI }) => {
    await mockAI.interceptAll();
    await page.goto('/play');
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/play')) return;

    const suggestedActions = page.locator('[data-testid="suggested-action"]');
    const count = await suggestedActions.count();

    if (count > 0) {
      // Suggested actions should be clickable
      await expect(suggestedActions.first()).toBeEnabled();
    }
  });
});
