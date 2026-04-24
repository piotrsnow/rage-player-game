/**
 * Living World Phase 4+ — item attribution, dungeon room authority,
 * new location emission rules, quest-giver reuse hint.
 *
 * Only emitted when `livingWorldEnabled=true` (campaign flag). The dungeon
 * block and location emission rules are always-on when the flag is on —
 * they're short and the model needs the schema whether or not the current
 * scene involves them.
 */

export function buildItemAttributionBlock() {
  return `LIVING WORLD — item attribution:
- When an NPC gives the player an item, set \`fromNpcId\` on that item entry to the NPC's canonical name (e.g. "fromNpcId": "Bjorn"). Items dropped in a location or picked up from containers do NOT need \`fromNpcId\`.
- Poor NPCs do not give away valuable items. If you're about to narrate a gift, match item rarity to the NPC's status (peasant → common, merchant → uncommon, noble → rare).
- If the DM memory / pending hooks block below names an NPC with a plan, respect what they already intended. Don't contradict their stated goals mid-scene.`;
}

/**
 * Zwięzła, cache-friendly "meta" wersja dungeon rules. Pełny schema wchodzi
 * dopiero gdy `coreState.dungeonRoom` istnieje — emit `buildDungeonRoomFullSchema()`.
 */
export function buildDungeonRoomStaticHint() {
  return `LIVING WORLD — dungeon rooms: if a DUNGEON ROOM block appears in EXPANDED CONTEXT, it is AUTHORITATIVE (enemies/traps/loot/exits pre-generated, do NOT invent additions). Full schema appears when you're in a dungeon.`;
}

export function buildDungeonRoomFullSchema() {
  return `LIVING WORLD — dungeon rooms (DUNGEON ROOM block is present in context):
- The block is AUTHORITATIVE: enemies, traps, loot, exits, puzzle are all pre-generated. Do NOT invent additions.
- Narrate the listed flavor seed and contents on first entry. Match atmosphere to theme (catacomb / cave).
- When player explores or is careless, trap may activate — narrate the consequences and emit:
    "stateChanges": { "dungeonRoom": { "trapSprung": true }, "woundsChange": ... }
- When combat resolves with all listed enemies defeated, emit:
    "stateChanges": { "dungeonRoom": { "entryCleared": true } }
- When player searches and loot is revealed, add entries to \`newItems\` and emit:
    "stateChanges": { "dungeonRoom": { "lootTaken": true } }
- When player moves through an exit, set \`stateChanges.currentLocation\` to the target room's canonical name (as given in the Exits list).
- Improvised player actions ("próbuję przebić ścianę", "palę sieć") — allow them, but NEVER add new rooms, enemies, traps, or loot.`;
}

/**
 * Zwięzła, cache-friendly static hint dla location emission. Pełny schema
 * wchodzi gdy gracz faktycznie rusza (intent=travel) albo jest w osadzie.
 */
export function buildNewLocationsStaticHint() {
  return `LIVING WORLD — new locations: Settlements (hamlet/village/town/city/capital) are CREATION-TIME-ONLY and silently rejected mid-play. Mid-play you may emit wilderness/forest/ruin/camp/cave/dungeon/interior via newLocations. Full schema + sublocations rules appear when you enter a settlement or travel into new terrain.`;
}

export function buildNewLocationsFullSchema() {
  return `LIVING WORLD — new locations (sublocations + top-level settlements):

SUBLOCATIONS (inside a known settlement):
- When the player enters a new sublocation (tavern/church/tower/etc.) INSIDE a known settlement, emit:
  { "name": "Wieża Maga", "parentLocationName": "<canonical settlement name>", "locationType": "interior", "slotType": "<slotType or null>", "description": "<optional>" }
- Use the SUBLOCATIONS AVAILABLE block (in EXPANDED CONTEXT) to pick \`slotType\`: either an open optional slot ('tavern','church','blacksmith',...) or leave null for a narratively distinctive custom addition.
- Names MUST be narratively distinctive (at least two substantive words) — e.g. "Chata Starej Wiedźmy", "Wieża Czarnego Maga", "Ruiny Dawnego Cmentarzyska". Generic names like "dom", "chata", "tawerna" WILL be rejected.
- Custom additions are bounded per campaign difficulty tier. The SUBLOCATIONS AVAILABLE block reports the remaining custom budget — if it's 0, fill from open optional slots ONLY; custom entries will be silently rejected.
- If the parent's slot budget is full (SUBLOCATIONS AVAILABLE reports 0 remaining), don't emit new entries.

TOP-LEVEL (wilderness / ruins emerging during travel):
- When the player travels into unexplored overworld terrain, emit:
  { "name": "Zapomniane Ruiny", "parentLocationName": null, "locationType": "ruin", "description": "<short>", "directionFromCurrent": "NE", "distanceHint": "close", "connectsTo": ["<optional known nearby locations>"] }
- \`directionFromCurrent\` — OPTIONAL cardinal bearing from player's current location (N|NE|E|SE|S|SW|W|NW). Omit if the narration doesn't specify a direction — BE picks a random angle.
- \`distanceHint\` — OPTIONAL rough distance: \`close\` (0.1–2 km, "nearby", "not far") or \`far\` (2.1–4 km, "a day's travel", "distant"). Omit → defaults to \`close\`. (Legacy \`travelDistance\` enum short|half_day|day|two_days|multi_day still accepted.)
- \`locationType\` — allowed mid-play: \`wilderness\`, \`forest\`, \`ruin\`, \`camp\`, \`cave\`, \`dungeon\`, \`interior\`.
- **Settlements are creation-time-only.** Populated settlements (\`hamlet\`, \`village\`, \`town\`, \`city\`, \`capital\`) are pre-seeded at campaign creation and CANNOT be emitted mid-play. Any attempt to create a settlement via newLocations will be silently rejected by the backend. If the player deliberately seeks a new village, redirect them narratively to an existing seeded settlement (see SEEDED SETTLEMENTS block) OR emit a non-settlement (ruin/camp/cave) instead.
- \`connectsTo\` — optional list of known nearby location names that share an edge with the new one.
- BE computes coordinates on the campaign grid: random angle (or your direction if provided), random distance inside the hinted range, avoiding collisions with existing locations and clamped to worldBounds. You do NOT need to provide coordinates — just the narrative + optional hints.
- If the TRAVEL CONTEXT block is present, follow its waypoint instructions EXACTLY — do NOT invent new locations between known waypoints on a direct path.`;
}

/**
 * Phase D — quest-giver suggestion injected when nano flagged a quest offer
 * AND Phase C saturation budget is tight. Non-binding — premium may pick a
 * different NPC if narrative demands — but reuse is the default.
 */
export function buildQuestGiverHintBlock(questGiverHint) {
  if (!questGiverHint?.name) return null;
  const locBit = questGiverHint.location ? ` at ${questGiverHint.location}` : '';
  const roleBit = questGiverHint.role ? ` (${questGiverHint.role})` : '';
  return `SUGGESTED QUEST-GIVER: ${questGiverHint.name}${roleBit}${locBit}. If the player is asking about work/jobs/bounties, route the offer through this existing NPC instead of introducing a new one. Deviate ONLY if narrative continuity requires it.`;
}
