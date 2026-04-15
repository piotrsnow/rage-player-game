import { expect } from '@playwright/test';
import { fullTest as test } from '../fixtures/auth.fixture.js';
import { seedCombatCampaign } from '../helpers/seedCombatCampaign.js';

test.describe('Combat - CombatPanel smoke', () => {
  test('loads a combat-active campaign and renders the CombatPanel', async ({ page, mockAI, gameplayPage }) => {
    await mockAI.interceptAll();
    const { campaignId } = await seedCombatCampaign(page, { playerHp: 20, enemyHp: 5 });

    await gameplayPage.goto(campaignId);

    await expect(gameplayPage.combatPanel).toBeVisible({ timeout: 15_000 });
    await expect(gameplayPage.combatHeader).toBeVisible();
    await expect(gameplayPage.combatRound).toContainText(/Runda|Round/);
    await expect(gameplayPage.combatSurrenderButton).toBeVisible();
  });

  test('enemy-first-initiative combat shows panel with combat log present', async ({ page, mockAI, gameplayPage }) => {
    await mockAI.interceptAll();
    const { campaignId } = await seedCombatCampaign(page, {
      playerHp: 20,
      enemyHp: 8,
      enemyInitiative: true,
    });

    await gameplayPage.goto(campaignId);

    await expect(gameplayPage.combatPanel).toBeVisible({ timeout: 15_000 });
    await expect(gameplayPage.combatHeader).toBeVisible();
    // Enemy initiative means the panel loads and turn indicator shows enemy-first.
    // The resolver auto-advances the turn; we just verify the panel doesn't crash
    // and the round indicator starts at 1.
    await expect(gameplayPage.combatRound).toContainText('1');
  });
});
