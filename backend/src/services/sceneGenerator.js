import { prisma } from '../lib/prisma.js';
import { requireServerApiKey } from './apiKeyService.js';
import { parseProviderError, toClientAiError, AIServiceError } from './aiErrors.js';
import {
  assembleContext,
} from './aiContextTools.js';
import { classifyIntent } from './intentClassifier.js';
import { compressSceneToSummary, generateLocationSummary, checkQuestObjectives } from './memoryCompressor.js';
import {
  embedText,
  buildSceneEmbeddingText,
  buildKnowledgeEmbeddingText,
  buildNPCEmbeddingText,
  buildCodexEmbeddingText,
} from './embeddingService.js';
import { writeEmbedding } from './vectorSearchService.js';
import {
  findClosestBestiaryEntry, selectBestiaryEncounter,
  applyAttributeVariance, DIFFICULTY_VARIANCE, rollEnemyRarity,
  BESTIARY_RACES, BESTIARY_LOCATIONS, getBestiaryLocationSummary,
} from '../data/equipment/index.js';

const BESTIARY_RACES_STR = BESTIARY_RACES.join(', ');
const BESTIARY_LOCATIONS_STR = BESTIARY_LOCATIONS.join(', ');
import {
  resolveBackendDiceRoll,
  resolveBackendDiceRollWithPreRoll,
  generatePreRolls,
  CREATIVITY_BONUS_MAX,
  SKILL_BY_NAME,
  DIFFICULTY_THRESHOLDS,
  getSkillLevel,
  clamp,
} from './diceResolver.js';
import { resolveAndApplyRewards } from './rewardResolver.js';
import {
  applyCharacterStateChanges,
  characterToPrismaUpdate,
  deserializeCharacterRow,
} from './characterMutations.js';

// ── Fill enemy stats from bestiary (shared helper, used in both pipeline paths) ──

function fillEnemiesFromBestiary(stateChanges) {
  if (!stateChanges) return;
  const cu = stateChanges.combatUpdate;
  if (!cu) return;

  // Path A: enemyHints → backend selects from bestiary pool
  if (cu.enemyHints && (!cu.enemies || cu.enemies.length === 0)) {
    cu.enemies = selectBestiaryEncounter(cu.enemyHints);
  }

  // Path B: enemies with names → name matching + stat fill
  if (cu.enemies?.length) {
    cu.enemies = cu.enemies.map((enemy) => {
      if (enemy.attributes && enemy.maxWounds) return enemy; // already filled (e.g. from selectBestiaryEncounter)
      const match = findClosestBestiaryEntry(enemy.name);
      if (!match) return enemy;
      const variance = match.variance ?? DIFFICULTY_VARIANCE[match.difficulty] ?? 1;
      const attrs = applyAttributeVariance(match.attributes, variance);
      return {
        name: enemy.name,
        attributes: attrs,
        wounds: match.maxWounds,
        maxWounds: match.maxWounds,
        skills: match.skills,
        traits: match.traits,
        armourDR: match.armourDR,
        weapons: match.weapons,
        weaponRarity: rollEnemyRarity(match.difficulty),
        armourRarity: rollEnemyRarity(match.difficulty),
      };
    });
  }
}

// ── Combat fast-path helpers ──

/**
 * Try to find which NPC the player is attacking (for disposition guard).
 * Simple name extraction from action text.
 */
async function findCombatTargetNpc(playerAction, dbNpcs) {
  if (!playerAction || !dbNpcs?.length) return null;
  const actionLower = playerAction.toLowerCase();
  // Check each alive NPC — if their name appears in the action text
  for (const npc of dbNpcs) {
    if (npc.alive === false) continue;
    if (actionLower.includes(npc.name.toLowerCase())) return npc;
  }
  return null;
}

/**
 * Generate a short narrative (2-3 sentences) using a standard/nano model.
 * Used for combat fast-path and disposition warnings.
 */
async function generateShortNarrative(instruction, playerAction, provider = 'openai') {
  let apiKey;
  try {
    apiKey = requireServerApiKey(provider === 'anthropic' ? 'anthropic' : 'openai');
  } catch { return instruction; }

  try {
    if (provider === 'anthropic') {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: `${instruction}\n\nAkcja gracza: "${playerAction}"\n\nOdpowiedz TYLKO narracją, bez JSON.` }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.content?.[0]?.text || instruction;
      }
    } else {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [{ role: 'user', content: `${instruction}\n\nAkcja gracza: "${playerAction}"\n\nOdpowiedz TYLKO narracją, bez JSON.` }],
          max_tokens: 200,
          temperature: 0.8,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.choices?.[0]?.message?.content || instruction;
      }
    }
  } catch (e) {
    console.warn('generateShortNarrative failed:', e.message);
  }
  return instruction;
}

// ── Skill XP calculation (deterministic, mirrors shared/domain logic) ──
const DIFFICULTY_SKILL_XP = {
  easy:     { success: 4,  failure: 2  },
  medium:   { success: 8,  failure: 4  },
  hard:     { success: 14, failure: 7  },
  veryHard: { success: 20, failure: 10 },
  extreme:  { success: 28, failure: 14 },
};

/**
 * Convert AI's skillsUsed + actionDifficulty into deterministic skillProgress XP.
 * Called after scene generation, before returning result to frontend.
 * diceRolls: resolved dice rolls array (nano + model), used for roll-based XP.
 */
function calculateFreeformSkillXP(stateChanges, hasExternalDiceRoll, diceRolls) {
  if (!stateChanges) return;
  const skillsUsed = stateChanges.skillsUsed;
  const difficulty = stateChanges.actionDifficulty;

  // If we have resolved diceRolls → give XP per roll (success/failure aware)
  if (Array.isArray(diceRolls) && diceRolls.length > 0) {
    stateChanges.skillProgress = {};
    const rolledSkills = new Set();
    for (const roll of diceRolls) {
      if (!roll?.skill) continue;
      const entry = DIFFICULTY_SKILL_XP[roll.difficulty] || DIFFICULTY_SKILL_XP.medium;
      stateChanges.skillProgress[roll.skill] = roll.success ? entry.success : entry.failure;
      rolledSkills.add(roll.skill);
    }
    // skillsUsed XP only for non-rolled skills
    if (Array.isArray(skillsUsed)) {
      for (const skill of skillsUsed.slice(0, 3)) {
        if (typeof skill === 'string' && skill.trim() && !rolledSkills.has(skill.trim())) {
          const entry = DIFFICULTY_SKILL_XP[difficulty] || DIFFICULTY_SKILL_XP.medium;
          stateChanges.skillProgress[skill.trim()] = entry.success;
        }
      }
    }
  } else if (Array.isArray(skillsUsed) && skillsUsed.length > 0 && !hasExternalDiceRoll) {
    // Freeform: no dice roll, give XP based on skillsUsed
    const entry = DIFFICULTY_SKILL_XP[difficulty] || DIFFICULTY_SKILL_XP.medium;
    const xp = entry.success;
    stateChanges.skillProgress = {};
    for (const skill of skillsUsed.slice(0, 3)) {
      if (typeof skill === 'string' && skill.trim()) {
        stateChanges.skillProgress[skill.trim()] = xp;
      }
    }
  }

  // Clean up AI metadata fields (not part of game state)
  delete stateChanges.skillsUsed;
  delete stateChanges.actionDifficulty;
}

// --- DM Settings label helpers ---

function difficultyLabel(val) {
  return val < 25 ? 'Easy' : val < 50 ? 'Normal' : val < 75 ? 'Hard' : 'Expert';
}

function narrativeLabel(val) {
  return val < 25 ? 'Predictable' : val < 50 ? 'Balanced' : val < 75 ? 'Chaotic' : 'Wild';
}

function responseLengthLabel(val) {
  return val < 33 ? 'short (2-3 sentences)' : val < 66 ? 'medium (1-2 paragraphs)' : 'long (3+ paragraphs)';
}

function sliderLabel(val, labels) {
  return val < 25 ? labels[0] : val < 50 ? labels[1] : val < 75 ? labels[2] : labels[3];
}

function formatMoney(money) {
  if (!money) return '0 CP';
  const parts = [];
  if (money.gold) parts.push(`${money.gold} GC`);
  if (money.silver) parts.push(`${money.silver} SS`);
  if (money.copper) parts.push(`${money.copper} CP`);
  return parts.join(' ') || '0 CP';
}

/**
 * Encje, które `buildLeanSystemPrompt` umieści w "Key NPCs", "Active Quests"
 * i "ALREADY DISCOVERED" w dynamicSuffix. Używane przez `assembleContext`,
 * żeby pominąć je w EXPANDED CONTEXT i nie dublować tych samych danych.
 *
 * MUSI być zsynchronizowane z slice'ami w buildLeanSystemPrompt poniżej:
 * NPCs: alive ≠ false, sort po |disposition|, slice(0, 8)
 * Quests: quests.active.slice(0, 5)
 * Codex: world.codexSummary.slice(0, 10)
 */
function getInlineEntityKeys(coreState) {
  const world = coreState?.world || {};
  const quests = coreState?.quests || {};

  const allNpcs = Array.isArray(world.npcs) ? world.npcs : [];
  const npcs = allNpcs
    .filter(n => n && n.alive !== false)
    .sort((a, b) => Math.abs(b.disposition || 0) - Math.abs(a.disposition || 0))
    .slice(0, 8)
    .map(n => n.name)
    .filter(Boolean);

  const activeQuests = Array.isArray(quests.active) ? quests.active : [];
  const questNames = activeQuests
    .slice(0, 5)
    .map(q => q.name)
    .filter(Boolean);

  const codexSummary = Array.isArray(world.codexSummary) ? world.codexSummary : [];
  const codexNames = codexSummary
    .slice(0, 10)
    .map(c => c.name)
    .filter(Boolean);

  return { npcs, quests: questNames, codex: codexNames };
}

/**
 * Build a lean system prompt from the campaign's core state and recent scenes.
 * Includes compressed game rules — AI dynamically fetches additional context via tools.
 */
function buildLeanSystemPrompt(coreState, recentScenes, language = 'pl', {
  dmSettings = {},
  needsSystemEnabled = false,
  characterNeeds = null,
  sceneCount = 0,
  skipToolProtocol = false,
} = {}) {
  const cs = coreState;
  const campaign = cs.campaign || {};
  const character = cs.character || {};
  const world = cs.world || {};
  const quests = cs.quests || {};

  // ═══════════════════════════════════════════════════════════════
  // STATIC SECTIONS — identical across scenes within a session.
  // Placed FIRST so both Anthropic (explicit cache_control) and
  // OpenAI (automatic prefix caching) can cache this prefix.
  // ═══════════════════════════════════════════════════════════════
  const staticSections = [];

  // ── CORE GAME RULES (compressed) ──
  staticSections.push(
    `CORE RULES:
- Dice/skill checks: may be engine-resolved (see user prompt) or self-resolved using pre-rolled d50 values.
- If engine-resolved: narrate the provided result. DO NOT recalculate.
- If pre-rolled d50 values are available and action has genuine risk: pick the correct skill, find its level from PC Skills above, find its linked attribute value from PC Attributes above. Calculate total = base + attribute_value + skill_level. Compare vs difficulty threshold. If luckySuccess → auto-success.
- Skill→Attribute lookup: find the skill name in PC Skills (e.g. Skradanie:4 → skill_level=4). Linked attribute:
  SIL: Walka wrecz, Walka bronia jednoręczna, Walka bronia dwureczna, Zastraszanie, Atletyka
  ZRC: Strzelectwo, Uniki, Akrobatyka, Jezdziectwo, Skradanie, Otwieranie zamkow, Kradziez kieszonkowa, Pulapki i mechanizmy
  CHA: Perswazja, Blef, Handel, Przywodztwo, Wystepy
  INT: Wiedza ogolna, Wiedza o potworach, Wiedza o naturze, Medycyna, Alchemia, Rzemioslo, Spostrzegawczosc, Tropienie
  WYT: Przetrwanie, Odpornosc
  SZC: Fart, Hazard, Przeczucie
  Read attribute value from PC Attributes (e.g. ZRC:13 → attr=13). If skill not in PC Skills → skill_level=0.
- Include results in TOP-LEVEL diceRolls array (max 3): [{skill, difficulty, success}]. Backend calculates full details. diceRolls is NOT nested in stateChanges.
- Margin scaling: lucky success=fortunate twist, margin 15+=decisive success, margin 0-14=success (low margin may add complication), margin -1 to -14=failure with opportunity, margin≤-15=hard fail+consequence.
- Consequences: risky actions generate reputation/disposition/resource/wound/rumor consequences. Criminal acts accumulate heat (guards, bounties, higher prices).
- NPC disposition: engine calculates bonuses. Reflect attitude in narration (≥15=friendly, ≤-15=hostile). Trust builds slow, breaks fast.
- Currency: 1GC=10SS=100CP. stateChanges.moneyChange for purchase costs (negative deltas). For income/loot use stateChanges.rewards with type:'money'. Engine validates affordability.
- Award 20-50 XP/scene via stateChanges.xp.
- The world is grim and perilous. Death is real. Consequences are lasting.
- creativityBonus (TOP-LEVEL, integer 0-10): nagroda za KREATYWNOŚĆ gracza w opisie własnej akcji. Stosuje się WYŁĄCZNIE gdy gracz wpisał własną akcję (player_input_kind=custom). Dla wybranych z listy (suggested) lub auto-graczy (auto) ZAWSZE 0. Skala: 0=brak/banalna, 1-3=lekka inwencja (konkretny szczegół, użycie środowiska), 4-6=sprytne podejście (sprytna taktyka, nieoczywiste rozwiązanie), 7-9=wybitna pomysłowość (zaskakujące połączenie, błyskotliwy plan), 10=mistrzostwo (genialne, niespodziewane rozegranie). Nie nagradzaj długich opisów bez treści — liczy się jakość pomysłu, nie ilość słów. Bonus dodaje się DO wyniku skill checka (zwiększa total, może zmienić failure→success). Jeśli scena nie ma skill checka, pole i tak emituj ale nie zmieni nic mechanicznie.`,
  );

  // ── SCENE PACING ──
  staticSections.push(
    `SCENE PACING — return "scenePacing" in every response. Match prose to type:
combat: staccato, 1-2 para | chase: breathless, fragments | stealth: sparse, tense
exploration: atmospheric, 2-3 para | dialogue: minimal narration, NPCs drive scene
travel_montage: 2-3 sentences, skip to arrival | rest: slow, 1-2 para
celebration: lively, sensory | dramatic: theatrical, tension | dream: surreal, symbolic
Max 2 consecutive exploration/travel/rest without a complication. Travel without interaction → travel_montage.`,
  );

  // ── NARRATIVE RULES ──
  staticSections.push(
    `NARRATIVE RULES:
- Vary density by scene type. Action=short/punchy. Exploration=concrete senses. Dialogue=character voice.
- Avoid: stacked adjectives, abstract feelings, uniform NPC voice, tax-collector clichés.
- Each NPC has a unique speech pattern (phrases, vocabulary, rhythm). Identify speaker from dialogue alone.
- NPCs present MUST speak in direct dialogue segments, never just described indirectly.
- Humor never deflates real stakes. Even at high humor: failures hurt mechanically.
- Keep narration ~25% shorter than default. Cut filler, repeated atmosphere, redundant transitions.`,
  );

  // ── DIALOGUE FORMAT ──
  staticSections.push(
    `DIALOGUE FORMAT:
dialogueSegments: [{type:"narration",text:""}, {type:"dialogue",character:"NPC Name",gender:"male"|"female",text:""}]
dialogueSegments is the SOLE source of scene prose. Narration segments hold all descriptive text; dialogue segments hold spoken lines. Never embed quoted speech in narration — always split into dialogue segments. Every dialogue segment needs "gender" field. Use consistent NPC names.`,
  );

  // ── SUGGESTED ACTIONS ──
  staticSections.push(
    `SUGGESTED ACTIONS:
Return exactly 3 suggestedActions in PC voice (1st person, e.g. ${language === 'pl' ? '"Oglądam drzwi"' : '"I examine the door"'}). At least 2 grounded + up to 1 chaotic/humorous. Exactly 1 must be direct speech (${language === 'pl' ? '"Mówię: \\"...\\""' : '"I say: \\"...\\"."'}). Reference concrete scene NPCs/objects/locations by name. Never use vague filler. Never repeat recent actions.${language === 'pl' ? ' CRITICAL: All suggestedActions must be in Polish. NEVER use English "I say:", "I ask", "I tell". Use "Mówię:", "Pytam:", "Krzyczę:". Do NOT prefix with "I".' : ''}`,
  );

  // ── STATE CHANGES RULES ──
  // Always include needsChanges line for stable cache key (~20 extra tokens when disabled)
  staticSections.push(
    `MANDATORY stateChanges RULES:
- timeAdvance: ALWAYS include {hoursElapsed: decimal}. Quick=0.25, action/combat=0.5, exploration=0.75-1, rest=2-4, sleep=6-8.
- questUpdates: after writing dialogueSegments, cross-check ALL active quest objectives. Mark completed ones: [{questId, objectiveId, completed:true}].
- Quest completion: ONLY add to completedQuests when ALL objectives done AND player talked to turn-in NPC in this scene. Never auto-complete.
- rewards: for standard loot/drops/found items/money. Array of [{type, rarity?, category?, quantity?, context?}]. type: 'material'|'weapon'|'armour'|'shield'|'gear'|'medical'|'money'|'potion'. rarity: 'common'|'uncommon'|'rare' (optional — engine picks if omitted). category: materials only ('metal'|'wood'|'fabric'|'herb'|'liquid'|'misc'). quantity: 'one'|'few'|'some'|'many'. context: 'loot'|'quest_reward'|'found'|'gift'. Engine resolves into concrete items. Do NOT specify item names — just type and tier. Examples: [{type:'weapon',rarity:'uncommon',context:'loot'}], [{type:'material',category:'herb',quantity:'few',context:'found'}], [{type:'money',context:'quest_reward'}].
- newItems: ONLY for unique quest/story items not in catalogs (quest MacGuffins, keys, letters, named artifacts). Include {id,name,type,description,rarity}. For weapons/armor quest rewards: name MUST match get_equipment_catalog.
- removeItems: only items in character's inventory.
- moneyChange: {gold,silver,copper} NEGATIVE deltas for purchases only. Engine validates affordability. For income/loot use rewards with type:'money'.
- npcs: {action:"introduce"|"update", name, gender, role, personality, attitude, location, dispositionChange, factionId, relationships:[{npcName,type}]}. dispositionChange scales with margin: lucky/great success +3-5, success +1-2, failure -1-2, hard failure -3-5.
- combatUpdate: {active:true, enemyHints:{location,budget,maxDifficulty,count,race}, reason}. PREFERRED: use enemyHints and let the engine select enemies from the bestiary. budget=threat points (1-2 trivial, 3-4 low, 5-7 medium, 8-12 hard, 13-20 deadly). maxDifficulty=cap on individual enemy tier. race=optional filter (${BESTIARY_RACES_STR}). Fallback: {active:true, enemies:[{name}], reason} with exact bestiary names.
- pendingThreat: {race,budget,maxDifficulty,count,description}. Use when building tension ("something approaches") without starting combat yet. Backend stores this and uses it when combat actually triggers.
- dialogueUpdate: {active:true, npcs:[{name, attitude, goal}], reason}. Include when 2+ NPC structured dialogue starts.
- codexUpdates: [{id, name, category, fragment:{content,source,aspect}, tags}] when player learns lore.
- knowledgeUpdates: {events:[{summary, importance, tags}], decisions:[{choice, consequence}]} for key story moments.
- journalEntries: 1-3 concise summaries of important events only.
- currentLocation: update when player moves.
- factionChanges: {faction_id: delta} when actions affect a faction. IDs: merchants_guild, thieves_guild, temple_sigmar, temple_morr, military, noble_houses, chaos_cults, witch_hunters, wizards_college, peasant_folk.
- worldFacts: strings of new information for world state.
- woundsChange: delta (negative=damage, positive=healing).
- manaChange: delta for mana (negative when casting). spellUsage: {"spellName": 1}.
- skillsUsed: ["SkillName"] — skills the PC used in this action. Pick from known RPG skills. Max 3.
- actionDifficulty: "easy"|"medium"|"hard"|"veryHard"|"extreme" — estimated difficulty of the PC's action.
- diceRolls (TOP-LEVEL field, not nested here): [{skill, difficulty, success}] — self-resolved skill checks using pre-rolled d50 (see user prompt). Max 3. Only include if pre-rolled values were provided and action has genuine risk.
- needsChanges: DELTAS when character eats/drinks/rests/bathes/toilets. {hunger,thirst,bladder,hygiene,rest}. Only apply if needs system is active (see dynamic state below).
- campaignEnd: {status:"completed"|"failed", epilogue:"2-3 para"} — only for definitive campaign conclusions.`,
  );

  // ── ACTION FEASIBILITY ──
  staticSections.push(
    `ACTION RULES:
- Impossible (target not present): narrate failure. Trivial (unlocked door, walking): auto-success.
- Routine (eating, resting, looking): auto-success, apply needsChanges if needs system active.
- Uncertain: engine resolves checks. Narrate the result from user prompt.
- Item validation: character can ONLY use items in their Inventory. Fail if item not possessed.
- Item/money acquisition: if dialogueSegments say character gains anything, stateChanges MUST match. No exceptions.`,
  );

  // ── CODEX RULES ──
  staticSections.push(
    `CODEX RULES:
- Each NPC reveals ONE fragment per interaction. Never dump lore — drip-feed it.
- Aspect depends on NPC role: scholars/wizards→history/technical/political, peasants→rumor (may be inaccurate), soldiers/guards→location/weakness, merchants→technical/description, nobles→political/history.
- Some knowledge (especially weaknesses) requires the RIGHT source NPC — not everyone knows everything.
- The "ALREADY DISCOVERED" section below lists what the player has previously uncovered. Do NOT repeat known aspects — reveal NEW information only.
- Call get_codex_entry() to check full fragment details before adding codexUpdates to existing entries.
- Use relatedEntries to link connected codex items (weapon→creator, place→faction, etc.).
- Max 10 fragments per entry.`,
  );

  // ── MANDATORY TOOL PROTOCOL (skipped in 2-stage pipeline) ──
  if (!skipToolProtocol) {
    staticSections.push(
      `MANDATORY TOOL PROTOCOL:
MUST call before generating the scene:
1. Combat start → prefer enemyHints in combatUpdate (engine selects from bestiary). Use get_bestiary() only if you need to review available enemies.
2. First visit at new location → get_location_history()
3. Player references past events (not in Recent History) → search_campaign_memory()
4. Player asks about lore/artifacts → get_codex_entry()
5. Adding codexUpdates to existing entry → get_codex_entry() to check existing fragments
6. Item reward or loot with weapons/armor → get_equipment_catalog()
SHOULD call when beneficial:
7. Extended NPC dialogue (3+ rounds) → get_npc_details() for personality/speech patterns
8. Quest-related scenes → get_quest_details() for full objective details
DO NOT call tools for:
- Basic narration without NPC interaction
- Actions in current location (use inline discoveries above)
- NPCs already listed in "Key NPCs" section below
IMPORTANT: Weapon/armor names in combatUpdate.enemies and stateChanges.newItems (quest items only) MUST exactly match names from get_equipment_catalog. For standard loot use stateChanges.rewards instead.`,
    );

    // ── PRE-FLIGHT CHECKLIST ──
    staticSections.push(
      `BEFORE GENERATING RESPONSE, check:
- Am I at a new location? → call get_location_history()
- Is an NPC speaking that I have no details for? → call get_npc_details()
- Does the player reference old events not in Recent History? → call search_campaign_memory()
- Is combat starting? → use enemyHints in combatUpdate (preferred) or get_bestiary() to review
- Am I adding codexUpdates for an existing entry? → call get_codex_entry() first`,
    );
  }

  // ── RESPONSE FORMAT ──
  // FIELD ORDER MATTERS for streaming UX:
  // 1. diceRolls first — frontend detects rolls early and starts dice animation
  //    in parallel with the rest of the response.
  // 2. dialogueSegments next — scene prose starts streaming immediately, so the
  //    typewriter / TTS can begin before the model finishes the rest of the JSON.
  // 3. stateChanges LAST — the backend applies state changes only after the
  //    `complete` event (parseAIResponse → resolveAndApplyRewards →
  //    applyCharacterStateChanges → Prisma write), so nothing downstream benefits
  //    from having them mid-stream. Emitting them last also improves quality:
  //    the model rolls mechanics AFTER it has written the prose, so rewards /
  //    journal / questUpdates stay consistent with what was actually narrated.
  staticSections.push(
    `RESPONSE: Return ONLY valid JSON. EMIT FIELDS IN THIS EXACT ORDER:
{
  "creativityBonus": 0,
  "diceRolls": [{"skill":"","difficulty":"","success":true}],
  "dialogueSegments": [{"type":"narration|dialogue","text":"","character":"","gender":"male|female"}],
  "scenePacing": "exploration|combat|chase|stealth|dialogue|travel_montage|celebration|rest|dramatic|dream|cutscene",
  "suggestedActions": ["exactly 3 actions"],
  "atmosphere": {"weather":"clear|rain|snow|storm|fog|fire","particles":"none|magic_dust|sparks|embers|arcane","mood":"peaceful|tense|dark|mystical|chaotic","lighting":"natural|night|dawn|bright|rays|candlelight|moonlight","transition":"dissolve|fade|arcane_wipe"},
  "imagePrompt": "short ENGLISH scene description for image gen (max 200 chars)",
  "soundEffect": "short English sound description or null",
  "musicPrompt": "instruments, tempo, mood (max 200 chars) or null",
  "questOffers": [],
  "cutscene": null,
  "dilemma": null,
  "stateChanges": {timeAdvance:{hoursElapsed:0.5}, npcs:[], journalEntries:[], currentLocation:"", ...}
}
diceRolls is a TOP-LEVEL field, NOT nested inside stateChanges. Emit it FIRST so the frontend can start the dice animation in parallel.
dialogueSegments comes SECOND so scene prose streams to the player immediately — write it BEFORE stateChanges, not after.
stateChanges MUST be the LAST field. Fill it out AFTER you have written the full dialogueSegments, cross-checking rewards / journalEntries / questUpdates / newItems / moneyChange against what actually happens in the prose. Never emit stateChanges before the narrative prose is complete.
There is NO separate "narrative" field — all scene prose lives in dialogueSegments. Do not emit narrative.
${language === 'pl' ? 'Write ALL dialogueSegments text, suggestedActions, quest text in Polish. Only imagePrompt/soundEffect/musicPrompt in English.' : 'Write all text in English.'}`,
  );

  // ═══════════════════════════════════════════════════════════════
  // DYNAMIC SECTIONS — change per scene (character, world, quests).
  // Placed AFTER static prefix so caching works.
  // ═══════════════════════════════════════════════════════════════
  const dynamicSections = [];

  // ── CAMPAIGN & DM SETTINGS ──
  const poeticism = sliderLabel(dmSettings.narratorPoeticism ?? 50, ['dry', 'moderate', 'poetic', 'lyrical']);
  const grittiness = sliderLabel(dmSettings.narratorGrittiness ?? 30, ['lighthearted', 'grounded', 'gritty', 'brutal']);
  const detail = sliderLabel(dmSettings.narratorDetail ?? 50, ['minimal', 'balanced', 'rich', 'lavish']);
  const humor = sliderLabel(dmSettings.narratorHumor ?? 20, ['serious', 'dry wit', 'frequent humor', 'comedic']);
  const drama = sliderLabel(dmSettings.narratorDrama ?? 50, ['understated', 'measured', 'heightened', 'theatrical']);

  dynamicSections.push(
    `You are the Game Master for "${campaign.name || 'Unnamed'}", an RPGon custom RPG.
System: d50 + attribute (1-25) + skill (0-25) + momentum (±10) vs difficulty threshold (20/35/50/65/80). Szczescie gives X% auto-success. Mana for spells (1-5 cost). 9 spell trees with progression.
Genre: ${campaign.genre || 'Fantasy'} | Tone: ${campaign.tone || 'Dark'} | Style: ${campaign.style || 'Hybrid'}
Difficulty: ${difficultyLabel(dmSettings.difficulty ?? 50)} | Narrative chaos: ${narrativeLabel(dmSettings.narrativeStyle ?? 50)}
Response length: ${responseLengthLabel(dmSettings.responseLength ?? 50)}
Narrator voice: poeticism=${poeticism}, grittiness=${grittiness}, detail=${detail}, humor=${humor}, drama=${drama}
${dmSettings.narratorCustomInstructions ? `Extra narrator instructions: ${dmSettings.narratorCustomInstructions}` : ''}
World: ${campaign.worldDescription || 'A dark fantasy world.'}
${campaign.hook ? `Hook: ${campaign.hook}` : ''}`,
  );

  // ── CHARACTER STATE ──
  const charLines = [`PC: ${character.name || 'Unknown'} (${character.species || 'Human'})`];
  if (character.attributes) {
    const a = character.attributes;
    charLines.push(`Attributes: SIL:${a.sila||0} INT:${a.inteligencja||0} CHA:${a.charyzma||0} ZRC:${a.zrecznosc||0} WYT:${a.wytrzymalosc||0} SZC:${a.szczescie||0}`);
  }
  const mana = character.mana || { current: 0, max: 0 };
  charLines.push(`Wounds: ${character.wounds ?? 0}/${character.maxWounds ?? 0} | Mana: ${mana.current}/${mana.max}`);
  charLines.push(`Level: ${character.characterLevel || 1}`);
  if (character.skills && Object.keys(character.skills).length > 0) {
    const skillEntries = Object.entries(character.skills)
      .filter(([, v]) => (typeof v === 'object' ? v.level : v) > 0)
      .map(([k, v]) => `${k}:${typeof v === 'object' ? v.level : v}`);
    if (skillEntries.length) charLines.push(`Skills: ${skillEntries.join(', ')}`);
  }
  if (character.spells?.known?.length) {
    charLines.push(`Known spells: ${character.spells.known.join(', ')}`);
  }
  if (character.inventory?.length) {
    charLines.push(`Inventory: ${character.inventory.map((i) => typeof i === 'string' ? i : `${i.name} (${i.type})`).join(', ')}`);
  }
  charLines.push(`Money: ${formatMoney(character.money)}`);
  if (character.statuses?.length) charLines.push(`Statuses: ${character.statuses.join(', ')}`);
  dynamicSections.push(charLines.join('\n'));

  // ── WORLD STATE ──
  const worldLines = [];
  if (world.currentLocation) worldLines.push(`Location: ${world.currentLocation}`);
  if (world.timeState) {
    const ts = world.timeState;
    const h = Math.floor(ts.hour ?? 6);
    const m = Math.round(((ts.hour ?? 6) - h) * 60);
    worldLines.push(`Time: Day ${ts.day || 1}, ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} (${ts.timeOfDay || 'morning'}), Season: ${ts.season || 'unknown'}`);
  }
  if (world.factions && typeof world.factions === 'object') {
    const factionEntries = Object.entries(world.factions);
    if (factionEntries.length > 0) {
      worldLines.push(`Factions: ${factionEntries.map(([id, rep]) => `${id}(${rep})`).join(', ')}`);
    }
  }
  // NPCs at current location (brief)
  const npcs = world.npcs || [];
  const currentLoc = world.currentLocation || '';
  const npcsHere = npcs.filter(n => n.alive !== false && n.lastLocation && currentLoc && n.lastLocation.toLowerCase() === currentLoc.toLowerCase());
  if (npcsHere.length > 0) {
    worldLines.push(`NPCs here: ${npcsHere.map(n => `${n.name} (${n.role || '?'}, ${n.attitude || 'neutral'}, dsp:${n.disposition || 0})`).join(', ')}`);
  }
  if (worldLines.length) dynamicSections.push(worldLines.join('\n'));

  // ── KNOWN NPC SUMMARY (top NPCs by disposition magnitude) ──
  if (npcs.length > 0) {
    const knownNpcs = npcs
      .filter(n => n.alive !== false)
      .sort((a, b) => Math.abs(b.disposition || 0) - Math.abs(a.disposition || 0))
      .slice(0, 8);
    if (knownNpcs.length > 0) {
      const npcLines = ['Key NPCs (disposition):'];
      for (const n of knownNpcs) {
        npcLines.push(`- ${n.name} (${n.attitude || 'neutral'}, dsp:${n.disposition || 0}) — ${n.role || '?'}${n.lastLocation ? ', ' + n.lastLocation : ''}`);
      }
      dynamicSections.push(npcLines.join('\n'));
    }
  }

  // ── KEY PLOT FACTS ──
  const keyPlotFacts = world.keyPlotFacts || [];
  if (keyPlotFacts.length > 0) {
    dynamicSections.push(`Key plot facts:\n${keyPlotFacts.map(f => `- ${f}`).join('\n')}`);
  }

  // ── CODEX SUMMARY (already discovered by player) ──
  const codexSummary = world.codexSummary || [];
  if (codexSummary.length > 0) {
    const codexLines = [`ALREADY DISCOVERED BY PLAYER (DO NOT REPEAT — reveal NEW aspects only):`];
    codexLines.push(`${codexSummary.length} entries total.`);
    for (const entry of codexSummary.slice(0, 10)) {
      let line = `- ${entry.name} [${entry.category}]: known = ${entry.knownAspects.join(', ') || 'none'}`;
      if (entry.canReveal.length > 0) {
        line += ` → can still reveal: ${entry.canReveal.join(', ')}`;
      } else {
        line += ' → fully known';
      }
      codexLines.push(line);
    }
    dynamicSections.push(codexLines.join('\n'));
  }

  // ── NEEDS SYSTEM ──
  if (needsSystemEnabled && characterNeeds) {
    const needNames = ['hunger', 'thirst', 'bladder', 'hygiene', 'rest'];
    const critNeeds = needNames.filter(k => (characterNeeds[k] ?? 100) < 10);
    if (critNeeds.length > 0) {
      const critLines = critNeeds.map(k => `${k}: ${characterNeeds[k] ?? 0}/100 CRITICAL`);
      dynamicSections.push(`NEEDS CRISIS: ${critLines.join(', ')}
Narrate crisis effects (weakness, funny walk, stench, drowsiness). Apply -10 to related tests. At least 1 suggestedAction must address the most urgent need.`);
    } else {
      dynamicSections.push('Needs system active. All needs OK (>=10). Use stateChanges.needsChanges DELTAS when character eats/drinks/rests/bathes/toilets. Typical: meal +50-70 hunger, drink +40-60 thirst, sleep at inn→all 100.');
    }
  }

  // ── ACTIVE QUESTS ──
  if (quests.active?.length) {
    const questLines = ['Active Quests:'];
    for (const q of quests.active.slice(0, 5)) {
      let line = `- ${q.name} [${q.type || 'side'}]: ${q.description || ''}`;
      if (q.completionCondition) line += ` | Goal: ${q.completionCondition}`;
      if (q.questGiverId) line += ` | Giver: ${q.questGiverId}`;
      const turnIn = q.turnInNpcId || q.questGiverId;
      if (turnIn && turnIn !== q.questGiverId) line += ` | Turn in: ${turnIn}`;
      if (q.objectives?.length) {
        const allDone = q.objectives.every(o => o.completed);
        for (const obj of q.objectives) {
          line += `\n  [${obj.completed ? 'X' : ' '}] ${obj.description}`;
        }
        if (allDone) line += '\n  ALL DONE — ready to turn in';
      }
      questLines.push(line);
    }
    dynamicSections.push(questLines.join('\n'));
  }

  // ── RECENT CONTEXT ──
  // Prefer compressed gameStateSummary (nano-generated facts) over full scenes
  const gameStateSummary = cs.gameStateSummary;
  if (gameStateSummary?.length > 0) {
    dynamicSections.push(`Recent Story Facts:\n${gameStateSummary.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
    // Still include last scene for immediate context
    if (recentScenes.length > 0) {
      const last = recentScenes[recentScenes.length - 1];
      const action = last.chosenAction ? `Player: ${last.chosenAction}\n` : '';
      const narrative = (last.narrative || '').length > 300
        ? last.narrative.slice(0, 300) + '...'
        : last.narrative;
      dynamicSections.push(`Last Scene:\n[Scene ${last.sceneIndex}] ${action}${narrative}`);
    }
  } else if (recentScenes.length > 0) {
    // Fallback: full recent scenes (before compression is populated)
    const sceneLines = ['Recent History:'];
    for (const scene of recentScenes) {
      const action = scene.chosenAction ? `Player: ${scene.chosenAction}\n` : '';
      const narrative = (scene.narrative || '').length > 500
        ? scene.narrative.slice(0, 500) + '...'
        : scene.narrative;
      sceneLines.push(`[Scene ${scene.sceneIndex}] ${action}${narrative}`);
    }
    dynamicSections.push(sceneLines.join('\n\n'));
  }

  const staticPrefix = staticSections.join('\n\n');
  const dynamicSuffix = dynamicSections.join('\n\n');
  return { staticPrefix, dynamicSuffix, combined: staticPrefix + '\n\n' + dynamicSuffix };
}

/**
 * Convert split prompt parts into Anthropic system blocks with cache_control.
 * Static prefix gets cached (ephemeral, 5-min TTL); dynamic suffix is fresh per request.
 */
function buildAnthropicSystemBlocks(staticPrefix, dynamicSuffix) {
  const blocks = [
    { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
  ];
  if (dynamicSuffix) {
    blocks.push({ type: 'text', text: dynamicSuffix });
  }
  return blocks;
}

// ── USER PROMPT BUILDER ──

function buildPreRollInstructions() {
  return `To resolve a non-lucky check:
1. Pick skill name from PC Skills (e.g. Skradanie:4 → skill_level=4). If not in list → skill_level=0.
2. Find linked attribute from PC Attributes (see mapping in CORE RULES, e.g. Skradanie→ZRC:13 → attr=13).
3. total = base + attr + skill_level
4. Compare vs threshold: easy=20, medium=35, hard=50, veryHard=65, extreme=80
5. margin = total - threshold. success = margin >= 0.
LUCKY SUCCESS rolls: skip all calculation, auto-success. Narrate fortunate twist.
IMPORTANT: Calculate result FIRST, then narrate accordingly. Do not narrate success if the roll fails.
Include in TOP-LEVEL diceRolls field (NOT nested in stateChanges): [{skill, difficulty, success}]. Use only as many rolls as genuinely needed.`;
}

/**
 * Resolve model-initiated dice rolls using pre-rolled values.
 * Model returns only {skill, difficulty, success} — backend calculates full result.
 * If model's narrated outcome disagrees with mechanical result, nudge d50 to reconcile.
 */
/**
 * Aplikuje creativity bonus przyznany przez large model do dice rolla in-place.
 * Modyfikuje total/margin/success/creativityBonus tak, żeby bonus nie został
 * "podwójnie naliczony" — jeśli roll już ma jakiś bonus, zastępujemy go nową
 * wartością i przeliczamy total od podstaw.
 */
function applyCreativityToRoll(roll, bonus) {
  if (!roll || typeof roll !== 'object') return;
  const clamped = Math.max(0, Math.min(CREATIVITY_BONUS_MAX, Math.floor(Number(bonus) || 0)));
  if (clamped === 0 && (roll.creativityBonus || 0) === 0) return;

  const previous = roll.creativityBonus || 0;
  roll.creativityBonus = clamped;
  roll.total = (roll.total || 0) - previous + clamped;
  if (typeof roll.threshold === 'number') {
    roll.margin = roll.total - roll.threshold;
    roll.success = roll.luckySuccess === true || roll.margin >= 0;
  }
}

/**
 * Decyduje, czy gracz w ogóle kwalifikuje się do creativity bonus.
 * Bonus tylko dla własnoręcznie wpisanych akcji — nigdy dla clicked
 * suggestedActions ani trybów automatycznych ([CONTINUE], [WAIT], itp).
 */
function isCreativityEligible(playerAction, { isCustomAction, fromAutoPlayer } = {}) {
  if (!isCustomAction) return false;
  if (fromAutoPlayer) return false;
  if (typeof playerAction !== 'string') return false;
  // Wszystkie tagi systemowe ([CONTINUE], [WAIT], [INITIATE DIALOGUE: ...],
  // [Combat resolved: ...], itp.) traktujemy jako nie-kreatywne.
  if (playerAction.startsWith('[')) return false;
  return true;
}

function resolveModelDiceRolls(sceneResult, character, preRolls) {
  // Schema reorder: diceRolls is TOP-LEVEL. Fall back to legacy stateChanges.diceRolls
  // for any in-flight responses where the model still nests it (best-effort).
  const modelRolls = Array.isArray(sceneResult.diceRolls) && sceneResult.diceRolls.length > 0
    ? sceneResult.diceRolls
    : sceneResult.stateChanges?.diceRolls;
  if (!Array.isArray(modelRolls) || modelRolls.length === 0) return;

  const resolved = [];
  for (let i = 0; i < Math.min(modelRolls.length, 3); i++) {
    const { skill, difficulty, success: modelSaysSuccess } = modelRolls[i] || {};
    const preRoll = preRolls[i];
    if (!skill || !preRoll) continue;

    const roll = resolveBackendDiceRollWithPreRoll(
      character, skill, difficulty || 'medium',
      preRoll.d50, preRoll.luckySuccess,
    );
    if (!roll) continue;

    // Reconcile: if model's narrated outcome disagrees with mechanical result
    if (typeof modelSaysSuccess === 'boolean' && modelSaysSuccess !== roll.success && !roll.luckySuccess) {
      const skillDef = SKILL_BY_NAME[skill];
      if (skillDef) {
        const attr = character.attributes[skillDef.attribute] || 0;
        const skillLvl = getSkillLevel(character, skill);
        const momentum = clamp(character.momentumBonus || 0, -10, 10);
        const threshold = DIFFICULTY_THRESHOLDS[difficulty] || DIFFICULTY_THRESHOLDS.medium;

        if (modelSaysSuccess && !roll.success) {
          // Model narrated success but roll failed → nudge to barely pass (margin 0 to +3)
          const nudge = Math.floor(Math.random() * 4);
          const neededD50 = threshold - attr - skillLvl - momentum + nudge;
          roll.roll = clamp(neededD50, 1, 50);
        } else if (!modelSaysSuccess && roll.success) {
          // Model narrated failure but roll succeeded → nudge to barely fail (margin -1 to -4)
          const nudge = -(Math.floor(Math.random() * 4) + 1);
          const neededD50 = threshold - attr - skillLvl - momentum + nudge;
          roll.roll = clamp(neededD50, 1, 50);
        }
        // Recalculate with nudged d50
        roll.total = roll.roll + attr + skillLvl + momentum;
        roll.margin = roll.total - threshold;
        roll.success = roll.margin >= 0;
      }
    }

    resolved.push(roll);
  }

  // Replace model's minimal rolls with fully resolved ones
  if (resolved.length > 0) {
    sceneResult.diceRolls = resolved;
  } else {
    sceneResult.diceRolls = undefined;
  }
  // Clean up legacy nested location if model still emitted it there
  if (sceneResult.stateChanges?.diceRolls) {
    delete sceneResult.stateChanges.diceRolls;
  }
}

function detectCombatIntent(action) {
  if (!action || typeof action !== 'string') return false;
  return /\b(atak|walcz|bijat|zabij|uderzam|rzucam się|wyzywam|attack|fight|strike|kill|charge|challenge|initiate combat|hit him|hit her|stab|slash)\b/i.test(action);
}

function buildUserPrompt(playerAction, {
  resolvedMechanics = null,
  dialogue = null,
  dialogueCooldown = 0,
  isFirstScene = false,
  needsSystemEnabled = false,
  characterNeeds = null,
  language = 'pl',
  preRolls = null,
  sceneCount = 0,
  creativityEligible = false,
} = {}) {
  if (isFirstScene) {
    return `Generate the opening scene. Set the stage with an atmospheric description. Introduce the setting, hint at adventure hooks, and include at least one NPC who speaks in direct dialogue. This is scene 1 — keep it concise (1-2 short paragraphs).
Include stateChanges: timeAdvance, currentLocation, npcs (introduce at least 1), journalEntries.`;
  }

  const parts = [];

  // Creativity bonus eligibility — backend wymusza creativityBonus=0 dla
  // not-eligible akcji niezależnie od tego co model zwróci, ale informujemy
  // też model żeby nie marnował tokenów na bonus który zostanie wyzerowany.
  parts.push(creativityEligible
    ? 'player_input_kind=custom — gracz wpisał WŁASNĄ akcję. Oceń kreatywność i zwróć creativityBonus 0-10 zgodnie z regułami w CORE RULES.'
    : 'player_input_kind=suggested_or_auto — gracz NIE wpisał własnej akcji (clicked suggested / autoplayer / akcja systemowa). creativityBonus MUSI być 0.');

  // Needs crisis reminder
  if (needsSystemEnabled && characterNeeds) {
    const critNeeds = ['hunger','thirst','bladder','hygiene','rest'].filter(k => (characterNeeds[k] ?? 100) < 10);
    if (critNeeds.length > 0) {
      parts.push(`⚠ NEEDS CRISIS: ${critNeeds.join(', ')} critically low. Narrate effects. At least 1 suggestedAction must address the most urgent need.`);
    }
  }

  // Special action types
  const isIdleWorldEvent = playerAction?.startsWith('[IDLE_WORLD_EVENT');
  const isContinue = playerAction === '[CONTINUE]';
  const isWait = playerAction === '[WAIT]';
  const isPostCombat = playerAction?.startsWith('[Combat resolved:');
  const isSurrender = isPostCombat && playerAction.includes('surrendered');
  const isTruce = isPostCombat && playerAction.includes('forced a truce');
  const isPostCombatDefeat = isPostCombat && (playerAction.includes('LOST') || playerAction.includes('did NOT win'));
  const isPostDialogue = playerAction?.startsWith('[Dialogue ended:');
  const isDialogueActive = dialogue?.active;
  const isDialogueInitiation = playerAction?.startsWith('[INITIATE DIALOGUE');
  const isGeneralCombatInitiation = playerAction?.startsWith('[INITIATE COMBAT]');
  const attackNpcMatch = playerAction?.match(/^\[ATTACK:\s*(.+?)\]$/);
  const talkNpcMatch = playerAction?.match(/^\[TALK:\s*(.+?)\]$/);

  // Action block
  if (isIdleWorldEvent) {
    parts.push(`IDLE WORLD EVENT — no player action. Something happens in the world: atmospheric event, NPC activity, overheard rumor, or foreshadowing. Keep SHORT (1-2 para). No combat. Minimal stateChanges. timeAdvance 0.25-0.5h.`);
  } else if (isWait) {
    parts.push(`PLAYER WAITS — passive observation. Do not narrate player initiative. Something develops: NPCs act, news arrives, opportunity/threat emerges. Include modest timeAdvance.`);
  } else if (isContinue) {
    parts.push(`PLAYER CONTINUES — advance the plot without specific player action. Push the scene forward, introduce next beat.`);
  } else if (isPostCombat) {
    parts.push(`${playerAction}\n\nPOST-COMBAT: Narrate aftermath. Do NOT include combatUpdate. Describe battlefield, wounds, loot. No new combat this scene.`);
    if (isPostCombatDefeat) {
      parts.push(`DEFEAT: Player LOST. Narrate consequences — capture, rescue, item loss, humiliation. Never frame as victory.`);
    }
    if (isSurrender) {
      parts.push(`SURRENDER: Player yielded. Enemies are in control. Consequences MANDATORY: imprisonment, item confiscation, money loss, reputation damage, or new obligation. Guards→arrest, Bandits→rob, Intelligent→capture/ransom.`);
    }
    if (isTruce) {
      parts.push(`TRUCE: Player forced ceasefire from strength. Enemies concede. Player keeps belongings. Narrate enemies backing off. Player is dominant — suggest: interrogate, loot fallen, press advantage.`);
    }
  } else if (isPostDialogue) {
    parts.push(`${playerAction}\n\nPOST-DIALOGUE: Return to normal narration. Reflect conversation outcome. Do NOT include dialogueUpdate.`);
  } else {
    // Extract action vs speech
    const speechMatch = playerAction?.match(/(?:mówię|mówi|say|tell|shout|speak|krzyczę)[:\s]*["""](.+?)["""]/i)
      || playerAction?.match(/["""](.+?)["""]/);
    if (speechMatch) {
      const speechText = speechMatch[1];
      const actionText = playerAction.replace(speechMatch[0], '').trim();
      parts.push(`Player ACTION: ${actionText || playerAction}`);
      parts.push(`Player SPEECH (include as dialogue segment with PC name): "${speechText}"`);
    } else {
      parts.push(`Player action: ${playerAction}`);
    }
  }

  // Dialogue mode
  if (isDialogueActive) {
    const npcGoals = (dialogue.npcs || []).map(n => `${n.name} (${n.attitude}): ${n.goal || 'conversation'}`).join(', ');
    parts.push(`DIALOGUE MODE — Round ${dialogue.round}/${dialogue.maxRounds}. NPCs: ${npcGoals}
Narrator SILENT — only NPCs speak. All dialogueSegments must be type "dialogue". suggestedActions = in-character PC speech lines.${dialogue.round >= dialogue.maxRounds ? ' LAST ROUND — wrap up, include dialogueUpdate:{active:false}.' : ''}`);
  } else if (isDialogueInitiation) {
    const npcListMatch = playerAction.match(/\[INITIATE DIALOGUE:\s*(.+?)\]/);
    parts.push(`INITIATE DIALOGUE MODE with ${npcListMatch ? npcListMatch[1] : 'nearby NPCs'}. Include dialogueUpdate:{active:true, npcs:[{name,attitude,goal}]}.`);
  } else if (talkNpcMatch) {
    parts.push(`Player wants to talk to "${talkNpcMatch[1]}". If 2+ NPCs available, consider dialogueUpdate. Otherwise narrate conversation normally.`);
  } else if (dialogueCooldown > 0 && !isPostCombat) {
    // silently skip dialogue intent
  }

  // Combat intent
  if (!isPostCombat && !isIdleWorldEvent && !isWait) {
    if (isGeneralCombatInitiation) {
      parts.push(`COMBAT INITIATED. MUST include combatUpdate. PREFERRED: use enemyHints {location, budget, maxDifficulty, count, race} — engine selects from bestiary. Available races: ${BESTIARY_RACES_STR}. Available locations: ${BESTIARY_LOCATIONS_STR}.`);
    } else if (attackNpcMatch) {
      parts.push(`PLAYER ATTACKS "${attackNpcMatch[1]}". MUST include combatUpdate. Use enemyHints with appropriate budget/maxDifficulty/count. If tension should build first, use pendingThreat instead.`);
    } else if (detectCombatIntent(playerAction)) {
      parts.push(`COMBAT INTENT DETECTED. MUST include combatUpdate with enemyHints {location, budget, maxDifficulty, count}. Available races: ${BESTIARY_RACES_STR}.`);
    }
  }

  // Resolved mechanics + pre-rolled dice
  if (resolvedMechanics?.diceRoll) {
    const r = resolvedMechanics.diceRoll;
    const outcomeLabel = r.luckySuccess ? 'LUCKY SUCCESS' : r.success ? (r.margin >= 15 ? 'GREAT SUCCESS' : 'SUCCESS') : (r.margin <= -15 ? 'HARD FAILURE' : 'FAILURE');
    parts.push(`SKILL CHECK (engine-resolved, DO NOT recalculate):
Skill: ${r.skill || '?'} (${r.attribute || '?'}) | d50=${r.roll} + attr=${r.attributeValue || 0} + skill=${r.skillLevel || 0} + momentum=${r.momentumBonus || 0} + creativity=${r.creativityBonus || 0} = ${r.total || r.roll} vs ${r.threshold || r.target} | Margin: ${r.margin ?? r.sl ?? 0} | Result: ${outcomeLabel}
Narrate consistently: ${r.success ? 'the action SUCCEEDS' : 'the action FAILS'}. Scale intensity with margin.`);

    // Remaining pre-rolls for additional sub-actions
    if (preRolls && preRolls.length > 1) {
      const extraRolls = preRolls.slice(1);
      const rollLines = extraRolls.map((pr, i) => {
        if (pr.luckySuccess) return `  Roll ${i + 2}: LUCKY SUCCESS — auto-success, narrate fortunate twist. No calculation needed.`;
        return `  Roll ${i + 2}: base=${pr.base} (d50=${pr.d50}+momentum=${pr.momentum}). Add attribute + skill_level, compare vs threshold.`;
      });
      parts.push(`If the action involves ADDITIONAL sub-actions needing separate checks (max ${extraRolls.length} more):
${rollLines.join('\n')}
Each ADDITIONAL roll MUST be on a DIFFERENT skill than the engine-resolved one (${r.skill}). Never roll twice for the same skill in one scene — collapse multiple uses of ${r.skill} into the resolved check above.
${buildPreRollInstructions()}`);
    }
  } else if (!isPostCombat && !isIdleWorldEvent) {
    // No engine-resolved roll — provide all pre-rolls for model to use
    if (preRolls && preRolls.length > 0) {
      const rollLines = preRolls.map((pr, i) => {
        if (pr.luckySuccess) return `  Roll ${i + 1}: LUCKY SUCCESS — auto-success, narrate fortunate twist. No calculation needed.`;
        return `  Roll ${i + 1}: base=${pr.base} (d50=${pr.d50}+momentum=${pr.momentum}). Add attribute + skill_level, compare vs threshold.`;
      });
      parts.push(`No skill check was pre-resolved.
If you determine this action requires skill checks (genuine risk/uncertainty), use IN ORDER:
${rollLines.join('\n')}
${buildPreRollInstructions()}`);
    } else {
      parts.push('No skill check for this action.');
    }
  }

  // Dilemma opportunity
  if (sceneCount > 0 && sceneCount % 7 === 0) {
    parts.push('Consider presenting a moral dilemma if the narrative supports it — include "dilemma" field with 2-4 choices.');
  }

  return parts.join('\n\n');
}

// ── CONTEXT SECTION BUILDER (for 2-stage pipeline) ──

/**
 * Format pre-fetched context blocks into a prompt section.
 */
function buildContextSection(contextBlocks) {
  if (!contextBlocks) return '';

  const parts = [];

  // NPCs
  for (const [name, data] of Object.entries(contextBlocks.npcs || {})) {
    if (data && !data.startsWith('No NPC found')) {
      parts.push(`[NPC: ${name}]\n${data}`);
    }
  }

  // Quests
  for (const [name, data] of Object.entries(contextBlocks.quests || {})) {
    if (data && !data.startsWith('No quest found')) {
      parts.push(`[Quest: ${name}]\n${data}`);
    }
  }

  // Location
  if (contextBlocks.location && !contextBlocks.location.startsWith('No location found')) {
    parts.push(`[Location]\n${contextBlocks.location}`);
  }

  // Codex
  for (const [topic, data] of Object.entries(contextBlocks.codex || {})) {
    if (data && !data.startsWith('No codex entry')) {
      parts.push(`[Codex: ${topic}]\n${data}`);
    }
  }

  // Memory search results
  if (contextBlocks.memory && !contextBlocks.memory.startsWith('No relevant')) {
    parts.push(`[Campaign Memory]\n${contextBlocks.memory}`);
  }

  if (parts.length === 0) return '';
  return `\n── EXPANDED CONTEXT (use in your response) ──\n${parts.join('\n\n')}`;
}

/**
 * Run the 2-stage pipeline with streaming.
 */
// ── STREAMING AI CALLERS ──

/**
 * Call OpenAI with streaming enabled. Yields text chunks via callback.
 * Returns the full accumulated text.
 */
async function callOpenAIStreaming(messages, { model, temperature = 0.8, maxTokens = 4096 } = {}, onChunk) {
  const apiKey = requireServerApiKey('openai', 'OpenAI');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-5.4',
      messages,
      temperature,
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
      stream: true,
    }),
  });

  if (!response.ok) {
    await parseProviderError(response, 'openai');
  }

  let accumulated = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          if (onChunk) onChunk(delta);
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  return accumulated;
}

/**
 * Call Anthropic with streaming enabled. Yields text chunks via callback.
 * Returns the full accumulated text.
 */
async function callAnthropicStreaming(messages, { model, temperature = 0.8, maxTokens = 4096, system = null } = {}, onChunk) {
  const apiKey = requireServerApiKey('anthropic', 'Anthropic');

  const body = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages,
    temperature,
    stream: true,
  };
  if (system) body.system = system;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await parseProviderError(response, 'anthropic');
  }

  let accumulated = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          accumulated += parsed.delta.text;
          if (onChunk) onChunk(parsed.delta.text);
        }
        // Log cache metrics from the final message_delta event
        if (parsed.type === 'message_delta' && parsed.usage) {
          const u = parsed.usage;
          if (u.cache_read_input_tokens > 0 || u.cache_creation_input_tokens > 0) {
            console.log(`[anthropic-stream] Cache: read=${u.cache_read_input_tokens || 0} created=${u.cache_creation_input_tokens || 0}`);
          }
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  return accumulated;
}

/**
 * Run the 2-stage pipeline with streaming. Returns parsed scene via callback events.
 */
async function runTwoStagePipelineStreaming(systemPromptParts, userPrompt, contextBlocks, { provider = 'openai', model } = {}, onChunk) {
  const contextSection = buildContextSection(contextBlocks);
  const dynamicFull = (systemPromptParts.dynamicSuffix || '') + (contextSection || '');

  let fullText;
  if (provider === 'openai') {
    // OpenAI: flat string — automatic prefix caching kicks in when static prefix is stable
    const combinedPrompt = systemPromptParts.staticPrefix + '\n\n' + dynamicFull;
    fullText = await callOpenAIStreaming(
      [
        { role: 'system', content: combinedPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model },
      onChunk,
    );
  } else {
    // Anthropic: array of system blocks with cache_control on static prefix
    const systemBlocks = buildAnthropicSystemBlocks(systemPromptParts.staticPrefix, dynamicFull);
    fullText = await callAnthropicStreaming(
      [{ role: 'user', content: userPrompt }],
      { system: systemBlocks, model },
      onChunk,
    );
  }

  return parseAIResponse(fullText);
}

/**
 * Generate a scene with SSE streaming. Emits events via the onEvent callback.
 * Events: { type: 'intent', data }, { type: 'context_ready' }, { type: 'chunk', text }, { type: 'complete', data }, { type: 'error', error }
 */
export async function generateSceneStream(campaignId, playerAction, options = {}, onEvent) {
  const {
    provider = 'openai',
    model,
    language = 'pl',
    dmSettings = {},
    resolvedMechanics: resolvedMechanicsOpt = null,
    needsSystemEnabled = false,
    characterNeeds = null,
    dialogue = null,
    dialogueCooldown = 0,
    isFirstScene = false,
    sceneCount = 0,
    isCustomAction = false,
    fromAutoPlayer = false,
  } = options;
  let resolvedMechanics = resolvedMechanicsOpt;
  const creativityEligible = isCreativityEligible(playerAction, { isCustomAction, fromAutoPlayer });

  try {
    // 1. Load campaign data (same as generateScene)
    const [campaign, dbNpcs, dbQuests, dbCodex, dbKnowledge] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { coreState: true, characterIds: true },
      }),
      prisma.campaignNPC.findMany({ where: { campaignId } }),
      prisma.campaignQuest.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } }),
      prisma.campaignCodex.findMany({
        where: { campaignId },
        select: { codexKey: true, name: true, category: true, fragments: true },
        orderBy: { updatedAt: 'desc' },
        take: 15,
      }),
      prisma.campaignKnowledge.findMany({
        where: { campaignId, importance: { in: ['high', 'critical'] } },
        select: { summary: true, importance: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    if (!campaign) throw new Error('Campaign not found');
    const coreState = JSON.parse(campaign.coreState);

    // Load the active player character from the Character collection.
    // Single-player → characterIds[0]. Multiplayer is currently routed through
    // a different flow (multiplayerAI), so for the SP scene generator we always
    // use the first character ID.
    const characterIds = Array.isArray(campaign.characterIds) ? campaign.characterIds : [];
    const activeCharacterId = characterIds[0] || null;
    let activeCharacter = null;
    if (activeCharacterId) {
      const row = await prisma.character.findUnique({ where: { id: activeCharacterId } });
      if (row) {
        activeCharacter = deserializeCharacterRow(row);
        coreState.character = activeCharacter;
      }
    }

    if (dbNpcs.length > 0) {
      if (!coreState.world) coreState.world = {};
      coreState.world.npcs = dbNpcs.map((n) => ({
        name: n.name, gender: n.gender, role: n.role,
        personality: n.personality, attitude: n.attitude, disposition: n.disposition,
        alive: n.alive, lastLocation: n.lastLocation, factionId: n.factionId,
        notes: n.notes, relationships: JSON.parse(n.relationships || '[]'),
      }));
    }

    if (dbQuests.length > 0) {
      const active = [];
      const completed = [];
      for (const q of dbQuests) {
        const quest = {
          id: q.questId, name: q.name, type: q.type, description: q.description,
          completionCondition: q.completionCondition, questGiverId: q.questGiverId,
          turnInNpcId: q.turnInNpcId, locationId: q.locationId,
          prerequisiteQuestIds: JSON.parse(q.prerequisiteQuestIds || '[]'),
          objectives: JSON.parse(q.objectives || '[]'),
          reward: q.reward ? JSON.parse(q.reward) : null,
        };
        if (q.status === 'completed') completed.push({ ...quest, completedAt: q.completedAt });
        else active.push(quest);
      }
      coreState.quests = { active, completed };
    }

    if (dbCodex.length > 0) {
      if (!coreState.world) coreState.world = {};
      const ASPECT_TYPES = ['history', 'description', 'location', 'weakness', 'rumor', 'technical', 'political'];
      coreState.world.codexSummary = dbCodex.map((c) => {
        const fragments = JSON.parse(c.fragments || '[]');
        const knownAspects = [...new Set(fragments.map(f => f.aspect).filter(Boolean))];
        const canReveal = ASPECT_TYPES.filter(a => !knownAspects.includes(a));
        return { name: c.name, category: c.category, knownAspects, canReveal };
      });
    }

    if (dbKnowledge.length > 0) {
      if (!coreState.world) coreState.world = {};
      coreState.world.keyPlotFacts = dbKnowledge.map(k => k.summary);
    }

    // 2. Intent classification
    const intentResult = await classifyIntent(playerAction, coreState, { dbNpcs, dbQuests, dbCodex }, {
      dialogue,
      isFirstScene,
      provider,
    });
    onEvent({ type: 'intent', data: { intent: intentResult._intent || 'freeform' } });

    // 2a. Trade shortcut — skip scene generation for pure trade intent
    if (intentResult._tradeOnly) {
      const npcHint = intentResult._npcHint;
      // Find best matching NPC from the scene
      let matchedNpc = null;
      if (npcHint) {
        const hintLower = npcHint.toLowerCase();
        matchedNpc = dbNpcs.find(n =>
          n.alive !== false && n.name?.toLowerCase().includes(hintLower)
        );
      }
      // Fallback: first alive NPC at current location
      if (!matchedNpc) {
        const currentLoc = coreState.world?.currentLocation;
        matchedNpc = dbNpcs.find(n =>
          n.alive !== false && (!currentLoc || n.lastLocation === currentLoc)
        ) || dbNpcs.find(n => n.alive !== false);
      }

      if (matchedNpc) {
        const tradeResult = {
          narrative: '',
          stateChanges: {
            startTrade: { npcName: matchedNpc.name },
          },
          actions: [],
          _tradeShortcut: true,
        };
        onEvent({ type: 'complete', data: { scene: tradeResult, sceneIndex: -1 } });
        return;
      }
      // If no NPC found, fall through to normal pipeline
    }

    // 2a2. Combat fast-path — skip large model for clear combat intent
    if (intentResult.clear_combat && intentResult.combat_enemies) {
      // Disposition guard: check if target is a friendly NPC
      const targetNpc = await findCombatTargetNpc(playerAction, dbNpcs);
      if (targetNpc && targetNpc.disposition > 0) {
        // Don't start combat — lower disposition instead
        const newDisposition = Math.max(-100, targetNpc.disposition - 30);
        await prisma.campaignNPC.update({
          where: { id: targetNpc.id },
          data: { disposition: newDisposition },
        });
        onEvent({ type: 'intent', data: { intent: 'disposition_warning' } });
        const warningNarrative = await generateShortNarrative(
          `NPC "${targetNpc.name}" (${targetNpc.role || 'osoba'}) jest zaskoczony/a agresją gracza. Disposition spadło. NPC reaguje z niedowierzaniem i ostrzega gracza.`,
          playerAction, provider,
        );
        const dispositionResult = {
          narrative: warningNarrative,
          stateChanges: {
            npcs: [{ action: 'update', name: targetNpc.name, dispositionChange: -30 }],
          },
          actions: [],
          scenePacing: 'tension',
          _combatDispositionGuard: true,
        };
        onEvent({ type: 'complete', data: { scene: dispositionResult, sceneIndex: -1 } });
        return;
      }

      // Select enemies from bestiary
      const enemies = selectBestiaryEncounter(intentResult.combat_enemies);
      const filledEnemies = enemies.map(e => ({
        name: e.name,
        attributes: e.attributes, // already has variance applied from selectBestiaryEncounter
        wounds: e.maxWounds,
        maxWounds: e.maxWounds,
        skills: e.skills,
        traits: e.traits,
        armourDR: e.armourDR,
        weapons: e.weapons,
      }));

      if (filledEnemies.length > 0) {
        const enemyNames = filledEnemies.map(e => e.name).join(', ');
        const combatNarrative = await generateShortNarrative(
          `Gracz rozpoczyna walkę. Przeciwnicy: ${enemyNames}. Napisz krótki opis rozpoczęcia walki (2-3 zdania, po polsku, styl RPG).`,
          playerAction, provider,
        );
        onEvent({ type: 'intent', data: { intent: 'clear_combat' } });
        const combatResult = {
          narrative: combatNarrative,
          stateChanges: {
            combatUpdate: { active: true, enemies: filledEnemies, reason: playerAction },
          },
          actions: [],
          scenePacing: 'combat',
          _combatFastPath: true,
        };
        onEvent({ type: 'complete', data: { scene: combatResult, sceneIndex: -1 } });
        return;
      }
      // If no enemies found in bestiary, fall through to normal pipeline
    }

    // 2b. Pre-roll 3 dice sets + resolve nano-detected skill check
    const characterForRoll = { ...coreState.character, momentumBonus: coreState.momentumBonus || 0 };
    const preRolls = generatePreRolls(characterForRoll);
    let serverDiceRoll = null;

    if (!resolvedMechanics?.diceRoll && intentResult.roll_skill && !isFirstScene) {
      const testsFrequency = dmSettings?.testsFrequency ?? 50;
      if (Math.random() * 100 < testsFrequency) {
        serverDiceRoll = resolveBackendDiceRollWithPreRoll(
          characterForRoll,
          intentResult.roll_skill,
          intentResult.roll_difficulty || 'medium',
          preRolls[0].d50,
          preRolls[0].luckySuccess,
        );
        if (serverDiceRoll) {
          resolvedMechanics = { diceRoll: serverDiceRoll };
        }
      }
    }

    // 2c. Emit nano-resolved dice roll EARLY so the frontend can start the
    // animation in parallel with narrative streaming, instead of waiting for
    // the `complete` event at the end.
    if (resolvedMechanics?.diceRoll) {
      onEvent({ type: 'dice_early', data: { diceRoll: resolvedMechanics.diceRoll } });
    }

    // 3. Context assembly
    // Pomijamy w EXPANDED CONTEXT te NPC/questy/codex, które i tak trafią
    // do dynamicSuffix przez "Key NPCs" / "Active Quests" / "ALREADY DISCOVERED".
    const currentLocation = coreState.world?.currentLocation || '';
    const inlineKeys = getInlineEntityKeys(coreState);
    const contextBlocks = await assembleContext(campaignId, intentResult, currentLocation, inlineKeys);
    onEvent({ type: 'context_ready' });

    // 4. Build prompts
    const recentScenes = await prisma.campaignScene.findMany({
      where: { campaignId },
      orderBy: { sceneIndex: 'desc' },
      take: 5,
    });
    recentScenes.reverse();

    const systemPromptParts = buildLeanSystemPrompt(coreState, recentScenes, language, {
      dmSettings,
      needsSystemEnabled,
      characterNeeds,
      sceneCount,
      skipToolProtocol: true,
    });

    const userPrompt = buildUserPrompt(playerAction, {
      resolvedMechanics,
      dialogue,
      dialogueCooldown,
      isFirstScene,
      needsSystemEnabled,
      characterNeeds,
      language,
      sceneCount,
      preRolls,
      creativityEligible,
    });

    // 5. Streaming AI call
    const sceneResult = await runTwoStagePipelineStreaming(
      systemPromptParts, userPrompt, contextBlocks,
      { provider, model },
      (text) => onEvent({ type: 'chunk', text }),
    );

    // 5b. Walidacja creativity bonus przyznanego przez model.
    // Anti-cheat: tylko własnoręcznie wpisane akcje gracza dostają jakikolwiek
    // bonus, dla suggestedActions / autoplayer / akcji systemowych zerujemy.
    const modelCreativityRaw = Number(sceneResult.creativityBonus) || 0;
    const effectiveCreativity = creativityEligible
      ? Math.max(0, Math.min(CREATIVITY_BONUS_MAX, Math.floor(modelCreativityRaw)))
      : 0;
    sceneResult.creativityBonus = effectiveCreativity;

    // 5c. Aplikuj creativity do nano-rolla (resolvedMechanics.diceRoll), jeśli istnieje.
    // Dla nano-rolli backend rozliczył dice w sekcji 2b PRZED wywołaniem modelu,
    // więc creativity bonus dochodzi tu post-hoc i zmienia total/margin/success.
    if (effectiveCreativity > 0 && resolvedMechanics?.diceRoll) {
      applyCreativityToRoll(resolvedMechanics.diceRoll, effectiveCreativity);
    }

    // 6a. Resolve model-initiated dice rolls (if any)
    resolveModelDiceRolls(sceneResult, characterForRoll, resolvedMechanics?.diceRoll ? preRolls.slice(1) : preRolls);

    // 6a2. Aplikuj creativity także do self-resolved rolli z modelu — wszystkie
    // dice w jednej scenie korzystają z tego samego top-level bonusu.
    if (effectiveCreativity > 0 && Array.isArray(sceneResult.diceRolls)) {
      for (const roll of sceneResult.diceRolls) {
        applyCreativityToRoll(roll, effectiveCreativity);
      }
    }

    // 6b. Unify dice rolls: nano roll + model rolls → single diceRolls array.
    // Dedupe by skill name: if nano already resolved a skill, drop any model
    // roll on the same skill (the model sometimes ignores the prompt rule
    // forbidding duplicate rolls). Nano takes priority because it already
    // fired the dice_early animation on the frontend.
    const allDiceRolls = [];
    const usedSkills = new Set();
    const skillKey = (s) => (s ? String(s).toLowerCase().trim() : null);
    if (resolvedMechanics?.diceRoll) {
      allDiceRolls.push(resolvedMechanics.diceRoll);
      const k = skillKey(resolvedMechanics.diceRoll.skill);
      if (k) usedSkills.add(k);
    }
    if (sceneResult.diceRolls) {
      for (const r of sceneResult.diceRolls) {
        const k = skillKey(r?.skill);
        if (k && usedSkills.has(k)) {
          console.log('[sceneGenerator] Dropped duplicate model dice roll for skill:', r.skill);
          continue;
        }
        if (k) usedSkills.add(k);
        allDiceRolls.push(r);
      }
    }
    sceneResult.diceRolls = allDiceRolls.length > 0 ? allDiceRolls : undefined;

    // 6c. Calculate deterministic skill XP from freeform actions
    const hasAnyDiceRoll = !!resolvedMechanics?.diceRoll || (sceneResult.diceRolls?.length > 0);
    calculateFreeformSkillXP(sceneResult.stateChanges, hasAnyDiceRoll, sceneResult.diceRolls);

    // 6. Fill enemy stats from bestiary
    fillEnemiesFromBestiary(sceneResult.stateChanges);

    // 7. Save scene
    const lastScene = recentScenes[recentScenes.length - 1];
    const newSceneIndex = lastScene ? lastScene.sceneIndex + 1 : 0;

    // 6d. Resolve abstract rewards into concrete items/materials/money
    resolveAndApplyRewards(sceneResult.stateChanges, { sceneCount: newSceneIndex });

    const savedScene = await prisma.campaignScene.create({
      data: {
        campaignId,
        sceneIndex: newSceneIndex,
        narrative: sceneResult.narrative || '',
        chosenAction: playerAction,
        suggestedActions: JSON.stringify(sceneResult.suggestedActions || []),
        dialogueSegments: JSON.stringify(sceneResult.dialogueSegments || []),
        imagePrompt: sceneResult.imagePrompt || null,
        soundEffect: sceneResult.soundEffect || null,
        diceRoll: sceneResult.diceRolls ? JSON.stringify(sceneResult.diceRolls) : (sceneResult.diceRoll ? JSON.stringify(sceneResult.diceRoll) : null),
        stateChanges: sceneResult.stateChanges ? JSON.stringify(sceneResult.stateChanges) : null,
        scenePacing: sceneResult.scenePacing || 'exploration',
      },
    });

    // 8. Tag large model quest updates + nano safety net
    if (sceneResult.stateChanges?.questUpdates?.length) {
      for (const u of sceneResult.stateChanges.questUpdates) u.source = 'large';
    }
    const nanoQuestUpdates = await checkQuestObjectives(
      sceneResult.narrative,
      playerAction,
      coreState.quests?.active || [],
      sceneResult.stateChanges?.questUpdates || []
    ).catch(err => {
      console.error('Quest objective check failed:', err.message);
      return [];
    });
    if (nanoQuestUpdates.length > 0) {
      if (!sceneResult.stateChanges) sceneResult.stateChanges = {};
      if (!sceneResult.stateChanges.questUpdates) sceneResult.stateChanges.questUpdates = [];
      sceneResult.stateChanges.questUpdates.push(...nanoQuestUpdates);
    }
    // Dedupe quest updates: collapse duplicate completions for the same
    // questId/objectiveId (large model can repeat entries, nano can echo large).
    // Prefer the large-model entry when both sources mark the same completion.
    if (sceneResult.stateChanges?.questUpdates?.length > 1) {
      const seenCompleted = new Map();
      const deduped = [];
      for (const u of sceneResult.stateChanges.questUpdates) {
        if (!u?.completed) { deduped.push(u); continue; }
        const key = `${u.questId}/${u.objectiveId}`;
        const existingIdx = seenCompleted.get(key);
        if (existingIdx === undefined) {
          seenCompleted.set(key, deduped.length);
          deduped.push(u);
        } else if (u.source === 'large' && deduped[existingIdx].source !== 'large') {
          deduped[existingIdx] = u;
        }
      }
      sceneResult.stateChanges.questUpdates = deduped;
    }

    // 9a. Synchronously apply character state changes BEFORE the SSE complete
    // event so the frontend gets an authoritative snapshot. Only the character
    // branch is sync; the other normalized writes (NPCs/codex/quests) keep
    // running async behind the scenes.
    let updatedCharacter = activeCharacter;
    if (activeCharacterId && activeCharacter && sceneResult.stateChanges) {
      try {
        updatedCharacter = applyCharacterStateChanges(activeCharacter, sceneResult.stateChanges);
        await prisma.character.update({
          where: { id: activeCharacterId },
          data: characterToPrismaUpdate(updatedCharacter),
        });
      } catch (err) {
        console.error('[sceneGenerator] Failed to persist character state changes:', err.message);
        // Fall through — frontend will reconcile to whatever is in DB on next load.
      }
    }

    // 9b. Async: embedding + remaining state changes + memory compression
    generateSceneEmbedding(savedScene).catch(err =>
      console.error('Failed to generate scene embedding:', err.message)
    );
    if (sceneResult.stateChanges) {
      processStateChanges(campaignId, sceneResult.stateChanges).catch(err =>
        console.error('Failed to process state changes:', err.message)
      );
    }
    compressSceneToSummary(campaignId, sceneResult.narrative, playerAction).catch(err =>
      console.error('Failed to compress scene to summary:', err.message)
    );
    const newLoc = sceneResult.stateChanges?.currentLocation;
    const prevLoc = coreState.world?.currentLocation;
    if (newLoc && prevLoc && newLoc !== prevLoc) {
      generateLocationSummary(campaignId, newLoc, prevLoc).catch(err =>
        console.error('Failed to generate location summary:', err.message)
      );
    }

    // 10. Complete (diceRolls already unified in step 6b)
    onEvent({
      type: 'complete',
      data: {
        scene: sceneResult,
        sceneIndex: newSceneIndex,
        sceneId: savedScene.id,
        // Authoritative character snapshot after applying all state changes.
        // Frontend reconciles state.character to this rather than mutating
        // its local copy from sceneResult.stateChanges.
        character: updatedCharacter,
      },
    });
  } catch (err) {
    onEvent({ type: 'error', error: err.message || 'Stream generation failed', code: err.code || 'STREAM_ERROR' });
  }
}

/**
 * Parse AI response text as JSON, with basic cleanup.
 */
function parseAIResponse(text) {
  if (!text) throw new Error('Empty AI response');

  // Try to extract JSON from markdown code blocks
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim());

    // Derive narrative from dialogueSegments narration text — the model no
    // longer emits a separate narrative field. Falls back to legacy
    // parsed.narrative for any old/cached responses.
    const derivedNarrative = Array.isArray(parsed.dialogueSegments)
      ? parsed.dialogueSegments
        .filter(s => s && s.type === 'narration' && typeof s.text === 'string')
        .map(s => s.text.trim())
        .filter(Boolean)
        .join(' ')
      : '';

    // Ensure required fields have defaults
    return {
      narrative: derivedNarrative || parsed.narrative || '',
      suggestedActions: parsed.suggestedActions || ['Look around', 'Move forward', 'Wait'],
      stateChanges: parsed.stateChanges || {},
      dialogueSegments: parsed.dialogueSegments || [],
      scenePacing: parsed.scenePacing || 'exploration',
      diceRoll: parsed.diceRoll || null,  // Legacy: single nano-resolved roll
      // diceRolls is a TOP-LEVEL field — model emits it first per schema order.
      // resolveModelDiceRolls() reads from sceneResult.diceRolls and reconciles values.
      diceRolls: Array.isArray(parsed.diceRolls) ? parsed.diceRolls : undefined,
      // creativityBonus: top-level integer 0-10. Reconciliated post-hoc with
      // any nano-resolved diceRoll, and propagated into self-resolved rolls.
      creativityBonus: Number.isFinite(parsed.creativityBonus) ? parsed.creativityBonus : 0,
      atmosphere: parsed.atmosphere || { weather: 'clear', mood: 'peaceful', lighting: 'natural' },
      sceneGrid: parsed.sceneGrid || null,
      imagePrompt: parsed.imagePrompt || null,
      soundEffect: parsed.soundEffect || null,
      musicPrompt: parsed.musicPrompt || null,
      questOffers: parsed.questOffers || [],
      cutscene: parsed.cutscene || null,
      dilemma: parsed.dilemma || null,
    };
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}\nResponse: ${text.slice(0, 500)}`);
  }
}

/**
 * Generate and store embedding for a saved scene (async, fire-and-forget).
 */
async function generateSceneEmbedding(scene) {
  const embeddingText = buildSceneEmbeddingText(scene);
  if (!embeddingText) return;

  const embedding = await embedText(embeddingText);
  if (embedding) {
    await writeEmbedding('CampaignScene', scene.id, embedding, embeddingText);
  }
}

/**
 * Process stateChanges from AI response - update normalized collections.
 */
async function processStateChanges(campaignId, stateChanges) {
  // Update NPCs
  if (stateChanges.npcs?.length) {
    for (const npcChange of stateChanges.npcs) {
      if (!npcChange.name) continue;

      const npcId = npcChange.name.toLowerCase().replace(/\s+/g, '_');

      try {
        const existing = await prisma.campaignNPC.findUnique({
          where: { campaignId_npcId: { campaignId, npcId } },
        });

        if (existing) {
          const updateData = {};
          if (npcChange.attitude) updateData.attitude = npcChange.attitude;
          if (npcChange.disposition != null) updateData.disposition = npcChange.disposition;
          if (npcChange.alive != null) updateData.alive = npcChange.alive;
          if (npcChange.lastLocation) updateData.lastLocation = npcChange.lastLocation;
          if (npcChange.factionId) updateData.factionId = npcChange.factionId;
          if (npcChange.relationships) {
            updateData.relationships = JSON.stringify(npcChange.relationships);
          }

          if (Object.keys(updateData).length > 0) {
            const updated = await prisma.campaignNPC.update({
              where: { id: existing.id },
              data: updateData,
            });
            // Re-embed
            const embText = buildNPCEmbeddingText(updated);
            const emb = await embedText(embText);
            if (emb) writeEmbedding('CampaignNPC', updated.id, emb, embText);
          }
        } else if (npcChange.action === 'introduce' || !existing) {
          const created = await prisma.campaignNPC.create({
            data: {
              campaignId,
              npcId,
              name: npcChange.name,
              gender: npcChange.gender || 'unknown',
              role: npcChange.role || null,
              personality: npcChange.personality || null,
              attitude: npcChange.attitude || 'neutral',
              disposition: npcChange.disposition ?? 0,
              factionId: npcChange.factionId || null,
              relationships: JSON.stringify(npcChange.relationships || []),
              relatedQuestIds: JSON.stringify(npcChange.relatedQuestIds || []),
            },
          });
          // Embed new NPC
          const embText = buildNPCEmbeddingText(created);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignNPC', created.id, emb, embText);
        }
      } catch (err) {
        console.error(`Failed to process NPC change for ${npcChange.name}:`, err.message);
      }
    }
  }

  // Update knowledge base entries
  if (stateChanges.knowledgeUpdates) {
    const ku = stateChanges.knowledgeUpdates;
    const entries = [];

    if (ku.events?.length) {
      for (const e of ku.events) {
        entries.push({ entryType: 'event', summary: e.summary || e, content: JSON.stringify(e), importance: e.importance, tags: JSON.stringify(e.tags || []) });
      }
    }
    if (ku.decisions?.length) {
      for (const d of ku.decisions) {
        entries.push({ entryType: 'decision', summary: `${d.choice} -> ${d.consequence}`, content: JSON.stringify(d), importance: d.importance, tags: JSON.stringify(d.tags || []) });
      }
    }

    for (const entry of entries) {
      try {
        const created = await prisma.campaignKnowledge.create({
          data: { campaignId, ...entry },
        });
        const embText = buildKnowledgeEmbeddingText(created);
        const emb = await embedText(embText);
        if (emb) writeEmbedding('CampaignKnowledge', created.id, emb, embText);
      } catch (err) {
        console.error('Failed to save knowledge entry:', err.message);
      }
    }
  }

  // Update codex entries
  if (stateChanges.codexUpdates?.length) {
    for (const cu of stateChanges.codexUpdates) {
      if (!cu.id || !cu.name) continue;

      try {
        const existing = await prisma.campaignCodex.findUnique({
          where: { campaignId_codexKey: { campaignId, codexKey: cu.id } },
        });

        if (existing) {
          const existingFragments = JSON.parse(existing.fragments || '[]');
          if (cu.fragment) existingFragments.push(cu.fragment);

          const updated = await prisma.campaignCodex.update({
            where: { id: existing.id },
            data: {
              fragments: JSON.stringify(existingFragments),
              tags: JSON.stringify(cu.tags || JSON.parse(existing.tags || '[]')),
            },
          });
          const embText = buildCodexEmbeddingText(updated);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignCodex', updated.id, emb, embText);
        } else {
          const created = await prisma.campaignCodex.create({
            data: {
              campaignId,
              codexKey: cu.id,
              name: cu.name,
              category: cu.category || 'concept',
              tags: JSON.stringify(cu.tags || []),
              fragments: JSON.stringify(cu.fragment ? [cu.fragment] : []),
              relatedEntries: JSON.stringify(cu.relatedEntries || []),
            },
          });
          const embText = buildCodexEmbeddingText(created);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignCodex', created.id, emb, embText);
        }
      } catch (err) {
        console.error(`Failed to process codex update for ${cu.id}:`, err.message);
      }
    }
  }

  // Update quest objectives (progress + completion)
  if (stateChanges.questUpdates?.length) {
    for (const update of stateChanges.questUpdates) {
      try {
        const quest = await prisma.campaignQuest.findFirst({
          where: { campaignId, questId: update.questId },
        });
        if (quest) {
          const objectives = JSON.parse(quest.objectives || '[]');
          const updated = objectives.map(obj => {
            if (obj.id !== update.objectiveId) return obj;
            const next = { ...obj };
            if (update.completed) next.completed = true;
            if (update.addProgress) {
              const prev = obj.progress || '';
              next.progress = prev ? `${prev}; ${update.addProgress}` : update.addProgress;
            }
            return next;
          });
          await prisma.campaignQuest.update({
            where: { id: quest.id },
            data: { objectives: JSON.stringify(updated) },
          });
        }
      } catch (err) {
        console.error(`Failed to update quest objective ${update.questId}/${update.objectiveId}:`, err.message);
      }
    }
  }
}
