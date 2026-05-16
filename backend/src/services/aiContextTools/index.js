import { childLogger } from '../../lib/logger.js';
import { getLocationSummary, getLocationDigests } from '../memoryCompressor.js';

import { handleSearchMemory } from './handlers/searchMemory.js';
import { handleGetNPC } from './handlers/npc.js';
import { handleGetQuest, prefetchCampaignQuests } from './handlers/quest.js';
import { handleGetLocation } from './handlers/location.js';
import { handleGetCodex } from './handlers/codex.js';
import { buildWorldLorePreamble } from './worldLore.js';
import { buildLivingWorldContext } from './contextBuilders/livingWorld.js';
import { buildNarrativeContext } from '../locationGraph/graphContextBuilder.js';

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
  { provider = 'openai', timeoutMs = 5000, playerAction = null, userId = null, currentRef = null } = {},
) {
  // Pre-fetch quests once so individual handleGetQuest calls skip re-querying.
  const needsQuests = (selectionResult.expand_quests || []).length > 0;
  const prefetchedQuests = needsQuests ? await prefetchCampaignQuests(campaignId) : [];

  // Per-request cache for CampaignLocationSummary rows — avoids repeated
  // findMany inside getLocationSummary / getLocationDigests / appendSceneDigest
  // when they all resolve the same campaignId within a single assembleContext call.
  const locationCache = new Map();

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
        directionalMove: selectionResult?._intent === 'travel' ? (selectionResult._directionalMove || null) : null,
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
      handleGetNPC(campaignId, name, { currentRef }).then((r) => ({ type: 'npc', key: name, data: r })),
    );
  }

  // Expand selected quests (using pre-fetched rows to avoid N+1 queries)
  for (const name of selectionResult.expand_quests || []) {
    if (skipQuests.has(name.toLowerCase())) continue;
    fetches.push(
      handleGetQuest(campaignId, name, { prefetchedQuests }).then((r) => ({ type: 'quest', key: name, data: r })),
    );
  }

  // Expand location + include location summary from previous visits
  if (selectionResult.expand_location && currentLocation) {
    fetches.push(
      Promise.all([
        handleGetLocation(campaignId, currentLocation),
        getLocationSummary(campaignId, currentLocation, { locationCache }),
      ]).then(([locationData, summary]) => ({
        type: 'location',
        data: summary ? `${locationData}\n\n${summary}` : locationData,
      })),
    );
  }

  // Location History Digest — scene-level ring buffer for return-to-location
  // context. Fetched whenever a current location is known (cheap DB read).
  if (currentLocation) {
    fetches.push(
      getLocationDigests(campaignId, currentLocation, { locationCache })
        .then((data) => ({ type: 'locationDigests', data }))
        .catch(() => ({ type: 'locationDigests', data: null })),
    );
  }

  // Expand codex entries
  for (const topic of selectionResult.expand_codex || []) {
    if (skipCodex.has(topic.toLowerCase())) continue;
    fetches.push(
      handleGetCodex(campaignId, topic).then((r) => ({ type: 'codex', key: topic, data: r })),
    );
  }

  // Location Graph — lean spatial context (exits, NPCs, perception hints).
  // Fetched when the campaign has a resolved polymorphic location ref.
  if (selectionResult._currentRef?.kind && selectionResult._currentRef?.id) {
    fetches.push(
      buildNarrativeContext(selectionResult._currentRef.id, selectionResult._currentRef.kind, campaignId, { userId })
        .then((data) => ({ type: 'locationGraph', data }))
        .catch((err) => {
          log.warn({ err: err?.message, campaignId }, 'locationGraph context fetch failed');
          return { type: 'locationGraph', data: null };
        }),
    );
  }

  // Semantic search through campaign history
  if (selectionResult.needs_memory_search && selectionResult.memory_query) {
    fetches.push(
      handleSearchMemory(campaignId, selectionResult.memory_query).then((r) => ({ type: 'memory', data: r })),
    );
  }

  if (fetches.length === 0) {
    return { npcs: {}, quests: {}, location: null, codex: {}, memory: null, livingWorld: null, worldLore: null, locationGraph: null, locationDigests: null };
  }

  const results = await Promise.all(fetches);
  return groupByType(results);
}

function groupByType(results) {
  const grouped = { npcs: {}, quests: {}, location: null, codex: {}, memory: null, livingWorld: null, worldLore: null, locationGraph: null, locationDigests: null };

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
      case 'locationGraph':
        grouped.locationGraph = r.data;
        break;
      case 'locationDigests':
        grouped.locationDigests = r.data;
        break;
    }
  }

  return grouped;
}
