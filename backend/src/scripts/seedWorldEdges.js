/**
 * Seed canonical LocationEdge rows for Yeralden and surroundings.
 * Called from seedWorld.js after all WorldLocations and Roads exist.
 *
 * Seeds: contains, adjacent_to, visible_from, audible_from, controlled_by,
 * secret_path_to, door_to, stairs_to edges. Idempotent — checks existence.
 */

import { prisma } from '../lib/prisma.js';
import { LOCATION_KIND_WORLD } from '../services/locationRefs.js';
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
        fromKind: LOCATION_KIND_WORLD,
        fromId: fromLoc.id,
        toKind: LOCATION_KIND_WORLD,
        toId: toLoc.id,
        edgeType: edgeDef.edgeType,
        createdBy: 'system',
      },
    });
    if (exists) continue;

    try {
      await prisma.locationEdge.create({
        data: {
          fromKind: LOCATION_KIND_WORLD,
          fromId: fromLoc.id,
          toKind: LOCATION_KIND_WORLD,
          toId: toLoc.id,
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

  // ── Adjacent_to: districts of Yeralden ─────────────────────────────
  const adjacentPairs = [
    ['Pałac Królewski w Yeralden', 'Koszary Królewskie'],
    ['Pałac Królewski w Yeralden', 'Świątynia Yerieli'],
    ['Wielki Targ w Yeralden', 'Karczma Pod Złotym Słońcem'],
    ['Wielki Targ w Yeralden', 'Akademia Yerieli'],
    ['Arena Chwały', 'Koszary Królewskie'],
    ['Arena Chwały', 'Obóz Łowców'],
    ['Akademia Yerieli', 'Wielka Biblioteka Yeralden'],
    ['Karczma Pod Złotym Słońcem', 'Chatka Wróżbitki Korvii'],
  ];
  for (const [a, b] of adjacentPairs) {
    edges.push({
      fromName: a, toName: b,
      edgeType: 'adjacent_to', category: 'spatial',
      bidirectional: true,
    });
  }

  // ── Visible_from: what you can see from key vantage points ─────────
  edges.push({
    fromName: 'Yeralden', toName: 'Świetłogaj',
    edgeType: 'visible_from', category: 'perception',
    bidirectional: false,
    metadata: { clarity: 'distant', conditions: 'z murów stolicy widać dymy tartaku' },
  });
  edges.push({
    fromName: 'Yeralden', toName: 'Kamionka Stara',
    edgeType: 'visible_from', category: 'perception',
    bidirectional: false,
    metadata: { clarity: 'distant', conditions: 'pola Kamionki widoczne z wieży pałacowej' },
  });
  edges.push({
    fromName: 'Pałac Królewski w Yeralden', toName: 'Wielki Targ w Yeralden',
    edgeType: 'visible_from', category: 'perception',
    bidirectional: false,
    metadata: { clarity: 'clear', conditions: 'z balkonu pałacu' },
  });
  edges.push({
    fromName: 'Arena Chwały', toName: 'Koszary Królewskie',
    edgeType: 'visible_from', category: 'perception',
    bidirectional: true,
    metadata: { clarity: 'clear' },
  });

  // ── Audible_from: taverns, markets, smithies ───────────────────────
  edges.push({
    fromName: 'Karczma Pod Złotym Słońcem', toName: 'Wielki Targ w Yeralden',
    edgeType: 'audible_from', category: 'perception',
    bidirectional: false,
    metadata: { loudness: 'moderate', detail: 'muzyka i gwar z karczmy' },
  });
  edges.push({
    fromName: 'Wielki Targ w Yeralden', toName: 'Karczma Pod Złotym Słońcem',
    edgeType: 'audible_from', category: 'perception',
    bidirectional: false,
    metadata: { loudness: 'moderate', detail: 'zgiełk handlarzy' },
  });
  edges.push({
    fromName: 'Arena Chwały', toName: 'Wielki Targ w Yeralden',
    edgeType: 'audible_from', category: 'perception',
    bidirectional: false,
    metadata: { loudness: 'faint', detail: 'okrzyki walczących' },
  });
  edges.push({
    fromName: 'Karczma Pod Złamanym Toporem', toName: 'Tartak Olbrami',
    edgeType: 'audible_from', category: 'perception',
    bidirectional: false,
    metadata: { loudness: 'loud', detail: 'skrzypienie piły tartacznej' },
  });

  // ── Controlled_by: faction-controlled areas ────────────────────────
  edges.push({
    fromName: 'Pałac Królewski w Yeralden', toName: 'Koszary Królewskie',
    edgeType: 'controlled_by', category: 'social',
    bidirectional: false,
    metadata: { factionId: 'gwardia_krolewska', strength: 90, since: 'od_zalozenia' },
  });
  edges.push({
    fromName: 'Wielki Targ w Yeralden', toName: 'Yeralden',
    edgeType: 'controlled_by', category: 'social',
    bidirectional: false,
    metadata: { factionId: 'gildia_kupcow', strength: 60 },
  });
  edges.push({
    fromName: 'Bractwo Cieni', toName: 'Yeralden',
    edgeType: 'controlled_by', category: 'social',
    bidirectional: false,
    metadata: { factionId: 'bractwo_cieni', strength: 30, since: 'ukryty' },
  });

  // ── Secret_path_to: hidden passages ────────────────────────────────
  edges.push({
    fromName: 'Koszary Królewskie', toName: 'Pałac Królewski w Yeralden',
    edgeType: 'secret_path_to', category: 'movement',
    bidirectional: true,
    discoveryState: 'hidden',
    metadata: { discoveryMethod: 'perception_check', difficulty: 30, description: 'Tajne przejście z koszar na dziedziniec pałacu' },
  });
  edges.push({
    fromName: 'Bractwo Cieni', toName: 'Wielki Targ w Yeralden',
    edgeType: 'secret_path_to', category: 'movement',
    bidirectional: true,
    discoveryState: 'hidden',
    metadata: { discoveryMethod: 'faction_membership', difficulty: 25, description: 'Tunel pod miastem łączący kryjówkę z rynkiem' },
  });
  edges.push({
    fromName: 'Karczma Pod Złotym Słońcem', toName: 'Bractwo Cieni',
    edgeType: 'secret_path_to', category: 'movement',
    bidirectional: true,
    discoveryState: 'hidden',
    metadata: { discoveryMethod: 'npc_reveal', difficulty: 20, description: 'Przejście przez piwnicę karczmy' },
  });

  // ── Door_to / stairs_to: within buildings ──────────────────────────
  edges.push({
    fromName: 'Karczma Pod Złotym Słońcem', toName: 'Yeralden',
    edgeType: 'door_to', category: 'movement',
    bidirectional: true,
    metadata: { description: 'Główne drzwi karczmy' },
  });
  edges.push({
    fromName: 'Świątynia Yerieli', toName: 'Yeralden',
    edgeType: 'door_to', category: 'movement',
    bidirectional: true,
    metadata: { description: 'Wielkie wrota świątyni' },
  });
  edges.push({
    fromName: 'Akademia Yerieli', toName: 'Wielka Biblioteka Yeralden',
    edgeType: 'stairs_to', category: 'movement',
    bidirectional: true,
    metadata: { direction: 'down', description: 'Schody z Akademii do podziemnej biblioteki' },
  });
  edges.push({
    fromName: 'Pałac Królewski w Yeralden', toName: 'Yeralden',
    edgeType: 'door_to', category: 'movement',
    bidirectional: true,
    metadata: { description: 'Brama pałacowa' },
  });
  edges.push({
    fromName: 'Koszary Królewskie', toName: 'Yeralden',
    edgeType: 'door_to', category: 'movement',
    bidirectional: true,
    metadata: { description: 'Wejście do koszar' },
  });

  // Only include edges for locations that actually exist in the map
  return edges.filter((e) => locationByName[e.fromName] && locationByName[e.toName]);
}
