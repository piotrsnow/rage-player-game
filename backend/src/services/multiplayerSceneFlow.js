import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import {
  broadcast,
  getRoom,
  saveRoomToDB,
  sanitizeRoom,
  setGameState,
} from './roomManager.js';
import {
  generateMultiplayerScene,
  needsCompression,
  compressOldScenes,
} from './multiplayerAI.js';
import { hourToPeriod, decayNeeds } from './timeUtils.js';
import { validateMultiplayerStateChanges } from './stateValidator.js';
import { applyMultiplayerSceneStateChanges } from '../../../shared/domain/multiplayerState.js';
import {
  loadCharacterSnapshot,
  persistCharacterSnapshot,
} from './characterRelations.js';
import { normalizeMultiplayerStateChanges } from '../../../shared/contracts/multiplayer.js';

const log = childLogger({ module: 'multiplayer' });

export function calcNextMomentum(sl, current) {
  const newVal = sl * 5;
  let next;
  if (sl === 0) {
    next = current > 0 ? Math.max(0, current - 5) : current < 0 ? Math.min(0, current + 5) : 0;
  } else if (sl > 0) {
    next = current < 0 ? newVal : (newVal > current ? newVal : Math.max(0, current - 5));
  } else {
    next = current > 0 ? newVal : (newVal < current ? newVal : Math.min(0, current + 5));
  }
  return Math.max(-30, Math.min(30, next));
}

/**
 * Compute the post-scene momentum map. If `soloActionName` is supplied and the
 * scene has a single diceRoll (not an array), attribute the SL to that action
 * name — this is the SOLO_ACTION fallback path. Otherwise iterate diceRolls[]
 * and key each entry by dr.character.
 */
export function computeNewMomentum(scene, prevMomentum, soloActionName = null) {
  const next = { ...prevMomentum };
  if (scene?.diceRolls?.length) {
    for (const dr of scene.diceRolls) {
      if (dr.character && dr.sl != null) {
        next[dr.character] = calcNextMomentum(dr.sl, prevMomentum[dr.character] || 0);
      }
    }
  } else if (soloActionName && scene?.diceRoll?.sl != null) {
    next[soloActionName] = calcNextMomentum(scene.diceRoll.sl, prevMomentum[soloActionName] || 0);
  }
  return next;
}

export function applySceneStateChanges(gameState, sceneResult, settings) {
  return applyMultiplayerSceneStateChanges(gameState, sceneResult, {
    needsEnabled: settings?.needsSystemEnabled === true,
    periodResolver: hourToPeriod,
    decayNeeds,
  });
}

/**
 * Persist mutated character snapshots back to the Character collection.
 * Each mutated snapshot is matched to a player by odId, and the player's
 * characterId points at the canonical Character record. Backend-authoritative
 * — runs in parallel for all characters and never blocks the broadcast path.
 */
export async function persistMultiplayerCharactersToDB(room, mutatedCharacters) {
  if (!room || !Array.isArray(mutatedCharacters) || mutatedCharacters.length === 0) return;

  const updates = [];
  for (const character of mutatedCharacters) {
    if (!character || !character.odId) continue;
    const player = room.players.get(character.odId);
    if (!player?.characterId) continue;
    updates.push(
      persistCharacterSnapshot(player.characterId, character).catch((err) => {
        log.warn({ err, characterId: player.characterId }, 'Failed to persist character');
      }),
    );
  }
  await Promise.all(updates);
}

/**
 * Fetch a Character record from DB and validate ownership. Used by JOIN_ROOM
 * and CONVERT_TO_MULTIPLAYER to source the canonical character snapshot
 * instead of trusting client-supplied characterData.
 */
export async function fetchOwnedCharacter(characterId, userId) {
  if (!characterId) return null;
  return loadCharacterSnapshot({ id: characterId, userId });
}

export function buildArrivalNarrative(playerName, language = 'en') {
  if (typeof language === 'string' && language.toLowerCase().startsWith('pl')) {
    return `${playerName} dołącza do drużyny i zajmuje miejsce przy ognisku, gotów ruszyć dalej.`;
  }
  return `${playerName} joins the party and takes a place by the campfire, ready for the journey ahead.`;
}

/**
 * Shared scene-generation pipeline used by APPROVE_ACTIONS (group) and
 * SOLO_ACTION (single-player) handlers. Happy path only — callers must wrap
 * the call in try/catch and handle restorePendingActions + GENERATION_FAILED
 * broadcast themselves, since user-facing error copy differs between flows.
 *
 * `soloActionName` parameter triggers the single-diceRoll momentum fallback
 * path that SOLO_ACTION uses when the scene doesn't return a diceRolls[] array.
 */
export async function runMultiplayerSceneFlow({
  fastify,
  room,
  roomCode,
  actions,
  msg,
  soloActionName = null,
}) {
  const players = [];
  for (const [, p] of room.players) {
    players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost });
  }

  const prevMomentum = room.gameState.characterMomentum || {};

  const sceneResult = await generateMultiplayerScene(
    room.gameState,
    room.settings,
    players,
    actions,
    null,
    msg.language || 'en',
    msg.dmSettings || null,
    prevMomentum,
  );

  const { validated } = validateMultiplayerStateChanges(
    sceneResult.stateChanges, room.gameState
  );
  sceneResult.stateChanges = normalizeMultiplayerStateChanges(validated);

  const newMomentum = computeNewMomentum(sceneResult.scene, prevMomentum, soloActionName);

  const applied = applySceneStateChanges(room.gameState, sceneResult, room.settings);
  const updatedGameState = {
    ...room.gameState,
    characters: applied.characters,
    world: applied.world,
    quests: applied.quests,
    ...(applied.campaign && { campaign: applied.campaign }),
    scenes: [...(room.gameState.scenes || []), sceneResult.scene],
    chatHistory: [...(room.gameState.chatHistory || []), ...sceneResult.chatMessages],
    characterMomentum: newMomentum,
  };
  setGameState(roomCode, updatedGameState);

  persistMultiplayerCharactersToDB(room, applied.characters)
    .catch((err) => fastify.log.warn(err, 'MP character persist failed'));

  const updatedRoom = getRoom(roomCode);
  broadcast(updatedRoom, {
    type: 'SCENE_UPDATE',
    scene: sceneResult.scene,
    chatMessages: sceneResult.chatMessages,
    stateChanges: sceneResult.stateChanges,
    room: sanitizeRoom(updatedRoom),
  });

  saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save failed'));

  if (needsCompression(updatedGameState)) {
    compressOldScenes(updatedGameState, null, msg.language || 'en')
      .then((summary) => {
        if (summary) {
          const currentRoom = getRoom(roomCode);
          if (currentRoom?.gameState) {
            currentRoom.gameState.world = {
              ...(currentRoom.gameState.world || {}),
              compressedHistory: summary,
            };
            setGameState(roomCode, currentRoom.gameState);
            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save after compression failed'));
          }
        }
      })
      .catch((err) => fastify.log.warn(err, 'MP scene compression failed'));
  }

  return { sceneResult, updatedRoom };
}
