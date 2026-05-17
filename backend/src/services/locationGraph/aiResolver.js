// AI Resolver: maps AI-emitted string location names to location IDs.
// Scoped by `campaignId`.
//
// Strategy (in order):
//   1. Composite ref string ("world:UUID" / "campaign:UUID") — return after
//      validating node exists.  (Legacy format — both resolve to unified table.)
//   2. Exact match on canonicalName or displayName.
//   3. Case-insensitive contains match on name/displayName.
//   4. Fuzzy fallback (basic levenshtein) — TODO.
//   5. Fail → log + return null.
//
// `createNodeFromAIProposal` creates a campaign-scoped Location + optionally
// an edge `parent → contains → new` if AI provided parentLocationName.

import { prisma } from '../../lib/prisma.js';
import { slugifyLocationName } from '../locationRefs.js';
import { inferScaleFromType, clampLocationScale } from '../../../../shared/domain/locationGraphLayout.js';
import { createEdge } from './graphService.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'aiResolver' });

const COMPOSITE_REF_REGEX = /^(world|campaign):([0-9a-f-]{36})$/i;

/** Build a fast lookup index: normalized-name → { kind: 'world', id }. */
async function buildNameIndex(campaignId) {
  const rows = await prisma.location.findMany({
    where: {
      OR: [{ campaignId: null }, { campaignId }],
    },
    select: { id: true, canonicalName: true, displayName: true, aliases: true },
  });

  const index = new Map();
  const addEntry = (key, id) => {
    const k = normalizeKey(key);
    if (!k) return;
    if (!index.has(k)) index.set(k, { kind: 'world', id });
  };

  for (const r of rows) {
    if (r.canonicalName) addEntry(r.canonicalName, r.id);
    if (r.displayName) addEntry(r.displayName, r.id);
    if (Array.isArray(r.aliases)) {
      for (const alias of r.aliases) addEntry(alias, r.id);
    }
  }
  return index;
}

function normalizeKey(s) {
  if (typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
}

/**
 * Resolve a single AI-emitted name (or composite ref string) to a {kind, id}.
 * Returns null if not found.
 *
 * @param {string|object|null} input — Free-text name, "world:UUID"/"campaign:UUID", or already-built ref object.
 * @param {string} campaignId
 * @returns {Promise<{kind: string, id: string} | null>}
 */
export async function resolveLocationRef(input, campaignId) {
  if (!input) return null;

  // 1) Already a structured ref object.
  if (typeof input === 'object' && input.id) {
    const ok = await nodeExists(input.kind ?? 'world', input.id, campaignId);
    return ok ? { kind: 'world', id: input.id } : null;
  }

  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 2) Composite ref string (legacy format — both kinds resolve to one table).
  const m = trimmed.match(COMPOSITE_REF_REGEX);
  if (m) {
    const id = m[2];
    const ok = await nodeExists('world', id, campaignId);
    return ok ? { kind: 'world', id } : null;
  }

  // 3) Name-based lookup.
  const index = await buildNameIndex(campaignId);
  const key = normalizeKey(trimmed);
  if (index.has(key)) return index.get(key);

  // 4) Contains-match fallback (case-insensitive substring).
  const tLower = trimmed.toLowerCase();
  for (const [indexedKey, ref] of index.entries()) {
    if (tLower.length < 4) break;
    if (indexedKey.includes(key) || key.includes(indexedKey)) return ref;
  }

  log.debug({ campaignId, input: trimmed }, 'resolveLocationRef: no match');
  return null;
}

/**
 * Verify that a location exists in the unified table.
 * When campaignId is set, accepts both canonical and this-campaign rows.
 */
export async function nodeExists(kind, id, campaignId = null) {
  const where = { id };
  if (campaignId) {
    where.OR = [{ campaignId: null }, { campaignId }];
  }
  const row = await prisma.location.findFirst({ where, select: { id: true } });
  return !!row;
}

/**
 * Create a campaign-scoped Location from an AI proposal entry. Optionally
 * wires up a `contains` edge from `parentLocationName` (resolved via index).
 *
 * @param {object} entry — Output entry from `newLocations[]` AI schema.
 * @param {string} campaignId
 * @returns {Promise<{kind: string, id: string} | null>}
 */
export async function createNodeFromAIProposal(entry, campaignId) {
  if (!entry?.name || typeof entry.name !== 'string') return null;
  const slug = slugifyLocationName(entry.name);

  const existing = await prisma.location.findFirst({
    where: { campaignId, canonicalName: slug },
    select: { id: true },
  });
  if (existing) return { kind: 'world', id: existing.id };

  let parentRef = null;
  if (entry.parentLocationName) {
    parentRef = await resolveLocationRef(entry.parentLocationName, campaignId);
  }

  let parentScale = null;
  if (parentRef) {
    const pRow = await prisma.location.findUnique({
      where: { id: parentRef.id },
      select: { scale: true },
    });
    parentScale = pRow?.scale ?? null;
  }

  let resolvedScale = typeof entry.scale === 'number' ? entry.scale : null;
  if (resolvedScale == null) {
    resolvedScale = inferScaleFromType(entry.locationType, parentScale) ?? 2;
  }
  resolvedScale = clampLocationScale(resolvedScale);
  if (typeof parentScale === 'number' && Number.isFinite(parentScale) && resolvedScale >= parentScale) {
    resolvedScale = Math.max(1, parentScale - 1);
  }

  let row;
  try {
    row = await prisma.location.create({
      data: {
        campaignId,
        displayName: entry.name,
        canonicalName: slug,
        description: entry.description || '',
        locationType: entry.locationType || 'generic',
        slotType: entry.slotType || null,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        scale: resolvedScale,
        dangerLevel: entry.difficulty || 'safe',
        parentLocationId: parentRef?.id || null,
        biome: entry.biome || null,
        anchorType: entry.anchorType || null,
      },
    });
  } catch (err) {
    log.warn({ err: err?.message, name: entry.name, campaignId }, 'createNodeFromAIProposal failed');
    return null;
  }

  if (parentRef) {
    try {
      await createEdge({
        fromLocationId: parentRef.id,
        toLocationId: row.id,
        edgeType: 'contains',
        category: 'structural',
        bidirectional: false,
        weight: 1.0,
        metadata: {
          createdReason: 'ai_proposal_parent_link',
          directionFromCurrent: entry.directionFromCurrent || null,
          travelDistance: entry.travelDistance || null,
        },
        discoveryState: 'known',
        campaignId,
        createdBy: 'ai',
      });
    } catch (edgeErr) {
      log.warn({ err: edgeErr?.message, parent: entry.parentLocationName, child: entry.name }, 'Failed to wire parent contains edge');
    }
  }

  return { kind: 'world', id: row.id };
}

/**
 * Convenience: resolve a list of AI-emitted entries (mix of strings/refs)
 * to a parallel array of composite refs (or null).
 */
export async function resolveLocationRefBatch(inputs, campaignId) {
  const out = [];
  for (const input of inputs) {
    out.push(await resolveLocationRef(input, campaignId));
  }
  return out;
}
