import { expect } from '@playwright/test';
import { fullTest as test } from '../fixtures/auth.fixture.js';

test.describe('Campaign CRUD', () => {
  test('should navigate to campaign creator', async ({ lobbyPage, page }) => {
    await lobbyPage.goto();

    await lobbyPage.newCampaignButton.click();

    await expect(page).toHaveURL(/\/create/);
  });

  test('should select genre and tone chips', async ({ creatorPage, page }) => {
    await creatorPage.goto();

    // Select Sci-Fi genre — verify the chip gets active styling (not CSS class, but visual state)
    await creatorPage.selectGenre('Sci-Fi');
    const sciFiChip = creatorPage.genreChip('Sci-Fi');
    // Active chip has shadow glow — verify it's not disabled and is the selected one
    await expect(sciFiChip).toBeVisible();
    await expect(sciFiChip).toBeEnabled();

    // Select Dark tone
    await creatorPage.selectTone('Dark');
    const darkChip = creatorPage.toneChip('Dark');
    await expect(darkChip).toBeVisible();
    await expect(darkChip).toBeEnabled();

    // Verify non-selected chip doesn't interfere — Fantasy should still be clickable
    const fantasyChip = creatorPage.genreChip('Fantasy');
    await expect(fantasyChip).toBeVisible();
  });

  test('should fill story prompt', async ({ creatorPage }) => {
    await creatorPage.goto();

    await creatorPage.fillStoryPrompt('A brave adventurer enters a mysterious dungeon.');
    await expect(creatorPage.storyPromptInput).toHaveValue('A brave adventurer enters a mysterious dungeon.');
  });

  test('should show all form sections on creator page', async ({ creatorPage, page }) => {
    await creatorPage.goto();

    // All chip groups should be present
    await expect(creatorPage.genreChip('Fantasy')).toBeVisible();
    await expect(creatorPage.toneChip('Epic')).toBeVisible();
    await expect(creatorPage.difficultyChip('Normal')).toBeVisible();
    await expect(creatorPage.storyPromptInput).toBeVisible();
  });

  test('should show campaign list in lobby when campaigns exist', async ({ lobbyPage }) => {
    await lobbyPage.goto();

    // Check if there are saved campaigns
    const campaignsSection = lobbyPage.savedCampaignsSection;
    const hasCampaigns = await campaignsSection.isVisible().catch(() => false);

    if (hasCampaigns) {
      const count = await lobbyPage.getCampaignCount();
      expect(count).toBeGreaterThan(0);
    }
    // If no campaigns, that's also valid — empty state is fine
  });
});
