import { imageService } from './imageGen';
import { buildNpcPortraitSubject } from './npcPortraitPromptLlm';

function ageGuess(npc) {
  if (typeof npc?.age === 'number' && Number.isFinite(npc.age)) return npc.age;
  if (typeof npc?.stats?.age === 'number' && Number.isFinite(npc.stats.age)) return npc.stats.age;
  return 35;
}

function genderGuess(npc) {
  const g = String(npc?.gender || '').toLowerCase();
  if (g === 'female' || g === 'kobieta' || g === 'k') return 'female';
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
  };
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

  // Ask the nano LLM for a polished English subject built from the full NPC
  // card (race, creatureKind, role, personality, gender, age, level). When
  // it succeeds we skip the heuristic species/career templating downstream
  // and feed the subject straight into buildPortraitPrompt. When it fails
  // we fall back to the deterministic spec — image generation never blocks
  // on the prompt LLM.
  const subjectOverride = await buildNpcPortraitSubject(npc, { force: forcePromptRefresh });

  const spec = subjectOverride
    ? { ...buildNpcPortraitSpec(npc, genre), subjectOverride }
    : buildNpcPortraitSpec(npc, genre);

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
