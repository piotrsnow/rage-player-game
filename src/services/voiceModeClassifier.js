// Smart auto-mode for voice dictation: decides whether a freshly recognized
// speech segment should be treated as an action ("I draw my sword") or a
// dialogue line ("Greetings, traveler"). Output feeds useDictation which then
// either passes the transcript through or wraps it in quotes.
//
// Two layers, both pure and synchronous:
//   1. classifyHeuristic(transcript, ctx) — regex + game-state boosts.
//   2. formatTranscript(transcript, mode) — wraps dialogue text in quotes the
//      same way useDictation used to do inline.
//
// The async LLM-backed variant (Haiku) is staged for a follow-up PR; this file
// keeps a stub `classifyWithLLM` placeholder so the call site doesn't have to
// change later.

const QUOTE_OPENERS = /^[\s]*["“„«‹‘‚]/;
const HAS_QUOTED_SEGMENT = /[":]\s*["“„«][^"”‟»]+["”‟»]/;

const PL_DIALOGUE_VERBS = [
  // Imperative ("powiedz mu...")
  /\b(powiedz|powiedzcie|spytaj|zapytaj|krzyknij|szepnij|odpowiedz|przywitaj|pozdr[oó]w|odeprzyj)\b/iu,
  // First-person present ("mówię do...", "pytam go")
  /\b(m[oó]wi[ęe]?m?|m[oó]wi[ęe]?|pytam|krzycz[ęe]|szepcz[ęe]|odpowiadam|witam|odpieram|wo[lł]am|rzucam s[lł]owem)\b/iu,
  // First-person reflexive narration ("zwracam się do")
  /\b(zwracam si[ęe]|odzywam si[ęe]|zagajam)\b/iu,
];

const PL_DIALOGUE_LEAD_PHRASES = [
  // "powiem mu/jej, że..."
  /^\s*(powiem|spytam|zapytam|krzykn[ęe]|szepn[ęe])\b/iu,
];

const PL_ACTION_VERBS = [
  /\b(id[ęe]|biegn[ęe]|skradam|wycofuj[ęe]|ucieka(m|j[ęe]))\b/iu,
  /\b(atakuj[ęe]|uderzam|tn[ęe]|strzelam|paruj[ęe]|blokuj[ęe]|rzucam zakl[ęe]cie|kastuj[ęe])\b/iu,
  /\b(szukam|przeszukuj[ęe]|badam|sprawdzam|patrz[ęe]|nas[lł]uchuj[ęe]|w[ąa]cham)\b/iu,
  /\b(bior[ęe]|podnosz[ęe]|zabieram|chowam|wyci[aą]gam|dobywam)\b/iu,
  /\b(otwieram|zamykam|forsuj[ęe]|wywa[zż]am)\b/iu,
  /\b(kupuj[ęe]|sprzedaj[ęe]|handluj[ęe]|p[lł]ac[ęe]|targuj[ęe] si[ęe])\b/iu,
  /\b(odpoczywam|[sś]pi[ęe]|medytuj[ęe]|le[cć]z[ęe])\b/iu,
];

const EN_DIALOGUE_VERBS = [
  /^\s*(say|tell|ask|shout|whisper|reply|greet|call out)\b/i,
  /\bi\s+(say|tell|ask|shout|whisper|reply|greet|call out|murmur|mutter)\b/i,
];

const EN_ACTION_VERBS = [
  /\bi\s+(go|run|sneak|flee|retreat|walk|move|approach)\b/i,
  /\bi\s+(attack|strike|hit|swing|stab|shoot|cast|parry|block)\b/i,
  /\bi\s+(search|examine|inspect|check|look|listen|smell)\b/i,
  /\bi\s+(take|grab|pick up|stash|draw|pull out)\b/i,
  /\bi\s+(open|close|force|break)\b/i,
  /\bi\s+(buy|sell|trade|pay|haggle)\b/i,
  /\bi\s+(rest|sleep|meditate|heal)\b/i,
];

function anyMatch(text, patterns) {
  for (const p of patterns) if (p.test(text)) return true;
  return false;
}

// ctx: { lang?: 'pl'|'en', activeDialogueNpc?: string|null, combatActive?: boolean,
//        stickyMode?: 'action'|'dialogue' }
export function classifyHeuristic(transcript, ctx = {}) {
  const text = String(transcript || '').trim();
  if (!text) {
    return { mode: ctx.stickyMode || 'action', confidence: 0, reason: 'empty' };
  }

  const lang = ctx.lang === 'en' ? 'en' : 'pl';
  const dialogueVerbs = lang === 'en' ? EN_DIALOGUE_VERBS : PL_DIALOGUE_VERBS;
  const actionVerbs = lang === 'en' ? EN_ACTION_VERBS : PL_ACTION_VERBS;

  // Hard signals — explicit user formatting wins.
  if (QUOTE_OPENERS.test(text)) {
    return { mode: 'dialogue', confidence: 0.98, reason: 'opens-with-quote' };
  }
  if (HAS_QUOTED_SEGMENT.test(text)) {
    return { mode: 'dialogue', confidence: 0.92, reason: 'embedded-quote' };
  }

  let dialogueScore = 0;
  let actionScore = 0;
  const reasons = [];

  if (anyMatch(text, dialogueVerbs)) {
    dialogueScore += 0.6;
    reasons.push('dialogue-verb');
  }
  if (lang === 'pl' && anyMatch(text, PL_DIALOGUE_LEAD_PHRASES)) {
    dialogueScore += 0.2;
    reasons.push('dialogue-lead');
  }
  if (anyMatch(text, actionVerbs)) {
    actionScore += 0.6;
    reasons.push('action-verb');
  }

  // Game-state boosts: who's the player likely talking to / about?
  if (ctx.activeDialogueNpc) {
    dialogueScore += 0.2;
    reasons.push('npc-active');
  }
  if (ctx.combatActive) {
    actionScore += 0.2;
    reasons.push('combat-active');
  }

  // Short utterance with no verb signal at all: lean on game-state.
  if (dialogueScore === 0 && actionScore === 0) {
    if (ctx.activeDialogueNpc) {
      return { mode: 'dialogue', confidence: 0.55, reason: 'no-verb+npc' };
    }
    if (ctx.combatActive) {
      return { mode: 'action', confidence: 0.6, reason: 'no-verb+combat' };
    }
    // Fall back to sticky mode if caller provided one.
    if (ctx.stickyMode === 'dialogue' || ctx.stickyMode === 'action') {
      return { mode: ctx.stickyMode, confidence: 0.45, reason: 'sticky-fallback' };
    }
    return { mode: 'action', confidence: 0.5, reason: 'default-action' };
  }

  if (dialogueScore > actionScore) {
    return {
      mode: 'dialogue',
      confidence: Math.min(0.95, 0.5 + (dialogueScore - actionScore)),
      reason: reasons.join('+') || 'dialogue-lean',
    };
  }
  if (actionScore > dialogueScore) {
    return {
      mode: 'action',
      confidence: Math.min(0.95, 0.5 + (actionScore - dialogueScore)),
      reason: reasons.join('+') || 'action-lean',
    };
  }
  // Tie — prefer sticky if available, otherwise dialogue when NPC is active.
  if (ctx.stickyMode === 'dialogue' || ctx.stickyMode === 'action') {
    return { mode: ctx.stickyMode, confidence: 0.5, reason: 'tie-sticky' };
  }
  return { mode: 'action', confidence: 0.5, reason: 'tie-default' };
}

// Wraps dialogue transcripts in quotes the same way useDictation used to do.
// Action transcripts pass through unchanged. Already-quoted text isn't double-
// wrapped.
export function formatTranscript(transcript, mode) {
  const text = String(transcript || '');
  if (mode !== 'dialogue') return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (QUOTE_OPENERS.test(trimmed)) return text;
  return `"${trimmed}"`;
}

// Async LLM-backed classifier. Stubbed for the MVP — useDictation can call it
// when ctx.classifier === 'llm', and it currently degrades to the heuristic
// transparently. The follow-up PR will hook this up to /v1/ai/voice-classify.
export async function classifyWithLLM(transcript, ctx = {}) {
  return classifyHeuristic(transcript, ctx);
}

export function classify(transcript, ctx = {}) {
  if (ctx.classifier === 'llm') {
    return classifyWithLLM(transcript, ctx);
  }
  return Promise.resolve(classifyHeuristic(transcript, ctx));
}
