/**
 * Quest graph utilities — czyste funkcje, testowalne bez DB.
 *
 * Każdy `objective` jest zwykłym CampaignQuestObjective row LUB FE-shape
 * (gameStore quest.objectives). Wymagana minimalna kształtka:
 *   { nodeKey?: string, status: 'pending'|'done'|'locked'|'skipped'|'failed',
 *     metadata: { parents?: string[], unlocks?: string[], branchGroup?: string,
 *                 branchType?: 'and'|'path'|'or', discovered?: boolean,
 *                 choiceLabel?: string, placeholderHint?: string } }
 *
 * Funkcje są PURE — zwracają **listy patchy** (`{ id?, nodeKey?, status,
 * metadata? }`) zamiast mutować input. Caller (handler Prisma) aplikuje
 * patche w transakcji.
 *
 * Statusy:
 *   - pending: parents satisfied, do zrobienia (visible jeśli discovered)
 *   - done: ukończone (zawsze visible)
 *   - locked: parents niespełnione (visible tylko jeśli discovered=true)
 *   - skipped: branchChoice w XOR zamknął gałąź (zwykle hidden)
 *   - failed: failsOn match (np. questgiver dead)
 *
 * Diegetic discovery (oś 5):
 *   - mechaniczne `unlock` (parents satisfied) JEST ROZDZIELONE od
 *     `discovered` (NPC powiedział). Reveal jest zawsze sticky — raz
 *     discovered = zawsze discovered.
 *   - Reveal może wyprzedzić unlock — locked node z discovered=true jest
 *     visible w UI z markerem "🔒 wymaga: <parents>".
 */

const VALID_STATUSES = new Set(['pending', 'done', 'locked', 'skipped', 'failed']);
const VALID_BRANCH_TYPES = new Set(['and', 'path', 'or']);

const NODE_KEY_RE = /^[a-z0-9_]{1,40}$/;

export function isValidNodeKey(s) {
  return typeof s === 'string' && NODE_KEY_RE.test(s);
}

function getMeta(obj) {
  return (obj && typeof obj.metadata === 'object' && obj.metadata !== null) ? obj.metadata : {};
}

function getNodeKey(obj) {
  if (!obj) return null;
  if (typeof obj.nodeKey === 'string' && obj.nodeKey) return obj.nodeKey;
  const m = getMeta(obj);
  if (typeof m.nodeKey === 'string' && m.nodeKey) return m.nodeKey;
  return null;
}

function findByNodeKey(objectives, nodeKey) {
  if (!Array.isArray(objectives) || !nodeKey) return null;
  return objectives.find((o) => getNodeKey(o) === nodeKey) || null;
}

function isDiscovered(obj) {
  const m = getMeta(obj);
  // Legacy linear questów: brak `discovered` w metadata → traktuj jako true
  // (backfill SQL też ustawia true). Nowe questy z grafu emitują explicit
  // false dla wszystkich nodes poza root przy questOffer materialization.
  return m.discovered !== false;
}

/**
 * Po zmianie status `done` na node `completedNodeKey`, wyznacz patche dla
 * dzieci których `parents` są teraz wszystkie satisfied (transition
 * locked → pending). Zwraca tablicę `{ id, nodeKey, status }`.
 *
 * Honoruje też `metadata.unlocks` na completed node — alternatywa do
 * parents (taniej dla LLM): "completed unlocks X" zamiast "X parents=[me]".
 */
export function unlockChildObjectives(objectives, completedNodeKey) {
  if (!Array.isArray(objectives) || !completedNodeKey) return [];
  const completed = findByNodeKey(objectives, completedNodeKey);
  const explicitUnlocks = new Set(
    (completed && Array.isArray(getMeta(completed).unlocks)) ? getMeta(completed).unlocks : [],
  );

  const doneKeys = new Set(
    objectives.filter((o) => o.status === 'done').map(getNodeKey).filter(Boolean),
  );
  // Treat completedNodeKey as done (caller may not have updated objectives in-place yet)
  doneKeys.add(completedNodeKey);

  const patches = [];
  for (const obj of objectives) {
    if (obj.status !== 'locked') continue;
    const nk = getNodeKey(obj);
    const meta = getMeta(obj);
    const parents = Array.isArray(meta.parents) ? meta.parents : [];
    const explicit = nk && explicitUnlocks.has(nk);
    const allParentsDone = parents.length > 0 && parents.every((p) => doneKeys.has(p));
    if (explicit || allParentsDone) {
      patches.push({ id: obj.id, nodeKey: nk, status: 'pending' });
    }
  }
  return patches;
}

/**
 * Po wyborze gałęzi (`branchChoice: { group, chosen }`), zwróć patche dla
 * rodzeństwa w tej grupie — wszystkie inne nodes z `metadata.branchGroup ===
 * group` przechodzą na `skipped`. Idempotentne: jeśli rodzeństwo już done,
 * zostaje done.
 */
export function closeSiblingBranches(objectives, branchGroup, chosenNodeKey) {
  if (!Array.isArray(objectives) || !branchGroup || !chosenNodeKey) return [];
  const patches = [];
  for (const obj of objectives) {
    const meta = getMeta(obj);
    if (meta.branchGroup !== branchGroup) continue;
    const nk = getNodeKey(obj);
    if (nk === chosenNodeKey) continue;
    if (obj.status === 'done' || obj.status === 'skipped') continue;
    patches.push({ id: obj.id, nodeKey: nk, status: 'skipped' });
  }
  return patches;
}

/**
 * Aktualnie aktywny "frontier" — pending objectives które są discovered.
 * Używane do prompt rendering i do FE NEXT marker.
 */
export function getActiveFrontier(objectives) {
  if (!Array.isArray(objectives)) return [];
  return objectives.filter((o) => o.status === 'pending' && isDiscovered(o));
}

/**
 * Auto-complete predykat: quest jest ukończony gdy NIE MA `pending` ani
 * `locked` z aktywnej ścieżki. `skipped` i `failed` nie blokują.
 *
 * Edge case: pusta lista objectives → false (nie auto-complete'ujemy
 * pustego questa).
 */
export function isQuestComplete(objectives) {
  if (!Array.isArray(objectives) || objectives.length === 0) return false;
  return objectives.every((o) => o.status === 'done' || o.status === 'skipped' || o.status === 'failed');
}

/**
 * Set `metadata.discovered = true` dla nodeKey. Sticky — raz odkryte
 * zostaje na zawsze. Zwraca patch `{ id, nodeKey, metadata }` lub null
 * jeśli nodeKey nie znaleziono albo już discovered.
 */
export function markObjectiveDiscovered(objectives, nodeKey) {
  const obj = findByNodeKey(objectives, nodeKey);
  if (!obj) return null;
  const meta = getMeta(obj);
  if (meta.discovered === true) return null;
  return {
    id: obj.id,
    nodeKey,
    metadata: { ...meta, discovered: true },
  };
}

/**
 * Reveal listy nodeKey-i w obrębie jednej `branchGroup`. Używane gdy NPC
 * proponuje alternatywę — jednym `branchGroupReveals` ujawniasz wybór i
 * konkretne opcje. Zwraca tablicę patchy.
 */
export function markBranchGroupDiscovered(objectives, branchGroup, revealedNodeKeys) {
  if (!Array.isArray(objectives) || !branchGroup) return [];
  if (!Array.isArray(revealedNodeKeys) || revealedNodeKeys.length === 0) return [];
  const patches = [];
  const seen = new Set();
  for (const nk of revealedNodeKeys) {
    if (!nk || seen.has(nk)) continue;
    seen.add(nk);
    const obj = findByNodeKey(objectives, nk);
    if (!obj) continue;
    const meta = getMeta(obj);
    if (meta.branchGroup !== branchGroup) continue;
    if (meta.discovered === true) continue;
    patches.push({
      id: obj.id,
      nodeKey: nk,
      metadata: { ...meta, discovered: true },
    });
  }
  return patches;
}

/**
 * Liczba "???" placeholderów do wyświetlenia w UI: undiscovered nodes
 * które są reachable (pending lub locked z parents już satisfied).
 * Niewidoczne `locked` z niespełnionymi parents NIE są liczone — gracz
 * naprawdę o nich nie wie, więc nie pokazujemy nawet "???".
 */
export function getUndiscoveredCount(objectives) {
  if (!Array.isArray(objectives)) return 0;
  const doneKeys = new Set(
    objectives.filter((o) => o.status === 'done').map(getNodeKey).filter(Boolean),
  );
  let count = 0;
  for (const obj of objectives) {
    if (isDiscovered(obj)) continue;
    if (obj.status === 'done' || obj.status === 'skipped' || obj.status === 'failed') continue;
    if (obj.status === 'pending') {
      count += 1;
      continue;
    }
    if (obj.status === 'locked') {
      const parents = Array.isArray(getMeta(obj).parents) ? getMeta(obj).parents : [];
      if (parents.length > 0 && parents.every((p) => doneKeys.has(p))) {
        // reachable locked (parents done) — zwykle złapie unlock w tej samej
        // turze, ale jeśli LLM nie uruchomił unlock (np. quest został
        // zaktualizowany boczną drogą) — i tak liczymy jako "???".
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Slice grafu który gracz "widzi" — discovered + done + (visible-locked,
 * tj. discovered=true i status=locked). Skipped wykluczone, failed
 * pokazane (gracz musi wiedzieć że quest się rozpadł). Używane przez FE
 * helpers i przez "player view" prompty (jeśli kiedyś będą potrzebne).
 */
export function getKnownGraph(objectives) {
  if (!Array.isArray(objectives)) return [];
  return objectives.filter((o) => {
    if (o.status === 'skipped') return false;
    if (o.status === 'done' || o.status === 'failed') return true;
    return isDiscovered(o);
  });
}

/**
 * Sanity check po `processQuestOffers` — wykrywa cycles, niespełnialne
 * parents (parent nodeKey nie istnieje wśród rodzeństwa), niedopuszczalne
 * statusy. Zwraca tablicę errorów (puste = OK).
 *
 * Wywołać po materialization questa, NIE w hot path każdej sceny.
 */
export function validateGraphIntegrity(objectives) {
  const errors = [];
  if (!Array.isArray(objectives) || objectives.length === 0) {
    return errors;
  }

  const allKeys = new Set();
  const dupes = new Set();
  for (const obj of objectives) {
    const nk = getNodeKey(obj);
    if (!nk) continue;
    if (allKeys.has(nk)) dupes.add(nk);
    allKeys.add(nk);
    if (!VALID_STATUSES.has(obj.status)) {
      errors.push({ kind: 'invalid_status', nodeKey: nk, status: obj.status });
    }
    const meta = getMeta(obj);
    if (meta.branchType !== undefined && !VALID_BRANCH_TYPES.has(meta.branchType)) {
      errors.push({ kind: 'invalid_branch_type', nodeKey: nk, branchType: meta.branchType });
    }
  }
  for (const nk of dupes) {
    errors.push({ kind: 'duplicate_node_key', nodeKey: nk });
  }

  // Parent existence
  for (const obj of objectives) {
    const nk = getNodeKey(obj);
    const parents = Array.isArray(getMeta(obj).parents) ? getMeta(obj).parents : [];
    for (const p of parents) {
      if (!allKeys.has(p)) {
        errors.push({ kind: 'missing_parent', nodeKey: nk, parent: p });
      }
      if (p === nk) {
        errors.push({ kind: 'self_parent', nodeKey: nk });
      }
    }
  }

  // Cycle detection — DFS po parents
  const parentsMap = new Map();
  for (const obj of objectives) {
    const nk = getNodeKey(obj);
    if (!nk) continue;
    const parents = Array.isArray(getMeta(obj).parents) ? getMeta(obj).parents : [];
    parentsMap.set(nk, parents);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  function dfs(nk, stack) {
    if (color.get(nk) === BLACK) return false;
    if (color.get(nk) === GRAY) {
      errors.push({ kind: 'cycle', path: [...stack, nk] });
      return true;
    }
    color.set(nk, GRAY);
    const parents = parentsMap.get(nk) || [];
    for (const p of parents) {
      if (parentsMap.has(p)) {
        if (dfs(p, [...stack, nk])) {
          color.set(nk, BLACK);
          return true;
        }
      }
    }
    color.set(nk, BLACK);
    return false;
  }
  for (const nk of parentsMap.keys()) {
    if (color.get(nk) !== BLACK) dfs(nk, []);
  }

  return errors;
}
