import { config } from '../config.js';
import { generateStateChangeMessages } from './stateChangeMessages.js';
import { resolveDiceRollAttribute } from '../../../shared/domain/diceRollInference.js';
// RPGon: no talent bonuses
import { AIServiceError, AI_ERROR_CODES, parseProviderError } from './aiErrors.js';

const MAX_COMBINED_BONUS = 30;
const MIN_DIFFICULTY_MODIFIER = -40;
const MAX_DIFFICULTY_MODIFIER = 40;

function inferLanguageFromText(text = '') {
  if (!text || typeof text !== 'string') return 'en';
  if (/[ąćęłńóśźż]/i.test(text)) return 'pl';
  return /\b(i|oraz|się|jest|nie|czy|który|gdzie|teraz|wokół|ostrożnie|chwila)\b/i.test(text)
    ? 'pl'
    : 'en';
}

function normalizeSuggestedActions(actions, max = 8) {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((action) => (typeof action === 'string' ? action.trim() : String(action ?? '').trim()))
    .filter(Boolean)
    .filter((action, index, arr) => arr.indexOf(action) === index)
    .slice(0, max);
}

function hashTextSeed(text = '') {
  if (!text) return 0;
  return [...String(text)].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) % 1000003, 17);
}

const FALLBACK_ACTION_VARIANTS = {
  pl: {
    investigate: [
      'Sprawdzam dokładnie, co tu się naprawdę wydarzyło',
      'Analizuję sytuację i szukam ukrytych szczegółów',
      'Badam miejsce zdarzenia, zanim wykonam kolejny ruch',
      'Próbuję odtworzyć przebieg wydarzeń z dostępnych śladów',
    ],
    social: [
      'Wypytuję świadków o to, co widzieli',
      'Nawiązuję rozmowę i próbuję wyciągnąć konkrety',
      'Zadaję kilka celnych pytań, by odsłonić prawdę',
      'Słucham uważnie plotek i wychwytuję sprzeczności',
    ],
    tactical: [
      'Szukam osłony i przygotowuję się na zagrożenie',
      'Wybieram bezpieczniejszą pozycję i obserwuję otoczenie',
      'Sprawdzam drogę odwrotu na wypadek kłopotów',
      'Ustawiam się tak, by mieć przewagę, jeśli zrobi się gorąco',
    ],
    progression: [
      'Idę dalej tropem, który wydaje się najbardziej obiecujący',
      'Przechodzę do kolejnego punktu planu i utrzymuję tempo',
      'Podejmuję zdecydowany krok, żeby popchnąć sprawę naprzód',
      'Kieruję się tam, gdzie szanse na postęp są największe',
    ],
  },
  en: {
    investigate: [
      'I examine what happened here in detail',
      'I analyze the situation for hidden clues',
      'I inspect the scene before making my next move',
      'I reconstruct the sequence of events from what I can find',
    ],
    social: [
      'I question witnesses about what they saw',
      'I start a focused conversation to get concrete answers',
      'I ask pointed questions to uncover the truth',
      'I listen carefully to local rumors and contradictions',
    ],
    tactical: [
      'I find cover and prepare for danger',
      'I move to a safer position and observe the area',
      'I check for an escape route in case things go bad',
      'I position myself for an advantage if this escalates',
    ],
    progression: [
      'I follow the most promising lead forward',
      'I move to the next step of the plan and keep momentum',
      'I make a decisive move to push the situation forward',
      'I head toward where progress seems most likely',
    ],
  },
};

function pickVariant(variants, seed, offset = 0) {
  if (!Array.isArray(variants) || variants.length === 0) return '';
  return variants[(seed + offset) % variants.length];
}

function prioritizeNovelActions(actions, previousActions = [], minNovel = 2) {
  const normalizedCurrent = normalizeSuggestedActions(actions, 8);
  if (normalizedCurrent.length === 0) return [];

  const prevSet = new Set(
    normalizeSuggestedActions(previousActions, 8).map((a) => a.toLowerCase())
  );
  if (prevSet.size === 0) return normalizedCurrent;

  const novel = normalizedCurrent.filter((a) => !prevSet.has(a.toLowerCase()));
  if (novel.length >= minNovel) return novel;

  return [...novel, ...normalizedCurrent.filter((a) => prevSet.has(a.toLowerCase()))];
}

function buildFallbackSuggestedActions({
  narrative = '',
  currentLocation = '',
  npcsHere = [],
  language = 'en',
  previousActions = [],
  sceneIndex = 0,
} = {}) {
  const inferredLanguage = language === 'pl' || language === 'en'
    ? language
    : inferLanguageFromText(narrative);

  const seed = hashTextSeed(
    `${narrative}|${currentLocation}|${npcsHere.map((n) => n?.name || '').join('|')}|${sceneIndex}`
  );
  const templates = FALLBACK_ACTION_VARIANTS[inferredLanguage] || FALLBACK_ACTION_VARIANTS.en;

  const actions = [];
  const firstNpc = npcsHere[0]?.name;
  if (firstNpc) {
    actions.push(
      inferredLanguage === 'pl'
        ? `Podchodzę do ${firstNpc} i pytam, co się dzieje`
        : `I approach ${firstNpc} and ask what is going on`
    );
  }
  if (currentLocation) {
    actions.push(
      inferredLanguage === 'pl'
        ? `Rozglądam się po ${currentLocation} i szukam tropów`
        : `I look around ${currentLocation} for useful clues`
    );
  }

  actions.push(pickVariant(templates.investigate, seed, 0));
  actions.push(pickVariant(templates.social, seed, 1));
  actions.push(pickVariant(templates.tactical, seed, 2));
  actions.push(pickVariant(templates.progression, seed, 3));

  const prioritized = prioritizeNovelActions(actions, previousActions, 2);
  return normalizeSuggestedActions(prioritized, 4);
}

function ensureSuggestedActions(payload, {
  language = 'en',
  currentLocation = '',
  npcsHere = [],
  previousActions = [],
  sceneIndex = 0,
} = {}) {
  const normalized = normalizeSuggestedActions(payload?.suggestedActions, 8);
  if (normalized.length > 0) return normalized;

  return buildFallbackSuggestedActions({
    narrative: payload?.narrative || '',
    currentLocation,
    npcsHere,
    language,
    previousActions,
    sceneIndex,
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeDifficultyModifier(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, MIN_DIFFICULTY_MODIFIER, MAX_DIFFICULTY_MODIFIER)
    : 0;
}

function snapDifficultyModifier(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.round(value / 10) * 10, MIN_DIFFICULTY_MODIFIER, MAX_DIFFICULTY_MODIFIER);
}

const NEEDS_LABELS = {
  hunger: { low: 'hungry, distracted', critical: 'weak, dizzy, stomach pains' },
  thirst: { low: 'thirsty, dry mouth', critical: 'parched, cracked lips, fading' },
  bladder: { low: 'uncomfortable, fidgeting', critical: 'desperate, about to lose control', zero: 'lost control!' },
  hygiene: { low: 'smelly, NPCs wrinkle noses', critical: 'terrible stench, NPCs recoil' },
  rest: { low: 'tired, yawning, slower reactions', critical: 'can barely keep eyes open, stumbling', zero: 'collapses from exhaustion' },
};

function buildMultiplayerUnmetNeedsBlock(characters) {
  if (!characters || characters.length === 0) return '';
  const charLines = [];
  for (const c of characters) {
    if (!c.needs) continue;
    const parts = [];
    for (const [key, labels] of Object.entries(NEEDS_LABELS)) {
      const val = c.needs[key] ?? 100;
      if (val <= 0 && labels.zero) {
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)} ${val}/100 [${key === 'bladder' ? 'ACCIDENT' : 'COLLAPSE'}]`);
      } else if (val < 15) {
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)} ${val}/100 [CRITICAL]`);
      } else if (val < 30) {
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)} ${val}/100 [LOW]`);
      }
    }
    if (parts.length > 0) {
      charLines.push(`- ${c.name}: ${parts.join(', ')}`);
    }
  }
  if (charLines.length === 0) return '';
  return `UNMET CHARACTER NEEDS (factor these into the scene — affect narration, NPC reactions, and outcomes):\n${charLines.join('\n')}\n\n`;
}

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

function repairDialogueSegments(narrative, segments, knownNpcs = [], excludeNames = []) {
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
    const gender = lookupGender(speaker, knownNpcs, existingDialogue);
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

function ensurePlayerDialogue(segments, playerAction, characterName, characterGender) {
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

function buildMultiplayerSystemPrompt(gameState, settings, players, language = 'en', dmSettings = null) {
  const needsEnabled = settings.needsSystemEnabled === true;
  const playerList = players
    .map((p) => `- ${p.name} (${p.gender}, ${p.isHost ? 'host' : 'player'})`)
    .join('\n');

  const scenes = gameState.scenes || [];
  const total = scenes.length;
  const FULL_COUNT = 3;
  const MEDIUM_COUNT = 5;
  const parts = [];
  const compressedHistory = (gameState.world || {}).compressedHistory;
  if (compressedHistory) {
    parts.push(`ARCHIVED HISTORY (summary of earliest scenes):\n${compressedHistory}`);
  }
  const medStart = Math.max(0, total - FULL_COUNT - MEDIUM_COUNT);
  const medEnd = Math.max(0, total - FULL_COUNT);
  const medScenes = scenes.slice(medStart, medEnd);
  if (medScenes.length > 0) {
    parts.push('EARLIER SCENES (summaries):\n' + medScenes.map((s, i) => {
      const idx = medStart + i + 1;
      const actions = (s.playerActions || []).map((a) => a.action).join('; ');
      return `Scene ${idx}${actions ? ` [Actions: ${actions}]` : ''}: ${(s.narrative || '').substring(0, 500)}...`;
    }).join('\n'));
  }
  const fullScenes = scenes.slice(-FULL_COUNT);
  if (fullScenes.length > 0) {
    parts.push('RECENT SCENES (full):\n' + fullScenes.map((s, i) => {
      const idx = total - FULL_COUNT + i + 1;
      const actions = (s.playerActions || []).map((a) => a.action).join('; ');
      return `Scene ${idx}${actions ? ` [Actions: ${actions}]` : ''}:\n${s.narrative}`;
    }).join('\n\n'));
  }
  const sceneHistory = parts.join('\n\n') || 'No scenes yet - this is the beginning of the story.';

  const campaign = gameState.campaign || {};
  const world = gameState.world || {};
  const worldFacts = (world.facts || []).slice(-20).join('\n') || 'No known facts yet.';

  const npcs = world.npcs || [];
  const npcSection = npcs.length > 0
    ? npcs.map((n) => `- ${n.name} (${n.role || 'unknown'}, ${n.gender || '?'}): ${n.personality || '?'}, attitude=${n.attitude || 'neutral'}, disposition=${n.disposition || 0}`).join('\n')
    : 'No NPCs encountered yet.';

  const currentLoc = world.currentLocation || 'Unknown';

  const npcsHere = npcs.filter((n) => n.alive !== false && n.lastLocation && currentLoc && n.lastLocation.toLowerCase() === currentLoc.toLowerCase());
  const npcsHereSection = npcsHere.length > 0
    ? npcsHere.map((n) => `- ${n.name} (${n.role || 'unknown'})`).join('\n')
    : 'No known NPCs at this location.';
  const mapState = world.mapState || [];
  const mapSection = mapState.length > 0
    ? mapState.map((loc) => {
        const isCurrent = loc.name?.toLowerCase() === currentLoc?.toLowerCase();
        const mods = (loc.modifications || []).map((m) => `  · [${m.type}] ${m.description}`).join('\n');
        return `- ${loc.name}${isCurrent ? ' ← CURRENT' : ''}${loc.description ? `: ${loc.description}` : ''}${mods ? '\n' + mods : ''}`;
      }).join('\n')
    : 'No locations mapped yet.';

  const charLines = (gameState.characters || []).map((c) => {
    const attrs = c.attributes || {};
    const attrStr = Object.entries(attrs).map(([k, v]) => `${k.toUpperCase()}:${v}`).join(' ');
    let line = `- ${c.name} (${c.species || 'Human'}): Wounds ${c.wounds}/${c.maxWounds}`;
    line += `\n  Attributes: ${attrStr || 'unknown'}`;
    if (c.mana != null) line += `\n  Mana: ${c.mana}/${c.maxMana || c.mana}`;
    const skillStr = Object.entries(c.skills || {}).map(([s, v]) => `${s}:${v}`).join(', ');
    if (skillStr) line += `\n  Skills: ${skillStr}`;
    const inv = (c.inventory || []).map((i) => (typeof i === 'string' ? i : i.name)).join(', ');
    line += `\n  Inventory: ${inv || 'Empty'}`;
    const m = c.money || { gold: 0, silver: 0, copper: 0 };
    const moneyParts = [];
    if (m.gold) moneyParts.push(`${m.gold} GC`);
    if (m.silver) moneyParts.push(`${m.silver} SS`);
    if (m.copper) moneyParts.push(`${m.copper} CP`);
    line += `\n  Money: ${moneyParts.length > 0 ? moneyParts.join(' ') : '0 CP'}`;
    if (needsEnabled && c.needs) {
      const n = c.needs;
      const fmt = (k, v) => `${k}: ${v ?? 100}/100${(v ?? 100) < 15 ? ' [CRITICAL]' : (v ?? 100) < 30 ? ' [LOW]' : ''}`;
      line += `\n  Needs: ${fmt('Hunger', n.hunger)}, ${fmt('Thirst', n.thirst)}, ${fmt('Bladder', n.bladder)}, ${fmt('Hygiene', n.hygiene)}, ${fmt('Rest', n.rest)}`;
    }
    return line;
  }).join('\n') || 'No characters defined yet.';

  const needsBlock = needsEnabled ? `
NEEDS SYSTEM: ENABLED. Each character has biological needs (hunger, thirst, bladder, hygiene, rest) on a 0-100 scale (100=fully satisfied, 0=critical). Low needs should affect narrative and character behavior. When characters eat, drink, rest, bathe, or use a toilet, include needsChanges in their perCharacter entry.` : '';

  return `You are the Dungeon Master AI for a MULTIPLAYER campaign: "${campaign.name || 'Unnamed Campaign'}".

CAMPAIGN SETTINGS:
- Genre: ${settings.genre || 'Fantasy'}
- Tone: ${settings.tone || 'Epic'}
- Play Style: ${settings.style || 'Hybrid'} (narrative + optional dice rolls)
- Difficulty: ${dmSettings ? (dmSettings.difficulty < 25 ? 'Easy' : dmSettings.difficulty < 50 ? 'Normal' : dmSettings.difficulty < 75 ? 'Hard' : 'Expert') : (settings.difficulty || 'Normal')}
- Dice roll frequency: ${(() => { const tf = dmSettings?.testsFrequency ?? 50; return tf < 20 ? 'rarely (only critical moments)' : tf < 40 ? 'occasionally (important actions only)' : tf < 60 ? 'regularly (most meaningful actions)' : tf < 80 ? 'frequently (most actions, including minor ones)' : 'almost always (even trivial actions)'; })() } (~${dmSettings?.testsFrequency ?? 50}% of actions should require a roll)
${dmSettings ? `- Narrative chaos: ${dmSettings.narrativeStyle < 25 ? 'Predictable' : dmSettings.narrativeStyle < 50 ? 'Balanced' : dmSettings.narrativeStyle < 75 ? 'Chaotic' : 'Wild'}
- Response length: ${dmSettings.responseLength < 33 ? 'short (2-3 sentences)' : dmSettings.responseLength < 66 ? 'medium (1-2 paragraphs)' : 'long (3+ paragraphs)'}

NARRATOR VOICE & STYLE:
- Poeticism: ${(dmSettings.narratorPoeticism ?? 50) < 25 ? 'dry and prosaic' : (dmSettings.narratorPoeticism ?? 50) < 50 ? 'moderately literary' : (dmSettings.narratorPoeticism ?? 50) < 75 ? 'poetic and evocative' : 'lushly lyrical, rich in metaphor and imagery'}
- Grittiness: ${(dmSettings.narratorGrittiness ?? 30) < 25 ? 'lighthearted and clean' : (dmSettings.narratorGrittiness ?? 30) < 50 ? 'moderately grounded' : (dmSettings.narratorGrittiness ?? 30) < 75 ? 'gritty and raw' : 'brutally dark, visceral and unflinching'}
- Environmental detail: ${(dmSettings.narratorDetail ?? 50) < 25 ? 'minimal, only essential details' : (dmSettings.narratorDetail ?? 50) < 50 ? 'balanced descriptions' : (dmSettings.narratorDetail ?? 50) < 75 ? 'rich environmental detail' : 'lavishly detailed, painting every sensory element'}
- Humor: ${(dmSettings.narratorHumor ?? 20) < 25 ? 'completely serious' : (dmSettings.narratorHumor ?? 20) < 50 ? 'occasional dry wit' : (dmSettings.narratorHumor ?? 20) < 75 ? 'frequent humor woven into narration, comedy grounded in controversial or morally ambiguous situations' : 'heavily comedic and irreverent — humor drawn from controversial topics, provocative characters, social satire, and dark irony rather than pure absurdity (think Pratchett/Monty Python: sharp wit about real uncomfortable issues)'}
- Drama: ${(dmSettings.narratorDrama ?? 50) < 25 ? 'understated and subtle' : (dmSettings.narratorDrama ?? 50) < 50 ? 'measured dramatic pacing' : (dmSettings.narratorDrama ?? 50) < 75 ? 'heightened drama and tension' : 'maximally theatrical, grandiose and operatic'}
Adapt your narration prose style to match ALL of the above parameters simultaneously.` : ''}

PLAYERS IN THIS SESSION:
${playerList}

WORLD DESCRIPTION:
${campaign.worldDescription || 'A mysterious world awaits discovery.'}

STORY HOOK:
${campaign.hook || 'An adventure begins...'}

CHARACTERS:
${charLines}

NPC REGISTRY:
${npcSection}

NPCs PRESENT AT CURRENT LOCATION (only these NPCs can be directly interacted with unless summoned or newly arriving):
${npcsHereSection}

CURRENT LOCATION: ${currentLoc}

MAP STATE (explored locations):
${mapSection}

ACTIVE EFFECTS (traps, spells, environmental changes — check before resolving actions in a location):
${(world.activeEffects || []).filter((e) => e.active !== false).map((e) => `- [${e.type}] ${e.description} at ${e.location || 'unknown'}${e.placedBy ? ` (by ${e.placedBy})` : ''}`).join('\n') || 'None'}

ACTIVE QUESTS:
${(gameState.quests?.active || []).map((q) => {
    let line = `- ${q.name}: ${q.description}`;
    if (q.completionCondition) line += `\n  Goal: ${q.completionCondition}`;
    if (q.objectives?.length > 0) {
      line += '\n  Objectives:';
      for (const obj of q.objectives) {
        line += `\n    [${obj.completed ? 'X' : ' '}] ${obj.description}`;
      }
    }
    return line;
  }).join('\n') || 'None'}

WORLD KNOWLEDGE:
${worldFacts}
${(() => {
  const codex = world.codex;
  if (!codex || Object.keys(codex).length === 0) return '';
  const entries = Object.values(codex).slice(0, 10);
  const lines = entries.map((e) => {
    const frags = e.fragments.map((f) => `  - [${f.aspect || 'info'}] ${f.content} (source: ${f.source})`).join('\n');
    return `* ${e.name} [${e.category}]:\n${frags}`;
  });
  return `\nPLAYER CODEX (knowledge already discovered — do NOT repeat, reveal NEW information):\n${lines.join('\n')}\n`;
})()}
SCENE HISTORY:
${sceneHistory}

LANGUAGE: Write all narrative in ${language === 'pl' ? 'Polish' : 'English'}.
${needsBlock}
NPC DISPOSITION MODIFIERS (apply when a dice roll involves direct interaction with a known NPC):
When a player attempts a social, trade, persuasion, or other interpersonal skill test involving a known NPC, look up that NPC's disposition value from the NPC REGISTRY and apply the corresponding modifier to the dice target:
  disposition >= 30 (strong ally): +15 to target
  disposition >= 15 (friendly): +10 to target
  disposition >= 5 (warm): +5 to target
  disposition -5 to +5 (neutral): no modifier
  disposition <= -5 (cool): -5 to target
  disposition <= -15 (hostile): -10 to target
  disposition <= -30 (enemy): -15 to target
When this modifier applies, include "dispositionBonus" in the diceRoll entry with the modifier value. Keep it separate from "difficultyModifier".

MULTIPLAYER INSTRUCTIONS:
1. You are running a MULTIPLAYER session using the RPGon system (d50-based). Multiple players act simultaneously each round.
2. When resolving actions, consider ALL submitted actions together and resolve them simultaneously.
3. Describe what happens to each character individually.
4. Include per-character stateChanges so each player's wounds/XP/inventory/skills can be updated independently. Use RPGon mechanics (wounds, attributes, skills).
5. All players see the same scene narrative.
6. Maintain fairness — give each player meaningful consequences for their actions.
7. Generate suggested actions that are generic enough for any player to take.
8. Update stateChanges.currentLocation when the party moves to a new location.
9. Always respond with valid JSON.
10. ITEM FORMAT: When giving items to characters via perCharacter newItems, each item MUST be an object: {"id": "item_unique_id", "name": "Item Display Name", "type": "weapon|armor|potion|scroll|tool|food|clothing|key|book|ring|ammunition|trinket|shield|misc", "description": "Short flavor text", "rarity": "common|uncommon|rare|exotic"}. NEVER omit name or description — these are displayed to players.
11. ITEM VALIDATION: Characters can ONLY use items currently listed in their inventory above. If a player's action references using an item they do not possess, the action MUST fail or the narrative should reflect they don't have it. Only include items in removeItems that the character actually has in their inventory.
12. QUEST OBJECTIVE TRACKING (CRITICAL): After writing the narrative, cross-reference ALL unchecked ACTIVE QUESTS objectives against what happened. If ANY objective was fulfilled (even partially or indirectly), you MUST include the corresponding questUpdates entry. Do NOT narrate fulfillment of an objective without marking it in questUpdates.

ACTION FEASIBILITY (MANDATORY — applies BEFORE dice roll decision):
- IMPOSSIBLE ACTIONS (auto-fail, NO dice roll): If a player attempts something physically impossible or targets someone/something not present in the scene (e.g., talking to an NPC who is not at the current location, using a feature that doesn't exist here, attacking an enemy not in combat), do NOT include a diceRolls entry for that action and narrate the failure — the character looks around but the person isn't here, reaches for something that isn't there, etc.
- TRIVIAL ACTIONS (auto-success, NO dice roll): If the action is trivially easy with no meaningful chance of failure (e.g., walking a short distance on flat ground, picking up an object at your feet, opening an unlocked door, sitting down), do NOT include a diceRolls entry and narrate the success directly.
- UNCERTAIN ACTIONS (normal dice roll): Only use dice rolls for actions with genuinely uncertain outcomes where both success and failure are plausible.
- EXCEPTIONS: A character may summon a companion/familiar, or an NPC may arrive as part of the narrative — but this should be contextually justified, not a way to bypass presence rules.
- suggestedActions MUST only include actions that are feasible given who and what is present at the current location. Do not suggest talking to NPCs who are elsewhere.

CODEX SYSTEM (detailed lore and knowledge discovery):
When any player asks about, investigates, or learns about something specific, generate a detailed codex fragment via stateChanges.codexUpdates. Each NPC reveals only ONE fragment per interaction based on their role (scholars know history, peasants know rumors, soldiers know weaknesses/locations). Check the PLAYER CODEX above — never repeat known information. Format:
{"codexUpdates": [{"id": "unique-slug", "name": "Subject Name", "category": "artifact|person|place|event|faction|creature|concept", "fragment": {"content": "2-4 sentences of specific detail...", "source": "Who revealed this", "aspect": "history|description|location|weakness|rumor|technical|political"}, "tags": ["relevant", "tags"], "relatedEntries": []}]}

CURRENCY SYSTEM:
The game uses three denominations: Gold Crown (GC), Silver Shilling (SS), Copper Penny (CP). 1 GC = 10 SS = 100 CP.
- When a character BUYS or PAYS, deduct via perCharacter moneyChange (negative deltas). If a character cannot afford the purchase, it MUST FAIL.
- When a character RECEIVES money (loot, payment, selling, rewards), use positive deltas.
- The system auto-normalizes coins.

REFERENCE PRICE LIST (adjust contextually):
Food/Drink: bread 2 CP, ale 3 CP, hot meal 8 CP, fine wine 3 SS
Lodging: common room 5 CP/night, private room 2 SS/night
Weapons: dagger 1 SS, hand weapon 1 GC, crossbow 2 GC 5 SS
Armor: leather jerkin 1 GC 2 SS, mail shirt 6 GC
Gear: rope 4 CP, torch 1 CP, lantern 5 SS, healing draught 3 SS, lockpicks 5 SS
Services: healer 5 SS, blacksmith repair 3 SS, ferry 2 CP
Animals: riding horse 50 GC, mule 15 GC`;
}

function rollD50() {
  return Math.floor(Math.random() * 50) + 1;
}

function calculateMargin(total, threshold) {
  return total - threshold;
}

function buildMultiplayerScenePrompt(actions, isFirstScene = false, language = 'en', { needsSystemEnabled = false, characters = null } = {}, dmSettings = null, preRolledDice = null, characterMomentum = null, skipDiceRolls = null) {
  const langReminder = `\n\nLANGUAGE: Write narrative, dialogueSegments, suggestedActions in ${language === 'pl' ? 'Polish' : 'English'}. soundEffect, musicPrompt, imagePrompt stay in English.`;
  const needsPerCharHint = needsSystemEnabled
    ? ', "needsChanges": {"hunger": 60}'
    : '';
  const needsPerCharDoc = needsSystemEnabled
    ? '\nFor perCharacter needsChanges: use when a character satisfies a biological need (eating, drinking, toilet, bathing, resting). Value is an object of DELTAS: {"hunger": 60, "thirst": 40} means +60 hunger, +40 thirst. Typical: full meal +50-70 hunger, snack +20-30, drink +40-60 thirst, toilet +80-100 bladder, bath +60-80 hygiene, full sleep +70-90 rest, nap +20-30 rest. Omit needsChanges if no needs changed for that character.'
    : '';
  const perCharExample = `"wounds": -3, "xp": 10, "newItems": [{"id": "item_unique_id", "name": "Dagger", "type": "weapon", "description": "A small, sharp blade", "rarity": "common"}], "removeItems": [], "moneyChange": {"gold": 0, "silver": -2, "copper": 0}${needsPerCharHint}`;

  if (isFirstScene) {
    return `Generate the opening scene of this multiplayer campaign. Introduce all player characters and set the stage.

Respond with ONLY valid JSON:
{
  "narrative": "2-3 paragraphs setting the stage, introducing all characters...",
  "dialogueSegments": [
    {"type": "narration", "text": "Prose..."},
    {"type": "dialogue", "character": "NPC or Player Name", "gender": "male", "text": "..."}
  ],
  "soundEffect": "ambient sound or null",
  "musicPrompt": "background music description or null",
  "imagePrompt": "ENGLISH visual scene description (max 200 chars)",
  "atmosphere": {
    "weather": "clear",
    "particles": "none",
    "mood": "mystical",
    "transition": "fade"
  },
  "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
  "stateChanges": {
    "perCharacter": {},
    "timeAdvance": {"hoursElapsed": 0.5},
    "currentLocation": "Starting Location",
    "mapChanges": [{"location": "Location Name", "modification": "Description of change", "type": "discovery"}],
    "npcs": [{"action": "introduce", "name": "NPC Name", "gender": "male", "role": "innkeeper", "personality": "jovial, loud", "attitude": "friendly", "location": "The Rusty Anchor", "notes": "", "dispositionChange": 5}],
    "worldFacts": [],
    "journalEntries": ["Opening scene summary"],
    "newQuests": [{"id": "quest_unique_id", "name": "Quest Name", "description": "Quest description", "completionCondition": "Main goal", "objectives": [{"id": "obj_1", "description": "First milestone"}]}],
    "completedQuests": [],
    "questUpdates": [],
    "activeEffects": [{"action": "add", "type": "trap|spell|environmental", "location": "Location", "description": "Effect description", "placedBy": "who"}],
    "codexUpdates": [],
    "combatUpdate": null
  }
}

For stateChanges.newQuests: array of new quests to add. Each quest: {"id": "quest_unique_id", "name": "Quest Name", "description": "Quest description", "completionCondition": "Main goal to finish the quest", "objectives": [{"id": "obj_1", "description": "Milestone"}]}. "objectives" are 2-5 optional milestones guiding through the story. Use empty array [] if no new quests.
For stateChanges.completedQuests: array of quest IDs to mark as completed. Use empty array [] if none completed.
QUEST TRACKING (MANDATORY): For stateChanges.questUpdates: array of objective completions, e.g. [{"questId": "quest_123", "objectiveId": "obj_1", "completed": true}]. AFTER writing the narrative, you MUST cross-check ALL active quest objectives against the scene events. If the narrative describes events that fulfill any objective (even partially or indirectly), you MUST include the corresponding questUpdates entry. NEVER write a journal entry or narrative that fulfills an objective without marking it here. Separate from completedQuests.

For stateChanges.activeEffects: manage traps, spells, ongoing environmental effects. Use "add" to place new effects, "remove" to clear them (by id), "trigger" to fire and deactivate them (by id). Use empty array [] if no effect changes.

For stateChanges.perCharacter: an object keyed by character name, each containing {wounds, xp, newItems, removeItems, moneyChange${needsPerCharHint ? ', needsChanges' : ''}} deltas. "wounds" is a delta (negative = damage taken, positive = healing). "moneyChange" is {gold, silver, copper} deltas (negative = spending, positive = receiving). Example: {"Aldric": {"wounds": -3, "xp": 10, "newItems": [{"id": "item_sword_01", "name": "Rusty Sword", "type": "weapon", "description": "A battered but functional blade", "rarity": "common"}], "moneyChange": {"silver": -2}}, "Lyra": {"xp": 10, "moneyChange": {"gold": 1}}}. Use empty object {} if no per-character changes.
For perCharacter newItems: each item MUST be an object with {id, name, type, description, rarity}. "id" = unique string. "name" = the item's display name. "type" = one of: weapon, armor, potion, scroll, artifact, tool, food, clothing, key, book, ring, ammunition, trinket, shield, misc. "description" = short flavor text. "rarity" = "common", "uncommon", "rare", or "exotic". NEVER omit name or description. For removeItems: array of item id strings.${needsPerCharDoc}

For stateChanges.mapChanges: use when a location is modified (trap set, destruction, discovery, obstacle). Each entry: {"location": "Place", "modification": "what changed", "type": "trap|destruction|discovery|obstacle|other"}. Use empty array [] if no map changes.

For stateChanges.npcs: use "introduce" for new NPCs and "update" for existing ones. Always include name and gender. Provide personality, role, attitude toward player, and current location.
NPC DISPOSITION TRACKING: When a dice roll involves interaction with an NPC, include a variable "dispositionChange" based on margin — NOT flat +5/-5:
- Critical success (roll 1): +3 to +5, Strong success (margin 10+): +2 to +3, Moderate success (margin 5-9): +1 to +2, Marginal success (margin 0-4): +1
- Marginal failure (margin -1 to -5): -1 to -2, Hard failure (margin -6 or worse): -3 to -5, Critical failure (roll 50): -5 to -8
NPC RELATIONSHIP TRACKING: Include optional fields: "factionId", "relatedQuestIds", "relationships".

COMBAT ENCOUNTERS (MULTIPLAYER):
When the narrative describes the beginning of a hostile combat encounter, include "combatUpdate" in stateChanges.
{"combatUpdate": {"active": true, "enemies": [{"name": "Enemy Name"}], "reason": "Short description of why combat started"}}
The game engine assigns balanced stat blocks based on enemy names. Set combatUpdate to null when no combat starts.

For stateChanges.factionChanges: {"faction_id": delta} when actions affect a faction. Use null if none.
For stateChanges.knowledgeUpdates, narrativeSeeds, resolvedSeeds, npcAgendas: see normal scene documentation.
For stateChanges.dialogueUpdate: include when dialogue mode starts. Use null otherwise.
For stateChanges.campaignEnd: only for definitive conclusions. Use null otherwise.

CRITICAL: The dialogueSegments array must cover the FULL narrative broken into narration and dialogue chunks. Narration segments must contain the COMPLETE, VERBATIM narrative text — do NOT summarize, shorten, or paraphrase. The combined text of all narration segments must equal the full "narrative" field (minus any dialogue lines). Every sentence from "narrative" must appear in a narration segment. Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST include a "gender" field ("male" or "female"). When a player character speaks, include their dialogue as a dialogue segment with their character name and gender.${langReminder}`;
  }

  const testsFrequency = dmSettings?.testsFrequency ?? 50;
  const needsReminder = needsSystemEnabled ? buildMultiplayerUnmetNeedsBlock(characters) : '';

  const hasWait = actions.some((a) => a.action === '[WAIT]');
  const hasContinue = actions.some((a) => a.action === '[CONTINUE]');
  const specialActionHints = [
    hasWait
      ? `[WAIT] — Player(s) chose passive waiting: they take no initiative; NPCs and the world should advance meaningfully around them. Set diceRolls to null / omit dice for those characters. Do not start combat unless the world attacks them unprovoked.`
      : null,
    hasContinue
      ? `[CONTINUE] — Player(s) want the story to move forward without specifying how: advance the plot or situation; they remain engaged but you drive the next beat.`
      : null,
  ].filter(Boolean).join('\n\n');

  const hasCustomActions = actions.some((a) => a.isCustom);
  const hasMomentum = characterMomentum && Object.values(characterMomentum).some((v) => v !== 0);
  const actionLines = actions
    .map((a) => {
      const skipRoll = skipDiceRolls?.[a.name];
      const diceInfo = !skipRoll && preRolledDice?.[a.name] ? ` [PRE-ROLLED d50: ${preRolledDice[a.name]}]` : '';
      const skipInfo = skipRoll ? ' [NO DICE ROLL]' : '';
      const momInfo = !skipRoll && characterMomentum?.[a.name] !== 0 && characterMomentum?.[a.name] != null ? ` [MOMENTUM ${characterMomentum[a.name] > 0 ? '+' : ''}${characterMomentum[a.name]}]` : '';
      return `- ${a.name} (${a.gender}): ${a.action}${a.isCustom ? ' [CUSTOM ACTION]' : ''}${diceInfo}${skipInfo}${momInfo}`;
    })
    .join('\n');

  return `${needsReminder}${specialActionHints ? `${specialActionHints}\n\n` : ''}The players' actions this round:
${actionLines}

ACTION VS SPEECH (CRITICAL — read both rules carefully):
RULE 1 — ACTION PARTS: The non-quoted parts of each player's input describe what their character DOES — narrate them as action in prose. Never turn unquoted action text into spoken dialogue (e.g. the character must NOT announce their own action aloud).
RULE 2 — SPEECH PARTS (MANDATORY): When the input contains text inside quotation marks ("..."), that is the character speaking those exact words in-character. You MUST include each quoted phrase as a "dialogue" segment in dialogueSegments with that player character's name and gender. Do NOT skip, paraphrase, or fold quoted speech into narration — present it as actual spoken dialogue.
Example: input [I encourage everyone to celebrate. "Party on!" I shout.] → narrate the encouraging as action, then include "Party on!" as a dialogue segment.
If the input has NO quotation marks at all, the character does not speak (unless you as GM decide they would naturally say something brief and contextually fitting — but never the player's input text verbatim).

Resolve ALL player actions simultaneously. Describe what happens to each character.

FEASIBILITY CHECK: Before rolling dice, verify each action is possible given the NPCs and features present at the current location. Impossible actions auto-fail (no diceRolls entry). Trivial/certain actions auto-succeed (no diceRolls entry). Only roll for uncertain outcomes.
Simple repositioning or low-risk movement such as taking a step back, moving aside, or cautiously backing away is usually trivial. Prefer no dice roll unless the scene is actively dangerous; if you do require a roll, expose that ease with difficultyModifier +20 or +30.

DICE ROLL FREQUENCY: The dice roll frequency is ~${testsFrequency}%. For each player's action, decide whether a roll is needed based on this frequency. At high values (80%+), even trivial actions require a roll. Each character who needs a test gets their own entry in the diceRolls array. Build each roll like this: "baseTarget" = attribute + skill level, "difficultyModifier" = an explicit difficulty step, and "target" = the final effective target used for success comparison.
ATTRIBUTE RULE: Every diceRolls entry MUST include a valid RPGon attribute key: sila, inteligencja, charyzma, zrecznosc, wytrzymalosc, or szczescie. For speech, persuasion, bargaining, bluffing, charming, greeting, and asking questions, default to charyzma unless a more specific skill clearly implies another attribute. Never invent non-RPGon stats. If you cannot determine a valid attribute, omit that character from diceRolls instead of guessing.
DIFFICULTY MODIFIER: Always expose task difficulty explicitly via "difficultyModifier" instead of hiding it inside "target". Use only one of these values: +40, +30, +20, +10, 0, -10, -20, -30, -40. Guide: +40 routine, +30 easy, +20 favorable, +10 slightly favorable, 0 standard, -10 challenging, -20 hard, -30 very hard, -40 extreme / nearly suicidal.
NPC DISPOSITION MODIFIERS: When a roll involves direct NPC interaction (social, trade, persuasion), apply the NPC's disposition as a separate target modifier: >=30:+15, >=15:+10, >=5:+5, neutral:0, <=-5:-5, <=-15:-10, <=-30:-15. Include "dispositionBonus" in the diceRoll entry.
${preRolledDice ? `PRE-ROLLED DICE: Each character has a pre-rolled d50 value (1-50) shown above. You MUST use these exact values as the "roll" in diceRolls. Do NOT generate your own roll numbers. First determine each character's skill and target number (including creativity bonus for custom actions), then check whether the pre-rolled value succeeds or fails against the target, and THEN write the narrative matching those outcomes.` : ''}
${skipDiceRolls && Object.keys(skipDiceRolls).length > 0 ? `DICE ROLL OVERRIDE: Characters marked [NO DICE ROLL] above do NOT require a dice roll this round. Do NOT include them in the diceRolls array. Resolve their actions narratively without mechanical dice resolution.` : ''}
${hasCustomActions ? `
CREATIVITY BONUS: Actions marked [CUSTOM ACTION] were written by the player (not selected from suggestions). Evaluate the creativity, originality, and cleverness of each custom action.
- +10: Mundane custom action — a basic alternative to the suggestions, nothing special
- +15: Slightly creative — shows some thought or personality but still straightforward
- +20: Moderately creative — good use of environment or character abilities
- +30: Very creative — an unexpected approach that makes strong narrative sense, demonstrates clever thinking
- +40: Exceptionally creative — a truly brilliant, surprising action that uses multiple narrative elements in an inventive way. This should be RARE
Always award at least +10 for any custom action.
COMBINED BONUS CAP: creativityBonus + momentumBonus + dispositionBonus is capped at +30 by the game engine. "difficultyModifier" is NOT part of that cap and stays separate.
Output the diceRoll fields as follows for custom actions:
- "baseTarget": the BASE value (characteristic + skill advances only)
- "difficultyModifier": the separate difficulty step (one of +40, +30, +20, +10, 0, -10, -20, -30, -40)
- "creativityBonus": the bonus (10-40)
- "target": the EFFECTIVE value = baseTarget + difficultyModifier + creativityBonus (+ other applicable modifiers) (this is the number you compare the roll against!)
- "success": whether roll <= target (the effective value)
Example: baseTarget=31, difficultyModifier=-10, creativityBonus=20, target=41, roll=45 → 45 > 41 → success=false. The narrative MUST describe a failed outcome.
` : ''}${hasMomentum ? `
MOMENTUM: Some characters have momentum from previous rolls (shown as [MOMENTUM +N] or [MOMENTUM -N] above).
Positive momentum is a bonus — add it to the target: target = baseTarget + difficultyModifier + creativityBonus + momentumBonus.
Negative momentum is a penalty — it reduces the target (momentumBonus is negative, so adding it lowers the target).
Output "momentumBonus": N in the diceRoll entry for that character (N can be positive or negative).
` : ''}
IMPORTANT: Resolve dice checks FIRST for all characters, then write the narrative consistent with ALL outcomes.

Respond with ONLY valid JSON:
{
  "diceRolls": [{"character": "CharacterName", "type": "d50", "roll": 22, "target": 35, "margin": 12, "skill": "Atletyka", "success": true}],
  "narrative": "2-3 paragraphs resolving all actions and setting up the next decision...",
  "dialogueSegments": [
    {"type": "narration", "text": "Prose..."},
    {"type": "dialogue", "character": "NPC or Player Name", "gender": "male", "text": "..."}
  ],
  "soundEffect": "sound description or null",
  "musicPrompt": "music description or null",
  "imagePrompt": "ENGLISH visual scene description (max 200 chars)",
  "atmosphere": {
    "weather": "clear",
    "particles": "none",
    "mood": "tense",
    "transition": "dissolve"
  },
  "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
  "questOffers": [],
  "stateChanges": {
    "perCharacter": {
      "CharacterName": {${perCharExample}}
    },
    "timeAdvance": {"hoursElapsed": 0.5},
    "currentLocation": "Location Name",
    "mapChanges": [{"location": "Location Name", "modification": "Description of change", "type": "discovery"}],
    "npcs": [{"action": "introduce|update", "name": "NPC Name", "gender": "male|female", "role": "their role", "personality": "traits", "attitude": "friendly|neutral|hostile|fearful|etc", "location": "where they are", "notes": "optional notes", "dispositionChange": 5}],
    "worldFacts": [],
    "journalEntries": ["Summary of key events"],
    "newQuests": [],
    "completedQuests": [],
    "questUpdates": [],
    "activeEffects": [],
    "codexUpdates": [],
    "combatUpdate": null
  }
}

For perCharacter: include an entry for each character that is affected. wounds/xp are deltas (wounds negative = damage, positive = healing). moneyChange is {gold, silver, copper} deltas (negative = spending, positive = receiving). Check each character's Money before allowing purchases.
For perCharacter newItems: each item MUST be an object with {id, name, type, description, rarity}. "id" = unique string (e.g. "item_dagger_01"). "name" = the item's display name. "type" = one of: weapon, armor, potion, scroll, artifact, tool, food, clothing, key, book, ring, ammunition, trinket, shield, misc. "description" = short flavor text. "rarity" = "common", "uncommon", "rare", or "exotic". NEVER omit name or description — these are shown to the player. For removeItems: array of item id strings to remove from the character's inventory.
LOOT RARITY GATING: Scenes 1-15: only "common"/"uncommon" items. Scenes 16-30: "rare" allowed. Scenes 31+: "exotic" possible but with narrative cost (thieves, faction interest, rumors). Always set the "rarity" field.
ITEM VALIDATION: Characters can ONLY use items currently in their inventory. If a player references an item they don't have, the action MUST fail narratively. Only include items in removeItems that exist in the character's inventory.${needsPerCharDoc}

For diceRolls: an array of per-character dice roll results. Each entry: {"character": "CharacterName", "type": "d50", "roll": <1-50>, "attribute": "<sila/inteligencja/charyzma/zrecznosc/wytrzymalosc/szczescie>", "attributeValue": <number — raw stat value 1-25>, "skillLevel": <number — skill level, 0 if untrained>, "baseTarget": <number — attribute + skill level only>, "difficultyModifier": <one of 40, 30, 20, 10, 0, -10, -20, -30, -40>, "target": <number — the EFFECTIVE target used for success comparison>, "margin": <number>, "skill": "<skill name>", "success": <boolean>}. For custom actions, also include: "creativityBonus": <number 10-40>. ${preRolledDice ? 'Use the pre-rolled d50 values for each character.' : ''} For social speech and persuasion use charyzma unless a more specific skill says otherwise. If no valid RPGon attribute fits, omit that character from diceRolls. For custom actions: "target" = baseTarget + difficultyModifier + creativityBonus (+ any other applicable modifiers). For normal actions: "target" = baseTarget + difficultyModifier (+ any other applicable modifiers). "difficultyModifier" must always be explicit; do not hide it only inside "target". Determine success by comparing roll to target: success = (roll <= target) OR (roll === 1, critical success). Roll 50 is always failure (critical failure). The narrative MUST match all dice outcomes. Include a roll for each character whose action warrants a test based on the configured frequency (~${testsFrequency}%). At 80%+, nearly every character rolls. Use empty array [] only when dice frequency is low and no actions warrant tests.

For stateChanges.newQuests: array of new quests to add. Each quest: {"id": "quest_unique_id", "name": "Quest Name", "description": "Quest description", "completionCondition": "Main goal to finish the quest", "objectives": [{"id": "obj_1", "description": "Milestone"}]}. "objectives" are 2-5 optional milestones guiding through the story. Use empty array [] if no new quests.
For stateChanges.completedQuests: array of quest IDs to mark as completed. Use empty array [] if none completed.
QUEST TRACKING (MANDATORY): For stateChanges.questUpdates: array of objective completions, e.g. [{"questId": "quest_123", "objectiveId": "obj_1", "completed": true}]. AFTER writing the narrative, you MUST cross-check ALL active quest objectives against the scene events. If the narrative describes events that fulfill any objective (even partially or indirectly), you MUST include the corresponding questUpdates entry. NEVER write a journal entry or narrative that fulfills an objective without marking it here. Separate from completedQuests.
QUEST DISCOVERY: When any player explicitly asks about available work, tasks, quests, jobs, or missions, populate the top-level "questOffers" array with 1-3 quest proposals. Each offer: {"id": "quest_<unique>", "name": "Quest Name", "description": "What the quest entails", "completionCondition": "What must be done to complete it", "objectives": [{"id": "obj_1", "description": "First milestone"}, ...], "offeredBy": "NPC name or source", "reward": "Narrative reward hint", "type": "main|side|personal"}. Narrate quest sources naturally — NPCs offering jobs, notice boards, tavern rumors, guild contacts. Use "questOffers" for quests players can accept or decline. Use "stateChanges.newQuests" only for quests forced by story events. When not asked about quests, leave "questOffers" as [].

For stateChanges.activeEffects: manage traps, spells, ongoing environmental effects. Use "add" to place new effects, "remove" to clear them (by id), "trigger" to fire and deactivate them (by id). Use empty array [] if no effect changes.

For stateChanges.npcs: use "introduce" for new NPCs and "update" for existing ones. Always include name and gender. Provide personality, role, attitude toward player, and current location.
NPC DISPOSITION TRACKING: When a dice roll involves interaction with an NPC, include that NPC in stateChanges.npcs with a variable "dispositionChange" based on margin — NOT a flat +5/-5:
- Critical success (roll 1): +3 to +5, Strong success (margin 10+): +2 to +3, Moderate success (margin 5-9): +1 to +2, Marginal success (margin 0-4): +1
- Marginal failure (margin -1 to -5): -1 to -2, Hard failure (margin -6 or worse): -3 to -5, Critical failure (roll 50): -5 to -8
- Betrayal, broken promise, or threat: -8 to -10
NPC RELATIONSHIP TRACKING: Include optional fields: "factionId", "relatedQuestIds", "relationships" ([{"npcName": "Other NPC", "type": "ally|enemy|family|employer|rival|friend|mentor|subordinate"}]).

COMBAT ENCOUNTERS (MULTIPLAYER):
When the narrative describes the beginning of a hostile combat encounter, include "combatUpdate" in stateChanges.
{"combatUpdate": {"active": true, "enemies": [{"name": "Enemy Name"}], "reason": "Short description of why combat started"}}
The game engine assigns balanced stat blocks based on enemy names — you only need to provide the name.
PLAYER-INITIATED COMBAT: When ANY player's action explicitly involves attacking, starting a fight, initiating combat, challenging someone, or provoking a confrontation, you MUST include "combatUpdate" with appropriate enemies. Use NPCs currently present in the scene. Respect player agency: if a player wants to fight, they fight. Do NOT narrate combat without including combatUpdate. Set combatUpdate to null when no combat starts.

For stateChanges.factionChanges: {"faction_id": delta} when actions affect a faction. IDs: merchants_guild, thieves_guild, temple_sigmar, temple_morr, military, noble_houses, chaos_cults, witch_hunters, wizards_college, peasant_folk. Use null if no faction changes.
For stateChanges.knowledgeUpdates: {"events": [{"summary": "...", "importance": "minor|major|critical", "tags": []}], "decisions": [{"choice": "...", "consequence": "...", "tags": []}], "plotThreads": [{"id": "...", "name": "...", "status": "active|resolved|abandoned", "relatedNpcIds": [], "relatedQuestIds": []}]}. Use null if no knowledge updates.
For stateChanges.narrativeSeeds: array of foreshadowing details: [{"id": "seed_id", "description": "what the player notices", "payoffCondition": "location|scenes", "payoffHint": "GM note on resolution", "location": "where it pays off"}]. Plant 0-1 per scene. Use empty array [] if none.
For stateChanges.resolvedSeeds: array of seed IDs whose payoff is woven into this scene. Use empty array [] if none.
For stateChanges.npcAgendas: array of off-screen NPC activities: [{"npcName": "NPC", "goal": "what they want", "nextAction": "what they will do", "urgency": "low|medium|high", "triggerAfterScenes": 3}]. Use empty array [] if none.
For stateChanges.dialogueUpdate: {"active": true, "npcs": [{name, attitude, goal}], "reason": "..."} when structured dialogue mode starts. Use null otherwise.
For stateChanges.campaignEnd: {"status": "completed"|"failed", "epilogue": "2-3 paragraph epilogue"} ONLY for definitive campaign conclusions. Use null otherwise.

For scenePacing (MANDATORY): return one of: combat, chase, stealth, exploration, dialogue, travel_montage, celebration, rest, dramatic, dream, cutscene. Match prose style to the chosen pacing type.
For cutscene: {"title": "Meanwhile...", "narrative": "1-2 paragraphs", "location": "Location", "characters": ["NPC"]}. Use sparingly. Set to null when not using. Never include player characters.
For dilemma: {"title": "...", "stakes": "...", "options": [{"label": "...", "consequence": "...", "action": "..."}]}. 2-4 options. Use every 5-8 scenes when narrative supports it. Set to null otherwise.

CRITICAL: The dialogueSegments array must cover the FULL narrative broken into narration and dialogue chunks. Narration segments must contain the COMPLETE, VERBATIM narrative text — do NOT summarize, shorten, or paraphrase. The combined text of all narration segments must equal the full "narrative" field (minus any dialogue lines). Every sentence from "narrative" must appear in a narration segment. Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST include a "gender" field ("male" or "female"). When a player character speaks, include their dialogue as a dialogue segment with their character name and gender.${langReminder}`;
}

function safeParseJSONContent(raw) {
  if (typeof raw === 'object' && raw !== null) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
    }
    throw new Error('Failed to parse AI response as JSON');
  }
}

const RETRY_DELAYS = [1000, 3000];

async function callAI(messages) {
  const openaiKey = config.apiKeys.openai || '';
  const anthropicKey = config.apiKeys.anthropic || '';

  if (!openaiKey && !anthropicKey) {
    throw new AIServiceError(
      AI_ERROR_CODES.NO_SERVER_API_KEY,
      'Server AI keys are not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in backend environment variables.',
      { statusCode: 503, retryable: false },
    );
  }

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (openaiKey && (attempt < 2 || !anthropicKey)) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-5.4',
            messages,
            temperature: 0.8,
            response_format: { type: 'json_object' },
          }),
        });
        if (!response.ok) {
          await parseProviderError(response, 'openai');
        }
        const data = await response.json();
        return safeParseJSONContent(data.choices[0].message.content);
      }

      if (anthropicKey) {
        const systemMsg = messages.find((m) => m.role === 'system');
        const userMsgs = messages.filter((m) => m.role !== 'system');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemMsg?.content || '',
            messages: userMsgs,
            temperature: 0.8,
          }),
        });
        if (!response.ok) {
          await parseProviderError(response, 'anthropic');
        }
        const data = await response.json();
        return safeParseJSONContent(data.content[0].text);
      }
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const delay = RETRY_DELAYS[attempt] || 3000;
        console.warn(`[multiplayerAI] Retry ${attempt + 1} after ${delay}ms:`, err.message);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  if (lastError instanceof AIServiceError) throw lastError;
  throw new AIServiceError(
    AI_ERROR_CODES.AI_REQUEST_FAILED,
    lastError?.message || 'AI request failed.',
    { statusCode: 502, retryable: true, cause: lastError },
  );
}

export async function generateMultiplayerCampaign(settings, players, _encryptedApiKeys, language = 'en') {
  const playerCharList = players.map((p) => {
    if (p.characterData) {
      const cd = p.characterData;
      const career = cd.career || {};
      return `- ${cd.name} (${cd.species || 'Human'} ${career.name || 'Adventurer'}, ${p.gender})`;
    }
    return `- ${p.name} (${p.gender})`;
  }).join('\n');

  const humorousToneGuidance = settings.tone === 'Humorous'
    ? `\n\nHUMOROUS TONE GUIDELINES: The humor must NOT rely on random absurdity, slapstick, or zaniness. Instead, ground the campaign in a believable world and derive comedy from 1-2 genuinely controversial, provocative, or morally ambiguous elements — corrupt institutions, taboo customs, ethically questionable practices, morally grey factions, or politically charged conflicts. Comedy should emerge from how characters earnestly navigate these uncomfortable realities: dark irony, social satire, awkward moral dilemmas, characters taking absurd stances on serious issues. Sharp wit about real controversies, not random nonsense.\n`
    : '';

  const prompt = `Create a new MULTIPLAYER RPGon campaign with these parameters:
- Genre: ${settings.genre}
- Tone: ${settings.tone}
- Play Style: ${settings.style}
- Difficulty: ${settings.difficulty}
- Campaign Length: ${settings.length}
- Story prompt: "${settings.storyPrompt}"
${humorousToneGuidance}
PLAYERS (characters already created by players):
${playerCharList}

Generate the campaign foundation. The characters are already pre-created by the players — do NOT generate new characters. Respond with ONLY valid JSON:
{
  "name": "Campaign name (3-5 words)",
  "worldDescription": "2-3 paragraphs describing the world",
  "hook": "1-2 paragraphs story hook",
  "firstScene": {
    "narrative": "2-3 paragraphs of the opening scene introducing all characters",
    "dialogueSegments": [{"type": "narration", "text": "..."}],
    "soundEffect": null,
    "musicPrompt": "background music description",
    "imagePrompt": "ENGLISH visual scene description (max 200 chars)",
    "atmosphere": {"weather": "clear", "particles": "none", "mood": "mystical", "transition": "fade"},
    "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
    "journalEntries": ["Opening scene summary"]
  },
  "initialQuest": {"name": "Quest name", "description": "Quest description", "completionCondition": "Main goal to finish the quest", "objectives": [{"id": "obj_1", "description": "First milestone"}, {"id": "obj_2", "description": "Second milestone"}]},
  "initialWorldFacts": ["Fact 1", "Fact 2", "Fact 3"]
}

${language === 'pl' ? 'Write ALL text in Polish.' : ''}`;

  const messages = [
    { role: 'system', content: `You are a creative RPGon campaign designer. Create immersive multiplayer campaigns. Players already have pre-created characters — do not generate characters. Always respond with valid JSON. Write in ${language === 'pl' ? 'Polish' : 'English'}.` },
    { role: 'user', content: prompt },
  ];

  const result = await callAI(messages);

  const characters = players.map((p) => {
    const cd = p.characterData || {};
    return {
      playerName: p.name,
      odId: p.odId,
      name: cd.name || p.name,
      gender: cd.gender || p.gender || 'male',
      species: cd.species || 'Human',
      attributes: cd.attributes || { sila: 12, inteligencja: 12, charyzma: 12, zrecznosc: 12, wytrzymalosc: 12, szczescie: 5 },
      wounds: cd.wounds ?? cd.maxWounds ?? 12,
      maxWounds: cd.maxWounds ?? 12,
      mana: cd.mana ?? 0,
      maxMana: cd.maxMana ?? 0,
      skills: cd.skills || {},
      inventory: cd.inventory || [],
      money: cd.money || { gold: 0, silver: 5, copper: 0 },
      statuses: cd.statuses || [],
      backstory: cd.backstory || '',
      xp: cd.xp ?? 0,
      xpSpent: cd.xpSpent ?? 0,
      needs: { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 },
    };
  });

  const sceneId = `scene_mp_${Date.now()}`;
  const firstSceneNarrative = result.firstScene?.narrative || 'The adventure begins...';
  const firstSceneSegments = repairDialogueSegments(
    firstSceneNarrative,
    result.firstScene?.dialogueSegments || [],
    []
  );
  const firstScene = {
    id: sceneId,
    narrative: firstSceneNarrative,
    dialogueSegments: firstSceneSegments,
    actions: ensureSuggestedActions(result.firstScene, {
      language,
      currentLocation: '',
      npcsHere: [],
      previousActions: [],
      sceneIndex: 1,
    }),
    soundEffect: result.firstScene?.soundEffect || null,
    musicPrompt: result.firstScene?.musicPrompt || null,
    imagePrompt: result.firstScene?.imagePrompt || null,
    atmosphere: result.firstScene?.atmosphere || {},
    timestamp: Date.now(),
  };

  const dmMessage = {
    id: `msg_${Date.now()}`,
    role: 'dm',
    sceneId: firstScene.id,
    content: firstScene.narrative,
    dialogueSegments: firstScene.dialogueSegments,
    timestamp: Date.now(),
  };

  return {
    campaign: {
      name: result.name || 'Multiplayer Campaign',
      genre: settings.genre,
      tone: settings.tone,
      style: settings.style,
      difficulty: settings.difficulty,
      length: settings.length,
      worldDescription: result.worldDescription || '',
      hook: result.hook || '',
    },
    characters,
    world: {
      locations: [],
      facts: result.initialWorldFacts || [],
      eventHistory: result.firstScene?.journalEntries || [],
      npcs: [],
      mapState: [],
      mapConnections: [],
      currentLocation: '',
      exploredLocations: [],
      timeState: { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' },
      weather: { type: 'clear', intensity: 'mild', description: '' },
      factions: {},
      knowledgeBase: { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] },
      activeEffects: [],
      compressedHistory: '',
      codex: {},
    },
    quests: {
      active: result.initialQuest ? [{
        id: `quest_${Date.now()}`,
        ...result.initialQuest,
        objectives: (result.initialQuest.objectives || []).map((obj) => ({
          ...obj,
          completed: obj.completed ?? false,
        })),
      }] : [],
      completed: [],
    },
    scenes: [firstScene],
    chatHistory: [dmMessage],
    characterMomentum: {},
  };
}

export async function generateMidGameCharacter(gameState, settings, playerName, playerGender, _encryptedApiKeys, language = 'en', playerCharacterData = null) {
  // If the player already created a character via the modal, use it directly
  if (playerCharacterData) {
    const cd = playerCharacterData;
    return {
      character: {
        playerName,
        name: cd.name || playerName,
        gender: cd.gender || playerGender || 'male',
        species: cd.species || 'Human',
        attributes: cd.attributes || { sila: 12, inteligencja: 12, charyzma: 12, zrecznosc: 12, wytrzymalosc: 12, szczescie: 5 },
        wounds: cd.wounds ?? cd.maxWounds ?? 12,
        maxWounds: cd.maxWounds ?? 12,
        mana: cd.mana ?? 0,
        maxMana: cd.maxMana ?? 0,
        skills: cd.skills || {},
        inventory: cd.inventory || [],
        money: cd.money || { gold: 0, silver: 5, copper: 0 },
        statuses: cd.statuses || [],
        backstory: cd.backstory || '',
        xp: cd.xp ?? 0,
        xpSpent: cd.xpSpent ?? 0,
        needs: { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 },
      },
      arrivalNarrative: `${cd.name || playerName} joins the adventure.`,
    };
  }

  const existingChars = (gameState.characters || [])
    .map((c) => `- ${c.name} (${c.species || 'Human'} ${c.career?.name || 'Adventurer'}, Wounds ${c.wounds}/${c.maxWounds})`)
    .join('\n') || 'None';

  const campaign = gameState.campaign || {};

  const prompt = `A new player is joining a MULTIPLAYER RPGon campaign mid-game.

CAMPAIGN: "${campaign.name || 'Unnamed'}"
- Genre: ${settings.genre || 'Fantasy'}
- Tone: ${settings.tone || 'Epic'}
- Difficulty: ${settings.difficulty || 'Normal'}
- World: ${campaign.worldDescription?.substring(0, 300) || 'A mysterious world'}

EXISTING CHARACTERS:
${existingChars}

NEW PLAYER: ${playerName} (${playerGender})

Create a RPGon character for this new player that fits the campaign.

Respond with ONLY valid JSON:
{
  "name": "${playerName}",
  "species": "Human",
  "attributes": {"sila": 12, "inteligencja": 14, "charyzma": 10, "zrecznosc": 13, "wytrzymalosc": 11, "szczescie": 5},
  "skills": {"Atletyka": 5, "Uniki": 3},
  "wounds": 12, "maxWounds": 12,
  "mana": 0, "maxMana": 0,
  "inventory": [],
  "backstory": "2-3 sentences explaining how they arrive mid-adventure",
  "arrivalNarrative": "1-2 sentences describing the character appearing/arriving in the current scene"
}

${language === 'pl' ? 'Write ALL text in Polish.' : ''}`;

  const messages = [
    { role: 'system', content: `You are a RPGon character designer. Create balanced characters that fit existing campaigns. Write in ${language === 'pl' ? 'Polish' : 'English'}. Always respond with valid JSON.` },
    { role: 'user', content: prompt },
  ];

  const result = await callAI(messages);

  return {
    character: {
      playerName,
      name: result.name || playerName,
      gender: playerGender || 'male',
      species: result.species || 'Human',
      attributes: result.attributes || { sila: 12, inteligencja: 12, charyzma: 12, zrecznosc: 12, wytrzymalosc: 12, szczescie: 5 },
      wounds: result.wounds ?? result.maxWounds ?? 12,
      maxWounds: result.maxWounds ?? 12,
      mana: result.mana ?? 0,
      maxMana: result.maxMana ?? 0,
      skills: result.skills || {},
      inventory: result.inventory ?? [],
      money: { gold: 0, silver: 5, copper: 0 },
      statuses: [],
      backstory: result.backstory || '',
      xp: 0,
      xpSpent: 0,
      needs: { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 },
    },
    arrivalNarrative: result.arrivalNarrative || `${playerName} joins the adventure.`,
  };
}

export async function generateMultiplayerScene(gameState, settings, players, actions, _encryptedApiKeys, language = 'en', dmSettings = null, characterMomentum = null) {
  const systemPrompt = buildMultiplayerSystemPrompt(gameState, settings, players, language, dmSettings);
  const actionByName = new Map(actions.map((action) => [action.name, action]));
  const characterByName = new Map((gameState.characters || []).map((character) => [character.name, character]));

  const testsFrequency = dmSettings?.testsFrequency ?? 50;
  const preRolledDice = {};
  const skipDiceRolls = {};
  for (const a of actions) {
    if (a.action === '[WAIT]') {
      skipDiceRolls[a.name] = true;
    } else if (Math.random() * 100 < testsFrequency) {
      preRolledDice[a.name] = rollD50();
    } else {
      skipDiceRolls[a.name] = true;
    }
  }

  const scenePrompt = buildMultiplayerScenePrompt(actions, false, language, { needsSystemEnabled: settings.needsSystemEnabled === true, characters: gameState.characters || [] }, dmSettings, preRolledDice, characterMomentum, skipDiceRolls);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: scenePrompt },
  ];

  const result = await callAI(messages);

  function normalizeDiceRoll(dr, fallbackCharacterName = null) {
    if (!dr || dr.roll == null || dr.target == null) return dr;

    const characterName = dr.character || fallbackCharacterName;
    const actionText = actionByName.get(characterName)?.action || actions[0]?.action || '';
    const characterData = characterByName.get(characterName) || null;
    const resolvedAttribute = resolveDiceRollAttribute(dr, actionText);
    if (!resolvedAttribute) return null;

    dr.attribute = resolvedAttribute;
    if (dr.attributeValue == null) {
      dr.attributeValue = characterData?.attributes?.[resolvedAttribute] ?? null;
    }

    return dr.attributeValue == null ? null : dr;
  }

  function recalcDiceRoll(dr) {
    if (dr && dr.roll != null && dr.target != null) {
      const originalTarget = dr.target;
      const roll = dr.roll;
      const bonus = dr.creativityBonus || 0;
      const momentum = dr.momentumBonus || 0;
      const disposition = dr.dispositionBonus || 0;
      const providedDifficultyModifier = dr.difficultyModifier != null
        ? normalizeDifficultyModifier(dr.difficultyModifier)
        : null;

      let baseTarget;
      if (dr.baseTarget) {
        baseTarget = dr.baseTarget;
      } else if (dr.attributeValue != null && dr.skillLevel != null) {
        baseTarget = dr.attributeValue + dr.skillLevel;
      } else {
        baseTarget = dr.target - bonus - momentum - disposition - (providedDifficultyModifier ?? 0);
      }
      dr.baseTarget = baseTarget;

      if (dr.skillLevel == null && dr.attributeValue != null) {
        dr.skillLevel = Math.max(0, baseTarget - dr.attributeValue);
      }

      const totalBonus = bonus + momentum + disposition;
      const cappedBonus = Math.min(totalBonus, MAX_COMBINED_BONUS);
      const difficultyModifier = providedDifficultyModifier ?? snapDifficultyModifier(originalTarget - baseTarget - cappedBonus);
      dr.difficultyModifier = difficultyModifier;
      const effectiveTarget = baseTarget + cappedBonus + difficultyModifier;
      dr.target = effectiveTarget;

      const isCriticalSuccess = roll === 1;
      const isCriticalFailure = roll === 50;
      dr.success = isCriticalSuccess || (!isCriticalFailure && roll <= effectiveTarget);
      dr.criticalSuccess = isCriticalSuccess;
      dr.criticalFailure = isCriticalFailure;
      dr.margin = roll <= effectiveTarget ? effectiveTarget - roll : -(roll - effectiveTarget);
    }
  }

  if (result.diceRolls?.length) {
    result.diceRolls = result.diceRolls
      .map((dr) => normalizeDiceRoll(dr))
      .filter(Boolean);
    for (const dr of result.diceRolls) recalcDiceRoll(dr);
  }
  if (result.diceRoll) {
    result.diceRoll = normalizeDiceRoll(result.diceRoll, actions[0]?.name);
    if (result.diceRoll) recalcDiceRoll(result.diceRoll);
  }

  const worldNpcs = gameState?.world?.npcs || [];
  const stateNpcs = result.stateChanges?.npcs || [];
  const currentLocation = gameState?.world?.currentLocation || '';
  const npcsHere = worldNpcs.filter((npc) =>
    npc?.alive !== false
    && npc?.name
    && npc?.lastLocation
    && currentLocation
    && npc.lastLocation.toLowerCase() === currentLocation.toLowerCase()
  );
  const playerNames = players.map(p => p.name).filter(Boolean);
  const factionNames = Object.keys(gameState?.world?.factions || {});
  const locationNames = (gameState?.world?.mapState || []).map(l => l.name).filter(Boolean);
  const excludeFromSpeakers = [
    ...playerNames,
    ...factionNames,
    ...locationNames,
    ...(gameState?.world?.currentLocation ? [gameState.world.currentLocation] : []),
    ...(gameState?.campaign?.name ? [gameState.campaign.name] : []),
  ];
  const repairedSegments = repairDialogueSegments(
    result.narrative || '',
    result.dialogueSegments || [],
    [...worldNpcs, ...stateNpcs],
    excludeFromSpeakers
  );

  let finalSegments = repairedSegments;
  for (const a of actions) {
    if (a.action === '[WAIT]') continue;
    const player = players.find(p => p.name === a.name);
    finalSegments = ensurePlayerDialogue(finalSegments, a.action, a.name, player?.gender);
  }

  const sceneId = `scene_mp_${Date.now()}`;
  const questOffers = (result.questOffers || []).map((offer) => ({
    ...offer,
    objectives: (offer.objectives || []).map((obj) => ({ ...obj, completed: false })),
    status: 'pending',
  }));
  const stateChanges = result.stateChanges || {};
  const scene = {
    id: sceneId,
    narrative: result.narrative || '',
    scenePacing: result.scenePacing || 'exploration',
    dialogueSegments: finalSegments,
    actions: ensureSuggestedActions(result, {
      language,
      currentLocation,
      npcsHere,
      previousActions: gameState?.scenes?.[gameState.scenes.length - 1]?.actions || [],
      sceneIndex: (gameState?.scenes?.length || 0) + 1,
    }),
    questOffers,
    soundEffect: result.soundEffect || null,
    musicPrompt: result.musicPrompt || null,
    imagePrompt: result.imagePrompt || null,
    atmosphere: result.atmosphere || {},
    diceRoll: result.diceRoll || null,
    diceRolls: result.diceRolls || [],
    cutscene: result.cutscene || null,
    dilemma: result.dilemma || null,
    playerActions: actions.map((a) => ({ name: a.name, action: a.action })),
    timestamp: Date.now(),
    ...((stateChanges.combatUpdate || stateChanges.dialogueUpdate) && {
      stateChanges: {
        ...(stateChanges.combatUpdate && { combatUpdate: stateChanges.combatUpdate }),
        ...(stateChanges.dialogueUpdate && { dialogueUpdate: stateChanges.dialogueUpdate }),
      },
    }),
  };

  const waitSystemText = language === 'pl' ? 'Czekam i patrzę, co wydarzy się dalej.' : 'I wait and see what happens next.';
  const continuePlayerText = language === 'pl' ? 'Dalej — kontynuujemy opowieść.' : 'Continue — moving the story forward.';

  const chatMessages = [];
  for (const a of actions) {
    if (a.action === '[WAIT]') {
      chatMessages.push({
        id: `msg_${Date.now()}_wait_${a.odId}`,
        role: 'system',
        subtype: 'wait',
        playerName: a.name,
        odId: a.odId,
        content: `${a.name}: ${waitSystemText}`,
        timestamp: Date.now(),
      });
      continue;
    }
    chatMessages.push({
      id: `msg_${Date.now()}_${a.odId}`,
      role: 'player',
      playerName: a.name,
      odId: a.odId,
      content: a.action === '[CONTINUE]' ? continuePlayerText : a.action,
      timestamp: Date.now(),
    });
  }
  if (result.diceRolls?.length) {
    for (const dr of result.diceRolls) {
      chatMessages.push({
        id: `msg_${Date.now()}_roll_${dr.character}`,
        role: 'system',
        subtype: 'dice_roll',
        content: `🎲 ${dr.character} — ${dr.skill || 'Check'}: ${dr.roll ?? '?'} vs ${dr.target ?? '?'} — margin ${dr.margin ?? 0} — ${dr.success ? 'Success' : 'Failure'}`,
        diceData: dr,
        timestamp: Date.now(),
      });
    }
  } else if (result.diceRoll) {
    const dr = result.diceRoll;
    chatMessages.push({
      id: `msg_${Date.now()}_roll`,
      role: 'system',
      subtype: 'dice_roll',
      content: `🎲 ${dr.skill || 'Check'}: ${dr.roll ?? '?'} vs ${dr.target ?? '?'} — margin ${dr.margin ?? 0} — ${dr.success ? 'Success' : 'Failure'}`,
      diceData: dr,
      timestamp: Date.now(),
    });
  }

  chatMessages.push({
    id: `msg_dm_${Date.now()}`,
    role: 'dm',
    sceneId: scene.id,
    content: scene.narrative,
    dialogueSegments: scene.dialogueSegments,
    soundEffect: scene.soundEffect,
    timestamp: Date.now(),
  });

  const scMessages = generateStateChangeMessages(
    stateChanges,
    gameState.characters || [],
    language,
    gameState.quests,
  );
  chatMessages.push(...scMessages);

  return {
    scene,
    chatMessages,
    stateChanges,
  };
}

const COMPRESSION_THRESHOLD = 15;
const FULL_SCENE_KEEP = 3;
const MEDIUM_SCENE_KEEP = 5;

export function needsCompression(gameState) {
  return (gameState.scenes || []).length > COMPRESSION_THRESHOLD && !gameState.world?.compressedHistory;
}

export async function compressOldScenes(gameState, _encryptedApiKeys, language = 'en') {
  const scenes = gameState.scenes || [];
  const scenesToCompress = scenes.slice(0, -FULL_SCENE_KEEP - MEDIUM_SCENE_KEEP);
  if (scenesToCompress.length === 0) return null;

  const scenesText = scenesToCompress
    .map((s, i) => {
      const actions = (s.playerActions || []).map((a) => `${a.name}: ${a.action}`).join('; ');
      return `Scene ${i + 1}${actions ? ` [${actions}]` : ''}: ${s.narrative}`;
    })
    .join('\n\n');

  const langNote = language === 'pl' ? ' Write the summary in Polish, matching the language of the source scenes.' : '';
  const systemPrompt = `You are a narrative summarizer for a multiplayer RPG game. Compress scene histories into concise but complete summaries that preserve all important details: character names, NPC names, locations, player decisions, consequences, combat outcomes, items found, and plot developments. Always respond with valid JSON only.${langNote}`;
  const userPrompt = `Summarize the following multiplayer RPG scene history into a concise narrative summary (max 2000 characters). Preserve key facts: character names and actions, NPC names and fates, locations visited, items acquired/lost, major decisions and their consequences, combat outcomes, and unresolved plot threads.\n\nSCENES:\n${scenesText}\n\nRespond with JSON: {"summary": "Your compressed summary here..."}`;

  try {
    const result = await callAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    );
    return result?.summary || null;
  } catch (err) {
    console.warn('[multiplayerAI] Scene compression failed:', err.message);
    return null;
  }
}

export async function verifyMultiplayerQuestObjective(
  storyContext,
  questName,
  questDescription,
  objectiveDescription,
  language = 'en'
) {
  const langInstruction = language === 'pl'
    ? 'Write reasoning in Polish.'
    : 'Write reasoning in English.';

  const messages = [
    {
      role: 'system',
      content: `You verify quest objective completion for a multiplayer RPGon session.
Return ONLY valid JSON with this exact shape:
{
  "fulfilled": true or false,
  "reasoning": "short explanation based on evidence from the story context"
}
Rules:
- fulfilled=true only when evidence is explicit and unambiguous.
- If evidence is weak or missing, return fulfilled=false.
- Keep reasoning concise (1-3 sentences).
${langInstruction}`,
    },
    {
      role: 'user',
      content: `QUEST: ${questName || 'Unknown quest'}
QUEST DESCRIPTION: ${questDescription || 'N/A'}
OBJECTIVE TO VERIFY: ${objectiveDescription || 'N/A'}

STORY CONTEXT:
${storyContext || 'No story context available.'}`,
    },
  ];

  const result = await callAI(messages);
  return {
    fulfilled: Boolean(result?.fulfilled),
    reasoning: typeof result?.reasoning === 'string' ? result.reasoning.trim() : '',
  };
}
