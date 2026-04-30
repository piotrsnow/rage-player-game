import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import LoadingSpinner from './LoadingSpinner';

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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-surface-dim"
      role="alertdialog"
      aria-modal="true"
      aria-live="polite"
      aria-busy="true"
    >
      <LoadingSpinner size="lg" text={spinnerLabel} />
    </div>
  );
}
