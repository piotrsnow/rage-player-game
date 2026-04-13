import {
  getRoom,
  setGameState,
  broadcast,
  sendTo,
  sanitizeRoom,
  saveRoomToDB,
} from '../../../services/roomManager.js';
import { normalizeMultiplayerStateChanges } from '../../../../../shared/contracts/multiplayer.js';

export async function handleCombatSync(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const combatRoom = getRoom(session.roomCode);
  if (!combatRoom) throw new Error('Room not found');
  if (combatRoom.hostId !== session.odId) throw new Error('Only the host can sync combat state');
  if (!combatRoom.gameState) throw new Error('Game not in progress');

  combatRoom.gameState.combat = msg.combat;
  if (Array.isArray(msg.chatMessages) && msg.chatMessages.length > 0) {
    combatRoom.gameState.chatHistory = [
      ...(combatRoom.gameState.chatHistory || []),
      ...msg.chatMessages,
    ];
  }
  setGameState(session.roomCode, combatRoom.gameState);

  broadcast(combatRoom, {
    type: 'COMBAT_SYNC',
    combat: msg.combat,
    chatMessages: Array.isArray(msg.chatMessages) ? msg.chatMessages : [],
  });

  saveRoomToDB(session.roomCode).catch((err) => ctx.fastify.log.warn(err, 'MP room save after combat sync failed'));
}

export async function handleCombatManoeuvre(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const manRoom = getRoom(session.roomCode);
  if (!manRoom) throw new Error('Room not found');
  if (!manRoom.gameState?.combat?.active) throw new Error('No active combat');

  sendTo(manRoom, manRoom.hostId, {
    type: 'COMBAT_MANOEUVRE',
    fromOdId: session.odId,
    manoeuvre: msg.manoeuvre,
    targetId: msg.targetId,
    customDescription: msg.customDescription,
  });
}

export async function handleCombatEnded(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const endRoom = getRoom(session.roomCode);
  if (!endRoom) throw new Error('Room not found');
  if (endRoom.hostId !== session.odId) throw new Error('Only the host can end combat');
  if (!endRoom.gameState) throw new Error('Game not in progress');

  const combatPerChar = normalizeMultiplayerStateChanges({ perCharacter: msg.perCharacter || {} }).perCharacter || {};
  const chars = endRoom.gameState.characters || [];
  const deadPlayers = [];
  endRoom.gameState.characters = chars.map((c) => {
    const delta = combatPerChar[c.name];
    if (!delta) return c;
    const updated = { ...c };
    if (delta.wounds != null) {
      updated.wounds = Math.max(0, Math.min(updated.maxWounds, updated.wounds + delta.wounds));
    }
    if (delta.xp != null) {
      updated.xp = (updated.xp || 0) + delta.xp;
    }
    if (updated.wounds === 0 && delta.wounds < 0) {
      const critCount = (updated.criticalWoundCount || 0) + 1;
      updated.criticalWoundCount = critCount;
      if (critCount >= 3) {
        updated.status = 'dead';
        deadPlayers.push({ name: c.name, odId: c.odId });
      }
    }
    return updated;
  });

  endRoom.gameState.combat = null;

  if (msg.journalEntry) {
    if (!endRoom.gameState.world) endRoom.gameState.world = {};
    endRoom.gameState.world.eventHistory = [
      ...(endRoom.gameState.world.eventHistory || []),
      msg.journalEntry,
    ];
  }

  setGameState(session.roomCode, endRoom.gameState);

  broadcast(endRoom, {
    type: 'COMBAT_ENDED',
    perCharacter: combatPerChar,
    deadPlayers,
    summary: {
      enemiesDefeated: msg.enemiesDefeated,
      totalEnemies: msg.totalEnemies,
      rounds: msg.rounds,
      outcome: msg.outcome || 'victory',
    },
    room: sanitizeRoom(endRoom),
  });

  for (const dp of deadPlayers) {
    broadcast(endRoom, {
      type: 'PLAYER_DIED',
      playerName: dp.name,
      playerOdId: dp.odId,
    });
  }

  saveRoomToDB(session.roomCode).catch((err) => ctx.fastify.log.warn(err, 'MP room save after combat end failed'));
}
