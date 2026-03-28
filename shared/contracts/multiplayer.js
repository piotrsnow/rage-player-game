export const WS_CLIENT_TYPES = Object.freeze({
  CREATE_ROOM: 'CREATE_ROOM',
  CONVERT_TO_MULTIPLAYER: 'CONVERT_TO_MULTIPLAYER',
  JOIN_ROOM: 'JOIN_ROOM',
  LEAVE_ROOM: 'LEAVE_ROOM',
  UPDATE_CHARACTER: 'UPDATE_CHARACTER',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  START_GAME: 'START_GAME',
  SUBMIT_ACTION: 'SUBMIT_ACTION',
  WITHDRAW_ACTION: 'WITHDRAW_ACTION',
  UPDATE_SCENE_IMAGE: 'UPDATE_SCENE_IMAGE',
  APPROVE_ACTIONS: 'APPROVE_ACTIONS',
  SOLO_ACTION: 'SOLO_ACTION',
  ACCEPT_QUEST_OFFER: 'ACCEPT_QUEST_OFFER',
  DECLINE_QUEST_OFFER: 'DECLINE_QUEST_OFFER',
  SYNC_CHARACTER: 'SYNC_CHARACTER',
  COMBAT_SYNC: 'COMBAT_SYNC',
  COMBAT_MANOEUVRE: 'COMBAT_MANOEUVRE',
  COMBAT_ENDED: 'COMBAT_ENDED',
  TYPING: 'TYPING',
  PING: 'PING',
  REJOIN_ROOM: 'REJOIN_ROOM',
  WEBRTC_OFFER: 'WEBRTC_OFFER',
  WEBRTC_ANSWER: 'WEBRTC_ANSWER',
  WEBRTC_ICE: 'WEBRTC_ICE',
  WEBRTC_TRACK_STATE: 'WEBRTC_TRACK_STATE',
  KICK_PLAYER: 'KICK_PLAYER',
});

export const WS_SERVER_TYPES = Object.freeze({
  ERROR: 'ERROR',
  ROOM_CREATED: 'ROOM_CREATED',
  ROOM_CONVERTED: 'ROOM_CONVERTED',
  ROOM_JOINED: 'ROOM_JOINED',
  ROOM_STATE: 'ROOM_STATE',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_JOINED_MIDGAME: 'PLAYER_JOINED_MIDGAME',
  PLAYER_LEFT: 'PLAYER_LEFT',
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED: 'PLAYER_RECONNECTED',
  LEFT_ROOM: 'LEFT_ROOM',
  GAME_STARTING: 'GAME_STARTING',
  GAME_STARTED: 'GAME_STARTED',
  ACTIONS_UPDATED: 'ACTIONS_UPDATED',
  SCENE_GENERATING: 'SCENE_GENERATING',
  SCENE_UPDATE: 'SCENE_UPDATE',
  GENERATION_FAILED: 'GENERATION_FAILED',
  SCENE_IMAGE_UPDATE: 'SCENE_IMAGE_UPDATE',
  QUEST_OFFER_UPDATE: 'QUEST_OFFER_UPDATE',
  CHARACTER_SYNCED: 'CHARACTER_SYNCED',
  COMBAT_SYNC: 'COMBAT_SYNC',
  COMBAT_MANOEUVRE: 'COMBAT_MANOEUVRE',
  COMBAT_ENDED: 'COMBAT_ENDED',
  PLAYER_DIED: 'PLAYER_DIED',
  TYPING: 'TYPING',
  PONG: 'PONG',
  ROOM_EXPIRED: 'ROOM_EXPIRED',
  WEBRTC_OFFER: 'WEBRTC_OFFER',
  WEBRTC_ANSWER: 'WEBRTC_ANSWER',
  WEBRTC_ICE: 'WEBRTC_ICE',
  WEBRTC_TRACK_STATE: 'WEBRTC_TRACK_STATE',
  KICKED: 'KICKED',
});

const CLIENT_TYPE_SET = new Set(Object.values(WS_CLIENT_TYPES));
const SERVER_TYPE_SET = new Set(Object.values(WS_SERVER_TYPES));

export function normalizeClientWsType(type) {
  if (!type || typeof type !== 'string') return null;
  return CLIENT_TYPE_SET.has(type) ? type : null;
}

export function normalizeServerWsType(type) {
  if (!type || typeof type !== 'string') return null;
  return SERVER_TYPE_SET.has(type) ? type : null;
}

function normalizePerCharacterDelta(delta) {
  if (!delta || typeof delta !== 'object') return delta;
  const normalized = { ...delta };
  if (normalized.wounds == null && typeof normalized.woundsChange === 'number') {
    normalized.wounds = normalized.woundsChange;
  }
  if (normalized.woundsChange != null) {
    delete normalized.woundsChange;
  }
  return normalized;
}

export function normalizeMultiplayerStateChanges(stateChanges) {
  if (!stateChanges || typeof stateChanges !== 'object') return stateChanges;
  const normalized = { ...stateChanges };

  if (normalized.perCharacter && typeof normalized.perCharacter === 'object') {
    const nextPerCharacter = {};
    for (const [charName, delta] of Object.entries(normalized.perCharacter)) {
      nextPerCharacter[charName] = normalizePerCharacterDelta(delta);
    }
    normalized.perCharacter = nextPerCharacter;
  }

  return normalized;
}

export function createWsMessage(type, payload = {}) {
  return { type, ...payload };
}
