import { z } from 'zod';

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
  VERIFY_QUEST_OBJECTIVE: 'VERIFY_QUEST_OBJECTIVE',
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
  BEER_DUEL_ACTION: 'BEER_DUEL_ACTION',
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
  SCENE_CHUNK: 'SCENE_CHUNK',
  GENERATION_FAILED: 'GENERATION_FAILED',
  SCENE_IMAGE_UPDATE: 'SCENE_IMAGE_UPDATE',
  QUEST_OFFER_UPDATE: 'QUEST_OFFER_UPDATE',
  QUEST_OBJECTIVE_VERIFIED: 'QUEST_OBJECTIVE_VERIFIED',
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
  BEER_DUEL_ACTION: 'BEER_DUEL_ACTION',
  BEER_DUEL_END: 'BEER_DUEL_END',
});

export const AI_ERROR_CODES = Object.freeze({
  NO_SERVER_API_KEY: 'NO_SERVER_API_KEY',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_RATE_LIMIT: 'AI_RATE_LIMIT',
  AI_INVALID_RESPONSE: 'AI_INVALID_RESPONSE',
  AI_REQUEST_FAILED: 'AI_REQUEST_FAILED',
});

export const TYPING_DRAFT_MAX_LENGTH = 220;

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

// ---------------------------------------------------------------------------
// WS payload schemas — keyed by WS_CLIENT_TYPES value.
// Handlers may read additional fields via passthrough; these schemas enforce
// the minimum shape required to avoid runtime crashes in the handler layer.
// ---------------------------------------------------------------------------

const str = z.string().max(2000);
const shortStr = z.string().max(200);

export const WS_PAYLOAD_SCHEMAS = Object.freeze({
  // --- lobby ---
  JOIN_ROOM: z.object({
    roomCode: shortStr,
    characterId: str,
    language: shortStr.optional(),
  }).passthrough(),

  REJOIN_ROOM: z.object({
    roomCode: shortStr,
    odId: str,
  }).passthrough(),

  CONVERT_TO_MULTIPLAYER: z.object({
    gameState: z.record(z.unknown()),
  }).passthrough(),

  KICK_PLAYER: z.object({
    targetOdId: str,
  }).passthrough(),

  // --- room state ---
  UPDATE_SETTINGS: z.object({
    settings: z.record(z.unknown()),
  }).passthrough(),

  UPDATE_SCENE_IMAGE: z.object({
    sceneId: str,
  }).passthrough(),

  TYPING: z.object({
    isTyping: z.boolean().optional(),
    draft: z.string().max(TYPING_DRAFT_MAX_LENGTH + 50).optional(),
  }).passthrough(),

  // --- gameplay ---
  START_GAME: z.object({
    language: shortStr.optional(),
  }).passthrough(),

  SUBMIT_ACTION: z.object({
    text: z.string().min(1).max(5000),
  }).passthrough(),

  SOLO_ACTION: z.object({
    text: z.string().min(1).max(5000),
  }).passthrough(),

  APPROVE_ACTIONS: z.object({
    language: shortStr.optional(),
  }).passthrough(),

  // --- quests ---
  ACCEPT_QUEST_OFFER: z.object({
    sceneId: str,
    questOffer: z.object({ id: str }).passthrough(),
  }).passthrough(),

  DECLINE_QUEST_OFFER: z.object({
    sceneId: str,
    offerId: str,
  }).passthrough(),

  VERIFY_QUEST_OBJECTIVE: z.object({
    requestId: str,
    questId: str,
    objectiveId: str,
  }).passthrough(),

  // --- combat ---
  COMBAT_SYNC: z.object({
    combat: z.record(z.unknown()),
  }).passthrough(),

  COMBAT_MANOEUVRE: z.object({
    manoeuvre: shortStr,
  }).passthrough(),

  COMBAT_ENDED: z.object({}).passthrough(),

  // --- beer duel ---
  BEER_DUEL_ACTION: z.object({
    action: z.enum(['drink', 'pee', 'vomit']),
  }).passthrough(),

  // --- webrtc ---
  WEBRTC_OFFER: z.object({ targetOdId: str, offer: z.unknown() }).passthrough(),
  WEBRTC_ANSWER: z.object({ targetOdId: str, answer: z.unknown() }).passthrough(),
  WEBRTC_ICE: z.object({ targetOdId: str, candidate: z.unknown() }).passthrough(),
  WEBRTC_TRACK_STATE: z.object({ targetOdId: str }).passthrough(),
});
