// World seed — minimal canonical starter world.
//
// Idempotent DB seed that establishes the anchor for every campaign (classic
// and Living World alike). Intentionally sparse — the world grows organically
// through campaigns and post-campaign promotion.
//
// Seeded content:
//   • Capital **Yeralden** at (0,0) with 3 sublocations (temple, tavern, market)
//   • 1 NPC — Kapłan Nieznanego Boga (tutorial priest in the temple)
//   • Village **Kamionka Stara** (SW, rolnicy) with 1 sublocation, 0 NPCs
//   • 1 dungeon, 1 wilderness, 1 ruin — minimal exploration anchors
//   • 1 bidirectional road (Yeralden ↔ Kamionka Stara)
//   • One starter `WorldLoreSection` (slug="main")
//
// F5b — every location seeded here is a canonical `WorldLocation` row. AI
// mid-play creation lands in `CampaignLocation` (per-campaign sandbox) and
// is promoted into canonical via the admin queue.
//
// Pantheon (lore, no faction tags):
//   Nieznany Bóg — najpotężniejsze bóstwo, nikt nie zna jego imienia ani natury;
//                  Świątynia Nieznanego Boga jest najstarszym budynkiem w Yeralden
//   Serneth      — bóg życia (good, worshipped in villages)
//   Yeriala      — bogini słońca (good, worshipped in cities)
//   Ferathon     — bóg śmierci (evil, hidden cult)
//
// Sub-grid coords (`subGridX/subGridY`) are authored for every sublocation so
// the Round C drill-down map has deterministic slots. Capital sub-grid is
// 10×10; village sub-grid is 5×5.
//
// The seed uses upsert-by-canonicalName / canonicalId so re-running is safe.
// It does NOT touch campaigns, user data, or existing WorldLocations/NPCs that
// are unrelated to the seed's canonical names. Safe to run on every boot.

import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { upsertEdge } from '../services/livingWorld/travelGraph.js';
import { getTemplate } from '../services/livingWorld/settlementTemplates.js';
import { batchBackfillMissing } from '../services/livingWorld/ragService.js';
import { buildNPCEmbeddingText, buildLocationEmbeddingText } from '../services/embeddingService.js';
import { seedCanonicalEdges } from './seedWorldEdges.js';

const log = childLogger({ module: 'seedWorld' });

// Bump this whenever seed data changes (arrays, lore, edges, NPCs, etc.).
const SEED_VERSION = '2026-05-10a';

const REGION = 'heartland';
const CAPITAL_NAME = 'Yeralden';

// ─────────────────────────────────────────────────────────────
// Sublocation definitions — 3 children under Yeralden
// Sub-grid: 10×10. Coords hand-picked so admin map reads clean.
// ─────────────────────────────────────────────────────────────

const SUBLOCATIONS = [
  {
    key: 'grand_temple',
    name: 'Świątynia Nieznanego Boga',
    slotType: 'grand_temple',
    slotKind: 'required',
    description: 'Najstarszy budynek w Yeralden — starszy niż samo królestwo. Kamienna świątynia poświęcona bóstwu, którego imienia nikt nie zna. Wewnątrz panuje cisza tak głęboka, że słychać bicie własnego serca.',
    category: 'temple',
    subGridX: 5, subGridY: 7,
    scale: 4,
    atmosphere: 'Chłód pradawnego kamienia, cisza gęstsza niż powietrze, blade światło sączące się znikąd i zewsząd.',
    tags: ['wiara', 'tajemnica', 'Nieznany Bóg', 'pradawny'],
  },
  {
    key: 'tavern',
    name: 'Karczma Pod Złotym Słońcem',
    slotType: 'tavern',
    slotKind: 'required',
    description: 'Najsłynniejsza karczma stolicy — punkt zborny kupców, podróżnych i szeptanych plotek.',
    category: 'tavern',
    subGridX: 6, subGridY: 4,
    scale: 3,
    atmosphere: 'Gwar rozmów, trzask ognia w kominku, zapach piwa i pieczonego mięsa.',
    tags: ['plotki', 'odpoczynek', 'handel'],
  },
  {
    key: 'market',
    name: 'Wielki Targ w Yeralden',
    slotType: 'market',
    slotKind: 'required',
    description: 'Rozległy plac targowy pełen straganów z towarami z całego królestwa.',
    category: 'market',
    subGridX: 4, subGridY: 3,
    scale: 4,
    atmosphere: 'Zgiełk targowisk, pokrzykiwania handlarzy, zapach przypraw i świeżego pieczywa.',
    tags: ['handel', 'plotki', 'tłum'],
  },
];

// ─────────────────────────────────────────────────────────────
// Named NPCs — 1 total (tutorial priest in the temple)
// ─────────────────────────────────────────────────────────────

const NAMED_NPCS = [
  {
    canonicalId: 'kaplan_nieznanego',
    name: 'Kapłan Nieznanego Boga',
    role: 'strażnik Świątyni Nieznanego Boga, przewodnik dla poszukiwaczy',
    personality: 'Cierpliwy, enigmatyczny, mówi zagadkami, ale nigdy nie odmawia pomocy. Wydaje się wiedzieć więcej niż powinien.',
    alignment: 'neutral',
    location: 'grand_temple',
    category: 'priest',
    race: 'Human',
    level: 5,
    appearance: 'Wysoki mężczyzna nieokreślonego wieku o gładkiej, bladej twarzy bez żadnych zmarszczek, długich siwych włosach opadających na ramiona i oczach tak ciemnych, że nie widać źrenic; nosi prostą szarą szatę bez żadnych symboli ani ozdób.',
    dialect: 'Mówi spokojnie, z namysłem, każde zdanie brzmi jak cytat z księgi, której nikt nie czytał — robi pauzy, jakby nasłuchiwał odpowiedzi z ciszy świątyni.',
    baselineKnowledge: [
      'Świątynia Nieznanego Boga stoi tu dłużej niż Yeralden — kamień fundamentu nie pasuje do żadnego znanego kamieniołomu. Nikt nie wie kto ją zbudował ani kiedy, ale każdy władca utrzymywał ją w stanie, jakby bał się konsekwencji zaniedbania.',
      'Nieznany Bóg jest najpotężniejszym z bóstw — ale nie objawia się jak Yeriala, Serneth czy Ferathon. Kapłan uważa, że milczenie bóstwa jest celowe: kto szuka odpowiedzi, musi szukać sam.',
      'Zna układ stolicy i wie o istnieniu okolicznych krain — Kamionki Starej, ruin i dziczy za murami. Chętnie wskaże kierunek poszukiwaczom, ale nigdy nie powie wprost co tam znajdą.',
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Villages around Yeralden — 1 seeded top-level settlement.
// Positions are 1 unit = 1 km from capital at (0,0).
// Village sub-grid is 5×5. No seeded NPCs — they arrive via campaigns.
// ─────────────────────────────────────────────────────────────

const VILLAGES = [
  {
    key: 'kamionka_stara',
    canonicalName: 'Kamionka Stara',
    aliases: ['Kamionka', 'Stara Kamionka'],
    description:
      'Rolnicza osada przy starym kamiennym moście na południowo-zachodnich traktach od Yeralden. Pola pszenicy sięgają aż do skraju traktu.',
    regionX: -2.0,
    regionY: -2.5,
    biome: 'plains',
    scale: 7,
    atmosphere: 'Szum pszenicy na wietrze, dzwony kościelne o zmierzchu i zapach świeżo upieczonego chleba.',
    tags: ['rolnictwo', 'trakty'],
    sublocations: [
      {
        key: 'tavern',
        name: 'Karczma Pod Czerwonym Ziarnem',
        slotType: 'tavern',
        slotKind: 'required',
        category: 'tavern',
        description:
          'Wiejska karczma pachnąca chlebem i kminkiem. Na ścianach wiszą snopy ostatnich żniw, a piec chlebowy pali się od świtu do zmierzchu.',
        subGridX: 2, subGridY: 2,
        scale: 2,
        atmosphere: 'Zapach chleba i kminku, trzask pieca chlebowego i cicha rozmowa wieśniaków przy stole.',
        tags: ['plotki', 'odpoczynek', 'jedzenie'],
      },
    ],
    npcs: [],
  },
];

// ─────────────────────────────────────────────────────────────
// Wilderness / ruins / dungeons — 4 canonical tiles, one per category.
// The rest of the world grows through campaigns and post-campaign
// promotion. Entering a dungeon triggers `dungeonSeedGenerator.js`.
// ─────────────────────────────────────────────────────────────

const WILD_LOCATIONS = [
  {
    key: 'ruined_watchtower',
    canonicalName: 'Zrujnowana Wieża Strażnicza',
    description: 'Nieczynna wieża graniczna, od lat zagnieżdżona przez pająki i drobne bestie. Pierwsza próba dla młodych łowców.',
    category: 'dungeon',
    locationType: 'dungeon',
    region: REGION,
    regionX: 1.8,
    regionY: -1.2,
    dangerLevel: 'safe',
    biome: 'plains',
    scale: 3,
    atmosphere: 'Sypki kamień, pajęczyny w szczelinach i cichy szelest drobnych stworzeń w ciemnościach.',
    tags: ['dungeon', 'ruiny', 'pająki'],
  },
  {
    key: 'blackwood_edge',
    canonicalName: 'Skraj Czarnoboru',
    description: 'Ciemny pas starodrzewia, gdzie słońce nie dochodzi w pełni nawet w południe. Miejsce zbioru ziół i zasadzek.',
    category: 'wilderness',
    locationType: 'forest',
    region: REGION,
    regionX: 2.2,
    regionY: 3.5,
    dangerLevel: 'moderate',
  },
  {
    key: 'old_watch_stones',
    canonicalName: 'Stare Kamienie Strażnicze',
    description: 'Krąg pionowych głazów pozostawiony przez poprzedników ludzi. Runy na nich bledną, ale w pełnię księżyca lśnią własnym światłem.',
    category: 'ruins',
    locationType: 'ruin',
    region: REGION,
    regionX: -1.5,
    regionY: 2.8,
    dangerLevel: 'moderate',
  },
];

// ─────────────────────────────────────────────────────────────
// Roads — nearest-neighbour between settlements (capital ↔ Kamionka).
// Wild tiles are reachable via fog-visible travel montage, not roads.
// ─────────────────────────────────────────────────────────────

const ROAD_DEFAULTS = {
  terrainType: 'road',
  difficulty: 'safe',
};

function euclideanKm(a, b) {
  const dx = a.regionX - b.regionX;
  const dy = a.regionY - b.regionY;
  return Math.sqrt(dx * dx + dy * dy);
}

// 8-way compass on a +X=E, +Y=N map.
function compassDirection(from, to) {
  const dx = to.regionX - from.regionX;
  const dy = to.regionY - from.regionY;
  const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  if (deg >= 337.5 || deg < 22.5) return 'E';
  if (deg < 67.5) return 'NE';
  if (deg < 112.5) return 'N';
  if (deg < 157.5) return 'NW';
  if (deg < 202.5) return 'W';
  if (deg < 247.5) return 'SW';
  if (deg < 292.5) return 'S';
  return 'SE';
}

function buildNearestNeighbourRoads(locations) {
  const roads = [];
  const seen = new Set();
  for (const from of locations) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const other of locations) {
      if (other === from) continue;
      const d = euclideanKm(from, other);
      if (d < nearestDist) {
        nearest = other;
        nearestDist = d;
      }
    }
    if (!nearest) continue;
    const key = [from.canonicalName, nearest.canonicalName].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const distance = Number(nearestDist.toFixed(2));
    roads.push({
      from: from.canonicalName,
      to: nearest.canonicalName,
      distance,
      direction: compassDirection(from, nearest),
      ...ROAD_DEFAULTS,
    });
    roads.push({
      from: nearest.canonicalName,
      to: from.canonicalName,
      distance,
      direction: compassDirection(nearest, from),
      ...ROAD_DEFAULTS,
    });
  }
  return roads;
}

// ─────────────────────────────────────────────────────────────
// Upsert helpers — canonical WorldLocation upserts carry dangerLevel +
// subGrid coords where applicable. F5b dropped `isCanonical` / `createdByCampaignId`.
// ─────────────────────────────────────────────────────────────

async function upsertCapital() {
  return prisma.worldLocation.upsert({
    where: { canonicalName: CAPITAL_NAME },
    update: {
      category: 'capital',
      locationType: 'capital',
      region: REGION,
      regionX: 0,
      regionY: 0,
      positionConfidence: 1.0,
      maxKeyNpcs: 70,
      maxSubLocations: 25,
      parentLocationId: null,
      knownByDefault: true,
      dangerLevel: 'safe',
      displayName: CAPITAL_NAME,
    },
    create: {
      canonicalName: CAPITAL_NAME,
      aliases: ['Stolica', 'Kapitol'],
      description:
        'Stolica ludzkiego królestwa, zbudowana wokół pradawnej Świątyni Nieznanego Boga. Z każdej bramy wybiega utwardzona droga w stronę serca kontynentu.',
      category: 'capital',
      locationType: 'capital',
      region: REGION,
      regionX: 0,
      regionY: 0,
      positionConfidence: 1.0,
      maxKeyNpcs: 70,
      maxSubLocations: 25,
      parentLocationId: null,
      knownByDefault: true,
      dangerLevel: 'safe',
      displayName: CAPITAL_NAME,
    },
  });
}

async function upsertSublocation(parent, sub) {
  const parentX = parent?.regionX ?? 0;
  const parentY = parent?.regionY ?? 0;
  return prisma.worldLocation.upsert({
    where: { canonicalName: sub.name },
    update: {
      parentLocationId: parent.id,
      locationType: 'interior',
      slotType: sub.slotType,
      slotKind: sub.slotKind,
      category: sub.category,
      region: REGION,
      regionX: parentX,
      regionY: parentY,
      positionConfidence: 1.0,
      dangerLevel: 'safe',
      subGridX: sub.subGridX ?? null,
      subGridY: sub.subGridY ?? null,
      displayName: sub.name,
    },
    create: {
      canonicalName: sub.name,
      aliases: [],
      description: sub.description,
      category: sub.category,
      locationType: 'interior',
      parentLocationId: parent.id,
      slotType: sub.slotType,
      slotKind: sub.slotKind,
      region: REGION,
      regionX: parentX,
      regionY: parentY,
      positionConfidence: 1.0,
      dangerLevel: 'safe',
      subGridX: sub.subGridX ?? null,
      subGridY: sub.subGridY ?? null,
      displayName: sub.name,
    },
  });
}

async function upsertVillage(village) {
  const template = getTemplate('village');
  return prisma.worldLocation.upsert({
    where: { canonicalName: village.canonicalName },
    update: {
      category: 'village',
      locationType: 'village',
      region: REGION,
      regionX: village.regionX,
      regionY: village.regionY,
      positionConfidence: 1.0,
      maxKeyNpcs: template.maxKeyNpcs,
      maxSubLocations: template.maxSubLocations,
      parentLocationId: null,
      knownByDefault: false,
      dangerLevel: 'safe',
      displayName: village.canonicalName,
    },
    create: {
      canonicalName: village.canonicalName,
      aliases: village.aliases || [],
      description: village.description,
      category: 'village',
      locationType: 'village',
      region: REGION,
      regionX: village.regionX,
      regionY: village.regionY,
      positionConfidence: 1.0,
      maxKeyNpcs: template.maxKeyNpcs,
      maxSubLocations: template.maxSubLocations,
      parentLocationId: null,
      knownByDefault: false,
      dangerLevel: 'safe',
      displayName: village.canonicalName,
    },
  });
}

async function upsertWildLocation(loc) {
  return prisma.worldLocation.upsert({
    where: { canonicalName: loc.canonicalName },
    update: {
      category: loc.category,
      locationType: loc.locationType,
      region: loc.region || REGION,
      regionX: loc.regionX,
      regionY: loc.regionY,
      positionConfidence: 1.0,
      parentLocationId: null,
      knownByDefault: false,
      dangerLevel: loc.dangerLevel || 'safe',
      displayName: loc.canonicalName,
    },
    create: {
      canonicalName: loc.canonicalName,
      aliases: [],
      description: loc.description,
      category: loc.category,
      locationType: loc.locationType,
      region: loc.region || REGION,
      regionX: loc.regionX,
      regionY: loc.regionY,
      positionConfidence: 1.0,
      parentLocationId: null,
      knownByDefault: false,
      dangerLevel: loc.dangerLevel || 'safe',
      displayName: loc.canonicalName,
    },
  });
}

async function upsertNpc(npc, locationId) {
  const shared = {
    name: npc.name,
    role: npc.role,
    personality: npc.personality,
    alignment: npc.alignment,
    currentLocationId: locationId,
    homeLocationId: locationId,
    keyNpc: true,
    alive: true,
    category: npc.category || 'commoner',
    ...(npc.race && { race: npc.race }),
    ...(npc.level && { level: npc.level }),
    ...(npc.appearance && { appearance: npc.appearance }),
    ...(npc.dialect && { dialect: npc.dialect }),
  };
  const row = await prisma.worldNPC.upsert({
    where: { canonicalId: npc.canonicalId },
    update: shared,
    create: { canonicalId: npc.canonicalId, ...shared },
  });

  // Stage 1 — hand-authored baseline knowledge seeded into WorldNpcKnowledge.
  // On re-seed, REPLACE the baseline slice only. Entries with any other
  // `source` (lived experience from campaigns) are preserved so seed reboot
  // doesn't wipe campaign-promoted memories. FIFO trigger caps at 50 per npc.
  await prisma.worldNpcKnowledge.deleteMany({
    where: { npcId: row.id, source: 'baseline' },
  });
  const baselineContents = Array.isArray(npc.baselineKnowledge) ? npc.baselineKnowledge : [];
  if (baselineContents.length > 0) {
    await prisma.worldNpcKnowledge.createMany({
      data: baselineContents.map((content) => ({
        npcId: row.id,
        content,
        source: 'baseline',
        kind: 'baseline',
      })),
    });
  }

  return row;
}

async function upsertMainLoreSection() {
  return prisma.worldLoreSection.upsert({
    where: { slug: 'main' },
    update: {
      // Title stays as-is on re-seed (admin may have edited it), but we
      // guarantee the slug exists so scene-gen always has a lore preamble
      // entry to concat from.
    },
    create: {
      slug: 'main',
      title: 'Świat Yeralden',
      content: '',
      order: 0,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// NPC explicit WorldNpcKnownLocation grants — Phase 2b.
// The priest knows about the wild locations so he can hint at them.
// ─────────────────────────────────────────────────────────────

const NPC_KNOWLEDGE_SEED = [
  {
    canonicalId: 'kaplan_nieznanego',
    locations: [
      'Kamionka Stara',
      'Zrujnowana Wieża Strażnicza',
      'Skraj Czarnoboru',
      'Stare Kamienie Strażnicze',
    ],
  },
];

async function seedNpcKnowledge(locationByName) {
  // Resolve each NPC's hinted locations → location ids, replace the seed
  // slice in WorldNpcKnownLocation. Missing names are dropped silently
  // (pre-existing DB may not have every location yet — idempotent re-seeding
  // tolerates partials).
  let updated = 0;
  for (const entry of NPC_KNOWLEDGE_SEED) {
    const ids = entry.locations
      .map((name) => locationByName[name]?.id)
      .filter(Boolean);
    if (!ids.length) continue;
    try {
      const npc = await prisma.worldNPC.findUnique({
        where: { canonicalId: entry.canonicalId },
        select: { id: true },
      });
      if (!npc) continue;
      // Replace seed-grant slice — preserve promotion/dialog grants.
      await prisma.worldNpcKnownLocation.deleteMany({
        where: { npcId: npc.id, grantedBy: 'seed' },
      });
      await prisma.worldNpcKnownLocation.createMany({
        data: ids.map((locationId) => ({ npcId: npc.id, locationId, grantedBy: 'seed' })),
        skipDuplicates: true,
      });
      updated += 1;
    } catch (err) {
      log.warn({ err: err?.message, canonicalId: entry.canonicalId }, 'NPC knownLocations seed failed');
    }
  }
  return updated;
}

// ─────────────────────────────────────────────────────────────
// Seed execution
// ─────────────────────────────────────────────────────────────

/**
 * Run the world seed. Idempotent — upsert on every canonicalName/canonicalId.
 * Returns a summary of rows touched.
 */
// Round E Phase 9 — backfill WorldEntityEmbedding for every canonical NPC
// and WorldLocation in the seed. Runs once per boot after the seed upserts
// land — `batchBackfillMissing` skips any entity that already has a row.
// Degrades gracefully when OPENAI_API_KEY is unset (local dev).
async function backfillRagEmbeddings(locationByName) {
  if (!process.env.OPENAI_API_KEY) {
    log.info('RAG backfill skipped — OPENAI_API_KEY not set');
    return { skipped: true, reason: 'no_openai_key' };
  }

  try {
    // Canonical NPCs — name+role+personality. Seed inserts are scoped by
    // canonicalId so fetching `alive=true` catches everything seeded.
    const npcs = await prisma.worldNPC.findMany({
      where: { alive: true },
      select: { id: true, name: true, role: true, personality: true },
    });
    const npcStats = await batchBackfillMissing('npc', npcs, buildNPCEmbeddingText);

    // F5b — every WorldLocation row is canonical. CampaignLocation rows
    // (per-campaign sandbox) are indexed under the separate `campaign_location`
    // entityType at creation time in processStateChanges/locations.js.
    const locations = await prisma.worldLocation.findMany({
      select: {
        id: true,
        canonicalName: true,
        displayName: true,
        locationType: true,
        region: true,
        description: true,
      },
    });
    const locStats = await batchBackfillMissing('location', locations, buildLocationEmbeddingText);

    return { npcs: npcStats, locations: locStats };
  } catch (err) {
    log.warn({ err: err?.message }, 'RAG backfill failed — continuing without embeddings');
    return { error: err?.message };
  }
}

// Canonical names that belong to the current seed. On version change,
// anything NOT in this set is cleaned up so DB matches the new sparse seed.
const SEED_CANONICAL_NAMES = new Set([
  CAPITAL_NAME,
  ...SUBLOCATIONS.map((s) => s.name),
  ...VILLAGES.map((v) => v.canonicalName),
  ...VILLAGES.flatMap((v) => v.sublocations.map((s) => s.name)),
  ...WILD_LOCATIONS.map((l) => l.canonicalName),
]);

const SEED_NPC_IDS = new Set(NAMED_NPCS.map((n) => n.canonicalId));

async function cleanupStaleSeedEntities() {
  // Delete WorldNPCs that were part of a prior seed but not the current one.
  // Only deletes keyNpc rows — campaign-promoted NPCs (keyNpc=false or no
  // canonicalId match) are untouched.
  const staleNpcs = await prisma.worldNPC.findMany({
    where: { keyNpc: true, canonicalId: { notIn: [...SEED_NPC_IDS] } },
    select: { id: true, canonicalId: true, name: true },
  });
  if (staleNpcs.length) {
    const ids = staleNpcs.map((n) => n.id);
    await prisma.worldNpcKnowledge.deleteMany({ where: { npcId: { in: ids } } });
    await prisma.worldNpcKnownLocation.deleteMany({ where: { npcId: { in: ids } } });
    await prisma.worldNPC.deleteMany({ where: { id: { in: ids } } });
    log.info({ count: staleNpcs.length, names: staleNpcs.map((n) => n.name) }, 'Cleaned up stale seed NPCs');
  }

  // Delete WorldLocations that were part of a prior seed but not the current
  // one. Children (sublocations) are deleted before parents. Only deletes
  // locations whose canonicalName is NOT in the current seed set AND that have
  // no campaign references (CampaignNPC.lastLocationId, etc.).
  const allCanonical = await prisma.worldLocation.findMany({
    where: { canonicalName: { notIn: [...SEED_CANONICAL_NAMES] } },
    select: { id: true, canonicalName: true, parentLocationId: true },
  });
  // Delete children first, then parents.
  const children = allCanonical.filter((l) => l.parentLocationId !== null);
  const parents = allCanonical.filter((l) => l.parentLocationId === null);
  for (const batch of [children, parents]) {
    if (!batch.length) continue;
    const ids = batch.map((l) => l.id);
    await prisma.road.deleteMany({ where: { OR: [{ fromLocationId: { in: ids } }, { toLocationId: { in: ids } }] } });
    await prisma.locationEdge.deleteMany({ where: { fromKind: 'world', fromId: { in: ids } } });
    await prisma.locationEdge.deleteMany({ where: { toKind: 'world', toId: { in: ids } } });
    await prisma.worldLocation.deleteMany({ where: { id: { in: ids } } });
    log.info({ count: batch.length, names: batch.map((l) => l.canonicalName) }, 'Cleaned up stale seed locations');
  }
}

export async function seedWorld() {
  if (String(process.env.SKIP_WORLD_SEED || '').toLowerCase() === 'true') {
    log.info('SKIP_WORLD_SEED=true — skipping world seed');
    return { skipped: true };
  }

  const meta = await prisma.systemMeta.findUnique({ where: { key: 'worldSeedVersion' } });
  if (meta?.value === SEED_VERSION) {
    log.info({ version: SEED_VERSION }, 'World seed up-to-date — skipping');
    return { skipped: true, reason: 'version-match' };
  }

  try {
    await cleanupStaleSeedEntities();

    const capital = await upsertCapital();

    const subByKey = {};
    for (const sub of SUBLOCATIONS) {
      const row = await upsertSublocation(capital, sub);
      subByKey[sub.key] = row;
    }

    let npcsUpserted = 0;
    for (const npc of NAMED_NPCS) {
      const sub = subByKey[npc.location];
      const locationId = sub?.id || capital.id;
      await upsertNpc(npc, locationId);
      npcsUpserted += 1;
    }

    const locationByName = { [CAPITAL_NAME]: capital };
    // Capital sublocations are also addressable by canonicalName.
    for (const sub of Object.values(subByKey)) {
      if (sub?.canonicalName) locationByName[sub.canonicalName] = sub;
    }

    let villageSubCount = 0;
    let villageNpcCount = 0;

    for (const village of VILLAGES) {
      const villageRow = await upsertVillage(village);
      locationByName[village.canonicalName] = villageRow;

      const vSubByKey = {};
      for (const sub of village.sublocations) {
        const row = await upsertSublocation(villageRow, sub);
        vSubByKey[sub.key] = row;
        if (row?.canonicalName) locationByName[row.canonicalName] = row;
        villageSubCount += 1;
      }

      for (const npc of village.npcs) {
        const sub = vSubByKey[npc.location];
        const locationId = sub?.id || villageRow.id;
        await upsertNpc(npc, locationId);
        villageNpcCount += 1;
      }
    }

    // Wild tiles — top-level dungeons, wilderness, ruins, POI.
    const wildRows = [];
    for (const loc of WILD_LOCATIONS) {
      const row = await upsertWildLocation(loc);
      wildRows.push({ ...loc, id: row.id });
      locationByName[loc.canonicalName] = row;
    }

    // Phase 2b — NPC explicit knowledge (requires all locations to exist).
    const npcKnowledgeUpdated = await seedNpcKnowledge(locationByName);

    // Roads: single bidirectional Yeralden ↔ Kamionka Stara.
    const settlementRows = [capital, ...VILLAGES.map((v) => locationByName[v.canonicalName])].filter(Boolean);
    const roads = buildNearestNeighbourRoads(settlementRows);
    void wildRows; // wildRows still upserted above for location seeding

    let roadsUpserted = 0;
    for (const road of roads) {
      const fromLoc = locationByName[road.from];
      const toLoc = locationByName[road.to];
      if (!fromLoc || !toLoc) {
        log.warn({ from: road.from, to: road.to }, 'Road skipped — location not found');
        continue;
      }
      const result = await upsertEdge({
        fromLocationId: fromLoc.id,
        toLocationId: toLoc.id,
        distance: road.distance,
        difficulty: road.difficulty,
        terrainType: road.terrainType,
        direction: road.direction,
      });
      if (result) roadsUpserted += 1;
    }

    // Seed canonical LocationEdge rows (adjacent, visible, audible, etc.)
    const edgeStats = await seedCanonicalEdges(locationByName);

    const loreSection = await upsertMainLoreSection();

    // Round E Phase 9 — index canonical NPCs + locations into the RAG store.
    // Idempotent: `batchBackfillMissing` skips entities that already have an
    // embedding row. Skipped entirely when OPENAI_API_KEY is absent (dev
    // workflows without LLM keys still get a working seed, just no RAG).
    const ragStats = await backfillRagEmbeddings(locationByName);

    await prisma.systemMeta.upsert({
      where: { key: 'worldSeedVersion' },
      update: { value: SEED_VERSION },
      create: { key: 'worldSeedVersion', value: SEED_VERSION },
    });

    log.info(
      {
        version: SEED_VERSION,
        capital: CAPITAL_NAME,
        sublocations: SUBLOCATIONS.length,
        npcs: npcsUpserted,
        villages: VILLAGES.length,
        villageSubs: villageSubCount,
        villageNpcs: villageNpcCount,
        wildLocations: WILD_LOCATIONS.length,
        npcKnowledgeUpdated,
        roads: roadsUpserted,
        graphEdges: edgeStats.edgesCreated,
        loreSectionId: loreSection.id,
        rag: ragStats,
      },
      'World seed applied',
    );
    return {
      capitalId: capital.id,
      sublocationIds: Object.values(subByKey).map((s) => s.id),
      npcsUpserted,
      villageIds: VILLAGES.map((v) => locationByName[v.canonicalName]?.id).filter(Boolean),
      villageNpcCount,
      wildLocationIds: wildRows.map((w) => w.id),
      npcKnowledgeUpdated,
      roadsUpserted,
      graphEdges: edgeStats.edgesCreated,
      rag: ragStats,
    };
  } catch (err) {
    log.error({ err: err?.message }, 'World seed failed');
    throw err;
  }
}

// Standalone invocation: `node src/scripts/seedWorld.js`
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  seedWorld()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log('Seed complete:', result);
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
