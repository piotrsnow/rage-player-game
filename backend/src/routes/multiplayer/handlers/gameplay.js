import {
  submitAction,
  withdrawAction,
  approveActions,
  executeSoloAction,
  restorePendingActions,
  getRoom,
  setPhase,
  setGameState,
  broadcast,
  sanitizeRoom,
  saveRoomToDB,
} from '../../../services/roomManager.js';
import { generateMultiplayerCampaign } from '../../../services/multiplayerAI.js';
import { runMultiplayerSceneFlow } from '../../../services/multiplayerSceneFlow.js';
import { toClientAiError } from '../../../services/aiErrors.js';
import { prisma } from '../../../lib/prisma.js';
import { seedInitialWorld } from '../../../services/livingWorld/worldSeeder.js';
import { childLogger } from '../../../lib/logger.js';

const log = childLogger({ module: 'mp-gameplay' });

export async function handleStartGame(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const currentRoom = getRoom(session.roomCode);
  if (!currentRoom) throw new Error('Room not found');
  if (currentRoom.hostId !== session.odId) throw new Error('Only the host can start the game');

  broadcast(currentRoom, { type: 'GAME_STARTING' });

  try {
    const players = [];
    for (const [, p] of currentRoom.players) {
      players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost, characterData: p.characterData || null });
    }

    const campaignResult = await generateMultiplayerCampaign(
      currentRoom.settings,
      players,
      null,
      msg.language || 'en',
    );

    setPhase(session.roomCode, 'playing');
    setGameState(session.roomCode, campaignResult);

    const hostPlayer = currentRoom.players.get(session.odId);
    const livingWorldEnabled = currentRoom.settings?.livingWorldEnabled === true;
    try {
      const campaign = await prisma.campaign.create({
        data: {
          userId: hostPlayer?.userId || ctx.uid,
          name: currentRoom.settings?.name || campaignResult.campaign?.name || 'Multiplayer Campaign',
          genre: currentRoom.settings?.genre || 'Fantasy',
          tone: currentRoom.settings?.tone || 'Epic',
          livingWorldEnabled,
          coreState: {},
        },
      });
      const room = getRoom(session.roomCode);
      if (room) room.campaignId = campaign.id;

      if (livingWorldEnabled) {
        const campaignLength = currentRoom.settings?.length || 'Medium';
        seedInitialWorld(campaign.id, { length: campaignLength })
          .then((seedResult) => {
            if (seedResult?.startingLocationName) {
              const r = getRoom(session.roomCode);
              if (r?.gameState?.world) {
                r.gameState.world.currentLocation = seedResult.startingLocationName;
                setGameState(session.roomCode, r.gameState);
              }
            }
          })
          .catch((err) => log.warn({ err: err?.message }, 'Living World seed for MP failed (non-fatal)'));
      }
    } catch (err) {
      ctx.fastify.log.warn(err, 'Failed to create Campaign row for MP — post-scene work will be skipped');
    }

    const updatedRoom = getRoom(session.roomCode);
    broadcast(updatedRoom, {
      type: 'GAME_STARTED',
      gameState: campaignResult,
      room: sanitizeRoom(updatedRoom),
    });

    saveRoomToDB(session.roomCode).catch((err) => ctx.fastify.log.warn(err, 'MP room save failed'));
  } catch (genErr) {
    ctx.fastify.log.error(genErr, 'START_GAME generation failed');
    const aiError = toClientAiError(genErr, 'Campaign generation failed. Please try again.');
    broadcast(currentRoom, {
      type: 'GENERATION_FAILED',
      message: aiError.message,
      code: aiError.code,
      retryable: aiError.retryable,
    });
  }
}

export async function handleSubmitAction(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const room = submitAction(session.roomCode, session.odId, msg.text, msg.isCustom);
  broadcast(room, {
    type: 'ACTIONS_UPDATED',
    room: sanitizeRoom(room),
  });
}

export async function handleWithdrawAction(ctx, session) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const room = withdrawAction(session.roomCode, session.odId);
  broadcast(room, {
    type: 'ACTIONS_UPDATED',
    room: sanitizeRoom(room),
  });
}

export async function handleApproveActions(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const { room, actions } = approveActions(session.roomCode, session.odId);
  if (actions.length === 0) throw new Error('No actions to approve');

  broadcast(room, { type: 'SCENE_GENERATING' });

  try {
    await runMultiplayerSceneFlow({
      fastify: ctx.fastify,
      room,
      roomCode: session.roomCode,
      actions,
      msg,
      soloActionName: null,
    });
  } catch (genErr) {
    ctx.fastify.log.error(genErr, 'APPROVE_ACTIONS generation failed');
    restorePendingActions(session.roomCode, actions);
    const aiError = toClientAiError(genErr, 'Scene generation failed. Your actions have been restored — please try again.');
    broadcast(room, {
      type: 'GENERATION_FAILED',
      message: aiError.message,
      code: aiError.code,
      retryable: aiError.retryable,
      room: sanitizeRoom(room),
    });
  }
}

export async function handleSoloAction(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const { room, action } = executeSoloAction(session.roomCode, session.odId, msg.text, msg.isCustom);

  broadcast(room, { type: 'SCENE_GENERATING' });
  broadcast(room, {
    type: 'ACTIONS_UPDATED',
    room: sanitizeRoom(room),
  });

  try {
    await runMultiplayerSceneFlow({
      fastify: ctx.fastify,
      room,
      roomCode: session.roomCode,
      actions: [action],
      msg,
      soloActionName: action.name,
    });
  } catch (genErr) {
    ctx.fastify.log.error(genErr, 'SOLO_ACTION generation failed');
    restorePendingActions(session.roomCode, [action]);
    const aiError = toClientAiError(genErr, 'Scene generation failed. Your action has been restored — please try again.');
    broadcast(room, {
      type: 'GENERATION_FAILED',
      message: aiError.message,
      code: aiError.code,
      retryable: aiError.retryable,
      room: sanitizeRoom(room),
    });
  }
}

export async function handleBeerDuelAction(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const room = getRoom(session.roomCode);
  if (!room) throw new Error('Room not found');

  broadcast(room, {
    type: 'BEER_DUEL_ACTION',
    senderOdId: session.odId,
    action: msg.action,
  }, session.odId);
}
