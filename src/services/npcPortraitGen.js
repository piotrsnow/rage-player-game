import { imageService } from './imageGen';
import { buildNpcPortraitSubject } from './npcPortraitPromptLlm';
import { apiClient } from './apiClient';

function ageGuess(npc) {
  if (typeof npc?.age === 'number' && Number.isFinite(npc.age)) return npc.age;
  if (typeof npc?.stats?.age === 'number' && Number.isFinite(npc.stats.age)) return npc.stats.age;
  if (npc?.age != null && npc.age !== '') {
    const n = Number(String(npc.age).trim());
    if (Number.isFinite(n)) return n;
  }
  return 35;
}

function genderGuess(npc) {
  const g = String(npc?.gender || '').toLowerCase().trim();
  if (g === 'female' || g === 'kobieta' || g === 'k' || g === 'ż') return 'female';
  if (g === 'male' || g === 'mężczyzna' || g === 'm') return 'male';
  return 'male';
}

function careerGuess(npc) {
  return String(npc?.role || '').trim() || 'adventurer';
}

function speciesGuess(npc) {
  const original = String(npc?.race || npc?.creatureKind || '').trim();
  const raw = original.toLowerCase();
  if (raw.includes('dwarf') || raw.includes('krasnolud')) return 'Dwarf';
  if (raw.includes('halfling') || raw.includes('hobbit') || raw.includes('niziolek') || raw.includes('niziołek')) return 'Halfling';
  if (raw.includes('high elf')) return 'High Elf';
  if (raw.includes('wood elf')) return 'Wood Elf';
  if (raw.includes('elf')) return 'High Elf';
  if (raw.includes('human') || raw.includes('człowiek') || raw.includes('czlowiek')) return 'Human';
  // Non-humanoid race ("legendarny ptak", "smok", "wilkołak"): pass the raw
  // string through. buildPortraitPrompt detects unknown species and switches
  // into creature mode (no gender / clothing). Translation to English happens
  // downstream in imageService.generatePortrait via ensureEnglish.
  return original || 'Human';
}

export function buildNpcPortraitSpec(npc, genre) {
  return {
    species: speciesGuess(npc),
    age: ageGuess(npc),
    gender: genderGuess(npc),
    careerName: careerGuess(npc),
    genre: genre || 'Fantasy',
    // Kanoniczny opis fizyczny (PL) — używany przez generator promptu obrazu
    // jako twarde źródło, tłumaczony na angielski przez imageGen przed
    // wstawieniem do template'u.
    appearanceText: typeof npc?.appearance === 'string' && npc.appearance.trim() ? npc.appearance.trim() : null,
  };
}

// Lazy backfill: jeśli rekord NPC nie ma jeszcze appearance, prosimy backend
// żeby go wygenerował i zapisał. Mutuje obiekt npc (przypisuje appearance) i
// zwraca zaktualizowaną referencję, żeby kolejne odczyty (modale, retry
// portretu) widziały ten sam tekst. Bezpieczne w razie 4xx/5xx — wracamy z
// oryginalnym obiektem.
async function ensureNpcAppearance(npc) {
  if (!npc) return npc;
  if (typeof npc.appearance === 'string' && npc.appearance.trim()) return npc;
  // Backend backfill wymaga albo worldNpcId, albo campaignNpcId. Frontowy
  // model NPC w `world.npcs` nosi `id` (lokalny optimistic id) — szukamy
  // też pól wskazujących na rekord backendowy.
  const worldNpcId = npc.worldNpcId || null;
  const campaignNpcId = npc.campaignNpcId || null;
  if (!worldNpcId && !campaignNpcId) return npc;
  try {
    const data = await apiClient.post('/ai/npc-missing-fields', {
      worldNpcId,
      campaignNpcId,
      fields: ['appearance'],
    });
    if (data?.appearance) {
      npc.appearance = data.appearance;
    }
  } catch {
    // best-effort — dziurawe pole najwyżej da mniej spójny portret
  }
  return npc;
}

export async function generateNpcPortrait(npc, options = {}) {
  if (!npc?.id) return null;
  const {
    genre,
    provider = 'stability',
    imageStyle = 'painting',
    darkPalette = false,
    seriousness = null,
    sdModel = null,
    sdSeed = null,
    forcePromptRefresh = false,
  } = options;
  // Lazy backfill: dla legacy NPC bez canonical `appearance` poprosimy backend
  // o jego dogenerowanie. Działa równolegle z subjectOverride — appearance jest
  // stabilnym opisem z DB, subjectOverride to świeżo zbudowany przez nano-LLM
  // angielski subject. Łącząc oba, retry produkuje ten sam wygląd.
  const enriched = await ensureNpcAppearance(npc);

  // Ask the nano LLM for a polished English subject built from the full NPC
  // card (race, creatureKind, role, personality, gender, age, level). When
  // it succeeds we skip the heuristic species/career templating downstream
  // and feed the subject straight into buildPortraitPrompt. When it fails
  // we fall back to the deterministic spec — image generation never blocks
  // on the prompt LLM.
  const subjectOverride = await buildNpcPortraitSubject(enriched, { force: forcePromptRefresh });

  const spec = subjectOverride
    ? { ...buildNpcPortraitSpec(enriched, genre), subjectOverride }
    : buildNpcPortraitSpec(enriched, genre);

  return imageService.generatePortrait(
    null,
    spec,
    '',
    0,
    provider,
    imageStyle,
    darkPalette,
    seriousness,
    sdModel,
    {},
    Number.isInteger(sdSeed) ? sdSeed : null,
  );
}
