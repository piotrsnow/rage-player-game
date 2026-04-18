// Living World — canonical WorldNPC / WorldLocation CRUD + name-based dedupe.
//
// Two write paths:
//   - findOrCreateWorldLocation: fuzzy-name dedupe by normalized canonical name.
//   - findOrCreateWorldNPC: exact-match dedupe on (name + role + factionId).
//
// Both are idempotent — safe to call from scene processing even with retries.
//
// Semantic (embedding-based) dedupe is deferred — see
// `knowledge/ideas/living-world-vector-search.md`. We still populate
// `embeddingText` so a future backfill script can compute + index embeddings
// once the scale (~1000+ NPCs) justifies the Atlas tier and per-write cost.

import { ObjectId } from 'mongodb';
import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { buildNPCEmbeddingText } from '../embeddingService.js';

const log = childLogger({ module: 'worldStateService' });

/**
 * Normalize a location name for fuzzy dedup. Strips Polish geo qualifiers
 * so variants collapse to one canonical record. Mirrors the logic in
 * memoryCompressor.normalizeLocationName but exported for reuse.
 */
export function normalizeLocationName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/\s+(w|we|na|pod|przy|obok|koło|kolo|do)\s+[a-ząćęłńóśźż][\wąćęłńóśźż-]*\.?/gi, ' ')
    .replace(/[.,;:!?"„"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonical-id slug for a WorldNPC derived from name + faction/role plus
 * a random suffix. Not stored as unique in Mongo — dedupe is done on
 * (name + role + factionId) via findFirst. Handy for logs/stable refs.
 */
export function buildNpcCanonicalId({ name, role, factionId }) {
  const base = (name || '')
    .toLowerCase()
    .replace(/[^\wąćęłńóśźż]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const qual = [role, factionId]
    .filter(Boolean)
    .map((s) => s.toLowerCase().replace(/[^\wąćęłńóśźż]+/g, '_'))
    .join('_');
  const suffix = Math.random().toString(36).slice(2, 8);
  return qual ? `${base}_${qual}_${suffix}` : `${base}_${suffix}`;
}

// ──────────────────────────────────────────────────────────────────────
// WorldLocation
// ──────────────────────────────────────────────────────────────────────

/**
 * Find an existing WorldLocation via fuzzy normalized-name match, or create
 * a new one. Returns the WorldLocation row. Best-effort embed on create —
 * embedding failure doesn't block returning the record.
 */
export async function findOrCreateWorldLocation(rawName, { region = null, description = '' } = {}) {
  if (!rawName || typeof rawName !== 'string') return null;
  const name = rawName.trim();
  if (!name) return null;

  const norm = normalizeLocationName(name);
  if (!norm) return null;

  // Fast path: exact canonicalName hit
  const exact = await prisma.worldLocation.findUnique({ where: { canonicalName: name } });
  if (exact) return exact;

  // Fuzzy path: scan aliases + existing canonical names
  const candidates = await prisma.worldLocation.findMany({
    where: region ? { region } : undefined,
    select: { id: true, canonicalName: true, aliases: true, region: true, description: true, embeddingText: true },
  });
  for (const rec of candidates) {
    const recNorm = normalizeLocationName(rec.canonicalName);
    if (recNorm === norm) return rec;
    try {
      const aliases = JSON.parse(rec.aliases || '[]');
      if (aliases.some((a) => normalizeLocationName(a) === norm)) {
        // Found via alias — promote to aliases if not already
        return rec;
      }
    } catch {
      // ignore malformed aliases
    }
    // Substring containment — very loose, only for close variants
    if (recNorm && norm && (recNorm.includes(norm) || norm.includes(recNorm))) {
      // Merge: append this variant as alias for future resolution
      try {
        const aliases = JSON.parse(rec.aliases || '[]');
        if (!aliases.includes(name)) {
          aliases.push(name);
          await prisma.worldLocation.update({
            where: { id: rec.id },
            data: { aliases: JSON.stringify(aliases) },
          });
        }
      } catch (err) {
        log.warn({ err, locationId: rec.id }, 'Failed to merge location alias');
      }
      return rec;
    }
  }

  // Create new canonical record. `embeddingText` is populated but no vector
  // is computed — see note at top of file.
  const embText = description ? `${name}: ${description}` : name;
  const created = await prisma.worldLocation.create({
    data: {
      canonicalName: name,
      aliases: JSON.stringify([name]),
      description,
      region,
      embeddingText: embText,
    },
  });

  return created;
}

// ──────────────────────────────────────────────────────────────────────
// WorldNPC
// ──────────────────────────────────────────────────────────────────────

/**
 * Find (name-dedupe) or create a WorldNPC. Matches by case-insensitive name
 * + role + factionId, preferring alive entries. Loose enough to avoid
 * proliferation on name variants, strict enough to keep distinct NPCs separate.
 *
 * Semantic dedupe (cosine similarity on embeddings) is deferred — see
 * `knowledge/ideas/living-world-vector-search.md`.
 *
 * npcData shape: { name, role?, personality?, factionId?, alignment?,
 *                  alive?, currentLocationId? }
 */
export async function findOrCreateWorldNPC(npcData) {
  if (!npcData?.name) return null;

  const name = npcData.name.trim();
  const role = npcData.role || null;
  const factionId = npcData.factionId || null;

  // Name-based dedupe. Prefer alive match on (name + role + factionId).
  const existing = await prisma.worldNPC.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      role,
      factionId,
      alive: true,
    },
  });
  if (existing) return existing;

  // Embedding text populated for future backfill — no vector written now.
  const embText = buildNPCEmbeddingText(npcData);
  const canonicalId = buildNpcCanonicalId(npcData);
  const created = await prisma.worldNPC.create({
    data: {
      canonicalId,
      name,
      role,
      personality: npcData.personality || null,
      factionId,
      alignment: npcData.alignment || 'neutral',
      alive: npcData.alive !== false,
      currentLocationId: npcData.currentLocationId || null,
      embeddingText: embText,
    },
  });

  return created;
}

/**
 * Update current location for a WorldNPC (canonical). Best-effort —
 * returns boolean. Used by npcLifecycle when NPC moves between locations.
 */
export async function setWorldNpcLocation(worldNpcId, locationId) {
  if (!worldNpcId) return false;
  try {
    await prisma.worldNPC.update({
      where: { id: worldNpcId },
      data: { currentLocationId: locationId || null },
    });
    return true;
  } catch (err) {
    log.warn({ err, worldNpcId }, 'Failed to update WorldNPC location');
    return false;
  }
}

/**
 * Mark a WorldNPC as dead (alive=false). Irreversible at the WorldNPC level —
 * Phase 3 adds first-write-wins atomic semantics for cross-user kills.
 */
export async function killWorldNpc(worldNpcId) {
  if (!worldNpcId) return false;
  try {
    await prisma.worldNPC.update({
      where: { id: worldNpcId },
      data: { alive: false },
    });
    return true;
  } catch (err) {
    log.warn({ err, worldNpcId }, 'Failed to mark WorldNPC dead');
    return false;
  }
}

/**
 * Fetch all WorldNPCs currently at a location. Includes paused NPCs so
 * scene assembly can surface "Bjorn jeszcze tu jest, tylko śpi" via
 * pauseSnapshot. Callers filter by pausedAt as needed.
 */
export async function listNpcsAtLocation(locationId, { aliveOnly = true } = {}) {
  if (!locationId) return [];
  const where = { currentLocationId: locationId };
  if (aliveOnly) where.alive = true;
  return prisma.worldNPC.findMany({ where });
}

/**
 * Coerce ObjectId-ish strings to clean strings for Prisma @db.ObjectId columns.
 * Handy when callers pass raw ids from mongo driver (BSON ObjectId instances).
 */
export function toObjectIdString(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value.toString();
  return String(value);
}
