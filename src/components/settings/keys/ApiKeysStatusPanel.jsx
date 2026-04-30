import { useState } from 'react';
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

function StatusChip({ configured, masked, t }) {
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-primary font-label uppercase tracking-widest">
        <span className="material-symbols-outlined text-[14px]">cloud_done</span>
        {t('keys.statusAvailable', { masked })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-error/80 font-label uppercase tracking-widest">
      <span className="material-symbols-outlined text-[14px]">cloud_off</span>
      {t('keys.statusMissing')}
    </span>
  );
}

function TestButton({ providerId, disabled, t }) {
  const [state, setState] = useState({ status: 'idle', result: null });

  const run = async () => {
    setState({ status: 'loading', result: null });
    try {
      const result = await apiClient.post(`/ai/test-key/${providerId}`);
      setState({ status: 'done', result });
    } catch (err) {
      setState({
        status: 'done',
        result: { ok: false, error: err?.message || String(err) },
      });
    }
  };

  const result = state.result;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={disabled || state.status === 'loading'}
        className="text-[10px] font-label uppercase tracking-widest px-3 py-1 rounded-sm border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {state.status === 'loading' ? t('keys.testing') : t('keys.testConnection')}
      </button>
      {result?.ok && (
        <span className="text-[10px] text-primary/80 font-mono">
          {t('keys.testOk', { latency: result.latencyMs ?? '?' })}
        </span>
      )}
      {result && result.ok === false && (
        <span className="text-[10px] text-error/80 font-mono max-w-[240px] text-right truncate" title={result.error}>
          {t('keys.testFailed')}: {result.error || result.status}
        </span>
      )}
    </div>
  );
}

export default function ApiKeysStatusPanel({ backendKeys }) {
  const { t } = useTranslation();

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">vpn_key</span>
        {t('keys.apiKeys')}
      </h2>
      <p className="text-xs text-on-surface-variant mb-6 leading-relaxed">
        {t('keys.envHint')}
      </p>

      <div className="space-y-5">
        {PROVIDERS.map(({ id, labelKey, envVar, testable }) => {
          const entry = backendKeys?.[id];
          const configured = !!entry?.configured;
          return (
            <div key={id} className="flex items-start justify-between gap-4 border-b border-outline-variant/10 pb-4 last:border-b-0">
              <div className="min-w-0">
                <label className="block text-sm text-on-surface font-body">
                  {t(labelKey, { defaultValue: id })}
                </label>
                <p className="text-[10px] text-on-surface-variant/70 font-mono mt-1">{envVar}</p>
                <div className="mt-2">
                  <StatusChip configured={configured} masked={entry?.masked} t={t} />
                </div>
              </div>
              {testable && (
                <TestButton providerId={id} disabled={!configured} t={t} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
