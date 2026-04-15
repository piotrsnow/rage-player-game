/**
 * Playwright helper that mocks `GET /v1/campaigns/:id` to return a campaign
 * with an active combat state loaded. Keeps the frontend on its normal
 * `useCampaignLoader` path but bypasses the DB/backend entirely — ideal for
 * smoke tests of the CombatPanel wiring.
 *
 * Usage:
 *   await seedCombatCampaign(page, { campaignId: 'mock-1', playerHp: 20, enemyHp: 5 });
 *   await page.goto('/play/mock-1');
 */

const DEFAULT_CAMPAIGN_ID = 'mock-combat-campaign';

function buildCombatant(overrides = {}) {
  return {
    id: overrides.id || 'combatant',
    name: overrides.name || 'Combatant',
    type: overrides.type || 'player',
    attributes: {
      sila: 12,
      inteligencja: 10,
      charyzma: 8,
      zrecznosc: 10,
      wytrzymalosc: 10,
      szczescie: 0,
      ...(overrides.attributes || {}),
    },
    skills: overrides.skills || { 'Walka bronia jednoreczna': 5 },
    inventory: overrides.inventory || [],
    weapons: overrides.weapons || ['Hand Weapon'],
    equipped: { mainHand: null, offHand: null, armour: null },
    armour: {},
    conditions: [],
    wounds: overrides.wounds ?? 12,
    maxWounds: overrides.maxWounds ?? 12,
    isDefeated: false,
    position: overrides.position ?? 2,
    movementUsed: 0,
    movementAllowance: 4,
    traits: [],
    ...overrides,
  };
}

export function buildCombatCampaignPayload({
  campaignId = DEFAULT_CAMPAIGN_ID,
  playerHp = 12,
  enemyHp = 5,
  enemyInitiative = false,
  round = 1,
} = {}) {
  const playerCombatant = buildCombatant({
    id: 'player',
    name: 'Hero',
    type: 'player',
    wounds: playerHp,
    maxWounds: playerHp,
  });

  const enemyCombatant = buildCombatant({
    id: 'enemy_brigand',
    name: 'Brigand',
    type: 'enemy',
    attributes: { sila: 8, inteligencja: 6, charyzma: 4, zrecznosc: 6, wytrzymalosc: 6, szczescie: 0 },
    wounds: enemyHp,
    maxWounds: enemyHp,
    position: 3,
  });

  const combatants = enemyInitiative
    ? [enemyCombatant, playerCombatant]
    : [playerCombatant, enemyCombatant];

  const coreState = {
    campaign: {
      id: campaignId,
      backendId: campaignId,
      name: 'Combat Test Campaign',
      genre: 'Fantasy',
      tone: 'Dramatic',
      language: 'pl',
    },
    world: { currentLocation: 'Forest Path', npcs: [], factions: {}, facts: [] },
    combat: {
      active: true,
      round,
      turnIndex: 0,
      log: [],
      combatants,
      reason: 'Bandit ambush on forest path',
    },
    scenes: [],
    chatHistory: [],
    ai: { costs: {} },
  };

  const character = {
    id: 'char-mock-1',
    backendId: 'char-mock-1',
    name: 'Hero',
    species: 'Human',
    gender: 'male',
    age: 28,
    attributes: playerCombatant.attributes,
    skills: playerCombatant.skills,
    wounds: playerHp,
    maxWounds: playerHp,
    mana: { current: 0, max: 0 },
    inventory: [],
    money: { gold: 5, silver: 0, copper: 0 },
    equipped: { mainHand: null, offHand: null, armour: null },
    backstory: 'A seasoned traveller caught in a forest ambush.',
    characterLevel: 1,
    experience: 0,
    needs: { hunger: 0, thirst: 0, bladder: 0, hygiene: 0, rest: 0 },
    spells: { known: [] },
    titles: [],
    activeEffects: [],
    materialBag: [],
    customAttackPresets: [],
  };

  return {
    id: campaignId,
    userId: 'mock-user',
    name: 'Combat Test Campaign',
    genre: 'Fantasy',
    tone: 'Dramatic',
    coreState: JSON.stringify(coreState),
    characters: [character],
    characterIds: [character.id],
    scenes: [],
    totalCost: 0,
    lastSaved: new Date().toISOString(),
    shareToken: null,
  };
}

export async function seedCombatCampaign(page, opts = {}) {
  const payload = buildCombatCampaignPayload(opts);
  const campaignId = payload.id;

  await page.route(`**/v1/campaigns/${campaignId}`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  // Also mock the campaigns list so the lobby + AutoSave side channels
  // don't error on missing data.
  await page.route('**/v1/campaigns', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: campaignId,
        name: payload.name,
        genre: payload.genre,
        tone: payload.tone,
        lastSaved: payload.lastSaved,
      }]),
    });
  });

  // Stub out autosave so resolution handlers can call PUT without hitting
  // the real backend and erroring.
  await page.route(`**/v1/campaigns/${campaignId}`, (route) => {
    const method = route.request().method();
    if (method === 'PUT' || method === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.fallback();
  });

  return { campaignId, payload };
}
