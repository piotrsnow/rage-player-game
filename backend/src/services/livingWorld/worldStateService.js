// Living World — canonical WorldNPC / WorldLocation CRUD + name-based dedupe.
//
// Two write paths:
//   - findOrCreateWorldLocation: fuzzy-name dedupe by normalized canonical name.
//   - findOrCreateWorldNPC: exact-match dedupe on (name + role).
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
import { buildNPCEmbeddingText, buildLocationEmbeddingText } from '../embeddingService.js';
import * as ragService from './ragService.js';

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
 * Canonical-id slug for a WorldNPC derived from name + role plus
 * a random suffix. Not stored as unique in Mongo — dedupe is done on
 * (name + role) via findFirst. Handy for logs/stable refs.
 */
export function buildNpcCanonicalId({ name, role }) {
  const base = (name || '')
    .toLowerCase()
    .replace(/[^\wąćęłńóśźż]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const qual = [role]
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
  //
  // NOTE: this path creates a rogue location with no regionX/regionY because
  // findOrCreateWorldLocation has no positioning context. It's designed for
  // seed-time creation OR fallback resolution — mid-play, the proper path is
  // `processLocationChanges → processTopLevelEntry → computeSmartPosition`
  // (triggered by LLM emitting `newLocations`). When we reach this branch
  // during a live campaign, it means premium set `currentLocation` to a brand
  // new place WITHOUT a matching `newLocations` entry. Log a warning so the
  // regression surfaces in observability; downstream the location will exist
  // but won't appear on the player map (missing coords).
  log.warn(
    { name, region },
    'findOrCreateWorldLocation: creating location without coordinates — likely a currentLocation change without matching newLocations emission',
  );
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

  // Round E Phase 9 — fire-and-forget RAG indexing. ragService.index
  // internally swallows and logs failures so the caller never sees them.
  ragService.index('location', created.id, buildLocationEmbeddingText(created)).catch(() => {});

  return created;
}

// ──────────────────────────────────────────────────────────────────────
// WorldNPC
// ──────────────────────────────────────────────────────────────────────

/**
 * Find (name-dedupe) or create a WorldNPC. Matches by case-insensitive name
 * + role, preferring alive entries. Loose enough to avoid proliferation on
 * name variants, strict enough to keep distinct NPCs separate.
 *
 * Semantic dedupe (cosine similarity on embeddings) is deferred — see
 * `knowledge/ideas/living-world-vector-search.md`.
 *
 * npcData shape: { name, role?, personality?, alignment?,
 *                  alive?, currentLocationId? }
 */
export async function findOrCreateWorldNPC(npcData) {
  if (!npcData?.name) return null;

  const name = npcData.name.trim();
  const role = npcData.role || null;

  // Name-based dedupe. Prefer alive match on (name + role).
  const existing = await prisma.worldNPC.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      role,
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
      alignment: npcData.alignment || 'neutral',
      alive: npcData.alive !== false,
      currentLocationId: npcData.currentLocationId || null,
      embeddingText: embText,
    },
  });

  // Round E Phase 9 — RAG index for world-scope retrieval.
  ragService.index('npc', created.id, embText).catch(() => {});

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
 * Create a sublocation under a named parent settlement. Idempotent:
 * re-emitting the same canonicalName upserts (so scene retry doesn't
 * double-materialize). Inherits parent position (sublocations share
 * overworld coords with their parent).
 *
 * Does NOT apply topology caps — caller is responsible for running
 * topologyGuard.decideSublocationAdmission first and passing slotType/
 * slotKind from the decision.
 *
 * Returns the WorldLocation row or null on failure.
 */
export async function createSublocation({
  name,
  parent,
  slotType = null,
  slotKind = 'custom',
  locationType = 'interior',
  description = '',
}) {
  if (!name || !parent?.id) return null;
  const cleanName = name.trim();
  if (!cleanName) return null;
  try {
    const row = await prisma.worldLocation.upsert({
      where: { canonicalName: cleanName },
      update: {
        parentLocationId: parent.id,
        locationType,
        slotType,
        slotKind,
        region: parent.region || null,
        regionX: parent.regionX ?? 0,
        regionY: parent.regionY ?? 0,
        positionConfidence: parent.positionConfidence ?? 0.5,
      },
      create: {
        canonicalName: cleanName,
        aliases: JSON.stringify([cleanName]),
        description,
        category: slotType || 'custom',
        locationType,
        parentLocationId: parent.id,
        slotType,
        slotKind,
        region: parent.region || null,
        regionX: parent.regionX ?? 0,
        regionY: parent.regionY ?? 0,
        positionConfidence: parent.positionConfidence ?? 0.5,
        embeddingText: description ? `${cleanName}: ${description}` : cleanName,
      },
    });
    // Round E Phase 9 — fire-and-forget RAG indexing for sublocation.
    ragService.index('location', row.id, buildLocationEmbeddingText(row)).catch(() => {});
    return row;
  } catch (err) {
    log.warn({ err: err?.message, name: cleanName }, 'createSublocation failed');
    return null;
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
