const QUOTE_OPEN = '„"«"';
const QUOTE_CLOSE = '""»"';
const QUOTE_RE = new RegExp(`[${QUOTE_OPEN}]([^${QUOTE_OPEN}${QUOTE_CLOSE}]+)[${QUOTE_CLOSE}]`, 'g');

const REFERENCE_TAIL = /(?:^|\s)(?:o|na|w|z|od|do|za|pod|nad|przed|po|przy|między|przez|dla|bez|jako|czyli|pt\.?|tzw\.?|zwan\w*|określ[ao]n\w*|nazwan\w*|zatytułowan\w*|podpisan\w*|oznaczon\w*|napis\w*|słow[aoy]|hasł[oaem]|about|of|on|in|with|from|to|as|titled|called|named|aka)[\s,:;]*$/i;
const SHORT_CONNECTOR = /^[\s,;]*(?:i|lub|albo|oraz|a|ani|czy|or|and)?\s*$/;

function isLikelyReference(textBetween, prevWasReference) {
  if (REFERENCE_TAIL.test(textBetween)) return true;
  if (prevWasReference && SHORT_CONNECTOR.test(textBetween)) return true;
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
    for (const name of knownNames) {
      if (name.split(/\s+/).some(p => p.toLowerCase() === raw.toLowerCase())) {
        if (!isExcludedName(raw, excludeNames)) return name;
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

function lookupGender(name, knownNpcs, existingDialogueSegs) {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  for (const npc of knownNpcs) {
    if (!npc.name) continue;
    if (npc.name.toLowerCase() === lower || npc.name.toLowerCase().split(/\s+/).includes(lower)) {
      return npc.gender || undefined;
    }
  }
  for (const seg of existingDialogueSegs) {
    if (!seg.character) continue;
    if (seg.character.toLowerCase() === lower || seg.character.toLowerCase().split(/\s+/).includes(lower)) {
      return seg.gender || undefined;
    }
  }
  return undefined;
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

function normalizeTextForDedup(text) {
  return (text || '').trim().toLowerCase().replace(/[""„"«»'']/g, '').replace(/\s+/g, ' ').trim();
}

const DIRECT_SPEECH_PL = /(?:^|\W)(?:ty|ci|cię|ciebie|twój|twoja|twoje|twoim|twoją|tobie|chcesz|masz|musisz|możesz|widzisz|wiesz|znasz|słyszysz|jesteś|potrzebujesz|pomóż|powiedz|daj|weź|chodź|idź|patrz|słuchaj|posłuchaj|czekaj|spójrz|poczekaj|uważaj)(?:\W|$)/i;
const DIRECT_SPEECH_EN = /\b(?:you|your|yours|yourself|you're|you've)\b/i;
const FIRST_PERSON_SPEECH = /(?:^|\W)(?:mi|mnie|mną|mój|moja|moje|moim|moją|mojego|mojej|moich|ze mną|me|my|myself)(?:\W|$)/i;
const NARRATION_ADDRESS_EN = /\byou\s+(?:see|notice|feel|hear|smell|remember|watch|stand|walk|step|enter|approach|move|turn|look|find|spot|sense|are|have|can)\b/i;
const NARRATION_ADDRESS_PL = /(?:^|\W)(?:widzisz|czujesz|słyszysz|zauważasz|przypominasz sobie|stoisz|idziesz|wchodzisz|zbliżasz się|rozglądasz się)(?:\W|$)/i;
const SPEECH_VERB_HINT = /(?:^|\W)(?:mówi|powiedzia(?:ł|ła|łem|łam|łeś|łaś)|rzek(?:ł|ła)|mrukn(?:ął|ęła)|szepn(?:ął|ęła)|krzykn(?:ął|ęła)|spyta(?:ł|ła)|odpar(?:ł|ła)|odpow(?:iada|iedzia(?:ł|ła))|said|says|asked|asks|replied|replies|whispered|whispers|shouted|shouts|told|tells)(?:\W|$)/i;

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
  if (DIRECT_SPEECH_PL.test(t)) return true;
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
    if (segments[i].type === 'dialogue' && segments[i].character) {
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

export function repairDialogueSegments(narrative, segments, knownNpcs = [], excludeNames = []) {
  if (!segments || segments.length === 0) {
    if (narrative && narrative.trim()) {
      segments = [{ type: 'narration', text: narrative }];
    } else {
      return [];
    }
  }
  const existingDialogue = segments.filter(s => s.type === 'dialogue' && s.character);
  const knownNames = [...new Set([
    ...knownNpcs.map(n => n.name).filter(Boolean),
    ...existingDialogue.map(s => s.character).filter(Boolean),
  ])].filter(name => !isExcludedName(name, excludeNames));
  const repaired = [];
  for (const seg of segments) {
    if (seg.type !== 'narration' || !seg.text) { repaired.push(seg); continue; }
    QUOTE_RE.lastIndex = 0;
    if (!QUOTE_RE.test(seg.text)) { repaired.push(seg); continue; }
    QUOTE_RE.lastIndex = 0;
    let lastIndex = 0;
    let match;
    const parts = [];
    let prevMatchEnd = 0;
    let prevWasReference = false;
    while ((match = QUOTE_RE.exec(seg.text)) !== null) {
      const textBetween = seg.text.slice(prevMatchEnd, match.index);
      if (isLikelyReference(textBetween, prevWasReference)) {
        prevWasReference = true;
        prevMatchEnd = match.index + match[0].length;
        continue;
      }
      prevWasReference = false;
      prevMatchEnd = match.index + match[0].length;
      const before = seg.text.slice(lastIndex, match.index);
      if (before.trim()) parts.push({ type: 'narration', text: before.trimEnd() });
      const speaker = findSpeakerInText(seg.text.slice(0, match.index), knownNames, excludeNames);
      const gender = lookupGender(speaker, knownNpcs, existingDialogue);
      parts.push({ type: 'dialogue', character: speaker || 'NPC', text: match[1].trim(), ...(gender ? { gender } : {}) });
      lastIndex = match.index + match[0].length;
    }
    const trailing = seg.text.slice(lastIndex);
    if (trailing.trim()) parts.push({ type: 'narration', text: trailing.trimStart() });
    repaired.push(...(parts.length > 0 ? parts : [seg]));
  }

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
    const gender = lookupGender(speaker, knownNpcs, existingDialogue);
    enhanced.push({
      type: 'dialogue',
      character: speaker,
      text: seg.text.trim(),
      ...(gender ? { gender } : {}),
    });
  }

  for (let i = enhanced.length - 2; i >= 0; i--) {
    const seg = enhanced[i];
    if (seg.type !== 'narration' || !seg.text || seg.text.trim().length < 15) continue;
    const next = enhanced[i + 1];
    if (next.type !== 'dialogue' || !next.character) continue;
    if (startsWithCharacterAction(seg.text, allNames)) continue;
    if (isLikelyNarrationAddress(seg.text)) continue;
    if (!FIRST_PERSON_SPEECH.test(seg.text)) continue;
    if (!looksLikeDirectSpeech(seg.text)) continue;
    const gender = lookupGender(next.character, knownNpcs, existingDialogue);
    enhanced[i] = {
      type: 'dialogue',
      character: next.character,
      text: seg.text.trim(),
      ...(gender ? { gender } : {}),
    };
  }

  if (narrative && narrative.trim()) {
    const enhancedText = enhanced.map(s => (s.text || '').trim()).join('');
    if (enhancedText.length < narrative.trim().length * 0.7) {
      const alreadySynthetic = segments.length === 1
        && segments[0].type === 'narration'
        && segments[0].text === narrative;
      if (!alreadySynthetic) {
        return repairDialogueSegments(narrative, [{ type: 'narration', text: narrative }], knownNpcs, excludeNames);
      }
    }
  }

  return enhanced;
}

export function ensurePlayerDialogue(segments, playerAction, characterName, characterGender) {
  if (!playerAction || !characterName) return segments;

  QUOTE_RE.lastIndex = 0;
  const playerQuotes = [];
  let match;
  while ((match = QUOTE_RE.exec(playerAction)) !== null) {
    const text = match[1].trim();
    if (text) playerQuotes.push(text);
  }
  if (playerQuotes.length === 0) return segments;

  const charLower = characterName.toLowerCase();
  const hasPlayerDialogue = (segments || []).some(
    s => s.type === 'dialogue' && s.character && s.character.toLowerCase() === charLower
  );
  if (hasPlayerDialogue) return segments;

  const playerSegments = playerQuotes.map(text => ({
    type: 'dialogue',
    character: characterName,
    text,
    gender: characterGender || undefined,
  }));

  return [...playerSegments, ...(segments || [])];
}
