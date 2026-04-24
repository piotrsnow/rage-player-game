import { shortId } from '../../../utils/ids';
import { mergeUnique } from '../../../../shared/domain/arrays';

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

  for (const incoming of changes.npcs) {
    const idx = draft.world.npcs.findIndex(
      (n) => n.name?.toLowerCase() === incoming.name?.toLowerCase(),
    );

    if (incoming.action === 'introduce' && idx < 0) {
      draft.world.npcs.push({
        id: `npc_${Date.now()}_${shortId(5)}`,
        name: incoming.name,
        gender: incoming.gender || 'unknown',
        role: incoming.role || '',
        personality: incoming.personality || '',
        attitude: incoming.attitude || 'neutral',
        lastLocation: incoming.location || '',
        alive: true,
        notes: incoming.notes || '',
        disposition: 0,
        factionId: incoming.factionId || null,
        relatedQuestIds: incoming.relatedQuestIds || [],
        relationships: incoming.relationships || [],
        canTrain: Array.isArray(incoming.canTrain) ? incoming.canTrain : [],
      });
      continue;
    }
    if (idx < 0) continue;

    const npc = draft.world.npcs[idx];
    if (incoming.gender) npc.gender = incoming.gender;
    if (incoming.role) npc.role = incoming.role;
    if (incoming.personality) npc.personality = incoming.personality;
    if (incoming.attitude) npc.attitude = incoming.attitude;
    if (incoming.location) npc.lastLocation = incoming.location;
    if (incoming.notes) npc.notes = incoming.notes;
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
          (r) => !incoming.relationships.some((nr) => nr.npcName === r.npcName),
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
  }
}
