// App-wide error boundary.
//
// Problem: anywhere in mapapp — Pixi init failure, a thrown render from a
// corrupted MapDoc, a rejected manifest fetch surfaced via render, a bad
// rAF handler — used to unmount the whole React tree and leave a blank
// screen. This is the recovery shell.
//
// Behaviour:
//   Catches render / lifecycle errors below it via `componentDidCatch`.
//   Shows a minimal dark fallback with the error message + a "Reload"
//   button (full `location.reload()`). Also offers a "Try again" that
//   just clears the boundary state — useful if the error was transient
//   (e.g. a stale texture) and the user doesn't want to lose in-memory
//   edits.
//
// Async errors (Promise rejections inside `useEffect`, setTimeout, rAF,
// event handlers) do NOT propagate into error boundaries by React
// design. Those still need per-call try/catch + toasts. This boundary
// is specifically the last-ditch net for render-path crashes.

import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null, info: null });
  };

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const msg = error && (error.message || String(error));
    const stack = [msg, info?.componentStack].filter(Boolean).join('\n\n');

    return (
      <div className="min-h-full flex items-center justify-center p-6 bg-surface-dim text-on-surface font-body">
        <div
          className="glass-panel-elevated max-w-[640px] w-full rounded-xl p-5 border border-error/20"
          role="alert"
        >
          <h2 className="m-0 mb-2 text-lg font-bold text-error">Something broke.</h2>
          <p className="m-0 mb-3 text-sm leading-relaxed text-on-surface-variant">
            The app hit an unexpected error. You can try to recover in place
            (unsaved in-memory state is preserved) or do a full reload.
          </p>
          {stack ? (
            <pre className="m-0 mb-4 p-2.5 bg-surface-container-lowest/80 border border-outline-variant/20 rounded-sm text-xs text-tertiary whitespace-pre-wrap break-words max-h-[220px] overflow-auto custom-scrollbar">
              {stack}
            </pre>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-sm bg-gradient-to-tr from-primary-dim to-primary text-on-primary text-sm font-bold shadow-[0_0_18px_rgba(197,154,255,0.35)] hover:brightness-110 transition"
              onClick={this.handleReset}
            >
              Try again
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-sm border border-outline-variant/30 bg-surface-container/70 text-on-surface text-sm hover:border-primary/40 hover:bg-surface-container-high/70 transition"
              onClick={this.handleReload}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
