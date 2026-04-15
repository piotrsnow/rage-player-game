# RPGon Mechanics (custom d50 system)

Custom RPG system replacing WFRP. Full specification in [RPG_SYSTEM.md](../../RPG_SYSTEM.md) at the repo root; this file is the **code pointer** — where each mechanic is implemented, how FE and BE agree, and how to debug when dice go wrong.

## Core rules (summary)

- **Dice:** d50 (not d100). Roll d50 vs `attribute + skill + modifiers` on a target of `<= target`. Roll 1 = crit success, roll 50 = crit failure.
- **6 attributes** (1-25 scale): `sila`, `inteligencja`, `charyzma`, `zrecznosc`, `wytrzymalosc`, `szczescie`. Default floor character has everything at 1 except `szczescie` at 0.
- **Skills:** levels 0-25, each tied to one attribute. ~31 skills after the WFRP-to-RPGon consolidation (list in `rpgSystem.js` `SKILLS`).
- **Magic:** 9 spell trees, mana-based (no casting test). Spells learned from scrolls. Cost 1-5 mana per spell.
- **Combat:** d50-based, `damage = Siła + weapon - Wytrzymałość - AP`. Margin of success replaces WFRP's SL.
- **Szczęście:** auto-success chance on any roll — `rollLuckCheck(szczescie, rollPercentage)` in `shared/domain/luck.js`. The szczęście attribute **is X%** chance of auto-success.
- **Currency:** 3-tier PL denominations — Złota/Srebrna/Miedziana Korona. Rates: `1 ZK = 20 SK = 240 MK`, `1 SK = 12 MK`. Full rules in [decisions/currency-three-tier-pl.md](../decisions/currency-three-tier-pl.md).
- **Titles from achievements:** no classes/careers. Character identity emerges from achievement-unlocked titles. Full rules in [decisions/titles-from-achievements.md](../decisions/titles-from-achievements.md).

## Data files

- [src/data/rpgSystem.js](../../src/data/rpgSystem.js) — core: `ATTRIBUTES`, `ATTRIBUTE_KEYS`, `ATTRIBUTE_NAMES`, `SKILLS`, `getSkillAttribute`, `DIFFICULTY_THRESHOLDS`, `STATE_CHANGE_LIMITS`, `DIFFICULTY_SKILL_XP`, `COMBAT_SKILL_XP`, `WEAPON_SKILL_MAP`, `calculateMaxWounds` (`wytrzymalosc * 2 + 10`), XP formulas, training cooldowns
- [src/data/rpgMagic.js](../../src/data/rpgMagic.js) — 9 spell trees, scroll mechanics, mana progression
- [src/data/rpgFactions.js](../../src/data/rpgFactions.js) — faction definitions with Polish names
- [src/utils/rpgTranslate.js](../../src/utils/rpgTranslate.js) — PL↔EN labels for attributes, skills, spells

## Resolution engines

### Deterministic mechanics (FE)

- [src/services/mechanics/index.js](../../src/services/mechanics/index.js) — `resolveMechanics(playerAction, state, options)` orchestrator. Called from `useSceneGeneration` BEFORE the AI call, so the AI receives pre-resolved outcomes and just narrates.
- [src/services/mechanics/skillCheck.js](../../src/services/mechanics/skillCheck.js) — `inferActionContext` (keyword → attribute) + `resolveSkillCheck` (full dice resolution). Difficulty tiers feed into the DIFFICULTY_THRESHOLDS table.
- [src/services/mechanics/d50Test.js](../../src/services/mechanics/d50Test.js) — `resolveD50Test(target, modifiers, szczescie)` — the one-stop function every dice roll routes through.
- [src/services/mechanics/creativityBonus.js](../../src/services/mechanics/creativityBonus.js) — `calculateCreativityBonus` — rewards creative player input (custom action text) with a modifier bonus, capped at `CREATIVITY_BONUS_MAX`.
- [src/services/mechanics/momentumTracker.js](../../src/services/mechanics/momentumTracker.js) — `calculateNextMomentum` (SL × 5, decay, clamp -10/+10). Momentum enters the **current** roll as a bonus; updates **after** the scene for the next roll.
- [src/services/mechanics/dispositionBonus.js](../../src/services/mechanics/dispositionBonus.js) — NPC disposition modifiers for social rolls and combat initiation guards.
- [src/services/mechanics/restRecovery.js](../../src/services/mechanics/restRecovery.js) — 10% maxHP per hour slept.

### Backend dice (for freeform scenes)

- [backend/src/services/diceResolver.js](../../backend/src/services/diceResolver.js) — shared d50 helpers: `rollD50`, `clamp`, `resolveBackendDiceRoll`, `resolveBackendDiceRollWithPreRoll`, `generatePreRolls`, `CREATIVITY_BONUS_MAX`, `SKILL_BY_NAME`, `DIFFICULTY_THRESHOLDS`, `getSkillLevel`
- [backend/src/services/sceneGenerator/diceResolution.js](../../backend/src/services/sceneGenerator/diceResolution.js) — scene-gen specific: `applyCreativityToRoll`, `isCreativityEligible`, `resolveModelDiceRolls`, `calculateFreeformSkillXP`

### Shared domain (FE + BE)

- [shared/domain/luck.js](../../shared/domain/luck.js) — `rollLuckCheck(szczescie, rollPercentageFn)`, `isLuckySuccess`
- [shared/domain/diceRollInference.js](../../shared/domain/diceRollInference.js) — `resolveDiceRollAttribute` — maps skill/action text to an RPGon attribute. Used by both FE (scene state hook) and BE (intent classifier). Note: `src/services/diceRollInference.js` has legacy-alias extras — that copy should eventually fold into the shared one.
- [shared/domain/combatIntent.js](../../shared/domain/combatIntent.js) — `detectCombatIntent` + `COMBAT_INTENT_REGEX` (Polish conjugations, weapon-draw patterns). Used by FE scene state hook, BE `intentClassifier`, BE `sceneGenerator/userPrompt`.
- [shared/domain/combatXp.js](../../shared/domain/combatXp.js) — `computeCombatCharXp`
- [shared/domain/stateValidation.js](../../shared/domain/stateValidation.js) — 12 validators + `STATE_CHANGE_LIMITS` for AI-emitted state changes

## Pre-rolled dice fallback (for freeform player actions)

The nano intent classifier misses ~20% of freeform actions that actually need a skill check. Without a fallback, those actions would resolve narratively by the large model (= unreliable). The fallback ships 3 pre-rolled d50 values in the large-model prompt, reconciles with mechanical rules after the response.

### How it works

- Backend always generates 3 pre-rolls at scene start: `generatePreRolls()` — each is `{d50, luckySuccess}` (pre-resolved for szczęście auto-success).
- **If nano detected a roll** → `preRolls[0]` is used for the detected check; remaining 2 go into the model prompt for self-resolution.
- **If nano didn't detect** → all 3 go into the model prompt with `base = d50 + momentum`.
- Model returns minimal `{skill, difficulty, success}` entries in `stateChanges.diceRolls` (array, not singular).
- Backend resolves the full roll via `resolveModelDiceRolls()` with reconciliation:
  - If model outcome matches backend calculation → use the real pre-roll.
  - If model disagrees → nudge the d50 to a margin near 0 (barely pass/fail) to keep the narrative consistent with mechanical truth.
- Difficulty thresholds: `easy=20, medium=35, hard=50, veryHard=65, extreme=80`.

### Files

- `generatePreRolls()` — [backend/src/services/diceResolver.js](../../backend/src/services/diceResolver.js)
- `resolveModelDiceRolls()` — [backend/src/services/sceneGenerator/diceResolution.js](../../backend/src/services/sceneGenerator/diceResolution.js)
- Consumed in `generateSceneStream.js` orchestrator after the AI response parses

### Limits

- **Max 3 rolls per scene.** The large model can't self-resolve more checks per scene than we budgeted pre-rolls for.
- **Array shape.** `stateChanges.diceRolls` (array), not legacy singular `diceRoll`.

### When debugging fallback dice

1. **"Scene has dice but none shown in UI."** Model emitted `diceRolls: [...]` but they didn't reconcile. Check `resolveModelDiceRolls` logs — likely the skill name couldn't be mapped.
2. **"Dice outcome disagrees with the narrative."** That's the reconciliation kicking in — narrative says success but mechanics say fail (or vice versa). d50 gets nudged to margin ~0.
3. **"Pre-rolls exhausted."** More than 3 skill checks in one scene. Expand the pre-roll pool or (better) tune the nano classifier to catch the obvious checks before they leak into the large model.

## State change limits

`STATE_CHANGE_LIMITS` in `rpgSystem.js` + shared validator helpers enforce caps on every AI-emitted state change:

- XP per scene cap
- Money delta cap (can't gain 10,000 gold in one scene)
- Skill level delta cap
- Attribute change cap
- Wound delta cap
- Item count caps (no stuffing 50 items into inventory from one scene)
- Codex entry size cap

Validator lives in [src/services/stateValidator.js](../../src/services/stateValidator.js) (solo path) + [backend/src/services/stateValidator.js](../../backend/src/services/stateValidator.js) (multiplayer path). Both import the same helpers from `shared/domain/stateValidation.js`. When adding a new state change field, update the shared validator + the handler in `applyStateChangesHandler.js`.

## When debugging mechanics

1. **"Wrong attribute used for a skill."** `SKILLS` definition in `rpgSystem.js` — each skill has `attribute: '...'`. Check the entry.
2. **"Difficulty tier feels wrong."** `DIFFICULTY_THRESHOLDS` in `rpgSystem.js` — adjustable per system rules.
3. **"Szczęście auto-success not firing."** `rollLuckCheck` is only called by engines that know about it. If you're adding a new resolution path, call it explicitly.
4. **"maxWounds wrong after attribute change."** `characterMutations.js` → `calculateMaxWounds(wytrzymalosc) = wytrzymalosc * 2 + 10`. Any handler that changes `wytrzymalosc` must recalc maxWounds. `applyCharacterStateChanges` does this; don't bypass it.
5. **"Momentum feels unresponsive."** Momentum updates AFTER the scene — check `calculateNextMomentum` is called in the post-scene flow, not during resolution.

## Related

- [RPG_SYSTEM.md](../../RPG_SYSTEM.md) — full system spec (the authoritative rules document)
- [combat-system.md](combat-system.md) — combat resolution, damage calc, rarity modifiers
- [decisions/currency-three-tier-pl.md](../decisions/currency-three-tier-pl.md) — currency rules
- [decisions/titles-from-achievements.md](../decisions/titles-from-achievements.md) — character identity system
- [concepts/bestiary.md](bestiary.md) — enemy stats, encounter budget system
