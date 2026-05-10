export const TYPE_STYLES = {
  main: 'bg-primary/15 text-primary border-primary/25',
  side: 'bg-tertiary/15 text-tertiary border-tertiary/25',
  personal: 'bg-secondary/15 text-secondary border-secondary/25',
};

export const TYPE_ICONS = {
  main: 'local_fire_department',
  side: 'explore',
  personal: 'person',
};

// Helpers ekstrakcji statusu z objective. Backward-compat:
//  - legacy: bool `completed`, brak `status` → pochodne pending/done
//  - graph (oś 1): explicit `status` field z BE (pending/done/locked/skipped/failed)
function objStatus(obj) {
  if (obj?.status) return obj.status;
  return obj?.completed ? 'done' : 'pending';
}
function isDiscovered(obj) {
  // Brak `discovered` w metadata = legacy linear quest = traktuj jako true
  // (BE backfill też ustawia discovered=true dla starych objectives).
  return obj?.discovered !== false;
}

export function isReadyToTurnIn(quest) {
  if (!Array.isArray(quest?.objectives) || quest.objectives.length === 0) return false;
  // Quest gotowy do oddania gdy NIE MA pending/locked w aktywnej ścieżce
  // (skipped/failed nie blokują). Backward compat: legacy `completed` → done.
  return quest.objectives.every((o) => {
    const s = objStatus(o);
    return s === 'done' || s === 'skipped' || s === 'failed';
  });
}

/**
 * Rozdziel objectives na widoczne sekcje dla UI:
 *   - done: zawsze widoczne, line-through
 *   - pending (discovered): widoczne, pierwsze dostaje ▶ NEXT
 *   - locked (discovered): widoczne, 🔒 z hint o parentach (visible-locked)
 *   - failed: widoczne, ❌
 *   - skipped: ukryte całkowicie (alternatywna ścieżka zamknięta)
 *
 * `hiddenCount` — undiscovered reachable: pending undiscovered + locked
 * undiscovered z parents satisfied. Pokazywany jako "X Nieznany krok".
 *
 * `branchGroups` — grupy XOR które gracz widzi (mają discovered nodes);
 * używane do badge "Wybór: ścieżka X".
 */
export function getVisibleObjectives(objectives) {
  if (!Array.isArray(objectives) || objectives.length === 0) {
    return { done: [], pending: [], locked: [], failed: [], hiddenCount: 0, branchGroups: [] };
  }

  const doneKeys = new Set(
    objectives.filter((o) => objStatus(o) === 'done').map((o) => o.nodeKey).filter(Boolean),
  );

  const done = [];
  const pending = [];
  const locked = [];
  const failed = [];
  let hiddenCount = 0;
  const groupsMap = new Map();

  for (const obj of objectives) {
    const status = objStatus(obj);
    const discovered = isDiscovered(obj);

    if (status === 'done') {
      done.push(obj);
    } else if (status === 'failed') {
      failed.push(obj);
    } else if (status === 'skipped') {
      // skipped → hidden completely (player chose another branch)
      continue;
    } else if (status === 'pending') {
      if (discovered) pending.push(obj);
      else hiddenCount += 1;
    } else if (status === 'locked') {
      if (discovered) {
        locked.push(obj);
      } else {
        // reachable locked: parents satisfied → liczymy do "???"
        const parents = Array.isArray(obj.parents) ? obj.parents : [];
        const reachable = parents.length > 0 && parents.every((p) => doneKeys.has(p));
        if (reachable) hiddenCount += 1;
        // niewidoczne deep-locked: pomijamy, gracz nie wie nawet że istnieje
      }
    }

    // Branch group rejestracja — tylko dla discovered nodes
    if (discovered && obj.branchGroup) {
      if (!groupsMap.has(obj.branchGroup)) groupsMap.set(obj.branchGroup, []);
      groupsMap.get(obj.branchGroup).push(obj);
    }
  }

  const branchGroups = [];
  for (const [group, nodes] of groupsMap.entries()) {
    branchGroups.push({
      group,
      options: nodes.map((n) => ({
        nodeKey: n.nodeKey,
        label: n.choiceLabel || n.description?.slice(0, 40) || n.nodeKey,
        status: objStatus(n),
      })),
    });
  }

  return { done, pending, locked, failed, hiddenCount, branchGroups };
}

// Re-exports dla testów / innych komponentów.
export { objStatus, isDiscovered };
