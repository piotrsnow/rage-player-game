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

  if (!pool.length) return narratorVoiceId || null;

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
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)]?.voiceId || null;
}
