import { imageService } from './imageGen';

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
  const raw = String(npc?.race || npc?.creatureKind || '').toLowerCase();
  if (raw.includes('dwarf') || raw.includes('krasnolud')) return 'Dwarf';
  if (raw.includes('halfling') || raw.includes('hobbit') || raw.includes('niziolek')) return 'Halfling';
  if (raw.includes('high elf')) return 'High Elf';
  if (raw.includes('wood elf')) return 'Wood Elf';
  if (raw.includes('elf')) return 'High Elf';
  return 'Human';
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
  } = options;
  const spec = buildNpcPortraitSpec(npc, genre);
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
