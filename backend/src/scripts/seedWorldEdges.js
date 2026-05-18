/**
 * Seed canonical LocationEdge rows for Yeralden's 3 sublocations.
 * Called from seedWorld.js after all WorldLocations exist.
 *
 * Seeds: adjacent_to, door_to, audible_from edges between the temple,
 * tavern, market, and the capital itself. Idempotent — checks existence.
 */

import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger({ module: 'seedWorldEdges' });

export async function seedCanonicalEdges(locationByName) {
  let created = 0;

  const edges = buildEdgeDefinitions(locationByName);

  for (const edgeDef of edges) {
    const fromLoc = locationByName[edgeDef.fromName];
    const toLoc = locationByName[edgeDef.toName];
    if (!fromLoc || !toLoc) continue;

    const exists = await prisma.locationEdge.findFirst({
      where: {
        fromLocationId: fromLoc.id,
        toLocationId: toLoc.id,
        edgeType: edgeDef.edgeType,
        createdBy: 'system',
      },
    });
    if (exists) continue;

    try {
      await prisma.locationEdge.create({
        data: {
          fromLocationId: fromLoc.id,
          toLocationId: toLoc.id,
          edgeType: edgeDef.edgeType,
          category: edgeDef.category,
          bidirectional: edgeDef.bidirectional ?? true,
          weight: edgeDef.weight ?? 1.0,
          metadata: edgeDef.metadata ?? {},
          discoveryState: edgeDef.discoveryState ?? 'known',
          createdBy: 'system',
        },
      });
      created++;
    } catch (err) {
      if (err.code !== 'P2002') {
        log.warn({ err: err?.message, edge: `${edgeDef.fromName}→${edgeDef.toName}` }, 'Edge seed failed');
      }
    }
  }

  log.info({ created }, 'Canonical edges seeded');
  return { edgesCreated: created };
}

function buildEdgeDefinitions(locationByName) {
  const edges = [];

  // ── Adjacent_to: capital sublocations ───────────────────────────────
  edges.push({
    fromName: 'Tempel Nieznanego Boga', toName: 'Grossmarkt w Yeralden',
    edgeType: 'adjacent_to', category: 'spatial',
    bidirectional: true,
  });
  edges.push({
    fromName: 'Grossmarkt w Yeralden', toName: 'Czarda Pod Złotym Słońcem',
    edgeType: 'adjacent_to', category: 'spatial',
    bidirectional: true,
  });

  // ── Audible_from: tavern ↔ market noise ─────────────────────────────
  edges.push({
    fromName: 'Czarda Pod Złotym Słońcem', toName: 'Grossmarkt w Yeralden',
    edgeType: 'audible_from', category: 'perception',
    bidirectional: false,
    metadata: { loudness: 'moderate', detail: 'muzyka i gwar z karczmy' },
  });
  edges.push({
    fromName: 'Grossmarkt w Yeralden', toName: 'Czarda Pod Złotym Słońcem',
    edgeType: 'audible_from', category: 'perception',
    bidirectional: false,
    metadata: { loudness: 'moderate', detail: 'zgiełk handlarzy' },
  });

  // ── Door_to: each sublocation ↔ capital ─────────────────────────────
  edges.push({
    fromName: 'Tempel Nieznanego Boga', toName: 'Yeralden',
    edgeType: 'door_to', category: 'movement',
    bidirectional: true,
    metadata: { description: 'Kamienne wrota świątyni' },
  });
  edges.push({
    fromName: 'Czarda Pod Złotym Słońcem', toName: 'Yeralden',
    edgeType: 'door_to', category: 'movement',
    bidirectional: true,
    metadata: { description: 'Główne drzwi karczmy' },
  });
  edges.push({
    fromName: 'Grossmarkt w Yeralden', toName: 'Yeralden',
    edgeType: 'door_to', category: 'movement',
    bidirectional: true,
    metadata: { description: 'Brama targowa' },
  });

  return edges.filter((e) => locationByName[e.fromName] && locationByName[e.toName]);
}
