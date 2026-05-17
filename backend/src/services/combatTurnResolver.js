import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';
import {
  canonicalizeSkillName,
  DIFFICULTY_THRESHOLDS,
  resolveBackendDiceRollWithPreRoll,
} from './diceResolver.js';
import { tierThresholdBonus } from '../../../shared/domain/difficultyTier.js';

function formatCombatant(c) {
  if (c.isDefeated) return `- ${c.name} [${c.type}] — DEFEATED`;
  const conditions = c.conditions?.length ? ` conditions=[${c.conditions.join(',')}]` : '';
  const effects = c.activeEffects?.length
    ? ` effects=[${c.activeEffects.map(fx => {
        const dur = fx.duration?.remaining != null ? ` ${fx.duration.remaining} rnd` : '';
        const restr = fx.mechanics?.restrictions?.length ? ` (${fx.mechanics.restrictions.join(',')})` : '';
        return `${fx.name} [${fx.category || 'debuff'}]${dur}${restr}`;
      }).join(', ')}]`
    : '';
  return `- ${c.name} [${c.type}] HP ${c.wounds}/${c.maxWounds}${conditions}${effects}`;
}

function extractPlayerSnapshot(combatSnapshot) {
  if (!combatSnapshot || !Array.isArray(combatSnapshot.activeCombatants)) return null;
  return combatSnapshot.activeCombatants.find((c) => c?.type === 'player') || null;
}

function clampD50(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 50) return null;
  return rounded;
}

function normalizeDifficulty(raw) {
  if (typeof raw !== 'string') return 'medium';
  const lowered = raw.trim().toLowerCase();
  if (!lowered) return 'medium';
  if (lowered === 'very_hard' || lowered === 'veryhard') return 'veryHard';
  if (DIFFICULTY_THRESHOLDS[lowered]) return lowered;
  if (DIFFICULTY_THRESHOLDS[raw]) return raw;
  return 'medium';
}

function normalizeAiDiceSelection(parsed) {
  const payload = parsed?.diceCheck;
  if (!payload || typeof payload !== 'object') {
    return { skill: 'Przeczucie', difficulty: 'medium', reasoning: '' };
  }
  return {
    skill: canonicalizeSkillName(payload.skill) || 'Przeczucie',
    difficulty: normalizeDifficulty(payload.difficulty),
    reasoning: typeof payload.reasoning === 'string' ? payload.reasoning.trim().slice(0, 240) : '',
  };
}

function resolveCombatTurnDice({ combatSnapshot, parsed, diceRoll, thresholdBonus = 0 }) {
  const player = extractPlayerSnapshot(combatSnapshot);
  const rolledValue = clampD50(diceRoll);
  if (!player?.attributes || !player?.skills || !rolledValue) return null;

  const selection = normalizeAiDiceSelection(parsed);
  const resolved = resolveBackendDiceRollWithPreRoll(
    player,
    selection.skill,
    selection.difficulty,
    rolledValue,
    false,
    0,
    [],
    thresholdBonus,
  );
  if (!resolved) return null;

  return {
    ...resolved,
    reasoning: selection.reasoning,
  };
}

function formatPlayerDiceProfile(combatSnapshot) {
  const player = extractPlayerSnapshot(combatSnapshot);
  if (!player) return '- unavailable';
  const attrs = player.attributes || {};
  const skills = player.skills || {};
  const skillPairs = Object.entries(skills)
    .map(([name, value]) => `${name}: ${typeof value === 'object' ? (value.level || 0) : (value || 0)}`)
    .sort((a, b) => {
      const av = Number(a.split(':').pop()?.trim() || 0);
      const bv = Number(b.split(':').pop()?.trim() || 0);
      return bv - av;
    })
    .slice(0, 12)
    .join(', ');

  return [
    `attributes={sila:${attrs.sila || 0}, inteligencja:${attrs.inteligencja || 0}, charyzma:${attrs.charyzma || 0}, zrecznosc:${attrs.zrecznosc || 0}, wytrzymalosc:${attrs.wytrzymalosc || 0}, szczescie:${attrs.szczescie || 0}}`,
    `topSkills=${skillPairs || 'none'}`,
  ].join('\n');
}

function buildCombatTurnPrompts({ combatSnapshot, playerAction, language, diceRoll }) {
  const langNote = language === 'pl'
    ? 'Write the narration in Polish. Field names in the JSON stay in English. Status effect NAMES (the "name" field inside "effect") MUST be in Polish (e.g. "Ogłuszenie", "Oślepienie", "Podpalenie", "Zatrucie", "Strach").'
    : 'Write the narration in English.';

  const active = (combatSnapshot.activeCombatants || []).map(formatCombatant).join('\n');
  const defeated = (combatSnapshot.defeatedCombatants || []).map(formatCombatant).join('\n') || '- None';
  const rolled = clampD50(diceRoll);
  const playerDiceProfile = formatPlayerDiceProfile(combatSnapshot);

  return {
    system: `You are resolving ONE combat turn in a dark-fantasy tabletop RPG.

The player has chosen a non-standard action (using an item, casting an unconventional spell, or a freeform creative action). You must decide what happens mechanically this turn.

MANDATORY RULES:
- Resolve EXACTLY one turn for the PLAYER. Do NOT resolve enemy turns.
- Decide realistic damage/healing/effects based on the action described and the combat context.
- Damage values should be proportional to the game's scale (typical weapon hit deals 3-8 damage, strong attack 8-15, devastating 15-25). Healing items typically restore 3-8 HP.
- You may apply status effects to enemies (stunned, burning, poisoned, blinded, frightened) if the action warrants it.
- You may apply damage to ONE or MORE enemies if the action is offensive.
- You may heal the player if the action is healing (e.g. potion use).
- Write a SHORT narration (2-3 sentences max) describing what happens. This is a combat log entry, not a full scene.
- Do NOT end combat, do NOT introduce new enemies, do NOT move to a new location.
- A d50 roll has already happened for this action. You MUST choose a matching skill and difficulty.
- Allowed difficulty keys: "easy", "medium", "hard", "veryHard", "extreme".
- You MUST fill diceCheck.reasoning with short explanation (why this skill+difficulty).
- ${langNote}
- Respond with ONLY valid JSON:
{
  "narration": "Short narration of what happens this turn...",
  "diceCheck": {
    "skill": "Atletyka",
    "difficulty": "medium",
    "reasoning": "Krótko: czemu ten test."
  },
  "enemyDamage": [{"name": "Enemy Name", "damage": 5}],
  "playerDamage": 0,
  "playerHealing": 0,
  "statusEffects": [
    { "target": "Enemy Name", "action": "add",
      "effect": { "name": "Ogłuszenie", "category": "control",
        "duration": {"type":"rounds","remaining":2},
        "mechanics": {"restrictions":["skip_turn"]} } }
  ],
  "manaChange": 0,
  "itemConsumed": false
}

- enemyDamage: array of enemies hit. damage=0 if none hit. Optional "damageType" field: fizyczne|ogien|lod|blyskawica|magiczne|trucizna|psychiczne. Default: fizyczne for weapons, spell-dependent for magic.
- playerDamage: damage taken by the player this turn (usually 0 for player's own action, but possible if action backfires).
- playerHealing: HP restored to player (e.g. potion).
- statusEffects: structured effects to add/remove. action="add"|"remove". effect has name, category (buff/debuff/dot/control/mixed), duration ({type:"rounds", remaining:N}), mechanics (optional: restrictions[], attributeMods, testMod, damageReduction, dotDamage, dotDamageType, movementMod). duration in rounds (2-4 minimum). dotDamageType: ogien|lod|blyskawica|trucizna etc.
- manaChange: mana spent (negative) or restored (positive). 0 if no magic involved.
- itemConsumed: true if the item was used up (potion, scroll, single-use).
- DAMAGE TYPES: fizyczne, ogien, lod, blyskawica, magiczne, trucizna, psychiczne. Narrate elemental damage with matching descriptions. Some enemies have resistances/vulnerabilities.`,

    user: `Resolve this combat turn.

PLAYER ACTION: ${playerAction}

ROUND: ${combatSnapshot.round || 1}
REASON FOR FIGHT: ${combatSnapshot.reason || 'Unknown'}
PRE-ROLLED D50: ${rolled ?? 'not provided'}

ACTIVE COMBATANTS:
${active}

DEFEATED:
${defeated}

PLAYER DICE PROFILE:
${playerDiceProfile}

Decide the mechanical outcome of the player's action and write a brief narration.`,
  };
}

export async function resolveCombatTurn({
  combatSnapshot,
  playerAction,
  diceRoll = null,
  language = 'pl',
  provider = 'openai',
  model = null,
  modelTier = 'standard',
  userApiKeys = null,
  campaignDifficultyTier = null,
}) {
  const thresholdBonus = tierThresholdBonus(campaignDifficultyTier);
  const prompts = buildCombatTurnPrompts({ combatSnapshot, playerAction, language, diceRoll });
  const { text, usage } = await callAIJson({
    provider,
    model,
    modelTier,
    taskCategory: 'combatResolution',
    systemPrompt: prompts.system,
    userPrompt: prompts.user,
    maxTokens: 500,
    temperature: 0.7,
    userApiKeys,
    taskType: 'combat-turn-resolve',
    taskLabel: 'Combat turn AI resolve',
  });

  const parsed = parseJsonOrNull(text);
  if (parsed && typeof parsed === 'object') {
    const diceResult = resolveCombatTurnDice({ combatSnapshot, parsed, diceRoll, thresholdBonus });
    return {
      result: {
        narration: typeof parsed.narration === 'string' ? parsed.narration : '',
        enemyDamage: Array.isArray(parsed.enemyDamage) ? parsed.enemyDamage : [],
        playerDamage: typeof parsed.playerDamage === 'number' ? parsed.playerDamage : 0,
        playerHealing: typeof parsed.playerHealing === 'number' ? parsed.playerHealing : 0,
        statusEffects: Array.isArray(parsed.statusEffects) ? parsed.statusEffects : [],
        manaChange: typeof parsed.manaChange === 'number' ? parsed.manaChange : 0,
        itemConsumed: parsed.itemConsumed === true,
        ...(diceResult ? { diceResult } : {}),
      },
      usage,
    };
  }

  return {
    result: {
      narration: language === 'pl'
        ? 'Akcja nie przynosi oczekiwanego efektu.'
        : 'The action has no discernible effect.',
      enemyDamage: [],
      playerDamage: 0,
      playerHealing: 0,
      statusEffects: [],
      manaChange: 0,
      itemConsumed: false,
      meta: { degraded: true },
    },
    usage,
  };
}
