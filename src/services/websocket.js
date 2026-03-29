import {
  createWsMessage,
  normalizeClientWsType,
  normalizeServerWsType,
  WS_CLIENT_TYPES,
  WS_SERVER_TYPES,
} from '../../shared/contracts/multiplayer.js';

const REJOIN_STORAGE_KEY = 'nikczemny_krzemuch_mp_rejoin';

class WebSocketService {
  constructor() {
    this._ws = null;
    this._handlers = new Map();
    this._reconnectTimer = null;
    this._heartbeatTimer = null;
    this._url = null;
    this._token = null;
    this._baseUrl = null;
    this._intentionalClose = false;
    this._readyPromise = null;
    this._readyResolve = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 10;
    this._roomCode = null;
    this._odId = null;
    this._loadRejoinInfo();
  }

  get connected() {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  _loadRejoinInfo() {
    try {
      const raw = localStorage.getItem(REJOIN_STORAGE_KEY);
      if (raw) {
        const info = JSON.parse(raw);
        if (info.roomCode && info.odId) {
          this._roomCode = info.roomCode;
          this._odId = info.odId;
        }
      }
    } catch { /* ignore */ }
  }

  _persistRejoinInfo() {
    try {
      if (this._roomCode && this._odId) {
        localStorage.setItem(REJOIN_STORAGE_KEY, JSON.stringify({
          roomCode: this._roomCode,
          odId: this._odId,
        }));
      }
    } catch { /* ignore */ }
  }

  static clearPersistedRejoinInfo() {
    try { localStorage.removeItem(REJOIN_STORAGE_KEY); } catch { /* ignore */ }
  }

  static getPersistedRejoinInfo() {
    try {
      const raw = localStorage.getItem(REJOIN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  connect(baseUrl, token) {
    this._intentionalClose = false;
    this._reconnectAttempts = 0;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    this._baseUrl = baseUrl;
    this._token = token;
    const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
    this._url = `${wsUrl}/multiplayer?token=${encodeURIComponent(token)}`;
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    return this._open();
  }

  _open() {
    this._readyPromise = new Promise((resolve) => {
      this._readyResolve = resolve;
    });

    try {
      this._ws = new WebSocket(this._url);

      this._ws.onopen = () => {
        this._reconnectAttempts = 0;
        this._startHeartbeat();
        this._emit('_reconnect_state', { status: 'connected', attempt: 0, delayMs: 0, maxAttempts: this._maxReconnectAttempts });
        this._emit('_connected', {});
        this._readyResolve?.();
      };

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const normalizedType = normalizeServerWsType(msg?.type) || msg?.type;
          if (normalizedType === WS_SERVER_TYPES.PONG) return;
          this._emit(normalizedType, { ...msg, type: normalizedType });
        } catch {
          // ignore malformed messages
        }
      };

      this._ws.onclose = () => {
        this._stopHeartbeat();
        this._emit('_disconnected', {});
        if (!this._intentionalClose && this._url) {
          this._scheduleReconnect();
        }
      };

      this._ws.onerror = () => {
        this._emit('_connect_error', {});
        this._readyResolve?.();
      };
    } catch {
      this._readyResolve?.();
    }

    return this._readyPromise;
  }

  _scheduleReconnect() {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      this._emit('_reconnect_exhausted', { maxAttempts: this._maxReconnectAttempts });
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000);
    this._reconnectAttempts++;
    this._emit('_reconnect_state', {
      status: 'reconnecting',
      attempt: this._reconnectAttempts,
      delayMs: delay,
      maxAttempts: this._maxReconnectAttempts,
    });
    this._reconnectTimer = setTimeout(() => {
      this._open().then(() => {
        if (this.connected && this._roomCode && this._odId) {
          this.send(WS_CLIENT_TYPES.REJOIN_ROOM, { roomCode: this._roomCode, odId: this._odId });
        }
      });
    }, delay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this._ws.send(JSON.stringify(createWsMessage(WS_CLIENT_TYPES.PING)));
      }
    }, 30000);
  }

  _stopHeartbeat() {
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
  }

  whenReady() {
    if (this.connected) return Promise.resolve();
    return this._readyPromise || Promise.resolve();
  }

  setRejoinInfo(roomCode, odId) {
    this._roomCode = roomCode;
    this._odId = odId;
    this._persistRejoinInfo();
  }

  disconnect() {
    this._intentionalClose = true;
    this._stopHeartbeat();
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    this._roomCode = null;
    this._odId = null;
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._url = null;
    this._token = null;
    this._baseUrl = null;
    this._readyResolve?.();
    this._readyPromise = null;
    this._readyResolve = null;
    this._emit('_reconnect_state', { status: 'disconnected', attempt: 0, delayMs: 0, maxAttempts: this._maxReconnectAttempts });
  }

  send(type, payload = {}) {
    if (!this.connected) {
      this._emit('_send_failed', { type, payload, reason: 'not_connected' });
      return false;
    }
    const normalizedType = normalizeClientWsType(type) || type;
    this._ws.send(JSON.stringify(createWsMessage(normalizedType, payload)));
    return true;
  }

  on(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, new Set());
    }
    this._handlers.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this._handlers.get(type)?.delete(handler);
  }

  _emit(type, data) {
    const handlers = this._handlers.get(type);
    if (handlers) {
      for (const fn of handlers) {
        try { fn(data); } catch { /* handler error */ }
      }
    }
  }
}

export const wsService = new WebSocketService();

export const clearPersistedRejoinInfo = WebSocketService.clearPersistedRejoinInfo;
export const getPersistedRejoinInfo = WebSocketService.getPersistedRejoinInfo;
