function normalizeSpeakerName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

export function isGenericSpeakerName(name) {
  const normalized = normalizeSpeakerName(name).toLowerCase();
  return !normalized || normalized === 'npc';
}

export function hasNamedSpeaker(name) {
  return !isGenericSpeakerName(name);
}
