// Entity registry — centralized visibility helper.
//
// Determines whether a world-scope entity (WorldNPC, WorldLocation,
// CustomSpell, WorldItemDefinition) is visible within a given campaign.
//
// Rules:
//   1. Soft-deleted (softDeletedAt != null) → invisible everywhere (admin-only).
//   2. globallyActive === true → visible in every campaign.
//   3. originCampaignId === campaignId → visible in the source campaign
//      even when globallyActive === false (origin override).
//   4. Otherwise → invisible.

/**
 * @param {{ globallyActive?: boolean, softDeletedAt?: Date|string|null, originCampaignId?: string|null }} entity
 * @param {string|null} [campaignId]
 * @returns {boolean}
 */
export function isVisibleInCampaign(entity, campaignId = null) {
  if (!entity) return false;
  if (entity.softDeletedAt) return false;
  if (entity.globallyActive === true) return true;
  if (campaignId && entity.originCampaignId && entity.originCampaignId === campaignId) return true;
  return false;
}

/**
 * Prisma `where` clause fragment that filters rows to those visible in
 * `campaignId`. Combine with the caller's own `where` via spread / AND.
 *
 * @param {string|null} [campaignId]
 * @returns {object} Prisma where fragment
 */
export function visibleWhere(campaignId = null) {
  const notDeleted = { softDeletedAt: null };
  if (campaignId) {
    return {
      ...notDeleted,
      OR: [
        { globallyActive: true },
        { originCampaignId: campaignId },
      ],
    };
  }
  return { ...notDeleted, globallyActive: true };
}
