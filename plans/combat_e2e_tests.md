# Combat E2E Tests — Plan

## Context

Combat is the biggest automation gap in the codebase. From `knowledge/concepts/frontend-refactor-regressions.md`:

> No combat e2e fixture exists. The plan at `shimmering-inventing-cosmos.md` explicitly flagged this gap. [...] This is a blocker for safe CombatPanel/useCombatCommentary changes.

The frontend refactor (PRs #1-#10) extracted six combat-related hooks — `useCombatResolution`, `useEnemyTurnResolver`, `useCombatResultSync`, `useCombatHostResolve`, `useMultiplayerCombatSceneDetect`, plus `CombatLogEntry` — all with **zero automated coverage**. Every change in this area currently requires manual playtest to verify nothing broke.

This plan addresses that gap. It's scheduled **after** the current hardening plan (`functional-inventing-moonbeam.md`) completes and the merge to `main` happens.

---

## Current E2E Infrastructure (verified 2026-04-13)

- **Playwright** + **Vitest** coexist. Vitest for unit, Playwright for e2e. Root `npm test` = vitest; `npm run test:e2e` = playwright.
- **Auth**: real backend registration/login in `e2e/global.setup.js` — stores JWT in localStorage for three test users (`user`, `host`, `guest`). Tests extend `authenticatedTest` from [e2e/fixtures/auth.fixture.js](e2e/fixtures/auth.fixture.js) which loads `e2e/.auth/user.json`.
- **AI mocking**: [e2e/fixtures/api-mocks.fixture.js](e2e/fixtures/api-mocks.fixture.js) uses `page.route('**/proxy/*/**')` to intercept proxy routes (OpenAI/Anthropic/Stability/ElevenLabs/Gemini). Returns fake responses from [e2e/helpers/mock-responses.js](e2e/helpers/mock-responses.js).
- **Critical gap**: existing mocks intercept only `/proxy/*` routes. They do **not** intercept the backend SSE endpoints `/ai/campaigns/:id/generate-scene-stream` or `/ai/generate-campaign` which is where scene generation actually lives in backend mode. Tests today work because campaign creation flows go through `/proxy/openai`, but combat aftermath (which calls `generateScene`) would hit the backend SSE endpoint unmocked.
- **No Zustand persistence** — [src/stores/gameStore.js](src/stores/gameStore.js) has no `persist` middleware. Auto-save goes to the backend via `storage.saveCampaign`. **Game state cannot be preloaded via localStorage** — it must come from the backend or be injected at runtime.
- **No test hooks** (`window.__TEST__`, `?e2e=1`, etc.) currently exist. If we need runtime injection, we'd have to add one in dev/test builds.
- **No combat e2e coverage**. Grep of `e2e/specs/` for "combat" returns only a `combatPanel` selector in [e2e/helpers/pages/gameplay.page.js:29](e2e/helpers/pages/gameplay.page.js#L29) — never exercised by a spec.

## Combat Code Paths (current)

| File | LOC | Purpose |
|---|---|---|
| [src/components/gameplay/CombatPanel.jsx](src/components/gameplay/CombatPanel.jsx) | 477 | UI shell, action buttons, log, turn indicator |
| [src/components/gameplay/CombatLogEntry.jsx](src/components/gameplay/CombatLogEntry.jsx) | 285 | Pure lift: log row rendering + tooltips |
| [src/hooks/useCombatResolution.js](src/hooks/useCombatResolution.js) | 208 | End/surrender/truce/defeat handlers merged into one hook |
| [src/hooks/useEnemyTurnResolver.js](src/hooks/useEnemyTurnResolver.js) | 52 | Auto-resolves enemy turns on 2.5s delay (`AI_TURN_DELAY_MS`) |
| [src/hooks/useCombatResultSync.js](src/hooks/useCombatResultSync.js) | ? | Non-host consumer of `combat.lastResults`, keyed on `lastResultsTs` |
| [src/hooks/useCombatHostResolve.js](src/hooks/useCombatHostResolve.js) | ~40 | Host resolves remote player manoeuvre (replaces static-leak pattern) |
| [src/hooks/useMultiplayerCombatSceneDetect.js](src/hooks/useMultiplayerCombatSceneDetect.js) | ? | Detects `combatUpdate` in scenes → creates MP combat state |
| [src/hooks/useCombatCommentary.js](src/hooks/useCombatCommentary.js) | 133 | Combat commentary emission rate logic |
| [src/hooks/useCombatAudio.js](src/hooks/useCombatAudio.js) | 305 | SFX/music for combat events |
| [src/services/combatEngine.js](src/services/combatEngine.js) | 824 | Pure-function engine: dice, damage, margin, state transitions |

---

## Approach — Hybrid Vitest + Playwright

The combat engine and resolution hooks are **pure game logic** that doesn't need a browser to test. Playwright is expensive (seconds per test, requires backend+MongoDB, prone to flake). Strategy:

- **Vitest unit tests** — cover the engine + hooks in isolation. Fast, deterministic, high leverage. Engine's pure functions + hooks via `renderHook` from `@testing-library/react-hooks` (or `@testing-library/react`'s `renderHook`).
- **Playwright smoke tests** — cover the UI wiring: CombatPanel renders, buttons fire, log populates, end-state screens appear. One or two happy-path tests are enough to catch regressions in the panel shell. Not the place to cover every engine branch.

This is the opposite of what a naive "combat needs e2e coverage" reading suggests. Playing whack-a-mole with Playwright on engine logic is low ROI.

---

## Phase Plan

### Phase 0 — Infrastructure (foundation, blocks everything else)

1. **Seed helper** — `e2e/helpers/seedCombatCampaign.js`
   - Takes `{ token, characters, enemies, initiative, round, timeline }` options
   - POSTs a character via `POST /characters` (or picks an existing one), then POSTs a campaign via `POST /campaigns` with `coreState` containing a combat-active state
   - Returns `{ campaignId, characterId, shareToken }`
   - Fixture shape: 2 characters (1 player, 1 NPC ally), 2 enemies (1 weak @ 5 HP, 1 strong @ 20 HP), player initiative first
   - Reuses `api-mocks.fixture.js` token

2. **Backend SSE interceptor** — extend `mockAI` fixture with `interceptBackendSceneStream(fn)`
   - `page.route('**/ai/campaigns/*/generate-scene-stream', ...)`
   - Needs to write SSE-shaped response: `event: intent\ndata: {...}\n\nevent: complete\ndata: {...}\n\n`
   - Parameterizable per test to return different scene payloads (victory aftermath, defeat, peaceful)
   - Also needed: `interceptBackendCampaignStream(fn)` for campaign creation (future)

3. **Combat page object** — extend [e2e/helpers/pages/gameplay.page.js](e2e/helpers/pages/gameplay.page.js)
   - `combatPanel.visible()`, `combatPanel.clickAttack(target)`, `combatPanel.log`, `combatPanel.endCombat()`, `combatPanel.surrender()`
   - Selectors: `[data-testid="combat-panel"]`, `[data-testid="combat-attack-target-{enemyId}"]`, `[data-testid="combat-log-entry"]`
   - **Prerequisite**: add `data-testid` attributes to [CombatPanel.jsx](src/components/gameplay/CombatPanel.jsx) and [CombatLogEntry.jsx](src/components/gameplay/CombatLogEntry.jsx). Audit what exists first — some may already be there.

4. **Vitest combat fixture** — `src/test-fixtures/combatState.js`
   - Exports `buildCombatState({ ...overrides })` returning a fully-formed `combat` slice
   - Used by both Vitest hook tests and the seed helper (single source of truth)

### Phase 1 — Vitest hook tests (highest ROI)

Target file: `src/hooks/useCombatResolution.test.js` (new).

1. **Victory flow** — all enemies at 0 HP → `endCombat('victory')` called with correct stateChanges, `forceStatus !== 'dead'`, generateScene invoked with aftermath-shaped payload
2. **Defeat flow** — player wounds ≥ maxWounds, `forceStatus = 'dead'` in stateChanges, generateScene with defeat narration
3. **Surrender flow** — explicit dispatch, stateChanges reflect surrender, disposition shift
4. **Truce flow** — explicit dispatch, no HP/wound changes, combat exits cleanly
5. **`pickStateChanges`** helper — unit-test the branch picker directly (it's exported per the refactor note)
6. **`soloPerCharForServer`** — unit-test the character serialization utility

Target file: `src/hooks/useEnemyTurnResolver.test.js` (new).

1. **Delay respected** — fake timers, verify no resolution before `AI_TURN_DELAY_MS`
2. **First-round enemy initiative** — enemy has higher initiative, resolver fires first
3. **MP host gating** — non-host doesn't resolve
4. **Round transitions** — resolver cycles through remaining enemies

Target file: `src/hooks/useCombatResultSync.test.js` (new).

1. **New `lastResultsTs`** triggers apply
2. **Duplicate ts** no-ops
3. **Stale ts after reconnect** no-ops
4. **Host bypasses** — `useCombatResultSync` only runs on non-host

Target file: `src/services/combatEngine.test.js` (new or extend existing if present).

1. **Damage formula** — `damage = Siła + weapon - Wytrzymałość - AP`, boundaries: zero armor, full armor, negative result
2. **Margin calculation** — d50 vs attribute+skill, success/failure/critical thresholds
3. **Szczęście auto-success** — X% override branch
4. **Initiative ordering** — ties, zero-speed, etc.

Aim for ~30-40 unit tests total across these files. Each fast (<10ms). Together they buy confidence in the engine and resolution logic without touching the browser.

### Phase 2 — Playwright smoke tests (wiring verification)

Target file: `e2e/specs/combat.spec.js` (new).

1. **Solo victory happy path**
   - Seed combat campaign with 1 weak enemy (5 HP)
   - Open gameplay, assert CombatPanel visible
   - Click attack → weak enemy
   - Assert log gets an entry within 2s
   - Enemy dies → assert victory screen appears
   - Mock backend SSE to return aftermath scene
   - Assert navigation back to scene panel with aftermath narration

2. **Solo defeat happy path**
   - Seed combat with player at 1 HP, 1 strong enemy with guaranteed initiative
   - Open gameplay
   - Wait for enemy auto-turn (~3s)
   - Assert log shows enemy attack + player death entry
   - Assert defeat screen appears

3. **Enemy-first round visible**
   - Seed combat with enemy initiative > player
   - Open gameplay
   - Assert first log entry (within ~3s) is an enemy action, not a player action
   - Click player attack after
   - Assert turn transitions correctly

That's **3 Playwright tests**. Deliberately minimal. Each should run in ~5-10s. Their job is to catch regressions in: panel rendering, button wiring, log population, victory/defeat screens, auto-turn resolver delay. Anything else is better covered in Vitest.

### Phase 3 — MP combat (deferred)

Requires two browser contexts (host + guest), shared room code, synchronized state. High complexity, high flake risk. Skip until Phase 1-2 are stable AND there's a concrete MP combat bug to reproduce.

If/when needed:

1. **MP host resolves remote manoeuvre** — 2 contexts, guest submits action, host receives, resolves
2. **Non-host receives results** — host resolves, guest's `useCombatResultSync` applies them
3. **Joining in-progress combat** — guest joins when `combat.active=true`

### Phase 4 — Combat commentary coverage (deferred, Vitest)

`useCombatCommentary.js` emission rate logic. Vitest, not Playwright. Only worth doing if the commentary feature gets modified post-merge.

---

## Decisions to Make Before Execution

1. **State injection strategy for Playwright** — confirmed: seed via backend API (`POST /characters` + `POST /campaigns`), not localStorage or window hook. Uses production code paths. Slightly slower but realistic.

2. **SSE mock shape** — the backend sends events as `event: intent`, `event: context_ready`, `event: chunk`, `event: complete`. The mock needs to emit at least `intent` (empty) and `complete` (final payload) to satisfy the frontend parser. Check [src/services/aiStream.js](src/services/aiStream.js) (`callBackendStream`) for the exact expected shape before writing the mock — **this is the #1 risk for Phase 0.2**.

3. **Character ownership constraint** — after Phase 1A#2 of the hardening plan, `JOIN_ROOM` requires `characterId` pointing at a DB character owned by the user. The seed helper must create a real `Character` row, not inline data. Single-player (solo campaign) doesn't go through JOIN_ROOM so it's fine — but if Phase 3 MP tests are added later, they need to seed a DB character first.

4. **data-testid coverage** — audit [CombatPanel.jsx](src/components/gameplay/CombatPanel.jsx) and [CombatLogEntry.jsx](src/components/gameplay/CombatLogEntry.jsx) for existing `data-testid` attributes. Add any missing ones as part of Phase 0.3. Keep the set small — 5-6 stable IDs beat 20 brittle ones.

5. **Fake timers in Vitest** — `useEnemyTurnResolver` uses `setTimeout(AI_TURN_DELAY_MS)`. Tests need `vi.useFakeTimers()` + `vi.advanceTimersByTime(2500)`. Confirm the hook uses standard setTimeout (not RAF or worker-based), or the fake timers won't catch it.

---

## Scope Estimate

| Phase | Effort | Value |
|---|---|---|
| 0 (infra) | 2-3h | Unblocks everything. Highest priority. |
| 1 (Vitest) | 3-4h | Highest ROI. Engine + hook coverage. |
| 2 (Playwright smoke) | 2-3h | Medium ROI. Wiring verification. |
| 3 (MP combat) | 4-6h | Low ROI right now. Deferred. |
| 4 (commentary) | 1-2h | Low ROI until feature touched. Deferred. |

**Recommended first session**: Phase 0 + Phase 1. Foundation + 80% of the value in one sitting. Phase 2 can follow a day later once Phase 1 is green.

---

## Out of Scope

- Backend scene generation quality or determinism (that's unit-testable in `sceneGenerator.js`)
- AI provider fallback logic
- Real LLM calls (ever — these are regression tests, not acceptance tests)
- Perf/load testing
- Visual regression / screenshot tests

---

## Related

- [plans/merge_status.md](plans/merge_status.md) — current merge state, this work is part of the post-merge backlog
- [knowledge/concepts/frontend-refactor-regressions.md](knowledge/concepts/frontend-refactor-regressions.md) — the gap this plan addresses
- [knowledge/concepts/bestiary.md](knowledge/concepts/bestiary.md) — encounter/combat context
- `shimmering-inventing-cosmos.md` (session plan that originally flagged the gap)
