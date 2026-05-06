import { callAIJson } from './aiJsonCall.js';

/**
 * Analyze a player's incident report against recent scene history.
 * Uses the premium model to make a fair judgment.
 *
 * @param {Object} params
 * @param {Array} params.recentScenes - Last 3-5 scenes with narrative, chosenAction, stateChanges
 * @param {string} params.playerComplaint - What the player thinks went wrong
 * @param {Object} params.campaignState - Current campaign coreState (for context)
 * @param {Object} [params.userApiKeys] - Per-user API key overrides
 * @param {string} [params.userId] - User ID for logging
 * @returns {Promise<{verdict: string, isPlayerRight: boolean, technicalDetails: string}>}
 */
export async function analyzeIncident({
  recentScenes,
  playerComplaint,
  campaignState,
  userApiKeys = null,
  userId = null,
}) {
  const sceneSummaries = recentScenes.map((s, i) => {
    const parts = [`Scene ${s.sceneIndex ?? i}:`];
    if (s.chosenAction) parts.push(`Player action: ${s.chosenAction}`);
    parts.push(`Narrative: ${s.narrative}`);
    if (s.stateChanges) parts.push(`State changes: ${JSON.stringify(s.stateChanges)}`);
    return parts.join('\n');
  }).join('\n\n---\n\n');

  const currentState = campaignState ? JSON.stringify({
    currentLocation: campaignState.world?.currentLocation,
    character: campaignState.character ? {
      name: campaignState.character.name,
      hp: campaignState.character.hp,
      maxHp: campaignState.character.maxHp,
    } : null,
    npcs: (campaignState.world?.npcs || []).map(n => ({ name: n.name, alive: n.alive })),
  }) : 'N/A';

  const systemPrompt = `You are a fair and impartial game judge for an AI-powered RPG game called RPGon.
A player has filed an incident report claiming the AI game master made an error.

Your job is to:
1. Carefully review the recent scenes (narratives, player actions, state changes)
2. Read the player's complaint
3. Determine if the player's complaint is valid
4. Provide technical analysis of what likely went wrong in the AI pipeline

Be fair but strict. Common valid complaints include:
- Location not changing when player clearly traveled
- NPC acting out of character or contradicting established facts
- Game state not reflecting what happened in the narrative
- Dice rolls being ignored or misapplied
- Items/gold not being properly added or removed
- Combat results being inconsistent with the mechanics

Common invalid complaints include:
- Player disagreeing with AI's creative choices (narrative style, NPC reactions)
- Misunderstanding game mechanics
- Wanting different outcomes for dice rolls
- Complaints about difficulty or unfairness that are actually valid game design

The game uses a two-stage AI pipeline:
- Stage 1 (nano model): classifies intent, selects context categories
- Stage 2 (premium model): generates narrative + stateChanges JSON
State changes are structured: { currentLocation, npcs[], quests[], items[], gold, xp, hp, etc. }
The stateChanges JSON is validated by Zod schemas and applied by processStateChanges handlers (per bucket: location, npcs, quests, items, combat, character stats, etc.).
Location changes go through resolveLocationByName (canonical DB lookup) or fall back to flavor-name-only.

In "technicalDetails", provide ENGLISH-ONLY developer-facing analysis:
- Which stateChanges bucket likely failed or was missing (e.g. "stateChanges.currentLocation was not emitted")
- Whether the issue is in prompt construction, LLM output, or post-processing validation
- Which pipeline stage (intent classification, context assembly, LLM generation, state change processing) likely caused the problem
- Specific fields in stateChanges that should have been present but weren't, or had wrong values
- Possible root cause (e.g. "LLM narrated travel but didn't emit currentLocation in stateChanges", "processStateChanges/items.js may have rejected the item due to missing baseType")

Respond in the SAME LANGUAGE as the player's complaint for the "verdict" field.
Always use ENGLISH for the "technicalDetails" field.

Respond with valid JSON only:
{
  "verdict": "A detailed explanation of your analysis and judgment (2-4 sentences)",
  "isPlayerRight": true/false,
  "technicalDetails": "Developer-facing technical analysis (English only, 3-5 sentences)",
  "corrections": {
    "currentLocation": "corrected location name or null",
    "items": [{"name": "Item Name", "action": "add/remove", "quantity": 1}],
    "gold": 10,
    "hp": 5,
    "npcs": [{"name": "NPC Name", "alive": true/false}],
    "xp": 0,
    "attributePoints": 1,
    "manaMaxChange": 0,
    "learnSpell": null,
    "addScroll": null
  },
  "narrativeComment": "A short in-character narrator comment about the correction (same language as complaint)"
}

IMPORTANT rules for corrections:
- Only include fields that actually need fixing. Omit fields that are fine.
- "corrections" and "narrativeComment" should ONLY be present when isPlayerRight=true.
- When isPlayerRight=false, set corrections to null and narrativeComment to null.
- "attributePoints" is ALWAYS 1 when isPlayerRight=true — a small reward for the player catching a bug.
- "gold" is a DELTA (positive to add, negative to remove).
- "hp" is a DELTA (positive to heal, negative to damage).
- "xp" is a DELTA to add.
- "items" action is "add" to give or "remove" to take away.
- "manaMaxChange" is a DELTA to max mana pool (e.g. 2 to grant +2 max mana). Use when magic/mana was narratively promised but not applied.
- "learnSpell" is a spell name string (e.g. "Iskra", "Leczenie Ran") — grants the character a new spell. Use when a spell should have been learned but wasn't.
- "addScroll" is a spell name string — adds a scroll to inventory.
- "narrativeComment" should be a 1-2 sentence atmospheric narrator comment acknowledging the correction, written in the same language as the player's complaint.`;

  const userPrompt = `## Recent Scenes

${sceneSummaries}

## Current Game State

${currentState}

## Player's Complaint

${playerComplaint}`;

  const { text } = await callAIJson({
    modelTier: 'premium',
    systemPrompt,
    userPrompt,
    maxTokens: 800,
    temperature: 0.3,
    userApiKeys,
    userId,
    taskType: 'incident-analysis',
    taskLabel: 'Incident Report Analysis',
  });

  try {
    const parsed = JSON.parse(text);
    return {
      verdict: parsed.verdict || 'Unable to determine.',
      isPlayerRight: !!parsed.isPlayerRight,
      technicalDetails: parsed.technicalDetails || null,
      corrections: parsed.isPlayerRight ? (parsed.corrections || null) : null,
      narrativeComment: parsed.isPlayerRight ? (parsed.narrativeComment || null) : null,
    };
  } catch {
    return {
      verdict: text || 'Unable to analyze the incident.',
      isPlayerRight: false,
      technicalDetails: null,
      corrections: null,
      narrativeComment: null,
    };
  }
}
