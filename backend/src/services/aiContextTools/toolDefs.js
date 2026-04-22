import { handleSearchMemory } from './handlers/searchMemory.js';
import { handleGetNPC } from './handlers/npc.js';
import { handleGetQuest } from './handlers/quest.js';
import { handleGetLocation } from './handlers/location.js';
import { handleGetCodex } from './handlers/codex.js';
import { handleGetEquipmentCatalog, handleGetBestiary } from './handlers/equipment.js';

/**
 * Tool definitions for OpenAI/Anthropic function calling.
 *
 * NOTE: The two-stage pipeline (nano selection → assembleContext) is the only
 * path used by scene-gen. These tool defs + executeToolCall are retained only
 * because legacy non-scene paths could still reference them — verify before
 * deleting (see `knowledge/concepts/ai-context-assembly.md`).
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
        'Get full details about an NPC - personality, disposition, relationships, last known location. Use when the player interacts with or mentions an NPC.',
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
        'Look up discovered lore, artifacts, or world knowledge from the player\'s codex. Use when referencing world lore or discovered secrets.',
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
        'Get stat block templates for common enemies. Races: ludzie, orkowie, gobliny, nieumarli, zwierzeta, demony, trolle, pajaki, krasnoludy, elfy, niziolki. Difficulty tiers: trivial, low, medium, high, deadly. Use to review available enemies before creating combatUpdate.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Enemy race, name, or difficulty to search for (e.g. "bandyta", "orkowie", "nieumarli", "high")',
          },
        },
        required: ['query'],
      },
    },
  },
];

export const CONTEXT_TOOLS_ANTHROPIC = CONTEXT_TOOLS_OPENAI.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters,
}));

/**
 * Registry-based dispatch. Replaces the previous if-else chain with a map
 * so adding a tool is "export handler + wire one entry" instead of editing
 * a switch statement.
 */
const TOOL_HANDLERS = {
  search_campaign_memory: (campaignId, args) => handleSearchMemory(campaignId, args.query),
  get_npc_details:        (campaignId, args) => handleGetNPC(campaignId, args.npc_name),
  get_quest_details:      (campaignId, args) => handleGetQuest(campaignId, args.quest_name),
  get_location_history:   (campaignId, args) => handleGetLocation(campaignId, args.location_name),
  get_codex_entry:        (campaignId, args) => handleGetCodex(campaignId, args.topic),
  get_equipment_catalog:  (_campaignId, args) => handleGetEquipmentCatalog(args.category),
  get_bestiary:           (_campaignId, args) => handleGetBestiary(args.query),
};

export async function executeToolCall(campaignId, toolName, toolArgs) {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) return `Unknown tool: ${toolName}`;
  return handler(campaignId, toolArgs || {});
}
