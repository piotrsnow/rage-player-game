import { test as base } from '@playwright/test';

const DEFAULT_CAMPAIGN_ID = 'mock-exploration-campaign';

/**
 * Build a minimal campaign payload that satisfies _parseBackendCampaign().
 * Non-combat variant — use seedCombatCampaign.js for combat-active state.
 */
export function buildCampaignPayload({
  campaignId = DEFAULT_CAMPAIGN_ID,
  characterName = 'Test Hero',
  location = 'Yeralden',
  scenes = [],
} = {}) {
  const character = {
    id: `char-${campaignId}`,
    backendId: `char-${campaignId}`,
    name: characterName,
    species: 'Human',
    gender: 'male',
    age: 25,
    attributes: {
      sila: 10,
      inteligencja: 10,
      charyzma: 8,
      zrecznosc: 10,
      wytrzymalosc: 10,
      szczescie: 3,
    },
    skills: { 'Walka bronia jednoreczna': 3, 'Percepcja': 4 },
    wounds: 12,
    maxWounds: 12,
    mana: { current: 0, max: 0 },
    inventory: [
      { id: 'sword-1', name: 'Hand Weapon', type: 'weapon', quantity: 1 },
    ],
    money: { gold: 5, silver: 10, copper: 0 },
    equipped: { mainHand: null, offHand: null, armour: null },
    backstory: 'A traveller seeking fortune.',
    characterLevel: 1,
    experience: 0,
    needs: { hunger: 0, thirst: 0, bladder: 0, hygiene: 0, rest: 0 },
    spells: { known: [] },
    titles: [],
    activeEffects: [],
    materialBag: [],
    customAttackPresets: [],
  };

  const coreState = {
    campaign: {
      id: campaignId,
      backendId: campaignId,
      name: 'Test Campaign',
      genre: 'Fantasy',
      tone: 'Dramatic',
      language: 'pl',
    },
    world: {
      currentLocation: location,
      npcs: [],
      factions: {},
      facts: [],
    },
    combat: {
      active: false,
      round: 0,
      turnIndex: 0,
      log: [],
      combatants: [],
      reason: null,
    },
    scenes,
    chatHistory: [],
    ai: { costs: {} },
  };

  return {
    id: campaignId,
    userId: 'mock-user',
    name: 'Test Campaign',
    genre: 'Fantasy',
    tone: 'Dramatic',
    coreState,
    characters: [character],
    characterIds: [character.id],
    scenes: [],
    totalCost: 0,
    lastSaved: new Date().toISOString(),
    shareToken: null,
  };
}

/**
 * Seed a campaign via page.route() interception.
 * Returns { campaignId, payload } for use in assertions.
 */
export async function seedCampaign(page, opts = {}) {
  const payload = buildCampaignPayload(opts);
  const campaignId = payload.id;

  await page.route(`**/v1/campaigns/${campaignId}`, (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    }
    if (method === 'PUT' || method === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.fallback();
  });

  await page.route('**/v1/campaigns', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: campaignId,
        name: payload.name,
        genre: payload.genre,
        lastSaved: payload.lastSaved,
      }]),
    });
  });

  return { campaignId, payload };
}

/**
 * Playwright fixture that provides `seedCampaign` and `seedCampaignWithCleanup`
 * as test-level helpers. Merge into your test via `mergeTests` or extend directly.
 *
 * Usage:
 *   import { test } from '../fixtures/campaign.js';
 *   test('loads gameplay', async ({ page, seededCampaign, gameplayPage }) => {
 *     await gameplayPage.goto(seededCampaign.campaignId);
 *     ...
 *   });
 */
export const test = base.extend({
  /**
   * Auto-seeded campaign — seeds before the test, nothing to clean up
   * (route mocks don't touch the DB).
   */
  seededCampaign: async ({ page }, use) => {
    const result = await seedCampaign(page);
    await use(result);
  },

  /**
   * Lower-level helper when you need custom opts.
   */
  seedCampaignFn: async ({ page }, use) => {
    await use((opts) => seedCampaign(page, opts));
  },
});
