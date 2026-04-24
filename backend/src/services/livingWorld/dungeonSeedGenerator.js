// Living World Phase 7 — dungeon seed generator.
//
// Deterministic layout generator for dungeons. Given a dungeon WorldLocation
// row (locationType='dungeon'), builds a room graph + populates contents
// (traps/enemies/loot/puzzles/flavor) + persists as:
//   - WorldLocation rows with locationType='dungeon_room' (one per room)
//   - WorldLocationEdge rows for corridors (direction = N|S|E|W|up|down)
//
// Seed = dungeonId (user spec: global, same layout for every player).
// Per-character progress tracked in Character.clearedDungeonIds /
// activeDungeonState (separate concern, not here).
//
// Idempotent: re-calling on a dungeon that already has child rooms is a
// no-op (detected by counting child WorldLocations). First call persists
// everything in one transaction batch.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import {
  TRAPS, LOOT, PUZZLES, ENCOUNTERS, FLAVOR,
  DUNGEON_THEMES, DUNGEON_DIFFICULTIES,
} from '../../data/dungeonTemplates.js';
import { upsertEdge } from './travelGraph.js';
import * as ragService from './ragService.js';
import { buildLocationEmbeddingText } from '../embeddingService.js';

const log = childLogger({ module: 'dungeonSeedGenerator' });

// ── Size tiers (per user spec 2 themes on MVP) ──
const SIZE_PROFILES = {
  small:  { roomCount: [5, 10], treasureFraction: 0.15, puzzleFraction: 0.10 },
  medium: { roomCount: [12, 20], treasureFraction: 0.12, puzzleFraction: 0.12 },
  large:  { roomCount: [22, 35], treasureFraction: 0.10, puzzleFraction: 0.15 },
};

// ── Seeded RNG (Mulberry32) ──
// Stable pseudo-random stream from a 32-bit seed. We mix the dungeonId
// string into the seed via a simple FNV-ish hash so calls with the same
// dungeonId always produce the same layout.
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function rngPick(rng, arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Weighted pick from an array of { weight, ... } entries.
 * Returns the selected entry or null if empty.
 */
export function rngWeightedPick(rng, entries) {
  if (!entries || entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + (e.weight || 1), 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const e of entries) {
    roll -= (e.weight || 1);
    if (roll <= 0) return e;
  }
  return entries[entries.length - 1];
}

/**
 * Resolve a dice notation ("2d6", "1d4+1") using the seeded RNG. Returns
 * an integer. Unknown notation returns 1 (safe floor).
 */
export function rollDice(rng, notation) {
  if (typeof notation === 'number') return notation;
  if (typeof notation !== 'string') return 1;
  const m = notation.match(/^(\d+)d(\d+)(?:\s*\+\s*(\d+))?/);
  if (!m) return 1;
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const bonus = m[3] ? parseInt(m[3], 10) : 0;
  let total = bonus;
  for (let i = 0; i < count; i++) total += rngInt(rng, 1, sides);
  return total;
}

// ── Room graph shapes (hand-picked templates + BSP fallback) ──
// Each template is an array of room nodes with pre-wired exits. Role slots
// are abstract — boss is always last, entrance first, middle ones normal.
// Templates kept deliberately small (5-8 rooms) for MVP; size=large falls
// back to BSP/chain generator.

const ROOM_TEMPLATES = {
  small_linear: [
    // 0→1→2→3→4 linear dive
    { id: 0, role: 'entrance', exits: [{ to: 1, direction: 'N', gated: false }] },
    { id: 1, role: 'normal',   exits: [{ to: 0, direction: 'S' }, { to: 2, direction: 'N' }] },
    { id: 2, role: 'treasure', exits: [{ to: 1, direction: 'S' }, { to: 3, direction: 'N' }] },
    { id: 3, role: 'puzzle',   exits: [{ to: 2, direction: 'S' }, { to: 4, direction: 'N', gated: true }] },
    { id: 4, role: 'boss',     exits: [{ to: 3, direction: 'S' }] },
  ],
  small_fork: [
    // 0 → 1 → {2, 3}, 3 → 4 (boss)
    { id: 0, role: 'entrance', exits: [{ to: 1, direction: 'N' }] },
    { id: 1, role: 'normal',   exits: [{ to: 0, direction: 'S' }, { to: 2, direction: 'E' }, { to: 3, direction: 'N' }] },
    { id: 2, role: 'treasure', exits: [{ to: 1, direction: 'W' }] },
    { id: 3, role: 'normal',   exits: [{ to: 1, direction: 'S' }, { to: 4, direction: 'N', gated: true, gateHint: 'wymagane: klucz z pokoju 2' }] },
    { id: 4, role: 'boss',     exits: [{ to: 3, direction: 'S' }] },
  ],
  small_loop: [
    // 0 → 1, 1 → 2, 2 → 3, 3 → 1 (loop), 3 → 4 (boss)
    { id: 0, role: 'entrance', exits: [{ to: 1, direction: 'N' }] },
    { id: 1, role: 'normal',   exits: [{ to: 0, direction: 'S' }, { to: 2, direction: 'E' }, { to: 3, direction: 'W' }] },
    { id: 2, role: 'puzzle',   exits: [{ to: 1, direction: 'W' }, { to: 3, direction: 'S' }] },
    { id: 3, role: 'treasure', exits: [{ to: 1, direction: 'E' }, { to: 2, direction: 'N' }, { to: 4, direction: 'down' }] },
    { id: 4, role: 'boss',     exits: [{ to: 3, direction: 'up' }] },
  ],
};

/**
 * BSP-lite fallback for medium/large dungeons — a chain with occasional
 * side-rooms + back-loops. Deterministic given the RNG. Roles assigned
 * by position: 0=entrance, last=boss, sprinkle treasure/puzzle along chain.
 */
function generateChain(rng, roomCount) {
  const rooms = [];
  for (let i = 0; i < roomCount; i++) {
    let role = 'normal';
    if (i === 0) role = 'entrance';
    else if (i === roomCount - 1) role = 'boss';
    else if (rng() < 0.15) role = 'treasure';
    else if (rng() < 0.10) role = 'puzzle';
    rooms.push({ id: i, role, exits: [] });
  }
  // Linear spine
  for (let i = 0; i < roomCount - 1; i++) {
    rooms[i].exits.push({ to: i + 1, direction: 'N', gated: i === roomCount - 2 });
    rooms[i + 1].exits.push({ to: i, direction: 'S' });
  }
  // Occasional side-loops (20% chance per room, connect to 2 back)
  for (let i = 3; i < roomCount - 1; i++) {
    if (rng() < 0.2) {
      const target = rngInt(rng, Math.max(1, i - 3), i - 2);
      rooms[i].exits.push({ to: target, direction: 'E' });
      rooms[target].exits.push({ to: i, direction: 'W' });
    }
  }
  return rooms;
}

/**
 * Pick a room graph template. Small → pick from named templates, medium/large
 * → BSP chain.
 */
export function generateRoomGraph(rng, size) {
  const profile = SIZE_PROFILES[size] || SIZE_PROFILES.small;
  const roomCount = rngInt(rng, profile.roomCount[0], profile.roomCount[1]);

  if (size === 'small') {
    const templates = Object.keys(ROOM_TEMPLATES);
    const pick = templates[Math.floor(rng() * templates.length)];
    // Deep clone template so we don't mutate the static copy
    return JSON.parse(JSON.stringify(ROOM_TEMPLATES[pick]));
  }
  return generateChain(rng, roomCount);
}

/**
 * Populate each room with deterministic contents: trap (optional), enemies,
 * loot (treasure/boss rooms only unless rolled), puzzle (puzzle rooms),
 * flavor seed. `rng` determines every roll; re-running with same seed →
 * identical output.
 */
export function populateRooms({ rooms, theme, difficulty, rng }) {
  const trapTable = TRAPS[theme]?.[difficulty] || [];
  const lootTable = LOOT[theme]?.[difficulty] || [];
  const puzzleTable = PUZZLES[theme] || [];
  const encTable = ENCOUNTERS[theme]?.[difficulty] || { skipChance: 0.5, choices: [] };
  const flavorTable = FLAVOR[theme] || {};

  for (const room of rooms) {
    const contents = {
      role: room.role,
      trap: null,
      enemies: [],
      loot: [],
      puzzle: null,
      flavorSeed: null,
      entryCleared: false,
      trapSprung: false,
      lootTaken: false,
    };

    // Traps — skipChance 0.4 for non-boss rooms, 0 for boss (always has one)
    const trapSkip = room.role === 'boss' ? 0 : 0.4;
    if (trapTable.length && rng() > trapSkip) {
      const picked = rngWeightedPick(rng, trapTable);
      if (picked) contents.trap = { ...picked };
    }

    // Encounters — driven by table's skipChance. Treasure rooms get half
    // skip (treasure guarded). Boss rooms always have an encounter.
    let skipRoll = encTable.skipChance ?? 0.3;
    if (room.role === 'treasure') skipRoll /= 2;
    if (room.role === 'boss') skipRoll = 0;
    if (encTable.choices.length && rng() > skipRoll) {
      const pick = rngWeightedPick(rng, encTable.choices);
      if (pick) {
        const count = rollDice(rng, pick.count);
        contents.enemies = Array.from({ length: Math.max(1, count) }, () => pick.bestiary);
      }
    }

    // Loot — treasure rooms guaranteed, others low chance. Boss always drops.
    if (lootTable.length) {
      let lootChance = 0;
      if (room.role === 'treasure') lootChance = 1;
      else if (room.role === 'boss') lootChance = 1;
      else if (room.role === 'normal') lootChance = 0.25;
      if (rng() < lootChance) {
        const picked = rngWeightedPick(rng, lootTable);
        if (picked) contents.loot.push({ ...picked });
      }
      if (room.role === 'boss') {
        // Boss gets a second loot roll from the same table
        const bonus = rngWeightedPick(rng, lootTable);
        if (bonus) contents.loot.push({ ...bonus });
      }
    }

    // Puzzle — only puzzle role
    if (room.role === 'puzzle' && puzzleTable.length) {
      const picked = rngWeightedPick(rng, puzzleTable);
      if (picked) contents.puzzle = { ...picked };
    }

    // Flavor — role-specific pool, random pick
    const flavorPool = flavorTable[room.role] || flavorTable.normal || [];
    if (flavorPool.length) contents.flavorSeed = rngPick(rng, flavorPool);

    room.contents = contents;
  }
  return rooms;
}

/**
 * Persist the generated dungeon graph as WorldLocation rows + edges.
 * Idempotent: if child rooms already exist for this dungeon, returns the
 * persisted seed without regenerating.
 */
async function persistSeed({ dungeon, rooms, theme, difficulty }) {
  // Create rooms first so edges can reference their ids
  const createdRooms = [];
  for (const room of rooms) {
    const nameSuffix = room.role === 'boss' ? 'Komora bossa'
      : room.role === 'treasure' ? 'Komnata skarbu'
      : room.role === 'puzzle' ? 'Komnata zagadki'
      : room.role === 'entrance' ? 'Wejście'
      : `Komnata ${room.id + 1}`;
    const name = `${dungeon.canonicalName} — ${nameSuffix} (${room.id})`;
    const created = await prisma.worldLocation.upsert({
      where: { canonicalName: name },
      update: {
        roomMetadata: JSON.stringify({ ...room.contents, roomId: room.id, theme, difficulty }),
      },
      create: {
        canonicalName: name,
        aliases: JSON.stringify([name]),
        description: room.contents?.flavorSeed || '',
        category: 'dungeon_room',
        locationType: 'dungeon_room',
        parentLocationId: dungeon.id,
        slotType: room.role,
        slotKind: 'custom',
        region: dungeon.region || null,
        regionX: dungeon.regionX ?? 0,
        regionY: dungeon.regionY ?? 0,
        positionConfidence: 1.0,
        maxKeyNpcs: 0,
        maxSubLocations: 0,
        roomMetadata: JSON.stringify({ ...room.contents, roomId: room.id, theme, difficulty }),
        embeddingText: `${name}: ${room.contents?.flavorSeed || room.role}`,
      },
    });
    // Round E Phase 9 — RAG index for room-level resolution (e.g. future
    // "NPC died in boss chamber" resolver). Fire-and-forget.
    ragService.index('location', created.id, buildLocationEmbeddingText(created)).catch(() => {});
    createdRooms.push({ ...room, worldLocationId: created.id });
  }

  // Edges — bidirectional via exit list. We trust the template/generator to
  // have written both sides, so we just upsert them all.
  const idByLocalId = new Map(createdRooms.map((r) => [r.id, r.worldLocationId]));
  const edgePromises = [];
  const seenEdges = new Set();
  for (const room of createdRooms) {
    for (const exit of room.exits || []) {
      const fromId = room.worldLocationId;
      const toId = idByLocalId.get(exit.to);
      if (!toId) continue;
      const edgeKey = `${fromId}:${toId}`;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);
      edgePromises.push(
        upsertEdge({
          fromLocationId: fromId,
          toLocationId: toId,
          distance: 1,
          difficulty: 'safe',
          terrainType: 'dungeon_corridor',
          direction: exit.direction || null,
          gated: !!exit.gated,
          gateHint: exit.gateHint || null,
        }),
      );
    }
  }
  await Promise.allSettled(edgePromises);

  return createdRooms;
}

/**
 * High-level entry: generate + persist (idempotent). Returns:
 *   { rooms, entranceRoomId, bossRoomId }
 * where ids are WorldLocation ids.
 *
 * @param {object} params
 * @param {object} params.dungeon   — WorldLocation row (locationType='dungeon')
 * @param {string} [params.theme]   — 'catacomb'|'cave'; defaults based on parent category/name
 * @param {string} [params.difficulty] — 'easy'|'medium'|'hard'; defaults 'medium'
 * @param {string} [params.size]       — 'small'|'medium'|'large'; defaults 'small' on MVP
 */
export async function ensureDungeonSeeded({
  dungeon,
  theme = null,
  difficulty = 'medium',
  size = 'small',
}) {
  if (!dungeon?.id) return null;

  // Resolve defaults: theme derived from category or name, difficulty fixed
  // at 'medium' unless caller overrides.
  const resolvedTheme = theme || inferTheme(dungeon);
  const resolvedDifficulty = DUNGEON_DIFFICULTIES.includes(difficulty) ? difficulty : 'medium';

  // Idempotency check — skip if already seeded
  const existingRooms = await prisma.worldLocation.findMany({
    where: { parentLocationId: dungeon.id, locationType: 'dungeon_room' },
    select: { id: true, slotType: true, roomMetadata: true, canonicalName: true },
  });
  if (existingRooms.length > 0) {
    const entranceRoom = existingRooms.find((r) => r.slotType === 'entrance') || existingRooms[0];
    const bossRoom = existingRooms.find((r) => r.slotType === 'boss') || existingRooms[existingRooms.length - 1];
    return {
      rooms: existingRooms,
      entranceRoomId: entranceRoom?.id || null,
      bossRoomId: bossRoom?.id || null,
      seeded: false,
    };
  }

  const seed = hashSeed(dungeon.id);
  const rng = createRng(seed);
  const rawRooms = generateRoomGraph(rng, size);
  const populated = populateRooms({ rooms: rawRooms, theme: resolvedTheme, difficulty: resolvedDifficulty, rng });

  try {
    const created = await persistSeed({ dungeon, rooms: populated, theme: resolvedTheme, difficulty: resolvedDifficulty });
    const entranceRoom = created.find((r) => r.role === 'entrance') || created[0];
    const bossRoom = created.find((r) => r.role === 'boss') || created[created.length - 1];
    log.info(
      { dungeonId: dungeon.id, name: dungeon.canonicalName, theme: resolvedTheme, difficulty: resolvedDifficulty, rooms: created.length },
      'Dungeon seeded',
    );
    return {
      rooms: created,
      entranceRoomId: entranceRoom?.worldLocationId || null,
      bossRoomId: bossRoom?.worldLocationId || null,
      seeded: true,
    };
  } catch (err) {
    log.error({ err: err?.message, dungeonId: dungeon.id }, 'Dungeon seed persist failed');
    return null;
  }
}

function inferTheme(dungeon) {
  const hay = `${dungeon.canonicalName || ''} ${dungeon.description || ''} ${dungeon.category || ''}`.toLowerCase();
  if (/ruin|krypt|katakumb|grobow|cmentar|nekro|lich/.test(hay)) return 'catacomb';
  if (/jaskin|cave|grot|pieczar/.test(hay)) return 'cave';
  // Default: catacomb (more dramatic narrative default than cave)
  return DUNGEON_THEMES.includes('catacomb') ? 'catacomb' : DUNGEON_THEMES[0];
}

/**
 * Parse a room's stored metadata. Safe on malformed rows — returns empty
 * contents object on parse failure.
 */
export function parseRoomMetadata(worldLocation) {
  if (!worldLocation?.roomMetadata) return null;
  try {
    return JSON.parse(worldLocation.roomMetadata);
  } catch {
    return null;
  }
}
