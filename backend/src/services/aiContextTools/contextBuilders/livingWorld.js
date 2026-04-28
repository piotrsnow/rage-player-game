import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { getCampaignCharacterIds } from '../../campaignSync.js';
import { resolveWorldLocation } from '../../livingWorld/worldStateService.js';
import { listNpcsAtLocation } from '../../livingWorld/campaignSandbox.js';
import { forLocation as worldEventsForLocation, parseEventPayload } from '../../livingWorld/worldEventLog.js';
import { getCompanions } from '../../livingWorld/companionService.js';
import { getReputationProfile, maybeClearVendetta } from '../../livingWorld/reputationService.js';
import { suggestEncounterMode } from '../../livingWorld/encounterEscalator.js';
import { readDmAgentState } from '../../livingWorld/dmMemoryService.js';
import { normalizeLanguage } from '../../livingWorld/contentLocalizer.js';

import { buildSettlementBlock } from './settlement.js';
import { buildSeededSettlementsBlock } from './seededSettlements.js';
import { buildSaturationHint } from './saturation.js';
import { buildTravelBlock } from './travel.js';
import { buildDungeonRoomBlock } from './dungeonRoom.js';
import { mapAmbientNpcs, clearSurfacedIntroHints } from './npcGoalMapping.js';
import { buildHearsayByNpc } from './hearsay.js';
import { buildNpcMemory } from './npcBaseline.js';
import { computeWorldBoundsHint } from './worldBoundsHint.js';
import { computeCurrentBiome } from './currentBiome.js';

const log = childLogger({ module: 'aiContextTools' });

const NARRATIVE_EVENT_TYPES = new Set([
  'resume_summary',
  'moved',
  'killed',
  'quest_complete',
  'returned_from_journey',
]);

function priorityRank(p) {
  if (p === 'high') return 2;
  if (p === 'low') return 0;
  return 1;
}

/**
 * Build a Living World context block for the current location.
 *
 * Returns null when the campaign has livingWorldEnabled=false (so the
 * legacy flow stays untouched) or when no relevant world data exists.
 *
 * Shape: { locationName, npcs: [{name, role, paused}], recentEvents: [{type, blurb, at}] }
 */
export async function buildLivingWorldContext(campaignId, currentLocation, { travelTarget = null, directionalMove = null, playerAction = null } = {}) {
  // Cheap check — if the flag is off we do nothing.
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      livingWorldEnabled: true,
      userId: true,
      // F5 — bounds via 4 Float columns (unpacked downstream by builders)
      boundsMinX: true, boundsMaxX: true, boundsMinY: true, boundsMaxY: true,
      settlementCaps: true,
      difficultyTier: true,
      user: { select: { contentLanguage: true } },
    },
  });
  if (!campaign?.livingWorldEnabled) return null;

  const contentLanguage = normalizeLanguage(campaign.user?.contentLanguage);

  const location = await resolveWorldLocation(currentLocation);
  if (!location) return null;

  const characterIds = await getCampaignCharacterIds(campaignId);
  const actorCharacterId = characterIds[0] || null;

  // Parallel: NPCs at this location (campaign-sandbox aware — returns
  // CampaignNPC shadows, auto-cloning canonical WorldNPCs at first encounter)
  // + recent world events + any companions travelling with the party
  // (Phase 2) + lazy vendetta clear + Phase 4 DM agent memory.
  const [npcs, events, companions, , dmState] = await Promise.all([
    listNpcsAtLocation(location.id, { campaignId, aliveOnly: true }).catch(() => []),
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
  const recentEvents = events
    .filter((e) => NARRATIVE_EVENT_TYPES.has(e.eventType))
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

  // Phase A — SEEDED SETTLEMENTS block.
  const seededSettlements = await buildSeededSettlementsBlock(campaign, location).catch((err) => {
    log.warn({ err: err?.message, campaignId }, 'seededSettlements block failed');
    return null;
  });

  // Travel / movement block. Built when classifier flags travel intent —
  // either named-target travel ("idę do Kamionki") or free-vector movement
  // ("1 km na północ"). F5d Phase 2 — runs pathScan to surface POIs within
  // 250m of the path + biome transitions + barrier-edge detection.
  let travel = null;
  if ((travelTarget || directionalMove) && campaign.userId) {
    travel = await buildTravelBlock({
      campaignId,
      userId: campaign.userId,
      campaign,
      startLocation: location,
      targetName: travelTarget,
      directionalMove,
    }).catch((err) => {
      log.warn({ err: err?.message, campaignId, travelTarget, directionalMove }, 'travel/movement block build failed');
      return null;
    });
  }

  // Phase 7 — dungeon room block. Active only when the player is CURRENTLY
  // inside a dungeon room. Localized to the user's contentLanguage so the
  // deterministic text feeds into the AI in the same language as the narrative.
  let dungeon = null;
  if (location.locationType === 'dungeon_room') {
    dungeon = await buildDungeonRoomBlock(location, contentLanguage).catch((err) => {
      log.warn({ err: err?.message, locationId: location.id }, 'dungeon block build failed');
      return null;
    });
  }

  // Phase C — saturation-curve hint.
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

  // Map shadows → prompt-shaped entries. The BE-driven goal/radiant mechanic
  // is archived to knowledge/ideas/npc-action-assignment.md — only identity
  // + pendingIntroHint flow through today.
  const ambientNpcsWithGoals = mapAmbientNpcs(ambientNpcs);

  // Round B — clear any pendingIntroHints we just surfaced. Best-effort.
  clearSurfacedIntroHints(ambientNpcsWithGoals);

  // Round B (Phase 4b) — NPC hearsay. Scene prompt renders this as a
  // [NPC_KNOWLEDGE] section so premium respects scope. Builder batches
  // all DB reads (previously N+1 per NPC).
  // Stage 1+2 — NPC memory: merges hand-authored baseline (WorldNPC.knowledgeBase)
  // with in-campaign lived experience (CampaignNPC.experienceLog). Rendered
  // as a `[NPC_MEMORY]` block — flavor, NOT policy-enforced (that's hearsay's job).
  // Stage 3 — build scene query text for RAG-powered memory recall. Kept
  // short (single embed per scene, shared across all NPCs present): the
  // player's last action + the current location name. Only used inside
  // `buildNpcMemory` when an NPC's merged memory pool exceeds 15 entries;
  // otherwise the static importance-slice path (Stage 2a.1) wins.
  const sceneQueryText = [playerAction, location.canonicalName]
    .filter((s) => typeof s === 'string' && s.trim())
    .join(' ')
    .trim() || null;

  const [hearsayByNpc, memoryByNpc] = await Promise.all([
    buildHearsayByNpc({ ambientNpcs, ambientNpcsWithGoals }),
    buildNpcMemory({ ambientNpcs, ambientNpcsWithGoals, sceneQueryText }),
  ]);

  // Background NPC label + key-vs-background split — Phase 7. Key NPCs are
  // WorldNPCs with keyNpc=true; everyone else in `npcs` stays as ambient
  // generic flavor that premium should describe without naming.
  const keyAmbient = ambientNpcsWithGoals.filter((_n, i) => ambientNpcs[i]?.keyNpc !== false);
  const backgroundCount = ambientNpcs.length - keyAmbient.length;

  // Round B (Phase 4c) — worldBounds remaining-room hint.
  const worldBoundsHint = computeWorldBoundsHint(campaign, location);

  // F5d biome map — biome at the player's current world position. Resolved
  // from continuous (currentX/Y) when set, else from the anchored location.
  const currentBiome = computeCurrentBiome(campaign, location);

  return {
    locationName: location.canonicalName,
    locationType: location.locationType || 'generic',
    npcs: keyAmbient,
    hearsayByNpc,
    memoryByNpc,
    worldBoundsHint,
    currentBiome,
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
