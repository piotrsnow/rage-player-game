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
export async function assembleContext(campaignId, selectionResult, currentLocation, skipKeys = {}) {
  const fetches = [];

  // Encje już obecne w dynamicSuffix promptu (Key NPCs / Active Quests / ALREADY DISCOVERED).
  // Pomijamy je w EXPANDED CONTEXT, żeby nie dublować tych samych danych dwa razy.
  const skipNpcs = new Set((skipKeys.npcs || []).map(s => String(s).toLowerCase()));
  const skipQuests = new Set((skipKeys.quests || []).map(s => String(s).toLowerCase()));
  const skipCodex = new Set((skipKeys.codex || []).map(s => String(s).toLowerCase()));

  // Living World — fetch recent WorldEvents at the current location (and the
  // canonical NPCs present there) when the campaign has the feature enabled.
  // Runs in parallel with other context fetches; failures are non-fatal.
  if (currentLocation) {
    fetches.push(
      buildLivingWorldContext(campaignId, currentLocation)
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
async function buildLivingWorldContext(campaignId, currentLocation) {
  // Cheap check — if the flag is off we do nothing.
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { livingWorldEnabled: true, characterIds: true },
  });
  if (!campaign?.livingWorldEnabled) return null;

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

  // Phase 3 — reputation profile + encounter mode hint. Scoped to the factions
  // relevant at this location (NPCs here + companions) so we don't bloat the
  // fetch with unrelated faction rows.
  let reputation = null;
  let encounter = null;
  if (actorCharacterId) {
    const factionIds = Array.from(new Set(
      [...ambientNpcs, ...companions]
        .map((n) => n.factionId)
        .filter(Boolean),
    ));
    try {
      const profile = await getReputationProfile({
        characterId: actorCharacterId,
        region: location.region || null,
        settlementKey: location.canonicalName || null,
        factionIds,
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

  if (
    ambientNpcs.length === 0
    && recentEvents.length === 0
    && companions.length === 0
    && !reputation
    && !hasDmState
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
    return {
      name: n.name,
      role: n.role || null,
      paused: !!n.pausedAt,
      activeGoal: goalForThisCampaign ? (n.activeGoal || null) : null,
      recentMilestones: goalForThisCampaign ? milestones : [],
      recentlyArrived,
    };
  });

  return {
    locationName: location.canonicalName,
    npcs: ambientNpcsWithGoals,
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
  };
}

function priorityRank(p) {
  if (p === 'high') return 2;
  if (p === 'low') return 0;
  return 1;
}
