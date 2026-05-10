import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import BootLog from './BootLog';
import SpinningDice from './SpinningDice';

const RETRY_DELAY_MS = 5000;

// Blocks all children (and all clicks) until the backend answers `GET /health`
// with 200. After the first failure, retries every 5s indefinitely via a
// post-settled setTimeout — no overlapping probes, no backoff, no max tries.
export default function BackendConnectivityGate({ children }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [status, setStatus] = useState('checking');
  const [attempt, setAttempt] = useState(0);
  const hasFailedOnceRef = useRef(false);

  const baseUrl = settings?.backendUrl ? settings.backendUrl.replace(/\/+$/, '') : '';

  useEffect(() => {
    if (status === 'ready') return undefined;

    const ctrl = new AbortController();
    let retryTimer = null;

    const scheduleRetry = () => {
      hasFailedOnceRef.current = true;
      retryTimer = setTimeout(() => setAttempt((n) => n + 1), RETRY_DELAY_MS);
    };

    (async () => {
      try {
        const res = await fetch(`${baseUrl}/health`, {
          method: 'GET',
          signal: ctrl.signal,
          cache: 'no-store',
          credentials: 'omit',
        });
        if (res.ok) {
          // Backend came back after being unreachable: hard-reload so anything
          // that errored out during startup (auth refresh, settings fetch,
          // lazy routes) re-initializes cleanly. The overlay stays visible
          // until the new page replaces us.
          if (hasFailedOnceRef.current) {
            window.location.reload();
            return;
          }
          setStatus('ready');
          return;
        }
        scheduleRetry();
      } catch (err) {
        if (err?.name === 'AbortError') return;
        scheduleRetry();
      }
    })();

    return () => {
      ctrl.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [status, attempt, baseUrl]);

  if (status === 'ready') return children;

  const spinnerLabel = hasFailedOnceRef.current
    ? t('connectivity.retrying')
    : t('connectivity.connecting');

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-surface-dim gap-6"
      role="alertdialog"
      aria-modal="true"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="rounded-2xl bg-[rgba(34,34,38,0.7)] backdrop-blur-xl border border-[rgba(197,154,255,0.15)] px-12 py-10 animate-pulse-subtle">
        <img
          src="/nikczemnu_logo.png"
          alt="Nikczemny Krzemuch"
          className="h-48 w-auto drop-shadow-[0_4px_24px_rgba(197,154,255,0.25)]"
        />
      </div>

      <div className="flex items-center gap-4">
        <SpinningDice size={64} />
        <p className="text-on-surface-variant text-xs uppercase tracking-widest font-label animate-shimmer">
          {spinnerLabel}
        </p>
      </div>

      <BootLog done={status === 'ready'} />
    </div>
  );
}
