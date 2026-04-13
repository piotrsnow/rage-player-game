import { getRoom, sendTo } from '../../../services/roomManager.js';

export async function handleWebrtcOffer(ctx, session, msg) {
  if (!session.roomCode) return;
  const room = getRoom(session.roomCode);
  if (room && msg.targetOdId) {
    sendTo(room, msg.targetOdId, { type: 'WEBRTC_OFFER', fromOdId: session.odId, offer: msg.offer });
  }
}

export async function handleWebrtcAnswer(ctx, session, msg) {
  if (!session.roomCode) return;
  const room = getRoom(session.roomCode);
  if (room && msg.targetOdId) {
    sendTo(room, msg.targetOdId, { type: 'WEBRTC_ANSWER', fromOdId: session.odId, answer: msg.answer });
  }
}

export async function handleWebrtcIce(ctx, session, msg) {
  if (!session.roomCode) return;
  const room = getRoom(session.roomCode);
  if (room && msg.targetOdId) {
    sendTo(room, msg.targetOdId, { type: 'WEBRTC_ICE', fromOdId: session.odId, candidate: msg.candidate });
  }
}

export async function handleWebrtcTrackState(ctx, session, msg) {
  if (!session.roomCode) return;
  const room = getRoom(session.roomCode);
  if (room && msg.targetOdId) {
    sendTo(room, msg.targetOdId, {
      type: 'WEBRTC_TRACK_STATE',
      fromOdId: session.odId,
      videoEnabled: msg.videoEnabled,
      audioEnabled: msg.audioEnabled,
    });
  }
}
