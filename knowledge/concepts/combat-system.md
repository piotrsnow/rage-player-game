# Combat System

Turn-based tactical combat on a linear 0-20 position strip. d50 resolution, margin-based. Same engine powers solo and multiplayer — MP host runs it locally and syncs results, guests see the results dispatched back through the same reducer.

## Files

### Engine

- [src/services/combatEngine.js](../../src/services/combatEngine.js) — the whole tactical engine: `startCombat`, `resolveManoeuvre`, `resolveEnemyTurns`, `getCurrentTurnCombatant`, `endCombat`. d50 attack/defense, damage calc (`Siła + weapon - Wytrzymałość - AP`), rarity modifiers, position/movement, initiative. Also delegates to `magicEngine.castSpell()` for spell attacks.
- [src/services/magicEngine.js](../../src/services/magicEngine.js) — mana-based spellcasting, spell trees, scroll handling
- [src/services/mechanics/d50Test.js](../../src/services/mechanics/d50Test.js) — shared d50 test resolver (`resolveD50Test`)

### State

- [src/stores/handlers/combatHandlers.js](../../src/stores/handlers/combatHandlers.js) — reducer actions: `START_COMBAT`, `UPDATE_COMBAT`, `END_COMBAT`, log append, turn advance
- Combat state shape (in `gameState.combat`):
  ```js
  {
    active: boolean,
    round: number,
    turnIndex: number,          // index into combatants[]
    combatants: [
      { id, name, type: 'player'|'enemy', attributes, skills, inventory,
        weapons, equipped, armour, conditions, wounds, maxWounds,
        isDefeated, position, movementUsed, movementAllowance, traits }
    ],
    log: [{ round, text, outcome, details }],
    lastResults: [...],         // MP sync slot
    lastResultsTs: number,
    reason: 'ambush' | 'duel' | ...,
  }
  ```

### UI

- [src/components/gameplay/CombatPanel.jsx](../../src/components/gameplay/CombatPanel.jsx) — main combat UI (~477L). Orchestrates panels, header, action handlers.
- [src/components/gameplay/combat/](../../src/components/gameplay/combat/) — sub-components: header, action rows, detail panel, combat log builders
- [src/components/gameplay/CombatCanvas.jsx](../../src/components/gameplay/CombatCanvas.jsx) — visual position strip
- [src/components/gameplay/CombatLogEntry.jsx](../../src/components/gameplay/CombatLogEntry.jsx) — log entry renderer (hit/miss/critical/fled/defeat/defensive)

### Hooks (pure factories, all unit-tested)

- [src/hooks/useCombatResolution.js](../../src/hooks/useCombatResolution.js) — `buildCombatResolutionHandlers(deps)` — end-combat handlers (victory/defeat/surrender/truce), solo + MP variants
- [src/hooks/useEnemyTurnResolver.js](../../src/hooks/useEnemyTurnResolver.js) — `shouldScheduleEnemyTurn`, `resolveEnemyTurnStep` — auto-advances enemy turns after 2.5s
- [src/hooks/useCombatResultSync.js](../../src/hooks/useCombatResultSync.js) — `planCombatResultDrain` — MP guest consumes host-computed results from `combat.lastResults`
- [src/hooks/useCombatHostResolve.js](../../src/hooks/useCombatHostResolve.js) — MP host handler for remote manoeuvres
- [src/hooks/useMultiplayerCombatSceneDetect.js](../../src/hooks/useMultiplayerCombatSceneDetect.js) — detects `combatUpdate` in fresh scenes → creates MP combat state → `mp.syncCombatState(state)`
- [src/hooks/useCombatAudio.js](../../src/hooks/useCombatAudio.js), [useCombatCommentary.js](../../src/hooks/useCombatCommentary.js) — SFX + AI-generated battle commentary

All resolution hooks use the **pure-factory pattern** — see [patterns/hook-pure-factory-testing.md](../patterns/hook-pure-factory-testing.md). The pure factories (`buildXHandlers`, `shouldX`, `planX`, `resolveXStep`) are named exports tested directly without React.

## Backend-side combat

- [backend/src/services/sceneGenerator/enemyFill.js](../../backend/src/services/sceneGenerator/enemyFill.js) — `fillEnemiesFromBestiary` — when AI emits `enemyHints` in `combatUpdate.stateChanges`, backend expands them into full combatant objects from the bestiary (stats, skills, equipment, rarity-scaled)
- [backend/src/services/sceneGenerator/shortcuts.js](../../backend/src/services/sceneGenerator/shortcuts.js) — `tryCombatFastPath` — bypasses the large model for trivial "clear combat" outcomes. Nano returns `clear_combat: true`, backend generates a short narrative and ends combat without the premium call.
- [backend/src/data/equipment/bestiary.js](../../backend/src/data/equipment/bestiary.js) — 36 units, 11 races, encounter budget system
- [shared/domain/combatXp.js](../../shared/domain/combatXp.js) — `computeCombatCharXp` — XP gained per combat based on enemy tier

## Bestiary system

Encounter budget: `THREAT_COSTS = { trivial: 1, low: 2, medium: 4, high: 8, deadly: 16 }`. AI emits `{count, budget, maxDifficulty}` and backend picks a group via `selectBestiaryEncounter({location, budget, maxDifficulty, count, race})`. `applyAttributeVariance()` adds ± random variance per attribute at spawn time.

Skill caps per difficulty: trivial 1-3, low 1-5, medium 1-8, high 1-12, deadly 1-15+.

**Disposition guard:** attacking NPCs with disposition > 0 takes a -30 modifier; combat only escalates when disposition ≤ 0. Prevents the player from triggering combat against allies by accident.

**pendingThreat:** large model can mark "something is approaching" in `stateChanges.pendingThreat` — backend knows what to pull from the bestiary when combat actually starts.

## Solo vs multiplayer flow

**Solo:**
1. `useCombatResolution` handler runs `combatEngine.resolveManoeuvre` locally
2. Reducer dispatches `UPDATE_COMBAT`
3. `useEnemyTurnResolver` auto-schedules the next enemy turn
4. On victory/defeat/surrender/truce: `generateScene(...)` called with the combat result for aftermath narration

**Multiplayer:**
- **Host** runs the engine locally (same as solo), then broadcasts `combat_sync` via WS after each resolve. `combat.lastResults` + `combat.lastResultsTs` carry the per-resolve diff.
- **Guests** receive the sync, dispatch `UPDATE_COMBAT`. `useCombatResultSync.planCombatResultDrain` reads `combat.lastResults` vs `lastProcessedTs` ref and appends new log entries without double-processing.
- Host converts combat results into scene aftermath the same way solo does.

## When debugging combat

1. **"Damage is wrong."** `combatEngine.js` → `resolveManoeuvre`. Check the rarity modifiers (`RARITY_BONUS_SCALE`, `RARITY_DR_SCALE`), `getWeaponData`, armour AP calculation, and the d50 margin vs `DIFFICULTY_THRESHOLDS`.
2. **"Enemy turn didn't fire."** `useEnemyTurnResolver.shouldScheduleEnemyTurn` — check the combatOver gate, the 2.5s setTimeout, and the `isMultiplayer && !isHost` early return.
3. **"MP guest sees stale combat state."** `useCombatResultSync.planCombatResultDrain` — the `lastResultsTs` ref isn't advancing. Verify the host is setting a new timestamp on each sync.
4. **"Enemy spawned with wrong stats."** Backend `fillEnemiesFromBestiary` — check `enemyHints` shape in the AI response schema (`src/services/aiResponse/schemas.js`) and the bestiary entry's stat ranges.
5. **"Fast-path fired when it shouldn't have."** Nano classified the intent as `clear_combat`. Check `intentClassifier.js` nano prompt + the fast-path heuristic in `shortcuts.js`.
6. **"Player died but game didn't register."** `useCombatResolution.handleEndCombat` → `stateChanges.forceStatus = 'dead'` path → `characterHandlers`.

## Testing

- **Unit tests:** `src/hooks/useCombatResolution.test.js` (11), `useEnemyTurnResolver.test.js` (9), `useCombatResultSync.test.js` (9), `src/services/combatEngine.test.js`, `src/services/mechanics/*.test.js`
- **Fixtures:** [src/test-fixtures/combatState.js](../../src/test-fixtures/combatState.js) — `buildCombatState({overrides})`, `buildCombatSummary({overrides})`. Default combatant is the RPGon baseline character (all attrs 1, szczęście 0).
- **Playwright smoke:** `e2e/specs/combat.spec.js` seeds a combat-active campaign via `GET /v1/campaigns/:id` mock (see [patterns/e2e-campaign-seeding.md](../patterns/e2e-campaign-seeding.md))

Before changing combat resolution logic, run: `npx vitest run src/hooks/useCombat src/hooks/useEnemy src/services/combatEngine.test.js`.

## Related

- [rpgon-mechanics.md](rpgon-mechanics.md) — d50 resolution, szczęście auto-success, the pre-rolled dice fallback
- [multiplayer.md](multiplayer.md) — MP sync, room manager, WS handlers
- [patterns/hook-pure-factory-testing.md](../patterns/hook-pure-factory-testing.md) — how combat hooks are tested
