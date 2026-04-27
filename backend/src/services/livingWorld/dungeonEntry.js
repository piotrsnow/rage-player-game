// Living World Phase 7 — dungeon entry hook.
//
// Called inside generateSceneStream after premium returns, before the scene
// is saved. Handles two cases:
//
// 1. Player's emitted currentLocation is a top-level dungeon (locationType
//    = 'dungeon'). We seed the dungeon (idempotent) and REWRITE
//    stateChanges.currentLocation to the entrance room's canonical name
//    so coreState + next scene see the room, not the dungeon stub.
//
// 2. Player's emitted currentLocation is already a dungeon_room. Nothing
//    to seed — the previous scene handled it.
//
// The rewrite is silent from the player's perspective: premium narrated
// "entering the catacombs"; next scene opens in the entrance room with
// DUNGEON ROOM context injected.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { ensureDungeonSeeded } from './dungeonSeedGenerator.js';
import { LOCATION_KIND_WORLD } from '../locationRefs.js';

const log = childLogger({ module: 'dungeonEntry' });

/**
 * Mutates stateChanges in-place to redirect currentLocation → entrance room
 * when the player just stepped into a top-level dungeon. Best-effort: on
 * any failure the original currentLocation is preserved.
 *
 * @param {object} params
 * @param {object} params.stateChanges   — parsed stateChanges from premium (mutated)
 * @param {string} [params.prevLoc]     — previous scene's location name
 */
/**
 * Post-(round-no-AI-locations) signature: takes the post-travel-resolve
 * `currentRef` instead of mutating an AI-emitted `stateChanges.currentLocation`.
 * Writes Campaign.currentLocation* directly when a redirect happens, and
 * returns the new ref so the caller can update its in-memory snapshot.
 *
 * Returns either `null` (no redirect) or `{kind, id, name}` (redirected to
 * entrance room).
 */
export async function handleDungeonEntry({ campaignId, currentRef = null, prevLoc = null }) {
  if (!currentRef?.kind || !currentRef?.id) return null;
  if (currentRef.kind !== LOCATION_KIND_WORLD) return null;
  if (currentRef.name && currentRef.name === prevLoc) return null;

  try {
    const target = await prisma.worldLocation.findUnique({
      where: { id: currentRef.id },
      select: { id: true, canonicalName: true, locationType: true },
    });
    if (!target) return null;

    // Already in a dungeon room — nothing to do.
    if (target.locationType === 'dungeon_room') return null;
    // Not a top-level dungeon — bail.
    if (target.locationType !== 'dungeon') return null;

    const seed = await ensureDungeonSeeded({ dungeon: target });
    if (!seed?.entranceRoomId) {
      log.warn({ dungeonId: target.id, name: target.canonicalName }, 'dungeon seed produced no entrance room');
      return null;
    }

    const entranceRoom = await prisma.worldLocation.findUnique({
      where: { id: seed.entranceRoomId },
      select: { id: true, canonicalName: true },
    });
    if (!entranceRoom?.canonicalName) return null;

    log.info(
      { dungeon: target.canonicalName, entrance: entranceRoom.canonicalName, seeded: seed.seeded },
      'dungeon entry — redirecting currentLocation to entrance room',
    );
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        currentLocationName: entranceRoom.canonicalName,
        currentLocationKind: LOCATION_KIND_WORLD,
        currentLocationId: entranceRoom.id,
      },
    });
    return { kind: LOCATION_KIND_WORLD, id: entranceRoom.id, name: entranceRoom.canonicalName };
  } catch (err) {
    log.warn({ err: err?.message, currentRef }, 'handleDungeonEntry failed (non-fatal)');
    return null;
  }
}

/**
 * Apply dungeonRoom state flags (entryCleared / trapSprung / lootTaken) to
 * the room's persisted metadata. Called from processStateChanges AFTER the
 * scene has committed. Idempotent — flags only flip one way (false → true).
 *
 * Also: on entryCleared for a BOSS room, inserts a CharacterClearedDungeon
 * row for the active character if they still have activeDungeonState
 * pointing at it.
 */
export async function applyDungeonRoomState({ campaignId, prevLoc, flags }) {
  if (!prevLoc || !flags || typeof flags !== 'object') return;
  const touched = {};
  if (flags.entryCleared === true) touched.entryCleared = true;
  if (flags.trapSprung === true) touched.trapSprung = true;
  if (flags.lootTaken === true) touched.lootTaken = true;
  if (Object.keys(touched).length === 0) return;

  try {
    const room = await prisma.worldLocation.findUnique({
      where: { canonicalName: prevLoc },
    });
    if (!room || room.locationType !== 'dungeon_room') return;

    const meta = (room.roomMetadata && typeof room.roomMetadata === 'object') ? room.roomMetadata : {};
    const merged = { ...meta, ...touched };
    await prisma.worldLocation.update({
      where: { id: room.id },
      data: { roomMetadata: merged },
    });

    // Boss defeat → mark the parent dungeon as cleared for the active character.
    if (touched.entryCleared && meta.role === 'boss' && room.parentLocationId) {
      await markDungeonClearedForCampaign({ campaignId, dungeonId: room.parentLocationId });
    }
  } catch (err) {
    log.warn({ err: err?.message, campaignId, prevLoc }, 'applyDungeonRoomState failed (non-fatal)');
  }
}

async function markDungeonClearedForCampaign({ campaignId, dungeonId }) {
  try {
    const participant = await prisma.campaignParticipant.findFirst({
      where: { campaignId },
      orderBy: { joinedAt: 'asc' },
      select: { characterId: true },
    });
    const characterId = participant?.characterId || null;
    if (!characterId) return;

    // INSERT into CharacterClearedDungeon — ON CONFLICT DO NOTHING via skipDuplicates.
    // F5b — `dungeonKind` is polymorphic; canonical dungeons (the only ones
    // that get auto-seeded rooms) are kind='world'.
    await prisma.characterClearedDungeon.createMany({
      data: [{ characterId, dungeonKind: LOCATION_KIND_WORLD, dungeonId }],
      skipDuplicates: true,
    });
    await prisma.character.update({
      where: { id: characterId },
      data: { activeDungeonState: null },
    });
    log.info({ characterId, dungeonId }, 'dungeon cleared — recorded for character');
  } catch (err) {
    log.warn({ err: err?.message, campaignId, dungeonId }, 'markDungeonClearedForCampaign failed');
  }
}
