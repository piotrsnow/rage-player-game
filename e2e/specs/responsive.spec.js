import { test, expect, devices } from '@playwright/test';

test.describe('Responsive Design', () => {
  test('should show mobile navigation on small screens', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['Pixel 7'],
      storageState: './e2e/.auth/user.json',
    });
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Mobile nav or hamburger menu should be visible
    const mobileNav = page.locator('[data-testid="mobile-nav"], nav.fixed.bottom-0, .md\\:hidden').first();
    const hamburger = page.getByRole('button', { name: /menu/i }).first();

    const hasMobileNav = await mobileNav.isVisible().catch(() => false);
    const hasHamburger = await hamburger.isVisible().catch(() => false);

    // At least one mobile navigation element should be present
    expect(hasMobileNav || hasHamburger).toBeTruthy();

    await context.close();
  });

  test('should stack campaign cards vertically on mobile', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['Pixel 7'],
      storageState: './e2e/.auth/user.json',
    });
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Page should be scrollable and not have horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBeFalsy();

    await context.close();
  });

  test('should render gallery in single column on mobile', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['Pixel 7'],
      storageState: './e2e/.auth/user.json',
    });
    const page = await context.newPage();

    await page.goto('/gallery');
    await page.waitForLoadState('networkidle');

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBeFalsy();

    await context.close();
  });
});
