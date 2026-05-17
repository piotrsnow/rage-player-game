import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'seedEdges' });

/**
 * Ensure a `contains` edge exists from parentId → childId. Idempotent.
 * Used at campaign creation to guarantee the start sublocation's hierarchy
 * edge is present before the first scene.
 */
export async function ensureContainsEdge(parentId, childId) {
  if (!parentId || !childId) return;
  const existing = await prisma.locationEdge.findFirst({
    where: {
      fromLocationId: parentId,
      toLocationId: childId,
      edgeType: 'contains', isActive: true,
    },
    select: { id: true },
  });
  if (existing) return;
  await prisma.locationEdge.create({
    data: {
      fromLocationId: parentId,
      toLocationId: childId,
      edgeType: 'contains',
      category: 'structural',
      bidirectional: false,
      weight: 1.0,
      metadata: {},
      discoveryState: 'known',
      createdBy: 'system',
    },
  });
  log.info({ parentId, childId }, 'Created missing contains edge for start sublocation');
}

/**
 * Auto-generate LocationEdge rows from existing Road and parentLocationId
 * relationships. Idempotent — checks for existing edges before creating.
 * Called on first graph load for a campaign or as a one-time migration.
 */
export async function seedEdgesFromExistingData() {
  const [roadCount, parentCount] = await Promise.all([
    seedFromRoads(),
    seedFromParentHierarchy(),
  ]);
  log.info({ roadEdges: roadCount, parentEdges: parentCount }, 'Edge seeding complete');
  return { roadEdges: roadCount, parentEdges: parentCount };
}

/**
 * Create movement edges from existing Road table entries.
 * Road → path_to or road_to depending on terrainType.
 */
async function seedFromRoads() {
  const roads = await prisma.road.findMany({
    select: {
      id: true,
      fromLocationId: true,
      toLocationId: true,
      distance: true,
      difficulty: true,
      terrainType: true,
      gated: true,
      gateHint: true,
    },
  });

  const existing = await prisma.locationEdge.findMany({
    where: { createdBy: 'system', category: 'movement' },
    select: { fromLocationId: true, toLocationId: true, edgeType: true },
  });
  const existingKeys = new Set(
    existing.map((e) => `${e.fromLocationId}→${e.toLocationId}:${e.edgeType}`),
  );

  const toCreate = [];
  for (const road of roads) {
    const edgeType = road.terrainType === 'road' ? 'road_to' : 'path_to';
    const key = `${road.fromLocationId}→${road.toLocationId}:${edgeType}`;
    if (existingKeys.has(key)) continue;

    toCreate.push({
      fromLocationId: road.fromLocationId,
      toLocationId: road.toLocationId,
      edgeType,
      category: 'movement',
      bidirectional: true,
      weight: road.distance || 1.0,
      metadata: {
        distance: road.distance,
        difficulty: road.difficulty,
        terrainType: road.terrainType,
        gated: road.gated || false,
        gateHint: road.gateHint || null,
        sourceRoadId: road.id,
      },
      discoveryState: 'unknown',
      createdBy: 'system',
    });
  }

  if (toCreate.length > 0) {
    await prisma.locationEdge.createMany({ data: toCreate, skipDuplicates: true });
  }
  return toCreate.length;
}

/**
 * Create structural `contains` edges from parentLocationId relationships.
 */
async function seedFromParentHierarchy() {
  const locations = await prisma.location.findMany({
    where: { parentLocationId: { not: null } },
    select: { id: true, parentLocationId: true },
  });

  const existing = await prisma.locationEdge.findMany({
    where: { createdBy: 'system', edgeType: 'contains' },
    select: { fromLocationId: true, toLocationId: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.fromLocationId}→${e.toLocationId}`));

  const toCreate = [];
  for (const loc of locations) {
    if (!loc.parentLocationId) continue;
    const key = `${loc.parentLocationId}→${loc.id}`;
    if (existingKeys.has(key)) continue;

    toCreate.push({
      fromLocationId: loc.parentLocationId,
      toLocationId: loc.id,
      edgeType: 'contains',
      category: 'structural',
      bidirectional: false,
      weight: 1.0,
      metadata: {},
      discoveryState: 'known',
      createdBy: 'system',
    });
  }

  if (toCreate.length > 0) {
    await prisma.locationEdge.createMany({ data: toCreate, skipDuplicates: true });
  }
  return toCreate.length;
}
