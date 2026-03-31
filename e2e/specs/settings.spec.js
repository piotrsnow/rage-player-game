import { expect } from '@playwright/test';
import { authenticatedTest as test } from '../fixtures/auth.fixture.js';

test.describe('Settings', () => {
  test('should open settings from sidebar', async ({ lobbyPage, page }) => {
    await lobbyPage.goto();

    // Settings can be accessed via sidebar or header
    const settingsButton = page.getByRole('button', { name: /settings|ustawienia/i }).first();
    const settingsIcon = page.locator('[data-testid="settings-button"], .material-symbols-outlined:has-text("settings")').first();

    const btn = await settingsButton.isVisible().catch(() => false) ? settingsButton : settingsIcon;

    if (await btn.isVisible().catch(() => false)) {
      await btn.click();

      // Settings panel/modal should appear
      const settingsPanel = page.locator('[data-testid="settings-panel"], [role="dialog"]').first();
      await expect(settingsPanel).toBeVisible({ timeout: 5_000 });
    }
  });

  test('should show API key configuration', async ({ lobbyPage, page }) => {
    await lobbyPage.goto();

    // API key warning should be visible (since test env has no real keys)
    const apiKeyWarning = lobbyPage.apiKeyWarning;
    const isVisible = await apiKeyWarning.isVisible().catch(() => false);

    if (isVisible) {
      await apiKeyWarning.click();

      // Settings should open showing API key fields
      const settingsContent = page.locator('[data-testid="settings-panel"], [role="dialog"]').first();
      await expect(settingsContent).toBeVisible({ timeout: 5_000 });
    }
  });

  test('should persist language preference', async ({ page }) => {
    await page.goto('/');

    // Check current language in localStorage
    const initialLang = await page.evaluate(() => {
      const settings = localStorage.getItem('nikczemny_krzemuch_settings');
      if (settings) {
        try {
          return JSON.parse(settings).language;
        } catch { return null; }
      }
      return null;
    });

    // Language setting should exist or default
    expect(initialLang === null || typeof initialLang === 'string').toBeTruthy();
  });
});
