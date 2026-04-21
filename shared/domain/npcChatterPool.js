// Ambient NPC chatter — Skyrim-style flavor lines for when the player
// passes through a location but doesn't directly engage an NPC.
//
// The scene systemPrompt picks ONE line from the matched pool and
// offers it to premium as an optional hint. Premium decides whether
// to weave it into the scene or ignore it entirely — no behaviour is
// forced. Keeps cost at zero (pure data lookup, no AI call).
//
// Shape: `{ role: { mood: [line, ...], ... }, ... }`. Role matching is
// substring (case-insensitive) against CampaignNPC.role / personality.
// Mood match key picks the tone: 'neutral' is the safe default when
// disposition is near 0; 'friendly' for disposition > 20; 'grumpy' for
// disposition < -10.

export const NPC_CHATTER_POOL = {
  karczmarz: {
    friendly: [
      'Napijesz się czegoś?',
      'Chodźcie, przy ogniu jest ciepło.',
      'Widzę że drogę miałeś ciężką.',
    ],
    neutral: [
      'Potrzebujesz łóżka na noc?',
      'Co ci podać?',
      'Nie ma tu dzisiaj tłoku.',
    ],
    grumpy: [
      'Jak nie płacisz — nie siedź.',
      'Nie mamy miejsca dla obcych.',
      'Piwo kwaśne, ale innego nie ma.',
    ],
  },
  strażnik: {
    friendly: [
      'Cicho tu dziś. Oby tak zostało.',
      'Uważaj na drogach — ostatnio zwierząt przybyło.',
    ],
    neutral: [
      'Stój, pokaż co masz przy pasie.',
      'Jeśli masz broń — trzymaj ją schowaną.',
      'Idź swoją drogą.',
    ],
    grumpy: [
      'Obcych nie lubię.',
      'Za zakłócanie spokoju jest grzywna.',
    ],
  },
  kowal: {
    friendly: [
      'Potrzebujesz naostrzyć klingę?',
      'Żelazo dziś nieźle poszło pod młotkiem.',
    ],
    neutral: [
      'Za dobrą pracę trzeba dobrze zapłacić.',
      'Zbroi na miarę nie zrobię w jeden dzień.',
    ],
    grumpy: [
      'Nie dotykaj niczego co nie twoje.',
      'Chcesz kupić — mów. Nie — idź.',
    ],
  },
  kupiec: {
    friendly: [
      'Mam najświeższe towary z daleka!',
      'Targuj się śmiało — dla przyjaciela opuszczę.',
    ],
    neutral: [
      'Co cię interesuje?',
      'Ceny jak ceny — czasy takie.',
    ],
    grumpy: [
      'Oglądaj nie dotykając.',
      'Jak nie stać — nie marnuj mojego czasu.',
    ],
  },
  wieśniak: {
    friendly: [
      'Dzień dobry wędrowcze.',
      'Z daleka przychodzisz?',
    ],
    neutral: [
      'Praca od świtu, a kolejki na wieczór.',
      'Ziemi nie przybywa.',
    ],
    grumpy: [
      'My tu swoje sprawy mamy.',
      'Nie wchodź mi w szkodę.',
    ],
  },
  kapłan: {
    friendly: [
      'Niech światło prowadzi cię drogą.',
      'Jeśli zechcesz się pomodlić — drzwi są otwarte.',
    ],
    neutral: [
      'Spokój znajdziesz w świątyni.',
      'Grzechy obciążają nawet najlżejszego.',
    ],
    grumpy: [
      'Bluźnierstwa tu nie toleruję.',
      'Modlitwa cię nie zabije — w przeciwieństwie do twoich czynów.',
    ],
  },
  mag: {
    friendly: [
      'Ciekawe czasy — magia znów płynie silniej.',
      'Szkoda że tak mało kto to zauważa.',
    ],
    neutral: [
      'Nie rozumiesz — nie pytaj.',
      'Wiedza kosztuje więcej niż myślisz.',
    ],
    grumpy: [
      'Zostaw moje zwoje w spokoju.',
      'Głupcy jak ty spalili bibliotekę w Avaltro.',
    ],
  },
  szlachcic: {
    friendly: [
      'Miło spotkać podróżnego z wieści.',
      'Siadaj, opowiedz co słychać w kraju.',
    ],
    neutral: [
      'Oczekuję że zachowasz się z klasą.',
      'Moi ludzie cię obsłużą.',
    ],
    grumpy: [
      'Znam lepszych.',
      'Jak nie masz interesu — nie mam czasu.',
    ],
  },
};

const DEFAULT_POOL = {
  friendly: ['Dzień dobry.', 'Miłej drogi.'],
  neutral: ['Mhm.', 'Pozdrawiam.'],
  grumpy: ['Co chcesz?', 'Nie przeszkadzaj.'],
};

/**
 * Pure — pick a chatter line for an NPC.
 * @param {{ role?: string, personality?: string, disposition?: number }} npc
 * @param {{ seed?: number }} [opts]
 * @returns {string | null}
 */
export function pickChatterLine(npc, { seed = Date.now() } = {}) {
  if (!npc) return null;
  const roleKey = String(npc.role || npc.personality || '').toLowerCase();
  let rolePool = DEFAULT_POOL;
  for (const key of Object.keys(NPC_CHATTER_POOL)) {
    if (roleKey.includes(key)) {
      rolePool = NPC_CHATTER_POOL[key];
      break;
    }
  }
  const disposition = typeof npc.disposition === 'number' ? npc.disposition : 0;
  const mood = disposition > 20 ? 'friendly'
    : disposition < -10 ? 'grumpy'
    : 'neutral';
  const lines = rolePool[mood] || rolePool.neutral || DEFAULT_POOL.neutral;
  if (!lines.length) return null;
  const idx = Math.abs(Math.floor(seed / 1000)) % lines.length;
  return lines[idx];
}
