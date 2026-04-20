import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { searchCampaignMemory, searchCodex, searchNPCs } from './vectorSearchService.js';
import { embedText } from './embeddingService.js';
import { formatWeaponCatalog, formatBaseTypeCatalog, searchBestiary } from '../data/equipment/index.js';
import { getLocationSummary } from './memoryCompressor.js';
import { childLogger } from '../lib/logger.js';
import { findOrCreateWorldLocation, listNpcsAtLocation } from './livingWorld/worldStateService.js';
import { forLocation as worldEventsForLocation, parseEventPayload } from './livingWorld/worldEventLog.js';
import { getCompanions } from './livingWorld/companionService.js';
import { getReputationProfile, maybeClearVendetta } from './livingWorld/reputationService.js';
import { suggestEncounterMode } from './livingWorld/encounterEscalator.js';
import { readDmAgentState } from './livingWorld/dmMemoryService.js';
import { getTemplate, isGeneratedLocationType, effectiveCustomCap } from './livingWorld/settlementTemplates.js';
import { computeSubLocationBudget } from './livingWorld/topologyGuard.js';
import { loadCampaignGraph, dijkstra, classifyDetour, expandPath } from './livingWorld/travelGraph.js';
import { generateTravelEvents } from './livingWorld/travelEventGenerator.js';
import { loadDiscovery } from './livingWorld/userDiscoveryService.js';
import { parseRoomMetadata } from './livingWorld/dungeonSeedGenerator.js';
import { localizeRoomMetadata, normalizeLanguage } from './livingWorld/contentLocalizer.js';

const log = childLogger({ module: 'aiContextTools' });

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
  let results;
  try {
    results = await searchCampaignMemory(campaignId, query, { limit: 8 });
  } catch (err) {
    log.warn({ err, campaignId }, 'Memory search skipped');
    return 'Memory search unavailable.';
  }

  if (!results || results.length === 0) {
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

  // Fallback to vector search (graceful — skip if embedding API unavailable/quota exceeded)
  if (config.apiKeys.openai) {
    try {
      const queryEmbedding = await embedText(npcName);
      if (queryEmbedding) {
        const results = await searchNPCs(campaignId, queryEmbedding, { limit: 1, minScore: 0.6 });
        if (results.length > 0) {
          return formatNPC(results[0]);
        }
      }
    } catch (err) {
      log.warn({ err, campaignId, npcName }, 'NPC vector search skipped');
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
  const query = questName.toLowerCase();

  // Try normalized CampaignQuest first
  const dbQuests = await prisma.campaignQuest.findMany({ where: { campaignId } });

  let match;
  if (dbQuests.length > 0) {
    match = dbQuests.find(
      (q) => q.name?.toLowerCase().includes(query) || q.description?.toLowerCase().includes(query),
    );
    if (match) {
      const objectives = JSON.parse(match.objectives || '[]');
      const reward = match.reward ? JSON.parse(match.reward) : null;
      const lines = [
        `Quest: ${match.name}`,
        `Status: ${match.status}`,
        `Type: ${match.type || 'unknown'}`,
        `Description: ${match.description || 'N/A'}`,
        match.completionCondition ? `Completion: ${match.completionCondition}` : null,
        match.questGiverId ? `Quest Giver: ${match.questGiverId}` : null,
      ];
      if (objectives.length) {
        lines.push('Objectives:');
        for (const obj of objectives) {
          lines.push(`  ${obj.completed ? '[X]' : '[ ]'} ${obj.description}`);
        }
      }
      if (reward) lines.push(`Reward: ${JSON.stringify(reward)}`);
      return lines.filter(Boolean).join('\n');
    }
  }

  // Fallback: read from coreState (pre-migration campaigns)
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { coreState: true },
  });
  if (!campaign) return 'Campaign not found.';

  const coreState = JSON.parse(campaign.coreState);
  const allQuests = [...(coreState.quests?.active || []), ...(coreState.quests?.completed || [])];
  match = allQuests.find(
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
  if (match.reward) lines.push(`Reward: ${JSON.stringify(match.reward)}`);
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

  // Search for scenes that mention this location (graceful — skip if embedding API unavailable)
  if (config.apiKeys.openai) {
    let memories = [];
    try {
      memories = await searchCampaignMemory(campaignId, `events at ${match.name}`, { limit: 3 });
    } catch (err) {
      log.warn({ err, campaignId, location: match.name }, 'Location memory search skipped');
    }
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

  // Fallback to vector search (graceful — skip if embedding API unavailable/quota exceeded)
  if (config.apiKeys.openai) {
    try {
      const queryEmbedding = await embedText(topic);
      if (queryEmbedding) {
        const results = await searchCodex(campaignId, queryEmbedding, { limit: 1, minScore: 0.6 });
        if (results.length > 0) {
          return formatCodex(results[0]);
        }
      }
    } catch (err) {
      log.warn({ err, campaignId, topic }, 'Codex vector search skipped');
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
  const catalog = formatWeaponCatalog(category || 'all');
  const baseTypes = formatBaseTypeCatalog();
  return `${catalog}\n\n${baseTypes}`;
}

function handleGetBestiary(query) {
  if (!query) return 'Please provide a search query (enemy name, type, or threat level).';
  const result = searchBestiary(query);
  if (!result) return `No bestiary entries found matching "${query}". Try: bandyta, orkowie, gobliny, nieumarli, zwierzeta, demony, trolle, pajaki, krasnoludy, elfy, niziolki, or difficulty: trivial, low, medium, high, deadly.`;
  return result;
}

// ── EXPORTED HANDLERS (for 2-stage pipeline) ──

export {
  handleSearchMemory,
  handleGetNPC,
  handleGetQuest,
  handleGetLocation,
  handleGetCodex,
  handleGetEquipmentCatalog,
  handleGetBestiary,
};

// ── CONTEXT ASSEMBLY ──

/**
 * Assemble expanded context based on intent classifier selection result.
 * All DB queries run in parallel via Promise.all.
 *
 * @param {string} campaignId
 * @param {object} selectionResult - Output from classifyIntent()
 * @param {string} currentLocation - Current location name (for expand_location)
 * @returns {Promise<object>} Grouped context blocks: { npcs, quests, location, codex, memory }
 */
export async function assembleContext(campaignId, selectionResult, currentLocation, skipKeys = {}, { provider = 'openai', timeoutMs = 5000 } = {}) {
  const fetches = [];

  // Encje już obecne w dynamicSuffix promptu (Key NPCs / Active Quests / ALREADY DISCOVERED).
  // Pomijamy je w EXPANDED CONTEXT, żeby nie dublować tych samych danych dwa razy.
  const skipNpcs = new Set((skipKeys.npcs || []).map(s => String(s).toLowerCase()));
  const skipQuests = new Set((skipKeys.quests || []).map(s => String(s).toLowerCase()));
  const skipCodex = new Set((skipKeys.codex || []).map(s => String(s).toLowerCase()));

  // Living World — fetch recent WorldEvents at the current location (and the
  // canonical NPCs present there) when the campaign has the feature enabled.
  // Runs in parallel with other context fetches; failures are non-fatal.
  // Passes travel intent so the block can include a TRAVEL CONTEXT section.
  if (currentLocation) {
    fetches.push(
      buildLivingWorldContext(campaignId, currentLocation, {
        travelTarget: selectionResult?._intent === 'travel' ? selectionResult._travelTarget : null,
        provider,
        timeoutMs,
      })
        .then((data) => ({ type: 'livingWorld', data }))
        .catch((err) => {
          log.warn({ err: err?.message, campaignId }, 'livingWorld context fetch failed');
          return { type: 'livingWorld', data: null };
        }),
    );
  }

  // Expand selected NPCs
  for (const name of selectionResult.expand_npcs || []) {
    if (skipNpcs.has(name.toLowerCase())) continue;
    fetches.push(
      handleGetNPC(campaignId, name).then(r => ({ type: 'npc', key: name, data: r }))
    );
  }

  // Expand selected quests
  for (const name of selectionResult.expand_quests || []) {
    if (skipQuests.has(name.toLowerCase())) continue;
    fetches.push(
      handleGetQuest(campaignId, name).then(r => ({ type: 'quest', key: name, data: r }))
    );
  }

  // Expand location + include location summary from previous visits
  if (selectionResult.expand_location && currentLocation) {
    fetches.push(
      Promise.all([
        handleGetLocation(campaignId, currentLocation),
        getLocationSummary(campaignId, currentLocation),
      ]).then(([locationData, summary]) => ({
        type: 'location',
        data: summary ? `${locationData}\n\n${summary}` : locationData,
      }))
    );
  }

  // Expand codex entries
  for (const topic of selectionResult.expand_codex || []) {
    if (skipCodex.has(topic.toLowerCase())) continue;
    fetches.push(
      handleGetCodex(campaignId, topic).then(r => ({ type: 'codex', key: topic, data: r }))
    );
  }

  // Semantic search through campaign history
  if (selectionResult.needs_memory_search && selectionResult.memory_query) {
    fetches.push(
      handleSearchMemory(campaignId, selectionResult.memory_query).then(r => ({ type: 'memory', data: r }))
    );
  }

  if (fetches.length === 0) {
    return { npcs: {}, quests: {}, location: null, codex: {}, memory: null, livingWorld: null };
  }

  const results = await Promise.all(fetches);
  return groupByType(results);
}

function groupByType(results) {
  const grouped = { npcs: {}, quests: {}, location: null, codex: {}, memory: null, livingWorld: null };

  for (const r of results) {
    switch (r.type) {
      case 'npc':
        grouped.npcs[r.key] = r.data;
        break;
      case 'quest':
        grouped.quests[r.key || 'default'] = r.data;
        break;
      case 'location':
        grouped.location = r.data;
        break;
      case 'codex':
        grouped.codex[r.key] = r.data;
        break;
      case 'memory':
        grouped.memory = r.data;
        break;
      case 'livingWorld':
        grouped.livingWorld = r.data;
        break;
    }
  }

  return grouped;
}

/**
 * Build a Living World context block for the current location.
 *
 * Returns null when the campaign has livingWorldEnabled=false (so the
 * legacy flow stays untouched) or when no relevant world data exists.
 *
 * Shape: { locationName, npcs: [{name, role, paused}], recentEvents: [{type, blurb, at}] }
 */
async function buildLivingWorldContext(campaignId, currentLocation, { travelTarget = null, provider = 'openai', timeoutMs = 5000 } = {}) {
  // Cheap check — if the flag is off we do nothing.
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      livingWorldEnabled: true,
      characterIds: true,
      userId: true,
      worldBounds: true,
      settlementCaps: true,
      difficultyTier: true,
      user: { select: { contentLanguage: true } },
    },
  });
  if (!campaign?.livingWorldEnabled) return null;

  const contentLanguage = normalizeLanguage(campaign.user?.contentLanguage);

  const location = await findOrCreateWorldLocation(currentLocation);
  if (!location) return null;

  const actorCharacterId = Array.isArray(campaign.characterIds) && campaign.characterIds[0]
    ? campaign.characterIds[0]
    : null;

  // Parallel: NPCs at this location (canonical) + recent world events +
  // any companions travelling with the party (Phase 2) + lazy vendetta clear
  // + Phase 4 DM agent memory.
  const [npcs, events, companions, , dmState] = await Promise.all([
    listNpcsAtLocation(location.id, { aliveOnly: true }).catch(() => []),
    worldEventsForLocation({
      locationId: location.id,
      campaignId,
      limit: 12,
    }).catch(() => []),
    getCompanions(campaignId).catch(() => []),
    actorCharacterId
      ? maybeClearVendetta(actorCharacterId).catch(() => null)
      : Promise.resolve(null),
    readDmAgentState(campaignId).catch(() => ({ dmMemory: [], pendingHooks: [] })),
  ]);

  // Filter events to those that carry useful narrative for the next scene.
  // Phase 1 surfaces resume_summary blurbs and headline events (moves, kills,
  // quest completions). Phase 3 will widen to include cross-user events.
  const NARRATIVE_TYPES = new Set([
    'resume_summary',
    'moved',
    'killed',
    'quest_complete',
    'returned_from_journey',
  ]);
  const recentEvents = events
    .filter((e) => NARRATIVE_TYPES.has(e.eventType))
    .map((e) => {
      const payload = parseEventPayload(e);
      return {
        type: e.eventType,
        blurb: payload?.blurb || payload?.summary || null,
        at: e.createdAt,
      };
    })
    .filter((e) => e.blurb || e.type !== 'resume_summary'); // resume_summary without a blurb adds no signal

  // Exclude companions from ambient "NPCs here" list — they're rendered
  // separately with inParty + loyalty context.
  const companionIds = new Set(companions.map((c) => c.id));
  const ambientNpcs = npcs.filter((n) => !companionIds.has(n.id));

  // Phase 3 — reputation profile + encounter mode hint. Scoped to global +
  // current region + settlement.
  let reputation = null;
  let encounter = null;
  if (actorCharacterId) {
    try {
      const profile = await getReputationProfile({
        characterId: actorCharacterId,
        region: location.region || null,
        settlementKey: location.canonicalName || null,
      });
      if (profile?.rows?.length > 0) {
        reputation = profile;
        encounter = suggestEncounterMode(profile);
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId }, 'reputation profile fetch failed');
    }
  }

  const hasDmState = (dmState?.dmMemory?.length || 0) > 0 || (dmState?.pendingHooks?.length || 0) > 0;

  // Phase 7 — settlement topology block. If the player is in a sublocation
  // we reference the PARENT settlement for caps + slot budget; otherwise
  // use the current top-level location. Dungeons bypass (seed generator
  // handles their rooms directly). Phase E — pass difficultyTier so the
  // prompt surface reflects the campaign's effective custom-cap budget.
  const settlement = await buildSettlementBlock(location, campaign.difficultyTier).catch(() => null);

  // Phase A — SEEDED SETTLEMENTS. Lists all settlement-type WorldLocations
  // within the campaign's worldBounds (set by worldSeeder at creation time)
  // PLUS the global capital Yeralden. Tells premium which named settlements
  // the world already has so it prefers reuse over invention.
  const seededSettlements = await buildSeededSettlementsBlock(campaign, location).catch((err) => {
    log.warn({ err: err?.message, campaignId }, 'seededSettlements block failed');
    return null;
  });

  // Phase 7 — travel block. Only built when the classifier flagged a travel
  // intent AND we can resolve both endpoints. Null if no path or trivial
  // (same location / single hop).
  let travel = null;
  if (travelTarget && campaign.userId) {
    travel = await buildTravelBlock({
      campaignId,
      userId: campaign.userId,
      startLocation: location,
      targetName: travelTarget,
      provider,
      timeoutMs,
    }).catch((err) => {
      log.warn({ err: err?.message, campaignId, travelTarget }, 'travel block build failed');
      return null;
    });
  }

  // Phase 7 — dungeon room block. Active only when the player is CURRENTLY
  // inside a dungeon room (locationType='dungeon_room'). Fetches adjacent
  // rooms for exit narration. Tells premium to narrate deterministic
  // contents EXACTLY — no inventing enemies/loot. Localized to the user's
  // contentLanguage so the deterministic text feeds into the AI in the
  // same language as the narrative output.
  let dungeon = null;
  if (location.locationType === 'dungeon_room') {
    dungeon = await buildDungeonRoomBlock(location, contentLanguage).catch((err) => {
      log.warn({ err: err?.message, locationId: location.id }, 'dungeon block build failed');
      return null;
    });
  }

  // Phase C — saturation-curve hint. Compute settlement budget (against the
  // campaign's worldBounds + settlementCaps) and NPC budget (key cap vs
  // ambient + background for the CURRENT top-level settlement). Pushes
  // premium toward reuse when either budget gets tight. Null when we can't
  // compute (missing caps / bounds) so the context block stays quiet.
  const saturation = await buildSaturationHint({
    campaign,
    location,
    ambientNpcCount: ambientNpcs.length,
  }).catch(() => null);

  if (
    ambientNpcs.length === 0
    && recentEvents.length === 0
    && companions.length === 0
    && !reputation
    && !hasDmState
    && !settlement
    && !travel
    && !dungeon
    && !seededSettlements
    && !saturation
  ) {
    return null;
  }

  // Phase 5 — for ambient NPCs, surface activeGoal + recent goalProgress
  // milestones + "recentlyArrived" flag, BUT only when the goal targets
  // THIS campaign (prevents WorldNPC goal text referencing another user's
  // character from leaking into this prompt). Non-matching NPCs get only
  // name/role/paused (the "has own agenda" view).
  const ambientNpcsWithGoals = ambientNpcs.map((n) => {
    const goalForThisCampaign = n.goalTargetCampaignId === campaignId;
    let progress = null;
    try {
      progress = n.goalProgress ? JSON.parse(n.goalProgress) : null;
    } catch { progress = null; }
    const milestones = Array.isArray(progress?.milestones) ? progress.milestones.slice(-2) : [];
    // "Just arrived" = last tick's action was a move to this location on
    // the scene that just finished. Surface only within the observing
    // campaign so premium can narrate "NPC wchodzi zdyszany".
    const recentlyArrived = goalForThisCampaign
      && progress?.lastAction === 'move'
      && typeof progress?.step === 'number';
    // G3 — radiant quest offer hint. When the background goal was tagged
    // offerable, premium gets a marker so it MAY propose a newQuest in
    // stateChanges (with source: 'npc_radiant'). Non-binding — premium
    // decides based on player behaviour.
    const radiantOffer = goalForThisCampaign && progress?.offerableAsQuest && progress?.questTemplate
      ? { template: progress.questTemplate }
      : null;
    return {
      name: n.name,
      role: n.role || null,
      paused: !!n.pausedAt,
      activeGoal: goalForThisCampaign ? (n.activeGoal || null) : null,
      recentMilestones: goalForThisCampaign ? milestones : [],
      recentlyArrived,
      radiantOffer,
    };
  });

  // Background NPC label + key-vs-background split — Phase 7. Key NPCs are
  // WorldNPCs with keyNpc=true; everyone else in `npcs` stays as ambient
  // generic flavor that premium should describe without naming.
  const keyAmbient = ambientNpcsWithGoals.filter((n, i) => ambientNpcs[i]?.keyNpc !== false);
  const backgroundCount = ambientNpcs.length - keyAmbient.length;

  return {
    locationName: location.canonicalName,
    locationType: location.locationType || 'generic',
    npcs: keyAmbient,
    backgroundCount,
    backgroundLabel: settlement?.backgroundLabel || null,
    settlement,
    companions: companions.map((c) => ({
      name: c.name,
      role: c.role || null,
      loyalty: typeof c.companionLoyalty === 'number' ? c.companionLoyalty : 50,
      joinedAt: c.companionJoinedAt ? new Date(c.companionJoinedAt).toISOString() : null,
    })),
    recentEvents,
    reputation: reputation
      ? {
          rows: reputation.rows.map((r) => ({
            scope: r.scope,
            scopeKey: r.scopeKey,
            score: r.score,
            label: r.reputationLabel,
          })),
        }
      : null,
    encounter,
    dmAgent: hasDmState
      ? {
          // Inject last few memory lines + highest-priority pending hooks.
          // Cap tight so the block doesn't bloat — Phase 4 intentionally
          // narrow; full orchestration lives in the ideas file.
          dmMemory: (dmState.dmMemory || []).slice(-6),
          pendingHooks: (dmState.pendingHooks || [])
            .slice()
            .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
            .slice(0, 4),
        }
      : null,
    travel,
    dungeon,
    seededSettlements,
    saturation,
  };
}

/**
 * Phase C — compute saturation budgets for the current campaign + location.
 *
 * Settlement budget: (cap - existing) / cap across the campaign's worldBounds.
 *   Capital excluded (global, shared across campaigns).
 *
 * NPC budget: (cap - occupants) / cap for the CURRENT top-level settlement.
 *   Uses parent settlement when the player is in a sublocation.
 *
 * Returns null when neither can be computed (missing caps / bounds / location
 * cap). Otherwise returns { settlementBudget, npcBudget, level: 'tight'|'watch'|null }.
 * `level` is the thresholded tier — 'tight' at <0.2, 'watch' at <0.5 on
 * whichever ratio is lower. null means no hint needed.
 */
async function buildSaturationHint({ campaign, location, ambientNpcCount = 0 }) {
  let caps = null;
  let bounds = null;
  try { caps = campaign?.settlementCaps ? JSON.parse(campaign.settlementCaps) : null; } catch { caps = null; }
  try { bounds = campaign?.worldBounds ? JSON.parse(campaign.worldBounds) : null; } catch { bounds = null; }

  let settlementBudget = null;
  if (caps && bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX)) {
    const capTotal = ['hamlet', 'village', 'town', 'city']
      .reduce((a, t) => a + (Number(caps[t]) || 0), 0);
    if (capTotal > 0) {
      const existing = await prisma.worldLocation.count({
        where: {
          parentLocationId: null,
          locationType: { in: ['hamlet', 'village', 'town', 'city'] },
          regionX: { gte: bounds.minX, lte: bounds.maxX },
          regionY: { gte: bounds.minY, lte: bounds.maxY },
        },
      });
      settlementBudget = Math.max(0, Math.min(1, (capTotal - existing) / capTotal));
    }
  }

  // Resolve parent settlement for NPC budget (sublocation → walk up).
  let settlementForNpcs = location;
  if (location.parentLocationId) {
    const parent = await prisma.worldLocation.findUnique({
      where: { id: location.parentLocationId },
      select: { id: true, maxKeyNpcs: true, locationType: true },
    });
    if (parent) settlementForNpcs = parent;
  }
  let npcBudget = null;
  const npcCap = Number(settlementForNpcs?.maxKeyNpcs) || 0;
  if (npcCap > 0) {
    const keyNpcCount = await prisma.worldNPC.count({
      where: { currentLocationId: settlementForNpcs.id, keyNpc: true, alive: true },
    }).catch(() => ambientNpcCount);
    npcBudget = Math.max(0, Math.min(1, (npcCap - keyNpcCount) / npcCap));
  }

  if (settlementBudget === null && npcBudget === null) return null;

  const lowest = Math.min(
    settlementBudget ?? 1,
    npcBudget ?? 1,
  );
  let level = null;
  if (lowest < 0.2) level = 'tight';
  else if (lowest < 0.5) level = 'watch';

  return {
    settlementBudget,
    npcBudget,
    level,
  };
}

/**
 * Phase A — build SEEDED SETTLEMENTS block for a campaign. Lists every
 * settlement-type WorldLocation inside the campaign's worldBounds (or loosely
 * anchored via discovered edges if bounds are unset) plus the global capital
 * Yeralden. Returns null when bounds are unset OR no settlements exist yet.
 *
 * The premium prompt uses this to prefer existing settlements over inventing
 * new ones. Mid-play settlement creation is already blocked in
 * `processTopLevelEntry` — this block is the carrot to the stick.
 */
async function buildSeededSettlementsBlock(campaign, currentLocation) {
  const SETTLEMENT_TYPES = ['hamlet', 'village', 'town', 'city', 'capital'];
  let bounds = null;
  try {
    bounds = campaign?.worldBounds ? JSON.parse(campaign.worldBounds) : null;
  } catch { bounds = null; }

  // Fetch capital (always visible) + in-bounds settlements.
  const capital = await prisma.worldLocation.findFirst({
    where: { locationType: 'capital', regionX: 0, regionY: 0 },
    select: { canonicalName: true, locationType: true, regionX: true, regionY: true, description: true },
  });

  let settlementsInBounds = [];
  if (bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX)) {
    settlementsInBounds = await prisma.worldLocation.findMany({
      where: {
        parentLocationId: null,
        locationType: { in: SETTLEMENT_TYPES.filter((t) => t !== 'capital') },
        regionX: { gte: bounds.minX, lte: bounds.maxX },
        regionY: { gte: bounds.minY, lte: bounds.maxY },
      },
      select: { canonicalName: true, locationType: true, regionX: true, regionY: true, description: true },
      take: 40,
    });
  }

  const all = [];
  if (capital) all.push({ ...capital, isCapital: true });
  for (const s of settlementsInBounds) all.push({ ...s, isCapital: false });

  if (all.length === 0) return null;

  // Distance from current location (approx km) so premium understands travel scale.
  const cx = currentLocation?.regionX ?? 0;
  const cy = currentLocation?.regionY ?? 0;
  const entries = all.map((s) => {
    const dx = (s.regionX ?? 0) - cx;
    const dy = (s.regionY ?? 0) - cy;
    const distanceKm = Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;
    return {
      name: s.canonicalName,
      type: s.locationType,
      isCapital: s.isCapital,
      distanceKm,
      description: s.description || null,
    };
  });
  entries.sort((a, b) => a.distanceKm - b.distanceKm);

  let caps = null;
  try { caps = campaign?.settlementCaps ? JSON.parse(campaign.settlementCaps) : null; } catch { caps = null; }

  return { entries, caps };
}

function priorityRank(p) {
  if (p === 'high') return 2;
  if (p === 'low') return 0;
  return 1;
}

// Phase 7 — background NPC label per location type (narration hint so premium
// talks collectively about villagers/townsfolk/guards instead of naming them).
const BACKGROUND_LABEL = {
  hamlet:     'Wieśniak/Wieśniaczka',
  village:    'Wieśniak/Wieśniaczka',
  town:       'Mieszczanin/Mieszczanka',
  city:       'Mieszczanin/Mieszczanka',
  capital:    'Mieszczanin/Mieszczanka',
  wilderness: 'Podróżny/Podróżna',
};

/**
 * Build the Phase 7 TRAVEL CONTEXT block. Resolves target by fuzzy name,
 * runs Dijkstra on the campaign-visible graph, classifies detour, and
 * (for sensible multi-hop paths) asks nano for 3-5 candidate narrative
 * beats. Null on: missing target, same-location, or no known path — in
 * which case premium narrates travel as "no known path, you wander".
 */
async function buildTravelBlock({ campaignId, userId, startLocation, targetName, provider, timeoutMs }) {
  if (!startLocation?.id || !targetName) return null;

  const target = await findOrCreateWorldLocation(targetName).catch(() => null);
  if (!target?.id || target.id === startLocation.id) return null;

  // Only consider the user's discovered graph. Capital is always in the set;
  // everything else must have been visited. Unknown targets → no path, scene
  // falls back to exploration narration (Iteracja 2 will handle this path).
  const { locationIds } = await loadDiscovery(userId);
  if (!locationIds.has(target.id)) {
    return {
      kind: 'unknown_target',
      targetName: target.canonicalName,
      startName: startLocation.canonicalName,
    };
  }

  const adj = await loadCampaignGraph(campaignId);
  const route = dijkstra(adj, startLocation.id, target.id);
  if (!route) {
    return {
      kind: 'no_path',
      targetName: target.canonicalName,
      startName: startLocation.canonicalName,
    };
  }
  if (route.hops === 0) return null;

  const pathLocations = await expandPath(route.path);
  if (pathLocations.length < 2) return null;

  const detour = classifyDetour({
    pathDistance: route.distance,
    start: pathLocations[0],
    end: pathLocations[pathLocations.length - 1],
  });

  // Worst-edge difficulty on the chosen path — used as difficulty hint for
  // the candidate event generator. Cheap re-read: pull edges by (from,to)
  // pairs so we can read stored difficulty / terrain.
  let worstDifficulty = 'safe';
  let totalTerrain = new Set();
  for (let i = 0; i < route.path.length - 1; i++) {
    const neighbors = adj.get(route.path[i]) || [];
    const next = neighbors.find((n) => n.toId === route.path[i + 1]);
    if (!next) continue;
    if (DIFFICULTY_RANK[next.difficulty] > DIFFICULTY_RANK[worstDifficulty]) {
      worstDifficulty = next.difficulty;
    }
    if (next.terrainType) totalTerrain.add(next.terrainType);
  }

  // Multi-hop direct/sensible paths get candidate events. Trivial (1 hop) or
  // long (>2.0 ratio, Iteracja 2) skip the nano call.
  let candidateEvents = null;
  if (route.hops >= 2 && (detour === 'direct' || detour === 'sensible')) {
    candidateEvents = await generateTravelEvents({
      pathLocations,
      totalDifficulty: worstDifficulty,
      provider,
      timeoutMs,
    }).catch(() => null);
  }

  // Phase F — montage mode: when the known-path trip is > 5 km AND sensible/
  // direct, force ONE compressed scene instead of multi-scene wandering.
  // Pre-rolls are suppressed by the caller when this flag is set.
  const montage = (detour === 'direct' || detour === 'sensible') && route.distance > 5;

  return {
    kind: 'path',
    startName: startLocation.canonicalName,
    targetName: target.canonicalName,
    waypoints: pathLocations.map((l) => ({
      name: l.canonicalName,
      locationType: l.locationType || 'generic',
    })),
    totalDistance: Number(route.distance.toFixed(2)),
    hops: route.hops,
    detour,
    difficulty: worstDifficulty,
    terrains: [...totalTerrain],
    candidateEvents,
    montage,
  };
}

const DIFFICULTY_RANK = { safe: 0, moderate: 1, dangerous: 2, deadly: 3 };

/**
 * Build the DUNGEON ROOM block for the current room. Loads adjacent rooms
 * for exit narration, parses the deterministic contents, and marks whether
 * the room has already been cleared (so premium narrates aftermath instead
 * of repeating combat).
 *
 * Note: per-character cleared state is tracked in Character.activeDungeonState
 * (transient) and Character.clearedDungeonIds (permanent). This block only
 * surfaces the static room data; the caller (sceneGenerator) decides whether
 * to merge character-side state before rendering.
 */
async function buildDungeonRoomBlock(roomLocation, contentLanguage = 'pl') {
  if (!roomLocation?.id) return null;
  const rawMeta = parseRoomMetadata(roomLocation);
  if (!rawMeta) return null;
  // Localize all user-facing text (trap label/effect, puzzle label/hint,
  // loot name, flavor seed) to the campaign owner's content language.
  const meta = localizeRoomMetadata(rawMeta, contentLanguage);

  // Exits — find edges where THIS room is the "from" side. Each gives us
  // the target room + direction + gated flag.
  const exitEdges = await prisma.worldLocationEdge.findMany({
    where: { fromLocationId: roomLocation.id, terrainType: 'dungeon_corridor' },
    select: {
      toLocationId: true, direction: true, gated: true, gateHint: true,
    },
  });
  const exitIds = exitEdges.map((e) => e.toLocationId).filter(Boolean);
  const exitRooms = exitIds.length
    ? await prisma.worldLocation.findMany({
        where: { id: { in: exitIds } },
        select: { id: true, canonicalName: true, slotType: true, roomMetadata: true },
      })
    : [];
  const exitById = new Map(exitRooms.map((r) => [r.id, r]));
  const exits = exitEdges.map((e) => {
    const target = exitById.get(e.toLocationId);
    let cleared = false;
    if (target?.roomMetadata) {
      try {
        cleared = JSON.parse(target.roomMetadata).entryCleared === true;
      } catch { /* ignore */ }
    }
    return {
      direction: e.direction || 'unknown',
      targetRoomName: target?.canonicalName || null,
      targetRole: target?.slotType || 'normal',
      gated: !!e.gated,
      gateHint: e.gateHint || null,
      cleared,
    };
  });

  // Parent dungeon — for total room count + theme summary
  const parent = roomLocation.parentLocationId
    ? await prisma.worldLocation.findUnique({
        where: { id: roomLocation.parentLocationId },
        select: { id: true, canonicalName: true },
      })
    : null;

  return {
    roomName: roomLocation.canonicalName,
    dungeonName: parent?.canonicalName || null,
    role: meta.role || 'normal',
    theme: meta.theme || null,
    difficulty: meta.difficulty || null,
    trap: meta.trapSprung ? null : meta.trap,
    enemies: meta.entryCleared ? [] : (meta.enemies || []),
    loot: meta.lootTaken ? [] : (meta.loot || []),
    puzzle: meta.puzzle || null,
    flavorSeed: meta.flavorSeed || null,
    entryCleared: !!meta.entryCleared,
    trapSprung: !!meta.trapSprung,
    lootTaken: !!meta.lootTaken,
    exits,
  };
}

/**
 * Build the Phase 7 settlement topology block. Resolves parent → loads
 * children → groups by slotKind → computes budget. Returns null for
 * dungeons (seed generator owns them) or when no parent context makes sense.
 */
async function buildSettlementBlock(currentLocation, difficultyTier = null) {
  if (!currentLocation) return null;
  // If current is a sublocation, walk up to the parent settlement.
  let settlement = currentLocation;
  if (currentLocation.parentLocationId) {
    const parent = await prisma.worldLocation.findUnique({
      where: { id: currentLocation.parentLocationId },
    });
    if (parent) settlement = parent;
  }
  const type = settlement.locationType || 'generic';
  if (isGeneratedLocationType(type)) return null; // dungeons handled elsewhere
  const template = getTemplate(type);

  const children = await prisma.worldLocation.findMany({
    where: { parentLocationId: settlement.id },
    select: {
      id: true, canonicalName: true, slotType: true, slotKind: true, description: true,
    },
  });

  const childrenBySlot = {
    required: children.filter((c) => c.slotKind === 'required'),
    optional: children.filter((c) => c.slotKind === 'optional'),
    custom:   children.filter((c) => c.slotKind === 'custom'),
  };
  const customCap = effectiveCustomCap(type, difficultyTier);
  const budget = computeSubLocationBudget({
    parentLocationType: type,
    childrenBySlot,
    maxSubLocations: settlement.maxSubLocations || template.maxSubLocations || 5,
    customCap,
  });

  return {
    parentName: settlement.canonicalName,
    locationType: type,
    maxKeyNpcs: settlement.maxKeyNpcs || template.maxKeyNpcs || 10,
    children: childrenBySlot,
    budget,
    backgroundLabel: BACKGROUND_LABEL[type] || null,
  };
}
