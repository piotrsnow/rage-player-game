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
- For room-to-room movement use the LOCATION POLICY (dungeon-nav) slot — its rules are appended below when the player is inside a dungeon_room.
- Improvised player actions ("próbuję przebić ścianę", "palę sieć") — allow them, but NEVER add new rooms, enemies, traps, or loot.`;
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
