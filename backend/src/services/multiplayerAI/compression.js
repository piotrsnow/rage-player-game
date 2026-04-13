import { childLogger } from '../../lib/logger.js';
import { callAI } from './aiClient.js';

const log = childLogger({ module: 'multiplayerAI' });

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
    log.warn({ err }, 'Scene compression failed');
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
