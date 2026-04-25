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
import { findOrCreateWorldLocation } from './worldStateService.js';
import { ensureDungeonSeeded } from './dungeonSeedGenerator.js';

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
export async function handleDungeonEntry({ stateChanges, prevLoc = null }) {
  const nextLoc = stateChanges?.currentLocation;
  if (!nextLoc || typeof nextLoc !== 'string') return;
  if (nextLoc === prevLoc) return;

  try {
    const target = await findOrCreateWorldLocation(nextLoc);
    if (!target) return;

    // Already in a dungeon room — nothing to do.
    if (target.locationType === 'dungeon_room') return;

    // Not a top-level dungeon — bail.
    if (target.locationType !== 'dungeon') return;

    const seed = await ensureDungeonSeeded({ dungeon: target });
    if (!seed?.entranceRoomId) {
      log.warn({ dungeonId: target.id, name: target.canonicalName }, 'dungeon seed produced no entrance room');
      return;
    }

    const entranceRoom = await prisma.worldLocation.findUnique({
      where: { id: seed.entranceRoomId },
      select: { canonicalName: true },
    });
    if (!entranceRoom?.canonicalName) return;

    log.info(
      { dungeon: target.canonicalName, entrance: entranceRoom.canonicalName, seeded: seed.seeded },
      'dungeon entry — redirecting currentLocation to entrance room',
    );
    stateChanges.currentLocation = entranceRoom.canonicalName;
  } catch (err) {
    log.warn({ err: err?.message, nextLoc }, 'handleDungeonEntry failed (non-fatal)');
  }
}

/**
 * Apply dungeonRoom state flags (entryCleared / trapSprung / lootTaken) to
 * the room's persisted metadata. Called from processStateChanges AFTER the
 * scene has committed. Idempotent — flags only flip one way (false → true).
 *
 * Also: on entryCleared for a BOSS room, flushes the dungeon id into the
 * active character's clearedDungeonIds if the character still has the
 * activeDungeonState pointing at it.
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

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { clearedDungeonIds: true },
    });
    if (!character) return;

    const cleared = Array.isArray(character.clearedDungeonIds) ? [...character.clearedDungeonIds] : [];
    if (cleared.includes(dungeonId)) return;

    cleared.push(dungeonId);
    await prisma.character.update({
      where: { id: characterId },
      data: {
        clearedDungeonIds: cleared,
        activeDungeonState: null,
      },
    });
    log.info({ characterId, dungeonId }, 'dungeon cleared — recorded for character');
  } catch (err) {
    log.warn({ err: err?.message, campaignId, dungeonId }, 'markDungeonClearedForCampaign failed');
  }
}
