export class GalleryPage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/gallery');
    // Wait for the lazy-loaded GalleryPage chunk to mount. The search input
    // is always rendered (independent of fetch state), so it's the earliest
    // reliable signal that the Suspense fallback has been replaced.
    await this.searchInput.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  }

  get searchInput() { return this.page.locator('[data-testid="gallery-search"]'); }
  get genreFilter() { return this.page.locator('[data-testid="gallery-genre-filter"]'); }
  get toneFilter() { return this.page.locator('[data-testid="gallery-tone-filter"]'); }
  get sortSelect() { return this.page.locator('[data-testid="gallery-sort"]'); }
  get campaignCards() { return this.page.locator('[data-testid="gallery-campaign-card"]'); }
  get nextPageButton() { return this.page.getByRole('button', { name: /next|następna/i }); }
  get prevPageButton() { return this.page.getByRole('button', { name: /prev|poprzednia/i }); }
  get detailModal() { return this.page.locator('[data-testid="campaign-detail-modal"]'); }
  get playFromStartButton() { return this.page.getByRole('button', { name: /play from start|graj od początku/i }); }
  get loadingSpinner() { return this.page.locator('[data-testid="gallery-loading"]'); }
  get emptyState() { return this.page.locator('[data-testid="gallery-empty"]'); }

  async search(query) {
    await this.searchInput.fill(query);
  }

  async waitForLoad() {
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }
}
