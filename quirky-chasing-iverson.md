# Fix: character sheet shows all 10s, no way to spend attribute points

## Context

User reports that opening the character sheet shows all stats as 10 (instead of the character's real values), and there is no UI to spend attribute points even when points are available.

The project is mid-migration from a legacy WFRP-style character schema to the new **RPGon** system on branch `new_rpg_system`. The new schema uses `character.attributes` (Polish keys: `sila`, `inteligencja`, `charyzma`, `zrecznosc`, `wytrzymalosc`, `szczescie`), `character.mana`, `character.spells`, `character.materialBag`, `character.characterLevel`, `character.characterXp`, `character.attributePoints`, and `character.lastTrainingScene`. Character creation (`CharacterCreationModal.jsx`) and the in-memory game state already produce these fields. **Persistence layers were never updated**, so the new fields are silently dropped on save and missing on reload.

## Root cause

Two layers persist characters and both still speak the old WFRP schema:

1. **Frontend storage** — [src/services/storage.js:506-575](src/services/storage.js#L506-L575) `saveCharacter()` and [src/services/storage.js:612-636](src/services/storage.js#L612-L636) `syncCharacterFromGame()` build payloads that include legacy `characteristics` and omit `attributes`, `mana`, `spells`, `materialBag`, `characterLevel`, `characterXp`, `attributePoints`, `lastTrainingScene`, and `needs`. The migration helper at [src/services/storage.js:681-710](src/services/storage.js#L681-L710) has the same omission.

2. **Backend characters route** — [backend/src/routes/characters.js](backend/src/routes/characters.js) `POST /`, `PUT /:id`, and `deserializeCharacter()` only know about `characteristics`, `advances`, `xp`, `xpSpent`. The Prisma `Character` model has no columns for the new RPGon fields. Even if the frontend sent them, the backend would discard them.

When a character round-trips through either layer, `attributes` is gone. On reload, [src/contexts/GameContext.jsx:79-91](src/contexts/GameContext.jsx#L79-L91) `normalizeCharacter()` runs the fallback `attributes: character.attributes || { sila: 10, inteligencja: 10, charyzma: 10, zrecznosc: 10, wytrzymalosc: 10, szczescie: 5 }` — that fallback is the literal source of the "all 10" display.

The "no spend UI" symptom is a downstream effect: [src/components/character/AdvancementPanel.jsx:31-77](src/components/character/AdvancementPanel.jsx#L31-L77) does have a `+1` button gated on `attrPoints >= cost && value < ATTRIBUTE_SCALE.max`. With the fallback values it would show — *if* `character.attributePoints` survived the round-trip. It doesn't, because `attributePoints` is also stripped at the persistence boundaries above. Note that `StatsGrid.jsx` (used inside `CharacterSheet`) has no spend buttons at all — only the separate `AdvancementPanel` does. The CharacterSheet header at [CharacterSheet.jsx:630-638](src/components/character/CharacterSheet.jsx#L630-L638) only shows the "open advancement" CTA when `attrPoints > 0`, so once `attributePoints` is wiped the entire entry point disappears too.

## Plan

### 1. Backend Prisma schema — add RPGon fields to `Character`

File: `backend/prisma/schema.prisma`

Add the following fields to the `Character` model (all optional / with defaults so existing rows still load):
- `attributes String?` — JSON of `{sila, inteligencja, charyzma, zrecznosc, wytrzymalosc, szczescie}`
- `mana String?` — JSON of `{current, max}`
- `spells String?` — JSON of `{known, usageCounts, scrolls}`
- `materialBag String?` — JSON array
- `needs String?` — JSON
- `characterLevel Int @default(1)`
- `characterXp Int @default(0)`
- `attributePoints Int @default(0)`
- `lastTrainingScene Int @default(0)`

Run `cd backend && npm run db:push` to apply (MongoDB, no migration files).

The legacy `characteristics`, `advances`, `xp`, `xpSpent` columns can stay for now — they are dead but removing them is out of scope for this bugfix.

### 2. Backend route — accept and return new fields

File: [backend/src/routes/characters.js](backend/src/routes/characters.js)

- `deserializeCharacter()` (lines 26-40): parse the new JSON-string fields. Default `attributes` to `{}`, `mana` to `{current: 0, max: 0}`, `spells` to `{known: [], usageCounts: {}, scrolls: []}`, `materialBag` and `needs` to `{}` / `[]`.
- `POST /` (lines 63-97): persist `body.attributes`, `body.mana`, `body.spells`, `body.materialBag`, `body.needs`, `body.characterLevel`, `body.characterXp`, `body.attributePoints`, `body.lastTrainingScene` (JSON.stringify the object/array fields).
- `PUT /:id` (lines 99-143): same `if (body.X !== undefined) updateData.X = ...` pattern for each field.

### 3. Frontend storage payload — include new fields

File: [src/services/storage.js](src/services/storage.js)

Update three payload builders to forward the new RPGon fields alongside (or instead of, see note) the legacy ones:
- `saveCharacter()` payload at lines 509-532
- `syncCharacterFromGame()` payload at lines 615-632
- `migrateLocalDataToAccount()` payload at lines 686-710

Add: `attributes`, `mana`, `spells`, `materialBag`, `needs`, `characterLevel`, `characterXp`, `attributePoints`, `lastTrainingScene`.

The legacy `characteristics`, `advances`, `xp`, `xpSpent` fields can be removed from these payloads since CLAUDE.md states there are no production backward-compat constraints and these fields are only read by code that has already been replaced.

### 4. Apply `normalizeCharacter` on character library load

File: [src/contexts/GameContext.jsx:79-91](src/contexts/GameContext.jsx#L79-L91)

The fallback that injects all-10s is dangerous because it masks data loss. Two changes:

- Soften the fallback so it only injects defaults when **the character genuinely is brand-new** (no `attributes` *and* no legacy `characteristics`). When legacy `characteristics` exists, leave `attributes` undefined and let downstream UI show a clearer empty state — but in practice once steps 1-3 land, freshly created and saved characters will always have `attributes`, so the fallback should rarely fire.
- Alternatively (preferred): keep the fallback but log a `console.warn` when it triggers, so future regressions are visible during development.

Recommended: keep fallback + add the warn. Removing the fallback risks crashing AdvancementPanel for any stray legacy data still in someone's localStorage.

### 5. Repair existing in-progress campaign (one-off, manual)

The user almost certainly has at least one campaign whose `characterState` JSON in MongoDB no longer contains `attributes`. After the code fixes above, that campaign will still display all-10s because the saved blob is missing the field. Two options for the user to recover:

- **Re-roll**: open `CharacterCreationModal` and create a fresh character on a new campaign. Cleanest, validates the fix end-to-end.
- **Manual repair**: in the running app's devtools, dispatch `UPDATE_CHARACTER` with the desired `attributes` object, then call `autoSave()`. This patches the existing campaign's `characterState` once the backend route accepts the field.

I will not write a migration script for this — the user is solo on the branch and the repair is one row.

## Files to modify

| File | Change |
|---|---|
| [backend/prisma/schema.prisma](backend/prisma/schema.prisma) | Add RPGon fields to `Character` model |
| [backend/src/routes/characters.js](backend/src/routes/characters.js) | Accept/serialize new fields in POST, PUT, deserialize |
| [src/services/storage.js](src/services/storage.js) | Forward new fields in 3 payload builders |
| [src/contexts/GameContext.jsx](src/contexts/GameContext.jsx) | Add `console.warn` when fallback triggers |

## Verification

1. `cd backend && npm run db:push && npx prisma generate` — apply schema, regenerate client.
2. `npm run dev` — start frontend + backend.
3. Create a brand-new character via the character creator. Confirm the wizard shows non-default rolled attributes.
4. Save the character to the library, reload the page, open the library — values must match what was saved (not all 10s).
5. Start a campaign with that character. Open the character sheet: `StatsGrid` should show the rolled values, not 10s.
6. In devtools, dispatch `state.character.attributePoints += 3` (or trigger a level-up via XP gain). Confirm the orange `+3 pkt atrybutów` CTA appears on the sheet header. Click it → `AdvancementPanel` opens → each attribute card has a `+1` button → clicking decrements the pool and increments the attribute. Close, reopen the sheet — change persists.
7. Reload the page entirely. Open the campaign again — attributes and remaining `attributePoints` are still correct (proves the campaign `characterState` round-trip works).
8. Open the character library (no active campaign) and view the saved character — same attributes still present (proves the Character library round-trip works).
9. Check the browser console — the new `console.warn` from step 4 must NOT fire for any freshly-created character.
