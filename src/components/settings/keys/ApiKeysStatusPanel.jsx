import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';

const PROVIDERS = [
  { id: 'openai', labelKey: 'settings.openaiApiKey', envVar: 'OPENAI_API_KEY', testable: true },
  { id: 'anthropic', labelKey: 'settings.anthropicApiKey', envVar: 'ANTHROPIC_API_KEY', testable: true },
  { id: 'gemini', labelKey: 'settings.geminiApiKey', envVar: 'GEMINI_API_KEY', testable: false },
  { id: 'stability', labelKey: 'settings.stabilityApiKey', envVar: 'STABILITY_API_KEY', testable: false },
  { id: 'elevenlabs', labelKey: 'keys.elevenlabsKey', envVar: 'ELEVENLABS_API_KEY', testable: false },
  { id: 'meshy', labelKey: 'keys.meshyKey', envVar: 'MESHY_API_KEY', testable: false },
];

function LoadingDots() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x % 3) + 1), 350);
    return () => clearInterval(id);
  }, []);
  return <span>{'.'.repeat(n)}</span>;
}

function ProviderLine({ provider, entry, t }) {
  const { id, labelKey, envVar, testable } = provider;
  const configured = !!entry?.configured;
  const [state, setState] = useState({ status: 'idle', result: null });

  const run = async () => {
    setState({ status: 'loading', result: null });
    try {
      const result = await apiClient.post(`/ai/test-key/${id}`);
      setState({ status: 'done', result });
    } catch (err) {
      setState({ status: 'done', result: { ok: false, error: err?.message || String(err) } });
    }
  };

  const statusText = configured
    ? `[OK] ${t('keys.statusAvailable', { masked: entry?.masked })}`
    : `[--] ${t('keys.statusMissing')}`;
  const statusColor = configured ? 'text-primary/90' : 'text-error/70';

  return (
    <div className="font-mono text-[12px] leading-relaxed">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-on-surface-variant/50">$</span>
        <span className="text-on-surface">{t(labelKey, { defaultValue: id })}</span>
        <span className="text-on-surface-variant/40">—</span>
        <span className="text-tertiary/80">{envVar}</span>
      </div>
      <div className="pl-3 flex flex-wrap items-baseline gap-x-3">
        <span className={statusColor}>{statusText}</span>
        {testable && configured && state.status === 'idle' && (
          <button
            type="button"
            onClick={run}
            className="text-primary/80 hover:text-primary underline underline-offset-2 decoration-dotted"
          >
            [{t('keys.testConnection').toLowerCase()}]
          </button>
        )}
        {testable && configured && state.status === 'loading' && (
          <span className="text-tertiary/80">
            {t('keys.testing').replace(/\.+$/, '')}<LoadingDots />
          </span>
        )}
        {testable && state.status === 'done' && state.result?.ok && (
          <>
            <span className="text-primary">
              &gt; {t('keys.testOk', { latency: state.result.latencyMs ?? '?' })}
            </span>
            <button
              type="button"
              onClick={run}
              className="text-on-surface-variant/60 hover:text-primary underline underline-offset-2 decoration-dotted"
            >
              [retry]
            </button>
          </>
        )}
        {testable && state.status === 'done' && state.result && state.result.ok === false && (
          <>
            <span className="text-error/80 truncate max-w-full" title={state.result.error}>
              &gt; {t('keys.testFailed')}: {state.result.error || state.result.status}
            </span>
            <button
              type="button"
              onClick={run}
              className="text-on-surface-variant/60 hover:text-primary underline underline-offset-2 decoration-dotted"
            >
              [retry]
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ApiKeysStatusPanel({ backendKeys }) {
  const { t } = useTranslation();

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-6 rounded-sm border-l border-primary/20">
      <h2 className="font-mono text-sm text-tertiary mb-1 flex items-center gap-2">
        <span className="text-primary-dim">~/</span>
        {t('keys.apiKeys').toLowerCase()}
      </h2>
      <p className="font-mono text-[11px] text-on-surface-variant/70 mb-5 leading-relaxed">
        # {t('keys.envHint')}
      </p>

      <div className="space-y-3">
        {PROVIDERS.map((provider) => (
          <ProviderLine
            key={provider.id}
            provider={provider}
            entry={backendKeys?.[provider.id]}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
