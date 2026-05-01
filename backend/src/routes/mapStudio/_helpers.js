// Shared helpers for the Map Studio route handlers.
// Centralized so each sub-route stays under the 600L hard cap.

import { toObjectId } from '../../services/hashService.js';

/**
 * Run `fn` over `items` with bounded concurrency, preserving input order in
 * the result array. Used instead of `for … await` loops against MongoDB
 * Atlas where sequential RTTs dominate latency (100-200ms per query → a
 * 5000-row bulk patch was previously ~10-15 minutes).
 *
 * Concurrency default (32) is safely below the Prisma/Mongo connection pool
 * limit (100 by default), so we don't starve other concurrent requests.
 */
export async function pmap(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const limit = Math.min(Math.max(1, concurrency), items.length);
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export function parseJsonField(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Validate request.body against a Zod schema. On failure, sends a 400 and
 * returns `null` (the caller should return early). On success, returns the
 * parsed data.
 */
export async function validateBody(reply, schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    reply.code(400).send({
      error: 'Validation failed',
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
    return null;
  }
  return result.data;
}

export function requireObjectId(reply, value, field = 'id') {
  const id = toObjectId(value);
  if (!id) {
    reply.code(400).send({ error: `Invalid ${field}` });
    return null;
  }
  return id;
}

/**
 * Hydrate a TilesetPack row: turn JSON-string fields back into objects so
 * handlers return plain JSON over the wire.
 */
export function deserializePack(row) {
  if (!row) return row;
  return {
    ...row,
    origin: parseJsonField(row.origin, {}),
    traitVocab: parseJsonField(row.traitVocab, {}),
  };
}

export function deserializeTileset(row) {
  if (!row) return row;
  return {
    ...row,
    regions: parseJsonField(row.regions, []),
    atlas: parseJsonField(row.atlas, {}),
    renderedVariants: parseJsonField(row.renderedVariants, {}),
  };
}

export function deserializeTile(row) {
  if (!row) return row;
  return {
    ...row,
    atoms: parseJsonField(row.atoms, []),
    traits: parseJsonField(row.traits, {}),
    tags: parseJsonField(row.tags, []),
  };
}

export function deserializeAutotileGroup(row) {
  if (!row) return row;
  return {
    ...row,
    traits: parseJsonField(row.traits, {}),
    cells: parseJsonField(row.cells, {}),
  };
}

export function deserializeRule(row) {
  if (!row) return row;
  return {
    ...row,
    leftTraits: parseJsonField(row.leftTraits, {}),
    rightTraits: parseJsonField(row.rightTraits, {}),
    viaRef: parseJsonField(row.viaRef, {}),
  };
}

export function deserializeMap(row) {
  if (!row) return row;
  return {
    ...row,
    size: parseJsonField(row.size, [64, 64]),
    layers: parseJsonField(row.layers, {}),
    objects: parseJsonField(row.objects, []),
    meta: parseJsonField(row.meta, {}),
  };
}

/**
 * Run a Prisma query that must belong to the current user's pack — ensures we
 * never leak another user's tileset/tile/rule/etc. Returns the pack row or
 * null (and the caller sends 404).
 */
export async function loadPackOwned(prisma, packId, userId) {
  if (!packId) return null;
  const pack = await prisma.tilesetPack.findFirst({ where: { id: packId, userId } });
  return pack;
}

export async function loadTilesetOwned(prisma, tilesetId, userId) {
  const tileset = await prisma.tileset.findUnique({ where: { id: tilesetId } });
  if (!tileset) return null;
  const pack = await prisma.tilesetPack.findFirst({
    where: { id: tileset.packId, userId },
  });
  if (!pack) return null;
  return { tileset, pack };
}
