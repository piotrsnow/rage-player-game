import { prisma } from '../../../lib/prisma.js';
import { parseRoomMetadata } from '../../livingWorld/dungeonSeedGenerator.js';
import { localizeRoomMetadata } from '../../livingWorld/contentLocalizer.js';

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
export async function buildDungeonRoomBlock(roomLocation, contentLanguage = 'pl') {
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
