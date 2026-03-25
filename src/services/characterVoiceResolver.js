export function resolveVoiceForCharacter(
  characterName,
  gender,
  characterVoiceMap = {},
  localMap = new Map(),
  characterVoices = [],
  dispatch = null
) {
  if (!characterName) return null;

  const persisted = characterVoiceMap[characterName];
  if (persisted?.voiceId) {
    localMap.set(characterName, persisted);
    const genderOk = !gender || !persisted.gender || persisted.gender === gender;
    if (genderOk) return persisted.voiceId;
  }

  const local = localMap.get(characterName);
  if (local) {
    const genderOk = !gender || !local.gender || local.gender === gender;
    if (genderOk) return local.voiceId;
  }

  const existing = persisted || local;
  if (existing && !characterVoices?.length) return existing.voiceId;

  if (!characterVoices || characterVoices.length === 0) {
    return existing?.voiceId || null;
  }

  const usedVoiceIds = new Set();
  for (const entry of Object.values(characterVoiceMap)) usedVoiceIds.add(entry.voiceId);
  for (const entry of localMap.values()) usedVoiceIds.add(entry.voiceId);

  const genderPool = gender === 'male' || gender === 'female'
    ? characterVoices.filter((voice) => voice.gender === gender)
    : characterVoices;

  const pool = genderPool.length > 0 ? genderPool : characterVoices;

  let assigned = pool.find((voice) => !usedVoiceIds.has(voice.voiceId));
  if (!assigned) {
    const totalMapped = Object.keys(characterVoiceMap).length + localMap.size;
    assigned = pool[totalMapped % pool.length];
  }

  if (!assigned) return existing?.voiceId || null;

  const entry = { voiceId: assigned.voiceId, gender: gender || null };
  localMap.set(characterName, entry);

  dispatch?.({
    type: 'MAP_CHARACTER_VOICE',
    payload: { characterName, voiceId: assigned.voiceId, gender: gender || null },
  });

  return assigned.voiceId;
}
