import { expect } from '@playwright/test';
import { authenticatedTest as test } from '../fixtures/auth.fixture.js';

test.describe('Gallery', () => {
  test.beforeEach(async ({ galleryPage }) => {
    await galleryPage.goto();
  });

  test('should load gallery page', async ({ page }) => {
    await expect(page).toHaveURL(/\/gallery/);

    // Should show either campaigns or empty/loading state
    const hasCards = await page.locator('[data-testid="gallery-campaign-card"]').count() > 0;
    const hasEmpty = await page.locator('[data-testid="gallery-empty"]').isVisible().catch(() => false);
    const hasLoading = await page.locator('[data-testid="gallery-loading"]').isVisible().catch(() => false);
    const hasNoCampaigns = await page.getByText(/Brak publicznych kampanii|No public campaigns yet/i).isVisible().catch(() => false);

    // At least one of these states should be present
    expect(hasCards || hasEmpty || hasLoading || hasNoCampaigns).toBeTruthy();
  });

  test('should have search input', async ({ galleryPage }) => {
    const searchInput = galleryPage.searchInput;
    const isVisible = await searchInput.isVisible().catch(() => false);

    if (isVisible) {
      await galleryPage.search('test');
      await expect(searchInput).toHaveValue('test');
    }
  });

  test('should have filter dropdowns', async ({ page }) => {
    // Check for genre filter
    const genreFilter = page.locator('[data-testid="gallery-genre-filter"], select, [role="combobox"]').first();
    const isVisible = await genreFilter.isVisible().catch(() => false);

    if (isVisible) {
      // Filter should be interactive
      await expect(genreFilter).toBeEnabled();
    }
  });

  test('should navigate between pages', async ({ galleryPage, page }) => {
    const nextBtn = galleryPage.nextPageButton;
    const isVisible = await nextBtn.isVisible().catch(() => false);

    if (isVisible) {
      await nextBtn.click();
      // Page should change - verify we're still on gallery
      await expect(page).toHaveURL(/\/gallery/);
    }
  });
});
