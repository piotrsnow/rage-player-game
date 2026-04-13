import {
  getRoom,
  setGameState,
  broadcast,
  sendTo,
  sanitizeRoom,
  saveRoomToDB,
} from '../../../services/roomManager.js';
import { verifyMultiplayerQuestObjective } from '../../../services/multiplayerAI.js';

export async function handleAcceptQuestOffer(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const room = getRoom(session.roomCode);
  if (!room) throw new Error('Room not found');
  const { sceneId, questOffer } = msg;
  if (!sceneId || !questOffer?.id) return;

  const quest = {
    id: questOffer.id,
    name: questOffer.name,
    description: questOffer.description,
    completionCondition: questOffer.completionCondition,
    objectives: (questOffer.objectives || []).map((obj) => ({ ...obj, completed: false })),
  };
  if (!room.gameState.quests) room.gameState.quests = { active: [], completed: [] };
  room.gameState.quests.active.push(quest);

  if (room.gameState?.scenes) {
    const sIdx = room.gameState.scenes.findIndex((s) => s.id === sceneId);
    if (sIdx >= 0 && room.gameState.scenes[sIdx].questOffers) {
      room.gameState.scenes[sIdx].questOffers = room.gameState.scenes[sIdx].questOffers.map((o) =>
        o.id === questOffer.id ? { ...o, status: 'accepted' } : o
      );
    }
  }

  const acceptMsg = {
    id: `msg_${Date.now()}_quest_accept`,
    role: 'system',
    subtype: 'quest_new',
    content: `New quest: ${quest.name}`,
    timestamp: Date.now(),
  };
  room.gameState.chatHistory = [...(room.gameState.chatHistory || []), acceptMsg];
  setGameState(session.roomCode, room.gameState);

  broadcast(room, {
    type: 'QUEST_OFFER_UPDATE',
    sceneId,
    offerId: questOffer.id,
    status: 'accepted',
    quest,
    chatMessage: acceptMsg,
    room: sanitizeRoom(room),
  });
  saveRoomToDB(session.roomCode).catch((err) => ctx.fastify.log.warn(err, 'MP room save failed'));
}

export async function handleDeclineQuestOffer(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const room = getRoom(session.roomCode);
  if (!room) throw new Error('Room not found');
  const { sceneId, offerId } = msg;
  if (!sceneId || !offerId) return;

  if (room.gameState?.scenes) {
    const sIdx = room.gameState.scenes.findIndex((s) => s.id === sceneId);
    if (sIdx >= 0 && room.gameState.scenes[sIdx].questOffers) {
      room.gameState.scenes[sIdx].questOffers = room.gameState.scenes[sIdx].questOffers.map((o) =>
        o.id === offerId ? { ...o, status: 'declined' } : o
      );
    }
  }
  setGameState(session.roomCode, room.gameState);

  broadcast(room, {
    type: 'QUEST_OFFER_UPDATE',
    sceneId,
    offerId,
    status: 'declined',
    room: sanitizeRoom(room),
  });
}

export async function handleVerifyQuestObjective(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const room = getRoom(session.roomCode);
  if (!room) throw new Error('Room not found');
  if (!room.gameState?.quests?.active) throw new Error('Game not in progress');

  const { questId, objectiveId, requestId } = msg;
  if (!questId || !objectiveId || !requestId) return;

  const quest = room.gameState.quests.active.find((q) => q.id === questId);
  if (!quest) {
    sendTo(room, session.odId, {
      type: 'QUEST_OBJECTIVE_VERIFIED',
      requestId,
      questId,
      objectiveId,
      fulfilled: false,
      reasoning: 'Quest not found.',
    });
    return;
  }

  const objective = quest.objectives?.find((o) => o.id === objectiveId);
  if (!objective) {
    sendTo(room, session.odId, {
      type: 'QUEST_OBJECTIVE_VERIFIED',
      requestId,
      questId,
      objectiveId,
      fulfilled: false,
      reasoning: 'Objective not found.',
    });
    return;
  }

  if (objective.completed) {
    sendTo(room, session.odId, {
      type: 'QUEST_OBJECTIVE_VERIFIED',
      requestId,
      questId,
      objectiveId,
      fulfilled: true,
      reasoning: msg.language === 'pl'
        ? 'Cel jest już oznaczony jako ukończony.'
        : 'This objective is already marked as completed.',
      alreadyCompleted: true,
    });
    return;
  }

  const world = room.gameState.world || {};
  const scenes = room.gameState.scenes || [];
  const recentScenes = scenes.slice(-12);
  const contextParts = [];

  if (world.compressedHistory) {
    contextParts.push(`ARCHIVED HISTORY:\n${world.compressedHistory}`);
  }
  if (Array.isArray(world.eventHistory) && world.eventHistory.length > 0) {
    const lastEvents = world.eventHistory.slice(-40);
    contextParts.push(`STORY JOURNAL:\n${lastEvents.map((entry, idx) => `${idx + 1}. ${entry}`).join('\n')}`);
  }
  if (recentScenes.length > 0) {
    contextParts.push(
      `RECENT SCENES:\n${recentScenes
        .map((scene, idx) => {
          const number = scenes.length - recentScenes.length + idx + 1;
          return `Scene ${number}: ${(scene?.narrative || '').slice(0, 1600)}`;
        })
        .join('\n\n')}`
    );
  }

  const storyContext = contextParts.join('\n\n') || 'No story events yet.';
  const verification = await verifyMultiplayerQuestObjective(
    storyContext,
    quest.name,
    quest.description,
    objective.description,
    msg.language || 'en',
  );

  if (!verification.fulfilled) {
    sendTo(room, session.odId, {
      type: 'QUEST_OBJECTIVE_VERIFIED',
      requestId,
      questId,
      objectiveId,
      fulfilled: false,
      reasoning: verification.reasoning || '',
    });
    return;
  }

  room.gameState.quests.active = room.gameState.quests.active.map((activeQuest) => {
    if (activeQuest.id !== questId) return activeQuest;
    return {
      ...activeQuest,
      objectives: (activeQuest.objectives || []).map((obj) =>
        obj.id === objectiveId ? { ...obj, completed: true } : obj
      ),
    };
  });

  const objectiveMessage = {
    id: `msg_${Date.now()}_quest_obj_verify`,
    role: 'system',
    subtype: 'quest_objective_completed',
    content: msg.language === 'pl'
      ? `Cel ukończony: ${quest.name} — ${objective.description}`
      : `Objective completed: ${quest.name} — ${objective.description}`,
    timestamp: Date.now(),
  };
  room.gameState.chatHistory = [...(room.gameState.chatHistory || []), objectiveMessage];
  setGameState(session.roomCode, room.gameState);

  broadcast(room, {
    type: 'ROOM_STATE',
    room: sanitizeRoom(room),
  });

  sendTo(room, session.odId, {
    type: 'QUEST_OBJECTIVE_VERIFIED',
    requestId,
    questId,
    objectiveId,
    fulfilled: true,
    reasoning: verification.reasoning || '',
  });

  saveRoomToDB(session.roomCode).catch((err) => ctx.fastify.log.warn(err, 'MP room save after quest verification failed'));
}
