import { prisma } from '../../lib/prisma.js';
import { LOCATION_KIND_WORLD, LOCATION_KIND_CAMPAIGN } from '../locationRefs.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'migrateExistingCampaign' });

/**
 * Migrate an existing campaign's legacy mapState/mapConnections into
 * the LocationEdge graph system.
 *
 * - Creates CampaignLocation nodes from mapState entries that don't exist
 * - Creates movement edges from mapConnections
 * - Marks edges for exploredLocations as discoveryState='visited'
 *
 * Idempotent — re-running for the same campaign is safe.
 */
export async function migrateExistingCampaignGraph(campaignId) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, coreState: true },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const coreState = campaign.coreState || {};
  const world = coreState.world || {};
  const mapState = world.mapState || {};
  const mapConnections = world.mapConnections || [];
  const exploredLocations = world.exploredLocations || [];

  const report = { nodesCreated: 0, edgesCreated: 0, discoveryMarked: 0 };

  // Build name→ref index for existing locations
  const [worldLocs, campaignLocs] = await Promise.all([
    prisma.location.findMany({ select: { id: true, canonicalName: true, displayName: true } }),
    prisma.location.findMany({ where: { campaignId }, select: { id: true, name: true } }),
  ]);
  const nameIndex = new Map();
  for (const r of worldLocs) {
    nameIndex.set(normalize(r.canonicalName), { kind: LOCATION_KIND_WORLD, id: r.id });
    if (r.displayName) nameIndex.set(normalize(r.displayName), { kind: LOCATION_KIND_WORLD, id: r.id });
  }
  for (const r of campaignLocs) {
    nameIndex.set(normalize(r.name), { kind: LOCATION_KIND_CAMPAIGN, id: r.id });
  }

  // Create nodes from mapState entries that don't exist yet
  for (const [key, entry] of Object.entries(mapState)) {
    const name = entry?.name || key;
    if (nameIndex.has(normalize(name))) continue;

    try {
      const row = await prisma.location.create({
        data: {
          campaignId,
          name,
          canonicalSlug: normalize(name),
          description: entry?.description || '',
          locationType: entry?.type || 'generic',
          tags: [],
          regionX: entry?.x ?? 0,
          regionY: entry?.y ?? 0,
        },
      });
      nameIndex.set(normalize(name), { kind: LOCATION_KIND_CAMPAIGN, id: row.id });
      report.nodesCreated++;
    } catch (err) {
      if (err.code !== 'P2002') {
        log.warn({ err: err?.message, name, campaignId }, 'Failed to create migration node');
      }
    }
  }

  // Create movement edges from mapConnections
  for (const conn of mapConnections) {
    const fromName = conn?.from || conn?.fromName;
    const toName = conn?.to || conn?.toName;
    if (!fromName || !toName) continue;

    const from = nameIndex.get(normalize(fromName));
    const to = nameIndex.get(normalize(toName));
    if (!from || !to) continue;

    const existing = await prisma.locationEdge.findFirst({
      where: {
        fromKind: from.kind, fromId: from.id,
        toKind: to.kind, toId: to.id,
        category: 'movement', isActive: true,
      },
    });
    if (existing) continue;

    try {
      await prisma.locationEdge.create({
        data: {
          fromKind: from.kind,
          fromId: from.id,
          toKind: to.kind,
          toId: to.id,
          edgeType: 'path_to',
          category: 'movement',
          bidirectional: true,
          weight: conn?.distance || 1.0,
          metadata: { migrated: true },
          discoveryState: 'known',
          campaignId,
          createdBy: 'migration',
        },
      });
      report.edgesCreated++;
    } catch (err) {
      log.warn({ err: err?.message, from: fromName, to: toName }, 'Failed to create migration edge');
    }
  }

  // Mark explored locations' edges as visited
  for (const locName of exploredLocations) {
    if (!locName || typeof locName !== 'string') continue;
    const ref = nameIndex.get(normalize(locName));
    if (!ref) continue;

    const updated = await prisma.locationEdge.updateMany({
      where: {
        fromKind: ref.kind,
        fromId: ref.id,
        isActive: true,
        discoveryState: { not: 'visited' },
      },
      data: { discoveryState: 'visited' },
    });
    report.discoveryMarked += updated.count;
  }

  log.info({ campaignId, ...report }, 'Campaign graph migration complete');
  return report;
}

function normalize(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, '_');
}
