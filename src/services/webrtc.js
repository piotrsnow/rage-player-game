import { wsService } from './websocket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const WEBRTC_DEBUG = Boolean(import.meta?.env?.DEV);

function mapMediaError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'permission_denied';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'device_not_found';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'device_in_use';
  }
  return 'unknown_media_error';
}

class WebRTCService {
  constructor() {
    this._peers = new Map();
    this._localStream = null;
    this._handlers = new Map();
    this._myOdId = null;
    this._pendingCandidates = new Map();
    this._unsubscribers = [];
  }

  get localStream() {
    return this._localStream;
  }

  get peers() {
    return this._peers;
  }

  init(myOdId) {
    this._myOdId = myOdId;
    this._unsubscribers.push(
      wsService.on('WEBRTC_OFFER', (msg) => this._handleOffer(msg)),
      wsService.on('WEBRTC_ANSWER', (msg) => this._handleAnswer(msg)),
      wsService.on('WEBRTC_ICE', (msg) => this._handleIce(msg)),
    );
  }

  async startLocalStream({ video = true, audio = true } = {}) {
    if (this._localStream) {
      this._emit('localStream', this._localStream);
      await this.syncLocalStreamToPeers();
      return this._localStream;
    }
    if (!globalThis?.navigator?.mediaDevices?.getUserMedia) {
      this._emit('error', {
        type: 'media',
        code: 'unsupported_media_api',
        error: new Error('MediaDevices API is not available'),
      });
      return null;
    }
    if (globalThis?.window?.isSecureContext === false) {
      this._emit('error', {
        type: 'media',
        code: 'insecure_context',
        error: new Error('Camera access requires a secure context (HTTPS or localhost)'),
      });
      return null;
    }
    try {
      this._localStream = await globalThis.navigator.mediaDevices.getUserMedia({
        video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
        audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
      });
      await this.syncLocalStreamToPeers();
      this._emit('localStream', this._localStream);
      this._broadcastTrackState();
      return this._localStream;
    } catch (err) {
      this._emit('error', { type: 'media', code: mapMediaError(err), error: err });
      return null;
    }
  }

  stopLocalStream() {
    if (this._localStream) {
      this._localStream.getTracks().forEach((t) => t.stop());
      this._localStream = null;
      for (const [, pc] of this._peers) {
        for (const sender of pc.getSenders()) {
          if (sender.track && (sender.track.kind === 'audio' || sender.track.kind === 'video')) {
            sender.replaceTrack(null).catch(() => {});
          }
        }
      }
      this._emit('localStream', null);
      this._broadcastTrackState();
    }
  }

  setTrackEnabled(kind, enabled) {
    if (!this._localStream) return;
    for (const track of this._localStream.getTracks()) {
      if (track.kind === kind) track.enabled = enabled;
    }
    this._broadcastTrackState();
  }

  getTrackEnabled(kind) {
    if (!this._localStream) return false;
    const track = this._localStream.getTracks().find((t) => t.kind === kind);
    return track ? track.enabled : false;
  }

  _broadcastTrackState() {
    const videoEnabled = this.getTrackEnabled('video');
    const audioEnabled = this.getTrackEnabled('audio');
    for (const [targetOdId] of this._peers) {
      wsService.send('WEBRTC_TRACK_STATE', {
        targetOdId,
        videoEnabled,
        audioEnabled,
      });
    }
  }

  async connectToPeer(remoteOdId) {
    if (!remoteOdId || remoteOdId === this._myOdId) return;
    if (this._peers.has(remoteOdId)) {
      await this._syncLocalTracksToPeer(remoteOdId);
      return;
    }
    if (!wsService.connected) {
      this._emit('error', {
        type: 'signal',
        code: 'ws_not_connected',
        error: new Error('WebSocket is not connected'),
      });
      return;
    }
    const pc = this._createPeerConnection(remoteOdId);
    await this._syncLocalTracksToPeer(remoteOdId);
    this._ensureReceiveOnlyTransceivers(pc);
    await this._createAndSendOffer(remoteOdId);
  }

  disconnectFromPeer(remoteOdId) {
    const pc = this._peers.get(remoteOdId);
    if (pc) {
      pc.close();
      this._peers.delete(remoteOdId);
      this._pendingCandidates.delete(remoteOdId);
      this._emit('peerDisconnected', remoteOdId);
    }
  }

  disconnectAll() {
    for (const [odId, pc] of this._peers) {
      pc.close();
      this._emit('peerDisconnected', odId);
    }
    this._peers.clear();
    this._pendingCandidates.clear();
  }

  destroy() {
    this.disconnectAll();
    this.stopLocalStream();
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
    this._myOdId = null;
    this._handlers.clear();
  }

  _createPeerConnection(remoteOdId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._debug('ice-candidate', { remoteOdId });
        const sent = wsService.send('WEBRTC_ICE', {
          targetOdId: remoteOdId,
          candidate: event.candidate.toJSON(),
        });
        if (!sent) {
          this._emit('error', {
            type: 'signal',
            code: 'signal_send_failed',
            error: new Error('Failed to send WEBRTC_ICE'),
          });
        }
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      this._debug('remote-track', { remoteOdId, kind: event.track?.kind });
      this._emit('remoteStream', { odId: remoteOdId, stream });
    };

    pc.onconnectionstatechange = () => {
      this._debug('connection-state', { remoteOdId, state: pc.connectionState });
      this._emit('connectionState', { odId: remoteOdId, state: pc.connectionState });
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._peers.delete(remoteOdId);
        this._pendingCandidates.delete(remoteOdId);
        this._emit('peerDisconnected', remoteOdId);
      }
    };

    this._peers.set(remoteOdId, pc);
    return pc;
  }

  async _handleOffer(msg) {
    const { fromOdId, offer } = msg;
    this._debug('offer-received', { fromOdId });
    if (this._peers.has(fromOdId)) {
      this._peers.get(fromOdId).close();
      this._peers.delete(fromOdId);
    }

    const pc = this._createPeerConnection(fromOdId);

    await this._syncLocalTracksToPeer(fromOdId);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const pending = this._pendingCandidates.get(fromOdId);
    if (pending) {
      for (const c of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      this._pendingCandidates.delete(fromOdId);
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this._debug('answer-sent', { fromOdId });
    const sent = wsService.send('WEBRTC_ANSWER', {
      targetOdId: fromOdId,
      answer: { type: answer.type, sdp: answer.sdp },
    });
    if (!sent) {
      this._emit('error', {
        type: 'signal',
        code: 'signal_send_failed',
        error: new Error('Failed to send WEBRTC_ANSWER'),
      });
    }
  }

  async _handleAnswer(msg) {
    const { fromOdId, answer } = msg;
    this._debug('answer-received', { fromOdId });
    const pc = this._peers.get(fromOdId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));

    const pending = this._pendingCandidates.get(fromOdId);
    if (pending) {
      for (const c of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      this._pendingCandidates.delete(fromOdId);
    }
  }

  async _handleIce(msg) {
    const { fromOdId, candidate } = msg;
    this._debug('ice-received', { fromOdId });
    const pc = this._peers.get(fromOdId);
    if (!pc || !pc.remoteDescription) {
      if (!this._pendingCandidates.has(fromOdId)) {
        this._pendingCandidates.set(fromOdId, []);
      }
      this._pendingCandidates.get(fromOdId).push(candidate);
      return;
    }
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  async syncLocalStreamToPeers() {
    if (!this._peers.size) return;
    const renegotiateTargets = [];
    for (const [remoteOdId] of this._peers) {
      const changed = await this._syncLocalTracksToPeer(remoteOdId);
      if (changed) {
        renegotiateTargets.push(remoteOdId);
      }
    }
    for (const remoteOdId of renegotiateTargets) {
      await this._createAndSendOffer(remoteOdId);
    }
  }

  async _syncLocalTracksToPeer(remoteOdId) {
    const pc = this._peers.get(remoteOdId);
    if (!pc) return false;
    this._ensureReceiveOnlyTransceivers(pc);
    if (!this._localStream) return false;
    let changed = false;
    const localTracks = this._localStream.getTracks();

    for (const track of localTracks) {
      const existingSender = pc.getSenders().find((s) => s.track?.kind === track.kind);
      if (existingSender) {
        if (existingSender.track !== track) {
          await existingSender.replaceTrack(track);
          changed = true;
        }
        continue;
      }

      const reusableTransceiver = pc.getTransceivers().find((t) => {
        const senderKind = t.sender?.track?.kind;
        const receiverKind = t.receiver?.track?.kind;
        return senderKind === track.kind || receiverKind === track.kind;
      });

      if (reusableTransceiver?.sender) {
        await reusableTransceiver.sender.replaceTrack(track);
        if (reusableTransceiver.direction === 'recvonly') {
          reusableTransceiver.direction = 'sendrecv';
        }
        changed = true;
      } else {
        pc.addTrack(track, this._localStream);
        changed = true;
      }
    }
    return changed;
  }

  _ensureReceiveOnlyTransceivers(pc) {
    for (const kind of ['audio', 'video']) {
      const hasKind = pc.getTransceivers().some((t) => {
        const senderKind = t.sender?.track?.kind;
        const receiverKind = t.receiver?.track?.kind;
        return senderKind === kind || receiverKind === kind;
      });
      if (!hasKind) {
        pc.addTransceiver(kind, { direction: 'recvonly' });
      }
    }
  }

  async _createAndSendOffer(remoteOdId) {
    const pc = this._peers.get(remoteOdId);
    if (!pc) return;
    if (pc.signalingState !== 'stable') {
      this._debug('offer-skipped-unstable', { remoteOdId, signalingState: pc.signalingState });
      return;
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this._debug('offer-sent', { remoteOdId });

    const sent = wsService.send('WEBRTC_OFFER', {
      targetOdId: remoteOdId,
      offer: { type: offer.type, sdp: offer.sdp },
    });
    if (!sent) {
      this.disconnectFromPeer(remoteOdId);
      this._emit('error', {
        type: 'signal',
        code: 'signal_send_failed',
        error: new Error('Failed to send WEBRTC_OFFER'),
      });
    }
  }

  _debug(event, payload = {}) {
    if (!WEBRTC_DEBUG) return;
    try {
      console.debug('[webrtc]', event, payload);
    } catch {
      // no-op
    }
  }

  on(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this._handlers.get(event)?.delete(handler);
  }

  _emit(event, data) {
    const handlers = this._handlers.get(event);
    if (handlers) {
      for (const fn of handlers) {
        try { fn(data); } catch { /* handler error */ }
      }
    }
  }
}

export const webrtcService = new WebRTCService();
