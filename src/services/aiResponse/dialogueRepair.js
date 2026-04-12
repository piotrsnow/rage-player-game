import { hasNamedSpeaker, isGenericSpeakerName } from '../dialogueSegments.js';

const QUOTE_OPEN = '„\u201C«"';
const QUOTE_CLOSE = '\u201D"»\u201C';
const QUOTE_PATTERN = new RegExp(`[${QUOTE_OPEN}]([^${QUOTE_OPEN}${QUOTE_CLOSE}]+)[${QUOTE_CLOSE}]`, 'g');

const REFERENCE_TAIL = /(?:^|\s)(?:o|na|w|z|od|do|za|pod|nad|przed|po|przy|między|przez|dla|bez|jako|czyli|pt\.?|tzw\.?|zwan\w*|określ[ao]n\w*|nazwan\w*|zatytułowan\w*|podpisan\w*|oznaczon\w*|napis\w*|słow[aoy]|hasł[oaem]|about|of|on|in|with|from|to|as|titled|called|named|aka)[\s,:;]*$/i;
const SHORT_CONNECTOR = /^[\s,;]*(?:i|lub|albo|oraz|a|ani|czy|or|and)?\s*$/;

function isLikelyReference(textBetween, prevWasReference) {
  if (REFERENCE_TAIL.test(textBetween)) return true;
  if (prevWasReference && SHORT_CONNECTOR.test(textBetween)) return true;
  return false;
}

function fuzzyMatchPolishName(candidate, reference) {
  const cLower = candidate.toLowerCase();
  const rLower = reference.toLowerCase();
  if (cLower === rLower) return true;
  if (cLower.length < 3 || rLower.length < 3) return false;
  const shorter = cLower.length <= rLower.length ? cLower : rLower;
  const longer = cLower.length > rLower.length ? cLower : rLower;
  const minStem = Math.max(3, Math.ceil(shorter.length * 0.6));
  if (longer.startsWith(shorter.slice(0, minStem)) && Math.abs(cLower.length - rLower.length) <= 4) {
    return true;
  }
  return false;
}

function isExcludedName(raw, excludeNames) {
  return excludeNames.some(name =>
    name.toLowerCase().split(/\s+/).some(p =>
      p.toLowerCase() === raw.toLowerCase() || fuzzyMatchPolishName(raw, p)
    )
  );
}

function findSpeakerInText(textBefore, knownNames, excludeNames = []) {
  const words = textBefore.trim().split(/\s+/);

  for (let i = words.length - 1; i >= 0; i--) {
    const raw = words[i].replace(/[,:;.!?…\-—]+$/, '');
    if (raw.length < 2) continue;

    for (let j = 0; j < knownNames.length; j++) {
      const parts = knownNames[j].split(/\s+/);
      if (parts.some(p => p.toLowerCase() === raw.toLowerCase() || fuzzyMatchPolishName(raw, p))) {
        if (!isExcludedName(raw, excludeNames)) return knownNames[j];
        break;
      }
    }

    if (raw[0] === raw[0].toUpperCase() && raw[0] !== raw[0].toLowerCase()) {
      const isFirstWord = i === 0 || /[.!?…]$/.test(words[i - 1] || '');
      if (!isFirstWord) {
        if (!isExcludedName(raw, excludeNames)) return raw;
      }
    }
  }
  return null;
}

function lookupGender(name, knownNpcs, existingDialogueSegments) {
  if (!name) return undefined;

  for (const npc of knownNpcs) {
    if (!npc.name) continue;
    const npcParts = npc.name.split(/\s+/);
    if (fuzzyMatchPolishName(name, npc.name) || npcParts.some(p => fuzzyMatchPolishName(name, p))) {
      return npc.gender || undefined;
    }
  }

  for (const seg of existingDialogueSegments) {
    if (!hasNamedSpeaker(seg.character)) continue;
    const segParts = seg.character.split(/\s+/);
    if (fuzzyMatchPolishName(name, seg.character) || segParts.some(p => fuzzyMatchPolishName(name, p))) {
      return seg.gender || undefined;
    }
  }
  return undefined;
}

function normalizeTextForDedup(text) {
  return (text || '').trim().toLowerCase().replace(/[""„"«»'']/g, '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanupNarrationAfterDialogueStrip(text) {
  return String(text || '')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/([,.;:!?…])\s*([,.;:!?…])+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.;:!?…\s-]+/, '')
    .replace(/\s+[-–—]\s+/g, ' ')
    .trim();
}

function stripDialogueRepeatsFromNarration(narrationText, dialogueTexts) {
  let remaining = String(narrationText || '').trim();
  if (!remaining || !Array.isArray(dialogueTexts) || dialogueTexts.length === 0) return remaining;

  const sortedDialogues = [...dialogueTexts]
    .map((text) => String(text || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const dialogueText of sortedDialogues) {
    const escaped = escapeRegex(dialogueText);
    const quotedPattern = new RegExp(`[„“"«]\\s*${escaped}\\s*[”"»](?:\\s*[.!?,:;…-]+)?`, 'gi');
    const barePattern = new RegExp(`(?:^|[\\s([{\\-–—])${escaped}(?=$|[\\s\\])}.,!?;:…\\-–—])`, 'gi');

    remaining = remaining.replace(quotedPattern, ' ');
    remaining = remaining.replace(barePattern, ' ');
    remaining = cleanupNarrationAfterDialogueStrip(remaining);
  }

  return cleanupNarrationAfterDialogueStrip(remaining);
}

function hardDedupeSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const deduped = [];
  const dialogueByText = new Map();
  const allDialogueTexts = segments
    .filter((seg) => seg?.type === 'dialogue' && typeof seg.text === 'string' && seg.text.trim())
    .map((seg) => seg.text.trim());

  for (const seg of segments) {
    if (!seg || typeof seg !== 'object') continue;
    const type = seg.type === 'dialogue' ? 'dialogue' : 'narration';
    const rawText = typeof seg.text === 'string' ? seg.text.trim() : '';
    const text = type === 'narration'
      ? stripDialogueRepeatsFromNarration(rawText, allDialogueTexts)
      : rawText;
    if (!text) continue;

    const normalizedText = normalizeTextForDedup(text);
    if (!normalizedText) continue;

    if (type === 'dialogue') {
      const existingIdx = dialogueByText.get(normalizedText);
      const normalizedCharacter = typeof seg.character === 'string' ? seg.character.trim() : '';
      const incomingNamed = hasNamedSpeaker(normalizedCharacter);

      if (existingIdx == null) {
        deduped.push({
          ...seg,
          text,
          ...(incomingNamed ? { character: normalizedCharacter } : {}),
        });
        dialogueByText.set(normalizedText, deduped.length - 1);
        continue;
      }

      const existing = deduped[existingIdx];
      const existingNamed = hasNamedSpeaker(existing?.character);

      // Prefer the named speaker version over a generic/anonymous duplicate.
      if (!existingNamed && incomingNamed) {
        deduped[existingIdx] = {
          ...existing,
          ...seg,
          text,
          character: normalizedCharacter,
          ...(seg.gender ? { gender: seg.gender } : {}),
        };
      }
      continue;
    }

    const previous = deduped[deduped.length - 1];
    if (previous?.type === 'narration' && normalizeTextForDedup(previous.text) === normalizedText) {
      continue;
    }

    deduped.push({ ...seg, text });
  }

  return deduped;
}

const DIRECT_SPEECH_PL = /(?:^|\W)(?:ty|ci|cię|ciebie|twój|twoja|twoje|twoim|twoją|tobie|chcesz|masz|musisz|możesz|widzisz|wiesz|znasz|słyszysz|jesteś|potrzebujesz|pomóż|powiedz|daj|weź|chodź|idź|patrz|słuchaj|posłuchaj|czekaj|spójrz|poczekaj|uważaj)(?:\W|$)/i;
const DIRECT_SPEECH_EN = /\b(?:you|your|yours|yourself|you're|you've)\b/i;
const FIRST_PERSON_SPEECH = /(?:^|\W)(?:mi|mnie|mną|mój|moja|moje|moim|moją|mojego|mojej|moich|ze mną|me|my|myself)(?:\W|$)/i;
const NARRATION_ADDRESS_EN = /\byou\s+(?:see|notice|feel|hear|smell|remember|watch|stand|walk|step|enter|approach|move|turn|look|find|spot|sense|are|have|can)\b/i;
const NARRATION_ADDRESS_PL = /(?:^|\W)(?:widzisz|czujesz|słyszysz|zauważasz|przypominasz sobie|stoisz|idziesz|wchodzisz|zbliżasz się|rozglądasz się)(?:\W|$)/i;
const SPEECH_VERB_HINT = /(?:^|\W)(?:mówi|powiedzia(?:ł|ła|łem|łam|łeś|łaś)|rzek(?:ł|ła)|mrukn(?:ął|ęła)|szepn(?:ął|ęła)|krzykn(?:ął|ęła)|spyta(?:ł|ła)|odpar(?:ł|ła)|odpow(?:iada|iedzia(?:ł|ła))|said|says|asked|asks|replied|replies|whispered|whispers|shouted|shouts|told|tells)(?:\W|$)/i;
const DIALOGUE_DASH_PREFIX = /^\s*[—-]\s*/;
const IMPERATIVE_SPEECH_PL = /(?:^|\W)(?:pomóż|powiedz|daj|weź|chodź|idź|patrz|słuchaj|posłuchaj|czekaj|spójrz|poczekaj|uważaj)(?:\W|$)/i;

function isLikelyNarrationAddress(text) {
  const t = (text || '').trim();
  if (!t) return false;
  const hasStrongSpeechPunctuation = /[!?]/.test(t);
  return (NARRATION_ADDRESS_EN.test(t) || NARRATION_ADDRESS_PL.test(t)) && !hasStrongSpeechPunctuation;
}

function looksLikeDirectSpeech(text) {
  if (!text || text.trim().length < 15) return false;
  const t = text.trim();
  if (isLikelyNarrationAddress(t)) return false;
  if (DIRECT_SPEECH_PL.test(t)) {
    // Polish second-person markers ("masz", "możesz") often appear in narration.
    // Require at least one stronger speech cue before reclassifying as dialogue.
    const hasStrongSpeechCue = SPEECH_VERB_HINT.test(t)
      || /[!?]/.test(t)
      || DIALOGUE_DASH_PREFIX.test(t)
      || IMPERATIVE_SPEECH_PL.test(t);
    return hasStrongSpeechCue;
  }
  if (DIRECT_SPEECH_EN.test(t)) return /[!?]/.test(t) || SPEECH_VERB_HINT.test(t);
  if (t.includes('?') && FIRST_PERSON_SPEECH.test(t) && SPEECH_VERB_HINT.test(t)) return true;
  return false;
}

function startsWithCharacterAction(text, allNames) {
  const firstWord = text.trim().split(/\s+/)[0].replace(/[,:;.!?…\-—]+$/, '');
  if (firstWord.length < 2) return false;
  return allNames.some(name =>
    name.split(/\s+/).some(part => fuzzyMatchPolishName(firstWord, part))
  );
}

function findSpeakerFromContext(segments, currentIndex, knownNames, knownNpcs, excludeNames) {
  for (let i = currentIndex - 1; i >= Math.max(0, currentIndex - 4); i--) {
    if (segments[i].type === 'dialogue' && hasNamedSpeaker(segments[i].character)) {
      if (!isExcludedName(segments[i].character, excludeNames)) return segments[i].character;
    }
  }
  for (let i = currentIndex - 1; i >= Math.max(0, currentIndex - 2); i--) {
    if (segments[i].type !== 'narration' || !segments[i].text) continue;
    const words = segments[i].text.trim().split(/\s+/);
    for (let w = words.length - 1; w >= 0; w--) {
      const raw = words[w].replace(/[,:;.!?…\-—]+$/, '');
      if (raw.length < 2) continue;
      for (const name of knownNames) {
        if (name.split(/\s+/).some(p => fuzzyMatchPolishName(raw, p))) {
          if (!isExcludedName(raw, excludeNames)) return name;
        }
      }
    }
  }
  return null;
}

function resolveFallbackSpeaker({
  preferredSpeaker = null,
  segments = [],
  currentIndex = -1,
  textBeforeQuote = '',
  knownNames = [],
  knownNpcs = [],
  excludeNames = [],
} = {}) {
  let speaker = preferredSpeaker;

  if (!speaker && textBeforeQuote) {
    speaker = findSpeakerInText(textBeforeQuote, knownNames, excludeNames);
  }

  if (!speaker && currentIndex >= 0) {
    speaker = findSpeakerFromContext(segments, currentIndex, knownNames, knownNpcs, excludeNames);
  }

  if (!speaker && knownNames.length === 1) {
    speaker = knownNames[0];
  }

  if (!speaker || isExcludedName(speaker, excludeNames)) return null;
  return speaker;
}

export function repairDialogueSegments(narrative, segments, knownNpcs = [], excludeNames = []) {
  if (!segments || segments.length === 0) {
    if (narrative && narrative.trim()) {
      segments = [{ type: 'narration', text: narrative }];
    } else {
      return [];
    }
  }

  const existingDialogueSegments = segments.filter(s => s.type === 'dialogue' && hasNamedSpeaker(s.character));
  const knownNames = [
    ...new Set([
      ...knownNpcs.map(n => n.name).filter(Boolean),
      ...existingDialogueSegments.map(s => s.character).filter(Boolean),
    ])
  ].filter(name => !isExcludedName(name, excludeNames));

  const existingDialogueTexts = new Set(
    existingDialogueSegments.map(s => (s.text || '').trim().toLowerCase()).filter(Boolean)
  );

  const repaired = [];
  for (let segIndex = 0; segIndex < segments.length; segIndex++) {
    const seg = segments[segIndex];
    if (seg.type !== 'narration' || !seg.text) {
      if (seg.type === 'dialogue' && !hasNamedSpeaker(seg.character)) {
        const spokenText = String(seg.text || '').trim();
        const genericLabelProvided = typeof seg.character === 'string' && isGenericSpeakerName(seg.character);
        if (spokenText && genericLabelProvided) {
          // Keep unknown/descriptor speakers as dialogue, but neutralize actor identity.
          repaired.push({
            type: 'dialogue',
            character: 'NPC',
            text: spokenText,
            ...(typeof seg.gender === 'string' ? { gender: seg.gender } : {}),
          });
          continue;
        }
        const fallbackSpeaker = resolveFallbackSpeaker({
          segments,
          currentIndex: segIndex,
          knownNames,
          knownNpcs,
          excludeNames,
        });
        if (fallbackSpeaker && spokenText) {
          const gender = lookupGender(fallbackSpeaker, knownNpcs, existingDialogueSegments);
          repaired.push({
            type: 'dialogue',
            character: fallbackSpeaker,
            text: spokenText,
            ...(gender ? { gender } : {}),
          });
        } else {
          // Safe mode: unknown speaker should not appear as anonymous dialogue.
          repaired.push({ type: 'narration', text: spokenText });
        }
      } else {
        repaired.push(seg);
      }
      continue;
    }

    QUOTE_PATTERN.lastIndex = 0;
    if (!QUOTE_PATTERN.test(seg.text)) {
      repaired.push(seg);
      continue;
    }

    QUOTE_PATTERN.lastIndex = 0;
    let lastIndex = 0;
    let match;
    const parts = [];
    let prevMatchEnd = 0;
    let prevWasReference = false;

    while ((match = QUOTE_PATTERN.exec(seg.text)) !== null) {
      const textBetween = seg.text.slice(prevMatchEnd, match.index);

      if (isLikelyReference(textBetween, prevWasReference)) {
        prevWasReference = true;
        prevMatchEnd = match.index + match[0].length;
        continue;
      }

      prevWasReference = false;
      prevMatchEnd = match.index + match[0].length;

      const before = seg.text.slice(lastIndex, match.index);
      if (before.trim()) {
        parts.push({ type: 'narration', text: before.trimEnd() });
      }

      const spokenText = match[1].trim();

      if (existingDialogueTexts.has(spokenText.toLowerCase())) {
        lastIndex = match.index + match[0].length;
        continue;
      }

      const speakerName = findSpeakerInText(
        seg.text.slice(0, match.index),
        knownNames,
        excludeNames
      );
      const resolvedSpeaker = resolveFallbackSpeaker({
        preferredSpeaker: speakerName,
        segments,
        currentIndex: segIndex,
        textBeforeQuote: seg.text.slice(0, match.index),
        knownNames,
        knownNpcs,
        excludeNames,
      });
      const gender = lookupGender(resolvedSpeaker, knownNpcs, existingDialogueSegments);

      if (resolvedSpeaker) {
        parts.push({
          type: 'dialogue',
          character: resolvedSpeaker,
          text: spokenText,
          ...(gender ? { gender } : {}),
        });
      } else {
        // Safe mode: keep speech as narration when we cannot identify actor confidently.
        parts.push({ type: 'narration', text: spokenText });
      }

      lastIndex = match.index + match[0].length;
    }

    const trailing = seg.text.slice(lastIndex);
    if (trailing.trim()) {
      parts.push({ type: 'narration', text: trailing.trimStart() });
    }

    if (parts.length > 0) {
      repaired.push(...parts);
    } else {
      repaired.push(seg);
    }
  }

  // Deduplicate: remove narration segments whose text duplicates a dialogue segment
  const dialogueTextSet = new Set();
  for (const seg of repaired) {
    if (seg.type === 'dialogue' && seg.text) {
      dialogueTextSet.add(normalizeTextForDedup(seg.text));
    }
  }
  const deduped = repaired.filter(seg => {
    if (seg.type !== 'narration' || !seg.text) return true;
    return !dialogueTextSet.has(normalizeTextForDedup(seg.text));
  });

  // Detect unquoted dialogue in narration segments
  const allNames = [...knownNames, ...excludeNames];
  const enhanced = [];
  for (let i = 0; i < deduped.length; i++) {
    const seg = deduped[i];
    if (seg.type !== 'narration' || !seg.text || seg.text.trim().length < 15) {
      enhanced.push(seg);
      continue;
    }
    if (isLikelyNarrationAddress(seg.text)) {
      enhanced.push(seg);
      continue;
    }
    if (startsWithCharacterAction(seg.text, allNames)) {
      enhanced.push(seg);
      continue;
    }
    if (!looksLikeDirectSpeech(seg.text)) {
      enhanced.push(seg);
      continue;
    }
    const speaker = findSpeakerFromContext(deduped, i, knownNames, knownNpcs, excludeNames);
    if (!speaker) {
      enhanced.push(seg);
      continue;
    }
    const gender = lookupGender(speaker, knownNpcs, existingDialogueSegments);
    enhanced.push({
      type: 'dialogue',
      character: speaker,
      text: seg.text.trim(),
      ...(gender ? { gender } : {}),
    });
  }

  // Second pass: re-attribute narration immediately before dialogue if it has first-person markers
  for (let i = enhanced.length - 2; i >= 0; i--) {
    const seg = enhanced[i];
    if (seg.type !== 'narration' || !seg.text || seg.text.trim().length < 15) continue;
    const next = enhanced[i + 1];
    if (next.type !== 'dialogue' || !next.character) continue;
    if (startsWithCharacterAction(seg.text, allNames)) continue;
    if (isLikelyNarrationAddress(seg.text)) continue;
    if (!FIRST_PERSON_SPEECH.test(seg.text)) continue;
    if (!looksLikeDirectSpeech(seg.text)) continue;
    const gender = lookupGender(next.character, knownNpcs, existingDialogueSegments);
    enhanced[i] = {
      type: 'dialogue',
      character: next.character,
      text: seg.text.trim(),
      ...(gender ? { gender } : {}),
    };
  }

  const hardened = hardDedupeSegments(enhanced);

  if (narrative && narrative.trim()) {
    const enhancedText = hardened.map(s => (s.text || '').trim()).join('');
    if (enhancedText.length < narrative.trim().length * 0.7) {
      const alreadySynthetic = segments.length === 1
        && segments[0].type === 'narration'
        && segments[0].text === narrative;
      if (!alreadySynthetic) {
        return repairDialogueSegments(narrative, [{ type: 'narration', text: narrative }], knownNpcs, excludeNames);
      }
    }
  }

  return hardened;
}

export function ensurePlayerDialogue(segments, playerAction, characterName, characterGender) {
  if (!playerAction || !characterName) return segments;

  QUOTE_PATTERN.lastIndex = 0;
  const playerQuotes = [];
  let match;
  while ((match = QUOTE_PATTERN.exec(playerAction)) !== null) {
    const text = match[1].trim();
    if (text) playerQuotes.push(text);
  }
  if (playerQuotes.length === 0) return segments;

  const charLower = characterName.toLowerCase();
  const hasPlayerDialogue = (segments || []).some(
    s => s.type === 'dialogue' && hasNamedSpeaker(s.character) && s.character.toLowerCase() === charLower
  );
  if (hasPlayerDialogue) return segments;

  const result = [...(segments || [])];
  const quoteLookup = new Set(playerQuotes.map(q => q.toLowerCase()));
  const reattributed = new Set();

  for (let i = 0; i < result.length; i++) {
    const seg = result[i];
    if (seg.type === 'dialogue' && isGenericSpeakerName(seg.character) && quoteLookup.has((seg.text || '').trim().toLowerCase())) {
      result[i] = { ...seg, character: characterName, ...(characterGender ? { gender: characterGender } : {}) };
      reattributed.add(seg.text.trim().toLowerCase());
    }
  }

  const remainingQuotes = playerQuotes.filter(q => !reattributed.has(q.toLowerCase()));
  if (remainingQuotes.length === 0) return result;

  const playerSegments = remainingQuotes.map(text => ({
    type: 'dialogue',
    character: characterName,
    text,
    gender: characterGender || undefined,
  }));

  const firstNarrationIdx = result.findIndex(s => s.type === 'narration');
  if (firstNarrationIdx >= 0) {
    result.splice(firstNarrationIdx, 0, ...playerSegments);
    return result;
  }
  return [...playerSegments, ...result];
}
