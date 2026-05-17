// Faza 2 — AI Resolver: mapuje AI-emitted string nazwy lokacji na composite
// ref do node grafu. Resolwer scope'owany po `campaignId`.
//
// Strategia (po kolei):
//   1. Composite ref string ("world:UUID" / "campaign:UUID") — zwróć po
//      walidacji że node istnieje.
//   2. Exact match po canonicalSlug (CampaignLocation) lub canonicalName (WorldLocation).
//   3. Case-insensitive contains match na name/displayName.
//   4. Fuzzy fallback (basic levenshtein) — opcjonalnie (TODO).
//   5. Fail → log + zwróć null. Caller decyduje, czy utworzyć "unknown" node.
//
// `createNodeFromAIProposal` tworzy CampaignLocation + opcjonalnie edge
// `parent → contains → new` jeśli AI podało parentLocationName.

import { prisma } from '../../lib/prisma.js';
import {
  LOCATION_KIND_WORLD,
  LOCATION_KIND_CAMPAIGN,
  slugifyLocationName,
} from '../locationRefs.js';
import { inferScaleFromType, clampLocationScale } from '../../../../shared/domain/locationGraphLayout.js';
import { createEdge } from './graphService.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'aiResolver' });

const COMPOSITE_REF_REGEX = /^(world|campaign):([0-9a-f-]{36})$/i;

/** Build a fast lookup index: normalized-name → { kind, id }. */
async function buildNameIndex(campaignId) {
  const [worldLocs, campaignLocs] = await Promise.all([
    prisma.location.findMany({
      select: { id: true, canonicalName: true, displayName: true, aliases: true },
    }),
    prisma.location.findMany({
      where: { campaignId },
      select: { id: true, name: true, canonicalSlug: true, aliases: true },
    }),
  ]);

  const index = new Map();
  const addEntry = (key, kind, id) => {
    const k = normalizeKey(key);
    if (!k) return;
    if (!index.has(k)) index.set(k, { kind, id });
  };

  for (const r of worldLocs) {
    addEntry(r.canonicalName, LOCATION_KIND_WORLD, r.id);
    if (r.displayName) addEntry(r.displayName, LOCATION_KIND_WORLD, r.id);
    if (Array.isArray(r.aliases)) {
      for (const alias of r.aliases) addEntry(alias, LOCATION_KIND_WORLD, r.id);
    }
  }
  for (const r of campaignLocs) {
    addEntry(r.name, LOCATION_KIND_CAMPAIGN, r.id);
    addEntry(r.canonicalSlug, LOCATION_KIND_CAMPAIGN, r.id);
    if (Array.isArray(r.aliases)) {
      for (const alias of r.aliases) addEntry(alias, LOCATION_KIND_CAMPAIGN, r.id);
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
    .replace(/[^a-z0-9_-]/g, ''); // strip diacritics — slugifyLocationName equivalent
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
  if (typeof input === 'object' && input.kind && input.id) {
    const ok = await nodeExists(input.kind, input.id, campaignId);
    return ok ? { kind: input.kind, id: input.id } : null;
  }

  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 2) Composite ref string.
  const m = trimmed.match(COMPOSITE_REF_REGEX);
  if (m) {
    const ref = { kind: m[1].toLowerCase(), id: m[2] };
    const ok = await nodeExists(ref.kind, ref.id, campaignId);
    return ok ? ref : null;
  }

  // 3) Name-based lookup.
  const index = await buildNameIndex(campaignId);
  const key = normalizeKey(trimmed);
  if (index.has(key)) return index.get(key);

  // 4) Contains-match fallback (case-insensitive substring).
  const tLower = trimmed.toLowerCase();
  for (const [indexedKey, ref] of index.entries()) {
    // Avoid false positives on very short queries (< 4 chars).
    if (tLower.length < 4) break;
    if (indexedKey.includes(key) || key.includes(indexedKey)) return ref;
  }

  log.debug({ campaignId, input: trimmed }, 'resolveLocationRef: no match');
  return null;
}

/**
 * Verify that a node exists for the given composite ref.
 * Scope'uje campaign nodes po `campaignId`; world nodes są globalne.
 */
export async function nodeExists(kind, id, campaignId = null) {
  if (kind === LOCATION_KIND_WORLD) {
    const row = await prisma.location.findUnique({ where: { id }, select: { id: true } });
    return !!row;
  }
  if (kind === LOCATION_KIND_CAMPAIGN) {
    const where = { id };
    if (campaignId) where.campaignId = campaignId;
    const row = await prisma.location.findFirst({ where, select: { id: true } });
    return !!row;
  }
  return false;
}

/**
 * Create a CampaignLocation from an AI proposal entry. Optionally wires up
 * a `contains` edge from `parentLocationName` (resolved via index).
 *
 * @param {object} entry — Output entry from `newLocations[]` AI schema.
 * @param {string} campaignId
 * @returns {Promise<{kind: string, id: string} | null>}
 */
export async function createNodeFromAIProposal(entry, campaignId) {
  if (!entry?.name || typeof entry.name !== 'string') return null;
  const slug = slugifyLocationName(entry.name);

  // Idempotency: if already exists in this campaign, just return its ref.
  const existing = await prisma.location.findFirst({
    where: { campaignId, canonicalSlug: slug },
    select: { id: true },
  });
  if (existing) return { kind: LOCATION_KIND_CAMPAIGN, id: existing.id };

  let parentRef = null;
  if (entry.parentLocationName) {
    parentRef = await resolveLocationRef(entry.parentLocationName, campaignId);
  }

  let parentScale = null;
  if (parentRef) {
    const model = parentRef.kind === LOCATION_KIND_WORLD ? 'worldLocation' : 'campaignLocation';
    const pRow = await prisma[model].findUnique({ where: { id: parentRef.id }, select: { scale: true } });
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
        name: entry.name,
        canonicalSlug: slug,
        description: entry.description || '',
        locationType: entry.locationType || 'generic',
        slotType: entry.slotType || null,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        scale: resolvedScale,
        dangerLevel: entry.difficulty || 'safe',
        parentLocationKind: parentRef?.kind || null,
        parentLocationId: parentRef?.id || null,
        biome: entry.biome || null,
        anchorType: entry.anchorType || null,
      },
    });
  } catch (err) {
    log.warn({ err: err?.message, name: entry.name, campaignId }, 'createNodeFromAIProposal failed');
    return null;
  }

  // Auto-wire `parent contains new` edge.
  if (parentRef) {
    try {
      await createEdge({
        fromKind: parentRef.kind,
        fromId: parentRef.id,
        toKind: LOCATION_KIND_CAMPAIGN,
        toId: row.id,
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

  return { kind: LOCATION_KIND_CAMPAIGN, id: row.id };
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
