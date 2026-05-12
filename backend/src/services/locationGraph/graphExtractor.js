import { callAIJson } from '../aiJsonCall.js';
import { buildExtractionContext } from './graphContextBuilder.js';
import { GraphUpdateSchema } from '../../../../shared/domain/locationGraph.js';
import { config } from '../../config.js';
import { childLogger } from '../../lib/logger.js';
import { wrapPlayerInput } from '../../../../shared/domain/playerInputSanitizer.js';

const log = childLogger({ module: 'graphExtractor' });

// In-memory quality tracking counters
const stats = { totalExtractions: 0, validationFailures: 0, emptyExtractions: 0 };
export function getExtractionStats() { return { ...stats }; }
export function resetExtractionStats() { stats.totalExtractions = 0; stats.validationFailures = 0; stats.emptyExtractions = 0; }

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
- NEVER use NPC or character names as location names. Locations must be geographic sites (buildings, rooms, areas, paths). If an NPC is mentioned, they belong in npcMoves, not newNodes

## SCALE (1-7, higher = larger)
7 = country/region, 6 = city/town, 5 = district/quarter, 4 = neighborhood/area, 3 = building complex/large building, 2 = house/single building, 1 = room/chamber.

## OUTPUT (JSON)
{
  "newNodes": [{ "name": "...", "type": "room|site|district|...", "scale": 3, "parentName": "...", "description": "...", "tags": [], "reason": "..." }],
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
Player action: ${wrapPlayerInput(playerAction || 'N/A')}

Scene narrative:
${sceneText || 'N/A'}

${appliedChanges}

Extract graph updates as JSON.`;

  const modelOverride = config.graphExtractionModel || undefined;
  const startMs = Date.now();

  try {
    const { text } = await callAIJson({
      provider,
      modelTier: 'nano',
      model: modelOverride,
      taskCategory: 'graphExtraction',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1500,
      temperature: 0.3,
      userApiKeys,
      taskType: 'graph-extraction',
      taskLabel: 'Location graph extraction',
    });

    stats.totalExtractions++;
    const elapsed = Date.now() - startMs;

    const parsed = JSON.parse(text);
    const result = GraphUpdateSchema.safeParse(parsed);
    if (!result.success) {
      stats.validationFailures++;
      log.warn({ errors: result.error?.issues, campaignId, elapsed, model: modelOverride || 'nano' }, 'Graph extraction output failed validation');
      return null;
    }

    const itemCount = (result.data.newNodes?.length || 0) + (result.data.newEdges?.length || 0)
      + (result.data.updatedEdges?.length || 0) + (result.data.npcMoves?.length || 0)
      + (result.data.discoveryChanges?.length || 0);

    if (itemCount === 0) stats.emptyExtractions++;

    log.info({ campaignId, elapsed, model: modelOverride || 'nano', items: itemCount }, 'Graph extraction complete');
    return result.data;
  } catch (err) {
    stats.totalExtractions++;
    stats.validationFailures++;
    log.warn({ err: err?.message, campaignId, elapsed: Date.now() - startMs }, 'Graph extraction call failed');
    return null;
  }
}
