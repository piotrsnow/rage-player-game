import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { appendEvent } from '../../livingWorld/worldEventLog.js';
import { findOrCreateWorldLocation } from '../../livingWorld/worldStateService.js';
import { resolveNpcKnownLocations } from '../../livingWorld/campaignSandbox.js';
import { markLocationHeardAbout } from '../../livingWorld/userDiscoveryService.js';
import { applyFameFromEvent } from '../../livingWorld/fameService.js';
import {
  parseLocationMentions,
  parseCampaignComplete,
} from './schemas.js';

const log = childLogger({ module: 'sceneGenerator' });

/**
 * Pure decision function — does the current scene earn global visibility?
 *
 * Gate: premium flags `worldImpact: 'major'` OR any deadly/dungeon flag
 * is set; AT LEAST ONE objective signal must be present:
 *   - named NPC killed in this scene
 *   - a main-type quest completed
 *   - explicit locationLiberated flag
 *   - defeatedDeadlyEncounter flag
 *   - dungeonComplete payload
 *
 * Returns `{ promote: bool, gate: string }`. `gate` identifies which
 * signal fired so the event payload can explain why this is gossip-worthy.
 * Exported so tests can exercise the gate without touching Prisma.
 */
export function shouldPromoteToGlobal(stateChanges, { mainQuestCompleted = false } = {}) {
  if (!stateChanges || typeof stateChanges !== 'object') {
    return { promote: false, gate: null };
  }
  const flaggedMajor = stateChanges.worldImpact === 'major';
  const deadly = stateChanges.defeatedDeadlyEncounter === true;
  const dungeon = stateChanges.dungeonComplete && typeof stateChanges.dungeonComplete === 'object';
  const liberated = stateChanges.locationLiberated === true;
  const namedKill = Array.isArray(stateChanges.npcs)
    && stateChanges.npcs.some((n) => n && n.alive === false && typeof n.name === 'string' && n.name.trim().length > 0);

  // Dungeon completion and deadly victory are self-gating (AI explicitly
  // marks them) — they promote regardless of worldImpact tag.
  if (dungeon) return { promote: true, gate: 'dungeon' };
  if (deadly) return { promote: true, gate: 'deadly' };

  // Everything else requires worldImpact='major' AND an objective signal.
  if (!flaggedMajor) return { promote: false, gate: null };
  if (liberated) return { promote: true, gate: 'liberation' };
  if (mainQuestCompleted) return { promote: true, gate: 'main_quest' };
  if (namedKill) return { promote: true, gate: 'named_kill' };

  return { promote: false, gate: null };
}

/**
 * Round B (Phase 4b) — hearsay policy handler.
 *
 * For each `{locationId, byNpcId}` the LLM emitted, resolve the NPC (by
 * CampaignNPC.npcId OR name), ensure the location sits in the NPC's
 * `resolveNpcKnownLocations` set, and only then mark it as heard-about for
 * the player (canonical → UserWorldKnowledge, non-canonical → Campaign).
 *
 * Violations (LLM made up a location or wrote one outside the NPC's scope)
 * are skipped with a warning — the mention doesn't propagate to fog state.
 *
 * Input runs through Zod first; arrays over MAX_LOCATION_MENTIONS (20) are
 * rejected in full so a runaway LLM can't trigger N findUnique queries.
 */
export async function processLocationMentions(campaignId, mentions) {
  const parsed = parseLocationMentions(mentions);
  if (!parsed.ok) {
    log.warn(
      { campaignId, error: parsed.error?.message, count: Array.isArray(mentions) ? mentions.length : 0 },
      'locationMentioned: schema rejected — skipping entire bucket',
    );
    return;
  }
  const validMentions = parsed.data;
  if (validMentions.length === 0) return;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { userId: true },
  }).catch(() => null);
  if (!campaign?.userId) return;

  for (const entry of validMentions) {
    const locationId = String(entry.locationId).trim();
    const byNpcIdent = String(entry.byNpcId || entry.npcId || entry.byNpc || '').trim();
    if (!locationId || !byNpcIdent) continue;

    try {
      const location = await prisma.worldLocation.findUnique({
        where: { id: locationId },
        select: { id: true },
      });
      if (!location) {
        log.warn({ campaignId, locationId, byNpcIdent }, 'locationMentioned: location not found — skipping');
        continue;
      }

      // Resolve the NPC — campaign shadow first, canonical by name fallback.
      const campaignNpc = await prisma.campaignNPC.findFirst({
        where: {
          campaignId,
          OR: [
            { npcId: byNpcIdent },
            { name: { equals: byNpcIdent, mode: 'insensitive' } },
          ],
        },
      });
      const worldNpc = campaignNpc?.worldNpcId
        ? await prisma.worldNPC.findUnique({ where: { id: campaignNpc.worldNpcId } })
        : await prisma.worldNPC.findFirst({
          where: { name: { equals: byNpcIdent, mode: 'insensitive' } },
        });

      if (!campaignNpc && !worldNpc) {
        log.warn({ campaignId, byNpcIdent }, 'locationMentioned: NPC not found — skipping');
        continue;
      }

      const known = await resolveNpcKnownLocations({ campaignNpc, worldNpc });
      if (!known.has(locationId)) {
        log.warn(
          { campaignId, locationId, byNpcIdent, knownCount: known.size },
          'locationMentioned: location outside NPC knowledge scope — policy violation, skipping',
        );
        continue;
      }

      await markLocationHeardAbout({ userId: campaign.userId, locationId, campaignId });
    } catch (err) {
      log.warn({ err: err?.message, campaignId, entry }, 'locationMentioned: handler failed');
    }
  }
}

/**
 * Write a GLOBAL WorldEvent when the current scene clears the gate.
 * Caller resolves `mainQuestCompleted` (requires a Prisma query against
 * completedQuests). Payload is meta-only.
 */
export async function processWorldImpactEvent({
  campaignId,
  stateChanges,
  ownerUserId,
  sceneGameTime,
  mainQuestCompleted,
  characterIds = [],
}) {
  const { promote, gate } = shouldPromoteToGlobal(stateChanges, { mainQuestCompleted });
  if (!promote) return;

  const currentLocationName = stateChanges.currentLocation || null;
  let worldLocationId = null;
  if (currentLocationName) {
    try {
      const loc = await findOrCreateWorldLocation(currentLocationName);
      worldLocationId = loc?.id || null;
    } catch {
      // Non-fatal — event still attaches via campaignId
    }
  }

  const eventType = gate === 'dungeon' ? 'dungeon_cleared'
    : gate === 'deadly' ? 'deadly_victory'
    : 'major_deed';

  // worldImpactReason is caller-provided raw LLM text. Cap at 300 chars
  // defensively — the FE Zod schema enforces this too, but BE shouldn't
  // trust the caller.
  const reasonRaw = typeof stateChanges.worldImpactReason === 'string'
    ? stateChanges.worldImpactReason.trim().slice(0, 300)
    : null;

  await appendEvent({
    worldLocationId,
    campaignId,
    userId: ownerUserId,
    eventType,
    payload: {
      gate,
      reason: reasonRaw || null,
      locationName: currentLocationName,
      dungeonName: stateChanges.dungeonComplete?.name || null,
      dungeonSummary: stateChanges.dungeonComplete?.summary || null,
    },
    visibility: 'global',
    gameTime: sceneGameTime,
  });
  log.info({ campaignId, gate, eventType, locationName: currentLocationName }, 'worldImpact event promoted to global');

  await applyFameFromEvent(characterIds, {
    eventType,
    visibility: 'global',
    payload: { gate },
  });
}

/**
 * Write a GLOBAL WorldEvent when the player resolves a campaign's main
 * conflict. Visible cross-campaign via `forLocation` (worldEventLog reads
 * `visibility='global'` without campaignId filter). Payload is meta-only
 * — title, summary, achievements, locationName — so no character-private
 * data leaks into other players' contexts.
 */
export async function processCampaignComplete({
  campaignId,
  data,
  ownerUserId,
  sceneGameTime,
  currentLocationName,
}) {
  const parsed = parseCampaignComplete(data);
  if (!parsed.ok) {
    log.warn(
      { campaignId, error: parsed.error?.message },
      'campaignComplete: schema rejected — skipping bucket',
    );
    return;
  }
  const safe = parsed.data;

  let worldLocationId = null;
  if (currentLocationName) {
    try {
      const loc = await findOrCreateWorldLocation(currentLocationName);
      worldLocationId = loc?.id || null;
    } catch {
      // Non-fatal — event can still attach via campaignId
    }
  }
  await appendEvent({
    worldLocationId,
    campaignId,
    userId: ownerUserId,
    eventType: 'campaign_complete',
    payload: {
      title: safe.title,
      summary: safe.summary,
      majorAchievements: safe.majorAchievements,
      locationName: currentLocationName || null,
    },
    visibility: 'global',
    gameTime: sceneGameTime,
  });
  log.info({ campaignId, locationName: currentLocationName, title: safe.title }, 'campaign_complete global event written');
}
