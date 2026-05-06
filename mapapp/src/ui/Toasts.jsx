// Auto-expiring toast stack.
//
// Problem: pages like EditorPage/CharGenPage used to park transient status
// text into a bottom status bar forever, until the next call overwrote it.
// This moves them into a self-dismissing top-right stack.
//
// API:
//   Wrap the app in <ToastsProvider> once (done in App.jsx).
//   In any component:
//     const toasts = useToasts();
//     toasts.show('Saved.', { level: 'success' });
//     toasts.show(`Failed: ${err.message}`, { level: 'error' });
//     toasts.show('Working…', { level: 'info', ttl: 0 });  // sticky
//   Returns the id so you can dismiss manually: `toasts.dismiss(id)`.
//
// Levels: 'info' (default) | 'success' | 'error' | 'warning'.
// Default TTL: 5s for info/success/warning, 8s for error. `ttl: 0` → sticky
// until manually dismissed (x button).

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';

const ToastsContext = createContext(null);

let nextId = 1;

export function ToastsProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback((message, opts = {}) => {
    const id = nextId++;
    const level = opts.level || 'info';
    const defaultTtl = level === 'error' ? 8000 : 5000;
    const ttl = opts.ttl === undefined ? defaultTtl : opts.ttl;
    setToasts((prev) => {
      const next = [...prev, { id, message: String(message ?? ''), level }];
      return next.length > 6 ? next.slice(next.length - 6) : next;
    });
    if (ttl > 0) {
      const timer = setTimeout(() => dismiss(id), ttl);
      timersRef.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastsContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastsContext.Provider>
  );
}

export function useToasts() {
  const ctx = useContext(ToastsContext);
  if (!ctx) {
    if (typeof window !== 'undefined' && !window.__rpgonToastsWarned) {
      window.__rpgonToastsWarned = true;
      console.warn('useToasts() used outside <ToastsProvider>; messages will be dropped.');
    }
    return { show: () => 0, dismiss: () => {} };
  }
  return ctx;
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div
      className="fixed right-3 top-14 z-[1000] flex flex-col gap-2 max-w-[360px] pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const LEVEL_DOT = {
  info: 'bg-primary',
  success: 'bg-tertiary',
  warning: 'bg-tertiary-dim',
  error: 'bg-error',
};

const LEVEL_TEXT = {
  info: 'text-on-surface',
  success: 'text-tertiary',
  warning: 'text-tertiary-dim',
  error: 'text-error',
};

function ToastItem({ toast, onDismiss }) {
  const dot = LEVEL_DOT[toast.level] || LEVEL_DOT.info;
  const textClass = LEVEL_TEXT[toast.level] || LEVEL_TEXT.info;
  return (
    <div
      className={`glass-panel-elevated pointer-events-auto rounded-sm px-3 py-2 text-xs flex items-start gap-2 animate-toast-in ${textClass}`}
      role={toast.level === 'error' ? 'alert' : 'status'}
    >
      <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dot}`} />
      <div className="flex-1 leading-snug break-words text-on-surface">
        {toast.message}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="bg-transparent border-none p-0 text-base leading-none shrink-0 text-on-surface-variant/70 hover:text-on-surface cursor-pointer"
      >
        ×
      </button>
    </div>
  );
}
