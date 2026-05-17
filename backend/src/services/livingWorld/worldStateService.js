// Living World — canonical NPC / Location CRUD + name-based dedupe.
// Unified table version — no more WorldNPC/WorldLocation/CampaignLocation split.
//
// Key convention:
//   prisma.npc      WHERE campaignId IS NULL  → canonical NPCs
//   prisma.location WHERE campaignId IS NULL  → canonical locations
//   prisma.location WHERE campaignId = X      → campaign sandbox locations

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { buildNPCEmbeddingText, buildLocationEmbeddingText } from '../embeddingService.js';
import { slugifyLocationName } from '../locationRefs.js';
import * as ragService from './ragService.js';

const log = childLogger({ module: 'worldStateService' });

/**
 * Normalize a location name for fuzzy dedup.
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
// Location resolution
// ──────────────────────────────────────────────────────────────────────

/**
 * Pure LOOKUP — find a canonical location via fuzzy name match.
 * NEVER creates. Returns the Location row or null.
 */
export async function resolveWorldLocation(rawName, { region = null } = {}) {
  if (!rawName || typeof rawName !== 'string') return null;
  const name = rawName.trim();
  if (!name) return null;
  const norm = normalizeLocationName(name);
  if (!norm) return null;

  const exact = await prisma.location.findFirst({
    where: { canonicalName: name, campaignId: null, softDeletedAt: null },
  });
  if (exact && !name.startsWith('__draft::')) return exact;

  const candidates = await prisma.location.findMany({
    where: {
      campaignId: null,
      softDeletedAt: null,
      ...(region ? { region } : {}),
      NOT: { canonicalName: { startsWith: '__draft::' } },
    },
    select: { id: true, canonicalName: true, displayName: true, aliases: true, region: true, description: true, embeddingText: true },
  });
  for (const rec of candidates) {
    if (matchesByNormName(rec.canonicalName || rec.displayName, rec.aliases, norm)) {
      return rec;
    }
  }
  return null;
}

/**
 * Resolve a location by name. Canonical takes priority over campaign sandbox.
 * Returns { location, isCanonical } or null.
 */
export async function resolveLocationByName(rawName, { campaignId = null, region = null } = {}) {
  if (!rawName || typeof rawName !== 'string') return null;
  const name = rawName.trim();
  if (!name) return null;
  const norm = normalizeLocationName(name);
  if (!norm) return null;

  // Canonical — exact hit
  const exact = await prisma.location.findFirst({
    where: { canonicalName: name, campaignId: null, softDeletedAt: null },
  });
  if (exact && !name.startsWith('__draft::')) return { location: exact, isCanonical: true };

  // Canonical — fuzzy
  const wlCandidates = await prisma.location.findMany({
    where: {
      campaignId: null,
      softDeletedAt: null,
      ...(region ? { region } : {}),
      NOT: { canonicalName: { startsWith: '__draft::' } },
    },
    select: {
      id: true, canonicalName: true, displayName: true, aliases: true,
      region: true, regionX: true, regionY: true, locationType: true,
      parentLocationId: true, description: true, embeddingText: true,
      maxKeyNpcs: true, maxSubLocations: true, dangerLevel: true,
      knownByDefault: true,
    },
  });
  for (const rec of wlCandidates) {
    if (matchesByNormName(rec.canonicalName || rec.displayName, rec.aliases, norm)) {
      return { location: rec, isCanonical: true };
    }
  }

  // Campaign sandbox — exact slug, then fuzzy
  if (campaignId) {
    const slug = slugifyLocationName(name);
    if (slug) {
      const slugHit = await prisma.location.findFirst({
        where: { campaignId, canonicalName: slug },
      });
      if (slugHit) return { location: slugHit, isCanonical: false };
    }
    const clCandidates = await prisma.location.findMany({
      where: { campaignId },
      select: {
        id: true, canonicalName: true, displayName: true, aliases: true,
        region: true, regionX: true, regionY: true, locationType: true,
        parentLocationId: true, description: true, embeddingText: true, dangerLevel: true,
      },
    });
    for (const rec of clCandidates) {
      if (matchesByNormName(rec.displayName || rec.canonicalName, rec.aliases, norm)) {
        return { location: rec, isCanonical: false };
      }
    }
  }

  return null;
}

function matchesByNormName(displayOrCanonical, aliases, queryNorm) {
  const recNorm = normalizeLocationName(displayOrCanonical || '');
  if (recNorm === queryNorm) return true;
  const aliasArr = Array.isArray(aliases) ? aliases : [];
  if (aliasArr.some((a) => normalizeLocationName(a) === queryNorm)) return true;
  if (recNorm && queryNorm && recNorm.length >= 5 && queryNorm.length >= 5) {
    const shorter = Math.min(recNorm.length, queryNorm.length);
    const longer = Math.max(recNorm.length, queryNorm.length);
    if (shorter / longer >= 0.6 && (recNorm.includes(queryNorm) || queryNorm.includes(recNorm))) {
      return true;
    }
  }
  return false;
}

/**
 * Find or create a campaign-scoped location.
 * Only dedupes within the campaign (by slug). Idempotent.
 */
export async function findOrCreateCampaignLocation(rawName, {
  campaignId,
  region = null,
  description = '',
  locationType = 'generic',
  category = null,
  regionX = 0,
  regionY = 0,
  positionConfidence = 0.5,
  parentLocationId = null,
  slotType = null,
  slotKind = 'custom',
  dangerLevel = 'safe',
  aliases = null,
  maxKeyNpcs = null,
  maxSubLocations = null,
} = {}) {
  if (!rawName || typeof rawName !== 'string' || !campaignId) return null;
  const name = rawName.trim();
  if (!name) return null;
  const slug = slugifyLocationName(name);
  if (!slug) return null;

  const existing = await prisma.location.findFirst({
    where: { campaignId, canonicalName: slug },
  });
  if (existing) return existing;

  const embText = description ? `${name}: ${description}` : name;
  const data = {
    campaignId,
    canonicalName: slug,
    displayName: name,
    description,
    category: category || locationType || 'generic',
    locationType,
    region,
    aliases: aliases || [name],
    regionX, regionY, positionConfidence,
    parentLocationId,
    slotType, slotKind, dangerLevel,
    embeddingText: embText,
  };
  if (typeof maxKeyNpcs === 'number') data.maxKeyNpcs = maxKeyNpcs;
  if (typeof maxSubLocations === 'number') data.maxSubLocations = maxSubLocations;

  try {
    return await prisma.location.create({ data });
  } catch (err) {
    if (err?.code === 'P2002') {
      return prisma.location.findFirst({ where: { campaignId, canonicalName: slug } });
    }
    log.warn({ err: err?.message, name, campaignId }, 'findOrCreateCampaignLocation failed');
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Canonical NPC helpers
// ──────────────────────────────────────────────────────────────────────

export async function findCanonicalWorldNpcByName(name, { campaignId = null } = {}) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return prisma.npc.findFirst({
    where: {
      campaignId: null,
      name: { equals: trimmed, mode: 'insensitive' },
      alive: true,
    },
  });
}

export async function findOrCreateWorldNPC(npcData) {
  if (!npcData?.name) return null;
  const { name, role, personality, category, race, creatureKind, level } = npcData;

  const existing = await prisma.npc.findFirst({
    where: {
      campaignId: null,
      name: { equals: name.trim(), mode: 'insensitive' },
      ...(role ? { role: { equals: role, mode: 'insensitive' } } : {}),
    },
  });
  if (existing) return existing;

  const canonicalId = buildNpcCanonicalId({ name, role });
  const embText = buildNPCEmbeddingText({ name, role, personality });
  try {
    const created = await prisma.npc.create({
      data: {
        campaignId: null,
        canonicalId,
        name: name.trim(),
        role: role || null,
        personality: personality || null,
        category: category || 'commoner',
        race: race || null,
        creatureKind: creatureKind || null,
        level: typeof level === 'number' ? level : 1,
        embeddingText: embText,
        globallyActive: true,
      },
    });
    return created;
  } catch (err) {
    if (err?.code === 'P2002') {
      return prisma.npc.findFirst({ where: { canonicalId, campaignId: null } });
    }
    log.warn({ err: err?.message, name }, 'findOrCreateWorldNPC failed');
    return null;
  }
}

export function setWorldNpcLocation(npcId, locationId) {
  return prisma.npc.update({
    where: { id: npcId },
    data: { currentLocationId: locationId || null },
  }).catch((err) => {
    log.warn({ err: err?.message, npcId, locationId }, 'setWorldNpcLocation failed');
    return false;
  });
}

export function killWorldNpc(npcId) {
  return prisma.npc.update({
    where: { id: npcId },
    data: { alive: false },
  }).catch((err) => {
    log.warn({ err: err?.message, npcId }, 'killWorldNpc failed');
    return false;
  });
}

export function listNpcsAtLocation(locationId, { aliveOnly = true } = {}) {
  return prisma.npc.findMany({
    where: {
      campaignId: null,
      currentLocationId: locationId,
      ...(aliveOnly && { alive: true }),
    },
  });
}

/**
 * Create a canonical sublocation under a parent.
 */
export async function createSublocation({ name, parent, slotType, slotKind, locationType, description }) {
  if (!name || !parent?.id) return null;
  const slug = slugifyLocationName(name);
  const existing = await prisma.location.findFirst({
    where: { canonicalName: slug, campaignId: null },
  });
  if (existing) return existing;

  return prisma.location.create({
    data: {
      campaignId: null,
      canonicalName: slug,
      displayName: name,
      description: description || '',
      locationType: locationType || 'site',
      parentLocationId: parent.id,
      regionX: parent.regionX || 0,
      regionY: parent.regionY || 0,
      region: parent.region || null,
      slotType: slotType || null,
      slotKind: slotKind || 'custom',
    },
  });
}

/**
 * Walk up the parent chain from a location. Returns Set of ancestor IDs.
 */
export async function walkUpAncestors(locationId, { maxDepth = 10 } = {}) {
  const ancestors = new Set();
  let current = locationId;
  let depth = 0;
  while (current && depth < maxDepth) {
    const loc = await prisma.location.findUnique({
      where: { id: current },
      select: { parentLocationId: true },
    });
    if (!loc?.parentLocationId) break;
    ancestors.add(loc.parentLocationId);
    current = loc.parentLocationId;
    depth++;
  }
  return ancestors;
}
