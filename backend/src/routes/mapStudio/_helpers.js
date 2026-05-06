// Shared helpers for the Map Studio route handlers.

import { toUuid } from '../../services/hashService.js';

/**
 * Run `fn` over `items` with bounded concurrency, preserving input order.
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
  const id = toUuid(value);
  if (!id) {
    reply.code(400).send({ error: `Invalid ${field}` });
    return null;
  }
  return id;
}

// Prisma Json columns return native objects — deserializers are identity
// passthroughs. Kept as named functions so callers don't need updating.
export const deserializePack = (row) => row;
export const deserializeTileset = (row) => row;
export const deserializeTile = (row) => row;
export const deserializeAutotileGroup = (row) => row;
export const deserializeRule = (row) => row;
export const deserializeMap = (row) => row;

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
