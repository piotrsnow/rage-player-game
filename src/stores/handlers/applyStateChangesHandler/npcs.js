import { shortId } from '../../../utils/ids';
import { mergeUnique } from '../../../../shared/domain/arrays';
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
        race: typeof incoming.race === 'string' ? incoming.race : null,
        creatureKind: typeof incoming.creatureKind === 'string' ? incoming.creatureKind : null,
        level: typeof incoming.level === 'number' ? incoming.level : 1,
        stats: incoming.stats && typeof incoming.stats === 'object' ? incoming.stats : {},
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
    if (incoming.stats && typeof incoming.stats === 'object') npc.stats = incoming.stats;
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
