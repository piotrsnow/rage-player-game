// Living World — Polish-themed settlement name bank.
//
// Per-type pools for deterministic-flavor names used by worldSeeder when
// seeding per-campaign hamlets/villages/towns/cities. Capital is NOT here —
// the canonical capital `Yeralden` is seeded globally by `seedWorld.js` and
// shared across every Living World campaign.
//
// Keep each list large enough that two adjacent campaigns rarely collide on
// the same name, and so that fuzzy-dedup in `findOrCreateWorldLocation`
// doesn't keep routing new campaigns onto the same rows. When a name is
// already taken (per-campaign already-used set OR an existing WorldLocation
// with that canonicalName is closer than the new slot's spacing tolerance),
// `pickSettlementName` falls through to the next candidate.

const HAMLETS = [
  'Dębowy Zakątek', 'Borowa Osada', 'Kłosowe Pole', 'Wilcza Polana', 'Sosnowa Chata',
  'Mglisty Młyn', 'Kamienny Bród', 'Leśny Chutor', 'Jesionowa Kępa', 'Rzeczna Wólka',
  'Torfowa Osada', 'Bobrowe Rozlewisko', 'Szumna Dolinka', 'Jodłowy Przysiółek', 'Wrzosowa Łąka',
  'Głogowa Chata', 'Bagienny Rzut', 'Koźla Zagroda', 'Sowie Wzgórze', 'Zimny Strumień',
  'Liściasty Chłodnik', 'Miodowa Osada', 'Krzemowy Gródek', 'Lipowe Ustronie', 'Czarny Młyn',
  'Jagodny Wąwóz', 'Smolna Kępa', 'Grabowa Polana', 'Ciemna Chutor', 'Mchowa Osada',
];

const VILLAGES = [
  'Lisowice', 'Modrzejów', 'Kamienna Wola', 'Strzegów', 'Jodłowy Brzeg',
  'Konopna', 'Biskupice', 'Radoszyn', 'Mierzęcin', 'Kępno Małe',
  'Wiślica', 'Czarnolas', 'Żabieniec', 'Jelenia Wola', 'Dobrowola',
  'Borzęcin', 'Krzywa Góra', 'Sieradowice', 'Zagórze', 'Brzegowa',
  'Przerośl', 'Kwiatków', 'Orzechowa', 'Sosnówka', 'Lipnica Dolna',
  'Rybno', 'Turowice', 'Wilczyce', 'Białogóra', 'Studzianki',
];

const TOWNS = [
  'Kamienica', 'Miodogród', 'Złoty Potok', 'Wrońsk', 'Srebrnogród',
  'Twarda Grobla', 'Grabowiec', 'Dębogóra', 'Kruszwica', 'Brzostówka',
  'Ostrołęka', 'Sandomir', 'Przemyśl Stary', 'Świętopółk', 'Wolbrom',
  'Dobrogrodek', 'Piekary', 'Sławków', 'Wieliszew', 'Bielany',
  'Zatorów', 'Pyrzyce Górne', 'Kolbierz', 'Czorsztyn', 'Rawa Niska',
  'Książ Dolny', 'Radomil', 'Tarnowiec', 'Morągów', 'Olkuszyn',
];

const CITIES = [
  'Radogoszcz', 'Białobrzeg', 'Srebrna Przystań', 'Gniezdno', 'Wawelgród',
  'Złotoryja', 'Piastowice', 'Krzyżogród', 'Miedziana Wieża', 'Jarosławek',
  'Wielkopole', 'Starogard', 'Lubusz', 'Piotrogród', 'Kamienna Wieża',
  'Orlogród', 'Święcicz', 'Chrobrogród', 'Bielogród', 'Czerwień',
];

const POOLS = { hamlet: HAMLETS, village: VILLAGES, town: TOWNS, city: CITIES };

/**
 * Pick a name for the given settlement type that is not already in `usedSet`.
 * `usedSet` is a `Set<string>` — caller owns deduping across the current seed
 * pass plus optionally against existing WorldLocation canonical names.
 *
 * Falls back to `${baseName} II` (`III`, …) if the entire pool collides —
 * ensures seeding never hard-fails on a popular-name campaign.
 */
export function pickSettlementName(type, usedSet) {
  const pool = POOLS[type];
  if (!pool || pool.length === 0) {
    throw new Error(`nameBank: no pool for settlement type "${type}"`);
  }
  for (const name of pool) {
    if (!usedSet.has(name)) {
      usedSet.add(name);
      return name;
    }
  }
  // Exhausted — append roman-numeral suffix
  for (let suffix = 2; suffix <= 20; suffix += 1) {
    for (const name of pool) {
      const variant = `${name} ${romanize(suffix)}`;
      if (!usedSet.has(variant)) {
        usedSet.add(variant);
        return variant;
      }
    }
  }
  // Extremely unlikely — 600+ collisions. Last-resort fallback.
  const fallback = `${pool[0]} ${Date.now()}`;
  usedSet.add(fallback);
  return fallback;
}

const ROMAN = [
  ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1],
];
function romanize(n) {
  let out = '';
  let rem = n;
  for (const [sym, val] of ROMAN) {
    while (rem >= val) {
      out += sym;
      rem -= val;
    }
  }
  return out;
}

export const SETTLEMENT_NAME_POOLS = POOLS;
