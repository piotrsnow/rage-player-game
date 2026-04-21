/**
 * Intent Classifier for 2-Stage AI Pipeline.
 *
 * Stage 1: Determines what context the large model needs to generate a scene.
 * - Heuristic layer handles structured markers (~70% of actions)
 * - Nano model handles freeform player text
 *
 * Output: a "selection result" telling assembleContext() which data to expand.
 */

import { config } from '../config.js';
import { childLogger } from '../lib/logger.js';
import { detectCombatIntent } from '../../../shared/domain/combatIntent.js';
import { isHypotheticalOrQuestioning } from '../../../shared/domain/intentHeuristics.js';

const log = childLogger({ module: 'intentClassifier' });

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
const TRAVEL_VERB_PREP = /\b(?:id[eę]|wyruszam|jad[eę]|kieruj[eę]\s+si[eę]|udaj[eę]\s+si[eę]|podr[oó]żuj[eę]|travel(?:ing)?|go(?:ing)?|head(?:ing)?|leav(?:e|ing))\s+(?:do|to|for|w\s+stron[eę]|ku)\s+/iu;
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

function emptySelection() {
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

// ── HEURISTIC INTENT CLASSIFICATION ──

/**
 * Classify intent from structured action markers.
 * Returns a selection result, or null if action is freeform and needs nano model.
 */
export function classifyIntentHeuristic(playerAction, { isFirstScene = false } = {}) {
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
    // Extract NPC name hint if present (simple pattern: "od/from/u [Name]")
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

  // Freeform action — needs nano model
  return null;
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

// ── AVAILABLE DATA SUMMARY BUILDER ──

/**
 * Build a compact summary of available game data for the nano model.
 * Nano uses this to decide what to expand.
 */
export function buildAvailableSummary(coreState, { dbNpcs = [], dbQuests = [], dbCodex = [], prevScene = null } = {}) {
  const parts = [];

  // Current location
  const location = coreState?.world?.currentLocation || 'unknown';
  parts.push(`Location: ${location}`);

  // NPCs — ONLY those at the current location. Classifier doesn't need the
  // full campaign roster; it picks targets relevant to "here and now".
  // Fallback: if none match (e.g. lastLocation missing), show up to 6 alive
  // NPCs so the classifier isn't flying blind on a fresh scene.
  if (dbNpcs.length > 0) {
    const locNorm = String(location || '').toLowerCase().trim();
    const alive = dbNpcs.filter((n) => n.alive !== false);
    const atLocation = locNorm
      ? alive.filter((n) => String(n.lastLocation || '').toLowerCase().trim() === locNorm)
      : [];
    const pool = atLocation.length > 0 ? atLocation : alive.slice(0, 6);
    if (pool.length > 0) {
      const npcList = pool
        .slice(0, 12)
        .map((n) => {
          const role = n.role ? `, ${n.role}` : '';
          return `${n.name} (${n.attitude}${role})`;
        })
        .join('; ');
      parts.push(`NPCs here: ${npcList}`);
    }
  }

  // Quests — scoped: last 3 completed + current + next active.
  // "Current" = first active; "next" = second active (the one waiting in line).
  // Nano doesn't need the full backlog, just the slice relevant to deciding
  // what to expand for this scene.
  if (dbQuests.length > 0) {
    const active = dbQuests.filter((q) => q.status === 'active' || q.status === 'in_progress');
    const completed = dbQuests.filter((q) => q.status === 'completed');
    const lines = [];
    if (completed.length > 0) {
      const recent = completed.slice(-3).map((q) => q.name).join(', ');
      lines.push(`Completed (recent): ${recent}`);
    }
    if (active.length > 0) {
      const current = active[0];
      lines.push(`Current: ${current.name}`);
      if (active.length > 1) {
        lines.push(`Next: ${active[1].name}`);
      }
    }
    if (lines.length > 0) {
      parts.push(`Quests:\n  ${lines.join('\n  ')}`);
    }
  }

  // Codex dropped from classifier — it was a 10-entry catalog bloat. If a
  // scene genuinely needs codex lookup, the scene-gen context block surfaces
  // codex entries via other paths (expand_codex fallback still works via
  // assembleContext, just without classifier pre-selection).

  // Previous scene — excerpt so classifier understands narrative flow.
  // Bumped from 350 → 800 chars: the classifier was losing continuity on
  // discussion-style actions ("powiedz mi więcej…") where the previous
  // scene's framing is the key signal that the player isn't taking a
  // new combat/trade action.
  if (prevScene?.narrative) {
    const excerpt = String(prevScene.narrative).slice(0, 800);
    const sceneTag = prevScene.sceneIndex != null ? `[Scene ${prevScene.sceneIndex}] ` : '';
    const actionTag = prevScene.chosenAction ? `(action: "${String(prevScene.chosenAction).slice(0, 120)}") ` : '';
    parts.push(`Previous scene: ${sceneTag}${actionTag}${excerpt}${prevScene.narrative.length > 800 ? '…' : ''}`);
  }

  return parts.join('\n');
}

// ── NANO MODEL CONTEXT SELECTOR ──

const SKILL_NAMES_FOR_NANO = 'Walka wrecz, Walka bronia jednoręczna, Walka bronia dwureczna, Strzelectwo, Uniki, Zastraszanie, Atletyka, Akrobatyka, Jezdziectwo, Perswazja, Blef, Handel, Przywodztwo, Wystepy, Wiedza ogolna, Wiedza o potworach, Wiedza o naturze, Medycyna, Alchemia, Rzemioslo, Skradanie, Otwieranie zamkow, Kradziez kieszonkowa, Pulapki i mechanizmy, Spostrzegawczosc, Przetrwanie, Tropienie, Odpornosc, Fart, Hazard, Przeczucie';

const BESTIARY_RACES_FOR_NANO = 'ludzie, orkowie, gobliny, nieumarli, zwierzeta, demony, trolle, pajaki, krasnoludy, elfy, niziolki';
const BESTIARY_LOCATIONS_FOR_NANO = 'las, miasto, wioska, gory, bagno, wybrzeze, jaskinia, ruiny, droga, pole';

const NANO_SYSTEM_PROMPT = `You are a context selector for an RPG AI game master.
Given a player action and available game data, decide which data needs to be expanded (fetched in full) for the main AI to generate a good scene response.
Also determine if a skill check (dice roll) is needed and which skill to test.

Only select items that are RELEVANT to the player's action. Do not select everything.
Return ONLY valid JSON matching this schema:
{
  "expand_npcs": ["NPC names from the list"],
  "expand_quests": ["quest names from the list"],
  "expand_location": true/false,
  "expand_codex": ["codex topics from the list"],
  "needs_memory_search": true/false,
  "memory_query": "search query for past events" or null,
  "roll_skill": "skill name for dice check" or null,
  "roll_difficulty": "easy" or "medium" or "hard" or "veryHard" or "extreme" or null,
  "combat_enemies": { "location": string, "budget": number, "maxDifficulty": string, "count": number, "race": string or null } or null,
  "clear_combat": true/false,
  "quest_offer_likely": true/false
}
Available skills: ${SKILL_NAMES_FOR_NANO}

roll_skill rules — MOST actions do NOT need a dice roll. Set roll_skill to null unless the action has REAL risk or uncertainty:
- null: walking, traveling, resting, eating, entering a building, reading, giving orders to allies, routine camp activities, greeting someone, buying at listed price
- null: any action where failure would be boring or not advance the story
- ROLL: persuading/intimidating/lying to someone (Perswazja/Blef/Zastraszanie), haggling for a better price (Handel), sneaking past guards (Skradanie), searching for hidden things (Spostrzegawczosc), picking a lock (Otwieranie zamkow), climbing a dangerous cliff (Atletyka), resisting poison (Odpornosc), tracking footprints (Tropienie)
- The key question: is the outcome genuinely uncertain AND would failure create an interesting situation? If yes → roll. If no → null.
When in doubt, use null.

combat_enemies rules — set when the player is CLEARLY initiating combat (attacking, fighting, provoking a brawl):
- location: infer from current game location. Valid: ${BESTIARY_LOCATIONS_FOR_NANO}. Urban venues (karczma, tawerna, zajazd, dom publiczny, rynek, ulica) → "miasto". Rural settlements → "wioska". Unknown/outdoor → best match.
- budget: encounter threat points (1-2 trivial, 3-4 low, 5-7 medium, 8-12 hard, 13-20 deadly). Scale with context.
- maxDifficulty: cap on individual enemy tier. Valid: trivial, low, medium, high, deadly. Tavern brawl / drunken scuffle → "low". Dragon lair → "deadly".
- count: how many enemies (1-8).
- race: infer from descriptors. ALWAYS set to 'ludzie' when the target is humanoid and nothing indicates otherwise — this includes: osiłek, chłop, gbur, karczmarz, pijak, rycerz, strażnik, bandyta, rozbójnik, najemnik, kultysta, żebrak, łotr, opryszek, cywil, wieśniak. Only set non-human race when explicitly mentioned: goblin/goblins → "gobliny", ork/orki → "orkowie", szkielet/zombie/upiór → "nieumarli", wilk/niedźwiedź/dzik → "zwierzeta", pająk → "pajaki", troll → "trolle", krasnolud → "krasnoludy", elf → "elfy", niziolek → "niziolki", demon/diabeł → "demony". When in doubt between race=null and race='ludzie', choose 'ludzie'. Valid values: ${BESTIARY_RACES_FOR_NANO}.
- Set combat_enemies to null if no combat is intended.

NEGATIVE EXAMPLES — combat_enemies MUST be null when the player discusses, questions, or hypothesizes combat rather than taking the action in-world:
- "powiedz mi więcej jakbym miał walczyć" → null
- "co się stanie jeśli zaatakuję?" → null
- "opowiedz mi o walkach z bandytami" → null
- "boję się ataku" → null
- "jak walczy ten strażnik?" → null
- "czy potrzebujesz kompanii żeby pokonać smoka?" → null (planning/question, not attack)
Only set combat_enemies when the player TAKES the combat action in-world.

clear_combat rules — set to true ONLY when the player action is an UNAMBIGUOUS direct attack on a visible target (e.g. "atakuję bandytę", "bijatyka w karczmie"). This allows skipping the large AI model. Set false when:
- Combat is part of a larger narrative (ambush, negotiations breaking down)
- Unknown threat approaches
- Not sure if target is hostile or friendly
When in doubt, set false.

quest_offer_likely rules — set to true ONLY when the player action reads as actively soliciting paid work, a mission, or a contract from someone in the scene:
- "pytam o pracę / zlecenie / robotę", "szukam zlecenia", "może masz dla mnie zadanie?"
- "ask for a job / task / work / bounty / contract", "any odd jobs?", "looking for work"
- "rozmawiam z karczmarzem o tym co się dzieje w okolicy" only when the player explicitly follows up with a jobs/rumour request.
Set false for: generic conversation, buying, flirting, threatening, idle small-talk, planning. When in doubt, false.`;

/**
 * Call nano model to select which context to expand for a freeform player action.
 */
export async function selectContextWithNano(playerAction, availableSummary, { provider = 'openai', timeoutMs } = {}) {
  const userPrompt = `Player action: "${playerAction}"\n\nAvailable data:\n${availableSummary}`;

  const controller = timeoutMs ? new AbortController() : null;
  const timeoutHandle = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  timeoutHandle?.unref?.();
  const signal = controller?.signal;

  try {
    if (provider === 'anthropic' && config.apiKeys.anthropic) {
      return await callNanoAnthropic(userPrompt, signal);
    }
    if (config.apiKeys.openai) {
      return await callNanoOpenAI(userPrompt, signal);
    }
    // No API keys available
    return fallbackSelection(playerAction);
  } catch (err) {
    if (err?.name === 'AbortError') {
      log.warn({ timeoutMs }, 'Nano context selector timed out, using fallback');
    } else {
      log.warn({ err }, 'Nano context selector failed, using fallback');
    }
    return fallbackSelection(playerAction);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function callNanoOpenAI(userPrompt, signal) {
  const apiKey = config.apiKeys.openai;
  if (!apiKey) throw new Error('No OpenAI API key for nano model');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.aiModels.nano.openai,
      messages: [
        { role: 'system', content: NANO_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 250,
      response_format: { type: 'json_object' },
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nano model API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty nano model response');

  const parsed = JSON.parse(content);
  return normalizeSelection(parsed);
}

async function callNanoAnthropic(userPrompt, signal) {
  const apiKey = config.apiKeys.anthropic;
  if (!apiKey) throw new Error('No Anthropic API key for nano model');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.aiModels.nano.anthropic,
      max_tokens: 250,
      system: NANO_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic nano model API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error('Empty Anthropic nano model response');

  // Extract JSON from response (Haiku may wrap in markdown code blocks)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Anthropic nano response');

  const parsed = JSON.parse(jsonMatch[0]);
  return normalizeSelection(parsed);
}

/**
 * Normalize and validate nano model output.
 */
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'veryHard', 'extreme'];

function normalizeSelection(raw) {
  const result = {
    expand_npcs: Array.isArray(raw.expand_npcs) ? raw.expand_npcs.filter(n => typeof n === 'string') : [],
    expand_quests: Array.isArray(raw.expand_quests) ? raw.expand_quests.filter(n => typeof n === 'string') : [],
    expand_location: raw.expand_location === true,
    expand_codex: Array.isArray(raw.expand_codex) ? raw.expand_codex.filter(n => typeof n === 'string') : [],
    needs_memory_search: raw.needs_memory_search === true,
    memory_query: typeof raw.memory_query === 'string' ? raw.memory_query : null,
    roll_skill: typeof raw.roll_skill === 'string' ? raw.roll_skill : null,
    roll_difficulty: VALID_DIFFICULTIES.includes(raw.roll_difficulty) ? raw.roll_difficulty : null,
    combat_enemies: null,
    clear_combat: false,
    quest_offer_likely: false,
  };

  // Validate combat_enemies
  if (raw.combat_enemies && typeof raw.combat_enemies === 'object') {
    result.combat_enemies = {
      location: typeof raw.combat_enemies.location === 'string' ? raw.combat_enemies.location : null,
      budget: typeof raw.combat_enemies.budget === 'number' ? raw.combat_enemies.budget : 4,
      maxDifficulty: typeof raw.combat_enemies.maxDifficulty === 'string' ? raw.combat_enemies.maxDifficulty : 'low',
      count: typeof raw.combat_enemies.count === 'number' ? Math.min(8, Math.max(1, raw.combat_enemies.count)) : 1,
      race: typeof raw.combat_enemies.race === 'string' ? raw.combat_enemies.race : null,
    };
  }
  result.clear_combat = raw.clear_combat === true;
  result.quest_offer_likely = raw.quest_offer_likely === true;

  return result;
}

/**
 * Safe fallback when nano model is unavailable.
 * Expands location + does a memory search on the action text.
 */
function fallbackSelection(playerAction) {
  return {
    expand_npcs: [],
    expand_quests: [],
    expand_location: true,
    expand_codex: [],
    needs_memory_search: true,
    memory_query: playerAction,
    roll_skill: null,
    roll_difficulty: null,
  };
}

// ── MAIN ENTRY POINT ──

/**
 * Classify intent and determine what context to expand.
 *
 * @param {string} playerAction - The player's action text
 * @param {object} coreState - Campaign core state
 * @param {object} availableData - { dbNpcs, dbQuests, dbCodex }
 * @param {object} options - { isFirstScene, provider }
 * @returns {Promise<object>} Selection result for assembleContext()
 */
export async function classifyIntent(playerAction, coreState, availableData, options = {}) {
  // 1. Try heuristics first (zero latency)
  const heuristicResult = classifyIntentHeuristic(playerAction, options);
  if (heuristicResult !== null) {
    return heuristicResult;
  }

  // 2. Freeform action — call nano model
  const availableSummary = buildAvailableSummary(coreState, availableData);
  const nanoResult = await selectContextWithNano(playerAction, availableSummary, {
    provider: options.provider || 'openai',
    timeoutMs: options.timeoutMs,
  });

  return { ...nanoResult, _intent: 'freeform' };
}
