// BE-side travel arbitration — replaces AI-emitted `stateChanges.currentLocation`.
//
// Pipeline (called from generateSceneStream BEFORE premium scene-gen):
//   1. Intent classifier flagged `_intent='travel'` + extracted `_travelTarget`.
//   2. Match target against fog-visible canonical/campaign locations
//      (top-level + sublocations).
//   3. Hit → return `{kind, id, name}`.
//   4. Miss + current location is a settlement/interior/dungeon → no-op
//      (intra-settlement movement; AI subloc emission + post-process auto-
//      promote handle this branch).
//   5. Miss + current is wilderness/null → wilderness fallback
//      (`{kind:null, id:null, name:<flavor>}`).
//
// AI never emits the destination anymore. Subloc creation (parent set) is
// orthogonal — the resolver doesn't know about it; the post-process auto-
// promote rule in processStateChanges/index.js handles "AI created exactly
// one new sublocation in current's walk-up chain → set as current".
//
// Rationale: shared knowledge between intent classifier (knows where the
// player wants to go) and AI (must narrate the destination) had drifted —
// AI was free-handing top-level locations, BE was retrofitting them with
// smart-placer side-effects. Centralizing on intent + fog removes the seam.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { listLocationsForCampaign } from './locationQueries.js';
import { LOCATION_KIND_WORLD, LOCATION_KIND_CAMPAIGN } from '../locationRefs.js';
import { normalizeLocationName } from './worldStateService.js';

const log = childLogger({ module: 'travelResolver' });

// Location types where the player is "in civilization" — wilderness fallback
// must NOT fire here, otherwise "wchodzę do tawerny" in Modrzejów lands the
// player in "Las". AI subloc emission handles intra-civilization movement.
const TERRAIN_LOCATION_TYPES = new Set([
  'wilderness', 'forest', 'cave', 'ruin', 'mountain', 'campaignPlace', 'generic',
]);

// Wilderness flavor pool — bare biome names. Random pick; if `fromName` is
// available we suffix with "<dir> od <fromName>" for a touch of grounding.
// Pre-biome-tiles era: pure flavor, no row materialization. Post-biome-tiles
// this whole helper gets replaced by `tile.name || tile.biome`.
const WILDERNESS_FLAVOR_NAMES = ['Las', 'Pustkowia', 'Wzgórza', 'Mokradła', 'Stepy', 'Bezdroża'];

// Polish direction-phrase → cardinal. Cheap lookup; falls back to null on
// unmatched phrases (then we just drop the directional suffix).
const DIRECTION_PHRASES = [
  { re: /(p[oó]łnoc|\bnorth\b)/i, suffix: 'na północ' },
  { re: /(po[lł]udni|\bsouth\b)/i, suffix: 'na południe' },
  { re: /(wsch[oó]d|\beast\b)/i, suffix: 'na wschodzie' },
  { re: /(zach[oó]d|\bwest\b)/i, suffix: 'na zachodzie' },
];

// Pronouns / vague referents that mean "the place I came from / was at /
// keep talking about". Heurystyka extractuje całą frazę jako _travelTarget,
// więc matcher widzi "tam" / "z powrotem" / "do domu" / etc.
const AMBIGUOUS_REFERENT_RE = /^(tam|tamtam|z\s*powrotem|do\s*domu|wracam|powrot|powrót|do\s*tyłu|back|home|there|do\s*siebie)$/i;

/**
 * Resolve a travel-intent emission to a destination ref.
 *
 * Match cascade (first hit wins):
 *   1. Fog-visible exact / partial location name match.
 *   2. NPC name match — `_travelTarget` IS an NPC; resolve to their current
 *      location (canonical via WorldNPC, shadow via CampaignNPC.lastLocationId).
 *   3. Recent-narrative match — proper noun mentioned in the last few scenes
 *      OR in `gameStateSummary` that resolves to a fog-visible location. Cheap
 *      "the player obviously means that place we just talked about" recovery.
 *   4. Ambiguous referent ("tam", "z powrotem", "do domu") → last visited
 *      location ≠ current.
 *   5. Miss + current = civilization → no-op (AI subloc creation handles it).
 *   6. Miss + current = wilderness/null → wilderness flavor fallback.
 *
 * @param {Object} args
 * @param {string} args.campaignId
 * @param {string} args.userId
 * @param {Object|null} args.currentRef  — `{kind, id, name}` from campaignLoader
 * @param {Object} args.intent           — full intent classifier result
 * @param {string} args.playerAction     — raw player action (for direction parse)
 * @param {Array}  args.dbNpcs           — campaign NPCs (campaignSandbox shape)
 * @param {Array}  args.recentScenes     — last N scenes (narrative + chosenAction)
 * @param {string} args.gameStateSummary — compressed memory facts (string)
 *
 * @returns {Promise<null | {kind: string|null, id: string|null, name: string, row?: Object|null, source: string}>}
 */
export async function resolveTravelDestination({
  campaignId,
  userId,
  currentRef,
  intent,
  playerAction = '',
  dbNpcs = [],
  recentScenes = [],
  gameStateSummary = '',
}) {
  if (!intent || intent._intent !== 'travel') return null;
  const target = typeof intent._travelTarget === 'string' ? intent._travelTarget.trim() : '';
  if (!target) return null;

  const queryNorm = normalizeLocationName(target);
  if (!queryNorm) return null;

  // Visible fog set — used by both name + recent-narrative matchers.
  const visible = await listLocationsForCampaign(campaignId, {
    includeSubs: true,
    visibleOnly: true,
    userId,
  }).catch((err) => {
    log.warn({ err: err?.message, campaignId }, 'listLocationsForCampaign failed — falling through');
    return [];
  });

  // 1. Direct fog-name match.
  const hit = matchByName(visible, queryNorm);
  if (hit) return rowToDest(hit, 'fog_match');

  // 2. NPC name match — player names an NPC, we follow them.
  const npcMatch = matchNpcByName(dbNpcs, queryNorm);
  if (npcMatch) {
    const npcLoc = await resolveNpcLocation(npcMatch, visible);
    if (npcLoc) {
      log.info({ campaignId, target, via: 'npc', npc: npcMatch.name, locName: npcLoc.kind === LOCATION_KIND_WORLD ? npcLoc.canonicalName : npcLoc.name }, 'travel target resolved via NPC name');
      return rowToDest(npcLoc, 'npc_name');
    }
  }

  // 3. Ambiguous referent — last visited location ≠ current. Cheap, runs
  //    BEFORE the recent-narrative scan because "tam" / "z powrotem" is
  //    deterministically resolvable; narrative scan is a fuzzy fallback.
  const isAmbig = AMBIGUOUS_REFERENT_RE.test(target);
  if (isAmbig) {
    const lastVisited = pickLastVisitedDifferentFromCurrent(visible, currentRef);
    if (lastVisited) {
      log.info({ campaignId, target, via: 'ambiguous_referent', name: lastVisited.kind === LOCATION_KIND_WORLD ? lastVisited.canonicalName : lastVisited.name }, 'travel target resolved via ambiguous referent');
      return rowToDest(lastVisited, 'ambiguous_referent');
    }
  }

  // 4. Recent narrative scan — partial name match against location names that
  //    appeared in the last few scenes' text or in compressed memory facts.
  //    Catches "Idę tam gdzie był Bjorn" → narrative may have mentioned the
  //    place by name without the player typing the full string.
  const narrativeText = collectRecentText({ recentScenes, gameStateSummary });
  if (narrativeText) {
    const narrativeHit = matchInRecentText(visible, queryNorm, narrativeText);
    if (narrativeHit) {
      log.info({ campaignId, target, via: 'recent_narrative', name: narrativeHit.kind === LOCATION_KIND_WORLD ? narrativeHit.canonicalName : narrativeHit.name }, 'travel target resolved via recent narrative');
      return rowToDest(narrativeHit, 'recent_narrative');
    }
  }

  // 5. Miss in civilization → no-op (AI subloc creation will handle it).
  const currentRow = await loadCurrentRow(currentRef);
  const isCivilization = currentRow
    && typeof currentRow.locationType === 'string'
    && !TERRAIN_LOCATION_TYPES.has(currentRow.locationType);
  if (isCivilization) {
    log.info(
      { campaignId, target, currentType: currentRow.locationType },
      'Travel target unmatched but current is civilization — no-op (AI subloc creation will handle)',
    );
    return null;
  }

  // 6. Wilderness fallback.
  const fromName = currentRef?.name || null;
  const flavorName = generateWildernessFlavor({ playerAction, fromName });
  return {
    kind: null,
    id: null,
    name: flavorName,
    row: null,
    source: 'wilderness_fallback',
  };
}

function rowToDest(row, source) {
  return {
    kind: row.kind,
    id: row.id,
    name: row.kind === LOCATION_KIND_WORLD ? (row.canonicalName || row.displayName) : row.name,
    row,
    source,
  };
}

function normalizeNpcName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Matches an NPC by full name OR by first-name only (most travel phrases are
// "idę do Bjorna", not "idę do Bjorn Mocnoręki"). Case + whitespace
// insensitive.
function matchNpcByName(npcs, queryNorm) {
  if (!Array.isArray(npcs) || npcs.length === 0) return null;
  for (const npc of npcs) {
    const full = normalizeNpcName(npc?.name);
    if (!full) continue;
    if (full === queryNorm) return npc;
    const first = full.split(' ')[0];
    if (first && first === queryNorm) return npc;
    // Polish vocative/genitive endings are noisy ("Bjorna" vs "Bjorn"). Catch
    // the common ones via prefix match when the noun is short — anything
    // starting with the canonical first-name is likely the same NPC.
    if (first.length >= 3 && queryNorm.startsWith(first)) return npc;
  }
  return null;
}

// Try shadow `lastLocationKind/Id` first (this campaign's truth), then
// canonical `currentLocationId`. Looks the row up in the visible-fog set so
// we never resolve to a location the player hasn't discovered.
async function resolveNpcLocation(npc, visible) {
  const candidates = [];
  if (npc.lastLocationKind && npc.lastLocationId) {
    candidates.push({ kind: npc.lastLocationKind, id: npc.lastLocationId });
  }
  if (npc.currentLocationId) {
    candidates.push({ kind: LOCATION_KIND_WORLD, id: npc.currentLocationId });
  }
  for (const c of candidates) {
    const row = visible.find((v) => v.kind === c.kind && v.id === c.id);
    if (row) return row;
  }
  return null;
}

// Last-visited location from fog, sorted by visitedAt desc. Falls back to a
// plain Array order when timestamp data is unavailable. Excludes the player's
// current ref so "tam" / "z powrotem" doesn't loop them in place.
function pickLastVisitedDifferentFromCurrent(visible, currentRef) {
  if (!visible.length) return null;
  const visitedSet = new Set();
  for (const v of visible) {
    // listLocationsForCampaign{visibleOnly:true} already passed the location
    // through fog filtering; we only need to check the kind+id pair against
    // the current to avoid no-ops.
    const refKey = `${v.kind}:${v.id}`;
    visitedSet.add(refKey);
  }
  const currentKey = currentRef ? `${currentRef.kind}:${currentRef.id}` : null;
  // Sort by `lastVisitedAt` if the row carries it (CampaignDiscoveredLocation
  // join produces it); else pick whichever isn't current. Visible list is
  // canonical+campaign mixed, so just pick the last one that isn't current.
  for (let i = visible.length - 1; i >= 0; i -= 1) {
    const row = visible[i];
    const key = `${row.kind}:${row.id}`;
    if (key === currentKey) continue;
    if (!visitedSet.has(key)) continue;
    return row;
  }
  return null;
}

function collectRecentText({ recentScenes, gameStateSummary }) {
  const parts = [];
  if (Array.isArray(recentScenes)) {
    for (const scene of recentScenes.slice(-3)) {
      if (typeof scene?.narrative === 'string') parts.push(scene.narrative);
      if (typeof scene?.chosenAction === 'string') parts.push(scene.chosenAction);
    }
  }
  if (typeof gameStateSummary === 'string' && gameStateSummary.trim()) {
    parts.push(gameStateSummary);
  }
  return parts.join('\n');
}

// Recent-narrative match: a visible location whose name appears in the recent
// text AND partially matches the player's query. Two-step gate avoids picking
// a random visible location just because the query is a vague verb.
function matchInRecentText(visible, queryNorm, narrativeText) {
  const haystack = narrativeText.toLowerCase();
  for (const row of visible) {
    const candidates = [];
    if (row.kind === LOCATION_KIND_WORLD) {
      if (row.canonicalName) candidates.push(row.canonicalName);
      if (row.displayName) candidates.push(row.displayName);
    } else if (row.name) {
      candidates.push(row.name);
    }
    if (Array.isArray(row.aliases)) candidates.push(...row.aliases);
    for (const c of candidates) {
      const n = normalizeLocationName(c || '');
      if (!n || n.length < 3) continue;
      // Location name must appear in recent text...
      if (!haystack.includes(n)) continue;
      // ...AND share at least 3 characters with the query.
      if (queryNorm.length < 3) continue;
      if (n.includes(queryNorm) || queryNorm.includes(n)) return row;
    }
  }
  return null;
}

function matchByName(rows, queryNorm) {
  for (const row of rows) {
    const candidates = [];
    if (row.kind === LOCATION_KIND_WORLD) {
      if (row.canonicalName) candidates.push(row.canonicalName);
      if (row.displayName) candidates.push(row.displayName);
    } else {
      if (row.name) candidates.push(row.name);
    }
    if (Array.isArray(row.aliases)) candidates.push(...row.aliases);
    for (const c of candidates) {
      const n = normalizeLocationName(c || '');
      if (!n) continue;
      if (n === queryNorm) return row;
      if (n.includes(queryNorm) && queryNorm.length >= 3) return row;
      if (queryNorm.includes(n) && n.length >= 3) return row;
    }
  }
  return null;
}

async function loadCurrentRow(currentRef) {
  if (!currentRef?.kind || !currentRef?.id) return null;
  try {
    if (currentRef.kind === LOCATION_KIND_WORLD) {
      return await prisma.worldLocation.findUnique({
        where: { id: currentRef.id },
        select: { id: true, canonicalName: true, locationType: true, parentLocationId: true, regionX: true, regionY: true },
      });
    }
    if (currentRef.kind === LOCATION_KIND_CAMPAIGN) {
      return await prisma.campaignLocation.findUnique({
        where: { id: currentRef.id },
        select: { id: true, name: true, locationType: true, parentLocationKind: true, parentLocationId: true, regionX: true, regionY: true },
      });
    }
  } catch (err) {
    log.warn({ err: err?.message, currentRef }, 'loadCurrentRow failed');
  }
  return null;
}

/**
 * Server-generated wilderness flavor. Pure flavor — no DB row materialized,
 * no map entry. Player never visits the same "Las" twice.
 *
 * Exported for testability; resolver uses it inline.
 */
export function generateWildernessFlavor({ playerAction = '', fromName = null } = {}) {
  const base = WILDERNESS_FLAVOR_NAMES[Math.floor(Math.random() * WILDERNESS_FLAVOR_NAMES.length)];
  const dirHit = DIRECTION_PHRASES.find((d) => d.re.test(playerAction || ''));
  if (dirHit) return `${base} ${dirHit.suffix}`;
  if (fromName) return `${base} (od ${fromName})`;
  return base;
}

/**
 * Walk up the parent chain of a polymorphic location ref. Returns the set
 * of `${kind}:${id}` strings encountered (incl. starting ref). Used by the
 * post-process auto-promote rule in processStateChanges.
 */
export async function walkUpAncestors({ kind, id }) {
  const visited = new Set();
  if (!kind || !id) return visited;
  let curKind = kind;
  let curId = id;
  for (let i = 0; i < 10 && curId; i += 1) {
    const refKey = `${curKind}:${curId}`;
    if (visited.has(refKey)) break;
    visited.add(refKey);
    try {
      if (curKind === LOCATION_KIND_WORLD) {
        const row = await prisma.worldLocation.findUnique({
          where: { id: curId },
          select: { parentLocationId: true },
        });
        if (!row?.parentLocationId) break;
        // WorldLocation parents are always WorldLocation (single-table FK).
        curId = row.parentLocationId;
        curKind = LOCATION_KIND_WORLD;
      } else if (curKind === LOCATION_KIND_CAMPAIGN) {
        const row = await prisma.campaignLocation.findUnique({
          where: { id: curId },
          select: { parentLocationKind: true, parentLocationId: true },
        });
        if (!row?.parentLocationKind || !row?.parentLocationId) break;
        curKind = row.parentLocationKind;
        curId = row.parentLocationId;
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return visited;
}
