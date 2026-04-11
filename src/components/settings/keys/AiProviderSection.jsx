import { useTranslation } from 'react-i18next';
import { AI_MODELS, RECOMMENDED_MODELS } from '../../../services/ai';

const PROVIDER_OPTIONS = [
  { id: 'openai', icon: 'auto_awesome' },
  { id: 'anthropic', icon: 'psychology' },
];

export default function AiProviderSection({ settings, updateSettings }) {
  const { t } = useTranslation();
  const providerLabels = {
    openai: t('settings.openaiLabel'),
    anthropic: t('settings.anthropicLabel'),
  };

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">auto_stories</span>
        {t('settings.aiProvider')}
      </h2>

      <div className="space-y-3 mb-8">
        {PROVIDER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => updateSettings({ aiProvider: opt.id })}
            className={`w-full p-4 rounded-sm border text-left flex items-center gap-3 transition-all ${
              settings.aiProvider === opt.id
                ? 'bg-surface-tint/10 border-primary/30 text-primary'
                : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
            }`}
          >
            <span className="material-symbols-outlined">{opt.icon}</span>
            <span className="font-headline text-sm">{providerLabels[opt.id]}</span>
            {settings.aiProvider === opt.id && (
              <span className="material-symbols-outlined text-primary ml-auto text-sm">check_circle</span>
            )}
          </button>
        ))}
      </div>

      <div>
        <h3 className="font-headline text-sm text-tertiary mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-dim text-base">speed</span>
          {t('settings.modelTier')}
        </h3>
        <p className="text-[10px] text-on-surface-variant mb-4">{t('settings.modelTierDesc')}</p>
        <div className="space-y-2">
          <button
            onClick={() => updateSettings({ aiModel: '', aiModelTier: 'premium' })}
            className={`w-full p-3 rounded-sm border text-left flex items-center gap-3 transition-all ${
              !settings.aiModel
                ? 'bg-surface-tint/10 border-primary/30 text-primary'
                : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
            }`}
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            <div className="flex-1">
              <span className="font-headline text-sm block">{t('settings.modelRecommended')}</span>
              <span className="text-[10px] font-label uppercase tracking-widest opacity-70">
                {AI_MODELS.find((m) => m.id === RECOMMENDED_MODELS[settings.aiProvider])?.label || RECOMMENDED_MODELS[settings.aiProvider]}
              </span>
            </div>
            {!settings.aiModel && (
              <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
            )}
          </button>

          <button
            onClick={() => {
              if (!settings.aiModel) {
                updateSettings({ aiModel: RECOMMENDED_MODELS[settings.aiProvider] });
              }
            }}
            className={`w-full p-3 rounded-sm border text-left flex items-center gap-3 transition-all ${
              settings.aiModel
                ? 'bg-surface-tint/10 border-primary/30 text-primary'
                : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
            }`}
          >
            <span className="material-symbols-outlined text-sm">tune</span>
            <div className="flex-1">
              <span className="font-headline text-sm block">{t('settings.modelCustom')}</span>
              <span className="text-[10px] font-label uppercase tracking-widest opacity-70">
                {t('settings.modelCustomDesc')}
              </span>
            </div>
            {!!settings.aiModel && (
              <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
            )}
          </button>

          {!!settings.aiModel && (
            <div className="ml-4 mt-1 space-y-1.5 border-l-2 border-primary/20 pl-3">
              {AI_MODELS.filter((m) => m.provider === settings.aiProvider).map((m) => (
                <button
                  key={m.id}
                  onClick={() => updateSettings({ aiModel: m.id })}
                  className={`w-full p-2.5 rounded-sm border text-left flex items-center gap-3 transition-all ${
                    settings.aiModel === m.id
                      ? 'bg-surface-tint/8 border-primary/25 text-primary'
                      : 'bg-surface-container-high/30 border-outline-variant/10 text-on-surface-variant hover:border-primary/15'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{m.tier === 'premium' ? 'diamond' : 'bolt'}</span>
                  <div className="flex-1">
                    <span className="font-headline text-xs block">{m.label}</span>
                    <span className="text-[9px] opacity-60 block">{m.cost}</span>
                  </div>
                  {settings.aiModel === m.id && (
                    <span className="material-symbols-outlined text-primary text-xs">check_circle</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
