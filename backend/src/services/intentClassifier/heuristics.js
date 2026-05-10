/**
 * Heuristic layer for intent classification.
 *
 * Handles structured markers (`[ATTACK:X]`, `[TALK:Y]`, etc.) and a few freeform
 * patterns (combat/travel/dungeon/trade/stealth/persuade/search/rest). Returns
 * null for freeform text that needs the nano model to make a call.
 */

import { detectCombatIntent } from '../../../../shared/domain/combatIntent.js';
import { isHypotheticalOrQuestioning } from '../../../../shared/domain/intentHeuristics.js';
import { parseMovementIntent } from '../../../../shared/domain/movementIntent.js';

// ── TRADE INTENT REGEX ──
//
// Tightened vs. the original: dropped bare `kup`, `sklep`, `sprzedaj`, `handel`
// because they matched too liberally (e.g. "sklepieniem" or stand-alone nouns).
// Only full verb forms remain — the hypothesis guard below strips questions
// and conditional phrasing so "czy potrzebujesz kompanii żeby…" no longer
// slips through even when a keyword appears.
const TRADE_REGEX = /\b(kupuj[eę]?|kupi[eęć]?|zakup(?:uj)?[eęia]?|sprzedaj[eę]?|sprzeda(?:j|ć)?|handluj[eę]?|targuj[eę]?|kupcem|sklepie|buy|sell|haggle|trade|shop|merchant|purchase|barter)\b/iu;

function detectTradeIntent(action) {
  if (!action || typeof action !== 'string') return false;
  if (isHypotheticalOrQuestioning(action)) return false;
  return TRADE_REGEX.test(action);
}

// ── TRAVEL INTENT REGEX ──
// Match "idę do X", "wyruszam do X", "jadę do X", "kieruję się do X",
// "udaję się do X", "travel to X", "go to X", "head to X", "leave for X".
// Two-step parse: (1) locate verb + preposition (case-insensitive),
// (2) capture a proper-noun target after it. Target must start with uppercase
// and continues as long as subsequent words are also capitalized (so
// "Czarnego Lasu" captures both; "Watonga, bo noc" stops at the comma).
// This deliberately rejects "idę do domu" / "idę do lasu" — no capital.
const TRAVEL_VERB_PREP = /\b(?:id[eę]|wchodz[eę]|wyruszam|jad[eę]|kieruj[eę]\s+si[eę]|udaj[eę]\s+si[eę]|podr[oó]żuj[eę]|travel(?:ing)?|go(?:ing)?|head(?:ing)?|leav(?:e|ing)|enter(?:ing)?)\s+(?:do|to|into|for|w\s+stron[eę]|ku)\s+/iu;
const TRAVEL_TARGET = /^([A-ZŻŹĆĄŚĘŁÓŃ][\wąćęłńóśźż-]*(?:\s+[A-ZŻŹĆĄŚĘŁÓŃ][\wąćęłńóśźż-]*){0,3})/u;

export function detectTravelIntent(action) {
  if (!action || typeof action !== 'string') return null;
  const verbMatch = action.match(TRAVEL_VERB_PREP);
  if (!verbMatch) return null;
  const rest = action.slice(verbMatch.index + verbMatch[0].length);
  const targetMatch = rest.match(TRAVEL_TARGET);
  if (!targetMatch) return null;
  const target = targetMatch[1].trim().replace(/[.,;:!?].*$/, '').trim();
  if (!target) return null;
  return { target };
}

// ── DUNGEON NAVIGATION REGEX ──
// Match "idę na północ", "otwieram drzwi na wschód", "schodzę w dół", etc.
// Returns a canonical direction matching WorldLocationEdge.direction values:
// N|S|E|W|up|down. Only fires in dungeon scenes (sceneGenerator gates on
// locationType='dungeon_room').
//
// Deliberately does NOT use \b around Polish diacritic characters — `\b` in
// JS regex ASCII mode treats `ą`/`ę`/`ł`/`ó` as non-word, which breaks
// boundaries mid-token (e.g. `idę\b` won't match because there's no
// word→non-word transition after ę).
const DIRECTION_MAP = [
  { re: /(p[oó]łnoc|\bnorth\b|\bpn\.?\b)/i, dir: 'N' },
  { re: /(po[lł]udni|\bsouth\b|\bpd\.?\b)/i, dir: 'S' },
  { re: /(wsch[oó]d|\beast\b|\bwsch\.?\b)/i, dir: 'E' },
  { re: /(zach[oó]d|\bwest\b|\bzach\.?\b)/i, dir: 'W' },
  { re: /(w\s+g[oó]r[eę]|\bup(?:stairs)?\b|schody\s+w\s+g[oó]r[eę])/i, dir: 'up' },
  { re: /(w\s+d[oó][lł]|\bdown(?:stairs)?\b|schodz[eę]|schody\s+w\s+d[oó][lł])/i, dir: 'down' },
];
const DUNGEON_NAV_VERBS = /(id[eę]|p[oó]jd[eę]|wchodz[eę]|przechodz[eę]|rusz[aą]m|kieruj[eę]|schodz[eę]|wspin[aą]m|otwier[aą]m|\bgo\b|\bhead\b|\bwalk\b|\bclimb\b|\bdescend\b|\benter\b)/i;

export function detectDungeonNavigateIntent(action) {
  if (!action || typeof action !== 'string') return null;
  if (!DUNGEON_NAV_VERBS.test(action)) return null;
  for (const { re, dir } of DIRECTION_MAP) {
    if (re.test(action)) return { direction: dir };
  }
  return null;
}

// ── EMPTY SELECTION (no context needed) ──

export function emptySelection() {
  return {
    expand_npcs: [],
    expand_quests: [],
    expand_location: false,
    expand_codex: [],
    needs_memory_search: false,
    memory_query: null,
    roll_skill: null,
    roll_difficulty: null,
  };
}

/**
 * Try to extract NPC name from trade action text.
 * Patterns: "kupuję od Kowala", "buy from Hans", "u kupca"
 */
function extractTradeNpcHint(action) {
  const patterns = [
    /(?:od|from|u)\s+([A-ZŻŹĆĄŚĘŁÓŃ][a-zżźćąśęłóń]+(?:\s+[A-ZŻŹĆĄŚĘŁÓŃ][a-zżźćąśęłóń]+)?)/u,
    /(?:with|z)\s+([A-ZŻŹĆĄŚĘŁÓŃ][a-zżźćąśęłóń]+(?:\s+[A-ZŻŹĆĄŚĘŁÓŃ][a-zżźćąśęłóń]+)?)/u,
  ];
  for (const re of patterns) {
    const m = action.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Classify intent from structured action markers.
 * Returns a selection result, or null if action is freeform and needs nano model.
 */
export function classifyIntentHeuristic(playerAction, { isFirstScene = false, entityTags = null } = {}) {
  if (isFirstScene) {
    return { ...emptySelection(), _intent: 'first_scene' };
  }

  if (!playerAction || typeof playerAction !== 'string') {
    return { ...emptySelection(), _intent: 'unknown' };
  }

  // [ATTACK: NpcName]
  const attackMatch = playerAction.match(/^\[ATTACK:\s*(.+?)\]$/);
  if (attackMatch) {
    return {
      ...emptySelection(),
      expand_npcs: [attackMatch[1]],
      _intent: 'combat',
    };
  }

  // [INITIATE COMBAT]
  if (playerAction.startsWith('[INITIATE COMBAT]')) {
    return { ...emptySelection(), _intent: 'combat' };
  }

  // [INITIATE BEER DUEL]
  if (playerAction.startsWith('[INITIATE BEER DUEL]')) {
    return { ...emptySelection(), _intent: 'combat', _combatMode: 'beer_duel' };
  }

  // [TALK: NpcName]
  const talkMatch = playerAction.match(/^\[TALK:\s*(.+?)\]$/);
  if (talkMatch) {
    return {
      ...emptySelection(),
      expand_npcs: [talkMatch[1]],
      _intent: 'talk',
    };
  }

  // [Combat resolved:...]
  if (playerAction.startsWith('[Combat resolved:')) {
    return { ...emptySelection(), _intent: 'post_combat' };
  }

  // [WAIT]
  if (playerAction === '[WAIT]') {
    return {
      ...emptySelection(),
      needs_memory_search: true,
      memory_query: 'nearby events and activity',
      _intent: 'wait',
    };
  }

  // [CONTINUE] — aktywne questy są już w "Active Quests" w dynamicSuffix,
  // więc nie ma potrzeby ekspansji ich osobno do contextSection.
  if (playerAction === '[CONTINUE]') {
    return {
      ...emptySelection(),
      _intent: 'continue',
    };
  }

  // [IDLE_WORLD_EVENT...]
  if (playerAction.startsWith('[IDLE_WORLD_EVENT')) {
    return {
      ...emptySelection(),
      needs_memory_search: true,
      memory_query: 'recent world events and rumors',
      _intent: 'idle',
    };
  }

  // Combat intent from freeform text (regex)
  if (detectCombatIntent(playerAction)) {
    return { ...emptySelection(), _intent: 'combat' };
  }

  // Travel intent — "idę do Avaltro", "travel to Watonga". Doesn't short-circuit
  // scene-gen (premium still narrates) but flags the target so sceneGenerator
  // can inject a TRAVEL CONTEXT block (path + waypoints + candidate events).
  const travel = detectTravelIntent(playerAction);
  if (travel) {
    return {
      ...emptySelection(),
      expand_location: true,
      _intent: 'travel',
      _travelTarget: travel.target,
    };
  }

  // F5d Phase 2 — free-vector movement. "1 km na północ", "500 m W". Falls
  // through to scene-gen with `_directionalMove` so buildTravelBlock can
  // resolve (toX, toY) by applying the vector to the player's current
  // position and run the same pathScan as named-target travel.
  const move = parseMovementIntent(playerAction);
  if (move) {
    return {
      ...emptySelection(),
      expand_location: true,
      _intent: 'travel',
      _directionalMove: move,
    };
  }

  // Dungeon navigation — "idę na północ", "otwieram drzwi na wschód".
  // Only relevant when the player is in a dungeon room; sceneGenerator
  // picks up _dungeonDirection and pre-resolves the target room.
  const dungeonNav = detectDungeonNavigateIntent(playerAction);
  if (dungeonNav) {
    return {
      ...emptySelection(),
      _intent: 'dungeon_navigate',
      _dungeonDirection: dungeonNav.direction,
    };
  }

  // Trade intent from freeform text — if ONLY trade intent, skip scene gen
  if (detectTradeIntent(playerAction) && !detectCombatIntent(playerAction)) {
    const npcHint = extractTradeNpcHint(playerAction);
    return {
      ...emptySelection(),
      _intent: 'trade',
      _tradeOnly: true,
      _npcHint: npcHint,
    };
  }

  // Stealth / sneaking — needs location + memory context
  if (/\b(sneak|hide|skulk|crouch|stealth|skradam|chowam|ukrywam|skr[aą]da[ćm])\b/i.test(playerAction)) {
    return { ...emptySelection(), expand_location: true, needs_memory_search: true, memory_query: 'guards and patrols', _intent: 'stealth' };
  }

  // Persuasion / diplomacy — needs NPC context
  if (/\b(persuade|convince|negotiate|charm|bribe|przekonuj|negocjuj|namawiam|łapówk)\b/i.test(playerAction)) {
    const npcMatch = playerAction.match(/\[TALK:([^\]]+)\]/);
    return { ...emptySelection(), expand_npcs: npcMatch ? [npcMatch[1]] : [], _intent: 'persuade' };
  }

  // Search / examine — needs location context
  if (/\b(search|examine|investigate|inspect|look around|szukam|badam|ogl[aą]dam|przeszukuj)\b/i.test(playerAction)) {
    return { ...emptySelection(), expand_location: true, _intent: 'search' };
  }

  // Rest / sleep / wait — minimal context
  if (/\b(rest|sleep|make camp|camp|nap|odpoczywam|[sś]pi[eę]|rozbijam obóz|drzemk)\b/i.test(playerAction)) {
    return { ...emptySelection(), _intent: 'rest' };
  }

  // Entity tags can provide deterministic signals before nano runs
  if (Array.isArray(entityTags) && entityTags.length > 0) {
    const sel = { ...emptySelection() };
    let hasSignal = false;
    for (const tag of entityTags) {
      if (tag.kind === 'spell') {
        sel._intent = 'magic';
        hasSignal = true;
      } else if (tag.kind === 'npc' && tag.name) {
        sel.expand_npcs.push(tag.name);
        hasSignal = true;
      } else if (tag.kind === 'location') {
        sel.expand_location = true;
        hasSignal = true;
      }
    }
    if (hasSignal) {
      sel._intent = sel._intent || 'freeform';
      sel._entityTags = entityTags;
      return sel;
    }
  }

  // Freeform action — needs nano model
  return null;
}
