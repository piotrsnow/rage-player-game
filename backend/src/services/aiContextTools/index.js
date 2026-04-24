import { childLogger } from '../../lib/logger.js';
import { getLocationSummary } from '../memoryCompressor.js';

import { handleSearchMemory } from './handlers/searchMemory.js';
import { handleGetNPC } from './handlers/npc.js';
import { handleGetQuest } from './handlers/quest.js';
import { handleGetLocation } from './handlers/location.js';
import { handleGetCodex } from './handlers/codex.js';
import { buildWorldLorePreamble } from './worldLore.js';
import { buildLivingWorldContext } from './contextBuilders/livingWorld.js';

export { buildWorldLorePreamble };

const log = childLogger({ module: 'aiContextTools' });

/**
 * Assemble expanded context based on intent classifier selection result.
 * All DB queries run in parallel via Promise.all.
 */
export async function assembleContext(
  campaignId,
  selectionResult,
  currentLocation,
  skipKeys = {},
  { provider = 'openai', timeoutMs = 5000, playerAction = null } = {},
) {
  const fetches = [];

  // Round A (Phase 0a) — World Lore preamble. Always fetched (cheap —
  // cached in-memory by `max(updatedAt)` inside buildWorldLorePreamble).
  fetches.push(
    buildWorldLorePreamble()
      .then((preamble) => ({ type: 'worldLore', data: preamble || null }))
      .catch(() => ({ type: 'worldLore', data: null })),
  );

  // Encje już obecne w dynamicSuffix promptu (Key NPCs / Active Quests / ALREADY DISCOVERED).
  // Pomijamy je w EXPANDED CONTEXT, żeby nie dublować tych samych danych dwa razy.
  const skipNpcs = new Set((skipKeys.npcs || []).map((s) => String(s).toLowerCase()));
  const skipQuests = new Set((skipKeys.quests || []).map((s) => String(s).toLowerCase()));
  const skipCodex = new Set((skipKeys.codex || []).map((s) => String(s).toLowerCase()));

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
        playerAction,
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
      handleGetNPC(campaignId, name).then((r) => ({ type: 'npc', key: name, data: r })),
    );
  }

  // Expand selected quests
  for (const name of selectionResult.expand_quests || []) {
    if (skipQuests.has(name.toLowerCase())) continue;
    fetches.push(
      handleGetQuest(campaignId, name).then((r) => ({ type: 'quest', key: name, data: r })),
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
      })),
    );
  }

  // Expand codex entries
  for (const topic of selectionResult.expand_codex || []) {
    if (skipCodex.has(topic.toLowerCase())) continue;
    fetches.push(
      handleGetCodex(campaignId, topic).then((r) => ({ type: 'codex', key: topic, data: r })),
    );
  }

  // Semantic search through campaign history
  if (selectionResult.needs_memory_search && selectionResult.memory_query) {
    fetches.push(
      handleSearchMemory(campaignId, selectionResult.memory_query).then((r) => ({ type: 'memory', data: r })),
    );
  }

  if (fetches.length === 0) {
    return { npcs: {}, quests: {}, location: null, codex: {}, memory: null, livingWorld: null, worldLore: null };
  }

  const results = await Promise.all(fetches);
  return groupByType(results);
}

function groupByType(results) {
  const grouped = { npcs: {}, quests: {}, location: null, codex: {}, memory: null, livingWorld: null, worldLore: null };

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
      case 'worldLore':
        grouped.worldLore = r.data;
        break;
    }
  }

  return grouped;
}
