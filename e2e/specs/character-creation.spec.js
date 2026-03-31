import { expect } from '@playwright/test';
import { fullTest as test } from '../fixtures/auth.fixture.js';

test.describe('Character Creation', () => {
  test.beforeEach(async ({ creatorPage }) => {
    await creatorPage.goto();
  });

  test('should show character picker section on creator page', async ({ page }) => {
    // Character section should be visible on the creator page
    const charSection = page.getByText(/character|postać/i).first();
    await expect(charSection).toBeVisible();
  });

  test('should open character creation modal', async ({ page }) => {
    // Scroll to and click the "Create Character" button
    const createCharBtn = page.getByText(/create character|stwórz postać/i).first();
    await createCharBtn.scrollIntoViewIfNeeded();
    await createCharBtn.click();

    // Character creation modal should appear with name input
    const nameInput = page.locator('[data-testid="character-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
  });

  test('should fill character name', async ({ page }) => {
    const createCharBtn = page.getByText(/create character|stwórz postać/i).first();
    await createCharBtn.scrollIntoViewIfNeeded();
    await createCharBtn.click();

    const nameInput = page.locator('[data-testid="character-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    await nameInput.fill('Sir Tester');
    await expect(nameInput).toHaveValue('Sir Tester');
  });

  test('should show species selection options', async ({ page }) => {
    const createCharBtn = page.getByText(/create character|stwórz postać/i).first();
    await createCharBtn.scrollIntoViewIfNeeded();
    await createCharBtn.click();

    // Wait for modal to render fully
    await page.locator('[data-testid="character-name-input"]').waitFor({ state: 'visible', timeout: 10_000 });

    // Species buttons should be visible (Human is always available)
    const humanOption = page.getByRole('button', { name: /human|człowiek/i }).first();
    await expect(humanOption).toBeVisible({ timeout: 5_000 });
  });
});
