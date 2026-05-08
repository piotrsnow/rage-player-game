import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';

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

function buildCombatTurnPrompts({ combatSnapshot, playerAction, language }) {
  const langNote = language === 'pl'
    ? 'Write the narration in Polish. Field names in the JSON stay in English.'
    : 'Write the narration in English.';

  const active = (combatSnapshot.activeCombatants || []).map(formatCombatant).join('\n');
  const defeated = (combatSnapshot.defeatedCombatants || []).map(formatCombatant).join('\n') || '- None';

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
- ${langNote}
- Respond with ONLY valid JSON:
{
  "narration": "Short narration of what happens this turn...",
  "enemyDamage": [{"name": "Enemy Name", "damage": 5}],
  "playerDamage": 0,
  "playerHealing": 0,
  "statusEffects": [
    { "target": "Enemy Name", "action": "add",
      "effect": { "name": "Stunned", "category": "control",
        "duration": {"type":"rounds","remaining":2},
        "mechanics": {"restrictions":["skip_turn"]} } }
  ],
  "manaChange": 0,
  "itemConsumed": false
}

- enemyDamage: array of enemies hit. damage=0 if none hit.
- playerDamage: damage taken by the player this turn (usually 0 for player's own action, but possible if action backfires).
- playerHealing: HP restored to player (e.g. potion).
- statusEffects: structured effects to add/remove. action="add"|"remove". effect has name, category (buff/debuff/dot/control/mixed), duration ({type:"rounds", remaining:N}), mechanics (optional: restrictions[], attributeMods, testMod, damageReduction, dotDamage, movementMod). duration in rounds (1-3).
- manaChange: mana spent (negative) or restored (positive). 0 if no magic involved.
- itemConsumed: true if the item was used up (potion, scroll, single-use).`,

    user: `Resolve this combat turn.

PLAYER ACTION: ${playerAction}

ROUND: ${combatSnapshot.round || 1}
REASON FOR FIGHT: ${combatSnapshot.reason || 'Unknown'}

ACTIVE COMBATANTS:
${active}

DEFEATED:
${defeated}

Decide the mechanical outcome of the player's action and write a brief narration.`,
  };
}

export async function resolveCombatTurn({
  combatSnapshot,
  playerAction,
  language = 'pl',
  provider = 'openai',
  model = null,
  modelTier = 'standard',
  userApiKeys = null,
}) {
  const prompts = buildCombatTurnPrompts({ combatSnapshot, playerAction, language });
  const { text, usage } = await callAIJson({
    provider,
    model,
    modelTier,
    taskCategory: 'sceneGeneration',
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
    return {
      result: {
        narration: typeof parsed.narration === 'string' ? parsed.narration : '',
        enemyDamage: Array.isArray(parsed.enemyDamage) ? parsed.enemyDamage : [],
        playerDamage: typeof parsed.playerDamage === 'number' ? parsed.playerDamage : 0,
        playerHealing: typeof parsed.playerHealing === 'number' ? parsed.playerHealing : 0,
        statusEffects: Array.isArray(parsed.statusEffects) ? parsed.statusEffects : [],
        manaChange: typeof parsed.manaChange === 'number' ? parsed.manaChange : 0,
        itemConsumed: parsed.itemConsumed === true,
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
