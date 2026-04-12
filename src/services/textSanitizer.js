const NARRATION_ADDRESS_EN = /\byou\s+(?:see|notice|feel|hear|smell|remember|watch|stand|walk|step|enter|approach|move|turn|look|find|spot|sense|are|have|can)\b/i;
const NARRATION_ADDRESS_PL = /(?:^|\W)(?:widzisz|czujesz|słyszysz|zauważasz|przypominasz sobie|stoisz|idziesz|wchodzisz|zbliżasz się|rozglądasz się)(?:\W|$)/i;
const SPEECH_VERB_HINT = /(?:^|\W)(?:mówi|powiedzia(?:ł|ła|łem|łam|łeś|łaś)|rzek(?:ł|ła)|mrukn(?:ął|ęła)|szepn(?:ął|ęła)|krzykn(?:ął|ęła)|spyta(?:ł|ła)|odpar(?:ł|ła)|odpow(?:iada|iedzia(?:ł|ła))|said|says|asked|asks|replied|replies|whispered|whispers|shouted|shouts|told|tells)(?:\W|$)/i;
const HARD_DEDUP_WORD_REGEX = /[A-Za-z0-9ĄąĆćĘęŁłŃńÓóŚśŹźŻż]+/g;

export function downgradeLowConfidenceDialogueSegments(segments) {
  return (segments || []).map((seg) => {
    if (seg?.type !== 'dialogue' || !seg?.character || !seg?.text) return seg;
    const text = seg.text.trim();
    if (text.length < 20) return seg;
    const looksLikeNarration = NARRATION_ADDRESS_EN.test(text) || NARRATION_ADDRESS_PL.test(text);
    if (!looksLikeNarration) return seg;
    const hasStrongSpeechSignal = /[!?]/.test(text) || SPEECH_VERB_HINT.test(text);
    if (hasStrongSpeechSignal) return seg;
    return { type: 'narration', text };
  });
}

function tokenizeSpeechText(text) {
  return String(text || '')
    .toLowerCase()
    .match(HARD_DEDUP_WORD_REGEX) || [];
}

function normalizeSpeechText(text) {
  return tokenizeSpeechText(text).join(' ').trim();
}

function stripLeadingDelimiters(text) {
  return String(text || '')
    .replace(/^[\s"'`„"«».,:;!?…\-–—(){}\[\]]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sliceAfterWordTokens(text, tokenCount) {
  if (!text || tokenCount <= 0) return String(text || '');
  const re = new RegExp(HARD_DEDUP_WORD_REGEX.source, 'g');
  let match;
  let seen = 0;
  let cutIndex = 0;
  while ((match = re.exec(text)) !== null) {
    seen += 1;
    cutIndex = match.index + match[0].length;
    if (seen >= tokenCount) break;
  }
  if (seen < tokenCount) return String(text || '');
  return String(text || '').slice(cutIndex);
}

export function stripLeadingDialogueEcho(narrationText, dialogueTexts) {
  let output = String(narrationText || '').trim();
  if (!output || !Array.isArray(dialogueTexts) || dialogueTexts.length === 0) return output;

  const sortedDialogueTokens = dialogueTexts
    .map((text) => tokenizeSpeechText(text))
    .filter((tokens) => tokens.length >= 2)
    .sort((a, b) => b.length - a.length);

  for (const dialogueTokens of sortedDialogueTokens) {
    const narrationTokens = tokenizeSpeechText(output);
    if (narrationTokens.length < dialogueTokens.length) continue;

    let matchesPrefix = true;
    for (let i = 0; i < dialogueTokens.length; i += 1) {
      if (narrationTokens[i] !== dialogueTokens[i]) {
        matchesPrefix = false;
        break;
      }
    }
    if (!matchesPrefix) continue;

    output = stripLeadingDelimiters(sliceAfterWordTokens(output, dialogueTokens.length));
    if (!output) return '';
  }

  return output;
}

export function hardRemoveNarrationDialogueRepeats(segments) {
  const source = Array.isArray(segments) ? segments : [];
  if (source.length === 0) return [];

  const dialogueTexts = source
    .filter((seg) => seg?.type === 'dialogue' && typeof seg?.text === 'string' && seg.text.trim())
    .map((seg) => seg.text.trim());
  const dialogueTextSet = new Set(dialogueTexts.map((text) => normalizeSpeechText(text)).filter(Boolean));

  const sanitized = [];
  for (const seg of source) {
    if (!seg || typeof seg !== 'object') continue;
    if (seg.type !== 'narration') {
      sanitized.push(seg);
      continue;
    }

    let text = String(seg.text || '').trim();
    if (!text) continue;

    text = stripLeadingDialogueEcho(text, dialogueTexts);
    const normalized = normalizeSpeechText(text);
    if (!normalized) continue;
    if (dialogueTextSet.has(normalized)) continue;

    const prev = sanitized[sanitized.length - 1];
    if (prev?.type === 'narration' && normalizeSpeechText(prev.text) === normalized) {
      continue;
    }

    sanitized.push({ ...seg, text });
  }

  return sanitized;
}
