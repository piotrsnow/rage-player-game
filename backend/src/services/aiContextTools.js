import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { searchCampaignMemory, searchCodex, searchNPCs } from './vectorSearchService.js';
import { embedText } from './embeddingService.js';
import { formatWeaponCatalog, searchBestiary } from '../data/wfrpEquipment.js';

/**
 * Tool definitions for OpenAI/Anthropic function calling.
 * AI uses these to dynamically fetch campaign context.
 */
export const CONTEXT_TOOLS_OPENAI = [
  {
    type: 'function',
    function: {
      name: 'search_campaign_memory',
      description:
        'Semantic search through campaign history - past scenes, events, decisions, and lore. Use when you need to recall specific past events, find connections between story elements, or remember details about earlier encounters.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "What to search for (e.g. 'dragon attack on village', 'conversation with merchant about curse')",
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_npc_details',
      description:
        'Get full details about an NPC - personality, disposition, relationships, faction, last known location. Use when the player interacts with or mentions an NPC.',
      parameters: {
        type: 'object',
        properties: {
          npc_name: { type: 'string', description: 'Name of the NPC to look up' },
        },
        required: ['npc_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quest_details',
      description:
        'Get full quest information including objectives, rewards, quest giver, and progress. Use when the player asks about quests or takes quest-related actions.',
      parameters: {
        type: 'object',
        properties: {
          quest_name: { type: 'string', description: 'Name or keyword of the quest' },
        },
        required: ['quest_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_location_history',
      description:
        'Get history and details of a location - past visits, NPCs encountered there, events that happened. Use when the player enters or asks about a location.',
      parameters: {
        type: 'object',
        properties: {
          location_name: { type: 'string', description: 'Name of the location' },
        },
        required: ['location_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_codex_entry',
      description:
        'Look up discovered lore, artifacts, factions, or world knowledge from the player\'s codex. Use when referencing world lore or discovered secrets.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Topic to search for in the codex',
          },
        },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_equipment_catalog',
      description:
        'Get available weapons and armor with damage formulas, qualities, and AP values. MUST use before creating combatUpdate enemies or giving items to the player. Weapon/armor names in your response MUST match catalog names exactly.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['weapons', 'armor', 'all'],
            description: 'Which equipment category to retrieve (default: all)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_bestiary',
      description:
        'Get WFRP stat block templates for common enemies (Skaven, Beastmen, Greenskins, Undead, Chaos, Animals, Humans). Use when creating combatUpdate enemies — copy or adapt stat blocks from here instead of inventing stats.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Enemy type or name to search for (e.g. "bandit", "skaven", "undead", "low threat")',
          },
        },
        required: ['query'],
      },
    },
  },
];

/**
 * Convert tools to Anthropic format.
 */
export const CONTEXT_TOOLS_ANTHROPIC = CONTEXT_TOOLS_OPENAI.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters,
}));

/**
 * Execute a tool call and return the result as a string.
 */
export async function executeToolCall(campaignId, toolName, toolArgs) {
  switch (toolName) {
    case 'search_campaign_memory':
      return await handleSearchMemory(campaignId, toolArgs.query);

    case 'get_npc_details':
      return await handleGetNPC(campaignId, toolArgs.npc_name);

    case 'get_quest_details':
      return await handleGetQuest(campaignId, toolArgs.quest_name);

    case 'get_location_history':
      return await handleGetLocation(campaignId, toolArgs.location_name);

    case 'get_codex_entry':
      return await handleGetCodex(campaignId, toolArgs.topic);

    case 'get_equipment_catalog':
      return handleGetEquipmentCatalog(toolArgs.category);

    case 'get_bestiary':
      return handleGetBestiary(toolArgs.query);

    default:
      return `Unknown tool: ${toolName}`;
  }
}

async function handleSearchMemory(campaignId, query) {
  const results = await searchCampaignMemory(campaignId, query, { limit: 8 });

  if (results.length === 0) {
    return 'No relevant memories found for this query.';
  }

  return results
    .map((r) => {
      const prefix = r.type === 'scene' ? `[Scene ${r.sceneIndex}]` : `[${r.type}${r.importance ? ` (${r.importance})` : ''}]`;
      return `${prefix} ${r.content}`;
    })
    .join('\n\n');
}

async function handleGetNPC(campaignId, npcName) {
  // Try exact match first
  const npc = await prisma.campaignNPC.findFirst({
    where: {
      campaignId,
      name: { contains: npcName, mode: 'insensitive' },
    },
  });

  if (npc) {
    return formatNPC(npc);
  }

  // Fallback to vector search
  if (config.apiKeys.openai) {
    const queryEmbedding = await embedText(npcName);
    if (queryEmbedding) {
      const results = await searchNPCs(campaignId, queryEmbedding, { limit: 1, minScore: 0.6 });
      if (results.length > 0) {
        return formatNPC(results[0]);
      }
    }
  }

  return `No NPC found matching "${npcName}".`;
}

function formatNPC(npc) {
  const relationships =
    typeof npc.relationships === 'string' ? JSON.parse(npc.relationships) : npc.relationships || [];

  const lines = [
    `Name: ${npc.name}`,
    npc.gender !== 'unknown' ? `Gender: ${npc.gender}` : null,
    npc.role ? `Role: ${npc.role}` : null,
    npc.personality ? `Personality: ${npc.personality}` : null,
    `Attitude: ${npc.attitude}`,
    `Disposition: ${npc.disposition}`,
    `Alive: ${npc.alive}`,
    npc.lastLocation ? `Last seen: ${npc.lastLocation}` : null,
    npc.factionId ? `Faction: ${npc.factionId}` : null,
    npc.notes ? `Notes: ${npc.notes}` : null,
    relationships.length > 0
      ? `Relationships: ${relationships.map((r) => `${r.type}: ${r.npcName}`).join(', ')}`
      : null,
  ];

  // Try to find bestiary match for combat-relevant NPCs
  const bestiaryMatch = searchBestiary(npc.name) || searchBestiary(npc.role || '');
  if (bestiaryMatch) {
    lines.push(`\nCombat stats (bestiary match):\n${bestiaryMatch}`);
  } else {
    lines.push('\nNo bestiary match — if combat starts, use get_bestiary to find a similar enemy template and adapt it.');
  }

  return lines.filter(Boolean).join('\n');
}

async function handleGetQuest(campaignId, questName) {
  // Quests are stored in coreState, so load campaign
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { coreState: true },
  });

  if (!campaign) return 'Campaign not found.';

  const coreState = JSON.parse(campaign.coreState);
  const allQuests = [...(coreState.quests?.active || []), ...(coreState.quests?.completed || [])];

  const query = questName.toLowerCase();
  const match = allQuests.find(
    (q) => q.name?.toLowerCase().includes(query) || q.description?.toLowerCase().includes(query),
  );

  if (!match) return `No quest found matching "${questName}".`;

  const lines = [
    `Quest: ${match.name}`,
    `Type: ${match.type || 'unknown'}`,
    `Description: ${match.description || 'N/A'}`,
    match.completionCondition ? `Completion: ${match.completionCondition}` : null,
    match.questGiverId ? `Quest Giver: ${match.questGiverId}` : null,
  ];

  if (match.objectives?.length) {
    lines.push('Objectives:');
    for (const obj of match.objectives) {
      lines.push(`  ${obj.completed ? '[X]' : '[ ]'} ${obj.description}`);
    }
  }

  if (match.reward) {
    lines.push(`Reward: ${JSON.stringify(match.reward)}`);
  }

  return lines.filter(Boolean).join('\n');
}

async function handleGetLocation(campaignId, locationName) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { coreState: true },
  });

  if (!campaign) return 'Campaign not found.';

  const coreState = JSON.parse(campaign.coreState);
  const locations = coreState.world?.locations || [];

  const query = locationName.toLowerCase();
  const match = locations.find((l) => l.name?.toLowerCase().includes(query));

  if (!match) return `No location found matching "${locationName}".`;

  const lines = [
    `Location: ${match.name}`,
    match.description ? `Description: ${match.description}` : null,
    `Visit count: ${match.visitCount || 0}`,
    match.npcsHere?.length ? `NPCs here: ${match.npcsHere.join(', ')}` : null,
  ];

  // Search for scenes that mention this location
  if (config.apiKeys.openai) {
    const memories = await searchCampaignMemory(campaignId, `events at ${match.name}`, {
      limit: 3,
    });
    if (memories.length > 0) {
      lines.push('\nRecent events at this location:');
      for (const m of memories) {
        lines.push(`- ${m.content.slice(0, 200)}`);
      }
    }
  }

  return lines.filter(Boolean).join('\n');
}

async function handleGetCodex(campaignId, topic) {
  // Try text search first
  const codex = await prisma.campaignCodex.findFirst({
    where: {
      campaignId,
      name: { contains: topic, mode: 'insensitive' },
    },
  });

  if (codex) {
    return formatCodex(codex);
  }

  // Fallback to vector search
  if (config.apiKeys.openai) {
    const queryEmbedding = await embedText(topic);
    if (queryEmbedding) {
      const results = await searchCodex(campaignId, queryEmbedding, { limit: 1, minScore: 0.6 });
      if (results.length > 0) {
        return formatCodex(results[0]);
      }
    }
  }

  return `No codex entry found matching "${topic}".`;
}

function formatCodex(codex) {
  const fragments =
    typeof codex.fragments === 'string' ? JSON.parse(codex.fragments) : codex.fragments || [];

  const lines = [`${codex.name} [${codex.category}]`];

  for (const f of fragments) {
    lines.push(`- [${f.aspect || 'general'}] ${f.content} (source: ${f.source || 'unknown'})`);
  }

  return lines.join('\n');
}

function handleGetEquipmentCatalog(category = 'all') {
  return formatWeaponCatalog(category || 'all');
}

function handleGetBestiary(query) {
  if (!query) return 'Please provide a search query (enemy name, type, or threat level).';
  const result = searchBestiary(query);
  if (!result) return `No bestiary entries found matching "${query}". Try: bandit, skaven, undead, beastmen, chaos, wolf, bear, orc, goblin, or threat levels: trivial, low, medium, high, deadly.`;
  return result;
}
