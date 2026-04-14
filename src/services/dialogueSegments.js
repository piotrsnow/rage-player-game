export { hasNamedSpeaker, isGenericSpeakerName } from '../../shared/domain/dialogueSpeaker.js';
import { hasNamedSpeaker } from '../../shared/domain/dialogueSpeaker.js';

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
