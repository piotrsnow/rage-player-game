# Bestiary

RPGon-native creature catalog with encounter budgeting and fast-path combat support. Lives in the backend and is consumed by both scene generation (enemy spawning) and combat (stat fill).

## Files

- [backend/src/data/equipment/bestiary.js](../../backend/src/data/equipment/bestiary.js) — 36 entries, 11 races (ludzie, orkowie, gobliny, nieumarli, zwierzęta, demony, trolle, pająki, krasnoludy, elfy, niziołki). Native RPGon attributes 1-25.
- [backend/src/data/equipment/index.js](../../backend/src/data/equipment/index.js) — exports: `searchBestiary`, `selectBestiaryEncounter`, `getBestiaryLocationSummary`, `applyAttributeVariance`, `THREAT_COSTS`
- [backend/src/services/sceneGenerator/enemyFill.js](../../backend/src/services/sceneGenerator/enemyFill.js) — `fillEnemiesFromBestiary` — expands AI-emitted `enemyHints` into full combatant objects

## Encounter budget system

`THREAT_COSTS = { trivial: 1, low: 2, medium: 4, high: 8, deadly: 16 }`

AI emits a triple in `combatUpdate.stateChanges`:

```js
{
  combatUpdate: {
    enemyHints: ['goblin scout', 'goblin warrior'],
    count: 3,
    budget: 8,             // points of enemy threat
    maxDifficulty: 'high'  // hardest individual enemy tier
  }
}
```

Backend `selectBestiaryEncounter({location, budget, maxDifficulty, count, race})` picks a matching group that fits the budget. Enemies get random attribute variance via `applyAttributeVariance()` at spawn time.

### Skill caps per difficulty

- trivial: 1-3
- low: 1-5
- medium: 1-8
- high: 1-12
- deadly: 1-15+

Caps the enemy's skill levels on spawn so a "deadly ogre" actually feels deadly while a "trivial goblin" stays beatable.

## Fast-path combat

When nano intent classifier sets `clear_combat: true`, `tryCombatFastPath` (in [backend/src/services/sceneGenerator/shortcuts.js](../../backend/src/services/sceneGenerator/shortcuts.js)) bypasses the large model entirely:

1. Matches the target NPC (`findCombatTargetNpc`)
2. Runs combat resolution server-side (trivial victory/defeat heuristic)
3. Calls `generateShortNarrative` for a 2-3 sentence wrap-up
4. Emits `complete` event directly — saves ~5-15s and the premium model call

Only fires for genuinely trivial encounters (e.g. "I kill the wounded goblin").

## Disposition guard

Attacking NPCs with `disposition > 0` takes a **−30 modifier** on the attack roll. Combat only escalates naturally when `disposition ≤ 0`. Prevents the player from accidentally triggering lethal combat against allies by sloppy phrasing.

## pendingThreat

Large model can flag "something is approaching" in `stateChanges.pendingThreat` — backend stashes what to pull from the bestiary when combat actually starts. Lets the AI foreshadow threats across multiple scenes without committing to specific enemies yet.

## Prompt hooks

- `getBestiaryLocationSummary()` feeds the scene prompt with per-location enemy summaries so the AI picks race-appropriate foes.
- The system prompt enumerates `BESTIARY_LOCATIONS` and `BESTIARY_RACES` so the AI stays inside the catalog when naming enemies.

## When debugging bestiary issues

1. **"AI names an enemy that doesn't exist."** It's naming outside the catalog. Tighten the enum in `systemPrompt.js` or add an alias map in `enemyFill.js` (it has name-matching logic already).
2. **"Enemies too hard/easy."** `applyAttributeVariance` range or skill caps per difficulty. Tune in `bestiary.js`.
3. **"Fast-path fired for a serious fight."** Nano classified `clear_combat: true` too eagerly. Check the nano prompt in `intentClassifier.js` — the fast-path heuristic should require explicit dominance (massively outmatched enemy or coup de grâce scenario).
4. **"Combat started despite disposition > 0."** Disposition guard relies on the attack modifier. Check `combatEngine.resolveManoeuvre` is reading disposition correctly.

## Related

- [combat-system.md](combat-system.md) — the engine that consumes bestiary-filled combatants
- [scene-generation.md](scene-generation.md) — fast-path integration in the pipeline
