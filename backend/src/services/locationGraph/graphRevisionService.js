import { callAIJson, parseJsonOrNull } from '../aiJsonCall.js';
import { childLogger } from '../../lib/logger.js';
import { EDGE_TYPE_NAMES, EDGE_CATEGORY_NAMES } from '../../../../shared/domain/locationGraph.js';
import { activeStyle } from '../../data/namingStyles/index.js';

const log = childLogger({ module: 'graphRevisionService' });

const VALID_DANGER_LEVELS = ['safe', 'moderate', 'dangerous', 'deadly'];

const ALLOWED_NODE_FIELDS = ['scale', 'tags', 'description', 'atmosphere', 'dangerLevel', 'biome'];
const ALLOWED_EDGE_FIELDS = ['edgeType', 'weight', 'category'];

const SYSTEM_PROMPT = `You are a world-building auditor for a Polish-language dark-fantasy RPG. You receive a location graph (nodes = places, edges = connections between them). Your job is to review it for consistency and quality, then return ONLY the entries that need corrections.

## REVIEW CHECKLIST

### Nodes
- **scale** (1-7): Must match the location hierarchy. Higher number = larger location. Guidelines:
  1 = room/chamber (pokój, komnata, jaskinia, cela, piwnica)
  2 = single building/house (dom, karczma, kuźnia, wieża, kaplica, sklep)
  3 = building complex/compound (zamek, klasztor, kompleks, targ, fort)
  4 = neighborhood/named area (dzielnica, port, nabrzeże) — RARE
  5 = district/quarter of a city — ONLY for large cities with distinct quarters
  6 = city/town (miasto, miasteczko, wioska)
  7 = country/region (królestwo, kraina)
  MOST locations should be 1-3. Scale 4+ is rare — do NOT default to 4 or 5.
  A child node must have a LOWER scale number than its parent (e.g. a room inside a house: parent scale 2, child scale 1).
- **tags**: Should have 2-5 descriptive tags. Fill empty arrays. Remove generic/meaningless tags. Tags should be lowercase Polish or English keywords describing the location's character (e.g. "handlowy", "mroczny", "kopalnia", "portowy").
- **description**: If empty or placeholder, write a 1-2 sentence atmospheric description in Polish. If adequate, leave unchanged.
- **atmosphere**: If empty or generic, write a short (max 200 chars) atmospheric note in Polish. If adequate, leave unchanged.
- **dangerLevel**: Must match context. Capitals and towns are usually "safe", forests and wilderness "moderate", dungeons and ruins "dangerous" or "deadly".
- **biome**: Should be consistent with neighbors and name. Common values: "forest", "mountain", "plains", "swamp", "desert", "tundra", "coastal", "underground", "urban", null.

### Edges
- **edgeType**: Must be one of the valid types. Common fixes: "road_to" between wilderness nodes should be "path_to" or "dangerous_path_to". Interior connections should be "door_to" or "stairs_to", not "road_to".
- **weight**: Distance plausibility. Roads between neighboring villages ~1.0-3.0. Doors/stairs ~0.1. Long wilderness paths ~5.0-15.0.
- **category**: Must match the edgeType's natural category (movement, structural, spatial, access, perception, social, narrative, temporal).

## RULES
- Return ONLY entries that need changes. Omit entries that are already correct.
- For each changed entry, include the "id" field and ONLY the fields you changed.
- Do NOT rename locations. Do NOT change regionX/regionY positions.
- Do NOT invent new nodes or edges. Only patch existing ones.
- Keep descriptions and atmosphere in Polish.

## VALID EDGE TYPES
${EDGE_TYPE_NAMES.join(', ')}

## VALID EDGE CATEGORIES
${EDGE_CATEGORY_NAMES.join(', ')}

## OUTPUT FORMAT (JSON)
{
  "nodes": [{ "id": "uuid", "scale": 3, "tags": ["tag1", "tag2"] }],
  "edges": [{ "id": "uuid", "edgeType": "path_to", "weight": 2.5 }],
  "reasoning": "Brief summary of what you changed and why"
}

If nothing needs changing, return: { "nodes": [], "edges": [], "reasoning": "Graph looks consistent — no changes needed." }`
  + (activeStyle.promptBlock ? `\n\n${activeStyle.promptBlock}` : '');

function buildUserPrompt(nodes, edges) {
  const nodeLines = nodes.map((n) => {
    const parts = [
      `id=${n.id}`,
      `name="${n.name}"`,
      `type=${n.type}`,
      `scale=${n.scale ?? '?'}`,
      `danger=${n.dangerLevel || '?'}`,
      `biome=${n.biome || 'null'}`,
    ];
    if (n.tags?.length) parts.push(`tags=[${n.tags.join(',')}]`);
    if (n.description) parts.push(`desc="${n.description.slice(0, 120)}"`);
    if (n.atmosphere) parts.push(`atm="${n.atmosphere.slice(0, 80)}"`);
    parts.push(`pos=(${(n.regionX ?? 0).toFixed(1)},${(n.regionY ?? 0).toFixed(1)})`);
    return parts.join(' | ');
  });

  const nodeNameById = new Map(nodes.map((n) => [n.id, n.name]));

  const edgeLines = edges.map((e) => {
    const fromName = nodeNameById.get(e.fromLocationId) || e.fromName || e.fromLocationId;
    const toName = nodeNameById.get(e.toLocationId) || e.toName || e.toLocationId;
    return [
      `id=${e.id}`,
      `"${fromName}" → "${toName}"`,
      `type=${e.edgeType}`,
      `cat=${e.category}`,
      `weight=${e.weight ?? 1}`,
      e.bidirectional ? 'bidir' : 'oneway',
    ].join(' | ');
  });

  return `## NODES (${nodeLines.length})\n${nodeLines.join('\n')}\n\n## EDGES (${edgeLines.length})\n${edgeLines.join('\n')}`;
}

function stripToAllowed(obj, allowedFields) {
  const out = {};
  for (const key of allowedFields) {
    if (key in obj) out[key] = obj[key];
  }
  return out;
}

function diffNode(patch, inputById) {
  const original = inputById.get(patch.id);
  if (!original) return null;
  const clean = stripToAllowed(patch, ALLOWED_NODE_FIELDS);
  const delta = { id: patch.id };
  let changed = false;
  for (const [key, val] of Object.entries(clean)) {
    const orig = original[key];
    if (key === 'tags') {
      const origSorted = [...(orig || [])].sort().join(',');
      const newSorted = [...(Array.isArray(val) ? val : [])].sort().join(',');
      if (origSorted !== newSorted) { delta[key] = val; changed = true; }
    } else if (key === 'dangerLevel' && !VALID_DANGER_LEVELS.includes(val)) {
      continue;
    } else if (String(val) !== String(orig ?? '')) {
      delta[key] = val;
      changed = true;
    }
  }
  return changed ? delta : null;
}

function diffEdge(patch, inputById) {
  const original = inputById.get(patch.id);
  if (!original) return null;
  const clean = stripToAllowed(patch, ALLOWED_EDGE_FIELDS);
  const delta = { id: patch.id };
  let changed = false;
  for (const [key, val] of Object.entries(clean)) {
    if (key === 'edgeType' && !EDGE_TYPE_NAMES.includes(val)) continue;
    if (key === 'category' && !EDGE_CATEGORY_NAMES.includes(val)) continue;
    const orig = original[key];
    if (String(val) !== String(orig ?? '')) {
      delta[key] = val;
      changed = true;
    }
  }
  return changed ? delta : null;
}

/**
 * Send the graph to an LLM for review. Returns a validated diff of patches.
 *
 * @param {{ nodes: object[], edges: object[], userApiKeys?: object|null, userId?: string|null }} opts
 * @returns {Promise<{ patches: { nodes: object[], edges: object[] }, reasoning: string }>}
 */
export async function reviseGraph({ nodes, edges, userApiKeys = null, userId = null }) {
  const userPrompt = buildUserPrompt(nodes, edges);

  const tokenBudget = Math.min(4000, 200 + nodes.length * 60 + edges.length * 30);

  const { text } = await callAIJson({
    provider: 'openai',
    modelTier: 'standard',
    taskCategory: 'graphRevision',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: tokenBudget,
    temperature: 0.3,
    userApiKeys,
    userId,
    taskType: 'graph_revision',
    taskLabel: `graph-revision: ${nodes.length} nodes, ${edges.length} edges`,
  });

  const parsed = parseJsonOrNull(text);
  if (!parsed) {
    log.warn('AI returned unparseable response for graph revision');
    return { patches: { nodes: [], edges: [] }, reasoning: 'AI response was not valid JSON.' };
  }

  const nodeInputById = new Map(nodes.map((n) => [n.id, n]));
  const edgeInputById = new Map(edges.map((e) => [e.id, e]));

  const nodePatches = (parsed.nodes || [])
    .map((p) => diffNode(p, nodeInputById))
    .filter(Boolean);

  const edgePatches = (parsed.edges || [])
    .map((p) => diffEdge(p, edgeInputById))
    .filter(Boolean);

  log.info({ nodePatches: nodePatches.length, edgePatches: edgePatches.length }, 'Graph revision complete');

  return {
    patches: { nodes: nodePatches, edges: edgePatches },
    reasoning: parsed.reasoning || '',
  };
}
