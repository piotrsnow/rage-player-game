# Decision — Custom RPG system (RPGon), not WFRP

## Context

The original prototype used Warhammer Fantasy Roleplay 4th Edition mechanics: d100 characteristic tests, Success Levels, careers, talents, fate/fortune/resolve/resilience, critical wounds, WFRP4e bestiary, WFRP equipment catalog. It worked mechanically but had three problems:

1. **Licensing.** WFRP is an owned IP. Shipping a product using its rules would require a license, which isn't available for a solo pre-prod dev.
2. **System complexity misaligned with AI-driven play.** WFRP's depth (talents trees, career progressions, SL math) was designed for tabletop with a human GM who can reference books. An AI GM with a bounded prompt budget can't meaningfully track that much state.
3. **WFRP mechanics had sharp corners that fought the "learn by doing" vision.** Advances cost XP locked behind careers; advancing a skill the player used 50 times still required sitting in a trainer's shop.

## Options considered

### A) License WFRP

- ✓ Well-known system, ready-made content
- ✗ Licensing unavailable for solo pre-prod
- ✗ Doesn't solve the depth/prompt-budget mismatch
- ✗ Doesn't solve the progression friction

### B) Fork WFRP to an SRD (e.g. OSR retroclone)

- ✓ Legally free
- ✗ Still inherits the depth/progression issues
- ✗ Name recognition gone, so no content shortcut

### C) Build a custom system — CHOSEN

A purpose-built RPG designed around AI-GM play:

- **d50 (not d100).** Cleaner math, tighter margins, easier to narrate "almost succeeded" vs "crushed it."
- **6 attributes (1-25).** Simple, bounded, easy to reason about in a prompt. `sila`, `inteligencja`, `charyzma`, `zrecznosc`, `wytrzymalosc`, `szczescie`.
- **Skills tied to one attribute each.** `getSkillLevel + attribute + modifiers` vs `d50`. No career gates.
- **Learn-by-doing XP.** Every successful skill use grants skill XP. Skills level naturally without a trainer. Character levels accumulate from skill level-ups (Oblivion-style).
- **Szczęście as attribute AND auto-success chance.** The szczęście attribute value IS the % chance of auto-success on any roll. Elegant and consistent.
- **Mana-based magic.** No casting test. 9 spell trees, mana pool, spells learned from scrolls, costs 1-5 mana per spell.
- **Margin instead of SL.** `d50 - target` → positive = success, bigger positive = better. Used for damage calc, skill tier labels, everything.
- **Titles from achievements, not careers.** Character identity emerges from achievement-unlocked titles; AI picks relevant titles contextually ("greets the merchant as Kupiec, the guard as Smokobójca").
- **Three-tier currency.** Złota / Srebrna / Miedziana Korona. `1 ZK = 20 SK = 240 MK`. Simple enough to prompt, detailed enough to feel like a real economy.
- **Native bestiary.** 36 units, 11 races, encounter budget system (trivial=1, low=2, medium=4, high=8, deadly=16).

What was explicitly dropped from WFRP:

- Careers, talents, fate/fortune/resolve/resilience, critical wounds table, channelling, advantage, SL math

## Consequences

- **Full creative control.** Can tune the system to fit AI-GM pacing without fighting rules.
- **All code had to be migrated from WFRP.** That migration is done (`rpgSystem.js`, `rpgMagic.js`, `rpgFactions.js`, `multiplayerAI`, `diceRollInference`, bestiary). Only `wfrpEquipment.js` lingers on FE and BE as a legacy equipment catalog pending a native replacement.
- **No content shortcut.** The spec lives in `RPG_SYSTEM.md` and the code under `src/data/rpg*.js` — not a published splatbook.
- **Authentic Polish naming.** Attributes, skills, spell trees, factions all use Polish names. The game ships in Polish; English translations exist for accessibility but the canonical vocabulary is PL.

## The spec

Full canonical rules: [RPG_SYSTEM.md](../../RPG_SYSTEM.md) at the repo root.

Code layer that implements it: [src/data/rpgSystem.js](../../src/data/rpgSystem.js), [rpgMagic.js](../../src/data/rpgMagic.js), [rpgFactions.js](../../src/data/rpgFactions.js), [src/utils/rpgTranslate.js](../../src/utils/rpgTranslate.js).

Mechanics engines: [src/services/mechanics/](../../src/services/mechanics/) + [src/services/combatEngine.js](../../src/services/combatEngine.js) + [src/services/magicEngine.js](../../src/services/magicEngine.js).

Debugging overview: [concepts/rpgon-mechanics.md](../concepts/rpgon-mechanics.md).

## Related

- [concepts/rpgon-mechanics.md](../concepts/rpgon-mechanics.md) — code pointers + debugging guide
- [concepts/combat-system.md](../concepts/combat-system.md) — combat engine implementation
- [concepts/bestiary.md](../concepts/bestiary.md) — encounter budget + native bestiary
- [currency-three-tier-pl.md](currency-three-tier-pl.md) — currency rules
- [titles-from-achievements.md](titles-from-achievements.md) — identity system
