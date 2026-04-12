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

function normalizeForNarrativeDedup(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .toLowerCase()
    .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDialogueDuplicateOfNarration(dialogueText, narrativeText) {
  const normalizedDialogue = normalizeForNarrativeDedup(dialogueText);
  const normalizedNarrative = normalizeForNarrativeDedup(narrativeText);
  if (!normalizedDialogue || !normalizedNarrative) return false;
  if (normalizedDialogue === normalizedNarrative) return true;

  const shorter = normalizedDialogue.length <= normalizedNarrative.length ? normalizedDialogue : normalizedNarrative;
  const longer = shorter === normalizedDialogue ? normalizedNarrative : normalizedDialogue;
  if (longer.includes(shorter) && (shorter.length / longer.length) >= 0.9) return true;

  const dialogueWords = normalizedDialogue.split(' ');
  const narrativeWords = normalizedNarrative.split(' ');
  const minLength = Math.min(dialogueWords.length, narrativeWords.length);
  const maxLength = Math.max(dialogueWords.length, narrativeWords.length);
  if (maxLength === 0) return false;

  let samePositionCount = 0;
  for (let i = 0; i < minLength; i += 1) {
    if (dialogueWords[i] === narrativeWords[i]) samePositionCount += 1;
  }
  return (samePositionCount / maxLength) >= 0.9;
}

export function filterDuplicateDialogueSegments(segments, narrativeText) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  return segments.filter((segment) => {
    if (segment?.type !== 'dialogue') return true;
    return !isDialogueDuplicateOfNarration(segment?.text, narrativeText);
  });
}

export function getDialogueSpeakerLabel(segment, fallbackLabel = 'NPC') {
  const character = typeof segment?.character === 'string' ? segment.character.trim() : '';
  if (character && hasNamedSpeaker(character)) return character;
  const speaker = typeof segment?.speaker === 'string' ? segment.speaker.trim() : '';
  if (speaker && hasNamedSpeaker(speaker)) return speaker;
  return fallbackLabel;
}
