import { wsService } from './websocket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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
    if (this._localStream) return this._localStream;
    try {
      this._localStream = await navigator.mediaDevices.getUserMedia({
        video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
        audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
      });
      this._emit('localStream', this._localStream);
      return this._localStream;
    } catch (err) {
      this._emit('error', { type: 'media', error: err });
      return null;
    }
  }

  stopLocalStream() {
    if (this._localStream) {
      this._localStream.getTracks().forEach((t) => t.stop());
      this._localStream = null;
      this._emit('localStream', null);
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
    if (this._peers.has(remoteOdId)) return;
    const pc = this._createPeerConnection(remoteOdId);

    if (this._localStream) {
      for (const track of this._localStream.getTracks()) {
        pc.addTrack(track, this._localStream);
      }
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    wsService.send('WEBRTC_OFFER', {
      targetOdId: remoteOdId,
      offer: { type: offer.type, sdp: offer.sdp },
    });
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
        wsService.send('WEBRTC_ICE', {
          targetOdId: remoteOdId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      this._emit('remoteStream', { odId: remoteOdId, stream });
    };

    pc.onconnectionstatechange = () => {
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
    if (this._peers.has(fromOdId)) {
      this._peers.get(fromOdId).close();
      this._peers.delete(fromOdId);
    }

    const pc = this._createPeerConnection(fromOdId);

    if (this._localStream) {
      for (const track of this._localStream.getTracks()) {
        pc.addTrack(track, this._localStream);
      }
    }

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

    wsService.send('WEBRTC_ANSWER', {
      targetOdId: fromOdId,
      answer: { type: answer.type, sdp: answer.sdp },
    });
  }

  async _handleAnswer(msg) {
    const { fromOdId, answer } = msg;
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
