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

// ── COMBAT INTENT REGEX (extracted from sceneGenerator.js) ──

const COMBAT_REGEX = /\b(atak|walcz|bijat|zabij|uderzam|rzucam się|wyzywam|attack|fight|strike|kill|charge|challenge|initiate combat|hit him|hit her|stab|slash)\b/i;

function detectCombatIntent(action) {
  if (!action || typeof action !== 'string') return false;
  return COMBAT_REGEX.test(action);
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
export function classifyIntentHeuristic(playerAction, { dialogue = null, isFirstScene = false } = {}) {
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
      _intent: 'dialogue',
    };
  }

  // [INITIATE DIALOGUE: NpcName, ...]
  const dialogueInitMatch = playerAction.match(/^\[INITIATE DIALOGUE:\s*(.+?)\]$/);
  if (dialogueInitMatch) {
    const names = dialogueInitMatch[1].split(',').map(n => n.trim()).filter(Boolean);
    return {
      ...emptySelection(),
      expand_npcs: names,
      _intent: 'dialogue',
    };
  }

  // Active dialogue round — NPC context already loaded
  if (dialogue?.active) {
    return { ...emptySelection(), _intent: 'dialogue_round' };
  }

  // [Combat resolved:...]
  if (playerAction.startsWith('[Combat resolved:')) {
    return { ...emptySelection(), _intent: 'post_combat' };
  }

  // [Dialogue ended:...]
  if (playerAction.startsWith('[Dialogue ended:')) {
    return { ...emptySelection(), _intent: 'post_dialogue' };
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

  // [CONTINUE]
  if (playerAction === '[CONTINUE]') {
    return {
      ...emptySelection(),
      expand_quests: ['__all_active__'],
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

  // Freeform action — needs nano model
  return null;
}

// ── AVAILABLE DATA SUMMARY BUILDER ──

/**
 * Build a compact summary of available game data for the nano model.
 * Nano uses this to decide what to expand.
 */
export function buildAvailableSummary(coreState, { dbNpcs = [], dbQuests = [], dbCodex = [] } = {}) {
  const parts = [];

  // Current location
  const location = coreState?.world?.currentLocation || 'unknown';
  parts.push(`Location: ${location}`);

  // NPCs — name (role, attitude)
  if (dbNpcs.length > 0) {
    const npcList = dbNpcs
      .filter(n => n.alive !== false)
      .slice(0, 20)
      .map(n => {
        const role = n.role ? `, ${n.role}` : '';
        return `${n.name} (${n.attitude}${role})`;
      })
      .join('; ');
    parts.push(`NPCs: ${npcList}`);
  }

  // Quests — name (status)
  if (dbQuests.length > 0) {
    const questList = dbQuests
      .slice(0, 10)
      .map(q => `${q.name} (${q.status})`)
      .join('; ');
    parts.push(`Quests: ${questList}`);
  }

  // Codex — name (category)
  if (dbCodex.length > 0) {
    const codexList = dbCodex
      .slice(0, 10)
      .map(c => `${c.name} (${c.category})`)
      .join('; ');
    parts.push(`Codex: ${codexList}`);
  }

  return parts.join('\n');
}

// ── NANO MODEL CONTEXT SELECTOR ──

const SKILL_NAMES_FOR_NANO = 'Walka wrecz, Walka bronia jednoręczna, Walka bronia dwureczna, Strzelectwo, Uniki, Zastraszanie, Atletyka, Akrobatyka, Jezdziectwo, Perswazja, Blef, Handel, Przywodztwo, Wystepy, Wiedza ogolna, Wiedza o potworach, Wiedza o naturze, Medycyna, Alchemia, Rzemioslo, Skradanie, Otwieranie zamkow, Kradziez kieszonkowa, Pulapki i mechanizmy, Spostrzegawczosc, Przetrwanie, Tropienie, Odpornosc, Fart, Hazard, Przeczucie';

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
  "roll_difficulty": "easy" or "medium" or "hard" or "veryHard" or "extreme" or null
}
Available skills: ${SKILL_NAMES_FOR_NANO}

roll_skill rules — MOST actions do NOT need a dice roll. Set roll_skill to null unless the action has REAL risk or uncertainty:
- null: walking, traveling, resting, eating, entering a building, reading, giving orders to allies, routine camp activities, greeting someone, buying at listed price
- null: any action where failure would be boring or not advance the story
- ROLL: persuading/intimidating/lying to someone (Perswazja/Blef/Zastraszanie), haggling for a better price (Handel), sneaking past guards (Skradanie), searching for hidden things (Spostrzegawczosc), picking a lock (Otwieranie zamkow), climbing a dangerous cliff (Atletyka), resisting poison (Odpornosc), tracking footprints (Tropienie)
- The key question: is the outcome genuinely uncertain AND would failure create an interesting situation? If yes → roll. If no → null.
When in doubt, use null.`;

/**
 * Call nano model to select which context to expand for a freeform player action.
 */
export async function selectContextWithNano(playerAction, availableSummary, { provider = 'openai' } = {}) {
  const userPrompt = `Player action: "${playerAction}"\n\nAvailable data:\n${availableSummary}`;

  try {
    if (provider === 'anthropic' && config.apiKeys.anthropic) {
      return await callNanoAnthropic(userPrompt);
    }
    if (config.apiKeys.openai) {
      return await callNanoOpenAI(userPrompt);
    }
    // No API keys available
    return fallbackSelection(playerAction);
  } catch (err) {
    console.warn('Nano context selector failed, using fallback:', err.message);
    return fallbackSelection(playerAction);
  }
}

async function callNanoOpenAI(userPrompt) {
  const apiKey = config.apiKeys.openai;
  if (!apiKey) throw new Error('No OpenAI API key for nano model');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-nano',
      messages: [
        { role: 'system', content: NANO_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 150,
      response_format: { type: 'json_object' },
    }),
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

async function callNanoAnthropic(userPrompt) {
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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: NANO_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
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
  return {
    expand_npcs: Array.isArray(raw.expand_npcs) ? raw.expand_npcs.filter(n => typeof n === 'string') : [],
    expand_quests: Array.isArray(raw.expand_quests) ? raw.expand_quests.filter(n => typeof n === 'string') : [],
    expand_location: raw.expand_location === true,
    expand_codex: Array.isArray(raw.expand_codex) ? raw.expand_codex.filter(n => typeof n === 'string') : [],
    needs_memory_search: raw.needs_memory_search === true,
    memory_query: typeof raw.memory_query === 'string' ? raw.memory_query : null,
    roll_skill: typeof raw.roll_skill === 'string' ? raw.roll_skill : null,
    roll_difficulty: VALID_DIFFICULTIES.includes(raw.roll_difficulty) ? raw.roll_difficulty : null,
  };
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
 * @param {object} options - { dialogue, isFirstScene, provider }
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
  });

  return { ...nanoResult, _intent: 'freeform' };
}
