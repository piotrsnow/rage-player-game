// Guard rail: warn ONCE per gender key per session so we surface
// configuration problems ("no male/female voices tagged in DM settings")
// without spamming the console every scene.
const warnedEmptyPools = new Set();
function warnEmptyPool(gender, maleCount, femaleCount) {
  const key = gender || 'any';
  if (warnedEmptyPools.has(key)) return;
  warnedEmptyPools.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `[voice] No voices available for gender="${gender || 'unknown'}" `
    + `(maleVoices=${maleCount}, femaleVoices=${femaleCount}). `
    + 'Tag at least one ElevenLabs voice as male AND one as female in DM Settings → Narrator Voices.'
  );
}

/**
 * Resolves a voice for an NPC/character by name.
 *
 * - Existing mapping in `characterVoiceMap` always wins (NPC keeps same voice across scenes).
 * - For a new NPC, picks a random unused voice from the matching gender pool.
 * - Unknown gender falls back to the full pool (male + female), then narrator.
 * - Persists the picked voice via `MAP_CHARACTER_VOICE` dispatch.
 */
export function resolveVoiceForCharacter(
  characterName,
  gender,
  characterVoiceMap = {},
  { maleVoices = [], femaleVoices = [], narratorVoiceId = null } = {},
  dispatch = null
) {
  if (!characterName) return null;

  const persisted = characterVoiceMap[characterName];
  if (persisted?.voiceId) return persisted.voiceId;

  const pool = gender === 'female'
    ? femaleVoices
    : gender === 'male'
    ? maleVoices
    : [...maleVoices, ...femaleVoices];

  if (!pool.length) {
    warnEmptyPool(gender, maleVoices.length, femaleVoices.length);
    return narratorVoiceId || null;
  }

  const used = new Set(Object.values(characterVoiceMap).map((e) => e.voiceId).filter(Boolean));
  const unused = pool.filter((v) => !used.has(v.voiceId));
  const candidates = unused.length ? unused : pool;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  if (!chosen?.voiceId) return narratorVoiceId || null;

  dispatch?.({
    type: 'MAP_CHARACTER_VOICE',
    payload: { characterName, voiceId: chosen.voiceId, gender: gender || null },
  });

  return chosen.voiceId;
}

/** Pick a random voice from the matching gender pool without persisting. Used when no name is available. */
export function pickRandomVoiceForGender(gender, { maleVoices = [], femaleVoices = [] } = {}) {
  const pool = gender === 'female'
    ? femaleVoices
    : gender === 'male'
    ? maleVoices
    : [...maleVoices, ...femaleVoices];
  if (!pool.length) {
    warnEmptyPool(gender, maleVoices.length, femaleVoices.length);
    return null;
  }
  return pool[Math.floor(Math.random() * pool.length)]?.voiceId || null;
}
