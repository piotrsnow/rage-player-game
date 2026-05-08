import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const PROVIDER_OPTIONS = [
  { id: 'openai', icon: 'auto_awesome', envVar: 'OPENAI_API_KEY' },
  { id: 'anthropic', icon: 'psychology', envVar: 'ANTHROPIC_API_KEY' },
];

export default function AiProviderSection({ settings, updateSettings, backendKeys }) {
  const { t } = useTranslation();
  const providerLabels = {
    openai: t('settings.openaiLabel'),
    anthropic: t('settings.anthropicLabel'),
  };

  const provider = settings.aiProvider;
  const isProviderAvailable = (id) => !!backendKeys?.[id]?.configured;

  useEffect(() => {
    if (!backendKeys) return;
    if (provider && !isProviderAvailable(provider)) {
      const fallback = PROVIDER_OPTIONS.find((o) => isProviderAvailable(o.id));
      if (fallback && fallback.id !== provider) {
        updateSettings({ aiProvider: fallback.id });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendKeys, provider]);

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-6 rounded-sm border-t border-primary/20">
      <h2 className="font-headline text-base text-tertiary mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">auto_stories</span>
        {t('settings.aiProvider')}
      </h2>

      <div className="space-y-2">
        {PROVIDER_OPTIONS.map((opt) => {
          const available = isProviderAvailable(opt.id);
          const selected = provider === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!available}
              title={!available ? t('keys.providerUnavailable', { envVar: opt.envVar }) : undefined}
              onClick={() => available && updateSettings({ aiProvider: opt.id })}
              className={`w-full p-4 rounded-sm border text-left flex items-center gap-3 transition-all ${
                selected
                  ? 'bg-surface-tint/10 border-primary/30 text-primary'
                  : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
              } ${!available ? 'opacity-40 cursor-not-allowed hover:border-outline-variant/15' : ''}`}
            >
              <span className="material-symbols-outlined">{opt.icon}</span>
              <span className="font-headline text-sm">{providerLabels[opt.id]}</span>
              {!available && (
                <span className="ml-auto text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-error/30 text-error/80 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">lock</span>
                  {opt.envVar}
                </span>
              )}
              {available && selected && (
                <span className="material-symbols-outlined text-primary ml-auto text-sm">check_circle</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
