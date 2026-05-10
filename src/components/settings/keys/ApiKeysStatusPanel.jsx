import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';

const SECTIONS = [
  {
    titleKey: 'keys.sectionLanguage',
    icon: 'psychology',
    providers: [
      { id: 'openai', labelKey: 'settings.openaiApiKey', envVar: 'OPENAI_API_KEY', testable: true },
      { id: 'anthropic', labelKey: 'settings.anthropicApiKey', envVar: 'ANTHROPIC_API_KEY', testable: true },
      { id: 'gemini', labelKey: 'settings.geminiApiKey', envVar: 'GEMINI_API_KEY', testable: false },
    ],
  },
  {
    titleKey: 'keys.sectionImage',
    icon: 'image',
    providers: [
      { id: 'stability', labelKey: 'settings.stabilityApiKey', envVar: 'STABILITY_API_KEY', testable: false },
      { id: 'sd-webui', labelKey: 'settings.sdWebuiKey', envVar: 'SD_WEBUI_URL', testable: false },
      { id: 'pixellab', labelKey: 'keys.pixellabKey', envVar: 'PIXELLAB_API_KEY', testable: false },
      { id: 'meshy', labelKey: 'keys.meshyKey', envVar: 'MESHY_API_KEY', testable: false },
    ],
  },
  {
    titleKey: 'keys.sectionAudio',
    icon: 'graphic_eq',
    providers: [
      { id: 'elevenlabs', labelKey: 'keys.elevenlabsKey', envVar: 'ELEVENLABS_API_KEY', testable: false },
      { id: 'xtts', labelKey: 'keys.xttsKey', envVar: 'XTTS_URL', testable: false },
    ],
  },
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
    <div className="font-mono text-sm leading-relaxed">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-on-surface-variant/50">$</span>
        <span className="text-on-surface">{t(labelKey, { defaultValue: id })}</span>
        <span className="text-on-surface-variant/40">&mdash;</span>
        <span className="text-tertiary/80">{envVar}</span>
      </div>
      <div className="pl-4 flex flex-wrap items-baseline gap-x-3">
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
      <p className="font-mono text-xs text-on-surface-variant/70 mb-6 leading-relaxed">
        # {t('keys.envHint')}
      </p>

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <div key={section.titleKey}>
            <div className="flex items-center gap-2 mb-3 pb-1.5 border-b border-outline-variant/10">
              <span className="material-symbols-outlined text-base text-tertiary/70">{section.icon}</span>
              <h3 className="font-mono text-xs font-medium text-tertiary/90 uppercase tracking-wider">
                {t(section.titleKey)}
              </h3>
            </div>
            <div className="space-y-2.5 pl-1">
              {section.providers.map((provider) => (
                <ProviderLine
                  key={provider.id}
                  provider={provider}
                  entry={backendKeys?.[provider.id]}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
