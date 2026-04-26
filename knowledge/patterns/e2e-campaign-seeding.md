# Pattern — Seeding campaigns for Playwright via `page.route()`

The obvious way to get a Playwright test "into" a loaded campaign is to POST `/v1/campaigns` with a pre-built `coreState`, persist a real `Character` row, then navigate to `/play/:id`. **Don't do that.** For smoke tests, mocking the loader endpoint via `page.route()` is far simpler and faster — it skips the DB entirely and stays on the production code path.

## Why the route mock works

The frontend loads a campaign on navigation to `/play/:campaignId` via this chain:

1. [GameplayPage.jsx](../../src/components/gameplay/GameplayPage.jsx) pulls `urlCampaignId` from `useParams()`
2. [useCampaignLoader.js](../../src/hooks/useCampaignLoader.js) fires `storage.loadCampaign(urlCampaignId)` when `campaign` is null
3. [storage.loadCampaign](../../src/services/storage.js) calls `apiClient.get('/campaigns/:id')`
4. `_parseBackendCampaign(full)` shapes the response into the Zustand state
5. `dispatch({ type: 'LOAD_CAMPAIGN', payload: data })` injects the state

Crucially, **there is no Zustand persistence** — all state comes from the backend call on every load. If we intercept step 3 with a Playwright route mock, the frontend still follows its production code path all the way to the `LOAD_CAMPAIGN` dispatch — we just control the shape of the payload.

This is the single biggest lever for cheap e2e tests in this codebase.

## The minimal payload shape

From `_parseBackendCampaign()` — the parser expects:

```js
{
  id: 'mock-campaign-id',
  userId: 'mock-user',
  name: 'Campaign Name',
  genre: 'Fantasy',
  tone: 'Dramatic',
  coreState: {
    campaign: { id, backendId, name, genre, tone, language },
    world: { currentLocation, npcs: [], factions: {}, facts: [] },
    combat: { active, round, turnIndex, log: [], combatants: [...], reason },
    scenes: [],
    chatHistory: [],
    ai: { costs: {} },
  },
  characters: [/* character array — first one becomes state.character */],
  characterIds: ['char-id'],
  scenes: [],
  totalCost: 0,
  lastSaved: new Date().toISOString(),
  shareToken: null,
}
```

### Key quirks

- **`coreState` is a JS object** (post-Postgres migration: native JSONB, no `JSON.stringify` round-trip). The parser still tolerates strings (`typeof full.coreState === 'string' ? JSON.parse(...) : (full.coreState || {})`) but the real backend returns an object — match that for realism.
- **`characters` is a top-level array**, not nested inside `coreState`. `_parseBackendCampaign` copies `full.characters[0]` onto `state.character`. Skip this and the frontend will have `state.character = null` and redirect.
- **`combat` lives inside `coreState`**. Put `active: true, round: 1, turnIndex: 0, combatants: [...]` there to land in gameplay with CombatPanel rendered.

## Combatant shape

Each entry in `coreState.combat.combatants` must match what `combatEngine.js` expects:

```js
{
  id: 'player',                 // unique within array
  name: 'Hero',
  type: 'player' | 'enemy',
  attributes: { sila, inteligencja, charyzma, zrecznosc, wytrzymalosc, szczescie }, // 0-25
  skills: { 'Walka bronia jednoreczna': 5 },
  inventory: [],
  weapons: ['Hand Weapon'],     // string array of weapon names from catalog
  equipped: { mainHand: null, offHand: null, armour: null },
  armour: {},
  conditions: [],
  wounds: 12,
  maxWounds: 12,
  isDefeated: false,
  position: 2,                  // battlefield position 0-20
  movementUsed: 0,
  movementAllowance: 4,
  traits: [],
}
```

Full reference fixture: [src/test-fixtures/combatState.js](../../src/test-fixtures/combatState.js).

**The Playwright seed helper ([e2e/helpers/seedCombatCampaign.js](../../e2e/helpers/seedCombatCampaign.js)) imports nothing from `src/`** — it has its own `buildCombatCampaignPayload` duplicate because Playwright tests run in Node without Vite's bundler, so relative imports out of `e2e/` into `src/` trip on module resolution. Keep the two copies in sync when the combatant shape changes.

## The route mock

```js
// e2e/helpers/seedCombatCampaign.js
export async function seedCombatCampaign(page, opts = {}) {
  const payload = buildCombatCampaignPayload(opts);
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
    // Stub PUT/PATCH so autoSave() doesn't explode on 404.
    if (method === 'PUT' || method === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.fallback();
  });

  // Lobby/list fetch fallback — not always hit but prevents noisy 404s.
  await page.route('**/v1/campaigns', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: campaignId, name: payload.name, genre: payload.genre, lastSaved: payload.lastSaved }]),
    });
  });

  return { campaignId, payload };
}
```

Usage in a spec:

```js
import { seedCombatCampaign } from '../helpers/seedCombatCampaign.js';

test('combat panel loads on a combat-active campaign', async ({ page, gameplayPage }) => {
  const { campaignId } = await seedCombatCampaign(page, { playerHp: 20, enemyHp: 5 });
  await gameplayPage.goto(campaignId);
  await expect(gameplayPage.combatPanel).toBeVisible();
});
```

## Stubbing the PUT/PATCH autosave

`autoSave()` fires `storage.saveCampaign()` which PUTs to the same `/campaigns/:id` endpoint. If you don't stub the PUT branch in the same route handler (see the `method === 'PUT'` check above), the first autosave after a dispatch returns 404 through `apiClient`, logs a warning, and sometimes surfaces as a toast. Not fatal but noisy — stub it.

## What route mocks alone can't test

Once the test dispatches an action that calls `generateScene()` (e.g. post-combat scene gen), the frontend hits `/ai/campaigns/:id/generate-scene-stream` which is SSE. Mock that separately via `interceptBackendSceneStream()` in [e2e/fixtures/api-mocks.fixture.js](../../e2e/fixtures/api-mocks.fixture.js) — see [sse-streaming.md](sse-streaming.md) for the event shape.

If a test needs multiple sequential scenes or stateful backend behavior (quest state persisting across scenes, NPC dispositions evolving), route mocks get clunky. At that point use real seeded data via a test-only endpoint or direct DB insert — but only as a last resort.

## Don't

- **Don't rely on `localStorage` injection** — there is no `persist` middleware in the Zustand store, so `localStorage.setItem('game-store', ...)` is a no-op.
- **Don't try to dispatch `LOAD_CAMPAIGN` from outside the app** — there's no exposed `window.__store__` hook, and adding one just for tests is worse than the route mock.
- **Don't forget to mock `GET /v1/campaigns`** — some components fetch the list on mount; an unmocked 404 causes console noise that flakes tests looking for "no errors."
- **Don't build the seed helper as an `import` from `src/test-fixtures/`** — Playwright runs in Node without Vite's bundler; relative imports out of `e2e/` into `src/` trip on module resolution. Keep `e2e/helpers/seedCombatCampaign.js` self-contained even if it means duplicating the combatant shape.

## Related

- [sse-streaming.md](sse-streaming.md) — how to mock the SSE stream the scene generator opens after load
- [hook-pure-factory-testing.md](hook-pure-factory-testing.md) — unit test companion for hook logic
- [concepts/combat-system.md](../concepts/combat-system.md) — where most combat e2e coverage lives today
