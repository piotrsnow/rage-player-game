function normalizeSpeakerName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

const GENERIC_SPEAKER_TOKENS = new Set([
  'npc',
  'npcs',
  'common npc',
  'unknown',
  'unknown npc',
  'someone',
  'somebody',
  'person',
  'character',
  'speaker',
  'narrator',
  'gm',
  'dm',
  'ai',
  'bot',
  'none',
  'null',
  'undefined',
  '?',
  '-',
  '_',
  '???',
  '...',
  'tbd',
  'name',
  'npc name',
]);

const DESCRIPTIVE_SPEAKER_WORD_PATTERN = /\b(?:głos|glos|voice|whisper|szept|shout|krzyk)\b/i;
const DESCRIPTIVE_SOURCE_PATTERN = /\b(?:zza|spod|znad|spoza|from|behind|inside|outside|beyond)\b/i;

function normalizeSpeakerToken(name) {
  return normalizeSpeakerName(name)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[.:;!?()[\]{}"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGenericSpeakerName(name) {
  const normalized = normalizeSpeakerToken(name);
  if (!normalized) return true;
  if (GENERIC_SPEAKER_TOKENS.has(normalized)) return true;

  // Handle placeholders like "NPC1", "npc_2", "Character 3".
  if (/^(?:npc|character|speaker|unknown)\s*\d+$/i.test(normalized)) return true;
  if (/^(?:głos|glos|voice)\s+/.test(normalized)) return true;
  if (DESCRIPTIVE_SPEAKER_WORD_PATTERN.test(normalized) && DESCRIPTIVE_SOURCE_PATTERN.test(normalized)) return true;

  return false;
}

export function hasNamedSpeaker(name) {
  return !isGenericSpeakerName(name);
}
