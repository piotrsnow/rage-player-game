// Round E Phase 9 — unified retrieval for world-scope entities.
//
// Callers (now + planned):
//   - WorldNPC / WorldLocation creation (seedWorld.js + worldStateService.js +
//     processStateChanges/locations.js) index a text summary on write.
//   - Post-campaign write-back (Phase 12): resolve LLM-extracted fact hints
//     to canonical entities via `query('...', { filters: { entityType: 'npc' } })`.
//   - Promotion dedup (Phase 12b/12c): `query(candidateText, { entityType:
//     'promotion_candidate' }, topK=5)` before inserting a new candidate.
//   - Lore chunk retrieval (Round D, deferred): `query(sceneContext,
//     { entityType: 'lore_chunk' }, topK=5)` once WorldLoreSection is chunked.
//
// Storage: `WorldEntityEmbedding` table, unique on (entityType, entityId).
// pgvector HNSW index on `embedding`; cosine distance via `<=>` operator.
// Writes use `$executeRawUnsafe` because `Unsupported("vector(1536)")` columns
// can't be bound through the typed Prisma client.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { embedText } from '../embeddingService.js';

const log = childLogger({ module: 'ragService' });

const VALID_ENTITY_TYPES = new Set([
  'npc', 'location', 'lore_chunk',
  'promotion_candidate', 'location_promotion_candidate',
  'npc_memory',
]);

function assertEntityType(entityType) {
  if (!VALID_ENTITY_TYPES.has(entityType)) {
    throw new Error(`ragService: invalid entityType "${entityType}"`);
  }
}

function vectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}

/**
 * Embed `text` and upsert into WorldEntityEmbedding.
 * Returns the embedding array on success, null on empty/failed input.
 * Non-throwing: embedding provider errors are logged and swallowed so
 * entity creation stays resilient. Callers should not await in hot paths;
 * fire-and-forget with a `.catch` is the canonical pattern (see call sites).
 */
export async function index(entityType, entityId, text) {
  assertEntityType(entityType);
  if (!entityId || !text || !text.trim()) return null;

  try {
    const embedding = await embedText(text);
    if (!embedding) return null;

    const vec = vectorLiteral(embedding);
    // Manual upsert via raw SQL — `embedding` is Unsupported("vector(1536)")
    // and can't go through prisma.worldEntityEmbedding.upsert.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "WorldEntityEmbedding" ("entityType", "entityId", "text", "embedding", "updatedAt")
       VALUES ($1, $2, $3, $4::vector, now())
       ON CONFLICT ("entityType", "entityId") DO UPDATE SET
         "text" = EXCLUDED."text",
         "embedding" = EXCLUDED."embedding",
         "updatedAt" = now()`,
      entityType, entityId, text, vec,
    );
    return embedding;
  } catch (err) {
    log.warn({ err: err?.message, entityType, entityId }, 'ragService.index failed');
    return null;
  }
}

/**
 * Top-K nearest embeddings to `queryText` by cosine similarity.
 *
 * Options:
 *   - filters.entityType: string | string[] — restrict the search pool
 *   - filters.entityIds: string[] — restrict to a specific entity id list
 *   - topK: number (default 5)
 *   - minSim: number (default 0.5) — minimum cosine similarity
 *
 * Returns: [{ entityId, entityType, similarity, text }]
 */
export async function query(queryText, { filters = {}, topK = 5, minSim = 0.5 } = {}) {
  if (!queryText || !queryText.trim()) return [];

  let queryEmbedding;
  try {
    queryEmbedding = await embedText(queryText);
  } catch (err) {
    log.warn({ err: err?.message }, 'ragService.query embedText failed');
    return [];
  }
  if (!queryEmbedding) return [];

  const vec = vectorLiteral(queryEmbedding);

  // Build WHERE dynamically. Parameter list grows with filters; we pass them
  // through tagged-template positional binds for safety.
  const entityTypeFilter = filters.entityType
    ? Array.isArray(filters.entityType)
      ? (filters.entityType.forEach(assertEntityType), filters.entityType)
      : (assertEntityType(filters.entityType), [filters.entityType])
    : null;

  const entityIdFilter = Array.isArray(filters.entityIds) && filters.entityIds.length
    ? filters.entityIds
    : null;

  let rows;
  if (entityTypeFilter && entityIdFilter) {
    rows = await prisma.$queryRaw`
      SELECT "entityType", "entityId", "text",
             1 - ("embedding" <=> ${vec}::vector) AS similarity
      FROM "WorldEntityEmbedding"
      WHERE "entityType" = ANY(${entityTypeFilter}::text[])
        AND "entityId" = ANY(${entityIdFilter}::text[])
      ORDER BY "embedding" <=> ${vec}::vector
      LIMIT ${topK}
    `;
  } else if (entityTypeFilter) {
    rows = await prisma.$queryRaw`
      SELECT "entityType", "entityId", "text",
             1 - ("embedding" <=> ${vec}::vector) AS similarity
      FROM "WorldEntityEmbedding"
      WHERE "entityType" = ANY(${entityTypeFilter}::text[])
      ORDER BY "embedding" <=> ${vec}::vector
      LIMIT ${topK}
    `;
  } else if (entityIdFilter) {
    rows = await prisma.$queryRaw`
      SELECT "entityType", "entityId", "text",
             1 - ("embedding" <=> ${vec}::vector) AS similarity
      FROM "WorldEntityEmbedding"
      WHERE "entityId" = ANY(${entityIdFilter}::text[])
      ORDER BY "embedding" <=> ${vec}::vector
      LIMIT ${topK}
    `;
  } else {
    rows = await prisma.$queryRaw`
      SELECT "entityType", "entityId", "text",
             1 - ("embedding" <=> ${vec}::vector) AS similarity
      FROM "WorldEntityEmbedding"
      ORDER BY "embedding" <=> ${vec}::vector
      LIMIT ${topK}
    `;
  }

  return rows.filter((r) => r.similarity >= minSim);
}

/**
 * Remove the embedding row for (entityType, entityId). Use when the source
 * entity is deleted or when its text has diverged enough that we want the
 * next `index()` call to create a fresh row instead of upserting. Silent
 * no-op when the row doesn't exist.
 */
export async function invalidate(entityType, entityId) {
  assertEntityType(entityType);
  if (!entityId) return;
  try {
    await prisma.worldEntityEmbedding.deleteMany({
      where: { entityType, entityId },
    });
  } catch (err) {
    log.warn({ err: err?.message, entityType, entityId }, 'ragService.invalidate failed');
  }
}

/**
 * Backfill helper — index every entity in `entities` that doesn't yet have
 * an embedding row. Used by seed bootstrap to bring canonical WorldNPCs /
 * WorldLocations into the store without repaying the embedding cost on
 * every boot. Returns stats { considered, indexed, skipped }.
 *
 * `textOf(entity) => string` lets the caller build the appropriate summary
 * (buildNPCEmbeddingText / buildLocationEmbeddingText / ...).
 */
export async function batchBackfillMissing(entityType, entities, textOf) {
  assertEntityType(entityType);
  if (!Array.isArray(entities) || entities.length === 0) {
    return { considered: 0, indexed: 0, skipped: 0 };
  }

  const ids = entities.map((e) => e.id).filter(Boolean);
  const existing = await prisma.worldEntityEmbedding.findMany({
    where: { entityType, entityId: { in: ids } },
    select: { entityId: true },
  });
  const existingIds = new Set(existing.map((e) => e.entityId));

  let indexed = 0;
  let skipped = 0;
  for (const entity of entities) {
    if (!entity?.id) { skipped += 1; continue; }
    if (existingIds.has(entity.id)) { skipped += 1; continue; }
    const text = textOf(entity);
    if (!text || !text.trim()) { skipped += 1; continue; }
    const result = await index(entityType, entity.id, text);
    if (result) indexed += 1;
    else skipped += 1;
  }

  return { considered: entities.length, indexed, skipped };
}
