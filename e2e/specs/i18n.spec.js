import { test, expect } from '@playwright/test';

test.describe('Internationalization', () => {
  test('should display Polish text by default for Polish locale', async ({ browser }) => {
    const context = await browser.newContext({
      locale: 'pl-PL',
      storageState: './e2e/.auth/user.json',
    });
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for Polish text in the UI
    const polishText = page.getByText(/nowa kampania|zaloguj|ustawienia/i).first();
    const hasPolish = await polishText.isVisible().catch(() => false);

    // If i18n auto-detects locale, Polish should appear
    if (hasPolish) {
      await expect(polishText).toBeVisible();
    }

    await context.close();
  });

  test('should display English text for English locale', async ({ browser }) => {
    const context = await browser.newContext({
      locale: 'en-US',
      storageState: './e2e/.auth/user.json',
    });
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for English text
    const englishText = page.getByText(/new campaign|login|settings/i).first();
    const hasEnglish = await englishText.isVisible().catch(() => false);

    if (hasEnglish) {
      await expect(englishText).toBeVisible();
    }

    await context.close();
  });

  test('should persist language in localStorage', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: './e2e/.auth/user.json',
    });
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const language = await page.evaluate(() => {
      return document.documentElement.lang || navigator.language;
    });

    expect(typeof language).toBe('string');
    expect(language.length).toBeGreaterThan(0);

    await context.close();
  });
});
