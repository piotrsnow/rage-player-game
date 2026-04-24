import { shortId } from '../../../utils/ids';

/**
 * Cross-cutting world systems: active magical/environmental effects,
 * faction standing, and the field-map rendering mode.
 */

export function applyActiveEffects(draft, changes) {
  if (!changes.activeEffects?.length) return;
  if (!draft.world.activeEffects) draft.world.activeEffects = [];

  for (const fx of changes.activeEffects) {
    if (fx.action === 'add') {
      draft.world.activeEffects.push({
        id: fx.id || `fx_${Date.now()}_${shortId(5)}`,
        type: fx.type || 'other',
        location: fx.location || '',
        description: fx.description || '',
        placedBy: fx.placedBy || '',
        active: true,
      });
    } else if (fx.action === 'remove') {
      draft.world.activeEffects = draft.world.activeEffects.filter((e) => e.id !== fx.id);
    } else if (fx.action === 'trigger') {
      const effect = draft.world.activeEffects.find((e) => e.id === fx.id);
      if (effect) effect.active = false;
    }
  }
}

export function applyFactionChanges(draft, changes) {
  if (!changes.factionChanges || typeof changes.factionChanges !== 'object') return;
  if (!draft.world.factions) draft.world.factions = {};
  for (const [factionId, delta] of Object.entries(changes.factionChanges)) {
    const current = draft.world.factions[factionId] || 0;
    draft.world.factions[factionId] = Math.max(-100, Math.min(100, current + delta));
  }
}

/**
 * Field-map mode switch (overworld / trakt road variant / etc.). Resetting
 * `chunks` on mode change is intentional — chunks are cached per-mode and
 * keeping stale chunks from the previous mode causes visual tears.
 */
export function applyMapMode(draft, changes) {
  if (!changes.mapMode || !draft.world?.fieldMap) return;
  const fm = draft.world.fieldMap;
  const newMode = changes.mapMode;
  const newVariant = newMode === 'trakt' ? (changes.roadVariant || null) : null;
  if (fm.mapMode !== newMode || fm.roadVariant !== newVariant) {
    fm.mapMode = newMode;
    fm.roadVariant = newVariant;
    fm.chunks = {};
    fm.stepCounter = 0;
    fm.stepBuffer = [];
    fm.discoveredPoi = [];
  }
}
