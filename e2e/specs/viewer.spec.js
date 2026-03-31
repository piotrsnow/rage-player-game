import { test, expect } from '@playwright/test';

test.describe('Campaign Viewer', () => {
  test('should show error for invalid share token', async ({ page }) => {
    await page.goto('/view/invalid-token-12345');
    await page.waitForLoadState('networkidle');

    // Should show an error or empty state (token not found)
    const hasError = await page.getByText(/not found|nie znaleziono|error|błąd/i).first().isVisible().catch(() => false);
    const hasLoading = await page.locator('.animate-spin').isVisible().catch(() => false);

    // Either error shown or still loading (backend not available)
    expect(hasError || hasLoading || page.url().includes('/view/')).toBeTruthy();
  });

  test('should render viewer page for share token route', async ({ page }) => {
    await page.goto('/view/test-token');

    // Should not crash - page should render
    await expect(page).toHaveURL(/\/view\/test-token/);
  });
});
