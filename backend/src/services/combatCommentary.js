import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';

function formatCombatantForCommentary(combatant) {
  const status = combatant.isDefeated
    ? 'defeated'
    : `${combatant.wounds}/${combatant.maxWounds} wounds`;
  return `- ${combatant.name} [${combatant.type}]${combatant.side ? ` side=${combatant.side}` : ''} — ${status}`;
}

function buildCombatCommentaryPrompts(gameState, combatSnapshot, language) {
  const campaignName = gameState?.campaign?.name || 'Unnamed Campaign';
  const currentLocation = gameState?.world?.currentLocation || 'Unknown';
  const activeCombatants = combatSnapshot?.activeCombatants || [];
  const defeatedCombatants = combatSnapshot?.defeatedCombatants || [];
  const recentResults = combatSnapshot?.recentResults || [];
  const recentLogEntries = combatSnapshot?.recentLogEntries || [];
  const langNote = language === 'pl'
    ? 'Write both the narration and battle cries in Polish.'
    : 'Write both the narration and battle cries in English.';

  const activeBlock = activeCombatants.length > 0
    ? activeCombatants.map(formatCombatantForCommentary).join('\n')
    : '- No active combatants remain.';
  const defeatedBlock = defeatedCombatants.length > 0
    ? defeatedCombatants.map(formatCombatantForCommentary).join('\n')
    : '- Nobody has been defeated yet.';
  const recentResultsBlock = recentResults.length > 0
    ? recentResults.map((entry) => `- ${entry}`).join('\n')
    : '- No recent exchanges recorded.';
  const recentLogBlock = recentLogEntries.length > 0
    ? recentLogEntries.map((entry) => `- ${entry}`).join('\n')
    : '- No recent combat log lines.';

  return {
    system: `You are a battle commentator for the tabletop RPG campaign "${campaignName}" with a grim, dark-fantasy tone.

Your job is to add a short mid-combat narration to an already active fight.

MANDATORY RULES:
- This is NOT a full scene. Do not continue the adventure outside the current fight.
- Do NOT invent or request any state changes, combat resolution, new enemies, victory, surrender, or an end to combat.
- Write exactly ONE narrator paragraph summarizing the current state and momentum of the battle.
- Then provide exactly ONE short, vicious battle cry for EACH active combatant listed in the input.
- Battle cries must be direct speech only, with no narration around them.
- Use only the listed combatants and recent combat context. Do not introduce new speakers.
- Keep the output tight and vivid. The commentary should feel fast and reactive, not like a full prose scene.
- ${langNote}
- Respond with ONLY valid JSON in this exact format:
{
  "narration": "One paragraph of battle narration...",
  "battleCries": [
    { "speaker": "Combatant Name", "text": "Short battle cry!" }
  ]
}`,
    user: `Generate a mid-combat commentary for an already active fight.

ROUND: ${combatSnapshot?.round ?? 0}
LOCATION: ${currentLocation}
REASON FOR THE FIGHT: ${combatSnapshot?.reason || 'Unknown'}
ACTIVE COMBATANT COUNT: ${activeCombatants.length}

ACTIVE COMBATANTS:
${activeBlock}

DEFEATED COMBATANTS:
${defeatedBlock}

RECENT RESOLUTION SNAPSHOT:
${recentResultsBlock}

RECENT COMBAT LOG:
${recentLogBlock}

REMINDERS:
- Narration must stay in the present battle and reflect visible momentum, wounds, pressure, positioning, fear, fury, or desperation.
- Battle cries must cover every active combatant exactly once.
- Do not duplicate the same cry wording for everyone.
- Do not mention JSON, rules, or mechanics in the narration unless it is natural diegetic language.`,
  };
}

export async function generateCombatCommentary({
  gameState,
  combatSnapshot,
  language = 'en',
  provider = 'openai',
  model = null,
  modelTier = 'premium',
  userApiKeys = null,
}) {
  const prompts = buildCombatCommentaryPrompts(gameState, combatSnapshot, language);
  const { text, usage } = await callAIJson({
    provider,
    model,
    modelTier,
    systemPrompt: prompts.system,
    userPrompt: prompts.user,
    maxTokens: 700,
    temperature: 0.8,
    userApiKeys,
  });

  const parsed = parseJsonOrNull(text);
  if (parsed && typeof parsed === 'object') {
    return {
      result: {
        narration: typeof parsed.narration === 'string' ? parsed.narration : '',
        battleCries: Array.isArray(parsed.battleCries) ? parsed.battleCries : [],
      },
      usage,
    };
  }

  return {
    result: {
      narration: language === 'pl'
        ? 'Walka trwa, obie strony szukają przewagi, a napięcie rośnie z każdym ciosem.'
        : 'The fight continues, both sides look for an edge, and tension rises with every blow.',
      battleCries: [],
      meta: { degraded: true, reason: 'combat_commentary_schema_validation_failed' },
    },
    usage,
  };
}
