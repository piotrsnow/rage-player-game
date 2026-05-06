import { callAIJson } from '../aiJsonCall.js';
import { buildExtractionContext } from './graphContextBuilder.js';
import { GraphUpdateSchema } from '../../../../shared/domain/locationGraph.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'graphExtractor' });

const SYSTEM_PROMPT = `You are a Location Graph Analyst for an RPG world. Analyze the scene below and extract all spatial/structural information that should be added to or updated in the location graph.

## WHAT TO EXTRACT
- NEW LOCATIONS: Any named place mentioned that doesn't exist in the graph (rooms, buildings, areas, paths)
- NEW EDGES: Connections between locations (doors, stairs, tunnels, roads, bridges, paths, secret passages)
- PERCEPTION: Things visible/audible/smellable from the current location
- NPC MOVES: If any NPC is described at a location different from their current position
- ACCESS CHANGES: Doors locked/unlocked, paths blocked/cleared, new requirements
- DISCOVERY: Locations or paths the player just learned about or visited

## DO NOT EXTRACT
- Decorative descriptions (furniture, weather, mood) — just narration, not graph-worthy
- Locations that already exist in the graph under the same or similar name
- Vague references without spatial significance

## OUTPUT (JSON)
{
  "newNodes": [{ "name": "...", "type": "room|site|district|...", "scale": 5, "parentName": "...", "description": "...", "tags": [], "reason": "..." }],
  "newEdges": [{ "fromName": "...", "toName": "...", "edgeType": "door_to|stairs_to|path_to|...", "category": "movement|perception|...", "bidirectional": true, "metadata": {}, "reason": "..." }],
  "updatedEdges": [{ "fromName": "...", "toName": "...", "edgeType": "...", "changes": {}, "reason": "..." }],
  "npcMoves": [{ "npcName": "...", "toLocationName": "...", "reason": "..." }],
  "discoveryChanges": [{ "locationName": "...", "newState": "visited|known|rumored|...", "reason": "..." }],
  "summary": "Brief description of what changed spatially"
}

If nothing spatial changed, return: { "newNodes": [], "newEdges": [], "updatedEdges": [], "npcMoves": [], "discoveryChanges": [], "summary": "No spatial changes" }`;

/**
 * Call nano/standard model to extract graph updates from a scene.
 * Returns a validated GraphUpdate object, or null on failure.
 */
export async function extractGraphUpdate({
  sceneText,
  playerAction,
  stateChanges,
  campaignId,
  locationId,
  locationKind,
  provider = 'openai',
  userApiKeys = null,
  timeoutMs,
}) {
  const graphContext = await buildExtractionContext(locationId, locationKind, campaignId);
  if (!graphContext) {
    log.warn({ campaignId }, 'No graph context — skipping extraction');
    return null;
  }

  const appliedChanges = stateChanges
    ? `Applied state changes: ${JSON.stringify({
        currentLocation: stateChanges.currentLocation || null,
        npcs: (stateChanges.npcs || []).map((n) => ({ name: n.name, action: n.action, location: n.location })),
      })}`
    : 'No state changes applied.';

  const userPrompt = `${graphContext}

## SCENE DATA
Player action: ${playerAction || 'N/A'}

Scene narrative:
${sceneText || 'N/A'}

${appliedChanges}

Extract graph updates as JSON.`;

  try {
    const { text } = await callAIJson({
      provider,
      modelTier: 'nano',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1500,
      temperature: 0.3,
      userApiKeys,
    });

    const parsed = JSON.parse(text);
    const result = GraphUpdateSchema.safeParse(parsed);
    if (!result.success) {
      log.warn({ errors: result.error?.issues, campaignId }, 'Graph extraction output failed validation');
      return null;
    }
    return result.data;
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'Graph extraction call failed');
    return null;
  }
}
