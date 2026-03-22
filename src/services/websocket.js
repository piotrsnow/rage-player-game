class WebSocketService {
  constructor() {
    this._ws = null;
    this._handlers = new Map();
    this._reconnectTimer = null;
    this._url = null;
    this._token = null;
    this._intentionalClose = false;
  }

  get connected() {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  connect(baseUrl, token) {
    this.disconnect();
    this._intentionalClose = false;
    const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
    this._url = `${wsUrl}/multiplayer?token=${encodeURIComponent(token)}`;
    this._token = token;
    this._open();
  }

  _open() {
    try {
      this._ws = new WebSocket(this._url);

      this._ws.onopen = () => {
        this._emit('_connected', {});
      };

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._emit(msg.type, msg);
        } catch {
          // ignore malformed messages
        }
      };

      this._ws.onclose = () => {
        this._emit('_disconnected', {});
        if (!this._intentionalClose && this._url) {
          this._reconnectTimer = setTimeout(() => this._open(), 3000);
        }
      };

      this._ws.onerror = () => {
        // onclose will fire after onerror
      };
    } catch {
      // connection failed
    }
  }

  disconnect() {
    this._intentionalClose = true;
    clearTimeout(this._reconnectTimer);
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._url = null;
    this._token = null;
  }

  send(type, payload = {}) {
    if (!this.connected) return;
    this._ws.send(JSON.stringify({ type, ...payload }));
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
