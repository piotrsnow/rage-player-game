/**
 * Unified NPC repository — query helpers for the merged Npc table.
 *
 * Scope convention:
 *   campaignId IS NULL → canonical (world-level)
 *   campaignId = uuid  → campaign-scoped (shadow or AI-created)
 */

// ─── Canonical (world-level) queries ─────────────────────────────────

export function findCanonicalById(prisma, id, { select } = {}) {
  return prisma.npc.findFirst({
    where: { id, campaignId: null },
    ...(select && { select }),
  });
}

export function findCanonicalByCanonicalId(prisma, canonicalId, { select } = {}) {
  return prisma.npc.findFirst({
    where: { canonicalId, campaignId: null },
    ...(select && { select }),
  });
}

export function findCanonicalByName(prisma, name, { select } = {}) {
  return prisma.npc.findFirst({
    where: { name, campaignId: null, alive: true },
    ...(select && { select }),
  });
}

export function listCanonical(prisma, { where = {}, select, take, skip, orderBy } = {}) {
  return prisma.npc.findMany({
    where: { ...where, campaignId: null },
    ...(select && { select }),
    ...(take && { take }),
    ...(skip && { skip }),
    ...(orderBy && { orderBy }),
  });
}

export function listCanonicalAtLocation(prisma, locationId, { aliveOnly = true } = {}) {
  return prisma.npc.findMany({
    where: {
      campaignId: null,
      currentLocationId: locationId,
      ...(aliveOnly && { alive: true }),
    },
  });
}

// ─── Campaign-scoped queries ─────────────────────────────────────────

export function findShadow(prisma, campaignId, canonicalNpcId, { select } = {}) {
  return prisma.npc.findFirst({
    where: { campaignId, canonicalNpcId },
    ...(select && { select }),
  });
}

export function findCampaignNpcById(prisma, id, { select } = {}) {
  return prisma.npc.findFirst({
    where: { id, campaignId: { not: null } },
    ...(select && { select }),
  });
}

export function findCampaignNpcByNpcId(prisma, campaignId, npcId, { select } = {}) {
  return prisma.npc.findFirst({
    where: { campaignId, npcId },
    ...(select && { select }),
  });
}

export function listForCampaign(prisma, campaignId, { where = {}, select, orderBy } = {}) {
  return prisma.npc.findMany({
    where: { ...where, campaignId },
    ...(select && { select }),
    ...(orderBy && { orderBy }),
  });
}

export function listAtLocation(prisma, locationId, { campaignId = null, aliveOnly = true } = {}) {
  const filter = {
    currentLocationId: locationId,
    ...(aliveOnly && { alive: true }),
  };
  if (campaignId) {
    filter.campaignId = campaignId;
  } else {
    filter.campaignId = null;
  }
  return prisma.npc.findMany({ where: filter });
}

/**
 * "Visible" NPCs for a campaign = campaign-scoped shadows + canonical NPCs at same location.
 * Used for context assembly and scene generation.
 */
export function listVisibleForCampaign(prisma, campaignId, { locationId, aliveOnly = true } = {}) {
  const base = {
    ...(aliveOnly && { alive: true }),
    ...(locationId && { currentLocationId: locationId }),
  };
  return prisma.npc.findMany({
    where: {
      OR: [
        { ...base, campaignId },
        { ...base, campaignId: null },
      ],
    },
  });
}

// ─── Clone / shadow creation ─────────────────────────────────────────

/**
 * Creates a campaign shadow of a canonical NPC. If shadow already exists, returns it.
 */
export async function getOrCreateShadow(prisma, campaignId, canonicalNpcId) {
  const existing = await findShadow(prisma, campaignId, canonicalNpcId);
  if (existing) return existing;

  const canonical = await prisma.npc.findUnique({ where: { id: canonicalNpcId } });
  if (!canonical || canonical.campaignId !== null) return null;

  return prisma.npc.create({
    data: {
      campaignId,
      canonicalNpcId: canonical.id,
      npcId: canonical.canonicalId,
      name: canonical.name,
      gender: canonical.gender ?? 'unknown',
      role: canonical.role,
      personality: canonical.personality,
      alignment: canonical.alignment ?? 'neutral',
      alive: canonical.alive,
      category: canonical.category ?? 'commoner',
      currentLocationId: canonical.currentLocationId,
      homeLocationId: canonical.homeLocationId,
      race: canonical.race,
      creatureKind: canonical.creatureKind,
      level: canonical.level,
      stats: canonical.stats ?? {},
      spriteUrl: canonical.spriteUrl,
      chargenAppearance: canonical.chargenAppearance,
      spriteSheetUrl: canonical.spriteSheetUrl,
      appearance: canonical.appearance,
      dialect: canonical.dialect,
    },
  });
}

// ─── Promotion ───────────────────────────────────────────────────────

/**
 * Promotes a campaign-scoped NPC to canonical.
 * Just flips campaignId to null and assigns a canonicalId.
 */
export function promoteToCanonical(prisma, npcId, { canonicalId }) {
  return prisma.npc.update({
    where: { id: npcId },
    data: {
      campaignId: null,
      canonicalId,
      globallyActive: true,
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────

export function setLocation(prisma, npcId, locationId) {
  return prisma.npc.update({
    where: { id: npcId },
    data: { currentLocationId: locationId },
  });
}

export function kill(prisma, npcId) {
  return prisma.npc.update({
    where: { id: npcId },
    data: { alive: false },
  });
}
