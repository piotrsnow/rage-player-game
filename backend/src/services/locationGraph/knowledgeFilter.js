import { prisma } from '../../lib/prisma.js';
import { LOCATION_KIND_WORLD, LOCATION_KIND_CAMPAIGN } from '../locationRefs.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'knowledgeFilter' });

/**
 * Build a KnowledgeState for a specific character in a campaign.
 * Merges: campaign discovery, user discovery, character backstory, NPC hearsay.
 */
export async function getCharacterKnowledge(characterId, campaignId) {
  const [campaignDiscovery, character] = await Promise.all([
    prisma.campaignDiscoveredLocation.findMany({
      where: { campaignId },
      select: { locationKind: true, locationId: true, discoveryState: true },
    }),
    prisma.character.findUnique({
      where: { id: characterId },
      select: { backstory: true, homeLocation: true },
    }),
  ]);

  const knownLocations = new Map();
  const visitedLocations = new Set();

  for (const d of campaignDiscovery) {
    const key = `${d.locationKind}:${d.locationId}`;
    knownLocations.set(key, d.discoveryState || 'known');
    if (d.discoveryState === 'visited' || d.discoveryState === 'mapped') {
      visitedLocations.add(key);
    }
  }

  // Character backstory — if "from" a location, they know it
  if (character?.homeLocation) {
    const homeLoc = await resolveLocationByName(character.homeLocation);
    if (homeLoc) {
      const key = `${homeLoc.kind}:${homeLoc.id}`;
      if (!knownLocations.has(key) || rankOf(knownLocations.get(key)) < rankOf('mapped')) {
        knownLocations.set(key, 'mapped');
        visitedLocations.add(key);
      }
      // Also know children of home location
      const children = await prisma.worldLocation.findMany({
        where: { parentLocationId: homeLoc.id },
        select: { id: true },
      });
      for (const child of children) {
        const childKey = `${LOCATION_KIND_WORLD}:${child.id}`;
        if (!knownLocations.has(childKey) || rankOf(knownLocations.get(childKey)) < rankOf('known')) {
          knownLocations.set(childKey, 'known');
        }
      }
    }
  }

  // Hearsay — locationMentioned events from NPCs the character interacted with
  const hearsay = await prisma.campaignScene.findMany({
    where: {
      campaignId,
      metadata: { path: ['locationMentioned'], not: null },
    },
    select: { metadata: true },
    take: 50,
    orderBy: { createdAt: 'desc' },
  });
  for (const scene of hearsay) {
    const mentioned = scene.metadata?.locationMentioned;
    if (!Array.isArray(mentioned)) continue;
    for (const locName of mentioned) {
      const ref = await resolveLocationByName(locName);
      if (ref) {
        const key = `${ref.kind}:${ref.id}`;
        if (!knownLocations.has(key)) {
          knownLocations.set(key, 'rumored');
        }
      }
    }
  }

  return { characterId, campaignId, knownLocations, visitedLocations };
}

/**
 * Get the union of all character knowledge for a player across a campaign.
 */
export async function getPlayerKnowledge(userId, campaignId) {
  const [userDiscovery, campaignDiscovery] = await Promise.all([
    prisma.userDiscoveredLocation.findMany({
      where: { userId },
      select: { locationKind: true, locationId: true, discoveryState: true },
    }),
    prisma.campaignDiscoveredLocation.findMany({
      where: { campaignId },
      select: { locationKind: true, locationId: true, discoveryState: true },
    }),
  ]);

  const knownLocations = new Map();
  const visitedLocations = new Set();

  for (const d of [...userDiscovery, ...campaignDiscovery]) {
    const key = `${d.locationKind}:${d.locationId}`;
    const current = knownLocations.get(key);
    if (!current || rankOf(d.discoveryState) > rankOf(current)) {
      knownLocations.set(key, d.discoveryState || 'known');
    }
    if (d.discoveryState === 'visited' || d.discoveryState === 'mapped') {
      visitedLocations.add(key);
    }
  }

  return { userId, campaignId, knownLocations, visitedLocations };
}

/**
 * Filter a graph (nodes Map + edges array) by a knowledge state.
 * Removes nodes/edges the entity doesn't know about.
 */
export function filterGraphByKnowledge(graph, knowledgeState) {
  const { nodes, edges } = graph;
  const { knownLocations } = knowledgeState;

  const filteredNodes = new Map();
  for (const [key, node] of nodes) {
    const state = knownLocations.get(key);
    if (state && state !== 'unknown' && state !== 'hidden') {
      filteredNodes.set(key, { ...node, _discoveryState: state });
    }
  }

  const filteredEdges = edges.filter((edge) => {
    if (edge.discoveryState === 'hidden' || edge.discoveryState === 'unknown') return false;
    const fromKey = `${edge.fromKind}:${edge.fromId}`;
    const toKey = `${edge.toKind}:${edge.toId}`;
    return filteredNodes.has(fromKey) && filteredNodes.has(toKey);
  });

  return { nodes: filteredNodes, edges: filteredEdges };
}

// ── Helpers ──────────────────────────────────────────────────────────

const RANK_ORDER = ['unknown', 'rumored', 'known', 'visited', 'mapped'];
function rankOf(state) {
  const idx = RANK_ORDER.indexOf(state);
  return idx === -1 ? 0 : idx;
}

async function resolveLocationByName(name) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();

  const worldLoc = await prisma.worldLocation.findFirst({
    where: {
      OR: [
        { canonicalName: { equals: normalized, mode: 'insensitive' } },
        { displayName: { equals: normalized, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  if (worldLoc) return { kind: LOCATION_KIND_WORLD, id: worldLoc.id };

  return null;
}
