// Living World Phase 7 — world seed.
//
// Idempotent DB seed that establishes the canonical anchor for every
// Living World campaign: the human capital **Yeralden** at position (0,0),
// its sublocations (palace, temple, market, barracks, tavern, plus the
// trainer locations), and the named NPCs that run them (rulers, captain,
// 8 skill masters, fortune-teller, innkeeper — 11 total).
//
// Pantheon (lore, no faction tags):
//   Serneth  — bóg życia (good, worshipped in villages)
//   Yeriala  — bogini słońca (good, worshipped in cities, capital temple)
//   Ferathon — bóg śmierci (evil, hidden cult)
//
// The seed uses upsert-by-canonicalName so re-running is safe. It does NOT
// touch campaigns, user data, or existing WorldLocations/NPCs that are
// unrelated to the seed's canonical names. Safe to run on every boot.

import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger({ module: 'seedWorld' });

const REGION = 'heartland';
const CAPITAL_NAME = 'Yeralden';

// ─────────────────────────────────────────────────────────────
// Sublocation definitions — 11 children under Yeralden
// ─────────────────────────────────────────────────────────────

const SUBLOCATIONS = [
  {
    key: 'palace',
    name: 'Pałac Królewski w Yeralden',
    slotType: 'palace',
    slotKind: 'required',
    description: 'Marmurowa rezydencja króla Yeraldenu. Sala tronowa lśni witrażami ku chwale Yerieli.',
    category: 'palace',
  },
  {
    key: 'grand_temple',
    name: 'Świątynia Yerieli',
    slotType: 'grand_temple',
    slotKind: 'required',
    description: 'Wielka świątynia bogini słońca Yerieli. Złocone kopuły górują nad dachami stolicy.',
    category: 'temple',
  },
  {
    key: 'tavern',
    name: 'Karczma Pod Złotym Słońcem',
    slotType: 'tavern',
    slotKind: 'required',
    description: 'Najsłynniejsza karczma stolicy — punkt zborny kupców, podróżnych i szeptanych plotek.',
    category: 'tavern',
  },
  {
    key: 'market',
    name: 'Wielki Targ w Yeralden',
    slotType: 'market',
    slotKind: 'required',
    description: 'Rozległy plac targowy pełen straganów z towarami z całego królestwa.',
    category: 'market',
  },
  {
    key: 'barracks',
    name: 'Koszary Królewskie',
    slotType: 'barracks',
    slotKind: 'required',
    description: 'Siedziba gwardii królewskiej. Twardy dryl, twarde ściany.',
    category: 'barracks',
  },
  {
    key: 'arena',
    name: 'Arena Chwały',
    slotType: 'arena',
    slotKind: 'optional',
    description: 'Piaszczysty krąg pod otwartym niebem, gdzie adepci walki mierzą się z mistrzami.',
    category: 'arena',
  },
  {
    key: 'academy',
    name: 'Akademia Yerieli',
    slotType: 'academy',
    slotKind: 'optional',
    description: 'Uczelnia prowadzona przez kapłanów Yerieli — tu studiuje się wiedzę, medycynę i alchemię.',
    category: 'academy',
  },
  {
    key: 'library',
    name: 'Wielka Biblioteka Yeralden',
    slotType: 'library',
    slotKind: 'optional',
    description: 'Kolekcja zwojów i ksiąg zgromadzonych przez pokolenia uczonych.',
    category: 'library',
  },
  {
    key: 'shadow_hall',
    name: 'Bractwo Cieni',
    slotType: null,
    slotKind: 'custom',
    description: 'Sekretna siedziba mistrzów skrytych sztuk — dostępna tylko dla wtajemniczonych.',
    category: 'hideout',
  },
  {
    key: 'fortune_cottage',
    name: 'Chatka Wróżbitki Korvii',
    slotType: null,
    slotKind: 'custom',
    description: 'Zakrzywiona chatka na skraju stolicy, przesycona zapachem ziół i kadzidła.',
    category: 'hut',
  },
  {
    key: 'hunter_camp',
    name: 'Obóz Łowców',
    slotType: null,
    slotKind: 'custom',
    description: 'Drewniane zabudowania za bramami miasta, gdzie zbierają się tropiciele i łowcy potworów.',
    category: 'camp',
  },
];

// ─────────────────────────────────────────────────────────────
// Named NPCs — 12 total (ruler, temple, captain, 8 trainers, innkeeper)
// ─────────────────────────────────────────────────────────────

const NAMED_NPCS = [
  {
    canonicalId: 'king_torvan_iv',
    name: 'Król Torvan IV',
    role: 'władca Yeraldenu',
    personality: 'Stanowczy, ceni lojalność ponad talent. Nie lubi zaskoczeń.',
    alignment: 'good',
    location: 'palace',
  },
  {
    canonicalId: 'arcykaplanka_lyana',
    name: 'Arcykapłanka Lyana',
    role: 'arcykapłanka Yerieli',
    personality: 'Łagodna, mądra, nie traci spokoju nawet w obliczu herezji.',
    alignment: 'good',
    location: 'grand_temple',
  },
  {
    canonicalId: 'kapitan_gerent',
    name: 'Kapitan Gerent',
    role: 'dowódca gwardii królewskiej',
    personality: 'Szorstki, praktyczny, nie znosi dworskich intryg — woli prostą odpowiedź i dobrze naostrzony miecz.',
    alignment: 'neutral',
    location: 'barracks',
  },
  // 8 Skill Masters (Mistrzowie)
  {
    canonicalId: 'mistrz_broni_darvok',
    name: 'Mistrz Broni Darvok',
    role: 'trener Walki wręcz, broni jedno- i dwuręcznej, Strzelectwa, Uników, Walki dwiema brońmi, Zastraszania',
    personality: 'Cichy, obserwujący każdy ruch. Mówi tylko to, co konieczne — ale gdy mówi, słucha każdy adept.',
    alignment: 'neutral',
    location: 'arena',
  },
  {
    canonicalId: 'mistrz_ciala_ilara',
    name: 'Mistrzyni Ciała Ilara',
    role: 'trenerka Atletyki, Akrobatyki, Jeździectwa',
    personality: 'Energiczna, bezpośrednia, wyznaje zasadę że ciało nie kłamie.',
    alignment: 'good',
    location: 'arena',
  },
  {
    canonicalId: 'mistrzyni_retoryki_venadra',
    name: 'Mistrzyni Retoryki Venadra',
    role: 'trenerka Perswazji, Blefu, Handlu, Przywództwa i Występów',
    personality: 'Elokwentna, uśmiechnięta, nigdy nie odsłania więcej niż musi.',
    alignment: 'neutral',
    location: 'market',
  },
  {
    canonicalId: 'mistrz_wiedzy_taelor',
    name: 'Mistrz Wiedzy Taelor',
    role: 'trener Wiedzy ogólnej, Wiedzy o potworach, Wiedzy o naturze, Rzemiosła',
    personality: 'Pedantyczny uczony, skarbnica cytatów. Testuje adeptów zagadkami zamiast egzaminem.',
    alignment: 'good',
    location: 'academy',
  },
  {
    canonicalId: 'mistrzyni_medyka_senya',
    name: 'Mistrzyni Medyka Senya',
    role: 'trenerka Medycyny i Alchemii',
    personality: 'Spokojna, cierpliwa, bardziej oddana pacjentom niż polityce Akademii.',
    alignment: 'good',
    location: 'academy',
  },
  {
    canonicalId: 'mistrz_cieni_ashen',
    name: 'Mistrz Cieni Ashen',
    role: 'trener Skradania, Otwierania zamków, Kradzieży kieszonkowej, Pułapek i mechanizmów, Spostrzegawczości',
    personality: 'Niewidoczny aż do momentu gdy sam zdecyduje się ujawnić. Sprawdza uczniów, zanim ci go zauważą.',
    alignment: 'neutral',
    location: 'shadow_hall',
  },
  {
    canonicalId: 'mistrz_przetrwania_karros',
    name: 'Mistrz Przetrwania Karros',
    role: 'trener Przetrwania, Tropienia, Odporności',
    personality: 'Zgrubiały łowca, mówi krótko, ufa bardziej lasom niż ludziom.',
    alignment: 'neutral',
    location: 'hunter_camp',
  },
  {
    canonicalId: 'wrozbitka_korvia',
    name: 'Wróżbitka Korvia',
    role: 'mistrzyni Fartu, Hazardu i Przeczucia',
    personality: 'Stara, przenikliwa, wypowiada zdania tak, że brzmią jak wyrok losu.',
    alignment: 'neutral',
    location: 'fortune_cottage',
  },
  // Flavor NPC
  {
    canonicalId: 'karczmarz_tamar',
    name: 'Karczmarz Tamar',
    role: 'gospodarz Karczmy Pod Złotym Słońcem',
    personality: 'Jowialny, pamięta każdą twarz, każdą plotkę i każdy dług.',
    alignment: 'neutral',
    location: 'tavern',
  },
];

// ─────────────────────────────────────────────────────────────
// Seed execution
// ─────────────────────────────────────────────────────────────

async function upsertCapital() {
  return prisma.worldLocation.upsert({
    where: { canonicalName: CAPITAL_NAME },
    update: {
      // Keep existing description/aliases in case admin edited them, but
      // enforce position + topology fields.
      category: 'capital',
      locationType: 'capital',
      region: REGION,
      regionX: 0,
      regionY: 0,
      positionConfidence: 1.0,
      maxKeyNpcs: 70,
      maxSubLocations: 25,
      parentLocationId: null,
    },
    create: {
      canonicalName: CAPITAL_NAME,
      aliases: JSON.stringify(['Stolica', 'Kapitol']),
      description:
        'Słoneczna stolica ludzkiego królestwa. Siedziba tronu, wielkiej świątyni Yerieli i akademii. Z każdej bramy wybiega utwardzona droga w stronę serca kontynentu.',
      category: 'capital',
      locationType: 'capital',
      region: REGION,
      regionX: 0,
      regionY: 0,
      positionConfidence: 1.0,
      maxKeyNpcs: 70,
      maxSubLocations: 25,
    },
  });
}

async function upsertSublocation(capitalId, sub) {
  return prisma.worldLocation.upsert({
    where: { canonicalName: sub.name },
    update: {
      parentLocationId: capitalId,
      locationType: 'interior',
      slotType: sub.slotType,
      slotKind: sub.slotKind,
      category: sub.category,
      region: REGION,
      regionX: 0,
      regionY: 0,
      positionConfidence: 1.0,
    },
    create: {
      canonicalName: sub.name,
      aliases: JSON.stringify([]),
      description: sub.description,
      category: sub.category,
      locationType: 'interior',
      parentLocationId: capitalId,
      slotType: sub.slotType,
      slotKind: sub.slotKind,
      region: REGION,
      regionX: 0,
      regionY: 0,
      positionConfidence: 1.0,
    },
  });
}

async function upsertNpc(npc, locationId) {
  return prisma.worldNPC.upsert({
    where: { canonicalId: npc.canonicalId },
    update: {
      name: npc.name,
      role: npc.role,
      personality: npc.personality,
      alignment: npc.alignment,
      currentLocationId: locationId,
      homeLocationId: locationId,
      keyNpc: true,
      alive: true,
    },
    create: {
      canonicalId: npc.canonicalId,
      name: npc.name,
      role: npc.role,
      personality: npc.personality,
      alignment: npc.alignment,
      currentLocationId: locationId,
      homeLocationId: locationId,
      keyNpc: true,
      alive: true,
    },
  });
}

/**
 * Run the world seed. Idempotent — upsert on every canonicalName/canonicalId.
 * Returns a summary of rows touched.
 */
export async function seedWorld() {
  try {
    const capital = await upsertCapital();

    const subByKey = {};
    for (const sub of SUBLOCATIONS) {
      const row = await upsertSublocation(capital.id, sub);
      subByKey[sub.key] = row;
    }

    let npcsUpserted = 0;
    for (const npc of NAMED_NPCS) {
      const sub = subByKey[npc.location];
      const locationId = sub?.id || capital.id;
      await upsertNpc(npc, locationId);
      npcsUpserted += 1;
    }

    log.info(
      { capital: CAPITAL_NAME, sublocations: SUBLOCATIONS.length, npcs: npcsUpserted },
      'World seed applied',
    );
    return {
      capitalId: capital.id,
      sublocationIds: Object.values(subByKey).map((s) => s.id),
      npcsUpserted,
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
