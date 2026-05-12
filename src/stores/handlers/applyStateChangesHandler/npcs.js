import { shortId } from '../../../utils/ids';
import { mergeUnique } from '../../../../shared/domain/arrays';
import {
  generateNpcSheet,
  mergeSheetOverride,
  npcStatsNeedsBaseline,
  NPC_RACES,
} from '../../../../shared/domain/npcCharacterSheet.js';
import { npcToCompanion } from '../../../services/partyRecruitment';
import { MAX_COMPANIONS } from '../partyHandlers';

/**
 * Faza 3a — parse composite ref string "kind:UUID" → { kind, id } or null.
 * Akceptuje też istniejący object { kind, id }.
 */
function parseLocationRef(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.kind && value.id) {
    return { kind: value.kind, id: value.id };
  }
  if (typeof value !== 'string') return null;
  const m = value.match(/^(world|campaign):([0-9a-f-]{36})$/i);
  if (!m) return null;
  return { kind: m[1].toLowerCase(), id: m[2] };
}

/**
 * Introduce or update NPCs in `draft.world.npcs`. Introduce adds a fresh row
 * with a generated id; update merges incoming fields into an existing NPC
 * (case-insensitive name match). "introduce + existing" is treated as a soft
 * update — we don't spawn a duplicate just because the model forgot the NPC
 * was already here.
 */
export function applyNpcs(draft, changes) {
  if (!changes.npcs?.length) return;
  if (!draft.world.npcs) draft.world.npcs = [];

  const pendingRecruits = [];

  for (const incoming of changes.npcs) {
    // Primary: match by campaignNpcId (UUID) when present.
    // Fallback: case-insensitive name match.
    let idx = -1;
    if (incoming.campaignNpcId) {
      idx = draft.world.npcs.findIndex((n) => n.campaignNpcId === incoming.campaignNpcId);
    }
    if (idx < 0) {
      idx = draft.world.npcs.findIndex(
        (n) => n.name?.toLowerCase() === incoming.name?.toLowerCase(),
      );
    }

    if (incoming.action === 'introduce' && idx < 0) {
      const incomingRef = parseLocationRef(incoming.locationRef);
      const rawRace = typeof incoming.race === 'string' && NPC_RACES.includes(incoming.race) ? incoming.race : null;
      const rawCreatureKind = typeof incoming.creatureKind === 'string' && incoming.creatureKind.trim()
        ? incoming.creatureKind.trim()
        : null;
      const resolvedRace = rawRace || (rawCreatureKind ? null : 'Human');
      let stats = incoming.stats && typeof incoming.stats === 'object' ? incoming.stats : {};
      if (npcStatsNeedsBaseline(stats)) {
        stats = generateNpcSheet({
          name: incoming.name,
          race: resolvedRace,
          creatureKind: rawCreatureKind,
          role: incoming.role || '',
          category: typeof incoming.category === 'string' ? incoming.category : 'commoner',
          personality: incoming.personality || '',
          level: typeof incoming.level === 'number' ? incoming.level : null,
          keyNpc: incoming.keyNpc === true,
        });
      }
      if (incoming.statsOverride && typeof incoming.statsOverride === 'object') {
        stats = mergeSheetOverride(stats, incoming.statsOverride);
      }
      const npcEntry = {
        id: incoming.campaignNpcId || `npc_${Date.now()}_${shortId(5)}`,
        campaignNpcId: incoming.campaignNpcId || null,
        name: incoming.name,
        gender: incoming.gender || 'unknown',
        role: incoming.role || '',
        personality: incoming.personality || '',
        appearance: typeof incoming.appearance === 'string' ? incoming.appearance : '',
        dialect: typeof incoming.dialect === 'string' ? incoming.dialect : '',
        attitude: incoming.attitude || 'neutral',
        lastLocation: incoming.location || '',
        locationRef: incomingRef,
        alive: true,
        notes: incoming.notes || '',
        disposition: typeof incoming.disposition === 'number' ? incoming.disposition : 0,
        portraitUrl: null,
        factionId: incoming.factionId || null,
        relatedQuestIds: incoming.relatedQuestIds || [],
        relationships: incoming.relationships || [],
        canTrain: Array.isArray(incoming.canTrain) ? incoming.canTrain : [],
        race: stats.race ?? rawRace,
        creatureKind: stats.creatureKind ?? rawCreatureKind,
        level: typeof stats.level === 'number' ? stats.level : (typeof incoming.level === 'number' ? incoming.level : 1),
        stats,
      };
      draft.world.npcs.push(npcEntry);
      if (incoming.joinParty === true) pendingRecruits.push(npcEntry);
      continue;
    }
    if (idx < 0) continue;

    const npc = draft.world.npcs[idx];
    if (incoming.gender) npc.gender = incoming.gender;
    if (incoming.role) npc.role = incoming.role;
    if (incoming.personality) npc.personality = incoming.personality;
    if (typeof incoming.appearance === 'string' && incoming.appearance.trim()) npc.appearance = incoming.appearance;
    if (typeof incoming.dialect === 'string' && incoming.dialect.trim()) npc.dialect = incoming.dialect;
    if (incoming.attitude) npc.attitude = incoming.attitude;
    if (incoming.location) npc.lastLocation = incoming.location;
    // Faza 3a — preferowane: composite ref. AI-emitted lub BE-resolved.
    // Clear stale ref when location text changes without an accompanying ref,
    // so the NPC doesn't remain "visible" at the old composite-ref location.
    {
      const incomingRef = parseLocationRef(incoming.locationRef);
      if (incomingRef) {
        npc.locationRef = incomingRef;
      } else if (incoming.location) {
        npc.locationRef = null;
      }
    }
    if (incoming.notes) npc.notes = incoming.notes;
    if (typeof incoming.race === 'string') npc.race = incoming.race;
    if (typeof incoming.creatureKind === 'string') npc.creatureKind = incoming.creatureKind;
    if (typeof incoming.level === 'number') npc.level = incoming.level;
    if (incoming.stats && typeof incoming.stats === 'object' && !npcStatsNeedsBaseline(incoming.stats)) {
      npc.stats = incoming.stats;
    }
    const needsSheetMerge = npcStatsNeedsBaseline(npc.stats)
      || (incoming.statsOverride && typeof incoming.statsOverride === 'object');
    if (needsSheetMerge) {
      const rawRace = typeof incoming.race === 'string' && NPC_RACES.includes(incoming.race) ? incoming.race : npc.race;
      const rawCreatureKind = typeof incoming.creatureKind === 'string' && incoming.creatureKind.trim()
        ? incoming.creatureKind.trim()
        : npc.creatureKind;
      const resolvedRace = rawRace || (rawCreatureKind ? null : 'Human');
      const baseline = !npcStatsNeedsBaseline(npc.stats)
        ? { ...npc.stats }
        : generateNpcSheet({
          name: npc.name,
          race: resolvedRace,
          creatureKind: rawCreatureKind || null,
          role: incoming.role || npc.role || '',
          category: typeof incoming.category === 'string' ? incoming.category : (npc.category || 'commoner'),
          personality: incoming.personality || npc.personality || '',
          level: typeof incoming.level === 'number' ? incoming.level : npc.level,
          keyNpc: incoming.keyNpc === true || npc.keyNpc === true,
        });
      npc.stats = incoming.statsOverride && typeof incoming.statsOverride === 'object'
        ? mergeSheetOverride(baseline, incoming.statsOverride)
        : baseline;
      if (npc.stats.race != null) npc.race = npc.stats.race;
      if (npc.stats.creatureKind != null) npc.creatureKind = npc.stats.creatureKind;
      if (typeof npc.stats.level === 'number') npc.level = npc.stats.level;
    }
    if (Array.isArray(incoming.canTrain)) {
      const existing = Array.isArray(npc.canTrain) ? npc.canTrain : [];
      npc.canTrain = [...new Set([...existing, ...incoming.canTrain])];
    }

    if (incoming.action !== 'introduce') {
      if (incoming.alive !== undefined) npc.alive = incoming.alive;
      if (incoming.factionId !== undefined) npc.factionId = incoming.factionId;

      if (incoming.relatedQuestIds?.length > 0) {
        npc.relatedQuestIds = mergeUnique(npc.relatedQuestIds, incoming.relatedQuestIds);
      }
      if (incoming.relationships?.length > 0) {
        const filteredExisting = (npc.relationships || []).filter(
          (r) => !incoming.relationships.some((nr) =>
            (nr.npcId && r.npcId && nr.npcId === r.npcId) || nr.npcName === r.npcName,
          ),
        );
        npc.relationships = [...filteredExisting, ...incoming.relationships];
      }
      if (typeof incoming.dispositionChange === 'number') {
        npc.disposition = Math.max(-50, Math.min(50, (npc.disposition || 0) + incoming.dispositionChange));
      }
    } else {
      // introduce + existing: only set optional relationship fields, don't
      // overwrite counters the update branch would.
      if (incoming.factionId !== undefined) npc.factionId = incoming.factionId;
      if (incoming.relatedQuestIds?.length > 0) npc.relatedQuestIds = incoming.relatedQuestIds;
      if (incoming.relationships?.length > 0) npc.relationships = incoming.relationships;
    }

    if (incoming.joinParty === true) pendingRecruits.push(npc);
  }

  if (pendingRecruits.length === 0) return;

  if (!draft.party) draft.party = [];
  const partyNpcIds = new Set(
    draft.party.map((m) => m?.recruitedFromNpcId || m?.id).filter(Boolean),
  );

  for (const npc of pendingRecruits) {
    if (draft.party.length >= MAX_COMPANIONS) break;
    if (partyNpcIds.has(npc.id)) continue;
    draft.party.push(npcToCompanion(npc));
    npc.inParty = true;
    partyNpcIds.add(npc.id);
  }
}
