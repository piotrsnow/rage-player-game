import { devLog } from '../devEventLogStore';

/**
 * Handler for APPLY_STATE_CORRECTION — applies post-scene nano auditor
 * corrections to the local game state. Fired when the FE polls
 * GET /campaigns/:id/pending-correction and receives a non-null payload.
 */
export function stateCorrectionHandler(draft, action) {
  const correction = action.payload;
  if (!correction) return;

  if (correction.location) {
    const prev = draft.world?.currentLocation;
    draft.world.currentLocation = correction.location.correctedLocation;
    devLog.emit({
      category: 'audit',
      type: 'location_corrected',
      label: `Location corrected: "${prev}" → "${correction.location.correctedLocation}"`,
      severity: 'warn',
      data: correction.location,
    });
  }

  if (Array.isArray(correction.npcs) && correction.npcs.length > 0) {
    for (const c of correction.npcs) {
      const npc = (draft.npcs || []).find(
        (n) => n.name?.toLowerCase() === c.name?.toLowerCase(),
      );
      if (!npc) continue;

      if (c.field === 'attitude' && typeof c.correctedValue === 'string') {
        npc.attitude = c.correctedValue;
      } else if (c.field === 'alive' && typeof c.correctedValue === 'boolean') {
        npc.alive = c.correctedValue;
      } else if (c.field === 'disposition' && typeof c.correctedValue === 'number') {
        npc.disposition = c.correctedValue;
      }

      devLog.emit({
        category: 'audit',
        type: 'npc_corrected',
        label: `NPC corrected: ${c.name}.${c.field} = ${c.correctedValue}`,
        severity: 'warn',
        data: c,
      });
    }
  }
}
